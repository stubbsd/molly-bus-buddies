// Molly's Bus Buddies — official rules (v2: roof arrows, front-of-queue boarding,
// seat countdowns, mystery buses, out-of-room). Pure functions, no DOM.
// Shared by the browser game, the solver (tools/solve.mjs) and the tests.
import { BAY_COUNT } from "./slots.js";
import { blockerMap, blocks, peel } from "./park.js";

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

/** Waves needed to clear the car park when nothing else matters (0 = all free at the start). */
export function maxBlockingDepth(buses) {
  const { layers, stuck } = peel(buses);
  return stuck.length ? Infinity : layers.length - 1;
}

/** How many buses cannot drive out at the start. */
export function blockedAtStart(buses) {
  const map = blockerMap(buses);
  return buses.filter((b) => map[b.id].length > 0).length;
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
    lost: state.lost ? { ...state.lost } : null,
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
 * Official deterministic settle (v2 rules). Mutates state.
 * People walk onto the circle in queue order (up to loopCapacity at once).
 * Only the person at the FRONT (loop[0]) may board: they hop onto the
 * earliest-arrived bay bus of their colour with a free seat. If there is none,
 * everybody waits. A bus whose seat countdown reaches 0 drives off.
 * Returns { events, peak }.
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
    const bi = boardingBay(state.loop[0], state.bays);
    if (bi < 0) return { events, peak };
    const colour = state.loop.shift();
    const bay = state.bays[bi];
    bay.filled += 1;
    events.push({ type: "board", colour, bay: bi, busId: bay.id });
    if (bay.filled >= bay.capacity) {
      state.bays[bi] = null;
      state.departed.push(bay.id);
      events.push({ type: "depart", bay: bi, busId: bay.id, colour: bay.colour });
    }
  }
  throw new Error("settle overflow");
}

/** Seats still empty on a bay bus (the countdown badge). */
export function seatsLeft(bayBus) {
  return bayBus ? bayBus.capacity - bayBus.filled : 0;
}

/** The colour of the person at the front of the line, or null. */
export function frontColour(state) {
  return state.loop[0] ?? state.queue[0] ?? null;
}

export function initialState(level) {
  const state = {
    loopCapacity: level.loopCapacity,
    tick: 0,
    queue: level.queue.slice(),
    loop: [],
    parked: parkedFromLevel(level),
    bays: new Array(BAY_COUNT).fill(null),
    departed: [],
    lost: null,
  };
  settle(state);
  return state;
}

/** Parked buses for a level, each carrying the ids of the buses in its way (geometry is fixed). */
export function parkedFromLevel(level) {
  const map = blockerMap(level.buses);
  return level.buses.map((b) => ({
    id: b.id, colour: b.colour, capacity: b.capacity, x: b.x, y: b.y, angle: b.angle,
    mystery: b.mystery === true, blockers: map[b.id],
  }));
}

/** A bus can drive out when no parked bus touches the strip ahead of it (js/park.js). */
export function isUnblocked(bus, parked) {
  if (Array.isArray(bus.blockers)) {
    for (const b of parked) if (b.id !== bus.id && bus.blockers.includes(b.id)) return false;
    return true;
  }
  for (const b of parked) if (b.id !== bus.id && blocks(b, bus)) return false;
  return true;
}

/** A mystery bus shows its colour only once its way out is clear. */
export function isRevealed(bus, parked) {
  return !bus.mystery || isUnblocked(bus, parked);
}

export function hasFreeBay(state) {
  return state.bays.some((b) => b === null);
}

/** Moves that put a bus into a free bay (sending a bus when every bay is full loses instead). */
export function legalMoves(state) {
  if (state.lost || isWon(state) || !hasFreeBay(state)) return [];
  return state.parked.filter((b) => isUnblocked(b, state.parked));
}

/** Why a tap is not a normal move: null if it parks in a bay, else "blocked" | "full" | "over" | "missing". */
export function tapProblem(state, busId) {
  if (state.lost || isWon(state)) return "over";
  const bus = state.parked.find((b) => b.id === busId);
  if (!bus) return "missing";
  if (!isUnblocked(bus, state.parked)) return "blocked";
  if (!hasFreeBay(state)) return "full";
  return null;
}

/**
 * Send a bus out and settle. Returns a NEW state plus { bay, events, peak, lost }.
 * If every bay is already full the bus has nowhere to go: the level is lost
 * (state.lost = { busId }), the bus stays in its space, and Undo can take it back.
 */
export function applyMove(state, busId) {
  const problem = tapProblem(state, busId);
  if (problem === "full") {
    const next = clone(state);
    next.tick += 1;
    next.lost = { busId };
    return { state: next, bay: -1, events: [], peak: occupiedBayCount(next), lost: true };
  }
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
  return { state: next, bay, events, peak: Math.max(afterPlace, peak), lost: false };
}

export function isLost(state) {
  return !!state.lost;
}

export function isWon(state) {
  return !state.lost && state.queue.length === 0 && state.loop.length === 0 &&
    state.parked.length === 0 && state.bays.every((b) => b === null);
}

export function canAnyoneBoard(state) {
  return state.loop.length > 0 && boardingBay(state.loop[0], state.bays) >= 0;
}

/**
 * Stuck: not won or lost, and every bay is full while the front person has no bus.
 * (After settle, this is the only way to have no safe move: sending any other bus now loses.)
 */
export function isStuck(state) {
  if (isWon(state) || state.lost) return false;
  if (canAnyoneBoard(state)) return false;
  return !hasFreeBay(state);
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
  return `${parked}#${bays}#${state.queue.map(letter).join("")}#${state.loop.map(letter).join("")}${state.lost ? "#lost:" + state.lost.busId : ""}`;
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

/**
 * Tap a bus. Returns { moved:false, problem } for a blocked bus (it bumps) or a finished level,
 * else { moved:true, bay, events, lost, before }. A move that loses can be undone.
 */
export function sessionTap(session, busId) {
  const problem = tapProblem(session.state, busId);
  if (problem && problem !== "full") return { moved: false, problem };
  const before = clone(session.state);
  const r = applyMove(session.state, busId);
  session.undoStack.push(before);
  session.state = r.state;
  return { moved: true, bay: r.bay, events: r.events, lost: r.lost, before };
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
