#!/usr/bin/env node
// Official solver / validator for Molly's Bus Buddies (v3 car park: packed jam,
// blocking from the buses' real shapes in js/park.js; v6 conveyor boarding:
// the person at the bottom of the ring hops on if a matching bay bus has a seat,
// otherwise they carry on round).
//
// Boarding is still deterministic, but the ring can reorder as people pass the
// pickup, so a state keeps the ring itself (not only a queue index). Search is
// depth-first with a dead-state memo; moves try a bus the pickup person can use
// first. Bay pressure BP is found by running it with 1, 2, 3 ... bays allowed.
// Node standard library only. Usage:
//   node tools/solve.mjs            # the whole campaign, writes tools/solver-report.md
//   node tools/solve.mjs 5 6        # only these levels, no report written
import { readFileSync, writeFileSync } from "node:fs";
import { initialState, applyMove, isWon, peopleMatchSeats, queueConflicts, isUnblocked } from "../js/game.js";
import { COLOURS, CAPACITIES, BAY_COUNT } from "../js/slots.js";
import { blockerMap, peel, firstOverlap } from "../js/park.js";

const ROOT = new URL("../", import.meta.url);
const NODE_BUDGET = 400_000;

export function loadCampaign() {
  const data = JSON.parse(readFileSync(new URL("levels/campaign.json", ROOT), "utf8"));
  return Array.isArray(data) ? data : data.levels;
}

export function loadLevel(id) {
  const l = loadCampaign().find((x) => x.id === id);
  if (!l) throw new Error("level " + id + " missing");
  return l;
}

export function validateSchema(level) {
  const errors = [];
  if (!Number.isInteger(level.loopCapacity) || level.loopCapacity < 1) errors.push("loopCapacity must be a positive integer");
  if (!level.park || !(level.park.w > 0) || !(level.park.h > 0)) errors.push("park needs a positive w and h");
  if (!Array.isArray(level.queue)) errors.push("queue must be an array");
  else for (const c of level.queue) if (!COLOURS.includes(c)) errors.push("bad colour " + c);
  const ids = new Set();
  for (const b of level.buses || []) {
    if (ids.has(b.id)) errors.push("duplicate bus id " + b.id);
    ids.add(b.id);
    if (!COLOURS.includes(b.colour)) errors.push("bad bus colour " + b.colour);
    if (!CAPACITIES.includes(b.capacity)) errors.push("bad capacity " + b.capacity);
    if (![b.x, b.y, b.angle].every(Number.isFinite)) errors.push("bad position on " + b.id);
    if ("mystery" in b && typeof b.mystery !== "boolean") errors.push("mystery must be true/false on " + b.id);
  }
  const ov = firstOverlap(level.buses || []);
  if (ov) errors.push(`buses ${ov[0]} and ${ov[1]} overlap`);
  const map = blockerMap(level.buses || []);
  for (const b of level.buses || []) if (b.mystery && map[b.id].length === 0) errors.push(`mystery bus ${b.id} starts unblocked`);
  if (!peopleMatchSeats(level)) errors.push("people do not match seats");
  return errors;
}

// ---------------- fast model ----------------

export function model(level) {
  const buses = level.buses;
  const idx = Object.fromEntries(buses.map((b, i) => [b.id, i]));
  const map = blockerMap(buses);
  const col = Object.fromEntries(COLOURS.map((c, i) => [c, i]));
  return {
    n: buses.length,
    ids: buses.map((b) => b.id),
    colour: buses.map((b) => col[b.colour]),
    cap: buses.map((b) => b.capacity),
    blockers: buses.map((b) => map[b.id].map((id) => idx[id])),
    queue: level.queue.map((c) => col[c]),
    loopCap: level.loopCapacity,
  };
}

function fillRing(m, s) {
  while (s.loop.length < m.loopCap && s.qpos < m.queue.length) s.loop.push(m.queue[s.qpos++]);
}

export function startState(m) {
  const s = { parked: new Array(m.n).fill(true), bays: [], loop: [], qpos: 0, tick: 0 };
  fillRing(m, s);
  return s;
}

/** Board everyone who can from the pickup, skipping those who must go back round. Mutates. */
function settleFast(m, s) {
  fillRing(m, s);
  if (!s.loop.length) return;
  let checked = 0;
  while (checked < s.loop.length) {
    const c = s.loop[0];
    let best = -1;
    for (let i = 0; i < s.bays.length; i++) if (m.colour[s.bays[i].bus] === c && (best < 0 || s.bays[i].at < s.bays[best].at)) best = i;
    if (best < 0) {
      s.loop.push(s.loop.shift());
      checked++;
      continue;
    }
    const b = s.bays[best];
    b.filled++;
    s.loop.shift();
    if (b.filled === m.cap[b.bus]) s.bays.splice(best, 1);
    fillRing(m, s);
    checked = 0;
  }
}

const freeBuses = (m, s) => {
  const out = [];
  for (let i = 0; i < m.n; i++) if (s.parked[i] && m.blockers[i].every((j) => !s.parked[j])) out.push(i);
  return out;
};

function move(m, s, i) {
  const t = { parked: s.parked.slice(), bays: s.bays.map((b) => ({ ...b })), loop: s.loop.slice(), qpos: s.qpos, tick: s.tick + 1 };
  t.parked[i] = false;
  t.bays.push({ bus: i, filled: 0, at: t.tick });
  const peak = t.bays.length;
  settleFast(m, t);
  return { t, peak };
}

function keyFast(s) {
  let k = "";
  for (const p of s.parked) k += p ? "1" : "0";
  return k + "|" + s.bays.map((b) => b.bus + ":" + b.filled).join(",") + "|" + s.qpos + "|" + s.loop.join("");
}

const won = (m, s) => s.qpos === m.queue.length && s.loop.length === 0 && s.bays.length === 0 && s.parked.every((p) => !p);

/** Prefer a bus the person at the pickup can use, then colours still on the ring. */
function orderMoves(m, s, free) {
  const pick = s.loop[0];
  const onRing = new Set(s.loop);
  const helps = new Set();
  if (pick !== undefined) {
    for (let i = 0; i < m.n; i++) if (s.parked[i] && m.colour[i] === pick) for (const j of m.blockers[i]) if (s.parked[j]) helps.add(j);
  }
  const score = (i) => (m.colour[i] === pick ? -1000 : 0) + (helps.has(i) ? -100 : 0) + (onRing.has(m.colour[i]) ? -10 : 0);
  return free.slice().sort((a, b) => score(a) - score(b));
}

/** Depth-first search for a win using at most `bayCap` bays at once. */
export function search(m, bayCap = BAY_COUNT, budget = NODE_BUDGET, from = startState(m)) {
  const dead = new Set();
  let nodes = 0, out = false;
  const path = [];
  function dfs(s) {
    if (won(m, s)) return true;
    if (++nodes > budget) { out = true; return false; }
    if (s.bays.length >= bayCap) return false;
    const k = keyFast(s);
    if (dead.has(k)) return false;
    for (const i of orderMoves(m, s, freeBuses(m, s))) {
      const { t, peak } = move(m, s, i);
      if (peak > bayCap) continue;
      path.push(i);
      if (dfs(t)) return true;
      path.pop();
      if (out) return false;
    }
    dead.add(k);
    return false;
  }
  const ok = dfs(from);
  return { ok, path: ok ? path.map((i) => m.ids[i]) : [], nodes, budgetHit: out && !ok };
}

/**
 * A careful but short-sighted player: taps a free bus the person at the pickup can board if
 * there is one, otherwise any free bus, and never taps when the bays are full.
 * Returns the share of games such a player wins.
 */
export function carefulWinRate(m, trials = 400, seed = 1) {
  let r = seed >>> 0;
  const rnd = () => { r = (r + 0x6D2B79F5) >>> 0; let x = r; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let s = startState(m);
    for (;;) {
      if (won(m, s)) { wins++; break; }
      if (s.bays.length >= BAY_COUNT) break;
      const free = freeBuses(m, s);
      if (!free.length) break;
      const pick = s.loop[0];
      const match = free.filter((i) => m.colour[i] === pick || s.bays.some((b) => m.colour[b.bus] === m.colour[i]));
      const pool = free.filter((i) => m.colour[i] === pick).length ? free.filter((i) => m.colour[i] === pick) : match.length && rnd() < 0.5 ? match : free;
      s = move(m, s, pool[Math.floor(rnd() * pool.length)]).t;
    }
  }
  return wins / trials;
}

export function analyseLevel(level, opts = {}) {
  const t0 = Date.now();
  const schemaErrors = validateSchema(level);
  const { layers, stuck } = peel(level.buses);
  const metrics = {
    C: new Set(level.queue).size,
    B: level.buses.length,
    blocked: level.buses.length - (layers[0]?.length ?? 0),
    D: stuck.length ? Infinity : layers.length - 1,
    Q: queueConflicts(level.queue),
    Mys: level.buses.filter((b) => b.mystery).length,
    people: level.queue.length,
  };
  if (schemaErrors.length) return { id: level.id, name: level.name, schemaErrors, metrics, solvable: false, ms: Date.now() - t0 };
  const m = model(level);
  const main = search(m);
  let BP = null, bpPath = [], budgetHit = main.budgetHit, nodes = main.nodes;
  if (main.ok) {
    for (let k = 1; k <= BAY_COUNT; k++) {
      const r = search(m, k);
      nodes += r.nodes;
      if (r.ok) { BP = k; bpPath = r.path; break; }
    }
  }
  // Openings that can no longer be won (within the budget; unknown ones are not counted)
  const badStart = [], goodStart = [];
  if (!opts.quick) {
    const s0 = startState(m);
    for (const i of freeBuses(m, s0)) {
      const r = search(m, BAY_COUNT, 60_000, move(m, s0, i).t);
      nodes += r.nodes;
      if (r.ok) goodStart.push(m.ids[i]); else if (!r.budgetHit) badStart.push(m.ids[i]);
    }
  }
  // replay the found path with the real rules engine to be sure
  let replayOk = false;
  if (main.ok) {
    let st = initialState(level);
    try { for (const id of main.path) st = applyMove(st, id).state; replayOk = isWon(st); } catch { replayOk = false; }
  }
  return {
    id: level.id, name: level.name, schemaErrors, metrics,
    solvable: main.ok && replayOk, replayOk, M: main.ok ? main.path.length : null, shortestPath: main.path, path: main.path,
    BP, bpPath, goodStart, badStart, winRate: opts.quick && !opts.winGames ? null : carefulWinRate(m, opts.winGames || 400), states: nodes, budgetHit, ms: Date.now() - t0,
  };
}

/** Campaign rule between consecutive levels (difficulty only ever rises). */
export function campaignProblems(results) {
  const problems = [];
  for (let i = 1; i < results.length; i++) {
    const a = results[i - 1], b = results[i];
    if (b.metrics.B < a.metrics.B) problems.push(`level ${b.id}: fewer buses than level ${a.id}`);
    if (b.metrics.blocked < a.metrics.blocked) problems.push(`level ${b.id}: fewer blocked buses than level ${a.id}`);
    if (b.metrics.C < a.metrics.C) problems.push(`level ${b.id}: fewer colours than level ${a.id}`);
    if (b.metrics.Mys < a.metrics.Mys) problems.push(`level ${b.id}: fewer mystery buses than level ${a.id}`);
    if (b.BP !== null && a.BP !== null && b.BP < a.BP) problems.push(`level ${b.id}: needs fewer bays at once than level ${a.id}`);
    if (b.winRate > a.winRate + 0.08) problems.push(`level ${b.id}: much easier for a careful player than level ${a.id} (${pct(b.winRate)} vs ${pct(a.winRate)})`);
  }
  for (const r of results) {
    if (r.id <= 5 && r.metrics.Mys > 0) problems.push(`level ${r.id}: no mystery buses before level 6`);
    if (r.id >= 6 && r.metrics.Mys === 0) problems.push(`level ${r.id}: mystery buses from level 6`);
    if (r.id <= 2 && r.BP !== 1) problems.push(`level ${r.id}: early levels should only need one bay at a time (BP = 1)`);
    if (r.id >= 3 && r.BP < 2) problems.push(`level ${r.id}: from level 3 the conveyor should need at least two bays at once`);
  }
  if (results.length >= 2) {
    const first = results[0], last = results[results.length - 1];
    if (last.metrics.B <= first.metrics.B) problems.push("the last level should have more buses than the first");
    if (last.metrics.C < 6) problems.push("the last level should use all six colours");
    if (last.metrics.Mys < 6) problems.push("the last level should have a thicket of mystery buses");
    if ((last.BP ?? 0) < 3) problems.push("the last level should need at least three bays at once");
  }
  return problems;
}

const pct = (x) => `${Math.round(x * 100)}%`;

export function levelProblems(r) {
  const p = [...r.schemaErrors.map((e) => `level ${r.id}: ${e}`)];
  if (r.budgetHit) p.push(`level ${r.id}: search budget exceeded`);
  if (!r.solvable) p.push(`level ${r.id}: unsolvable`);
  if (r.metrics.blocked * 2 <= r.metrics.B) p.push(`level ${r.id}: most buses must start blocked (${r.metrics.blocked}/${r.metrics.B})`);
  if (r.solvable && r.M !== r.metrics.B) p.push(`level ${r.id}: M (${r.M}) does not equal B`);
  if (r.solvable && r.BP > 4) p.push(`level ${r.id}: needs all five bays at once (BP ${r.BP})`);
  return p;
}

function report(results, problems) {
  const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" });
  let md = `# Solver report\n\nGenerated by \`node tools/solve.mjs\` on ${when} (Europe/London). Rules: v3 car park (packed jam, blocking from the buses' real shapes), conveyor boarding (hop on at the bottom of the ring), seat countdowns, mystery buses, out-of-room loss.\n\n`;
  md += "B buses, Blocked = buses that cannot move at the start, D = waves needed to clear the car park, C colours, BP = fewest bays needed at once, Mys mystery buses, Q colour changes in the queue, Careful = share of games won by a careful but short-sighted player (taps a bus the front person can board when there is one, otherwise a random free bus; 400 games), Dead openings = first taps that can no longer be won.\n\n";
  md += `**Result:** ${problems.length ? "FAIL" : "PASS"} — ${results.filter((r) => r.solvable).length}/${results.length} levels solvable (each solution replayed with the real rules engine).\n\n`;
  md += "| Lv | Name | B | Blocked | D | C | People | BP | Mys | Q | Careful | Dead openings | Nodes | ms |\n|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
  for (const r of results) md += `| ${r.id} | ${r.name} | ${r.metrics.B} | ${r.metrics.blocked} | ${r.metrics.D} | ${r.metrics.C} | ${r.metrics.people} | ${r.BP ?? "–"} | ${r.metrics.Mys} | ${r.metrics.Q} | ${pct(r.winRate ?? 0)} | ${r.badStart?.length ?? 0}/${(r.badStart?.length ?? 0) + (r.goodStart?.length ?? 0)} | ${r.states ?? "–"} | ${r.ms} |\n`;
  md += "\n## Per level\n";
  for (const r of results) {
    md += `\n### Level ${r.id} — ${r.name}\n\n- Solvable: **${r.solvable ? "yes" : "NO"}**\n`;
    if (r.solvable) {
      md += `- A solution: \`${r.path.join(", ")}\`\n`;
      md += `- Fewest bays at once BP = ${r.BP}: \`${r.bpPath.join(", ")}\`\n`;
      md += `- Good opening buses: ${r.goodStart.join(", ") || "none"}; dead-end openings: ${r.badStart.join(", ") || "none"}\n`;
    }
  }
  md += "\n## Campaign rule\n\n" + (problems.length ? problems.map((p) => `- ${p}`).join("\n") : "All checks pass: every level is solvable (replayed with the real engine); buses, blocked buses, colours, mystery buses and BP never drop (plateaus are allowed so the 100-level campaign can rise gently); the last level has more buses than the first; most buses start blocked on every level; no mystery buses before level 6 and mystery buses on every level from 6, each starting blocked; no level needs all five bays; a careful player never finds a level much easier than the one before; the last level uses more buses, all six colours, more mystery buses, and higher bay pressure than the first.") + "\n";
  return md;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ids = args.map(Number).filter(Boolean);
  const all = loadCampaign();
  const levels = ids.length ? all.filter((l) => ids.includes(l.id)) : all;
  const results = [];
  for (const level of levels) {
    const r = analyseLevel(level);
    results.push(r);
    console.log(`L${String(r.id).padStart(3)} ${r.name.padEnd(22)} solvable=${r.solvable} B=${r.metrics.B} blocked=${r.metrics.blocked} D=${r.metrics.D} C=${r.metrics.C} people=${r.metrics.people} BP=${r.BP} Mys=${r.metrics.Mys} careful=${pct(r.winRate ?? 0)} dead=${r.badStart?.length}/${(r.badStart?.length ?? 0) + (r.goodStart?.length ?? 0)} nodes=${r.states} ${r.ms}ms`);
  }
  const problems = [...results.flatMap(levelProblems), ...(ids.length ? [] : campaignProblems(results))];
  if (!ids.length) {
    writeFileSync(new URL("tools/solver-report.md", ROOT), report(results, problems));
    const metrics = results.map((r) => ({
      id: r.id, B: r.metrics.B, blocked: r.metrics.blocked, D: r.metrics.D, C: r.metrics.C,
      people: r.metrics.people, BP: r.BP, Mys: r.metrics.Mys, winRate: r.winRate, path: r.path, ms: r.ms,
    }));
    writeFileSync(new URL("tools/campaign-metrics.json", ROOT), JSON.stringify(metrics, null, 2) + "\n");
    console.log("wrote tools/solver-report.md and tools/campaign-metrics.json");
  }
  if (problems.length) { console.error("PROBLEMS:\n" + problems.map((p) => "  - " + p).join("\n")); process.exit(1); }
  console.log("All checks pass.");
}
