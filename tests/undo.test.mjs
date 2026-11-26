import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, sessionTap, sessionUndo, sessionRestart, initialState, keyOf, isWon } from "../js/game.js";
import { analyseLevel } from "../tools/solve.mjs";
import { loadLevel } from "./helpers.mjs";

test("a legal move grows the undo stack by one; a bump does not", () => {
  const s = createSession(loadLevel(2));
  assert.equal(sessionTap(s, "y2").moved, false);
  assert.equal(s.undoStack.length, 0);
  assert.equal(sessionTap(s, "y1").moved, true);
  assert.equal(s.undoStack.length, 1);
});

test("undo restores the exact previous queue, loop, bays and parked set", () => {
  const level = loadLevel(4);
  const path = analyseLevel(level).shortestPath;
  const s = createSession(level);
  for (const id of path.slice(0, 2)) sessionTap(s, id);
  const snap = JSON.parse(JSON.stringify(s.state));
  sessionTap(s, path[2]);
  assert.notEqual(keyOf(s.state), keyOf(snap));
  assert.ok(sessionUndo(s));
  assert.deepEqual(s.state, snap);
});

test("after a tempting wrong move, undo and the solver's path still wins (level 4 trap recovery)", () => {
  const level = loadLevel(4);
  const r = analyseLevel(level);
  const trap = r.tempting[0];
  const s = createSession(level);
  for (const id of trap.prefix) assert.equal(sessionTap(s, id).moved, true);
  assert.equal(sessionTap(s, trap.busId).moved, true);
  assert.ok(sessionUndo(s));
  for (const id of r.shortestPath.slice(trap.prefix.length)) assert.equal(sessionTap(s, id).moved, true);
  assert.ok(isWon(s.state));
});

test("undo on an empty stack does nothing", () => {
  const s = createSession(loadLevel(1));
  const k = keyOf(s.state);
  assert.equal(sessionUndo(s), false);
  assert.equal(keyOf(s.state), k);
});

test("restart resets to the initial settled state and clears the stack", () => {
  const level = loadLevel(3);
  const s = createSession(level);
  for (const id of analyseLevel(level).shortestPath.slice(0, 2)) sessionTap(s, id);
  sessionRestart(s);
  assert.equal(s.undoStack.length, 0);
  assert.deepEqual(s.state, initialState(level));
});

test("a saved session (as stored in localStorage) resumes exactly, mystery flags included", () => {
  const level = loadLevel(8);
  const s = createSession(level);
  sessionTap(s, analyseLevel(level).shortestPath[0]);
  const stored = JSON.parse(JSON.stringify({ state: s.state, undoStack: s.undoStack }));
  const r = createSession(level, stored);
  assert.deepEqual(r.state, s.state);
  assert.ok(r.state.parked.some((b) => b.mystery));
  assert.ok(sessionUndo(r));
  assert.deepEqual(r.state, initialState(level));
});
