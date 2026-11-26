import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, applyMove, settle } from "../js/game.js";
import { loadLevel, placeBus } from "./helpers.mjs";

test("start of level 1: all nine people walk the ring (it holds 24), nobody boards", () => {
  const s = initialState(loadLevel(1));
  assert.equal(s.loopCapacity, 24);
  assert.equal(s.loop.length, 9);
  assert.equal(s.queue.length, 0);
  assert.deepEqual(s.bays, [null, null, null, null, null]);
  assert.equal(s.parked.length, 3);
});

test("level 1: sending r1 boards the three reds at the front, then r1 departs", () => {
  const r = applyMove(initialState(loadLevel(1)), "r1");
  assert.deepEqual(r.events.filter((e) => e.type === "board").map((e) => e.colour), ["red", "red", "red"]);
  assert.ok(r.events.some((e) => e.type === "depart" && e.busId === "r1"));
  assert.deepEqual(r.state.bays, [null, null, null, null, null]);
  assert.equal(r.state.loop[0], "yellow"); // a yellow is at the front now
  assert.deepEqual(r.state.departed, ["r1"]);
});

test("there is no overtaking: settle stops at the first person without a bus", () => {
  const s = { loopCapacity: 6, tick: 0, queue: [], loop: ["blue", "red", "red"], parked: [], departed: [], lost: null, bays: [null, null, null, null, null] };
  placeBus(s, { id: "r", colour: "red", capacity: 3 }, 0);
  const { events } = settle(s);
  assert.deepEqual(events, []);
  assert.deepEqual(s.loop, ["blue", "red", "red"]);
  assert.equal(s.bays[0].filled, 0);
});

test("FIFO: with two red buses in bays, the earlier arrival is filled first", () => {
  const s = { loopCapacity: 6, tick: 0, queue: [], loop: ["red", "red"], parked: [], departed: [], lost: null, bays: [null, null, null, null, null] };
  placeBus(s, { id: "late", colour: "red", capacity: 3 }, 0);
  s.bays[0].arrivedAt = 5;
  placeBus(s, { id: "early", colour: "red", capacity: 3 }, 3);
  s.bays[3].arrivedAt = 2;
  settle(s);
  assert.equal(s.bays[3].filled, 2);
  assert.equal(s.bays[0].filled, 0);
});
