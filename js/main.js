// Boot, screen routing, input, and the animation that plays out each settle.
import {
  createSession, sessionTapAt, sessionUndo, replayEvents, sessionRestart, isWon, isStuck, isLost, isRevealed, keyOf, clone,
} from "./game.js";
import {
  computeLayout, busPos, ringSlot, queuePoint, loopXY, hitBus, armNeed, drawBead, drawBus, drawBackground,
  drawMysteryBus, drawCountdown, drawFrontGlow, drawBumpBurst,
} from "./render.js";
import { loadProgress, saveProgress, isUnlocked, LEVEL_COUNT } from "./storage.js";
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
  ghosts: [], flyers: [], events: [], done: [], base: null, nextAt: 0, shakes: new Map(), bumps: new Map(),
  confetti: [], phase: 0, spin: 0, skip: null, clock: null, armLens: null, pendingSettle: false,
};

const person = (colour) => ({ pid: ++pid, colour });
const rad = (d) => (d * Math.PI) / 180;
const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180; // -180..180
const wrap = (x, n) => ((x % n) + n) % n;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
// Animation timings (ms). v1 -> v2: bus to bay 750 -> 360, depart 750 -> 360,
// blocked shake 260 -> bump 320. People stay readable: hop 560, 150 between boarders.
// hop/boardGap follow the reference stream: a tight walk from the door into the
// bus, a slight shrink only as they go in. lap is one visual revolution (~7.5s
// in the original video). Skip and idle use that constant speed, never a snap.
const T = { toBay: 360, depart: 360, bump: 320, hop: 420, boardGap: 60, enter: 0, loseCard: 520, lap: 7500 };
const HINT = "People hop on at the bottom of the circle";
let loseTimer = 0;

const busy = () => D.events.length > 0 || D.flyers.length > 0 || D.ghosts.some((g) => g.kind === "toBay");

// D.loop is the packed ring (loop[0] is the next person the engine will pick
// up). D.queue waits in the two feeders. The ring itself turns the whole time
// at a steady speed; people peel off at the bottom door and walk into the bus.
const line = () => D.loop.concat(D.queue);

/** Packed home of loop[i] at spin 0: slot (slots-i), the door for i=0, then
 *  approaching from the right. */
function homeSlot(i) {
  const slots = L.ringSlots.length;
  return ringSlot(L, wrap(slots - i, slots));
}

/** Visual place of a ring person. The packed chevron is rotated as a rigid
 *  turntable: each person keeps their own lane (constant r) and the whole
 *  crowd turns at a constant angle rate. v7 interpolated through neighbouring
 *  packed slots, which zigzag across the three lanes and made the ring judder
 *  even when positions never "jumped". */
function loopTarget(i, spin = 0, per = null) {
  const slots = L.ringSlots.length;
  const deg = (360 / slots) * spin;
  if (per && per.baseA != null && per.homeR != null) return { a: per.baseA + deg, r: per.homeR };
  const h = homeSlot(i);
  return { a: h.a + deg, r: h.r };
}

const _targets = [];
function lineTargets() {
  const n = [0, 0];
  _targets.length = 0;
  for (let i = 0; i < D.loop.length; i++) {
    const p = D.loop[i];
    const t = loopTarget(i, D.spin, D.persons.get(p.pid));
    _targets.push({ mode: "l", a: t.a, r: t.r });
  }
  for (let i = 0; i < D.queue.length; i++) {
    const p = D.queue[i];
    const per = D.persons.get(p.pid);
    const arm = per?.arm ?? (Math.floor(i / 3) % 2);
    const q = queuePoint(L, arm, n[arm]++);
    _targets.push({ mode: "q", x: q.x, y: q.y, arm });
  }
  return _targets;
}

function placeNow(per, t, i = 0) {
  per.mode = t.mode;
  if (t.mode === "l") {
    const slots = L.ringSlots.length;
    if (per.baseA == null || per.homeR == null) {
      const h = homeSlot(i);
      per.baseA = h.a - D.spin * (360 / slots);
      per.homeR = h.r;
    }
    const pose = loopTarget(i, D.spin, per);
    per.a = pose.a; per.r = pose.r;
    const xy = loopXY(L, per.a, per.r);
    per.x = xy.x; per.y = xy.y;
    per.glued = true;
  } else { per.x = t.x; per.y = t.y; per.glued = false; }
}

function rebuildDisplay() {
  const s = session.state;
  D.queue = s.queue.map(person);
  D.loop = s.loop.map(person);
  D.persons = new Map();
  const all = line();
  lineTargets().forEach((t, i) => {
    const per = { mode: t.mode, x: 0, y: 0, a: 0, r: 0, arm: t.arm, merging: false, baseA: null, homeR: null, glued: false };
    placeNow(per, t, i);
    if (t.mode === "q") per.arm = t.arm;
    D.persons.set(all[i].pid, per);
  });
  // Lock each waiting person to one feeder so a later shift cannot throw them
  // across to the other arm (that was the main "flash" on the sides).
  D.queue.forEach((p, i) => {
    const per = D.persons.get(p.pid);
    if (per && per.arm == null) per.arm = Math.floor(i / 3) % 2;
  });
  D.bays = s.bays.map((b) => (b ? { id: b.id, colour: b.colour, capacity: b.capacity, filled: b.filled, pending: 0 } : null));
  D.ghosts = []; D.flyers = []; D.events = []; D.done = []; D.base = null; D.pendingSettle = false; D.spin = 0; D.skip = null; D.armLens = null; D.clock = null;
}

function snapPositions() {
  const all = line();
  lineTargets().forEach((t, i) => {
    const per = D.persons.get(all[i].pid);
    if (!per) return;
    if (t.mode === "l") { per.baseA = null; per.homeR = null; per.glued = false; }
    placeNow(per, t, i);
  });
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
function wantedArmLens() {
  const n = [0, 0];
  if (session) {
    D.queue.forEach((p, i) => {
      const per = D.persons.get(p.pid);
      n[per?.arm ?? (Math.floor(i / 3) % 2)]++;
    });
  }
  return n.map((c) => armNeed(L, c));
}

function refreshBackground() {
  if (!bg || !L) return;
  const lens = D.armLens || wantedArmLens();
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
const frameDts = [];
function frame(now) {
  raf = requestAnimationFrame(frame);
  const raw = now - last;
  const dt = Math.min(0.05, raw / 1000); last = now;
  if (frameDts.length >= 180) frameDts.shift();
  frameDts.push(raw);
  if (!session || $("screen-game").hidden) return;
  step(now, dt);
  if (D.captureTick) D.captureTick(now);
  draw(now);
}

function slotsOf() { return L.ringSlots.length; }

function conveyorOmega() {
  return RM() ? 0 : slotsOf() / (T.lap / 1000);
}

/** How far (degrees round the island) a ring person is from the bottom door:
 *  negative = still coming round, positive = already past. */
function doorGap(p) {
  const per = p && D.persons.get(p.pid);
  if (!per) return 0;
  return norm((Math.atan2(per.y - L.island.cy, per.x - L.island.cx) * 180) / Math.PI - 90);
}

/** True when this person has reached the bottom door (and not gone well past it),
 *  so they can step off towards a bus. Judged by angle so inner-lane people count too. */
function nearDoor(p) {
  if (!p || !L) return true;
  const per = D.persons.get(p.pid);
  if (!per) return true;
  if (per.merging) return false;
  const g = doorGap(p);
  return g >= -3 && g <= 40;
}

function personAtDoor() {
  let best = null, bestD = Infinity;
  for (const p of D.loop) {
    const per = D.persons.get(p.pid);
    if (!per || per.merging) continue;
    const d = Math.hypot(per.x - L.door.x, per.y - L.door.y);
    if (d < bestD) { bestD = d; best = { p, per }; }
  }
  return best;
}

function flyerPose(f, now) {
  const t = Math.min(1, (now - f.t0) / f.dur);
  const bay = L.bays[f.bay];
  const end = { x: bay.cx, y: bay.cy - bay.h * 0.12 };
  const c = { x: f.x0 * 0.35 + end.x * 0.65, y: L.laneBottom.y };
  const u = t; // steady walk, like the reference stream
  const x = (1 - u) * (1 - u) * f.x0 + 2 * (1 - u) * u * c.x + u * u * end.x;
  const y = (1 - u) * (1 - u) * f.y0 + 2 * (1 - u) * u * c.y + u * u * end.y;
  let scale = 1, alpha = 1;
  if (t > 0.8) {
    const w = (t - 0.8) / 0.2;
    scale = 1 - 0.45 * w;
    alpha = 1 - 0.85 * w;
  }
  return { x, y, t, scale, alpha };
}

function stepArmLens(dt) {
  if (!L) return;
  const need = wantedArmLens();
  if (!D.armLens) D.armLens = need.slice();
  const k = RM() ? 1 : 1 - Math.exp(-dt * 6);
  D.armLens = D.armLens.map((v, i) => v + (need[i] - v) * k);
}

function movePeople(dt) {
  const circ = 2 * Math.PI * (L.island.Rm || L.ringR[1]);
  const v = circ / (T.lap / 1000);
  const maxPx = RM() ? 1e9 : Math.max(8, v * 1.2) * dt;
  const maxDeg = RM() ? 1e9 : (360 / (T.lap / 1000)) * 1.5 * dt;
  const all = line();
  lineTargets().forEach((t, i) => {
    const per = D.persons.get(all[i].pid);
    if (!per) return;
    if (t.mode === "q") {
      per.mode = "q";
      per.merging = false;
      const dx = t.x - per.x, dy = t.y - per.y, d = Math.hypot(dx, dy);
      const s = d <= maxPx ? 1 : maxPx / (d || 1);
      per.x += dx * s; per.y += dy * s;
      return;
    }
    // People already on the ring ride the turntable once they have reached
    // their packed slot. Until then they walk along the ring — the same
    // even glide as a feeder — and never chord across the grass.
    if (t.mode === "l" && per.mode === "l" && !per.merging) {
      if (per.baseA == null || per.homeR == null) {
        const slots = L.ringSlots.length;
        const h = homeSlot(i);
        per.baseA = h.a - D.spin * (360 / slots);
        per.homeR = h.r;
        t.a = per.baseA + D.spin * (360 / slots);
        t.r = per.homeR;
      }
      // Once on the turntable, stay on the clock even if a long frame
      // would have missed a closeness test (that chase looked like judder).
      if (per.glued) {
        per.a = t.a; per.r = t.r;
        const xy = loopXY(L, per.a, per.r);
        per.x = xy.x; per.y = xy.y;
        return;
      }
      const delta0 = ((((t.a - per.a) % 360) + 540) % 360) - 180;
      if (Math.abs(delta0) <= maxDeg + 0.5 && Math.abs(t.r - per.r) <= maxPx + 2) {
        per.glued = true;
        per.a = t.a; per.r = t.r;
        const xy = loopXY(L, per.a, per.r);
        per.x = xy.x; per.y = xy.y;
        return;
      }
      per.a += Math.sign(delta0 || 0) * Math.min(Math.abs(delta0), maxDeg);
      const dr0 = t.r - per.r;
      per.r += Math.sign(dr0 || 0) * Math.min(Math.abs(dr0), maxPx);
      const xy = loopXY(L, per.a, per.r);
      per.x = xy.x; per.y = xy.y;
      return;
    }
    // Newly entered people walk to their own arm's join first, then step onto
    // the ring and follow it. Never chord across the grass.
    if (per.merging || per.mode !== "l") {
      const join = L.arms[per.arm ?? 0].J;
      const dJ = Math.hypot(per.x - join.x, per.y - join.y);
      if (!RM() && dJ > L.br * 1.8) {
        per.merging = true;
        per.glued = false;
        const dx = join.x - per.x, dy = join.y - per.y, d = Math.hypot(dx, dy);
        const s = d <= maxPx ? 1 : maxPx / (d || 1);
        per.x += dx * s; per.y += dy * s;
        return;
      }
      per.merging = false;
      per.mode = "l";
      per.a = (Math.atan2(per.y - L.island.cy, per.x - L.island.cx) * 180) / Math.PI;
      per.r = Math.hypot(per.y - L.island.cy, per.x - L.island.cx);
      // Take the packed home for this index, then catch it along the ring.
      const slots = L.ringSlots.length;
      const h = homeSlot(i);
      per.baseA = h.a - D.spin * (360 / slots);
      per.homeR = h.r;
    }
    const delta = ((((t.a - per.a) % 360) + 540) % 360) - 180;
    per.a += Math.sign(delta || 0) * Math.min(Math.abs(delta), maxDeg);
    const dr = t.r - per.r;
    per.r += Math.sign(dr || 0) * Math.min(Math.abs(dr), maxPx);
    const xy = loopXY(L, per.a, per.r);
    per.x = xy.x; per.y = xy.y;
  });
}

function spinClockClear() { D.clock = null; }
function spinAt(now) {
  const omega = conveyorOmega(); // slots / second
  if (!D.clock) D.clock = { t0: now, spin0: D.spin };
  return D.clock.spin0 + ((now - D.clock.t0) / 1000) * omega;
}

/** The game as the screen shows it right now (null when every event has been played). */
function worldNow() {
  if (!D.events.length || !D.base) return null;
  return replayEvents(D.base, D.done);
}

function step(now, dt) {
  const speed = RM() ? 0.15 : 1;
  const slots = slotsOf();
  // The ring never waits: it turns at one constant speed whatever the buses are
  // doing (drive in, board, leave). Events wait for the ring, not the other way round.
  if (RM()) spinClockClear();
  else D.spin = spinAt(now);

  // Play settle events against the moving conveyor. Taps can arrive while earlier
  // buses are still driving in or boarding: the engine has already settled them in
  // order, and here they simply queue up in that same order.
  while (D.events.length && now >= D.nextAt) {
    const e = D.events[0];
    // Someone can step on once their bus is mostly in (it finishes parking while they walk).
    const arriving = D.ghosts.some((g) => g.kind === "toBay" && g.bay === e.bay && (now - g.t0) / g.dur < 0.5);
    if (e.type === "skip") {
      if (RM()) {
        for (let i = 0; i < e.n; i++) D.loop.push(D.loop.shift());
        D.skip = null; D.nextAt = now;
      } else {
        if (!D.skip) {
          if (!nearDoor(D.loop[0])) break;
          D.skip = { n: e.n, start: D.spin };
        }
        if (D.spin < D.skip.start + e.n) break;
        for (let i = 0; i < e.n; i++) D.loop.push(D.loop.shift());
        D.skip = null; D.nextAt = now;
      }
    } else if (e.type === "enter") {
      if (D.queue.length) {
        const p = D.queue.shift();
        const per = D.persons.get(p.pid);
        if (per) per.merging = true;
        D.loop.push(p);
      }
      D.nextAt = now;
    } else if (e.type === "board") {
      if (arriving) break;
      if (!D.loop.length) { D.done.push(D.events.shift()); continue; }
      if (!RM() && !nearDoor(D.loop[0])) break;
      const p = D.loop.shift();
      const per = D.persons.get(p.pid); per.mode = "f"; per.merging = false;
      const pose = { x: per.x, y: per.y };
      D.flyers.push({ pid: p.pid, colour: p.colour, x0: pose.x, y0: pose.y, x: pose.x, y: pose.y, t0: now, dur: T.hop * speed, bay: e.bay });
      if (D.bays[e.bay]) D.bays[e.bay].pending++;
      D.nextAt = now + T.boardGap * speed;
    } else if (e.type === "depart") {
      if (D.ghosts.some((g) => g.kind === "toBay" && g.bay === e.bay) || D.flyers.some((f) => f.bay === e.bay)) break;
      const b = D.bays[e.bay];
      if (b) {
        D.ghosts.push({ kind: "depart", bus: b, bay: e.bay, t0: now, dur: T.depart * (RM() ? 0.5 : 1) });
        D.bays[e.bay] = null;
        audio.play("depart", 0.45);
      }
    }
    D.done.push(D.events.shift());
  }
  if (!D.events.length && !D.skip) {
    while (D.spin >= slots) {
      D.spin -= slots;
      if (D.clock) D.clock.spin0 -= slots;
    }
    while (D.spin < 0) {
      D.spin += slots;
      if (D.clock) D.clock.spin0 += slots;
    }
  }

  for (const f of D.flyers) {
    const pose = flyerPose(f, now);
    f.x = pose.x; f.y = pose.y;
    if (pose.t >= 1) {
      f.done = true;
      D.persons.delete(f.pid);
      const b = D.bays[f.bay];
      if (b) { b.filled++; b.pending = Math.max(0, b.pending - 1); }
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
  movePeople(dt);
  stepArmLens(dt);
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
  const doorP = personAtDoor();
  const doorPid = doorP?.p.pid;
  for (let i = all.length - 1; i >= 0; i--) {
    const per = D.persons.get(all[i].pid);
    if (!per || all[i].pid === doorPid) continue;
    drawBead(ctx, all[i].colour, per.x, per.y, br, dpr);
  }
  // the person visually at the bottom door glows: they are next off the ring
  if (doorP) {
    if (!session.state.lost) drawFrontGlow(ctx, doorP.per.x, doorP.per.y, br * (RM() ? 1.15 : 1.15 + 0.12 * Math.sin(now / 180)));
    drawBead(ctx, doorP.p.colour, doorP.per.x, doorP.per.y, br, dpr);
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
      const LB = L.bays[Math.floor(L.bays.length / 2)];
      const to = L.landscape
        ? { x: from.x + (LB.cx - from.x) * 0.4, y: from.y + (LB.cy - from.y) * 0.4 }
        : { x: LB.cx, y: L.road.y + L.road.h + from.len * 0.5 };
      const c = { x: to.x, y: from.y };
      const gx = (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * c.x + u * u * to.x;
      const gy = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * c.y + u * u * to.y;
      drawBus(ctx, gx, gy, norm(from.angle) * (1 - u * 0.75), from.len, from.wid, b.colour);
    }
  }
  // ghosts
  for (const g of D.ghosts) {
    const t = Math.max(0, Math.min(1, (now - g.t0) / g.dur)), e = ease(t);
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
  // flyers: a tight stream from the door down the lane into the bus, matching
  // the reference. They keep their size until the last step, then shrink and fade in.
  for (const f of D.flyers) {
    const pose = flyerPose(f, now);
    drawBead(ctx, f.colour, pose.x, pose.y, br * pose.scale, dpr, pose.alpha);
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
  ui.setLevelLabel(id, session.state.bays.length); ui.setHint(HINT); ui.setStuckVisible(false); ui.hideCard();
  ui.showScreen("game");
  resize();
  rebuildDisplay();
  updateUndo();
  save();
  if (isLost(session.state)) showOutOfRoom(0); else checkStuck();
}

function updateUndo() { ui.setUndoEnabled(session && session.undoStack.length > 0); }

function onTap(x, y) {
  const id = session && hitBus(L, session.state.parked, x, y);
  if (id) tapBus(id);
}

function tapBus(id) {
  // No busy() gate: taps are accepted while other buses are still driving in or
  // boarding. The new bus joins the others already in the bays and everyone still
  // waiting is settled together, so the people at the door board whichever bay
  // bus matches their colour.
  if (!session || ui.cardOpen() || isWon(session.state) || isLost(session.state)) return;
  const bus = session.state.parked.find((b) => b.id === id);
  if (!bus) return;
  const r = sessionTapAt(session, id, worldNow());
  if (!r.moved) {
    D.shakes.set(id, performance.now());
    audio.play("shake", 0.4);
    if (r.problem === "busy") ui.setHint("Every bay is busy for a moment");
    return;
  }
  audio.play("tap", 0.4);
  ui.setStuckVisible(false);
  if (r.lost) {
    D.lostAt = performance.now();
    ui.setHint("The loading bays are full");
    updateUndo(); save();
    showOutOfRoom(RM() ? 200 : T.loseCard);
    return;
  }
  ui.setHint(HINT);
  const from = busPos(L, bus);
  const now = performance.now();
  const dur = RM() ? 200 : T.toBay;
  // If an earlier bus is still pulling out of this bay, wait for it to clear.
  const leaving = D.ghosts.find((g) => g.kind === "depart" && g.bay === r.bay);
  D.ghosts.push({ kind: "toBay", bus, from, bay: r.bay, t0: leaving ? leaving.t0 + leaving.dur : now, dur });
  // Everything still to come from this moment, settled with every bus now in a bay.
  D.base = r.base;
  D.done = [];
  D.events = r.events.slice();
  D.skip = null;
  if (!D.events.length) D.nextAt = now;
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
  progress.currentLevel = Math.min(LEVEL_COUNT, id + 1);
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
    if (id < LEVEL_COUNT) actions.push({ label: "Next level", onClick: () => startLevel(id + 1, false) });
    actions.push({ label: "Levels", soft: id < LEVEL_COUNT, onClick: openLevels });
    ui.showCard("Well done, Molly!", id === LEVEL_COUNT ? "You finished every level. What a planner!" : "Everyone got a seat.", actions);
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
  for (let i = 1; i <= LEVEL_COUNT; i++) if (!progress.completedLevels.includes(i)) return i;
  return LEVEL_COUNT;
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
  tap: (id) => tapBus(id),
  get state() { return session && clone(session.state); },
  get busy() { return busy(); },
  get phase() { return D.spin; },
  get door() { return L && { x: L.door.x, y: L.door.y }; },
  get island() { return L && { cx: L.island.cx, cy: L.island.cy }; },
  get busSize() { return L && { parkWid: L.parkBus.wid, parkLen: L.parkBus.len, bayWid: L.bayBus.wid }; },
  /** What is on screen at the bays right now (for the multi-bus browser check). */
  bayState() {
    const now = performance.now();
    return {
      open: L ? L.bays.length : 0,
      occupied: D.bays.map((b) => !!b),
      ids: D.bays.map((b) => (b ? b.id : null)),
      filling: D.bays.map((b, i) => (b && (b.filled > 0 || b.pending > 0) ? i : -1)).filter((i) => i >= 0),
      driving: D.ghosts.filter((g) => g.kind === "toBay" && (now - g.t0) / g.dur < 1).map((g) => g.bay),
      boarding: [...new Set(D.flyers.map((f) => f.bay))],
      departing: D.ghosts.filter((g) => g.kind === "depart").map((g) => g.bay),
      events: D.events.length,
      flyers: D.flyers.length,
    };
  },
  ringPeople() {
    if (!session || !L) return [];
    return D.loop.map((p, i) => {
      const per = D.persons.get(p.pid);
      return per ? { id: p.pid, colour: p.colour, x: per.x, y: per.y, a: per.a, i } : null;
    }).filter(Boolean);
  },
  boarders() {
    const now = performance.now();
    return D.flyers.map((f) => {
      const pose = L ? flyerPose(f, now) : { x: f.x0, y: f.y0, t: 0 };
      return { id: f.pid, colour: f.colour, x0: f.x0, y0: f.y0, x: pose.x, y: pose.y, t: pose.t };
    });
  },
  people() {
    if (!session || !L) return [];
    const now = performance.now();
    const out = [];
    for (const p of D.loop) {
      const per = D.persons.get(p.pid);
      if (per) out.push({ id: p.pid, colour: p.colour, x: per.x, y: per.y, a: per.a, r: per.r, role: per.merging ? "merge" : "ring" });
    }
    for (const p of D.queue) {
      const per = D.persons.get(p.pid);
      if (per) out.push({ id: p.pid, colour: p.colour, x: per.x, y: per.y, role: "feeder" });
    }
    for (const f of D.flyers) {
      const pose = flyerPose(f, now);
      out.push({ id: f.pid, colour: f.colour, x: pose.x, y: pose.y, role: "boarder" });
    }
    return out;
  },
  frameTimes() { return frameDts.slice(); },
  capture(ms = 1000) {
    return new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      // Sample from the game loop, not a second rAF: under CPU throttle a
      // second loop was reading stale poses and invented a false judder.
      D.captureTick = (now) => {
        const people = window.__busBuddies.people().map((p) => ({ id: p.id, role: p.role, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, a: p.a, colour: p.colour }));
        out.push({ t: now, people, phase: D.spin, busy: busy(), flyers: D.flyers.length, bay: window.__busBuddies.bayState() });
        if (now - t0 >= ms) { D.captureTick = null; resolve(out); }
      };
    });
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
