// Dev-only: drives headless Chrome over the DevTools protocol (Node stdlib only)
// to take the SPEC.md §9.3 screenshots and run an offline service-worker check.
//   node tools/browser-check.mjs [baseUrl]        (default http://127.0.0.1:8765/)
// Needs Google Chrome or Chromium on PATH (CHROME=/path/to/chrome to override).
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialState, applyMove, legalMoves, isStuck } from "../js/game.js";
import { loadLevel as readLevel, analyseLevel } from "./solve.mjs";

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

// A move list that fills all five bays with nobody able to board (for the stuck and out-of-room shots).
function pathToFullBays(level) {
  const seen = new Set();
  const dfs = (st, path) => {
    if (isStuck(st)) return path;
    if (path.length > 8) return null;
    for (const b of legalMoves(st)) {
      const r = applyMove(st, b.id);
      const k = JSON.stringify(r.state.bays) + r.state.parked.length;
      if (seen.has(k)) continue; seen.add(k);
      const got = dfs(r.state, [...path, b.id]);
      if (got) return got;
    }
    return null;
  };
  return dfs(initialState(level), []);
}
async function tapAll(ids) { for (const id of ids) { await evaluate(`window.__busBuddies.tap('${id}'); true`); await idle(); } }

// 1. iPhone title
await go(BASE, 390, 844); await fresh(); await go(BASE, 390, 844);
await shot("01-iphone-title.png");
// 2. iPhone level 1
await go(BASE + "?level=1", 390, 844); await sleep(1200);
await shot("02-iphone-level1.png");
// 3. iPhone mid-level (compare with mockups/v2/01-gameplay.png): buses in bays with countdowns,
// mystery buses, the front person glowing and a blocked bus bumping.
{
  const l8 = analyseLevel(readLevel(8)).shortestPath;
  await go(BASE + "?level=8", 390, 844); await sleep(800);
  await tapAll(l8.slice(0, 3));
  await sleep(300);
  const st = await evaluate("window.__busBuddies.state");
  const blocked = st.parked.find((b) => b.slot.endsWith("1") || b.slot.endsWith("2"));
  const { tapProblem } = await import("../js/game.js");
  if (blocked) { console.log("bump tap on", blocked.id, "->", tapProblem(st, blocked.id)); await evaluate(`window.__busBuddies.tap('${blocked.id}'); true`); }
  await shot("03-iphone-level8-midgame.png");
  await idle();
  console.log("level 8 bays:", JSON.stringify((await evaluate("window.__busBuddies.state")).bays.map((b) => b && `${b.id}:${b.capacity - b.filled} left`)), "| bumped:", blocked?.id);
}
// 4. iPad portrait level 8 and 5. iPad landscape level 1
await go(BASE + "?level=8", 820, 1180); await sleep(1200);
await shot("04-ipad-portrait-level8.png");
await go(BASE + "?level=1", 1180, 820); await sleep(1200);
await shot("05-ipad-landscape-level1.png");
// 6. level 12 on iPhone (deepest car park, four mystery buses)
await go(BASE + "?level=12", 390, 844); await sleep(1200);
await shot("06-iphone-level12.png");
// 7. bays full: the stuck banner, then sending one more bus out -> gentle out-of-room card
{
  const level = readLevel(6);
  const fill = pathToFullBays(level);
  await go(BASE + "?level=6", 390, 844); await sleep(600);
  await tapAll(fill);
  await sleep(400);
  console.log("level 6 fill-the-bays", fill.join(","), "-> stuck banner visible:", await evaluate("!document.getElementById('stuck').hidden"));
  await shot("07-iphone-level6-bays-full.png");
  const st = await evaluate("window.__busBuddies.state");
  const { isUnblocked } = await import("../js/game.js");
  const extra = st.parked.find((b) => isUnblocked(b, st.parked));
  await evaluate(`window.__busBuddies.tap('${extra.id}'); true`); await sleep(1300);
  console.log("out of room card:", await evaluate("document.getElementById('card-title').textContent + ' | visible=' + !document.getElementById('overlay').hidden + ' | buttons=' + [...document.querySelectorAll('#card-actions button')].map(b => b.textContent).join('/')"));
  await shot("08-iphone-level6-out-of-room.png");
  await evaluate("[...document.querySelectorAll('#card-actions button')].find(b => b.textContent === 'Undo').click(); true"); await sleep(300);
  console.log("after Undo: lost=", await evaluate("!!window.__busBuddies.state.lost"), "card hidden=", await evaluate("document.getElementById('overlay').hidden"));
  await go(BASE + "?level=6", 820, 1180); await sleep(600);
  await tapAll(fill);
  await evaluate(`window.__busBuddies.tap('${extra.id}'); true`); await sleep(1300);
  await shot("08b-ipad-level6-out-of-room.png");
  await go(BASE + "?level=6", 1180, 820); await sleep(600);
  await tapAll(fill);
  await evaluate(`window.__busBuddies.tap('${extra.id}'); true`); await sleep(1300);
  await shot("08c-ipad-landscape-level6-out-of-room.png");
}
// small screen fit
await go(BASE + "?level=11", 375, 667); await sleep(1000);
await shot("09-iphone-se-level11.png");
// play level 1 to the win
await go(BASE + "?level=1", 390, 844); await sleep(600);
await tapAll(analyseLevel(readLevel(1)).shortestPath);
await sleep(2000);
const winCard = await evaluate("document.getElementById('card-title').textContent + ' | visible=' + !document.getElementById('overlay').hidden");
console.log("level 1 win card:", winCard);
await shot("10-iphone-level1-win.png");

// Play level 12 through the UI along the solver's shortest path, with a reload half way (resume check).
const report = (await import("node:fs")).readFileSync(new URL("../tools/solver-report.md", import.meta.url), "utf8");
const path12 = report.split("### Level 12")[1].match(/shortest path: `([^`]+)`/)[1].split(", ");
await go(BASE + "?level=12", 390, 844); await sleep(600);
for (const [i, id] of path12.entries()) {
  if (i === 7) { await go(BASE, 390, 844); await evaluate("document.getElementById('btn-play').click(); true"); await sleep(1200); }
  await evaluate(`window.__busBuddies.tap('${id}'); true`); await idle();
}
await sleep(1800);
console.log("level 12 via UI (reload after 7 moves):", await evaluate("document.getElementById('card-title').textContent + ' | done=' + JSON.parse(localStorage.getItem('mollysBusBuddies.v2')).completedLevels.join(',')"));

// Offline check: SW should be controlling by now.
const swState = await evaluate("navigator.serviceWorker.ready.then(r => r.active && r.active.state)");
const swVersion = await evaluate("fetch('sw.js', { cache: 'no-store' }).then(r => r.text()).then(t => (t.match(/const VERSION = \"([^\"]+)\"/) || [])[1])");
console.log("served sw VERSION:", swVersion);
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
await shot("11-offline-level2.png");
console.log("offline:", offlineResults.join("; "), "| audio from cache:", audioOk);
if (errors.length) console.log("console errors:", errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)));
c.close(); chrome.kill();
