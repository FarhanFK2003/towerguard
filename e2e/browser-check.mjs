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
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evaluate(expression)) return;
      lastError = "";
    } catch (error) {
      lastError = error.message; // page mid-navigation, or a broken expression; retry
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${label}${lastError ? ` (last error: ${lastError.split("\n")[0]})` : ""}`);
}

const bodyHas = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;

/**
 * Visible matches only. With Cache Components, Next.js keeps up to three
 * visited routes mounted but hidden (React Activity, `display: none`), so plain
 * DOM queries can match elements from pages the user is no longer on.
 */
const visibleAll = (selector) =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.checkVisibility())`;

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
  `(() => { const items = ${visibleAll("[data-upload-status]")};
    return items.length === ${count} && items.every((li) => ["saved", "rejected", "failed"].includes(li.dataset.uploadStatus)); })()`;
const galleryCount = `${visibleAll('ul[aria-label="Photographs"] > li')}.length`;
const galleryImagesLoaded = (count) =>
  `(() => { const imgs = ${visibleAll('ul[aria-label="Photographs"] img')};
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
      `location.pathname === "/inspections/${inspectionId}/photos/${meta.id}" && document.querySelector('[data-testid="annotation-stage"] img')?.naturalWidth === 2400`,
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
    await waitFor(`document.querySelector('[data-testid="annotation-stage"] img')?.naturalWidth === 1200`, "webp viewer");
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
    await waitFor(`document.querySelector('[data-testid="annotation-stage"] img')?.complete === true`, "viewer on mobile");
    await delay(300);
    const viewerOverflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
    await screenshot("14-viewer-mobile");
    await send("Emulation.clearDeviceMetricsOverride");
    record("No horizontal overflow at 390px (gallery and photo viewer)", !galleryOverflow && !viewerOverflow, `gallery=${galleryOverflow} viewer=${viewerOverflow}`);
  } finally {
    rmSync(oversized, { force: true });
  }
}

// ---- Annotation workspace -------------------------------------------------

const STAGE_IMG = `${visibleAll('[data-testid="annotation-stage"] img')}[0]`;
const readAnnotations = withStore("annotations", "readonly", `const r = store.getAll(); r.onsuccess = () => { result = r.result; };`);
const listCount = `${visibleAll("[data-annotation-item]")}.length`;
const saved = `${visibleAll('[data-testid="save-status"]')}[0]?.dataset.saveStatus === "saved"`;

/** Screen position of a normalised image point, using the image's current on-screen rect. */
async function imagePoint(fx, fy) {
  const r = await evaluate(`(() => { const b = ${STAGE_IMG}.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; })()`);
  return { x: r.left + fx * r.width, y: r.top + fy * r.height, rect: r };
}

/** A real mouse drag through the browser's input pipeline (fires pointer events). */
async function mouseDrag(from, to, steps = 10) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
}

/** A real touch tap (touch emulation enabled only for its duration). */
async function touchTap(point) {
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
}

/**
 * Compares every drawn shape's on-screen position with the position implied by
 * its stored normalised coordinates and the image's on-screen rect.
 */
async function alignmentError() {
  return evaluate(`${readAnnotations}.then((stored) => {
    const img = ${STAGE_IMG}.getBoundingClientRect();
    const svg = document.querySelector('[data-testid="annotation-overlay"]').getBoundingClientRect();
    let worst = Math.max(Math.abs(svg.left - img.left), Math.abs(svg.top - img.top), Math.abs(svg.width - img.width), Math.abs(svg.height - img.height));
    for (const a of stored) {
      const g = document.querySelector('[data-annotation-id="' + a.id + '"] [data-shape]');
      if (!g) return { worst: Infinity, missing: a.id };
      const b = g.getBoundingClientRect();
      const s = a.shape;
      const expected = s.kind === "rect"
        ? { left: img.left + s.x * img.width, top: img.top + s.y * img.height, right: img.left + (s.x + s.width) * img.width, bottom: img.top + (s.y + s.height) * img.height }
        : { cx: img.left + s.x * img.width, cy: img.top + s.y * img.height };
      const errors = s.kind === "rect"
        ? [b.left - expected.left, b.top - expected.top, b.right - expected.right, b.bottom - expected.bottom]
        : [(b.left + b.right) / 2 - expected.cx, (b.top + b.bottom) / 2 - expected.cy];
      worst = Math.max(worst, ...errors.map(Math.abs));
    }
    return { worst, count: stored.length };
  })`);
}

const near = (a, b, tolerance = 0.004) => Math.abs(a - b) <= tolerance;

async function annotationWorkspace() {
  const inspectionId = "e2e-photos";
  const { photos } = await evaluate(readPhotoState);
  const photo = photos.find((p) => p.fileName === "tower-north-face.jpg");

  // 1–2. Open the inspection, then the photograph's annotation workspace.
  await navigate(`/inspections/${inspectionId}`);
  await waitFor(galleryImagesLoaded(3), "gallery");
  await evaluate(`document.querySelector('a[data-photo-id="${photo.id}"]').click()`);
  await waitFor(`${STAGE_IMG}?.naturalWidth === 2400 && ${STAGE_IMG}.complete && !!document.querySelector('[data-testid="annotation-overlay"]')`, "workspace");
  await evaluate(`document.querySelector('[data-testid="annotation-viewport"]').scrollIntoView({ block: "center" })`);
  await delay(200);
  const initial = await alignmentError();
  const baseImg = await imagePoint(0, 0);
  record("Annotation workspace opens with the SVG overlay exactly over the photograph", initial.worst < 0.5, `max offset ${initial.worst.toFixed(2)} px`);

  // 3–4. Draw a rectangle with the mouse; it is saved automatically.
  await evaluate(clickByText("button", "Rectangle"));
  record("Toolbar shows the active tool", await evaluate(`[...document.querySelectorAll('[role="toolbar"] button')].find(b => b.textContent.trim() === "Rectangle").getAttribute("aria-pressed") === "true"`));
  await mouseDrag(await imagePoint(0.2, 0.3), await imagePoint(0.5, 0.6));
  await waitFor(`${listCount} === 1 && ${saved}`, "rectangle saved");
  let stored = await evaluate(readAnnotations);
  const rect = stored[0];
  record(
    "Mouse-drawn rectangle is saved in normalised image coordinates (not screen pixels)",
    stored.length === 1 && rect.shape.kind === "rect" && near(rect.shape.x, 0.2) && near(rect.shape.y, 0.3) &&
      near(rect.shape.width, 0.3) && near(rect.shape.height, 0.3),
    JSON.stringify(rect.shape),
  );
  record(
    "Saved annotation has IDs, manual provenance and timestamps",
    rect.inspectionId === inspectionId && rect.photoId === photo.id && rect.provenance.source === "manual" &&
      rect.provenance.recordedBy === "Test Inspector" && rect.createdAt === rect.updatedAt && /^[0-9a-f-]{36}$/.test(rect.id),
  );
  await screenshot("15-annotation-rectangle");

  // 5. Refresh: it remains, drawn in the same place.
  await reload();
  await waitFor(`${STAGE_IMG}?.complete && ${listCount} === 1 && !!document.querySelector('[data-shape="rect"]')`, "after reload");
  await evaluate(`document.querySelector('[data-testid="annotation-viewport"]').scrollIntoView({ block: "center" })`);
  await delay(200);
  const afterReload = await alignmentError();
  record("Rectangle persists after refresh and is redrawn at its stored position", afterReload.worst < 1.5, `max offset ${afterReload.worst.toFixed(2)} px`);

  // 6. Create a point with a real touch tap.
  await evaluate(clickByText("button", "Point"));
  await touchTap(await imagePoint(0.7, 0.4));
  await waitFor(`${listCount} === 2 && ${saved}`, "point saved");
  stored = await evaluate(readAnnotations);
  const point = stored.find((a) => a.shape.kind === "point");
  record("Touch tap creates a point at the tapped image position", point && near(point.shape.x, 0.7) && near(point.shape.y, 0.4), JSON.stringify(point?.shape));

  // 7. Select from the list: the shape is highlighted and resize handles appear.
  await evaluate(`document.querySelector('[data-annotation-item="${rect.id}"]').click()`);
  await waitFor(`document.querySelector('[data-annotation-item="${rect.id}"]').getAttribute("aria-pressed") === "true"`, "list selection");
  record(
    "Selecting from the list highlights the shape and shows resize handles",
    (await evaluate(`document.querySelector('[data-annotation-id="${rect.id}"]').hasAttribute("data-selected")`)) &&
      (await evaluate(`document.querySelectorAll('[data-handle]').length`)) === 8 &&
      (await evaluate(bodyHas("#1 · Rectangle"))),
  );

  // 8. Move the rectangle by dragging its interior.
  await mouseDrag(await imagePoint(0.35, 0.45), await imagePoint(0.45, 0.5));
  await waitFor(`${saved}`, "move saved");
  await waitFor(`${readAnnotations}.then((s) => s.find((a) => a.id === "${rect.id}").shape.x > 0.25)`, "moved in storage");
  stored = await evaluate(readAnnotations);
  let moved = stored.find((a) => a.id === rect.id).shape;
  record("Dragging a rectangle moves it (size unchanged)", near(moved.x, 0.3) && near(moved.y, 0.35) && near(moved.width, 0.3) && near(moved.height, 0.3), JSON.stringify(moved));

  // 9. Resize with the south-east corner handle.
  await mouseDrag(await imagePoint(moved.x + moved.width, moved.y + moved.height), await imagePoint(0.75, 0.8));
  await waitFor(`${readAnnotations}.then((s) => s.find((a) => a.id === "${rect.id}").shape.width > 0.4)`, "resized in storage");
  stored = await evaluate(readAnnotations);
  const resized = stored.find((a) => a.id === rect.id).shape;
  record("Dragging a corner handle resizes the rectangle; the opposite corner stays fixed", near(resized.x, 0.3) && near(resized.y, 0.35) && near(resized.width, 0.45) && near(resized.height, 0.45), JSON.stringify(resized));

  // 10. Change its label.
  await evaluate(`(() => { const s = document.querySelector("#annotation-label");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "corrosion");
    s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await waitFor(`${readAnnotations}.then((s) => s.find((a) => a.id === "${rect.id}").label === "corrosion")`, "label saved");
  record("Label change is saved and shown in the list", await evaluate(`document.querySelector('[data-annotation-item="${rect.id}"]').textContent.includes("Corrosion")`));

  // 13–14. Zoom in: alignment holds, editing still works, panning moves the image.
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes("Zoom in")).click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes("Zoom in")).click()`);
  await waitFor(`document.querySelector('[data-testid="zoom-level"]').textContent === "200%"`, "zoom 200%");
  await delay(150);
  const zoomed = await alignmentError();
  const zoomedImg = await imagePoint(0, 0);
  record(
    "At 200% zoom the image doubles in size and every shape stays aligned",
    near(zoomedImg.rect.width, baseImg.rect.width * 2, 1) && zoomed.worst < 1.5,
    `image ${Math.round(baseImg.rect.width)} → ${Math.round(zoomedImg.rect.width)} px wide, max offset ${zoomed.worst.toFixed(2)} px`,
  );

  const pointBefore = (await evaluate(readAnnotations)).find((a) => a.id === point.id).shape;
  const from = await imagePoint(pointBefore.x, pointBefore.y);
  await mouseDrag(from, { x: from.x + 40, y: from.y + 30 });
  await waitFor(`${readAnnotations}.then((s) => s.find((a) => a.id === "${point.id}").shape.x > ${pointBefore.x})`, "point moved at zoom");
  const pointAfter = (await evaluate(readAnnotations)).find((a) => a.id === point.id).shape;
  record(
    "Moving a point at 200% zoom stores the correct image-relative change",
    near(pointAfter.x - pointBefore.x, 40 / from.rect.width, 0.002) && near(pointAfter.y - pointBefore.y, 30 / from.rect.height, 0.002),
    `Δx ${(pointAfter.x - pointBefore.x).toFixed(4)} (expected ${(40 / from.rect.width).toFixed(4)})`,
  );

  const shapesBeforePan = JSON.stringify((await evaluate(readAnnotations)).map((a) => a.shape));
  const beforePan = await imagePoint(0, 0);
  const panFrom = await imagePoint(0.27, 0.28);
  await mouseDrag(panFrom, { x: panFrom.x + 60, y: panFrom.y + 40 });
  await delay(150);
  const panned = await imagePoint(0, 0);
  const pannedAlign = await alignmentError();
  const shapesAfterPan = JSON.stringify((await evaluate(readAnnotations)).map((a) => a.shape));
  record(
    "Dragging empty space pans the zoomed image; overlay stays aligned; no annotation changes",
    near(panned.rect.left - beforePan.rect.left, 60, 1) && near(panned.rect.top - beforePan.rect.top, 40, 1) &&
      pannedAlign.worst < 1.5 && shapesAfterPan === shapesBeforePan,
    `moved ${Math.round(panned.rect.left - beforePan.rect.left)}, ${Math.round(panned.rect.top - beforePan.rect.top)} px`,
  );
  await screenshot("16-annotation-zoomed");

  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes("Zoom out")).click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes("Reset view")).click()`);
  await waitFor(`document.querySelector('[data-testid="zoom-level"]').textContent === "100%"`, "reset view");
  await delay(150);
  const resetAlign = await alignmentError();
  const resetImg = await imagePoint(0, 0);
  record(
    "Zoom out and Reset view return to 100% (original size and position) with shapes still aligned",
    near(resetImg.rect.width, baseImg.rect.width, 1) && near(resetImg.rect.left, baseImg.rect.left, 1) && resetAlign.worst < 1.5,
    `max offset ${resetAlign.worst.toFixed(2)} px`,
  );

  // 11–12. Delete an annotation (explicit confirmation), then check it stays deleted.
  await evaluate(`document.querySelector('[data-annotation-item="${point.id}"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="annotation-details"]')`, "details");
  await evaluate(`[...document.querySelectorAll('[data-testid="annotation-details"] button')].find(b => b.textContent.includes("Delete annotation")).click()`);
  await waitFor(`!!document.querySelector("dialog[open]")`, "delete dialog");
  record("Deleting asks for explicit confirmation", (await evaluate(readAnnotations)).length === 2);
  await evaluate(`[...document.querySelectorAll("dialog[open] button")].find(b => b.textContent.includes("Delete annotation")).click()`);
  await waitFor(`${listCount} === 1 && ${saved}`, "deleted");
  await reload();
  await waitFor(`${STAGE_IMG}?.complete && ${listCount} === 1`, "reload after delete");
  stored = await evaluate(readAnnotations);
  record("Deletion persists after refresh; the other annotation is unchanged", stored.length === 1 && stored[0].id === rect.id && stored[0].label === "corrosion" && JSON.stringify(stored[0].shape) === JSON.stringify(resized));

  // 15–16. Mobile width.
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await reload();
  await waitFor(`${STAGE_IMG}?.complete && ${listCount} === 1`, "mobile workspace");
  await delay(300);
  const overflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
  const mobileAlign = await alignmentError();
  record("Workspace at 390px: no horizontal overflow and shapes aligned", !overflow && mobileAlign.worst < 1.5, `overflow=${overflow}, max offset ${mobileAlign.worst.toFixed(2)} px`);
  await screenshot("17-annotation-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  // Photo deletion removes its annotations (cascade), checked in the real browser.
  await reload();
  await waitFor(`${STAGE_IMG}?.complete`, "workspace before photo delete");
  await evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Delete").click()`);
  await waitFor(`!!document.querySelector("dialog[open]")`, "photo delete dialog");
  await evaluate(`[...document.querySelectorAll("dialog[open] button")].find(b => b.textContent.includes("Delete photograph")).click()`);
  await waitFor(`location.pathname === "/inspections/${inspectionId}"`, "back to inspection");
  record("Deleting the photograph also removes its annotations", (await evaluate(readAnnotations)).length === 0);
}

// ---- Findings -------------------------------------------------------------

/** First visible element matching `selector` (see `visibleAll`). */
const el = (selector) => `${visibleAll(selector)}[0]`;
const elByText = (selector, text) =>
  `${visibleAll(selector)}.find((e) => e.textContent.trim().includes(${JSON.stringify(text)}))`;
const readFindings = withStore("findings", "readonly", `const r = store.getAll(); r.onsuccess = () => { result = r.result; };`);

/** A genuine mouse click at the element's on-screen centre (scrolled into view first). */
async function realClick(elementExpression) {
  await evaluate(`(${elementExpression}).scrollIntoView({ block: "center" })`);
  await delay(80);
  const c = await evaluate(`(() => { const r = (${elementExpression}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y, buttons: 0 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", buttons: 0, clickCount: 1 });
}

/** Clicks into a field and types (genuine browser text input). `replace` selects all first. */
async function typeInto(selector, text, replace = false) {
  await realClick(el(selector));
  if (replace) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, commands: ["selectAll"] });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  }
  await send("Input.insertText", { text });
}

/** SIMULATED: sets a native <select> (headless pop-up lists can't be driven by the mouse). */
async function chooseOption(selector, value) {
  await evaluate(`(() => { const s = ${el(selector)};
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, ${JSON.stringify(value)});
    s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
}

const findingsOf = async (inspectionId) => (await evaluate(readFindings)).filter((f) => f.inspectionId === inspectionId);
const isChecked = (annotationId) => evaluate(`!!${el(`[data-evidence-annotation="${annotationId}"]`)}?.checked`);

async function findingsWorkflow() {
  // 1. Create an inspection through the form.
  await navigate("/inspections/new");
  await waitFor(`!!${el("#inspection-siteId")}`, "inspection form");
  await typeInto("#inspection-siteId", "TWR-FIND-01");
  await typeInto("#inspection-siteName", "Findings Test Mast");
  await chooseOption("#inspection-structureType", "monopole");
  await typeInto("#inspection-inspectorName", "Field Inspector");
  await realClick(elByText("button", "Use today"));
  await realClick(elByText("button", "Create inspection"));
  await waitFor(`/^\\/inspections\\/[0-9a-f-]{36}$/.test(location.pathname)`, "inspection created");
  const inspectionId = await evaluate(`location.pathname.split("/").pop()`);
  record("Findings: inspection created through the form (typed input, mouse clicks)", true, inspectionId);

  // Regression: the creation form is kept mounted (hidden) by Next.js; it must come back empty.
  await realClick(elByText("nav a", "New inspection"));
  await waitFor(`location.pathname === "/inspections/new" && !!${el("#inspection-siteId")}`, "new inspection again");
  record(
    "Returning to New inspection after creating one shows an empty, enabled form",
    (await evaluate(`${el("#inspection-siteId")}.value === "" && ${el("#inspection-siteName")}.value === "" && !${elByText("button", "Create inspection")}.disabled`)),
  );
  await navigate(`/inspections/${inspectionId}`);

  // 2. Upload two photographs.
  await waitFor(bodyHas("No photographs yet"), "gallery");
  await setInputFiles('input[type="file"]', [fixture("tower-north-face.jpg"), fixture("tower-leg-b.png")]);
  await waitFor(`${uploadsSettled(2)} && ${galleryImagesLoaded(2)}`, "two uploads");
  const photos = (await evaluate(readPhotoState)).photos.filter((p) => p.inspectionId === inspectionId);
  const jpg = photos.find((p) => p.fileName.endsWith(".jpg"));
  const png = photos.find((p) => p.fileName.endsWith(".png"));
  record("Findings: two photographs uploaded", Boolean(jpg && png));

  // 3. Annotations: two rectangles on the JPEG, one point on the PNG (mouse).
  await realClick(el(`a[data-photo-id="${jpg.id}"]`));
  await waitFor(`${STAGE_IMG}?.complete && ${STAGE_IMG}.naturalWidth > 0`, "jpg workspace");
  await evaluate(`${el('[data-testid="annotation-viewport"]')}.scrollIntoView({ block: "center" })`);
  await realClick(elByText('[role="toolbar"] button', "Rectangle"));
  await mouseDrag(await imagePoint(0.1, 0.2), await imagePoint(0.3, 0.45));
  await waitFor(`${listCount} === 1 && ${saved}`, "rect 1");
  await mouseDrag(await imagePoint(0.55, 0.5), await imagePoint(0.8, 0.75));
  await waitFor(`${listCount} === 2 && ${saved}`, "rect 2");
  await navigate(`/inspections/${inspectionId}/photos/${png.id}`);
  await waitFor(`${STAGE_IMG}?.complete && ${STAGE_IMG}.naturalWidth > 0`, "png workspace");
  await evaluate(`${el('[data-testid="annotation-viewport"]')}.scrollIntoView({ block: "center" })`);
  await realClick(elByText('[role="toolbar"] button', "Point"));
  const pt = await imagePoint(0.6, 0.4);
  await mouseDrag(pt, pt, 1);
  await waitFor(`${listCount} === 1 && ${saved}`, "png point");
  const anns = (await evaluate(readAnnotations)).filter((a) => a.inspectionId === inspectionId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const [r1, r2] = anns.filter((a) => a.photoId === jpg.id);
  const p1 = anns.find((a) => a.photoId === png.id);
  record("Findings: annotations drawn (2 rectangles, 1 point) with the mouse", Boolean(r1 && r2 && p1));

  // 4–5. Create a finding from an annotation: photograph and annotation pre-linked.
  await navigate(`/inspections/${inspectionId}/photos/${jpg.id}`);
  await waitFor(`${listCount} === 2`, "jpg annotations listed");
  await realClick(el(`[data-annotation-item="${r1.id}"]`));
  await realClick(el('[data-testid="create-finding-from-annotation"]'));
  await waitFor(`location.pathname.endsWith("/findings/new") && !!${el(`[data-evidence-photo="${jpg.id}"]`)}`, "new finding with evidence");
  record(
    "Create finding from annotation pre-links the photograph and exactly that annotation",
    (await isChecked(r1.id)) && !(await isChecked(r2.id)) && (await evaluate(`document.querySelectorAll("[data-evidence-photo]").length`)) === 1,
  );
  await typeInto("#finding-title", "Corrosion on lower bracing");
  await typeInto("#finding-description", "Surface rust with coating loss on the lower bracing members.");
  await typeInto("#finding-componentLocation", "Leg B, section 2");
  await chooseOption("#finding-category", "corrosion");
  await realClick(el('[data-choice="priority:high"]'));
  await realClick(elByText("button", "Create finding"));
  await waitFor(`/\\/findings\\/[0-9a-f-]{36}$/.test(location.pathname)`, "finding 1 saved");
  const f1Id = await evaluate(`location.pathname.split("/").pop()`);
  let f1 = (await findingsOf(inspectionId)).find((f) => f.id === f1Id);
  record(
    "Saved finding links the annotation by permanent ID, with manual provenance and no engineering rating",
    JSON.stringify(f1.evidence) === JSON.stringify([{ photoId: jpg.id, annotationIds: [r1.id] }]) &&
      f1.provenance.source === "manual" && f1.provenance.recordedBy === "Field Inspector" &&
      f1.engineeringSeverity === "not_assessed" && f1.inspectorPriority === "high" && f1.status === "observation" && !f1.review &&
      !("confidence" in f1),
    JSON.stringify(f1.evidence),
  );

  // 6–8. Create a finding directly from the inspection; attach two photos and several annotations.
  await navigate(`/inspections/${inspectionId}`);
  await waitFor(`!!${el('[data-testid="findings-summary"]')}`, "summary card");
  await realClick(`${el('[data-testid="findings-summary"]')}.querySelector('a[href$="/findings/new"]')`);
  await waitFor(`location.pathname.endsWith("/findings/new") && ${bodyHas("No evidence linked yet")}`, "empty new finding");
  record(
    "New finding from the inspection starts empty (no stale values) without evidence, and prompts to link some",
    await evaluate(`${el("#finding-title")}.value === "" && ${el("#finding-description")}.value === ""`),
  );
  await typeInto("#finding-title", "Loose fastener at platform bracket");
  await typeInto("#finding-description", "Nut backed off on the platform support bracket.");
  await chooseOption("#finding-category", "loose_fastener");
  await realClick(el('[data-choice="priority:medium"]'));
  await realClick(el(`[data-attach-photo="${jpg.id}"]`));
  await waitFor(`!!${el(`[data-evidence-annotation="${r2.id}"]`)}`, "jpg attached");
  await realClick(el(`[data-evidence-annotation="${r1.id}"]`));
  await realClick(el(`[data-evidence-annotation="${r2.id}"]`));
  await realClick(el(`[data-attach-photo="${png.id}"]`));
  await waitFor(`!!${el(`[data-evidence-annotation="${p1.id}"]`)}`, "png attached");
  await realClick(el(`[data-evidence-annotation="${p1.id}"]`));
  await screenshot("18-finding-evidence-editor");
  await realClick(elByText("button", "Create finding"));
  await waitFor(`/\\/findings\\/[0-9a-f-]{36}$/.test(location.pathname)`, "finding 2 saved");
  const f2Id = await evaluate(`location.pathname.split("/").pop()`);
  let f2 = (await findingsOf(inspectionId)).find((f) => f.id === f2Id);
  record(
    "Finding links multiple photographs and multiple annotations on one photograph",
    JSON.stringify(f2.evidence) === JSON.stringify([{ photoId: jpg.id, annotationIds: [r1.id, r2.id] }, { photoId: png.id, annotationIds: [p1.id] }]),
    JSON.stringify(f2.evidence),
  );

  // 9–10. Edit: title, priority and status (with the confirmed explanation shown).
  await typeInto("#finding-title", "Loose fastener at platform bracket (re-checked)", true);
  await realClick(el('[data-choice="priority:urgent"]'));
  await realClick(el('[data-choice="status:confirmed"]'));
  record("Status choices explain that confirmed is not an engineering certification", await evaluate(bodyHas("Reviewed and accepted by the inspector. This is not an engineering certification.")));
  await realClick(elByText("button", "Save changes"));
  await waitFor(`${bodyHas("Saved")} && !!${el('[data-testid="finding-review"]')}`, "edit saved");
  f2 = (await findingsOf(inspectionId)).find((f) => f.id === f2Id);
  record(
    "Edit saves title, priority and status; confirmation records the reviewer; engineering rating unchanged",
    f2.title === "Loose fastener at platform bracket (re-checked)" && f2.inspectorPriority === "urgent" && f2.status === "confirmed" &&
      f2.review?.reviewedBy === "Field Inspector" && f2.engineeringSeverity === "not_assessed",
  );

  // 12. Remove evidence without deleting the photograph.
  await realClick(el(`[data-remove-photo="${png.id}"]`));
  await realClick(elByText("button", "Save changes"));
  await waitFor(`!${el(`[data-evidence-photo="${png.id}"]`)}`, "png evidence row removed");
  await waitFor(bodyHas("Saved"), "evidence removal saved");
  f2 = (await findingsOf(inspectionId)).find((f) => f.id === f2Id);
  const photosAfter = (await evaluate(readPhotoState)).photos.map((p) => p.id);
  const annsAfter = (await evaluate(readAnnotations)).map((a) => a.id);
  record(
    "Removing evidence unlinks the photograph but keeps the photograph and its annotation",
    JSON.stringify(f2.evidence) === JSON.stringify([{ photoId: jpg.id, annotationIds: [r1.id, r2.id] }]) &&
      photosAfter.includes(png.id) && annsAfter.includes(p1.id),
  );
  await screenshot("19-finding-detail");

  // 11. Filters on the findings page.
  await navigate(`/inspections/${inspectionId}/findings`);
  await waitFor(`${el('[data-testid="findings-count"]')}?.textContent === "Showing 2 of 2 findings"`, "findings list");
  const visibleIds = () => evaluate(`[...document.querySelectorAll("[data-finding-id]")].map((a) => a.dataset.findingId)`);
  await chooseOption("#filter-priority", "urgent");
  await waitFor(`${el('[data-testid="findings-count"]')}.textContent === "Showing 1 of 2 findings"`, "priority filter");
  const urgentOnly = await visibleIds();
  await chooseOption("#filter-status", "observation");
  await waitFor(bodyHas("No findings match these filters."), "no match");
  await realClick(elByText("button", "Clear filters"));
  await chooseOption("#filter-category", "corrosion");
  await waitFor(`${el('[data-testid="findings-count"]')}.textContent === "Showing 1 of 2 findings"`, "category filter");
  const corrosionOnly = await visibleIds();
  record(
    "Filters by priority, status and category (combined and cleared)",
    JSON.stringify(urgentOnly) === JSON.stringify([f2Id]) && JSON.stringify(corrosionOnly) === JSON.stringify([f1Id]),
  );
  record(
    "List shows category, priority, status, component location, evidence count and created date",
    await evaluate(`(() => { const row = ${el(`[data-finding-id="${f1Id}"]`)}.innerText;
      return ["Corrosion on lower bracing", "Corrosion", "High priority", "Observation", "Leg B, section 2", "1 photo, 1 annotation", String(new Date().getFullYear())]
        .every((text) => row.includes(text)); })()`),
  );
  await realClick(elByText("button", "Clear filters"));

  // Overview summary counts.
  await navigate(`/inspections/${inspectionId}`);
  await waitFor(`!!${el('[data-summary-status="confirmed"]')}`, "summary counts");
  const summary = await evaluate(`Object.fromEntries([...document.querySelectorAll("[data-summary-status],[data-summary-priority]")].map((li) => [li.dataset.summaryStatus ?? li.dataset.summaryPriority, li.textContent.match(/(\\d+)$/)?.[1]]))`);
  record(
    "Overview summary counts findings by status and priority",
    summary.observation === "1" && summary.confirmed === "1" && summary.dismissed === "0" && summary.urgent === "1" && summary.high === "1",
    JSON.stringify(summary),
  );

  // Deleting an annotation unlinks it from findings (findings kept).
  await navigate(`/inspections/${inspectionId}/photos/${jpg.id}`);
  await waitFor(`${listCount} === 2`, "annotations listed");
  await realClick(el(`[data-annotation-item="${r2.id}"]`));
  await realClick(elByText('[data-testid="annotation-details"] button', "Delete annotation"));
  await waitFor(`!!${el("dialog[open]")}`, "annotation delete dialog");
  await realClick(elByText("dialog[open] button", "Delete annotation"));
  await waitFor(`${listCount} === 1 && ${saved}`, "annotation deleted");
  f2 = (await findingsOf(inspectionId)).find((f) => f.id === f2Id);
  record(
    "Deleting an annotation removes it from the finding's evidence; the finding and photo link remain",
    JSON.stringify(f2.evidence) === JSON.stringify([{ photoId: jpg.id, annotationIds: [r1.id] }]),
  );

  // 13. Delete a finding; photographs and annotations stay.
  await navigate(`/inspections/${inspectionId}/findings/${f1Id}`);
  await waitFor(`!!${elByText("button", "Delete")}`, "finding 1 page");
  await realClick(elByText("form button", "Delete"));
  await waitFor(`!!${el("dialog[open]")}`, "finding delete dialog");
  await realClick(elByText("dialog[open] button", "Delete finding"));
  await waitFor(`location.pathname === "/inspections/${inspectionId}/findings"`, "back to list");
  const remaining = await findingsOf(inspectionId);
  record(
    "Deleting a finding removes only the finding, not its photograph or annotation",
    remaining.length === 1 && remaining[0].id === f2Id &&
      (await evaluate(readPhotoState)).photos.some((p) => p.id === jpg.id) &&
      (await evaluate(readAnnotations)).some((a) => a.id === r1.id),
  );

  // Regression: the delete dialog closed before navigating, so the page stays clickable with a real mouse.
  await realClick(elByText("main a", "New finding"));
  await waitFor(`location.pathname.endsWith("/findings/new")`, "page interactive after delete");
  record("After deleting a finding, the page remains interactive (real mouse click navigates)", true);
  await navigate(`/inspections/${inspectionId}/findings`);

  // 14. Refresh: everything persists.
  await reload();
  await waitFor(`${el('[data-testid="findings-count"]')}?.textContent === "Showing 1 of 1 finding"`, "list after reload");
  record("After refresh the remaining finding and its edits persist", await evaluate(bodyHas("Loose fastener at platform bracket (re-checked)")));

  // 15. 390 px width.
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await reload();
  await waitFor(`!!${el("[data-finding-id]")}`, "mobile list");
  await delay(300);
  const listOverflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
  await screenshot("20-findings-list-mobile");
  await navigate(`/inspections/${inspectionId}/findings/${f2Id}`);
  await waitFor(`!!${el(`[data-evidence-photo="${jpg.id}"]`)}`, "mobile finding");
  await delay(300);
  const detailOverflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
  await screenshot("21-finding-detail-mobile");
  await send("Emulation.clearDeviceMetricsOverride");
  record("Findings list and finding page at 390px: no horizontal overflow", !listOverflow && !detailOverflow, `list=${listOverflow} detail=${detailOverflow}`);
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await inspectionLifecycle();
  await damagedRecords();
  await photoEvidence();
  await annotationWorkspace();
  await findingsWorkflow();
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
