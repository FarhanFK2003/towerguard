// End-to-end browser checks for TowerGuard, with no test dependencies: drives a
// headless Edge or Chrome over the Chrome DevTools Protocol using Node's
// built-in WebSocket (Node 22+).
//
// Usage: start the app (`npm run dev` or `npm start`), then
//   npm run test:e2e -- [baseUrl]        (default http://localhost:3000)
// Set BROWSER_PATH to use a specific Chromium-based browser.
// Screenshots and results.json are written to e2e/output/ (git-ignored).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const outDir = join(dirname(fileURLToPath(import.meta.url)), "output");
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

/** Runs `body` (JS using a `store` variable) against the inspections store in the page. */
const withInspectionStore = (mode, body) => `new Promise((resolve, reject) => {
  const open = indexedDB.open("towerguard");
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction("inspections", ${JSON.stringify(mode)});
    const store = tx.objectStore("inspections");
    let result;
    ${body}
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => reject(tx.error);
  };
})`;
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

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await inspectionLifecycle();
  await damagedRecords();
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
