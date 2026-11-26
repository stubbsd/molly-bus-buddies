import { test } from "node:test";
import assert from "node:assert/strict";
import { readText, loadLevel } from "./helpers.mjs";
import { SLOTS, COLOURS } from "../js/slots.js";
import { maxBlockingDepth, peopleMatchSeats } from "../js/game.js";
import { analyseLevel, campaignProblems, levelProblems } from "../tools/solve.mjs";

const index = JSON.parse(readText("levels/index.json"));
const levels = index.map((e) => loadLevel(e.id));
// Shipped metrics for the v2 campaign (colours, buses, blocking depth, mystery buses).
const EXPECTED = {
  1: { C: 2, B: 3, D: 0, Mys: 0 }, 2: { C: 2, B: 4, D: 1, Mys: 0 }, 3: { C: 3, B: 5, D: 1, Mys: 0 },
  4: { C: 3, B: 6, D: 2, Mys: 0 }, 5: { C: 3, B: 7, D: 2, Mys: 0 }, 6: { C: 4, B: 8, D: 2, Mys: 1 },
  7: { C: 4, B: 9, D: 3, Mys: 1 }, 8: { C: 4, B: 10, D: 3, Mys: 2 }, 9: { C: 5, B: 11, D: 3, Mys: 2 },
  10: { C: 5, B: 12, D: 4, Mys: 3 }, 11: { C: 6, B: 13, D: 4, Mys: 3 }, 12: { C: 6, B: 14, D: 4, Mys: 4 },
};
const EXPECTED_BP = [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4];

test("index lists 12 levels in order with names", () => {
  assert.deepEqual(index.map((e) => e.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const e of index) assert.ok(typeof e.name === "string" && e.name.length > 0);
});

for (const l of levels) {
  test(`level ${l.id} matches the schema`, () => {
    assert.equal(l.name, index[l.id - 1].name);
    assert.ok(Number.isInteger(l.loopCapacity) && l.loopCapacity > 0);
    assert.equal(l.loopCapacity, 24); // the ring holds eight ranks of three
    assert.ok(l.queue.every((c) => COLOURS.includes(c)));
    const ids = new Set(), slots = new Set();
    for (const b of l.buses) {
      assert.ok(!ids.has(b.id), "unique id " + b.id); ids.add(b.id);
      assert.ok(!slots.has(b.slot), "unique slot " + b.slot); slots.add(b.slot);
      assert.ok(SLOTS[b.slot], "official slot " + b.slot);
      assert.ok(COLOURS.includes(b.colour));
      assert.ok([3, 4, 6].includes(b.capacity));
      if ("mystery" in b) assert.equal(b.mystery, true);
    }
    assert.ok(peopleMatchSeats(l));
    const m = { C: new Set(l.queue).size, B: l.buses.length, D: maxBlockingDepth(l.buses), Mys: l.buses.filter((b) => b.mystery).length };
    assert.deepEqual(m, EXPECTED[l.id]);
  });
}

test("official solver: every level solvable under the v2 rules, M = B, traps on 4–12, difficulty only rises", () => {
  const results = levels.map(analyseLevel);
  assert.deepEqual(results.flatMap(levelProblems), []);
  assert.deepEqual(campaignProblems(results), []);
  assert.deepEqual(results.map((r) => r.BP), EXPECTED_BP);
  assert.ok(results.every((r) => r.BP <= 4), "a spare bay is always possible");
  for (const r of results.filter((x) => x.id <= 3)) assert.deepEqual(r.badStart, [], `level ${r.id} has no dead-end opening`);
  for (const r of results.filter((x) => x.id >= 8)) assert.ok(r.tempting.length >= 3, `level ${r.id} has several tempting wrong moves`);
});
