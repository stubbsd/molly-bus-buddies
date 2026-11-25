import { test } from "node:test";
import assert from "node:assert/strict";
import { readText, loadLevel } from "./helpers.mjs";
import { SLOTS, COLOURS } from "../js/slots.js";
import { queueConflicts, maxBlockingDepth, peopleMatchSeats } from "../js/game.js";
import { analyseLevel, campaignProblems, levelProblems } from "../tools/solve.mjs";

const index = JSON.parse(readText("levels/index.json"));
const levels = index.map((e) => loadLevel(e.id));
// Shipped metrics (SPEC.md §6.2, with the level 5 and 12 tunings recorded in tools/solver-report.md).
const EXPECTED = {
  1: { C: 2, B: 3, D: 0, Q: 0 }, 2: { C: 2, B: 4, D: 1, Q: 0 }, 3: { C: 3, B: 5, D: 1, Q: 2 },
  4: { C: 3, B: 6, D: 2, Q: 2 }, 5: { C: 3, B: 6, D: 2, Q: 4 }, 6: { C: 4, B: 7, D: 2, Q: 4 },
  7: { C: 4, B: 8, D: 2, Q: 5 }, 8: { C: 4, B: 9, D: 3, Q: 6 }, 9: { C: 5, B: 10, D: 3, Q: 6 },
  10: { C: 5, B: 11, D: 3, Q: 7 }, 11: { C: 6, B: 12, D: 4, Q: 8 }, 12: { C: 6, B: 14, D: 4, Q: 8 },
};

test("index lists 12 levels in order with names", () => {
  assert.deepEqual(index.map((e) => e.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const e of index) assert.ok(typeof e.name === "string" && e.name.length > 0);
});

for (const l of levels) {
  test(`level ${l.id} matches the schema`, () => {
    assert.equal(l.name, index[l.id - 1].name);
    assert.ok(Number.isInteger(l.loopCapacity) && l.loopCapacity > 0);
    if (l.id >= 5) assert.ok(l.loopCapacity <= 8);
    assert.ok(l.queue.every((c) => COLOURS.includes(c)));
    const ids = new Set(), slots = new Set();
    for (const b of l.buses) {
      assert.ok(!ids.has(b.id), "unique id " + b.id); ids.add(b.id);
      assert.ok(!slots.has(b.slot), "unique slot " + b.slot); slots.add(b.slot);
      assert.ok(SLOTS[b.slot], "official slot " + b.slot);
      assert.ok(COLOURS.includes(b.colour));
      assert.ok([3, 4, 6].includes(b.capacity));
    }
    assert.ok(peopleMatchSeats(l));
    const m = { C: new Set(l.queue).size, B: l.buses.length, D: maxBlockingDepth(l.buses), Q: queueConflicts(l.queue) };
    assert.deepEqual(m, EXPECTED[l.id]);
  });
}

test("official solver: every level solvable, M = B, traps on 4–12, campaign rule holds", () => {
  const results = levels.map(analyseLevel);
  assert.deepEqual(results.flatMap(levelProblems), []);
  assert.deepEqual(campaignProblems(results), []);
});
