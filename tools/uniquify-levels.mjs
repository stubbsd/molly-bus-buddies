import { writeFileSync, readFileSync } from "node:fs";
import { analyseLevel, levelProblems, campaignProblems } from "./solve.mjs";
import { targetFor } from "./design-levels.mjs";
import { packedSpaces, chooseArrows } from "./park-layout.mjs";
import { COLOURS } from "../js/slots.js";

const LETTER = { red: "r", yellow: "y", blue: "b", green: "g", purple: "p", pink: "k" };
const ROOT = new URL("../", import.meta.url);
const camp = JSON.parse(readFileSync(new URL("levels/campaign.json", ROOT), "utf8"));
const names = Object.fromEntries(camp.levels.map((l) => [l.id, l.name]));

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function buildQueue(buses, hold, r) {
  const bag = {};
  for (const b of buses) bag[b.colour] = (bag[b.colour] || 0) + b.capacity;
  const colours = Object.keys(bag);
  const cap = 48;
  const early = {}, late = {};
  for (const c of colours) {
    const n = bag[c];
    let keep = Math.round(n * (1 - (hold || 0)));
    if (hold > 0) keep = Math.max(1, Math.min(n - (n > 1 ? 1 : 0), keep));
    else keep = n;
    early[c] = keep; late[c] = n - keep;
  }
  const queue = [];
  const left = (pool) => colours.filter((c) => pool[c] > 0);
  while (left(early).length && queue.length < cap) {
    for (const c of shuffle(r, left(early))) {
      if (queue.length >= cap) break;
      const run = 1 + Math.floor(r() * Math.min(8, early[c], cap - queue.length));
      for (let i = 0; i < run; i++) queue.push(c);
      early[c] -= run;
    }
  }
  const blocks = colours.filter((c) => early[c] + late[c] > 0).map((c) => Array(early[c] + late[c]).fill(c));
  shuffle(r, blocks);
  for (const b of blocks) queue.push(...b);
  return queue;
}

function samePuzzle(a, b) {
  if (!a || !b) return false;
  if (a.queue.length !== b.queue.length) return false;
  if (a.queue.some((c, i) => c !== b.queue[i])) return false;
  if (a.buses.length !== b.buses.length) return false;
  return a.buses.every((bus, i) => {
    const o = b.buses[i];
    return bus.x === o.x && bus.y === o.y && bus.angle === o.angle && bus.colour === o.colour && bus.capacity === o.capacity && !!bus.mystery === !!o.mystery;
  });
}

function okWithPrev(res, prev) {
  if (levelProblems(res).length) return false;
  if (!prev) return true;
  if (res.metrics.B < prev.metrics.B) return false;
  if (res.metrics.C < prev.metrics.C) return false;
  if (res.metrics.Mys < prev.metrics.Mys) return false;
  if (res.BP < prev.BP) return false;
  if (res.metrics.blocked < prev.metrics.blocked) return false;
  return true;
}

function candidate(id, r) {
  const T = targetFor(id);
  const p = packedSpaces(T.B);
  const arr = chooseArrows(p.list, r, { maxFreeFrac: 0.49, minDepth: 2, caps: T.caps }, 600);
  if (!arr) return null;
  const cols = COLOURS.slice(0, T.C);
  const colours = shuffle(r, arr.buses.map((_, i) => cols[i % T.C]));
  const n = {};
  const buses = arr.buses.map((b, i) => {
    const c = colours[i]; n[c] = (n[c] || 0) + 1;
    return { id: LETTER[c] + n[c], colour: c, capacity: b.capacity, x: b.x, y: b.y, angle: b.angle, _s: b.id };
  });
  const queue = buildQueue(buses, T.hold, r);
  if (T.mys) {
    const blocked = buses.filter((b) => arr.map[b._s].length > 0);
    const pool = shuffle(r, blocked.slice()).sort((a, b) => (a.angle % 180 === 0 ? 0 : 1) - (b.angle % 180 === 0 ? 0 : 1));
    for (const b of pool.slice(0, T.mys)) b.mystery = true;
  }
  for (const b of buses) delete b._s;
  return { id, name: names[id], loopCapacity: 48, park: { w: p.w, h: p.h }, queue, buses };
}

function variantQueue(src, id, r) {
  const level = JSON.parse(JSON.stringify(src));
  level.id = id;
  level.name = names[id];
  const T = targetFor(id);
  level.queue = buildQueue(level.buses, T.hold || 0.3, r);
  return level;
}

const levels = camp.levels;
const out = [];
const results = [];
for (const level of levels) {
  let cur = level;
  let res = analyseLevel(cur, { quick: true, winGames: 80 });
  const prev = results[results.length - 1] || null;
  const clone = samePuzzle(cur, out[out.length - 1]);
  const bad = !okWithPrev(res, prev) || clone;
  if (bad) {
    let found = null;
    for (let s = 1; s <= 80 && !found; s++) {
      const r = rng(level.id * 13007 + s * 17);
      const c = (s % 3 === 0) ? candidate(level.id, r) : variantQueue(clone || !okWithPrev(res, prev) ? (out[out.length - 1] || cur) : cur, level.id, r);
      if (!c) continue;
      const rr = analyseLevel(c, { quick: true, winGames: 80 });
      if (!okWithPrev(rr, prev)) continue;
      if (samePuzzle(c, out[out.length - 1])) continue;
      found = { level: c, res: rr, how: s % 3 === 0 ? "new" : "queue" };
    }
    if (!found) {
      // last resort: keep previous jam (may be a clone if we cannot uniquify)
      const src = out[out.length - 1];
      const c = JSON.parse(JSON.stringify(src));
      c.id = level.id; c.name = names[level.id];
      found = { level: c, res: analyseLevel(c, { quick: true, winGames: 80 }), how: "clone" };
    }
    cur = found.level;
    res = found.res;
    console.log(`L${level.id} fixed via ${found.how} B=${res.metrics.B} blocked=${res.metrics.blocked} C=${res.metrics.C} BP=${res.BP} Mys=${res.metrics.Mys} people=${res.metrics.people}`);
  } else {
    console.log(`L${level.id} kept B=${res.metrics.B} blocked=${res.metrics.blocked} C=${res.metrics.C} BP=${res.BP} Mys=${res.metrics.Mys}`);
  }
  out.push(cur);
  results.push(res);
}

const problems = campaignProblems(results.map((r) => ({ ...r, schemaErrors: r.schemaErrors || [] })));
const unique = out.reduce((n, l, i) => n + (i === 0 || !samePuzzle(l, out[i - 1]) ? 1 : 0), 0);
console.log("unique-from-prev", unique, "campaign problems", problems);
writeFileSync(new URL("levels/campaign.json", ROOT), "{\n  \"levels\": [\n" + out.map((l) => "    " + JSON.stringify(l)).join(",\n") + "\n  ]\n}\n");
writeFileSync(new URL("tools/campaign-metrics.json", ROOT), JSON.stringify(results.map((r) => ({
  id: r.id, B: r.metrics.B, blocked: r.metrics.blocked, D: r.metrics.D, C: r.metrics.C,
  people: r.metrics.people, BP: r.BP, Mys: r.metrics.Mys, winRate: r.winRate, path: r.path, ms: r.ms,
})), null, 2) + "\n");
console.log("wrote campaign + metrics");
if (problems.length) process.exitCode = 1;
