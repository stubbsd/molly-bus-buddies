import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, sessionTap, sessionUndo, sessionRestart, initialState, keyOf } from "../js/game.js";
import { loadLevel } from "./helpers.mjs";

test("a legal move grows the undo stack by one; a shake does not", () => {
  const s = createSession(loadLevel(2));
  assert.equal(sessionTap(s, "y2").moved, false);
  assert.equal(s.undoStack.length, 0);
  assert.equal(sessionTap(s, "y1").moved, true);
  assert.equal(s.undoStack.length, 1);
});

test("undo restores the exact previous queue, loop, bays and parked set", () => {
  const s = createSession(loadLevel(4));
  for (const id of ["r1", "r2"]) sessionTap(s, id);
  const snap = JSON.parse(JSON.stringify(s.state));
  sessionTap(s, "r3");
  assert.notEqual(keyOf(s.state), keyOf(snap));
  assert.ok(sessionUndo(s));
  assert.deepEqual(s.state, snap);
});

test("after undo, a different legal bus can be sent (level-4 trap recovery)", () => {
  const s = createSession(loadLevel(4));
  for (const id of ["r1", "r2", "r3", "y1", "y2"]) sessionTap(s, id);
  sessionUndo(s);
  assert.equal(sessionTap(s, "b1").moved, true);
  assert.equal(sessionTap(s, "y2").moved, true);
  assert.equal(s.state.parked.length, 0);
});

test("undo on an empty stack does nothing", () => {
  const s = createSession(loadLevel(1));
  const k = keyOf(s.state);
  assert.equal(sessionUndo(s), false);
  assert.equal(keyOf(s.state), k);
});

test("restart helper resets to the initial settled state and clears the stack", () => {
  const level = loadLevel(3);
  const s = createSession(level);
  sessionTap(s, "r1"); sessionTap(s, "y1");
  sessionRestart(s);
  assert.equal(s.undoStack.length, 0);
  assert.deepEqual(s.state, initialState(level));
});

test("a saved session (as stored in localStorage) resumes exactly", () => {
  const level = loadLevel(5);
  const s = createSession(level);
  sessionTap(s, "r1");
  const stored = JSON.parse(JSON.stringify({ state: s.state, undoStack: s.undoStack }));
  const r = createSession(level, stored);
  assert.deepEqual(r.state, s.state);
  assert.ok(sessionUndo(r));
  assert.deepEqual(r.state, initialState(level));
});
