import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState, applyMove, legalMoves, tapProblem, isWon, isLost, isStuck, isUnblocked, isRevealed,
  peopleMatchSeats, createSession, sessionTap, sessionUndo, seatsLeft, frontColour, parkedFromLevel,
} from "../js/game.js";
import { BUS, lenOf, blocks, blockerMap, overlaps, busCorners, sweepCorners, peel, firstOverlap } from "../js/park.js";
import { loadLevel, allLevels } from "./helpers.mjs";

// Small hand-built levels so each rule is tested on its own. Positions are in level
// units; angle is degrees clockwise from up (the roof arrow).
const lvl = (queue, buses, loopCapacity = 6) => ({ id: 99, name: "test", loopCapacity, park: { w: 40, h: 10 }, queue, buses });
const bus = (id, colour, x, y = 5, angle = 0, capacity = 4, mystery) => ({ id, colour, capacity, x, y, angle, ...(mystery ? { mystery: true } : {}) });
const many = (c, n) => Array(n).fill(c);
// far apart, all facing up: every one free
const apart = (k) => 3 * k + 2;

// ---- 1. roof arrows and blocking (real shapes) ----
test("a bus is blocked exactly when another bus touches the strip ahead of its arrow", () => {
  const a = bus("a", "red", 5, 5, 0);
  const ahead = bus("b", "red", 5, 5 - BUS.len - 0.12, 0); // nose to tail in front
  const behind = bus("c", "red", 5, 5 + BUS.len + 0.12, 0);
  const beside = bus("d", "red", 5 + BUS.wid + 0.12, 5, 0); // side by side, a small gap
  const farAhead = bus("e", "red", 5, -20, 90); // crossways, far up the road
  assert.equal(blocks(ahead, a), true);
  assert.equal(blocks(behind, a), false);
  assert.equal(blocks(beside, a), false);
  assert.equal(blocks(farAhead, a), true, "the strip runs all the way out");
  assert.equal(blocks(a, ahead), false);
  // turning a round changes who is in its way
  const turned = { ...a, angle: 180 };
  assert.equal(blocks(behind, turned), true);
  assert.equal(blocks(ahead, turned), false);
  // diagonal: the strip at 64 degrees clips a bus offset along it
  const d = bus("f", "red", 0, 0, 64);
  const ux = Math.sin((64 * Math.PI) / 180), uy = -Math.cos((64 * Math.PI) / 180);
  assert.equal(blocks(bus("g", "red", ux * 3, uy * 3, 0), d), true);
  assert.equal(blocks(bus("h", "red", -ux * 3, -uy * 3, 0), d), false);
});

test("touching is not overlapping, and longer buses carry more seats", () => {
  const a = bus("a", "red", 0, 0, 0), b = bus("b", "red", BUS.wid, 0, 0);
  assert.equal(overlaps(busCorners(a), busCorners(b)), false);
  assert.ok(lenOf({ capacity: 4 }) < lenOf({ capacity: 6 }) && lenOf({ capacity: 6 }) < lenOf({ capacity: 8 }) && lenOf({ capacity: 8 }) < lenOf({ capacity: 10 }));
  assert.equal(sweepCorners(a).length, 4);
});

test("the rules engine uses the same geometry: blockers come from the shapes", () => {
  for (const l of allLevels()) {
    const map = blockerMap(l.buses);
    const parked = parkedFromLevel(l);
    for (const b of parked) {
      assert.deepEqual(b.blockers, map[b.id]);
      const geom = l.buses.every((o) => o.id === b.id || !blocks(o, b));
      assert.equal(isUnblocked(b, parked), geom, `level ${l.id} ${b.id}`);
      // without the cached list the engine works it out from the shapes directly
      const { blockers, ...plain } = b;
      assert.equal(isUnblocked(plain, parked), geom);
    }
  }
});

test("a blocked bus bumps: nothing moves and there is no undo step", () => {
  const level = lvl(many("red", 8), [bus("r1", "red", 5, 3), bus("r2", "red", 5, 3 + BUS.len + 0.12)]);
  const s = createSession(level);
  const before = JSON.stringify(s.state);
  assert.equal(tapProblem(s.state, "r2"), "blocked");
  assert.ok(!legalMoves(s.state).some((b) => b.id === "r2"));
  assert.deepEqual(sessionTap(s, "r2"), { moved: false, problem: "blocked" });
  assert.equal(JSON.stringify(s.state), before);
  assert.equal(s.undoStack.length, 0);
  assert.throws(() => applyMove(s.state, "r2"));
  // once the bus in front has gone, the one behind has a clear road
  assert.equal(sessionTap(s, "r1").moved, true);
  assert.equal(tapProblem(s.state, "r2"), null);
});

test("every shipped car park: no overlaps, can be cleared, most buses start blocked", () => {
  for (const l of allLevels()) {
    assert.equal(firstOverlap(l.buses), null, `level ${l.id} overlap`);
    const { layers, stuck } = peel(l.buses);
    assert.deepEqual(stuck, [], `level ${l.id} can be cleared`);
    assert.ok((l.buses.length - layers[0].length) * 2 > l.buses.length, `level ${l.id}: most start blocked`);
  }
});

// ---- 2. boarding is from the bottom pickup ----
test("the person at the pickup boards; if they have no bus they carry on and the next person gets a turn", () => {
  const level = lvl(["yellow", ...many("red", 4), "yellow", "yellow", "yellow"], [bus("r1", "red", apart(0)), bus("y1", "yellow", apart(1))]);
  const s = initialState(level);
  assert.equal(frontColour(s), "yellow");
  const r = applyMove(s, "r1");
  // yellow at the bottom has no red bus, so she goes round; the four reds hop on and r1 leaves
  assert.deepEqual(r.events.filter((e) => e.type === "board").map((e) => e.colour), ["red", "red", "red", "red"]);
  assert.ok(r.events.some((e) => e.type === "skip" && e.n >= 1));
  assert.ok(r.events.some((e) => e.type === "depart" && e.busId === "r1"));
  assert.equal(r.state.loop[0], "yellow");
  const r2 = applyMove(r.state, "y1");
  assert.deepEqual(r2.events.filter((e) => e.type === "board").map((e) => e.colour), ["yellow", "yellow", "yellow", "yellow"]);
  assert.ok(isWon(r2.state));
});

test("people walk onto the circle in queue order, at most loopCapacity at once", () => {
  const level = lvl([...many("red", 6), ...many("blue", 4)], [bus("r1", "red", apart(0), 5, 0, 6), bus("b1", "blue", apart(1))], 4);
  const s = initialState(level);
  assert.deepEqual(s.loop, many("red", 4));
  assert.equal(s.queue.length, 6);
});

// ---- 3. seat countdowns ----
test("the countdown starts at capacity, drops by one per person, and the bus leaves at 0", () => {
  const level = lvl([...many("red", 4), ...many("blue", 4)], [bus("r1", "red", apart(0), 5, 0, 6), bus("b1", "blue", apart(1), 5, 0, 4)]);
  const r = applyMove(initialState(level), "r1");
  const bay = r.state.bays[0];
  assert.equal(bay.id, "r1");
  assert.equal(bay.capacity, 6);
  assert.equal(seatsLeft(bay), 2); // four reds hopped on; no more reds, so it stays
  const r2 = applyMove(r.state, "b1");
  assert.ok(r2.events.some((e) => e.type === "depart" && e.busId === "b1"));
  assert.equal(r2.state.bays[0].id, "r1");
  assert.equal(seatsLeft(r2.state.bays[0]), 2);
});

// ---- 4. mystery buses ----
test("a mystery bus hides its colour until its road is clear, then shows it", () => {
  const level = lvl([...many("red", 4), ...many("blue", 4)], [bus("r1", "red", 5, 3), bus("b1", "blue", 5, 3 + BUS.len + 0.12, 0, 4, true)]);
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

test("on every shipped level, mystery buses start hidden, from level 6 on", () => {
  for (const l of allLevels()) {
    const s = initialState(l);
    const mys = s.parked.filter((x) => x.mystery);
    if (l.id < 6) assert.equal(mys.length, 0, `level ${l.id}`);
    else assert.ok(mys.length > 0, `level ${l.id} has mystery buses`);
    for (const b of mys) assert.equal(isRevealed(b, s.parked), false, `level ${l.id} ${b.id} starts hidden`);
  }
});

// ---- 5. out of room ----
function fiveFullBays() {
  // One red boards the first red bus; the other four sit empty. The greens and
  // blues on the ring go all the way round without a matching bus, so the five
  // bays stay full and the level is stuck.
  const level = lvl(["red", ...many("green", 20), ...many("blue", 4)], [
    ...["r1", "r2", "r3", "r4", "r5"].map((id, k) => bus(id, "red", apart(k))),
    bus("b1", "blue", apart(5)), bus("g1", "green", apart(6), 5, 0, 20),
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
  const g1 = s.state.parked.find((b) => b.id === "g1");
  s.state.parked.push({ id: "x", colour: "green", capacity: 4, x: g1.x, y: g1.y + BUS.len + 0.12, angle: 0, mystery: false });
  assert.equal(tapProblem(s.state, "x"), "blocked");
  assert.equal(sessionTap(s, "x").moved, false);
  assert.equal(isLost(s.state), false);
});

test("win is detected only when queue, loop, bays and car park are all empty", () => {
  const level = lvl([...many("red", 4), ...many("yellow", 4)], [bus("r1", "red", apart(0)), bus("y1", "yellow", apart(1))]);
  let s = initialState(level);
  assert.equal(isWon(s), false);
  s = applyMove(s, "r1").state; assert.equal(isWon(s), false);
  s = applyMove(s, "y1").state; assert.equal(isWon(s), true);
  assert.equal(isWon({ ...s, parked: [bus("x", "red", 1)] }), false);
  assert.equal(isWon({ ...s, loop: ["red"] }), false);
  assert.equal(isWon({ ...s, lost: { busId: "x" } }), false);
});

test("people counts equal seats on every shipped level", () => {
  for (const l of allLevels()) assert.ok(peopleMatchSeats(l), `level ${l.id}`);
});
