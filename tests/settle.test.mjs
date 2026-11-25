import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, applyMove, settle, colourCounts } from "../js/game.js";
import { loadLevel, placeBus } from "./helpers.mjs";

test("empty-bay settle on level 1 fills the loop with all 9 people and boards nobody", () => {
  const s = initialState(loadLevel(1));
  assert.equal(s.loop.length, 9);
  assert.equal(s.queue.length, 0);
  assert.deepEqual(s.bays, [null, null, null, null, null]);
  assert.equal(s.parked.length, 3);
});

test("after placing r1 on level 1, 3 reds board, r1 departs and 6 yellows remain on the loop", () => {
  const r = applyMove(initialState(loadLevel(1)), "r1");
  assert.equal(r.events.filter((e) => e.type === "board").length, 3);
  assert.ok(r.events.some((e) => e.type === "depart" && e.busId === "r1"));
  assert.deepEqual(r.state.bays, [null, null, null, null, null]);
  assert.deepEqual(r.state.loop, Array(6).fill("yellow"));
  assert.deepEqual(r.state.departed, ["r1"]);
});

test("a full lap with no matching bay bus keeps the loop multiset and stops", () => {
  const s = initialState(loadLevel(3));
  const bus = { id: "x", colour: "pink", capacity: 3 };
  placeBus(s, bus, 0);
  const before = colourCounts(s.loop);
  const { events } = settle(s);
  assert.deepEqual(colourCounts(s.loop), before);
  assert.equal(events.filter((e) => e.type === "board").length, 0);
  assert.equal(events.filter((e) => e.type === "rotate").length, s.loop.length);
});

test("FIFO: with two red buses in bays, the earlier arrival is filled first", () => {
  const s = {
    loopCapacity: 6, tick: 0, queue: [], loop: ["red", "red"], parked: [], departed: [],
    bays: [null, null, null, null, null],
  };
  placeBus(s, { id: "late", colour: "red", capacity: 3 }, 0); // leftmost, but placed second below
  s.bays[0].arrivedAt = 5;
  placeBus(s, { id: "early", colour: "red", capacity: 3 }, 3);
  s.bays[3].arrivedAt = 2;
  settle(s);
  assert.equal(s.bays[3].filled, 2);
  assert.equal(s.bays[0].filled, 0);
});
