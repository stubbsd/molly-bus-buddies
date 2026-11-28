import { test } from "node:test";
import assert from "node:assert/strict";
import { readText, loadCampaign, loadLevel } from "./helpers.mjs";
import {
  initialState, applyMove, createSession, sessionTap, sessionUndo, legalMoves, tapProblem, isWon, isLost, keyOf,
  bayCountOf, occupiedBayCount, sessionTapAt, replayEvents,
} from "../js/game.js";
import { analyseLevel } from "../tools/solve.mjs";
import { BAY_COUNT } from "../js/slots.js";

const levels = loadCampaign();
const metrics = JSON.parse(readText("tools/campaign-metrics.json"));

test("every level has 3 to 5 bays, the number never falls and ends higher than it starts", () => {
  let prev = 0;
  for (const l of levels) {
    assert.ok(Number.isInteger(l.bays) && l.bays >= 3 && l.bays <= BAY_COUNT, `level ${l.id} bays ${l.bays}`);
    assert.ok(l.bays >= prev, `level ${l.id} has fewer bays than the level before`);
    prev = l.bays;
  }
  assert.equal(levels[0].bays, 3);
  assert.equal(levels[levels.length - 1].bays, 5);
  assert.ok(new Set(levels.map((l) => l.bays)).size === 3, "the campaign uses 3, 4 and 5 bays");
});

test("every level keeps a spare bay: the fewest bays it needs is below its bay count", () => {
  for (const l of levels) {
    const m = metrics.find((x) => x.id === l.id);
    assert.equal(m.bays, l.bays);
    assert.ok(m.BP < l.bays, `level ${l.id}: needs ${m.BP} of ${l.bays} bays`);
  }
});

test("a level starts with exactly its own number of empty bays", () => {
  for (const l of levels) {
    const s = initialState(l);
    assert.equal(s.bays.length, l.bays);
    assert.equal(occupiedBayCount(s), 0);
  }
  assert.equal(bayCountOf({}), BAY_COUNT, "data without a count keeps all five");
  assert.equal(bayCountOf({ bays: 1 }), BAY_COUNT);
});

test("several buses can be tapped one after another, each in its own bay at the same time", () => {
  // Level 1 has 3 bays: tap three free buses in a row without waiting for anyone to board.
  const l = loadLevel(1);
  const s = createSession(l);
  const taken = [];
  for (let k = 0; k < 3; k++) {
    const free = legalMoves(s.state);
    assert.ok(free.length > 0, "a free bus is available for tap " + (k + 1));
    const r = sessionTap(s, free[0].id);
    assert.equal(r.moved, true);
    assert.equal(r.lost, false);
    taken.push(r.bay);
  }
  // A bay is reused only once its bus has filled up and left.
  assert.ok(s.state.bays.length === 3);
  assert.ok(taken.every((b) => b >= 0 && b < 3));
});

// Hand-built level: only one red person, so tapped red buses just sit in the bays,
// and greens/blues on the ring find no bus, so nothing can board.
const hand = (bays) => ({
  id: 99, name: "test", bays, loopCapacity: 6, park: { w: 40, h: 10 },
  queue: ["red", ...Array(20).fill("green"), ...Array(4).fill("blue")],
  buses: [
    ...["r1", "r2", "r3", "r4", "r5"].map((id, k) => ({ id, colour: "red", capacity: 4, x: 3 * k + 2, y: 5, angle: 0 })),
    { id: "b1", colour: "blue", capacity: 4, x: 3 * 5 + 2, y: 5, angle: 0 },
    { id: "g1", colour: "green", capacity: 10, x: 3 * 6 + 2, y: 5, angle: 0 },
  ],
});

test("with every bay full and nobody able to board, the next tap loses; Undo takes it back", () => {
  for (const n of [3, 4, 5]) {
    const s = createSession(hand(n));
    assert.equal(s.state.bays.length, n);
    for (let k = 0; k < n; k++) {
      assert.equal(sessionTap(s, "r" + (k + 1)).moved, true, `${n} bays: tap ${k + 1}`);
      assert.equal(isLost(s.state), false);
    }
    assert.equal(occupiedBayCount(s.state), n, "all bays hold a bus at once");
    assert.equal(tapProblem(s.state, "b1"), "full");
    const r = sessionTap(s, "b1");
    assert.equal(r.lost, true);
    assert.ok(isLost(s.state));
    assert.ok(sessionUndo(s));
    assert.equal(isLost(s.state), false);
    assert.equal(occupiedBayCount(s.state), n);
  }
});

test("a bus can wait in every bay at the same time and each is filled independently", () => {
  // two red buses and two yellow buses out together; people board whichever matches
  const l = {
    id: 99, name: "test", bays: 4, loopCapacity: 8, park: { w: 40, h: 10 },
    queue: ["red", "yellow", "red", "yellow", "red", "yellow", "red", "yellow"],
    buses: [
      { id: "r1", colour: "red", capacity: 4, x: 2, y: 5, angle: 0 },
      { id: "y1", colour: "yellow", capacity: 4, x: 5, y: 5, angle: 0 },
    ],
  };
  let st = initialState(l);
  const r1 = applyMove(st, "r1");
  assert.equal(r1.events.filter((e) => e.type === "board").length, 4, "reds board straight away");
  st = r1.state;
  const y1 = applyMove(st, "y1");
  assert.equal(y1.events.filter((e) => e.type === "board" && e.colour === "yellow").length, 4);
  assert.ok(isWon(y1.state));
});

test("queued taps are deterministic: the same taps give the same state, and Undo steps back one tap at a time", () => {
  for (const id of [1, 20, 60]) {
    const l = loadLevel(id);
    const path = analyseLevel(l, { quick: true }).path.slice(0, 4);
    const run = () => { const s = createSession(l); for (const b of path) sessionTap(s, b); return s; };
    const a = run(), b = run();
    assert.equal(keyOf(a.state), keyOf(b.state));
    const before = keyOf(a.state);
    assert.ok(sessionUndo(a));
    assert.notEqual(keyOf(a.state), before);
    assert.equal(a.undoStack.length, path.length - 1);
  }
});

test("a save made with a different number of bays starts that level fresh", () => {
  const l = loadLevel(30);
  const old = initialState(l);
  old.bays = [null, null, null, null, null, null].slice(0, bayCountOf(l) === 5 ? 4 : 5);
  const s = createSession(l, { state: old, undoStack: [old] });
  assert.equal(s.state.bays.length, l.bays);
  assert.deepEqual(s.undoStack, []);
  const ok = createSession(l, { state: initialState(l), undoStack: [] });
  assert.equal(ok.state.bays.length, l.bays);
});

test("tapping is not gated on animations: tapBus replays the world as shown and never waits", () => {
  const main = readText("js/main.js");
  const tap = main.slice(main.indexOf("function tapBus("), main.indexOf("function showOutOfRoom"));
  const code = tap.split("\n").filter((x) => !x.trim().startsWith("//")).join("\n");
  assert.ok(!/busy\(\)/.test(code), "tapBus must not wait for earlier buses");
  assert.ok(/sessionTapAt\(/.test(code) && /worldNow\(\)/.test(code), "taps settle together with the world on screen");
  const step = main.slice(main.indexOf("function step("), main.indexOf("function draw("));
  assert.ok(!/omega\s*=\s*0|D\.resync/.test(step), "the ring clock never freezes for a bus");
});

test("replaying every settle event from the placed base gives the settled state", () => {
  for (const id of [1, 5, 12, 30]) {
    const l = loadLevel(id);
    const s = createSession(l);
    const first = legalMoves(s.state)[0];
    const r = sessionTapAt(s, first.id, null);
    assert.ok(r.moved);
    assert.deepEqual(replayEvents(r.base, r.events), s.state, `level ${id}`);
  }
});

test("several taps before anyone boards settle together and keep every person", () => {
  const l = loadLevel(1);
  const s = createSession(l);
  const total = (st) => st.queue.length + st.loop.length + st.bays.reduce((n, b) => n + (b ? b.filled : 0), 0)
    + 0;
  const start = s.state.queue.length + s.state.loop.length;
  let world = null, last = null;
  for (const id of ["r1", "r4", "y3"]) {
    last = sessionTapAt(s, id, world);
    assert.ok(last.moved && !last.lost, id);
    world = last.base;
  }
  const boards = last.events.filter((e) => e.type === "board");
  assert.ok(new Set(boards.map((e) => e.bay)).size >= 2, "people board more than one bus");
  assert.ok(total(s.state) <= start && s.undoStack.length === 3);
  const again = createSession(l);
  let w2 = null, l2 = null;
  for (const id of ["r1", "r4", "y3"]) { l2 = sessionTapAt(again, id, w2); w2 = l2.base; }
  assert.deepEqual(again.state, s.state, "deterministic for the same taps");
  sessionUndo(s); sessionUndo(s); sessionUndo(s);
  assert.deepEqual(s.state, initialState(l));
});

test("a tap while every bay is full on screen is refused as busy, nothing changes", () => {
  const l = loadLevel(1);
  const s = createSession(l);
  const full = initialState(l);
  full.bays = full.bays.map((_, i) => ({ id: "x" + i, colour: "red", capacity: 10, filled: 0, arrivedAt: i }));
  const r = sessionTapAt(s, "r1", full);
  assert.equal(r.moved, false);
  assert.equal(r.problem, "busy");
  assert.equal(s.undoStack.length, 0);
});

test("every level is still solvable with its own bay count", () => {
  for (const l of levels) {
    const r = analyseLevel(l, { quick: true });
    assert.ok(r.solvable, `level ${l.id} (${l.bays} bays)`);
  }
});

test("the first level can be won with one bay at a time, but players are free to use several", () => {
  const l = loadLevel(1);
  const m = metrics.find((x) => x.id === 1);
  assert.equal(m.BP, 1);
  assert.ok(l.bays >= 3);
  let st = initialState(l);
  for (const id of m.path) st = applyMove(st, id).state;
  assert.ok(isWon(st));
});
