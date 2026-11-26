#!/usr/bin/env node
// Dev-only level designer for the v3 car park. For each level: pack a chevron jam of
// B buses (tools/park-layout.mjs), pick arrows so most buses start blocked and the
// jam can be cleared, colour the buses, then write the queue from a planned clearing
// order that respects blocking and a bay limit, so the level is solvable by
// construction. The official solver (tools/solve.mjs) then checks every candidate;
// among the good ones we keep the one whose careful-player win rate is closest to
// the target, so difficulty rises steadily.
//   node tools/design-levels.mjs            # design all 12, write levels/*.json
//   node tools/design-levels.mjs 7 8        # only these levels
import { writeFileSync, readFileSync } from "node:fs";
import { COLOURS } from "../js/slots.js";
import { packedSpaces, chooseArrows } from "./park-layout.mjs";
import { analyseLevel, levelProblems, loadLevel } from "./solve.mjs";

const ROOT = new URL("../", import.meta.url);
// B buses, C colours, mys mystery buses, caps seat counts, use = most bays the plan
// fills at once, free = most buses allowed to be free at the start (share),
// split = chance the plan lets only some of a bus's people on before switching,
// eager = chance the plan lets people on straight after a bus arrives,
// win = target win rate for a careful but short-sighted player.
export const TARGETS = {
  1: { B: 10, C: 2, mys: 0, caps: [8, 10], use: 2, free: 0.4, split: 0, eager: 0.8, win: 0.95 },
  2: { B: 11, C: 2, mys: 0, caps: [6, 8, 10], use: 2, free: 0.4, split: 0.1, eager: 0.7, win: 0.85 },
  3: { B: 14, C: 3, mys: 0, caps: [6, 8, 10], use: 2, free: 0.4, split: 0.15, eager: 0.6, win: 0.85 },
  4: { B: 16, C: 3, mys: 0, caps: [4, 6, 8, 10], use: 3, free: 0.4, split: 0.2, eager: 0.5, win: 0.75 },
  5: { B: 18, C: 3, mys: 0, caps: [4, 6, 8, 10], use: 3, free: 0.4, split: 0.25, eager: 0.45, win: 0.55 },
  6: { B: 20, C: 4, mys: 2, caps: [4, 6, 8, 10], use: 3, free: 0.38, split: 0.25, eager: 0.4, win: 0.48 },
  7: { B: 22, C: 4, mys: 3, caps: [4, 6, 8, 10], use: 4, free: 0.36, split: 0.3, eager: 0.35, win: 0.4 },
  8: { B: 24, C: 4, mys: 4, caps: [4, 6, 8, 10], use: 4, free: 0.35, split: 0.3, eager: 0.3, win: 0.33 },
  9: { B: 27, C: 5, mys: 5, caps: [4, 6, 8, 10], use: 4, free: 0.35, split: 0.35, eager: 0.25, win: 0.26 },
  10: { B: 30, C: 5, mys: 6, caps: [4, 6, 8, 10], use: 4, free: 0.33, split: 0.35, eager: 0.2, win: 0.2 },
  11: { B: 33, C: 6, mys: 7, caps: [4, 6, 8, 10], use: 4, free: 0.33, split: 0.4, eager: 0.15, win: 0.15 },
  12: { B: 36, C: 6, mys: 8, caps: [4, 6, 8, 10], use: 4, free: 0.32, split: 0.4, eager: 0.1, win: 0.1 },
};
const LETTER = { red: "r", yellow: "y", blue: "b", green: "g", purple: "p", pink: "k" };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const packCache = new Map();
function pack(B) { if (!packCache.has(B)) packCache.set(B, packedSpaces(B)); return packCache.get(B); }

function candidate(T, r) {
  const p = pack(T.B);
  const arr = chooseArrows(p.list, r, { maxFreeFrac: T.free, minDepth: 2, caps: T.caps }, 600);
  if (!arr) return null;
  const { buses: raw, map } = arr;
  // colours: as even as possible
  const cols = COLOURS.slice(0, T.C);
  const colours = shuffle(r, raw.map((_, i) => cols[i % T.C]));
  const n = {};
  const buses = raw.map((b, i) => {
    const c = colours[i]; n[c] = (n[c] || 0) + 1;
    return { id: LETTER[c] + n[c], colour: c, capacity: b.capacity, x: b.x, y: b.y, angle: b.angle, _s: b.id };
  });
  const byS = Object.fromEntries(buses.map((b) => [b._s, b]));
  // planned clearing order: any free bus, at random
  const left = new Set(buses.map((b) => b._s));
  const order = [];
  while (left.size) {
    const free = [...left].filter((s) => !map[s].some((o) => left.has(o)));
    const s = free[Math.floor(r() * free.length)];
    order.push(byS[s]); left.delete(s);
  }
  // write the queue: bays hold at most T.use buses in the plan
  const bays = [];
  const queue = [];
  let tick = 0;
  const emit = (partial) => {
    const colour = bays[Math.floor(r() * bays.length)].colour;
    const bus = bays.filter((b) => b.colour === colour).sort((a, b) => a.at - b.at)[0];
    const k = partial && bus.left > 1 ? 1 + Math.floor(r() * (bus.left - 1)) : bus.left;
    for (let i = 0; i < k; i++) queue.push(colour);
    bus.left -= k;
    if (!bus.left) bays.splice(bays.indexOf(bus), 1);
  };
  for (const b of order) {
    while (bays.length >= T.use) emit(r() < T.split);
    bays.push({ colour: b.colour, left: b.capacity, at: ++tick });
    if (r() < T.eager) emit(r() < T.split);
  }
  while (bays.length) emit(r() < T.split * 0.5);
  // mystery buses: blocked ones, centre column first (as in the reference)
  if (T.mys) {
    const blocked = buses.filter((b) => map[b._s].length > 0);
    const pool = shuffle(r, blocked.slice()).sort((a, b) => (a.angle % 180 === 0 ? 0 : 1) - (b.angle % 180 === 0 ? 0 : 1));
    for (const b of pool.slice(0, T.mys)) b.mystery = true;
  }
  for (const b of buses) delete b._s;
  return { park: { w: p.w, h: p.h }, queue, buses, plan: order.map((b) => b.id) };
}

export function design(id, names, prev = null, tries = 120) {
  const T = TARGETS[id];
  let best = null;
  for (let seed = 1; seed <= tries; seed++) {
    const r = rng(id * 7919 + seed * 104729);
    const c = candidate(T, r);
    if (!c) continue;
    const level = { id, name: names[id], loopCapacity: 24, park: c.park, queue: c.queue, buses: c.buses };
    const res = analyseLevel(level);
    const probs = levelProblems(res);
    if (process.env.DEBUG) console.log(id, seed, probs.join("; "), "careful", res.winRate, res.ms + "ms");
    if (probs.length) continue;
    if (id <= 2 && res.BP > 2) continue;
    // never easier than the level before on any dial
    if (prev && (res.metrics.blocked < prev.metrics.blocked || res.BP < prev.BP || res.metrics.people < prev.metrics.people || res.metrics.D < Math.min(prev.metrics.D, 4) || res.winRate > prev.winRate + 0.05)) continue;
    const score = Math.abs(res.winRate - T.win);
    if (!best || score < best.score) best = { level, res, seed, score };
    if (score < 0.03) break;
  }
  return best;
}

function format(level) {
  const head = JSON.stringify({ id: level.id, name: level.name, loopCapacity: level.loopCapacity, park: level.park });
  const lines = [
    "{",
    `  "id": ${level.id},`,
    `  "name": ${JSON.stringify(level.name)},`,
    `  "loopCapacity": ${level.loopCapacity},`,
    `  "park": ${JSON.stringify(level.park).replace(/,/g, ", ").replace(/:/g, ": ")},`,
    `  "queue": [${level.queue.map((c) => JSON.stringify(c)).join(", ")}],`,
    `  "buses": [`,
    level.buses.map((b) => "    " + JSON.stringify(b).replace(/,"/g, ', "').replace(/":/g, '": ')).join(",\n"),
    "  ]",
    "}",
  ];
  void head;
  return lines.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = JSON.parse(readFileSync(new URL("levels/index.json", ROOT), "utf8"));
  const names = Object.fromEntries(index.map((e) => [e.id, e.name]));
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  const list = ids.length ? ids : Object.keys(TARGETS).map(Number);
  let prev = list[0] > 1 ? analyseLevel(loadLevel(list[0] - 1)) : null;
  for (const id of list) {
    const t0 = Date.now();
    const d = design(id, names, prev);
    if (!d) { console.log(`L${id}: no design found`); continue; }
    writeFileSync(new URL(`levels/${String(id).padStart(2, "0")}.json`, ROOT), format(d.level));
    prev = d.res;
    const m = d.res.metrics;
    console.log(`L${id} seed=${d.seed} B=${m.B} blocked=${m.blocked} D=${m.D} C=${m.C} people=${m.people} BP=${d.res.BP} Mys=${m.Mys} careful=${Math.round(d.res.winRate * 100)}% dead=${d.res.badStart.length}/${d.res.badStart.length + d.res.goodStart.length} ${Date.now() - t0}ms`);
  }
}
