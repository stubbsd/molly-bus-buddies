import { solve, summarizeLevel, initialState, applyMove, legalMoves, occupiedBayCount, isWon, isStuck } from "./engine.mjs";
import { getLevels, LEVELS } from "./levels.mjs";

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const levels = ids.length ? getLevels(ids) : LEVELS;

for (const level of levels) {
  console.log("\n========== LEVEL", level.id, level.name, "==========");
  console.log("people", level.queue.length, "buses", level.buses.length, "loop", level.loopCapacity, "Q", level._conflicts, "D", level._depth);
  const t0 = Date.now();
  const result = solve(level);
  const ms = Date.now() - t0;
  const s = summarizeLevel(level, result);
  console.log("time", ms, "ms", "exp", result.expansions, "states", result.uniqueStatesBfs);
  console.log("solvable", s.solvable, "minMoves", s.minMoves, "BP", s.bayPressure, "tempting", s.temptingCount);
  console.log("metrics C,B,D,BP,Q,M", s.colours, s.buses, s.maxBlockingDepth, s.bayPressure, s.queueOrderConflicts, s.minMoves);
  console.log("path", result.shortestPath);
  console.log("goodStart", result.goodStart);
  console.log("badStart", result.badStart);
  if (result.temptingWrong.length) {
    console.log("tempting sample", JSON.stringify(result.temptingWrong.slice(0, 5), null, 2));
  }
}
