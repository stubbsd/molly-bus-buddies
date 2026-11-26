#!/usr/bin/env node
// Dev-only level designer for the v2 rules. Seeded random search: builds car parks
// to a target shape, writes a queue from a plan that respects blocking, then keeps a
// candidate only if the official solver (tools/solve.mjs) says it meets the targets.
//   node tools/design-levels.mjs            # design all 12, write levels/*.json
//   node tools/design-levels.mjs 7 8        # only these levels
import { writeFileSync, readFileSync } from "node:fs";
import { SLOTS, COLOURS } from "../js/slots.js";
import { analyseLevel, levelProblems } from "./solve.mjs";

const ROOT = new URL("../", import.meta.url);
// C colours, B buses, D blocking depth, mys mystery buses, bp bays needed at once,
// caps allowed capacities, loop people on the circle at once.
export const TARGETS = {
  1: { C: 2, B: 3, D: 0, mys: 0, bp: [1], caps: [3], loop: 6 },
  2: { C: 2, B: 4, D: 1, mys: 0, bp: [1], caps: [3], loop: 6 },
  3: { C: 3, B: 5, D: 1, mys: 0, bp: [2], caps: [3, 4], loop: 6 },
  4: { C: 3, B: 6, D: 2, mys: 0, bp: [2], caps: [3, 4], loop: 6 },
  5: { C: 3, B: 7, D: 2, mys: 0, bp: [2, 3], caps: [3, 4, 6], loop: 6 },
  6: { C: 4, B: 8, D: 2, mys: 1, bp: [3], caps: [3, 4, 6], loop: 6 },
  7: { C: 4, B: 9, D: 3, mys: 1, bp: [3], caps: [3, 4, 6], loop: 6 },
  8: { C: 4, B: 10, D: 3, mys: 2, bp: [3], caps: [3, 4, 6], loop: 6 },
  9: { C: 5, B: 11, D: 3, mys: 2, bp: [3, 4], caps: [3, 4, 6], loop: 6 },
  10: { C: 5, B: 12, D: 4, mys: 3, bp: [4], caps: [3, 4, 6], loop: 6 },
  11: { C: 6, B: 13, D: 4, mys: 3, bp: [4], caps: [3, 4, 6], loop: 6 },
  12: { C: 6, B: 14, D: 4, mys: 4, bp: [4], caps: [3, 4, 6], loop: 6 },
};
const COLS = ["LW", "LC", "RC", "RE"];
const LETTER = { red: "r", yellow: "y", blue: "b", green: "g", purple: "p", pink: "k" };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function candidate(id, T, r) {
  // Column heights: contiguous from the road, tallest = D + 1.
  let heights;
  for (let tries = 0; ; tries++) {
    heights = [0, 0, 0, 0];
    heights[Math.floor(r() * 4)] = T.D + 1;
    let left = T.B - (T.D + 1);
    while (left > 0) {
      const c = Math.floor(r() * 4);
      if (heights[c] < Math.min(5, T.D + 1)) { heights[c]++; left--; }
      if (heights.every((h) => h >= Math.min(5, T.D + 1))) break;
    }
    if (left === 0 && heights.reduce((a, b) => a + b, 0) === T.B) break;
    if (tries > 50) return null;
  }
  const slots = [];
  heights.forEach((h, c) => { for (let row = 0; row < h; row++) slots.push(COLS[c] + row); });
  const colours = COLOURS.slice(0, T.C);
  const busColours = shuffle(r, [...colours, ...Array.from({ length: T.B - T.C }, () => pick(r, colours))]);
  const counts = {};
  const buses = slots.map((slot, i) => {
    const colour = busColours[i];
    counts[colour] = (counts[colour] || 0) + 1;
    return { id: LETTER[colour] + counts[colour], colour, capacity: pick(r, T.caps), slot };
  });
  // Mystery buses only in blocked rows.
  const blocked = buses.filter((b) => Number(b.slot.slice(2)) >= 1);
  for (const b of shuffle(r, blocked.slice()).slice(0, T.mys)) b.mystery = true;
  if (buses.filter((b) => b.mystery).length !== T.mys) return null;
  // Plan: a random exit order that respects blocking; up to `width` buses loading at once.
  const width = pick(r, T.bp);
  const order = [];
  const done = new Set();
  while (order.length < buses.length) {
    const free = buses.filter((b) => !done.has(b.id) && SLOTS[b.slot].exitBlockedBy.every((s) => !buses.some((o) => o.slot === s && !done.has(o.id))));
    const b = pick(r, free); order.push(b); done.add(b.id);
  }
  const queue = [];
  const active = [];
  let next = 0;
  while (next < order.length || active.length) {
    while (active.length < width && next < order.length) { const b = order[next++]; active.push({ colour: b.colour, left: b.capacity }); }
    const a = active[r() < 0.6 ? 0 : Math.floor(r() * active.length)];
    const n = Math.min(a.left, 1 + Math.floor(r() * 3));
    for (let i = 0; i < n; i++) queue.push(a.colour);
    a.left -= n;
    if (a.left === 0) active.splice(active.indexOf(a), 1);
  }
  return { id, loopCapacity: T.loop, queue, buses };
}

export function design(id, names, maxTries = 4000) {
  const T = TARGETS[id];
  for (let seed = 1; seed <= maxTries; seed++) {
    const r = rng(id * 100003 + seed);
    const c = candidate(id, T, r);
    if (!c) continue;
    const level = { id, name: names[id], ...c };
    const res = analyseLevel(level);
    if (levelProblems(res).length) continue;
    if (!T.bp.includes(res.BP) || res.metrics.D !== T.D) continue;
    if (id === 1 && res.badStart.length) continue;
    // Keep early levels kind: few dead-end openings.
    if (id <= 3 && res.badStart.length) continue;
    // Later levels: more than one way to go wrong, including from the very first move.
    if (id >= 8 && res.tempting.length < 3) continue;
    if (id >= 10 && res.badStart.length < 1) continue;
    return { level, res, seed };
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = JSON.parse(readFileSync(new URL("levels/index.json", ROOT), "utf8"));
  const names = Object.fromEntries(index.map((e) => [e.id, e.name]));
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  for (const id of ids.length ? ids : Object.keys(TARGETS).map(Number)) {
    const t0 = Date.now();
    const d = design(id, names);
    if (!d) { console.log(`L${id}: no design found`); continue; }
    const json = JSON.stringify({ id, name: names[id], loopCapacity: d.level.loopCapacity, queue: d.level.queue, buses: d.level.buses }, null, 2)
      .replace(/"queue": \[[\s\S]*?\]/, (m) => m.replace(/\s+/g, " ").replace("[ ", "[").replace(" ]", "]"))
      .replace(/\{\s+"id": "([^"]+)",\s+"colour": "([^"]+)",\s+"capacity": (\d+),\s+"slot": "([^"]+)"(,\s+"mystery": true)?\s+\}/g,
        (_, i, c, cap, s, m) => `{"id": "${i}", "colour": "${c}", "capacity": ${cap}, "slot": "${s}"${m ? ', "mystery": true' : ""}}`);
    writeFileSync(new URL(`levels/${String(id).padStart(2, "0")}.json`, ROOT), json + "\n");
    console.log(`L${id} seed=${d.seed} BP=${d.res.BP} D=${d.res.metrics.D} Mys=${d.res.metrics.Mys} tempting=${d.res.tempting.length} badStart=${d.res.badStart.length} states=${d.res.states} ${Date.now() - t0}ms`);
  }
}
