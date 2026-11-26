import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState, applyMove, legalMoves, tapProblem, isWon, isLost, isStuck, isUnblocked, isRevealed,
  peopleMatchSeats, createSession, sessionTap, sessionUndo, seatsLeft, frontColour,
} from "../js/game.js";
import { SLOTS } from "../js/slots.js";
import { loadLevel, allLevels } from "./helpers.mjs";

// Small hand-built levels so each rule is tested on its own.
const lvl = (queue, buses, loopCapacity = 6) => ({ id: 99, name: "test", loopCapacity, queue, buses });
const bus = (id, colour, slot, capacity = 3, mystery) => ({ id, colour, capacity, slot, ...(mystery ? { mystery: true } : {}) });
const many = (c, n) => Array(n).fill(c);

// ---- 1. roof arrows and blocking ----
test("every slot's roof arrow points towards the road, and the buses in front along it block", () => {
  for (const [id, s] of Object.entries(SLOTS)) {
    assert.ok(id.startsWith("L") ? s.angle > 0 : s.angle < 0, id + " arrow points to the middle road");
    const row = Number(id.slice(2));
    assert.deepEqual(s.exitBlockedBy, Array.from({ length: row }, (_, i) => id.slice(0, 2) + (row - 1 - i)));
  }
});

test("a bus with a bus in front of it on its arrow is blocked: tapping bumps, nothing moves, no undo step", () => {
  const s = createSession(loadLevel(2)); // y2 at LW1 sits behind y1 at LW0
  const before = JSON.stringify(s.state);
  assert.equal(tapProblem(s.state, "y2"), "blocked");
  assert.ok(!legalMoves(s.state).some((b) => b.id === "y2"));
  assert.deepEqual(sessionTap(s, "y2"), { moved: false, problem: "blocked" });
  assert.equal(JSON.stringify(s.state), before);
  assert.equal(s.undoStack.length, 0);
  assert.throws(() => applyMove(s.state, "y2"));
});

test("once the bus in front drives out, the one behind has a clear road", () => {
  let s = initialState(loadLevel(2));
  s = applyMove(s, "y1").state;
  const y2 = s.parked.find((b) => b.id === "y2");
  assert.ok(isUnblocked(y2, s.parked));
  assert.equal(tapProblem(s, "y2"), null);
});

// ---- 2. only the front of the queue boards ----
test("only the person at the front boards: a wrong colour at the front holds everyone up", () => {
  const level = lvl(["yellow", ...many("red", 3), "yellow", "yellow"], [bus("r1", "red", "LW0"), bus("y1", "yellow", "RE0")]);
  let s = initialState(level);
  assert.equal(frontColour(s), "yellow");
  const r = applyMove(s, "r1");
  // three reds are walking right behind the yellow, but nobody may overtake her
  assert.equal(r.events.filter((e) => e.type === "board").length, 0);
  assert.equal(r.state.bays[0].filled, 0);
  assert.deepEqual(r.state.loop, ["yellow", "red", "red", "red", "yellow", "yellow"]);
  // a yellow bus lets the front yellow on; then the reds board in turn
  const r2 = applyMove(r.state, "y1");
  assert.deepEqual(r2.events.filter((e) => e.type === "board").map((e) => e.colour), ["yellow", "red", "red", "red", "yellow", "yellow"]);
  assert.ok(isWon(r2.state));
});

test("people walk onto the circle in queue order, at most loopCapacity at once", () => {
  const level = lvl([...many("red", 6), ...many("blue", 3)], [bus("r1", "red", "LW0", 6), bus("b1", "blue", "RE0")], 4);
  const s = initialState(level);
  assert.deepEqual(s.loop, many("red", 4));
  assert.equal(s.queue.length, 5);
});

// ---- 3. seat countdowns ----
test("the countdown starts at capacity, drops by one per person, and the bus leaves at 0", () => {
  const level = lvl([...many("red", 4), ...many("blue", 6)], [bus("r1", "red", "LW0", 6), bus("b1", "blue", "RE0", 4)]);
  const r = applyMove(initialState(level), "r1");
  const bay = r.state.bays[0];
  assert.equal(bay.capacity, 6);
  assert.equal(seatsLeft(bay), 2); // four reds hopped on
  assert.equal(seatsLeft({ capacity: 6, filled: 0 }), 6);
  const r2 = applyMove(r.state, "b1");
  // four blues fill b1 to 0 and it departs, freeing its bay; r1 still waits on 2
  assert.ok(r2.events.some((e) => e.type === "depart" && e.busId === "b1"));
  assert.equal(r2.state.bays[1], null);
  assert.equal(seatsLeft(r2.state.bays[0]), 2);
});

// ---- 4. mystery buses ----
test("a mystery bus hides its colour until its road is clear, then shows it", () => {
  const level = lvl([...many("red", 3), ...many("blue", 3)], [bus("r1", "red", "LW0"), bus("b1", "blue", "LW1", 3, true)]);
  let s = initialState(level);
  const hidden = s.parked.find((b) => b.id === "b1");
  assert.equal(hidden.mystery, true);
  assert.equal(isRevealed(hidden, s.parked), false);
  assert.equal(isRevealed(s.parked.find((b) => b.id === "r1"), s.parked), true);
  s = applyMove(s, "r1").state;
  assert.equal(isRevealed(s.parked.find((b) => b.id === "b1"), s.parked), true);
  s = applyMove(s, "b1").state;
  assert.ok(isWon(s));
});

test("on every shipped level, mystery buses start hidden and only from level 6", () => {
  for (const l of allLevels()) {
    const s = initialState(l);
    for (const b of s.parked.filter((x) => x.mystery)) {
      assert.ok(l.id >= 6, `level ${l.id} has a mystery bus`);
      assert.equal(isRevealed(b, s.parked), false, `level ${l.id} ${b.id} starts hidden`);
    }
  }
});

// ---- 5. out of room ----
function fiveFullBays() {
  // the front person is green, so nobody can board any of these five buses
  const level = lvl(["green", ...many("red", 15), ...many("blue", 3), "green", "green"], [
    bus("r1", "red", "LW0"), bus("r2", "red", "LC0"), bus("r3", "red", "RC0"),
    bus("r4", "red", "RE0"), bus("r5", "red", "LW1"), bus("b1", "blue", "LC1"), bus("g1", "green", "RC1"),
  ]);
  const s = createSession(level);
  for (const id of ["r1", "r2", "r3", "r4", "r5"]) assert.equal(sessionTap(s, id).moved, true);
  return s;
}

test("five full bays with nobody able to board is the stuck state", () => {
  const s = fiveFullBays();
  assert.ok(s.state.bays.every(Boolean));
  assert.equal(isStuck(s.state), true);
  assert.equal(isLost(s.state), false);
  assert.deepEqual(legalMoves(s.state), []);
  assert.equal(tapProblem(s.state, "b1"), "full");
});

test("sending another bus out when every bay is full loses; the bus stays put and Undo takes it back", () => {
  const s = fiveFullBays();
  const snap = JSON.parse(JSON.stringify(s.state));
  const r = sessionTap(s, "b1");
  assert.equal(r.moved, true);
  assert.equal(r.lost, true);
  assert.equal(isLost(s.state), true);
  assert.deepEqual(s.state.lost, { busId: "b1" });
  assert.ok(s.state.parked.some((b) => b.id === "b1"));
  assert.equal(isWon(s.state), false);
  assert.equal(isStuck(s.state), false);
  assert.equal(tapProblem(s.state, "g1"), "over");
  assert.equal(sessionTap(s, "g1").moved, false);
  assert.ok(sessionUndo(s));
  assert.deepEqual(s.state, snap);
});

test("a blocked bus still only bumps when the bays are full (it is not sent out)", () => {
  const s = fiveFullBays();
  s.state.parked.push({ id: "x", colour: "green", capacity: 3, slot: "RC2", mystery: false });
  assert.equal(tapProblem(s.state, "x"), "blocked");
  assert.equal(sessionTap(s, "x").moved, false);
  assert.equal(isLost(s.state), false);
});

test("win is detected only when queue, loop, bays and car park are all empty", () => {
  let s = initialState(loadLevel(1));
  assert.equal(isWon(s), false);
  for (const id of ["r1", "r2"]) { s = applyMove(s, id).state; assert.equal(isWon(s), false); }
  s = applyMove(s, "y1").state;
  assert.equal(isWon(s), true);
  assert.equal(isWon({ ...s, parked: [{ id: "x", colour: "red", capacity: 3, slot: "LW0" }] }), false);
  assert.equal(isWon({ ...s, loop: ["red"] }), false);
  assert.equal(isWon({ ...s, lost: { busId: "x" } }), false);
});

test("people counts equal seats on every shipped level", () => {
  for (const l of allLevels()) assert.ok(peopleMatchSeats(l), `level ${l.id}`);
});
