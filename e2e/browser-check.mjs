// End-to-end browser checks for TowerGuard, with no test dependencies: drives a
// headless Edge or Chrome over the Chrome DevTools Protocol using Node's
// built-in WebSocket (Node 22+).
//
// Usage: start the app (`npm run dev` or `npm start`), then
//   npm run test:e2e -- [baseUrl]        (default http://localhost:3000)
// Set BROWSER_PATH to use a specific Chromium-based browser.
// Screenshots and results.json are written to e2e/output/ (git-ignored).

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const e2eDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(e2eDir, "output");
const fixture = (name) => join(e2eDir, "fixtures", name);
const DEBUG_PORT = 9333;

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error("No Edge/Chrome found. Set BROWSER_PATH to a Chromium-based browser.");
  return found;
}

mkdirSync(outDir, { recursive: true });
const profileDir = mkdtempSync(join(tmpdir(), "towerguard-e2e-"));
const browser = spawn(
  findBrowser(),
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--window-size=1366,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const results = [];
const consoleIssues = [];
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function getPageWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Browser still starting.
    }
    await delay(250);
  }
  throw new Error("Browser DevTools endpoint did not come up");
}

const ws = new WebSocket(await getPageWsUrl());
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 1;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
  } else if (data.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(data.params.type)) {
    const text = data.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    consoleIssues.push(`${data.params.type}: ${text.slice(0, 300)}`);
  } else if (data.method === "Runtime.exceptionThrown") {
    const details = data.params.exceptionDetails;
    consoleIssues.push(`exception: ${(details.exception?.description ?? details.text).slice(0, 300)}`);
  }
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? "evaluate failed");
  return res.result.value;
}

async function waitFor(expression, label, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      // Page mid-navigation; retry.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

const bodyHas = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;

async function navigate(path) {
  await send("Page.navigate", { url: baseUrl + path });
  await waitFor(`document.readyState === "complete"`, `load ${path}`);
}

async function reload() {
  await send("Page.reload", { ignoreCache: true });
  await delay(100);
  await waitFor(`document.readyState === "complete"`, "reload");
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, "base64"));
}

const clickByText = (tag, text) =>
  `(() => { const el = [...document.querySelectorAll(${JSON.stringify(tag)})].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`;

/** Runs `body` (JS using a `store` variable and setting `result`) against an IndexedDB store in the page. */
const withStore = (storeName, mode, body) => `new Promise((resolve, reject) => {
  const open = indexedDB.open("towerguard");
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction(${JSON.stringify(storeName)}, ${JSON.stringify(mode)});
    const store = tx.objectStore(${JSON.stringify(storeName)});
    let result;
    ${body}
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => reject(tx.error);
  };
})`;
const withInspectionStore = (mode, body) => withStore("inspections", mode, body);
const readInspectionStore = withInspectionStore(
  "readonly",
  `const req = store.getAll(); req.onsuccess = () => { result = req.result; };`,
);
const countInspectionStore = `${readInspectionStore}.then(r => r.length)`;

const SITE = {
  siteId: "TWR-BROWSER-01",
  siteName: "Browser Check Relay",
  structureType: "guyed",
  inspectorName: "Test Inspector",
  location: "Ridge Road, Sector 4",
  weather: "Overcast, light wind",
  notes: "Gate locked; access via north path.",
};

async function inspectionLifecycle() {
  await navigate("/");
  await waitFor(bodyHas("No inspections yet"), "empty state");
  record("Dashboard loads with empty state (fresh browser profile)", true);
  await screenshot("01-dashboard-empty");

  // Validation errors on empty submit.
  await navigate("/inspections/new");
  await waitFor(`!!document.querySelector("#inspection-siteId")`, "form");
  await evaluate(clickByText("button", "Create inspection"));
  await waitFor(bodyHas("Site ID is required."), "inline validation");
  const required = [
    "Site ID is required.",
    "Site name is required.",
    "Select a structure type.",
    "Inspector name is required.",
    "Inspection date is required.",
  ];
  const shown = await evaluate(`${JSON.stringify(required)}.filter(t => document.body.innerText.includes(t)).length`);
  const focusedId = await evaluate(`document.activeElement?.id`);
  record("Empty submit shows inline errors for all 5 required fields", shown === 5, `${shown}/5 shown`);
  record("First invalid field receives focus", focusedId === "inspection-siteId", `focused #${focusedId}`);
  record("Invalid submit writes nothing to IndexedDB", (await evaluate(countInspectionStore)) === 0);
  await screenshot("02-form-validation-errors");

  // Fill and submit (native setter + events so React sees the change).
  await evaluate(`window.__setValue = (selector, value) => {
    const el = document.querySelector(selector);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }`);
  for (const [field, value] of Object.entries(SITE)) {
    await evaluate(`window.__setValue("#inspection-${field}", ${JSON.stringify(value)})`);
  }
  await evaluate(clickByText("button", "Use today"));
  const today = await evaluate(`document.querySelector("#inspection-inspectionDate").value`);
  await waitFor(`!document.body.innerText.includes("Site ID is required.")`, "errors cleared");
  record("Errors clear as fields are corrected; 'Use today' fills the date", /^\d{4}-\d{2}-\d{2}$/.test(today), `date=${today}`);

  await evaluate(clickByText("button", "Create inspection"));
  await waitFor(`/^\\/inspections\\/[0-9a-f-]{36}$/.test(location.pathname)`, "redirect to overview");
  const id = await evaluate(`location.pathname.split("/").pop()`);
  record("Valid submit redirects to the inspection overview", true, `/inspections/${id}`);

  const [stored] = await evaluate(readInspectionStore);
  const storedOk =
    stored?.id === id && stored.siteId === SITE.siteId && stored.siteName === SITE.siteName &&
    stored.structureType === "guyed" && stored.inspectionDate === today && stored.status === "draft" &&
    stored.location === SITE.location && stored.weather === SITE.weather && stored.notes === SITE.notes &&
    stored.createdAt === stored.updatedAt;
  record("Record saved to IndexedDB with correct fields and status 'draft'", storedOk, JSON.stringify(stored));

  await waitFor(bodyHas(SITE.notes), "overview details");
  const expected = [SITE.siteId, SITE.siteName, "Guyed mast", SITE.inspectorName, SITE.location, SITE.weather, SITE.notes, "Draft", id];
  const missing = await evaluate(`${JSON.stringify(expected)}.filter(t => !document.body.innerText.includes(t))`);
  record("Overview displays all entered details", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "");
  await screenshot("03-overview");

  await navigate("/");
  await reload();
  await waitFor(bodyHas(SITE.siteName), "inspection in list");
  record("Inspection appears on dashboard after page refresh", true);
  await screenshot("04-dashboard-with-inspection");

  await evaluate(`document.querySelector('a[href="/inspections/${id}"]').click()`);
  await waitFor(`location.pathname === "/inspections/${id}" && ${bodyHas(SITE.notes)}`, "open from list");
  record("Opening the inspection from the dashboard shows its details", true);

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(400);
  record("No horizontal overflow at 390px width (overview)", !(await evaluate(`document.documentElement.scrollWidth > window.innerWidth`)));
  await screenshot("05-overview-mobile");
  await send("Emulation.clearDeviceMetricsOverride");
  await delay(300);

  await evaluate(clickByText("button", "Delete"));
  await waitFor(`document.querySelector("dialog")?.open === true`, "dialog open");
  await screenshot("06-delete-dialog");
  await evaluate(clickByText("button", "Cancel"));
  await waitFor(`document.querySelector("dialog")?.open === false`, "dialog closed");
  record("Cancelling the delete dialog keeps the inspection", (await evaluate(countInspectionStore)) === 1);

  await evaluate(clickByText("button", "Delete"));
  await waitFor(`document.querySelector("dialog")?.open === true`, "dialog reopen");
  await evaluate(clickByText("button", "Delete inspection"));
  await waitFor(`location.pathname === "/" && ${bodyHas("No inspections yet")}`, "back to empty dashboard");
  const left = await evaluate(countInspectionStore);
  record("Delete removes it from the dashboard and IndexedDB", left === 0, `${left} records left`);

  await navigate(`/inspections/${id}`);
  await waitFor(bodyHas("Inspection not found"), "not found state");
  record("Deleted inspection URL shows 'Inspection not found'", true);
}

async function damagedRecords() {
  const now = new Date().toISOString();
  const valid = {
    id: "e2e-valid", siteId: "TWR-VALID-01", siteName: "Valid Record Mast", structureType: "monopole",
    inspectorName: "Test Inspector", inspectionDate: "2026-01-15", status: "draft", createdAt: now, updatedAt: now,
  };
  const damaged = [
    { id: "e2e-damaged-1" },
    { ...valid, id: "e2e-damaged-2", siteName: 42, status: "approved" },
  ];

  // The dashboard has already created the schema; seed records directly.
  await navigate("/");
  await waitFor(bodyHas("No inspections yet"), "dashboard ready");
  await evaluate(
    withInspectionStore("readwrite", `for (const r of ${JSON.stringify([valid, ...damaged])}) store.put(r);`),
  );
  const before = JSON.stringify(await evaluate(readInspectionStore));

  await reload();
  await waitFor(bodyHas("2 inspection records could not be displayed"), "damaged-records warning");
  record("Warning appears with the exact damaged-record count", true);
  record("Valid record stays visible alongside the warning", await evaluate(bodyHas(valid.siteName)));
  record("Misleading 'No inspections yet' is not shown", !(await evaluate(bodyHas("No inspections yet"))));

  const stat = await evaluate(
    `document.querySelector("section[aria-label=Summary] > div")?.innerText.replace(/\\s+/g, " ")`,
  );
  record("Inspections stat counts valid records and notes the hidden ones", /Inspections 1 \+2 not displayed/.test(stat), stat);

  const ids = await evaluate(`[...document.querySelectorAll("details li")].map(li => li.textContent)`);
  record("Warning lists the damaged record IDs", JSON.stringify(ids) === JSON.stringify(["e2e-damaged-1", "e2e-damaged-2"]), JSON.stringify(ids));
  await evaluate(`document.querySelector("details").open = true`);
  await screenshot("07-damaged-records-warning");

  await evaluate(clickByText("button", "Try again"));
  await waitFor(`${bodyHas("2 inspection records could not be displayed")} && ${bodyHas(valid.siteName)}`, "after retry");
  record("Try again reloads and still shows the warning and the valid record", true);

  const after = JSON.stringify(await evaluate(readInspectionStore));
  record("Damaged records are not modified or deleted by loading or retrying", after === before);

  // Only damaged records left: the empty state must not claim there are none.
  await evaluate(withInspectionStore("readwrite", `store.delete(${JSON.stringify(valid.id)});`));
  await reload();
  await waitFor(bodyHas("No inspections can be displayed"), "all-damaged empty state");
  record(
    "With only damaged records, the list says none can be displayed (not 'No inspections yet')",
    (await evaluate(bodyHas("2 inspection records could not be displayed"))) &&
      !(await evaluate(bodyHas("No inspections yet"))),
  );
  await screenshot("08-only-damaged-records");
}

/** Uses the real file-input path (as if the user chose files in the picker). */
async function setInputFiles(selector, paths) {
  const { root } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`No element for ${selector}`);
  await send("DOM.setFileInputFiles", { files: paths, nodeId });
}

const sha256OfFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Photo metadata and, for each photo, facts about the stored blobs (hashed in the browser). */
const readPhotoState = `Promise.all([
  ${withStore("photos", "readonly", `const r = store.getAll(); r.onsuccess = () => { result = r.result; };`)},
  ${withStore("photoBlobs", "readonly", `const r = store.getAll(); r.onsuccess = () => { result = r.result; };`)},
]).then(async ([photos, blobs]) => {
  const hex = async (blob) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const images = {};
  for (const b of blobs) {
    const thumb = await createImageBitmap(b.thumbnail);
    images[b.photoId] = { originalSha: await hex(b.original), originalSize: b.original.size, originalType: b.original.type,
      thumbnailType: b.thumbnail.type, thumbnailWidth: thumb.width, thumbnailHeight: thumb.height };
    thumb.close();
  }
  return { photos, images };
})`;

const uploadsSettled = (count) =>
  `(() => { const items = [...document.querySelectorAll("[data-upload-status]")];
    return items.length === ${count} && items.every((li) => ["saved", "rejected", "failed"].includes(li.dataset.uploadStatus)); })()`;
const galleryCount = `document.querySelectorAll('ul[aria-label="Photographs"] > li').length`;
const galleryImagesLoaded = (count) =>
  `(() => { const imgs = [...document.querySelectorAll('ul[aria-label="Photographs"] img')];
    return imgs.length === ${count} && imgs.every((img) => img.complete && img.naturalWidth > 0); })()`;

async function photoEvidence() {
  const inspectionId = "e2e-photos";
  const now = new Date().toISOString();
  const inspection = {
    id: inspectionId, siteId: "TWR-PHOTO-01", siteName: "Photo Evidence Mast", structureType: "lattice",
    inspectorName: "Test Inspector", inspectionDate: "2026-01-20", status: "draft", createdAt: now, updatedAt: now,
  };
  const jpg = fixture("tower-north-face.jpg");
  const png = fixture("tower-leg-b.png");
  const webp = fixture("tower-antenna-mount.webp");
  const oversized = join(profileDir, "..", `towerguard-e2e-oversized-${process.pid}.jpg`);
  const big = Buffer.alloc(21 * 1024 * 1024);
  big.set([0xff, 0xd8, 0xff, 0xe0]);
  writeFileSync(oversized, big);

  try {
    // 1. Open an existing inspection.
    await navigate("/");
    await waitFor(`document.readyState === "complete"`, "dashboard");
    await evaluate(withInspectionStore("readwrite", `store.put(${JSON.stringify(inspection)});`));
    await navigate(`/inspections/${inspectionId}`);
    await waitFor(`${bodyHas("No photographs yet")} && ${bodyHas("0 photographs")}`, "empty gallery");
    record("Existing inspection shows an empty photo gallery with count 0", true);

    // 2–3. Upload one valid image; it appears in the gallery.
    await setInputFiles('input[type="file"]', [jpg]);
    await waitFor(`${uploadsSettled(1)} && ${galleryImagesLoaded(1)}`, "first upload");
    const firstStatus = await evaluate(`document.querySelector("[data-upload-status]").dataset.uploadStatus`);
    record(
      "Valid JPEG uploads and its thumbnail appears with file name and dimensions",
      firstStatus === "saved" && (await evaluate(bodyHas("1 photograph"))) &&
        (await evaluate(bodyHas("tower-north-face.jpg"))) && (await evaluate(bodyHas("2400 × 1600 px"))),
    );

    let state = await evaluate(readPhotoState);
    const meta = state.photos[0];
    const img = state.images[meta?.id];
    const expectedSha = sha256OfFile(jpg);
    record(
      "Metadata records name, type, size, dimensions, SHA-256 and timestamps",
      state.photos.length === 1 && meta.fileName === "tower-north-face.jpg" && meta.mimeType === "image/jpeg" &&
        meta.sizeBytes === statSync(jpg).size && meta.width === 2400 && meta.height === 1600 &&
        meta.sha256 === expectedSha && meta.uploadedAt === meta.updatedAt && meta.inspectionId === inspectionId &&
        !("capturedAt" in meta) && !("gps" in meta),
      JSON.stringify(meta),
    );
    record(
      "Stored original is byte-identical to the file on disk (SHA-256 recomputed in the browser)",
      img?.originalSha === expectedSha && img.originalSize === statSync(jpg).size && img.originalType === "image/jpeg",
      `disk ${expectedSha.slice(0, 16)}… stored ${img?.originalSha?.slice(0, 16)}…`,
    );
    record(
      "Thumbnail is a separate downscaled JPEG (max edge 480 px)",
      img?.thumbnailType === "image/jpeg" && img.thumbnailWidth === 480 && img.thumbnailHeight === 320,
      `${img?.thumbnailWidth}×${img?.thumbnailHeight}`,
    );
    record(
      "Inspection page shows browser storage usage and quota",
      (await evaluate(bodyHas("used"))) && (await evaluate(bodyHas("available"))),
    );
    await screenshot("09-gallery-one-photo");

    // 4. Refresh: persists.
    await reload();
    await waitFor(galleryImagesLoaded(1), "gallery after refresh");
    record("Photo persists after page refresh", true);

    // 5. Open the photograph.
    await evaluate(`document.querySelector('a[data-photo-id="${meta.id}"]').click()`);
    await waitFor(
      `location.pathname === "/inspections/${inspectionId}/photos/${meta.id}" && document.querySelector("figure img")?.naturalWidth === 2400`,
      "photo viewer",
    );
    record(
      "Photo viewer shows the full-resolution original and its SHA-256",
      (await evaluate(`document.querySelector('[data-testid="photo-sha256"]').textContent`)) === expectedSha,
    );
    await evaluate(clickByText("button", "Verify integrity"));
    await waitFor(bodyHas("matches the SHA-256 recorded at upload"), "integrity check");
    record("Integrity check confirms the stored original matches the recorded hash", true);

    // 6–7. Edit caption and viewpoint; changes persist.
    await evaluate(`window.__setValue = (selector, value) => {
      const el = document.querySelector(selector);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }`);
    const caption = "Surface rust visible near mid-section bracing";
    const viewpoint = "North face, upper section";
    await evaluate(`window.__setValue("#photo-caption", ${JSON.stringify(caption)})`);
    await evaluate(`window.__setValue("#photo-viewpoint", ${JSON.stringify(viewpoint)})`);
    await evaluate(clickByText("button", "Save details"));
    await waitFor(`${bodyHas("Saved")} && document.querySelector("h1")?.textContent === ${JSON.stringify(caption)}`, "details saved");
    await screenshot("10-photo-viewer");
    await reload();
    await waitFor(`document.querySelector("#photo-caption")?.value === ${JSON.stringify(caption)}`, "caption after reload");
    state = await evaluate(readPhotoState);
    const edited = state.photos.find((p) => p.id === meta.id);
    record(
      "Caption and viewpoint persist after refresh; hash and image unchanged",
      (await evaluate(`document.querySelector("#photo-viewpoint").value`)) === viewpoint &&
        edited.caption === caption && edited.viewpoint === viewpoint && edited.sha256 === expectedSha &&
        edited.updatedAt > edited.uploadedAt && state.images[meta.id].originalSha === expectedSha,
    );

    // 8–10. Multiple files: valid ones upload; invalid ones are reported, not dropped.
    await navigate(`/inspections/${inspectionId}`);
    await waitFor(galleryImagesLoaded(1), "gallery");
    await setInputFiles('input[type="file"]', [png, webp, fixture("unsupported.gif"), fixture("corrupt.jpg"), oversized, jpg]);
    await waitFor(`${uploadsSettled(6)} && ${galleryImagesLoaded(3)}`, "batch upload", 60000);
    const outcomes = Object.fromEntries(
      await evaluate(`[...document.querySelectorAll("[data-upload-status]")].map((li) => [li.querySelector("p").textContent.split(" (")[0], li.dataset.uploadStatus + " | " + li.innerText])`),
    );
    const outcome = (name) => outcomes[name] ?? "";
    record("Batch: PNG and WebP upload alongside rejected files", outcome("tower-leg-b.png").startsWith("saved") && outcome("tower-antenna-mount.webp").startsWith("saved"));
    record("Unsupported GIF is rejected with a clear message", outcome("unsupported.gif").startsWith("rejected") && outcome("unsupported.gif").includes("not a supported image"));
    record("File over 20 MB is rejected with its size and the limit", outcome(oversized.split(/[\\/]/).pop()).startsWith("rejected") && /maximum is 20 MB/.test(outcome(oversized.split(/[\\/]/).pop())));
    record("Corrupt image (valid signature) is rejected as unreadable", outcome("corrupt.jpg").startsWith("rejected") && outcome("corrupt.jpg").includes("could not be read as an image"));
    record("Re-uploading the same file is refused, not duplicated or replaced", outcome("tower-north-face.jpg").startsWith("rejected") && outcome("tower-north-face.jpg").includes("already attached"));
    record("Summary reports 2 of 6 uploaded and the gallery shows 3 photographs", (await evaluate(bodyHas("2 of 6 uploaded · 4 not uploaded"))) && (await evaluate(galleryCount)) === 3 && (await evaluate(bodyHas("3 photographs"))));
    await screenshot("11-batch-upload-results");

    // Drag and drop (synthetic DOM drop event carrying a real browser-encoded PNG).
    await evaluate(`(async () => {
      const c = document.createElement("canvas"); c.width = 640; c.height = 480;
      const x = c.getContext("2d"); x.fillStyle = "#334155"; x.fillRect(0, 0, 640, 480);
      x.fillStyle = "#fbbf24"; x.font = "28px sans-serif"; x.fillText("Dropped test image (synthetic)", 40, 240);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const dt = new DataTransfer(); dt.items.add(new File([blob], "dropped-test.png", { type: "image/png" }));
      const zone = document.querySelector('[aria-label="Photo drop zone"]');
      for (const type of ["dragenter", "dragover", "drop"]) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    })()`);
    await waitFor(`${uploadsSettled(1)} && ${galleryImagesLoaded(4)}`, "dropped upload");
    record("Drag-and-drop upload works (synthetic drop event)", (await evaluate(`document.querySelector("[data-upload-status]").dataset.uploadStatus`)) === "saved");

    // 11–13. Delete one photo after confirmation; its metadata and blob go, others are untouched.
    const before = await evaluate(readPhotoState);
    const target = before.photos.find((p) => p.fileName === "tower-antenna-mount.webp");
    const others = before.photos.filter((p) => p.id !== target.id);
    await evaluate(`document.querySelector('a[data-photo-id="${target.id}"]').click()`);
    await waitFor(`document.querySelector("figure img")?.naturalWidth === 1200`, "webp viewer");
    await evaluate(clickByText("button", "Delete"));
    await waitFor(`document.querySelector("dialog")?.open === true`, "delete dialog");
    await screenshot("12-delete-photo-dialog");
    await evaluate(clickByText("button", "Cancel"));
    await waitFor(`document.querySelector("dialog")?.open === false`, "dialog closed");
    record("Cancelling the delete dialog keeps the photograph", (await evaluate(readPhotoState)).photos.length === 4);
    await evaluate(clickByText("button", "Delete"));
    await waitFor(`document.querySelector("dialog")?.open === true`, "delete dialog again");
    await evaluate(clickByText("button", "Delete photograph"));
    await waitFor(`location.pathname === "/inspections/${inspectionId}" && ${galleryImagesLoaded(3)}`, "back to gallery");

    const after = await evaluate(readPhotoState);
    record(
      "Deleted photo's metadata and image data are both removed",
      !after.photos.some((p) => p.id === target.id) && !(target.id in after.images) && (await evaluate(bodyHas("3 photographs"))),
    );
    record(
      "Other photographs' metadata and stored originals are unchanged",
      others.every((p) => JSON.stringify(after.photos.find((q) => q.id === p.id)) === JSON.stringify(p) &&
        after.images[p.id]?.originalSha === before.images[p.id].originalSha),
    );

    // 14. Mobile layout.
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(400);
    const galleryOverflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
    await screenshot("13-gallery-mobile");
    await evaluate(`document.querySelector('ul[aria-label="Photographs"] a').click()`);
    await waitFor(`document.querySelector("figure img")?.complete === true`, "viewer on mobile");
    await delay(300);
    const viewerOverflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
    await screenshot("14-viewer-mobile");
    await send("Emulation.clearDeviceMetricsOverride");
    record("No horizontal overflow at 390px (gallery and photo viewer)", !galleryOverflow && !viewerOverflow, `gallery=${galleryOverflow} viewer=${viewerOverflow}`);
  } finally {
    rmSync(oversized, { force: true });
  }
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await inspectionLifecycle();
  await damagedRecords();
  await photoEvidence();
} catch (error) {
  record("Browser run aborted", false, error.message);
  try {
    await screenshot("99-failure");
  } catch {
    // Page unavailable.
  }
} finally {
  console.log(`\nConsole errors/warnings captured: ${consoleIssues.length}`);
  for (const issue of consoleIssues) console.log(`  ${issue}`);
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ baseUrl, results, consoleIssues }, null, 2));
  ws.close();
  browser.kill();
  await delay(500);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}
