import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, applyMove, settle } from "../js/game.js";
import { analyseLevel } from "../tools/solve.mjs";
import { loadLevel, placeBus } from "./helpers.mjs";

test("start of level 1: the ring fills up to loopCapacity, feeders hold the rest, nobody boards yet", () => {
  const l = loadLevel(1);
  const s = initialState(l);
  assert.equal(s.loopCapacity, 48);
  assert.equal(s.loop.length, 48);
  assert.equal(s.queue.length, l.queue.length - 48);
  assert.equal(s.loop[0], l.queue[0], "the first person in line stands at the pickup");
  assert.deepEqual(s.bays, [null, null, null, null, null]);
  assert.equal(s.parked.length, l.buses.length);
});

test("level 1: the first move of the solution lets the matching front people board", () => {
  const l = loadLevel(1);
  const first = analyseLevel(l).path[0];
  const s = initialState(l);
  const r = applyMove(s, first);
  const boards = r.events.filter((e) => e.type === "board");
  assert.ok(boards.length > 0);
  assert.ok(boards.every((e) => e.colour === l.buses.find((b) => b.id === first).colour));
  assert.ok(boards.length <= l.buses.find((b) => b.id === first).capacity);
});

test("a person at the pickup with no bus carries on; the next person may then board", () => {
  const s = { loopCapacity: 6, tick: 0, queue: [], loop: ["blue", "red", "red"], parked: [], departed: [], lost: null, bays: [null, null, null, null, null] };
  placeBus(s, { id: "r", colour: "red", capacity: 3 }, 0);
  const { events } = settle(s);
  assert.deepEqual(events.filter((e) => e.type === "board").map((e) => e.colour), ["red", "red"]);
  assert.ok(events.some((e) => e.type === "skip" && e.n >= 1));
  assert.deepEqual(s.loop, ["blue"]);
  assert.equal(s.bays[0].filled, 2);
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
