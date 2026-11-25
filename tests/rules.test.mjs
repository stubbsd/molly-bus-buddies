import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, applyMove, legalMoves, tapProblem, isWon, isStuck, isUnblocked, peopleMatchSeats } from "../js/game.js";
import { loadLevel, allLevels } from "./helpers.mjs";

test("a blocked bus is not a legal move; an unblocked bus into a free bay is", () => {
  const s = initialState(loadLevel(2));
  assert.equal(tapProblem(s, "y2"), "blocked");
  assert.equal(tapProblem(s, "y1"), null);
  assert.ok(!legalMoves(s).some((b) => b.id === "y2"));
  assert.throws(() => applyMove(s, "y2"));
});

test("on level 2, y1 leaving RC0 makes y2 at RC1 unblocked", () => {
  let s = initialState(loadLevel(2));
  s = applyMove(s, "y1").state;
  const y2 = s.parked.find((b) => b.id === "y2");
  assert.ok(isUnblocked(y2, s.parked));
  assert.equal(tapProblem(s, "y2"), null);
});

test("an unblocked bus with no free bay is not a move", () => {
  const s = initialState(loadLevel(4));
  let t = s;
  for (const id of ["r1", "r2", "r3", "y1", "y2"]) t = applyMove(t, id).state;
  assert.equal(tapProblem(t, "b1"), "noBay");
});

test("win is detected only when queue, loop, bays and car park are all empty", () => {
  let s = initialState(loadLevel(1));
  assert.equal(isWon(s), false);
  for (const id of ["r1", "y1"]) { s = applyMove(s, id).state; assert.equal(isWon(s), false); }
  s = applyMove(s, "y2").state;
  assert.equal(isWon(s), true);
  assert.equal(isWon({ ...s, parked: [{ id: "x", colour: "red", capacity: 3, slot: "LW0" }] }), false);
  assert.equal(isWon({ ...s, loop: ["red"] }), false);
});

test("stuck predicate: true for the official level-4 trap, false at level 1 start", () => {
  let s = initialState(loadLevel(4));
  for (const id of ["r1", "r2", "r3", "y1", "y2"]) s = applyMove(s, id).state;
  assert.deepEqual(s.bays.map((b) => b.id), ["r1", "r2", "r3", "y1", "y2"]);
  assert.deepEqual(s.loop, Array(6).fill("blue"));
  assert.ok(s.parked.some((b) => b.id === "b1"));
  assert.equal(isStuck(s), true);
  assert.equal(isStuck(initialState(loadLevel(1))), false);
});

test("people counts equal seats on every shipped level", () => {
  for (const l of allLevels()) assert.ok(peopleMatchSeats(l), `level ${l.id}`);
});
