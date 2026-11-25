import { solve, summarizeLevel, initialState, applyMove, legalMoves, keyOf, isWon, isStuck, isSolvable } from "./engine.mjs";
import { LEVELS } from "./levels.mjs";

const id = Number(process.argv[2] || 4);
const level = LEVELS.find((l) => l.id === id);
console.log("Scanning level", level.id, level.name);

const result = solve(level);
const s = summarizeLevel(level, result);
console.log("solvable", s.solvable, "M", s.minMoves, "BP", s.bayPressure, "tempting-on-shortest", s.temptingCount);
console.log("path", result.shortestPath);
console.log("goodStart", result.goodStart, "badStart", result.badStart);

// Full tree: find any dead-end move from a solvable state
const start = initialState(level);
const seen = new Set();
const q = [start];
seen.add(keyOf(start));
let solvableStates = 0, deadEnds = 0, stuckStates = 0;
const samples = [];
while (q.length && seen.size < 200000) {
  const st = q.shift();
  if (isWon(st)) continue;
  const okParent = true; // we only enqueue solvable?
  // We BFS the whole tree from start (includes losing branches)
  const moves = legalMoves(st);
  if (moves.length === 0 && !isWon(st)) {
    stuckStates++;
    continue;
  }
  for (const bus of moves) {
    const next = applyMove(st, bus.id);
    const k = keyOf(next);
    if (seen.has(k)) continue;
    seen.add(k);
    q.push(next);
  }
}
console.log("full tree states", seen.size, "stuck leaves", stuckStates);

// Now only walk solvable states and test children
const seen2 = new Set();
const q2 = [start];
seen2.add(keyOf(start));
const traps = [];
while (q2.length && seen2.size < 200000 && traps.length < 20) {
  const st = q2.shift();
  if (isWon(st)) continue;
  for (const bus of legalMoves(st)) {
    const next = applyMove(st, bus.id);
    const k = keyOf(next);
    const childSolvable = isSolvable(next, 200000);
    if (childSolvable) {
      if (!seen2.has(k)) { seen2.add(k); q2.push(next); }
    } else {
      traps.push({ busId: bus.id, colour: bus.colour, slot: bus.slot, stuck: isStuck(next), bays: next.bays.map((b) => b ? `${b.colour[0]}${b.filled}/${b.capacity}` : "-"), loop: next.loop.map(c=>c[0]).join(""), qlen: next.queue.length, parked: next.parked.map(b=>b.id) });
    }
  }
}
console.log("solvable-region states", seen2.size, "traps found", traps.length);
console.log(JSON.stringify(traps.slice(0, 8), null, 2));
