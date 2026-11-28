import { test } from "node:test";
import assert from "node:assert/strict";
import { readText, loadCampaign } from "./helpers.mjs";
import { COLOURS, CAPACITIES } from "../js/slots.js";
import { peopleMatchSeats, blockedAtStart, initialState, applyMove, isWon } from "../js/game.js";
import { firstOverlap, busCorners } from "../js/park.js";
import { campaignProblems, levelProblems } from "../tools/solve.mjs";
import { computeLayout, busPos } from "../js/render.js";
import { LEVEL_COUNT } from "../js/storage.js";

const levels = loadCampaign();
const metrics = JSON.parse(readText("tools/campaign-metrics.json"));
const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));

test(`campaign lists ${LEVEL_COUNT} levels in order with names`, () => {
  assert.equal(levels.length, LEVEL_COUNT);
  assert.deepEqual(levels.map((e) => e.id), Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1));
  for (const e of levels) assert.ok(typeof e.name === "string" && e.name.length > 0);
  assert.equal(new Set(levels.map((e) => e.name)).size, LEVEL_COUNT);
});

for (const l of levels) {
  test(`level ${l.id} matches the schema and its car park fits inside its frame`, () => {
    assert.equal(l.name, levels[l.id - 1].name);
    assert.equal(l.loopCapacity, 48);
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
    const m = byId[l.id];
    assert.ok(m, "metrics for " + l.id);
    assert.equal(l.buses.length, m.B);
    assert.equal(blockedAtStart(l.buses), m.blocked);
    assert.equal(new Set(l.queue).size, m.C);
    assert.equal(l.buses.filter((b) => b.mystery).length, m.Mys);
    assert.equal(l.queue.length, m.people);
    assert.ok(l.buses.length <= 13, "bus cap for iPhone tap size");
  });
}

test("parked buses stay tappable on an iPhone SE", () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let minWid = Infinity, minLen = Infinity, at = null;
  for (const l of levels) {
    const L = computeLayout(375, 667, insets, l);
    for (const b of l.buses) {
      const p = busPos(L, b);
      if (p.wid < minWid) { minWid = p.wid; at = `${l.id}:${b.id}`; }
      if (p.len < minLen) minLen = p.len;
    }
  }
  assert.ok(minWid >= 36, `narrowest bus ${minWid.toFixed(1)} px at ${at}`);
  assert.ok(minLen >= 50, `shortest bus ${minLen.toFixed(1)} px`);
});

test("official solutions replay with the real engine, and difficulty only rises", () => {
  const results = levels.map((l) => {
    const m = byId[l.id];
    assert.ok(m && Array.isArray(m.path) && m.path.length === l.buses.length, "path for " + l.id);
    let st = initialState(l);
    for (const id of m.path) st = applyMove(st, id).state;
    assert.ok(isWon(st), "replay wins level " + l.id);
    return {
      id: l.id, name: l.name, schemaErrors: [],
      metrics: { bays: m.bays, B: m.B, blocked: m.blocked, D: m.D, C: m.C, Mys: m.Mys, people: m.people },
      solvable: true, replayOk: true, M: m.path.length, BP: m.BP, winRate: m.winRate,
      budgetHit: false,
    };
  });
  assert.deepEqual(results.flatMap(levelProblems), []);
  assert.deepEqual(campaignProblems(results), []);
  assert.ok(results.every((r) => r.BP <= 4), "a spare bay is always possible");
  assert.equal(results[0].metrics.B, 10);
  assert.equal(results[LEVEL_COUNT - 1].metrics.B, 13);
  assert.ok(results.every((r) => r.metrics.blocked * 2 > r.metrics.B));
  assert.equal(results[0].metrics.C, 2);
  assert.equal(results[LEVEL_COUNT - 1].metrics.C, 6);
  assert.ok(results[LEVEL_COUNT - 1].metrics.Mys >= 6);
  assert.ok(results[LEVEL_COUNT - 1].BP >= 3);
});
