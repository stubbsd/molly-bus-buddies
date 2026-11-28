#!/usr/bin/env node
// Dev-only level designer for the packed car park and conveyor boarding.
// Builds a 100-level campaign whose difficulty rises gently, packs it into
// levels/campaign.json, and writes tools/campaign-metrics.json for the tests.
//   node tools/design-levels.mjs            # design any missing levels (resume)
//   node tools/design-levels.mjs --fresh    # redesign all 100
//   node tools/design-levels.mjs 7 8        # only these levels
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { COLOURS } from "../js/slots.js";
import { packedSpaces, chooseArrows } from "./park-layout.mjs";
import { analyseLevel, levelProblems, loadCampaign } from "./solve.mjs";
import { LEVEL_NAMES } from "./level-names.mjs";

const ROOT = new URL("../", import.meta.url);
const LETTER = { red: "r", yellow: "y", blue: "b", green: "g", purple: "p", pink: "k" };
export const LEVEL_COUNT = 100;
// Cap the jam so parked buses stay around 40 px wide on an iPhone SE.
export const MAX_BUSES = 13;

/** Gentle ramp from a 10-bus two-colour starter to a 13-bus six-colour jam. */
export function targetFor(id) {
  const t = (id - 1) / (LEVEL_COUNT - 1);
  const B = id <= 15 ? 10 : id <= 35 ? 11 : id <= 65 ? 12 : 13;
  const C = id <= 2 ? 2 : id <= 22 ? 3 : id <= 45 ? 4 : id <= 70 ? 5 : 6;
  const mys = id < 6 ? 0 : Math.min(1 + Math.floor((id - 6) / 6), Math.max(1, B - 3));
  const caps = id <= 25 ? [8, 10] : id <= 60 ? [6, 8, 10] : [4, 6, 8, 10];
  const free = 0.49;
  const hold = id <= 2 ? 0 : +(0.22 + t * 0.38).toFixed(3);
  const bp = id <= 2 ? [1] : id <= 27 ? [2] : [3];
  // One bay is always spare (BP + 1, at least 3), so several buses can be out at once.
  const bays = Math.max(3, bp[0] + 1);
  const win = +(0.95 - t * 0.50).toFixed(2);
  return { B, C, mys, caps, free, hold, bp, win, bays };
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const packCache = new Map();
function pack(B) { if (!packCache.has(B)) packCache.set(B, packedSpaces(B)); return packCache.get(B); }

/** Build a queue whose colour bands look packed, but (when hold > 0) some of each
 *  colour wait in the feeders, so a bus at the bays may have to sit until another
 *  colour hops on and frees a space on the ring. */
function buildQueue(buses, T, r) {
  const bag = {};
  for (const b of buses) bag[b.colour] = (bag[b.colour] || 0) + b.capacity;
  const colours = Object.keys(bag);
  const cap = 48;
  const hold = T.hold || 0;
  const early = {}, late = {};
  for (const c of colours) {
    const n = bag[c];
    let keep = Math.round(n * (1 - hold));
    if (hold > 0) keep = Math.max(1, Math.min(n - (n > 1 ? 1 : 0), keep));
    else keep = n;
    early[c] = keep; late[c] = n - keep;
  }
  const queue = [];
  const left = (pool) => colours.filter((c) => pool[c] > 0);
  while (left(early).length && queue.length < cap) {
    for (const c of shuffle(r, left(early))) {
      if (queue.length >= cap) break;
      const run = 1 + Math.floor(r() * Math.min(10, early[c], cap - queue.length));
      for (let i = 0; i < run; i++) queue.push(c);
      early[c] -= run;
    }
  }
  const blocks = colours.filter((c) => early[c] + late[c] > 0).map((c) => Array(early[c] + late[c]).fill(c));
  shuffle(r, blocks);
  for (const b of blocks) queue.push(...b);
  return queue;
}

export function candidate(T, r) {
  const p = pack(T.B);
  const arr = chooseArrows(p.list, r, { maxFreeFrac: T.free, minDepth: 2, caps: T.caps }, 600);
  if (!arr) return null;
  const { buses: raw, map } = arr;
  const cols = COLOURS.slice(0, T.C);
  const colours = shuffle(r, raw.map((_, i) => cols[i % T.C]));
  const n = {};
  const buses = raw.map((b, i) => {
    const c = colours[i]; n[c] = (n[c] || 0) + 1;
    return { id: LETTER[c] + n[c], colour: c, capacity: b.capacity, x: b.x, y: b.y, angle: b.angle, _s: b.id };
  });
  const queue = buildQueue(buses, T, r);
  if (T.mys) {
    const blocked = buses.filter((b) => map[b._s].length > 0);
    const pool = shuffle(r, blocked.slice()).sort((a, b) => (a.angle % 180 === 0 ? 0 : 1) - (b.angle % 180 === 0 ? 0 : 1));
    for (const b of pool.slice(0, T.mys)) b.mystery = true;
  }
  for (const b of buses) delete b._s;
  return { park: { w: p.w, h: p.h }, queue, buses };
}

function stageMinBP(id) { return id <= 2 ? 1 : id <= 27 ? 2 : 3; }

function passesPrev(res, prev, T, id, relax = false) {
  if (res.BP < stageMinBP(id)) return false;
  if (!relax && T.bp && !T.bp.includes(res.BP)) return false;
  if (!prev) return true;
  if (res.metrics.B < prev.metrics.B) return false;
  if (res.metrics.C < prev.metrics.C) return false;
  if (res.metrics.Mys < prev.metrics.Mys) return false;
  if (res.BP < prev.BP) return false;
  if (!relax && res.metrics.blocked < prev.metrics.blocked) return false;
  if (res.winRate != null && prev.winRate != null && res.winRate > prev.winRate + 0.08) return false;
  return true;
}

export function design(id, names, prev = null, tries = 48) {
  const T = targetFor(id);
  let best = null;
  for (let seed = 1; seed <= tries; seed++) {
    const r = rng(id * 7919 + seed * 104729);
    const c = candidate(T, r);
    if (!c) continue;
    const level = { id, name: names[id], bays: T.bays, loopCapacity: 48, park: c.park, queue: c.queue, buses: c.buses };
    const res = analyseLevel(level, { quick: true, winGames: 200 });
    const probs = levelProblems(res);
    if (process.env.DEBUG) console.log(id, seed, probs.join("; ") || "ok", "BP", res.BP, "careful", res.winRate, res.ms + "ms");
    if (probs.length) continue;
    if (!passesPrev(res, prev, T, id, prev?._relax)) continue;
    const score = Math.abs((res.winRate ?? T.win) - T.win);
    if (!best || score < best.score) best = { level, res, seed, score };
    if (score < 0.06) break;
  }
  return best;
}

function loadExisting() {
  const file = new URL("levels/campaign.json", ROOT);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(data) ? data : (data.levels || []);
  } catch { return []; }
}

function writeCampaign(levels, metrics) {
  const body = "{\n  \"levels\": [\n" + levels.map((l) => "    " + JSON.stringify(l)).join(",\n") + "\n  ]\n}\n";
  writeFileSync(new URL("levels/campaign.json", ROOT), body);
  if (metrics) writeFileSync(new URL("tools/campaign-metrics.json", ROOT), JSON.stringify(metrics, null, 2) + "\n");
}

function compactRes(res, seed) {
  return {
    id: res.id, seed,
    bays: res.metrics.bays, B: res.metrics.B, blocked: res.metrics.blocked, D: res.metrics.D, C: res.metrics.C,
    people: res.metrics.people, BP: res.BP, Mys: res.metrics.Mys,
    winRate: res.winRate, path: res.path, ms: res.ms,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const ids = args.map(Number).filter(Boolean);
  const names = Object.fromEntries(LEVEL_NAMES.map((name, i) => [i + 1, name]));
  let levels = fresh ? [] : loadExisting();
  const metrics = [];
  const list = ids.length ? ids : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
  let prev = null;
  for (const id of list) {
    const already = !ids.length && !fresh ? levels.find((l) => l.id === id) : null;
    if (already) {
      const res = analyseLevel(already, { quick: true, winGames: 200 });
      prev = res;
      metrics.push(compactRes(res, null));
      console.log(`L${id} kept B=${res.metrics.B} blocked=${res.metrics.blocked} C=${res.metrics.C} people=${res.metrics.people} BP=${res.BP} Mys=${res.metrics.Mys} careful=${Math.round((res.winRate ?? 0) * 100)}%`);
      continue;
    }
    const t0 = Date.now();
    if (!prev && id > 1) {
      const earlier = levels.find((l) => l.id === id - 1);
      if (earlier) prev = analyseLevel(earlier, { quick: true, winGames: 200 });
    }
    const tries = Number(process.env.TRIES) || 80;
    let d = design(id, names, prev, tries);
    if (!d) d = design(id, names, { ...(prev || {}), _relax: true }, tries * 2);
    if (!d) {
      const src = levels.find((l) => l.id === id - 1) || levels[levels.length - 1];
      if (!src) { console.log(`L${id}: no design found`); process.exitCode = 1; continue; }
      const level = JSON.parse(JSON.stringify(src));
      level.id = id;
      level.name = names[id];
      level.bays = targetFor(id).bays;
      const res = analyseLevel(level, { quick: true, winGames: 200 });
      d = { level, res, seed: "plateau-" + src.id, score: 0 };
    }
    levels = levels.filter((l) => l.id !== id).concat([d.level]).sort((a, b) => a.id - b.id);
    prev = d.res;
    metrics.push(compactRes(d.res, d.seed));
    writeCampaign(levels, metrics);
    const m = d.res.metrics;
    console.log(`L${id} seed=${d.seed} B=${m.B} blocked=${m.blocked} D=${m.D} C=${m.C} people=${m.people} BP=${d.res.BP} Mys=${m.Mys} careful=${Math.round(d.res.winRate * 100)}% ${Date.now() - t0}ms`);
  }
  writeCampaign(levels, metrics);
  console.log(`wrote levels/campaign.json (${levels.length} levels)`);
  if (levels.length !== LEVEL_COUNT) process.exitCode = 1;
}
