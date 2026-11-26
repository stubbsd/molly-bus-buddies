import { test } from "node:test";
import assert from "node:assert/strict";
import { readText, loadLevel } from "./helpers.mjs";
import { COLOURS, CAPACITIES } from "../js/slots.js";
import { peopleMatchSeats, blockedAtStart } from "../js/game.js";
import { firstOverlap, busCorners } from "../js/park.js";
import { analyseLevel, campaignProblems, levelProblems } from "../tools/solve.mjs";

const index = JSON.parse(readText("levels/index.json"));
const levels = index.map((e) => loadLevel(e.id));
// Shipped v3 campaign: buses, buses blocked at the start, colours, mystery buses,
// people, and BP (fewest bays needed at once).
const EXPECTED = {"1":{"B":10,"blocked":6,"C":2,"Mys":0,"people":88,"BP":1},"2":{"B":11,"blocked":7,"C":2,"Mys":0,"people":88,"BP":1},"3":{"B":14,"blocked":9,"C":3,"Mys":0,"people":118,"BP":2},"4":{"B":16,"blocked":12,"C":3,"Mys":0,"people":118,"BP":2},"5":{"B":18,"blocked":12,"C":3,"Mys":0,"people":120,"BP":2},"6":{"B":20,"blocked":13,"C":4,"Mys":2,"people":138,"BP":3},"7":{"B":22,"blocked":16,"C":4,"Mys":3,"people":166,"BP":4},"8":{"B":24,"blocked":19,"C":4,"Mys":4,"people":166,"BP":4},"9":{"B":27,"blocked":19,"C":5,"Mys":5,"people":204,"BP":4},"10":{"B":30,"blocked":22,"C":5,"Mys":6,"people":232,"BP":4},"11":{"B":33,"blocked":23,"C":6,"Mys":7,"people":242,"BP":4},"12":{"B":36,"blocked":28,"C":6,"Mys":8,"people":256,"BP":4}};

test("index lists 12 levels in order with names", () => {
  assert.deepEqual(index.map((e) => e.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const e of index) assert.ok(typeof e.name === "string" && e.name.length > 0);
});

for (const l of levels) {
  test(`level ${l.id} matches the schema and its car park fits inside its frame`, () => {
    assert.equal(l.name, index[l.id - 1].name);
    assert.ok(Number.isInteger(l.loopCapacity) && l.loopCapacity > 0);
    assert.ok(l.park.w > 0 && l.park.h > 0);
    assert.ok(l.queue.every((c) => COLOURS.includes(c)));
    const ids = new Set();
    for (const b of l.buses) {
      assert.ok(!ids.has(b.id), "unique id " + b.id); ids.add(b.id);
      assert.ok(COLOURS.includes(b.colour));
      assert.ok(CAPACITIES.includes(b.capacity));
      if ("mystery" in b) assert.equal(b.mystery, true);
      for (const p of busCorners(b)) assert.ok(p.x >= -0.01 && p.y >= -0.01 && p.x <= l.park.w + 0.01 && p.y <= l.park.h + 0.01, `${b.id} inside the frame`);
    }
    assert.equal(firstOverlap(l.buses), null);
    assert.ok(peopleMatchSeats(l));
    const m = { B: l.buses.length, blocked: blockedAtStart(l.buses), C: new Set(l.queue).size, Mys: l.buses.filter((b) => b.mystery).length, people: l.queue.length };
    const { BP, ...rest } = EXPECTED[l.id];
    assert.deepEqual(m, rest);
  });
}

test("official solver: every level solvable (replayed with the real engine), difficulty only rises", () => {
  const results = levels.map(analyseLevel);
  assert.deepEqual(results.flatMap(levelProblems), []);
  assert.deepEqual(campaignProblems(results), []);
  assert.deepEqual(results.map((r) => r.BP), levels.map((l) => EXPECTED[l.id].BP));
  assert.ok(results.every((r) => r.BP <= 4), "a spare bay is always possible");
  assert.ok(results.every((r) => r.replayOk));
  // a jam: from 10 buses on level 1 to 36 on level 12, most of them blocked
  assert.equal(results[0].metrics.B, 10);
  assert.equal(results[11].metrics.B, 36);
  assert.ok(results.every((r) => r.metrics.blocked * 2 > r.metrics.B));
  // a careful but short-sighted player finds the last level much harder than the first
  assert.ok(results[0].winRate > 0.9 && results[11].winRate < 0.25);
});
