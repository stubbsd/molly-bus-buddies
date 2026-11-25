// Dev-only: drives headless Chrome over the DevTools protocol (Node stdlib only)
// to take the SPEC.md §9.3 screenshots and run an offline service-worker check.
//   node tools/browser-check.mjs [baseUrl]        (default http://127.0.0.1:8765/)
// Needs Google Chrome or Chromium on PATH (CHROME=/path/to/chrome to override).
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const OUT = new URL("../docs/screenshots/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(process.env.CHROME || "google-chrome", [
    "--headless=new", `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "bb-chrome-"))}`, "--disable-gpu", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const t = (await r.json()).find((x) => x.type === "page"); if (t) return { chrome, ws: t.webSocketDebuggerUrl }; } catch {}
    await sleep(200);
  }
  throw new Error("chrome did not start");
}

function client(url) {
  const ws = new WebSocket(url);
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
    else for (const l of listeners) l(msg);
  };
  const ready = new Promise((r) => (ws.onopen = r));
  return {
    ready,
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  };
}

const { chrome, ws } = await launch();
const c = client(ws); await c.ready;
const errors = [];
let phase = "start";
c.on((m) => {
  if (m.method === "Runtime.exceptionThrown") errors.push(`[${phase}] ` + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(`[${phase}] ` + m.params.entry.text + " " + (m.params.entry.url || ""));
});
await c.send("Page.enable"); await c.send("Runtime.enable"); await c.send("Log.enable");
const evaluate = async (expr) => (await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
async function go(url, w, h) {
  phase = url + " " + w + "x" + h;
  await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: w < 1300 });
  await c.send("Page.navigate", { url });
  for (let i = 0; i < 50; i++) { await sleep(150); if (await evaluate("document.readyState === 'complete' && !!window.__busBuddies")) break; }
  await sleep(500);
}
async function shot(name) {
  const r = await c.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(new URL(name, OUT), Buffer.from(r.data, "base64"));
  console.log("saved docs/screenshots/" + name);
}
async function idle() { for (let i = 0; i < 80; i++) { await sleep(150); if (!(await evaluate("window.__busBuddies.busy"))) return; } }
const fresh = () => evaluate("localStorage.clear(); true");

// 1. iPhone title
await go(BASE, 390, 844); await fresh(); await go(BASE, 390, 844);
await shot("01-iphone-title.png");
// 2. iPhone level 1
await go(BASE + "?level=1", 390, 844); await sleep(1200);
await shot("02-iphone-level1.png");
// 3. iPhone later level, bus in a bay and people boarding
await go(BASE + "?level=6", 390, 844); await sleep(800);
await evaluate("window.__busBuddies.tap('r1'); true"); await idle();
await evaluate("window.__busBuddies.tap('r2'); true"); await sleep(1000);
await shot("03-iphone-level6-boarding.png");
await idle();
const l6 = await evaluate("JSON.stringify(window.__busBuddies.state.bays.map(b => b && b.id + ':' + b.filled))");
console.log("level 6 bays after r1, r2:", l6);
// 4. iPad portrait level 1
await go(BASE + "?level=1", 834, 1194); await sleep(1200);
await shot("04-ipad-portrait-level1.png");
// 5. iPad landscape level 1
await go(BASE + "?level=1", 1194, 834); await sleep(1200);
await shot("05-ipad-landscape-level1.png");
// extra: level 12 on iPhone (deepest car park) and the level-4 stuck prompt
await go(BASE + "?level=12", 390, 844); await sleep(1200);
await shot("06-iphone-level12.png");
await go(BASE + "?level=4", 390, 844); await sleep(600);
for (const id of ["r1", "r2", "r3", "y1", "y2"]) { await evaluate(`window.__busBuddies.tap('${id}'); true`); await idle(); }
await sleep(400);
const stuckShown = await evaluate("!document.getElementById('stuck').hidden");
console.log("level 4 trap -> stuck prompt visible:", stuckShown);
await shot("07-iphone-level4-stuck.png");
// small screen fit
await go(BASE + "?level=11", 375, 667); await sleep(1000);
await shot("08-iphone-se-level11.png");
// play level 1 to the win
await go(BASE + "?level=1", 390, 844); await sleep(600);
for (const id of ["r1", "y1", "y2"]) { await evaluate(`window.__busBuddies.tap('${id}'); true`); await idle(); }
await sleep(2000);
const winCard = await evaluate("document.getElementById('card-title').textContent + ' | visible=' + !document.getElementById('overlay').hidden");
console.log("level 1 win card:", winCard);
await shot("09-iphone-level1-win.png");

// Play level 12 through the UI along the solver's shortest path, with a reload half way (resume check).
const report = (await import("node:fs")).readFileSync(new URL("../tools/solver-report.md", import.meta.url), "utf8");
const path12 = report.split("### Level 12")[1].match(/shortest path: `([^`]+)`/)[1].split(", ");
await go(BASE + "?level=12", 390, 844); await sleep(600);
for (const [i, id] of path12.entries()) {
  if (i === 7) { await go(BASE, 390, 844); await evaluate("document.getElementById('btn-play').click(); true"); await sleep(1200); }
  await evaluate(`window.__busBuddies.tap('${id}'); true`); await idle();
}
await sleep(1800);
console.log("level 12 via UI (reload after 7 moves):", await evaluate("document.getElementById('card-title').textContent + ' | done=' + JSON.parse(localStorage.getItem('mollysBusBuddies.v1')).completedLevels.join(',')"));

// Offline check: SW should be controlling by now.
const swState = await evaluate("navigator.serviceWorker.ready.then(r => r.active && r.active.state)");
await go(BASE, 390, 844);
const controlled = await evaluate("!!navigator.serviceWorker.controller");
const cached = await evaluate("caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.keys()).then(r => n + ':' + r.length))))");
console.log("service worker:", swState, "controlling:", controlled, "caches:", JSON.stringify(cached));
await c.send("Network.enable");
await c.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const offlineResults = [];
for (const lv of [1, 7, 12]) {
  await go(BASE + `?level=${lv}`, 390, 844);
  const ok = await evaluate(`(async () => { const s = window.__busBuddies.state; return !!s && s.parked.length > 0 && document.getElementById('hud-level').textContent; })()`);
  offlineResults.push(`level ${lv}: ${ok}`);
}
const audioOk = await evaluate("fetch('audio/win.wav').then(r => r.ok && r.headers.get('content-length') !== '0').catch(e => 'fail ' + e)");
await go(BASE + "?level=2", 390, 844); await sleep(800);
await shot("10-offline-level2.png");
console.log("offline:", offlineResults.join("; "), "| audio from cache:", audioOk);
if (errors.length) console.log("console errors:", errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)));
c.close(); chrome.kill();
