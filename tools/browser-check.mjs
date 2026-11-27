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
async function idle() { for (let i = 0; i < 200; i++) { await sleep(200); if (!(await evaluate("window.__busBuddies.busy"))) return; } throw new Error("idle timeout: the board was still moving after 40s"); }
const fresh = () => evaluate("localStorage.clear(); true");

// A move list that leaves every bay occupied, with nobody on the ring able to hop on.
function pathToFullBays(level) {
  const seen = new Set();
  const dfs = (st, path) => {
    if (isStuck(st) || st.bays.every(Boolean)) return path;
    if (path.length > 10) return null;
    for (const b of legalMoves(st)) {
      const r = applyMove(st, b.id);
      const k = JSON.stringify(r.state.bays) + r.state.parked.length + r.state.loop.join("");
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
// 2. iPhone level 1: the pickup person stands at the bottom, and boarders leave from there
await go(BASE + "?level=1", 390, 844); await sleep(800);
await shot("02-iphone-level1.png");
{
  const door = await evaluate("window.__busBuddies.door");
  const ring = await evaluate("window.__busBuddies.ringPeople()");
  const pick = ring[0];
  const atDoor = pick && door ? Math.hypot(pick.x - door.x, pick.y - door.y) : Infinity;
  console.log("pickup at door: dist=" + Math.round(atDoor) + "px people=" + ring.length);
  if (!(atDoor < 80)) throw new Error("person at the pickup is not at the bottom of the ring (" + atDoor + " px from the door)");
  const first = analyseLevel(readLevel(1)).path[0];
  await evaluate(`window.__busBuddies.tap('${first}'); true`);
  let boarded = [];
  for (let i = 0; i < 40; i++) {
    boarded = (await evaluate("window.__busBuddies.boarders()")) || [];
    if (boarded.length) break;
    await sleep(80);
  }
  await shot("12-board-frame-0.png");
  await sleep(280);
  await shot("12-board-frame-1.png");
  await sleep(280);
  await shot("12-board-frame-2.png");
  const fromDoor = boarded.map((b) => Math.hypot(b.x0 - door.x, b.y0 - door.y));
  const nearest = fromDoor.length ? Math.min(...fromDoor) : Infinity;
  console.log("boarders leave from the bottom: n=" + boarded.length + " nearest start=" + Math.round(nearest) + "px colours=" + boarded.map((b) => b.colour).join(","));
  if (!(nearest < 80)) throw new Error("boarders did not leave from the bottom of the ring (start " + nearest + " px from the door)");
  await idle();
}
// 3. iPhone mid-level (compare with mockups/v2/01-gameplay.png): buses in bays with countdowns,
// mystery buses, the front person glowing and a blocked bus bumping.
{
  const l8 = analyseLevel(readLevel(8)).shortestPath;
  await go(BASE + "?level=8", 390, 844); await sleep(800);
  await tapAll(l8.slice(0, 3));
  await sleep(300);
  const st = await evaluate("window.__busBuddies.state");
  const { tapProblem, isUnblocked: free } = await import("../js/game.js");
  const blocked = st.parked.find((b) => !free(b, st.parked) && !b.mystery);
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
// 6. last level on iPhone (the biggest jam in the 100-level campaign)
await go(BASE + "?level=100", 390, 844); await sleep(1200);
await shot("06-iphone-level100.png");
// 7. bays full: the stuck banner, then sending one more bus out -> gentle out-of-room card
{
  const level = readLevel(49);
  const fill = pathToFullBays(level);
  await go(BASE + "?level=49", 390, 844); await sleep(600);
  await tapAll(fill);
  await sleep(400);
  console.log("level 49 fill-the-bays", fill.join(","), "-> stuck banner visible:", await evaluate("!document.getElementById('stuck').hidden"));
  await shot("07-iphone-level49-bays-full.png");
  const st = await evaluate("window.__busBuddies.state");
  const { isUnblocked } = await import("../js/game.js");
  const extra = st.parked.find((b) => isUnblocked(b, st.parked));
  await evaluate(`window.__busBuddies.tap('${extra.id}'); true`); await sleep(1300);
  console.log("out of room card:", await evaluate("document.getElementById('card-title').textContent + ' | visible=' + !document.getElementById('overlay').hidden + ' | buttons=' + [...document.querySelectorAll('#card-actions button')].map(b => b.textContent).join('/')"));
  await shot("08-iphone-level49-out-of-room.png");
  await evaluate("[...document.querySelectorAll('#card-actions button')].find(b => b.textContent === 'Undo').click(); true"); await sleep(300);
  console.log("after Undo: lost=", await evaluate("!!window.__busBuddies.state.lost"), "card hidden=", await evaluate("document.getElementById('overlay').hidden"));
  await go(BASE + "?level=49", 820, 1180); await sleep(600);
  await tapAll(fill);
  await evaluate(`window.__busBuddies.tap('${extra.id}'); true`); await sleep(1300);
  await shot("08b-ipad-level49-out-of-room.png");
  await go(BASE + "?level=49", 1180, 820); await sleep(600);
  await tapAll(fill);
  await evaluate(`window.__busBuddies.tap('${extra.id}'); true`); await sleep(1300);
  await shot("08c-ipad-landscape-level49-out-of-room.png");
}
// small screen fit (late jam on an iPhone SE)
await go(BASE + "?level=100", 375, 667); await sleep(1000);
await shot("09-iphone-se-level100.png");
// play level 1 to the win
await go(BASE + "?level=1", 390, 844); await sleep(600);
await tapAll(analyseLevel(readLevel(1)).shortestPath);
await sleep(2000);
const winCard = await evaluate("document.getElementById('card-title').textContent + ' | visible=' + !document.getElementById('overlay').hidden");
console.log("level 1 win card:", winCard);
await shot("10-iphone-level1-win.png");

// Play a mid-campaign level through the UI along the solver's path, with a reload half way (resume check).
const path12 = analyseLevel(readLevel(12)).path;
await go(BASE + "?level=12", 390, 844); await sleep(600);
for (const [i, id] of path12.entries()) {
  if (i === 5) {
    await go(BASE, 390, 844); await sleep(400);
    const stored = await evaluate("JSON.parse(localStorage.getItem('mollysBusBuddies.v4')||'{}').inProgress && JSON.parse(localStorage.getItem('mollysBusBuddies.v4')).inProgress.levelId");
    await evaluate("document.getElementById('btn-play').click(); true");
    await sleep(1500);
    const hud = await evaluate("document.getElementById('hud-level').textContent");
    console.log("resume after reload: stored=" + stored + " hud=" + hud);
    if (hud !== "Level 12") throw new Error("Play did not resume level 12 (hud=" + hud + ", stored=" + stored + ")");
  }
  await evaluate(`window.__busBuddies.tap('${id}'); true`); await idle();
}
let l12card = "";
for (let i = 0; i < 25; i++) {
  await sleep(200);
  l12card = await evaluate("document.getElementById('card-title').textContent + ' | won=' + !!(window.__busBuddies && window.__busBuddies.state && window.__busBuddies.state.queue && window.__busBuddies.state.queue.length===0 && window.__busBuddies.state.loop && window.__busBuddies.state.loop.length===0) + ' | parked=' + (window.__busBuddies && window.__busBuddies.state && window.__busBuddies.state.parked && window.__busBuddies.state.parked.length) + ' | done=' + JSON.parse(localStorage.getItem('mollysBusBuddies.v4')).completedLevels.join(',')");
  if (/Well done/.test(l12card)) break;
}
console.log("level 12 via UI (reload mid-way):", l12card);
if (!/Well done/.test(l12card)) throw new Error("level 12 did not finish after resume: " + l12card);

// Level picker should show 100 tappable buttons and scroll.
await go(BASE, 390, 844); await fresh(); await go(BASE, 390, 844);
await evaluate("document.getElementById('btn-levels').click(); true"); await sleep(400);
const picker = await evaluate("({ n: document.querySelectorAll('#level-grid .level-btn').length, text: document.getElementById('level-progress')?.textContent, decades: [...document.querySelectorAll('.level-decade')].map(e => e.textContent).slice(0,3) })");
console.log("level picker:", JSON.stringify(picker));
if (picker.n !== 100) throw new Error("level picker should list 100 levels, got " + picker.n);
await shot("13-iphone-level-picker.png");

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
for (const lv of [1, 50, 100]) {
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
