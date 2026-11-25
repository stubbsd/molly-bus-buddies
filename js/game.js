// Molly's Bus Buddies — official rules (SPEC.md §4). Pure functions, no DOM.
// Shared by the browser game, the solver (tools/solve.mjs) and the tests.
import { SLOTS, BAY_COUNT } from "./slots.js";

// ---------- level helpers ----------

export function colourCounts(arr) {
  const c = {};
  for (const x of arr) c[x] = (c[x] || 0) + 1;
  return c;
}

export function seatCounts(buses) {
  const s = {};
  for (const b of buses) s[b.colour] = (s[b.colour] || 0) + b.capacity;
  return s;
}

export function peopleMatchSeats(level) {
  const q = colourCounts(level.queue);
  const s = seatCounts(level.buses);
  const keys = new Set([...Object.keys(q), ...Object.keys(s)]);
  for (const k of keys) if ((q[k] || 0) !== (s[k] || 0)) return false;
  return true;
}

export function queueConflicts(queue) {
  if (queue.length === 0) return 0;
  let runs = 1;
  for (let i = 1; i < queue.length; i++) if (queue[i] !== queue[i - 1]) runs++;
  return runs - new Set(queue).size;
}

export function maxBlockingDepth(buses) {
  const occ = new Set(buses.map((b) => b.slot));
  let d = 0;
  for (const b of buses) {
    const n = SLOTS[b.slot].exitBlockedBy.filter((s) => occ.has(s)).length;
    if (n > d) d = n;
  }
  return d;
}

// ---------- state ----------

export function clone(state) {
  return {
    loopCapacity: state.loopCapacity,
    tick: state.tick,
    queue: state.queue.slice(),
    loop: state.loop.slice(),
    parked: state.parked.map((b) => ({ ...b })),
    bays: state.bays.map((b) => (b ? { ...b } : null)),
    departed: state.departed.slice(),
  };
}

export function occupiedBayCount(state) {
  let n = 0;
  for (const b of state.bays) if (b) n++;
  return n;
}

/** Bay index of the earliest-arrived bay bus of this colour with a free seat, or -1. */
export function boardingBay(colour, bays) {
  let best = -1;
  for (let i = 0; i < bays.length; i++) {
    const b = bays[i];
    if (b && b.colour === colour && b.filled < b.capacity) {
      if (best < 0 || b.arrivedAt < bays[best].arrivedAt) best = i;
    }
  }
  return best;
}

/**
 * Official deterministic settle (SPEC.md §4.3). Mutates state.
 * Returns { events, peak } where events describe what happened, in order,
 * for animation, and peak is the highest bay occupancy seen during settle.
 */
export function settle(state) {
  const events = [];
  const cap = state.loopCapacity;
  let peak = occupiedBayCount(state);
  for (let guard = 0; guard < 100000; guard++) {
    while (state.loop.length < cap && state.queue.length > 0) {
      const p = state.queue.shift();
      state.loop.push(p);
      events.push({ type: "enter", colour: p });
    }
    peak = Math.max(peak, occupiedBayCount(state));
    if (state.loop.length === 0) return { events, peak };
    let rotated = 0;
    let boarded = false;
    const n = state.loop.length;
    while (rotated < n) {
      const bi = boardingBay(state.loop[0], state.bays);
      if (bi >= 0) {
        const colour = state.loop.shift();
        const bay = state.bays[bi];
        bay.filled += 1;
        events.push({ type: "board", colour, bay: bi, busId: bay.id });
        if (bay.filled >= bay.capacity) {
          state.bays[bi] = null;
          state.departed.push(bay.id);
          events.push({ type: "depart", bay: bi, busId: bay.id, colour: bay.colour });
        }
        boarded = true;
        break;
      }
      state.loop.push(state.loop.shift());
      events.push({ type: "rotate" });
      rotated++;
    }
    if (!boarded) return { events, peak };
  }
  throw new Error("settle overflow");
}

export function initialState(level) {
  const state = {
    loopCapacity: level.loopCapacity,
    tick: 0,
    queue: level.queue.slice(),
    loop: [],
    parked: level.buses.map((b) => ({ id: b.id, colour: b.colour, capacity: b.capacity, slot: b.slot })),
    bays: new Array(BAY_COUNT).fill(null),
    departed: [],
  };
  settle(state);
  return state;
}

export function isUnblocked(bus, parked) {
  const slot = SLOTS[bus.slot];
  if (!slot) throw new Error("unknown slot " + bus.slot);
  for (const s of slot.exitBlockedBy) if (parked.some((b) => b.slot === s)) return false;
  return true;
}

export function hasFreeBay(state) {
  return state.bays.some((b) => b === null);
}

export function legalMoves(state) {
  if (!hasFreeBay(state)) return [];
  return state.parked.filter((b) => isUnblocked(b, state.parked));
}

/** Why a tap on a parked bus would not be a move: null if legal, else "blocked" | "noBay" | "missing". */
export function tapProblem(state, busId) {
  const bus = state.parked.find((b) => b.id === busId);
  if (!bus) return "missing";
  if (!isUnblocked(bus, state.parked)) return "blocked";
  if (!hasFreeBay(state)) return "noBay";
  return null;
}

/**
 * Apply a legal move and settle. Returns a NEW state plus
 * { bay, events, peak } (peak counts occupancy right after placement).
 */
export function applyMove(state, busId) {
  const problem = tapProblem(state, busId);
  if (problem) throw new Error(`illegal move ${busId}: ${problem}`);
  const next = clone(state);
  const idx = next.parked.findIndex((b) => b.id === busId);
  const bus = next.parked[idx];
  const bay = next.bays.findIndex((b) => b === null);
  next.parked.splice(idx, 1);
  next.tick += 1;
  next.bays[bay] = { id: bus.id, colour: bus.colour, capacity: bus.capacity, filled: 0, arrivedAt: next.tick };
  const afterPlace = occupiedBayCount(next);
  const { events, peak } = settle(next);
  return { state: next, bay, events, peak: Math.max(afterPlace, peak) };
}

export function isWon(state) {
  return state.queue.length === 0 && state.loop.length === 0 &&
    state.parked.length === 0 && state.bays.every((b) => b === null);
}

export function canAnyoneBoard(state) {
  return state.loop.some((c) => boardingBay(c, state.bays) >= 0);
}

/** SPEC.md §4.9 stuck predicate. */
export function isStuck(state) {
  if (isWon(state)) return false;
  if (canAnyoneBoard(state)) return false;
  if (!(state.loop.length >= state.loopCapacity || state.queue.length === 0)) return false;
  return legalMoves(state).length === 0;
}

/**
 * Canonical key: parked ids, each bay's id + filled (+ arrival rank, because
 * FIFO boarding depends on it), queue and loop order.
 */
export function keyOf(state) {
  const parked = state.parked.map((b) => b.id).sort().join(",");
  const ticks = state.bays.filter(Boolean).map((b) => b.arrivedAt).sort((a, b) => a - b);
  const bays = state.bays.map((b) => (b ? `${b.id}:${b.filled}:${ticks.indexOf(b.arrivedAt)}` : "-")).join("|");
  const letter = (c) => (c === "pink" ? "k" : c[0]);
  return `${parked}#${bays}#${state.queue.map(letter).join("")}#${state.loop.map(letter).join("")}`;
}

export function sameState(a, b) {
  return keyOf(a) === keyOf(b);
}

// ---------- game session with undo (used by the UI and tests) ----------

export function createSession(level, saved) {
  const s = {
    level,
    state: saved?.state ? clone(saved.state) : initialState(level),
    undoStack: saved?.undoStack ? saved.undoStack.map(clone) : [],
  };
  return s;
}

/** Tap a bus. Returns { moved:false, problem } or { moved:true, bay, events, before }. */
export function sessionTap(session, busId) {
  const problem = tapProblem(session.state, busId);
  if (problem) return { moved: false, problem };
  const before = clone(session.state);
  const r = applyMove(session.state, busId);
  session.undoStack.push(before);
  session.state = r.state;
  return { moved: true, bay: r.bay, events: r.events, before };
}

export function sessionUndo(session) {
  if (session.undoStack.length === 0) return false;
  session.state = session.undoStack.pop();
  return true;
}

export function sessionRestart(session) {
  session.state = initialState(session.level);
  session.undoStack = [];
}
