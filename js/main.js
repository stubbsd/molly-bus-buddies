// Boot, screen routing, input, and the animation that plays out each settle.
import {
  createSession, sessionTap, sessionUndo, sessionRestart, isWon, isStuck, isLost, isRevealed, keyOf, clone,
} from "./game.js";
import {
  computeLayout, busPos, ringSlot, queuePoint, loopXY, hitBus, armNeed, drawBead, drawBus, drawBackground,
  drawMysteryBus, drawCountdown, drawFrontGlow, drawBumpBurst,
} from "./render.js";
import { loadProgress, saveProgress, isUnlocked } from "./storage.js";
import { loadIndex, loadLevel, preloadAll } from "./levels.js";
import * as audio from "./audio.js";
import * as ui from "./ui.js";

const { $ } = ui;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const RM = () => reducedMotion.matches;

let progress = loadProgress();
audio.setMuted(progress.soundMuted);
let index = [];
let session = null;
let L = null;
let dpr = 1;
let bg = null;
let stuckDismissedKey = null;
let wonShown = false;
let pid = 0;

const canvas = $("board");
const ctx = canvas.getContext("2d");

// ---------------- display model ----------------
const D = {
  queue: [], loop: [], persons: new Map(), bays: [null, null, null, null, null],
  ghosts: [], flyers: [], events: [], nextAt: 0, shakes: new Map(), bumps: new Map(),
  confetti: [], phase: 0, pendingSettle: false,
};

const person = (colour) => ({ pid: ++pid, colour });
const rad = (d) => (d * Math.PI) / 180;
const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180; // -180..180
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
// Animation timings (ms). v1 -> v2: bus to bay 750 -> 360, depart 750 -> 360,
// blocked shake 260 -> bump 320. People stay readable: hop 560, 150 between boarders.
const T = { toBay: 360, depart: 360, bump: 320, hop: 560, boardGap: 150, enter: 70, loseCard: 520 };
const HINT = "Only the front person can hop on";
let loseTimer = 0;

const busy = () => D.events.length > 0 || D.flyers.length > 0 || D.ghosts.some((g) => g.kind === "toBay");

// Everyone still waiting is one line: D.loop (on the ring, engine side) then D.queue.
// On screen the first L.ringCap people fill the ring, packed from the door back round
// the lap; the rest wait in the two feeders (L.armOf says which, by place in the
// level's whole line). When the front person hops on, everyone shuffles up one place.
const line = () => D.loop.concat(D.queue);
const boardedSoFar = () => session.level.queue.length - D.loop.length - D.queue.length;

function lineTargets() {
  const all = line();
  const off = boardedSoFar();
  const n = [0, 0];
  return all.map((p, i) => {
    if (i < L.ringCap) { const t = ringSlot(L, i, D.phase); return { mode: "l", a: t.a, r: t.r }; }
    const arm = Math.max(0, L.armOf[off + i] ?? 0);
    const q = queuePoint(L, arm, n[arm]++);
    return { mode: "q", x: q.x, y: q.y };
  });
}

function placeNow(per, t) {
  per.mode = t.mode;
  if (t.mode === "l") { per.a = t.a; per.r = t.r; Object.assign(per, loopXY(L, per.a, per.r)); } else { per.x = t.x; per.y = t.y; }
}

function rebuildDisplay() {
  const s = session.state;
  D.queue = s.queue.map(person);
  D.loop = s.loop.map(person);
  D.persons = new Map();
  const all = line();
  lineTargets().forEach((t, i) => { const per = { mode: t.mode, x: 0, y: 0, a: 0, r: 0 }; placeNow(per, t); D.persons.set(all[i].pid, per); });
  D.bays = s.bays.map((b) => (b ? { id: b.id, colour: b.colour, capacity: b.capacity, filled: b.filled, pending: 0 } : null));
  D.ghosts = []; D.flyers = []; D.events = []; D.pendingSettle = false;
}

function snapPositions() {
  const all = line();
  lineTargets().forEach((t, i) => placeNow(D.persons.get(all[i].pid), t));
}

// ---------------- layout / resize ----------------
function readInsets() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return r;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  L = computeLayout(w, h, readInsets(), session ? session.level : null);
  document.body.classList.toggle("landscape", L.landscape);
  bg = document.createElement("canvas");
  bg.width = canvas.width; bg.height = canvas.height;
  bgKey = "";
  if (session) snapPositions();
  refreshBackground();
}

// Feeders are drawn only as long as the line of people in them (redrawn when a row
// of three leaves), so there is never empty feeder track on show.
let bgKey = "";
function refreshBackground() {
  if (!bg || !L) return;
  const n = [0, 0];
  if (session) {
    const off = boardedSoFar(), all = line();
    for (let i = L.ringCap; i < all.length; i++) n[Math.max(0, L.armOf[off + i] ?? 0)]++;
  }
  const lens = n.map((c) => armNeed(L, c));
  const key = lens.map((x) => Math.round(x)).join(",");
  if (key === bgKey) return;
  bgKey = key;
  const b = bg.getContext("2d");
  b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, bg.width, bg.height);
  b.scale(dpr, dpr); drawBackground(b, L, lens);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));

// ---------------- frame loop ----------------
let last = performance.now();
let raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!session || $("screen-game").hidden) return;
  step(now, dt);
  draw(now);
}

function step(now, dt) {
  const speed = RM() ? 0.15 : 1;
  // Visual-only conveyor: the packed ring goes round clockwise, about ten
  // seconds a lap. Boarding still takes the front person to the door, then
  // down to the bay. prefers-reduced-motion stops the spin.
  if (!RM()) D.phase += (360 / 10) * dt;
  // play out settle events
  while (D.events.length && now >= D.nextAt) {
    const e = D.events[0];
    const arriving = D.ghosts.some((g) => g.kind === "toBay" && g.bay === e.bay);
    if (e.type === "enter") {
      D.loop.push(D.queue.shift()); // same place in the line, so nobody jumps
      D.nextAt = now;
    } else if (e.type === "board") {
      if (arriving) break;
      const p = D.loop.shift();
      const per = D.persons.get(p.pid); per.mode = "f";
      D.flyers.push({ pid: p.pid, colour: p.colour, x0: per.x, y0: per.y, t0: now, dur: T.hop * speed, bay: e.bay });
      D.bays[e.bay].pending++;
      D.nextAt = now + T.boardGap * speed;
    } else if (e.type === "depart") {
      if (arriving || D.flyers.some((f) => f.bay === e.bay)) break;
      const b = D.bays[e.bay];
      D.ghosts.push({ kind: "depart", bus: b, bay: e.bay, t0: now, dur: T.depart * (RM() ? 0.5 : 1) });
      D.bays[e.bay] = null;
      audio.play("depart", 0.45);
    }
    D.events.shift();
  }
  // flyers land
  for (const f of D.flyers) {
    if ((now - f.t0) / f.dur >= 1) {
      f.done = true;
      D.persons.delete(f.pid);
      const b = D.bays[f.bay];
      if (b) { b.filled++; b.pending--; }
      D.bumps.set(f.bay, now);
      audio.play("board", 0.35);
    }
  }
  D.flyers = D.flyers.filter((f) => !f.done);
  for (const g of D.ghosts) {
    if ((now - g.t0) / g.dur >= 1) {
      g.done = true;
      if (g.kind === "toBay") D.bays[g.bay] = { id: g.bus.id, colour: g.bus.colour, capacity: g.bus.capacity, filled: 0, pending: 0 };
    }
  }
  D.ghosts = D.ghosts.filter((g) => !g.done);
  // people glide towards their places
  const k = RM() ? 1 : 1 - Math.exp(-dt * 9);
  const all = line();
  lineTargets().forEach((t, i) => {
    const per = D.persons.get(all[i].pid);
    if (!per) return;
    if (t.mode === "q") {
      per.mode = "q";
      per.x += (t.x - per.x) * k; per.y += (t.y - per.y) * k;
      return;
    }
    if (per.mode !== "l") { // stepping off a feeder onto the ring
      per.mode = "l";
      per.a = (Math.atan2(per.y - L.island.cy, per.x - L.island.cx) * 180) / Math.PI;
      per.r = Math.hypot(per.y - L.island.cy, per.x - L.island.cx);
    }
    let delta = ((((t.a - per.a) % 360) + 540) % 360) - 180;
    per.a += delta * k;
    per.r += (t.r - per.r) * k;
    Object.assign(per, loopXY(L, per.a, per.r));
  });
  // confetti
  for (const c of D.confetti) { c.vy += 600 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; }
  D.confetti = D.confetti.filter((c) => c.life > 0);
  if (D.pendingSettle && !busy()) { D.pendingSettle = false; afterSettle(); }
}

function draw(now) {
  refreshBackground();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const br = L.br;
  const all = line();
  for (let i = all.length - 1; i >= 1; i--) { const per = D.persons.get(all[i].pid); if (per) drawBead(ctx, all[i].colour, per.x, per.y, br, dpr); }
  // the person at the front of the line glows: only they can board
  const front = all[0];
  if (front) {
    const per = D.persons.get(front.pid);
    if (per) {
      if (!session.state.lost) drawFrontGlow(ctx, per.x, per.y, br * (RM() ? 1.15 : 1.15 + 0.12 * Math.sin(now / 180)));
      drawBead(ctx, front.colour, per.x, per.y, br, dpr);
    }
  }
  // bay buses
  D.bays.forEach((b, i) => {
    if (!b) return;
    const bay = L.bays[i];
    const bt = D.bumps.get(i); const bump = bt && now - bt < 220 ? 1 + 0.06 * Math.sin(((now - bt) / 220) * Math.PI) : 1;
    drawBus(ctx, bay.cx, bay.cy - bay.h * 0.07, 0, L.bayBus.len, L.bayBus.wid, b.colour, { scale: bump });
    drawCountdown(ctx, bay, b.capacity - b.filled, bump > 1 ? 1 + (bump - 1) * 2.5 : 1);
  });
  // parked buses
  const parked = session.state.parked;
  const lostId = session.state.lost?.busId;
  const drawOrder = parked.filter((b) => b.id !== lostId).sort((a, b) => a.y - b.y);
  const bursts = [];
  for (const b of drawOrder) {
    const p = busPos(L, b);
    let ang = p.angle, x = p.x, y = p.y;
    const st = D.shakes.get(b.id);
    if (st) {
      // bump: nudge forward along the roof arrow into the bus in front, then settle back
      const t = (now - st) / (T.bump * (RM() ? 0.6 : 1));
      if (t < 1) {
        const push = RM() ? 0 : Math.sin(Math.min(1, t * 1.6) * Math.PI) * p.len * 0.16;
        const hx = Math.sin(rad(p.angle)), hy = -Math.cos(rad(p.angle));
        x += hx * push; y += hy * push;
        ang += RM() ? 0 : Math.sin(t * Math.PI * 4) * 4 * (1 - t);
        if (t > 0.12 && t < 0.85) bursts.push({ x: x + hx * p.len * 0.55, y: y + hy * p.len * 0.55, s: 0.8 + 0.3 * Math.sin(t * Math.PI) });
      } else D.shakes.delete(b.id);
    }
    if (isRevealed(b, parked)) drawBus(ctx, x, y, ang, p.len, p.wid, b.colour);
    else drawMysteryBus(ctx, x, y, ang, p.len, p.wid);
  }
  for (const s of bursts) drawBumpBurst(ctx, s.x, s.y, s.s);
  // the bus that had nowhere to go waits just short of the full bays
  if (lostId) {
    const b = parked.find((x) => x.id === lostId);
    if (b) {
      const from = busPos(L, b);
      const lt = D.lostAt ? Math.min(1, (now - D.lostAt) / T.toBay) : 1;
      const u = ease(lt);
      // portrait: it pulls up just under the road; landscape: it heads towards the bays and stops short
      const to = L.landscape
        ? { x: from.x + (L.bays[2].cx - from.x) * 0.4, y: from.y + (L.bays[2].cy - from.y) * 0.4 }
        : { x: L.bays[2].cx, y: L.road.y + L.road.h + from.len * 0.5 };
      const c = { x: to.x, y: from.y };
      const gx = (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * c.x + u * u * to.x;
      const gy = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * c.y + u * u * to.y;
      drawBus(ctx, gx, gy, norm(from.angle) * (1 - u * 0.75), from.len, from.wid, b.colour);
    }
  }
  // ghosts
  for (const g of D.ghosts) {
    const t = Math.min(1, (now - g.t0) / g.dur), e = ease(t);
    if (g.kind === "toBay") {
      // drive out along the roof arrow, then swing round to the bay
      const to = L.bays[g.bay]; const ty = to.cy - to.h * 0.07;
      const hx = Math.sin(rad(g.from.angle)), hy = -Math.cos(rad(g.from.angle));
      const c = { x: g.from.x + hx * g.from.len * 1.6, y: g.from.y + hy * g.from.len * 1.6 };
      const x = (1 - e) * (1 - e) * g.from.x + 2 * (1 - e) * e * c.x + e * e * to.cx;
      const y = (1 - e) * (1 - e) * g.from.y + 2 * (1 - e) * e * c.y + e * e * ty;
      const len = g.from.len + (L.bayBus.len - g.from.len) * e;
      const wid = g.from.wid + (L.bayBus.wid - g.from.wid) * e;
      drawBus(ctx, x, y, norm(g.from.angle) * (1 - e), len, wid, g.bus.colour);
    } else {
      const bay = L.bays[g.bay];
      ctx.save(); ctx.globalAlpha = 1 - t;
      drawBus(ctx, bay.cx, bay.cy - bay.h * 0.07 - e * bay.h * 0.7, 0, L.bayBus.len, L.bayBus.wid, g.bus.colour, { scale: 1 - 0.35 * e });
      ctx.restore();
    }
  }
  // flyers: walk to the door at 6 o'clock, then hop down the lane into the bus
  for (const f of D.flyers) {
    const t = Math.min(1, (now - f.t0) / f.dur);
    const bay = L.bays[f.bay];
    let x, y;
    if (t < 0.35) { const u = ease(t / 0.35); x = f.x0 + (L.door.x - f.x0) * u; y = f.y0 + (L.door.y - f.y0) * u; }
    else {
      const u = ease((t - 0.35) / 0.65);
      const c = L.laneBottom, end = { x: bay.cx, y: bay.cy - bay.h * 0.2 };
      x = (1 - u) * (1 - u) * L.door.x + 2 * (1 - u) * u * c.x + u * u * end.x;
      y = (1 - u) * (1 - u) * L.door.y + 2 * (1 - u) * u * c.y + u * u * end.y - Math.sin(u * Math.PI) * br * 1.5;
    }
    drawBead(ctx, f.colour, x, y, br, dpr, t > 0.92 ? 1 - (t - 0.92) * 6 : 1);
  }
  for (const c of D.confetti) drawBead(ctx, c.colour, c.x, c.y, br * 0.8, dpr);
}

// ---------------- game flow ----------------
function save() {
  if (session && !isWon(session.state)) {
    progress.inProgress = { levelId: session.level.id, state: session.state, undoStack: session.undoStack, redoStack: [] };
  }
  saveProgress(progress);
}

async function startLevel(id, resume = true) {
  const level = await loadLevel(id);
  const saved = resume && progress.inProgress?.levelId === id ? progress.inProgress : null;
  try { session = createSession(level, saved); } catch { session = createSession(level); }
  progress.currentLevel = id;
  stuckDismissedKey = null; wonShown = false;
  clearTimeout(loseTimer); D.lostAt = 0;
  ui.setLevelLabel(id); ui.setHint(HINT); ui.setStuckVisible(false); ui.hideCard();
  ui.showScreen("game");
  resize();
  rebuildDisplay();
  updateUndo();
  save();
  if (isLost(session.state)) showOutOfRoom(0); else checkStuck();
}

function updateUndo() { ui.setUndoEnabled(session && session.undoStack.length > 0); }

function onTap(x, y) {
  if (!session || ui.cardOpen() || busy() || isWon(session.state) || isLost(session.state)) return;
  const id = hitBus(L, session.state.parked, x, y);
  if (!id) return;
  const before = session.state;
  const bus = before.parked.find((b) => b.id === id);
  const r = sessionTap(session, id);
  if (!r.moved) { D.shakes.set(id, performance.now()); audio.play("shake", 0.4); return; }
  audio.play("tap", 0.4);
  ui.setStuckVisible(false);
  if (r.lost) {
    D.lostAt = performance.now();
    ui.setHint("The loading bays are full");
    updateUndo(); save();
    showOutOfRoom(RM() ? 150 : T.loseCard);
    return;
  }
  const from = busPos(L, bus);
  const now = performance.now();
  const dur = RM() ? 200 : T.toBay;
  D.ghosts.push({ kind: "toBay", bus, from, bay: r.bay, t0: now, dur });
  D.events.push(...r.events);
  D.nextAt = now;
  D.pendingSettle = true;
  updateUndo();
  save();
}

/** Gentle lose card: just Try again or Undo. */
function showOutOfRoom(delay) {
  clearTimeout(loseTimer);
  loseTimer = setTimeout(() => {
    if (!session || !isLost(session.state)) return;
    ui.setHint("The loading bays are full");
    ui.showCard("Out of room!", "Every loading bay is full. Have another go?", [
      { label: "Try again", onClick: restartNow },
      { label: "Undo", soft: true, onClick: undo },
    ], { variant: "lose" });
  }, delay);
}

function restartNow() {
  clearTimeout(loseTimer); D.lostAt = 0;
  sessionRestart(session); wonShown = false; stuckDismissedKey = null;
  ui.hideCard(); rebuildDisplay(); ui.setHint(HINT); updateUndo(); save(); checkStuck();
}

function afterSettle() {
  if (isWon(session.state)) return celebrate();
  checkStuck();
}

function checkStuck() {
  const stuck = isStuck(session.state);
  if (stuck) ui.setHint("The loading bays are full");
  ui.setStuckVisible(stuck && keyOf(session.state) !== stuckDismissedKey);
}

function celebrate() {
  if (wonShown) return; wonShown = true;
  const id = session.level.id;
  if (!progress.completedLevels.includes(id)) progress.completedLevels.push(id);
  progress.completedLevels.sort((a, b) => a - b);
  progress.inProgress = null;
  progress.currentLevel = Math.min(12, id + 1);
  saveProgress(progress);
  ui.setHint("Nice planning, Molly!");
  audio.play("win", 0.5);
  if (!RM()) {
    const cols = ["red", "yellow", "blue", "green", "purple", "pink"];
    for (let i = 0; i < 40; i++) {
      D.confetti.push({ colour: cols[i % 6], x: L.island.cx, y: L.island.cy, vx: (Math.random() - 0.5) * 420, vy: -250 - Math.random() * 300, life: 1.6 + Math.random() * 0.5 });
    }
  }
  setTimeout(() => {
    const actions = [];
    if (id < 12) actions.push({ label: "Next level", onClick: () => startLevel(id + 1, false) });
    actions.push({ label: "Levels", soft: id < 12, onClick: openLevels });
    ui.showCard("Well done, Molly!", id === 12 ? "You finished every level. What a planner!" : "Everyone got a seat.", actions);
  }, RM() ? 300 : 1400);
}

function undo() {
  if (!session || !sessionUndo(session)) return;
  clearTimeout(loseTimer); D.lostAt = 0;
  wonShown = false;
  ui.hideCard();
  rebuildDisplay();
  ui.setHint(HINT);
  stuckDismissedKey = null;
  updateUndo(); save(); checkStuck();
}

function askRestart() {
  if (!session) return;
  ui.showCard("Start this level again?", "", [
    { label: "Start again", onClick: restartNow },
    { label: "Keep playing", soft: true },
  ]);
}

function openPause() {
  ui.showCard("Paused", "", [
    { label: "Resume" },
    { label: `Sound: ${progress.soundMuted ? "off" : "on"}`, soft: true, onClick: () => { progress.soundMuted = !progress.soundMuted; audio.setMuted(progress.soundMuted); saveProgress(progress); openPause(); } },
    { label: "Choose a level", soft: true, onClick: openLevels },
  ]);
}

async function openLevels() {
  save();
  index = index.length ? index : await loadIndex();
  ui.renderLevelGrid(index, progress, isUnlocked, (id) => startLevel(id));
  ui.showScreen("levels");
}

function firstOpenLevel() {
  if (progress.inProgress) return progress.inProgress.levelId;
  for (let i = 1; i <= 12; i++) if (!progress.completedLevels.includes(i)) return i;
  return 12;
}

function drawTitleArt() {
  const c = $("title-art"); const x = c.getContext("2d");
  const r = Math.min(window.devicePixelRatio || 1, 3);
  c.width = 320 * r; c.height = 200 * r; x.scale(r, r);
  const cols = ["red", "yellow", "blue", "green", "purple", "pink"];
  drawBus(x, 160, 112, 90, 150, 62, "blue");
  for (let i = 0; i < 12; i++) drawBead(x, cols[i % 6], 40 + i * 21, 175 + (i % 2) * 6, 9, r);
  for (let i = 0; i < 5; i++) drawBead(x, cols[(i + 2) % 6], 60 + i * 50, 30 + (i % 2) * 10, 10, r);
}

// ---------------- wiring ----------------
canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  const rect = canvas.getBoundingClientRect();
  onTap(e.clientX - rect.left, e.clientY - rect.top);
});
document.addEventListener("pointerdown", () => audio.unlock(), { once: true });
$("btn-undo").addEventListener("click", undo);
$("btn-restart").addEventListener("click", askRestart);
$("btn-pause").addEventListener("click", openPause);
$("stuck-undo").addEventListener("click", undo);
$("stuck-keep").addEventListener("click", () => { stuckDismissedKey = keyOf(session.state); ui.setStuckVisible(false); });
$("btn-play").addEventListener("click", () => startLevel(firstOpenLevel()));
$("btn-levels").addEventListener("click", openLevels);
$("btn-levels-back").addEventListener("click", () => ui.showScreen("title"));
$("btn-how").addEventListener("click", () => ui.showCard("How to play", ui.HOW_TO_PLAY, [{ label: "Got it" }]));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { save(); cancelAnimationFrame(raf); } else { last = performance.now(); raf = requestAnimationFrame(frame); }
});
window.addEventListener("pagehide", save);

// Small hook for automated checks (screenshots, offline test). Harmless in play.
window.__busBuddies = {
  start: (id) => startLevel(id, false),
  tap: (id) => { const p = busPos(L, session.state.parked.find((b) => b.id === id)); onTap(p.x, p.y); },
  get state() { return session && clone(session.state); },
  get busy() { return busy(); },
  get phase() { return D.phase; },
  // Packed ring people, in line order, for the rotation check.
  ringPeople() {
    if (!session || !L) return [];
    return line().slice(0, L.ringCap).map((p) => {
      const per = D.persons.get(p.pid);
      return per ? { id: p.pid, colour: p.colour, x: per.x, y: per.y, a: per.a } : null;
    }).filter(Boolean);
  },
};

if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

drawTitleArt();
resize();
raf = requestAnimationFrame(frame);
preloadAll().then((i) => { index = i; }).catch(() => {});
const params = new URLSearchParams(location.search);
if (params.get("level")) startLevel(Number(params.get("level")), false);
