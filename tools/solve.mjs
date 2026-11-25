#!/usr/bin/env node
// Official solver / validator for Molly's Bus Buddies (SPEC.md §7).
// Node standard library only. Usage:
//   node tools/solve.mjs            # all 12 levels, writes tools/solver-report.md
//   node tools/solve.mjs 5 6        # only these levels, no report written
//   node tools/solve.mjs --json     # also print machine-readable summary
import { readFileSync, writeFileSync } from "node:fs";
import {
  initialState, applyMove, legalMoves, isWon, isStuck, keyOf,
  peopleMatchSeats, queueConflicts, maxBlockingDepth,
} from "../js/game.js";
import { SLOTS, COLOURS, CAPACITIES } from "../js/slots.js";

const ROOT = new URL("../", import.meta.url);
const TIME_BUDGET_MS = 30000;
const STATE_CAP = 2_000_000;

export function loadLevel(id) {
  return JSON.parse(readFileSync(new URL(`levels/${String(id).padStart(2, "0")}.json`, ROOT), "utf8"));
}

export function loadCampaign() {
  const index = JSON.parse(readFileSync(new URL("levels/index.json", ROOT), "utf8"));
  return index.map((e) => loadLevel(e.id));
}

export function validateSchema(level) {
  const errors = [];
  if (!Number.isInteger(level.loopCapacity) || level.loopCapacity < 1) errors.push("loopCapacity must be a positive integer");
  if (!Array.isArray(level.queue)) errors.push("queue must be an array");
  else for (const c of level.queue) if (!COLOURS.includes(c)) errors.push("bad colour " + c);
  const ids = new Set(), slots = new Set();
  for (const b of level.buses || []) {
    if (ids.has(b.id)) errors.push("duplicate bus id " + b.id);
    if (slots.has(b.slot)) errors.push("two buses share slot " + b.slot);
    ids.add(b.id); slots.add(b.slot);
    if (!SLOTS[b.slot]) errors.push("unknown slot " + b.slot);
    if (!COLOURS.includes(b.colour)) errors.push("bad bus colour " + b.colour);
    if (!CAPACITIES.includes(b.capacity)) errors.push("bad capacity " + b.capacity);
  }
  if (!peopleMatchSeats(level)) errors.push("people do not match seats");
  return errors;
}

class MinHeap {
  constructor(less) { this.a = []; this.less = less; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

/** Explore every reachable settled state; returns graph + which states can still win. */
function explore(level) {
  const t0 = Date.now();
  const start = initialState(level);
  const startKey = keyOf(start);
  const nodes = new Map(); // key -> { state, edges: [{busId, key, peak}], depth, prev, prevBus }
  nodes.set(startKey, { state: start, edges: [], depth: 0, prev: null, prevBus: null });
  const order = [startKey];
  let budgetHit = false;
  for (let i = 0; i < order.length; i++) {
    if (Date.now() - t0 > TIME_BUDGET_MS || nodes.size > STATE_CAP) { budgetHit = true; break; }
    const node = nodes.get(order[i]);
    for (const bus of legalMoves(node.state)) {
      const r = applyMove(node.state, bus.id);
      const k = keyOf(r.state);
      node.edges.push({ busId: bus.id, key: k, peak: r.peak });
      if (!nodes.has(k)) {
        nodes.set(k, { state: r.state, edges: [], depth: node.depth + 1, prev: order[i], prevBus: bus.id });
        order.push(k);
      }
    }
  }
  // Backward induction: a state can win if it is won or any edge leads to a winnable state.
  const winnable = new Set();
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i]; const n = nodes.get(k);
    if (isWon(n.state)) { winnable.add(k); continue; }
    // BFS order is not topological for DAG back-edges, so iterate to a fixed point below.
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const k of order) {
      if (winnable.has(k)) continue;
      if (nodes.get(k).edges.some((e) => winnable.has(e.key))) { winnable.add(k); changed = true; }
    }
  }
  return { start, startKey, nodes, order, winnable, budgetHit, ms: Date.now() - t0 };
}

function pathTo(nodes, key) {
  const path = [];
  for (let k = key; nodes.get(k).prev !== null; k = nodes.get(k).prev) path.push(nodes.get(k).prevBus);
  return path.reverse();
}

/** Minimax path: minimal peak bay occupancy over winning paths (ties by fewer moves). */
function bayPressure(g) {
  const best = new Map([[g.startKey, { peak: 0, moves: 0, prev: null, bus: null }]]);
  const heap = new MinHeap((a, b) => a.peak < b.peak || (a.peak === b.peak && a.moves < b.moves));
  heap.push({ key: g.startKey, peak: 0, moves: 0 });
  while (heap.size) {
    const cur = heap.pop();
    const rec = best.get(cur.key);
    if (cur.peak > rec.peak || (cur.peak === rec.peak && cur.moves > rec.moves)) continue;
    const node = g.nodes.get(cur.key);
    if (isWon(node.state)) {
      const path = [];
      for (let k = cur.key; best.get(k).prev !== null; k = best.get(k).prev) path.push(best.get(k).bus);
      return { bp: cur.peak, path: path.reverse() };
    }
    for (const e of node.edges) {
      const peak = Math.max(cur.peak, e.peak), moves = cur.moves + 1;
      const p = best.get(e.key);
      if (!p || peak < p.peak || (peak === p.peak && moves < p.moves)) {
        best.set(e.key, { peak, moves, prev: cur.key, bus: e.busId });
        heap.push({ key: e.key, peak, moves });
      }
    }
  }
  return { bp: null, path: [] };
}

export function analyseLevel(level) {
  const schemaErrors = validateSchema(level);
  const metrics = {
    C: new Set(level.queue).size,
    B: level.buses.length,
    D: maxBlockingDepth(level.buses),
    Q: queueConflicts(level.queue),
    people: level.queue.length,
    loop: level.loopCapacity,
  };
  if (schemaErrors.length) return { id: level.id, name: level.name, schemaErrors, metrics, solvable: false };
  const g = explore(level);
  // BFS order means the first won state found is a shortest win.
  const winKey = g.order.find((k) => isWon(g.nodes.get(k).state)) ?? null;
  const solvable = winKey !== null;
  const shortestPath = solvable ? pathTo(g.nodes, winKey) : [];
  const M = solvable ? shortestPath.length : null;
  const { bp, path: bpPath } = solvable ? bayPressure(g) : { bp: null, path: [] };

  // Tempting wrong moves: from start or any state on the shortest path.
  const tempting = [];
  if (solvable) {
    const keysOnPath = [g.startKey];
    { let k = g.startKey; for (const id of shortestPath) { k = g.nodes.get(k).edges.find((e) => e.busId === id).key; keysOnPath.push(k); } }
    keysOnPath.forEach((k, i) => {
      for (const e of g.nodes.get(k).edges) {
        if (!g.winnable.has(e.key)) {
          tempting.push({ prefix: shortestPath.slice(0, i), busId: e.busId, stuckImmediately: isStuck(g.nodes.get(e.key).state) });
        }
      }
    });
  }
  const startMoves = g.nodes.get(g.startKey).edges;
  return {
    id: level.id, name: level.name, schemaErrors, metrics,
    solvable, M, shortestPath, BP: bp, bpPath, tempting,
    goodStart: startMoves.filter((e) => g.winnable.has(e.key)).map((e) => e.busId),
    badStart: startMoves.filter((e) => !g.winnable.has(e.key)).map((e) => e.busId),
    states: g.nodes.size, ms: g.ms, budgetHit: g.budgetHit,
  };
}

const KEYS = ["C", "B", "D", "BP", "Q", "M"];
const metricsOf = (r) => ({ C: r.metrics.C, B: r.metrics.B, D: r.metrics.D, BP: r.BP, Q: r.metrics.Q, M: r.M });

/** SPEC.md §5.5 campaign rule between consecutive levels. Returns list of problems. */
export function campaignProblems(results) {
  const problems = [];
  for (let i = 1; i < results.length; i++) {
    const a = metricsOf(results[i - 1]), b = metricsOf(results[i]);
    const up = KEYS.filter((k) => b[k] > a[k]);
    const down = KEYS.filter((k) => b[k] < a[k]);
    const n = results[i].id;
    if (up.length === 0) problems.push(`level ${n}: no metric rises above level ${n - 1}`);
    if (down.length > 1) problems.push(`level ${n}: more than one metric drops (${down.join(", ")})`);
    if ((down.includes("C") || down.includes("B")) && !(b.M >= a.M && up.length > 0)) problems.push(`level ${n}: C or B drops without compensation`);
  }
  for (const r of results) {
    if (r.id <= 2 && r.BP !== 1) problems.push(`level ${r.id}: must keep BP = 1`);
    if (r.id === 1 && r.badStart.length) problems.push("level 1: every opening bus must lead to a win");
  }
  return problems;
}

export function levelProblems(r) {
  const p = [...r.schemaErrors.map((e) => `level ${r.id}: ${e}`)];
  if (r.budgetHit) p.push(`level ${r.id}: search budget exceeded`);
  if (!r.solvable) p.push(`level ${r.id}: unsolvable`);
  else if (r.M !== r.metrics.B) p.push(`level ${r.id}: M (${r.M}) does not equal B (${r.metrics.B})`);
  if (r.id >= 4 && r.solvable && r.tempting.length === 0) p.push(`level ${r.id}: no tempting wrong move`);
  return p;
}

function report(results, problems, tunings) {
  const now = new Date();
  const when = now.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" });
  let md = `# Solver report\n\nGenerated by \`node tools/solve.mjs\` on ${when} (Europe/London). Rules: SPEC.md §4.3–§4.9, metrics §5.5.\n\n`;
  md += `**Result:** ${problems.length ? "FAIL" : "PASS"} — ${results.filter((r) => r.solvable).length}/${results.length} levels solvable.\n\n`;
  md += "| Lv | Name | C | B | D | BP | Q | M | People | Loop | Tempting wrong moves | States | ms |\n|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
  for (const r of results) {
    md += `| ${r.id} | ${r.name} | ${r.metrics.C} | ${r.metrics.B} | ${r.metrics.D} | ${r.BP ?? "–"} | ${r.metrics.Q} | ${r.M ?? "–"} | ${r.metrics.people} | ${r.metrics.loop} | ${r.tempting?.length ?? 0} | ${r.states ?? "–"} | ${r.ms ?? "–"} |\n`;
  }
  md += "\n## Per level\n";
  for (const r of results) {
    md += `\n### Level ${r.id} — ${r.name}\n\n`;
    md += `- Solvable: **${r.solvable ? "yes" : "NO"}**\n`;
    if (r.solvable) {
      md += `- Minimum moves M = ${r.M}; shortest path: \`${r.shortestPath.join(", ")}\`\n`;
      md += `- Bay pressure BP = ${r.BP}; path achieving it: \`${r.bpPath.join(", ")}\`\n`;
      md += `- Good opening buses: ${r.goodStart.join(", ") || "none"}; dead-end openings: ${r.badStart.join(", ") || "none"}\n`;
      if (r.id >= 4) {
        if (r.tempting.length) {
          const t = r.tempting.find((x) => x.stuckImmediately) || r.tempting[0];
          md += `- Tempting wrong move: after \`${t.prefix.join(", ") || "(start)"}\`, sending **${t.busId}** leaves the level unwinnable; stuck prompt immediately: ${t.stuckImmediately ? "yes" : "no (it appears a move or two later)"}. Total found: ${r.tempting.length}.\n`;
        } else md += "- Tempting wrong move: **NONE FOUND (failure)**\n";
      }
    }
  }
  md += "\n## Campaign rule\n\n" + (problems.length ? problems.map((p) => `- ${p}`).join("\n") : "All checks pass: every level raises at least one of C, B, D, BP, Q, M; no level drops more than one metric; levels 1–2 have BP = 1; every opening bus on level 1 wins; M = B everywhere; levels 4–12 each have a tempting wrong move.") + "\n";
  md += "\n## Tunings applied to the designed data (SPEC.md §7.4)\n\n" + tunings + "\n";
  return md;
}

const TUNINGS_FILE = new URL("tools/tunings.md", ROOT);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ids = args.map(Number).filter(Boolean);
  const all = loadCampaign();
  const levels = ids.length ? all.filter((l) => ids.includes(l.id)) : all;
  const results = [];
  for (const level of levels) {
    const r = analyseLevel(level);
    results.push(r);
    const t = r.tempting?.find((x) => x.stuckImmediately) || r.tempting?.[0];
    console.log(`L${String(r.id).padStart(2)} ${r.name.padEnd(22)} solvable=${r.solvable} M=${r.M} BP=${r.BP} C=${r.metrics.C} B=${r.metrics.B} D=${r.metrics.D} Q=${r.metrics.Q} loop=${r.metrics.loop} tempting=${r.tempting?.length ?? 0}${t ? ` e.g. [${t.prefix.join(",")}] -> ${t.busId}` : ""} states=${r.states} ${r.ms}ms`);
  }
  const problems = [...results.flatMap(levelProblems), ...(ids.length ? [] : campaignProblems(results))];
  if (!ids.length) {
    let tunings = "None.";
    try { tunings = readFileSync(TUNINGS_FILE, "utf8").trim(); } catch {}
    writeFileSync(new URL("tools/solver-report.md", ROOT), report(results, problems, tunings));
    console.log("wrote tools/solver-report.md");
  }
  if (args.includes("--json")) console.log(JSON.stringify(results.map(({ id, M, BP, metrics, tempting }) => ({ id, M, BP, ...metrics, tempting: tempting?.length })), null, 1));
  if (problems.length) { console.error("PROBLEMS:\n" + problems.map((p) => "  - " + p).join("\n")); process.exit(1); }
  console.log("All checks pass.");
}
