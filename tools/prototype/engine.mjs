export const SLOTS = {
  LW0: { x: 0.22, y: 0.10, angle: 40, exitBlockedBy: [] },
  LC0: { x: 0.38, y: 0.10, angle: 40, exitBlockedBy: [] },
  RC0: { x: 0.62, y: 0.10, angle: -40, exitBlockedBy: [] },
  RE0: { x: 0.78, y: 0.10, angle: -40, exitBlockedBy: [] },
  LW1: { x: 0.20, y: 0.28, angle: 40, exitBlockedBy: ["LW0"] },
  LC1: { x: 0.36, y: 0.28, angle: 40, exitBlockedBy: ["LC0"] },
  RC1: { x: 0.64, y: 0.28, angle: -40, exitBlockedBy: ["RC0"] },
  RE1: { x: 0.80, y: 0.28, angle: -40, exitBlockedBy: ["RE0"] },
  LW2: { x: 0.18, y: 0.46, angle: 40, exitBlockedBy: ["LW1", "LW0"] },
  LC2: { x: 0.34, y: 0.46, angle: 40, exitBlockedBy: ["LC1", "LC0"] },
  RC2: { x: 0.66, y: 0.46, angle: -40, exitBlockedBy: ["RC1", "RC0"] },
  RE2: { x: 0.82, y: 0.46, angle: -40, exitBlockedBy: ["RE1", "RE0"] },
  LW3: { x: 0.16, y: 0.64, angle: 40, exitBlockedBy: ["LW2", "LW1", "LW0"] },
  LC3: { x: 0.32, y: 0.64, angle: 40, exitBlockedBy: ["LC2", "LC1", "LC0"] },
  RC3: { x: 0.68, y: 0.64, angle: -40, exitBlockedBy: ["RC2", "RC1", "RC0"] },
  RE3: { x: 0.84, y: 0.64, angle: -40, exitBlockedBy: ["RE2", "RE1", "RE0"] },
  LW4: { x: 0.14, y: 0.82, angle: 40, exitBlockedBy: ["LW3", "LW2", "LW1", "LW0"] },
  LC4: { x: 0.30, y: 0.82, angle: 40, exitBlockedBy: ["LC3", "LC2", "LC1", "LC0"] },
  RC4: { x: 0.70, y: 0.82, angle: -40, exitBlockedBy: ["RC3", "RC2", "RC1", "RC0"] },
  RE4: { x: 0.86, y: 0.82, angle: -40, exitBlockedBy: ["RE3", "RE2", "RE1", "RE0"] },
};

export const LETTER = { R: "red", Y: "yellow", B: "blue", G: "green", P: "purple", K: "pink" };

export function parseQueue(s) {
  return s.replace(/\s+/g, "").split("").map((ch) => {
    if (!LETTER[ch]) throw new Error("bad colour letter " + ch);
    return LETTER[ch];
  });
}

export function queueConflicts(queue) {
  if (queue.length === 0) return 0;
  let runs = 1;
  for (let i = 1; i < queue.length; i++) if (queue[i] !== queue[i - 1]) runs++;
  return runs - new Set(queue).size;
}

export function colourCounts(arr) {
  const c = {};
  for (const x of arr) c[x] = (c[x] || 0) + 1;
  return c;
}

export function occupiedSlots(parked) {
  const set = new Set();
  for (const b of parked) set.add(b.slot);
  return set;
}

export function isUnblocked(bus, parked) {
  const occ = occupiedSlots(parked);
  const slot = SLOTS[bus.slot];
  if (!slot) throw new Error("unknown slot " + bus.slot);
  return slot.exitBlockedBy.every((s) => !occ.has(s));
}

export function maxBlockingDepth(buses) {
  const occ = occupiedSlots(buses);
  return Math.max(0, ...buses.map((b) => SLOTS[b.slot].exitBlockedBy.filter((s) => occ.has(s)).length));
}

export function assertPeopleMatchSeats(level) {
  const q = colourCounts(level.queue);
  const s = {};
  for (const b of level.buses) s[b.colour] = (s[b.colour] || 0) + b.capacity;
  const keys = new Set([...Object.keys(q), ...Object.keys(s)]);
  for (const k of keys) {
    if ((q[k] || 0) !== (s[k] || 0)) {
      throw new Error(`${level.id}: ${k} people=${q[k] || 0} seats=${s[k] || 0}`);
    }
  }
}

function canBoard(colour, bays) {
  for (let i = 0; i < bays.length; i++) {
    const bay = bays[i];
    if (bay && bay.colour === colour && bay.filled < bay.capacity) return i;
  }
  return -1;
}

export function occupiedBayCount(state) {
  return state.bays.filter(Boolean).length;
}

export function settle(state) {
  const cap = state.loopCapacity;
  let peak = occupiedBayCount(state);
  let guard = 0;
  while (guard++ < 200000) {
    while (state.loop.length < cap && state.queue.length > 0) state.loop.push(state.queue.shift());
    peak = Math.max(peak, occupiedBayCount(state));
    if (state.loop.length === 0) break;
    let rotated = 0;
    let boarded = false;
    const n = state.loop.length;
    while (rotated < n) {
      const bayIndex = canBoard(state.loop[0], state.bays);
      if (bayIndex >= 0) {
        state.loop.shift();
        const bay = state.bays[bayIndex];
        bay.filled += 1;
        if (bay.filled >= bay.capacity) state.bays[bayIndex] = null;
        peak = Math.max(peak, occupiedBayCount(state) + 0);
        boarded = true;
        break;
      } else {
        state.loop.push(state.loop.shift());
        rotated++;
      }
    }
    if (!boarded) break;
  }
  if (guard >= 200000) throw new Error("settle overflow");
  state._settlePeak = peak;
  return state;
}

export function clone(state) {
  return {
    loopCapacity: state.loopCapacity,
    queue: state.queue.slice(),
    loop: state.loop.slice(),
    parked: state.parked.map((b) => ({ ...b })),
    bays: state.bays.map((bay) => (bay ? { ...bay } : null)),
  };
}

export function initialState(level) {
  return settle({
    loopCapacity: level.loopCapacity,
    queue: level.queue.slice(),
    loop: [],
    parked: level.buses.map((b) => ({ ...b })),
    bays: [null, null, null, null, null],
  });
}

export function isWon(state) {
  return state.queue.length === 0 && state.loop.length === 0 &&
    state.parked.length === 0 && state.bays.every((b) => b === null);
}

export function isStuck(state) {
  if (isWon(state)) return false;
  const canAnyoneBoard = state.loop.some((c) => canBoard(c, state.bays) >= 0);
  if (canAnyoneBoard) return false;
  const loopFullOrQueueEmpty = state.loop.length >= state.loopCapacity || state.queue.length === 0;
  if (!loopFullOrQueueEmpty) return false; // more people could enter, but settle should have done that
  const freeBay = state.bays.some((b) => b === null);
  const movable = freeBay && state.parked.some((b) => isUnblocked(b, state.parked));
  if (movable) return false;
  return true; // no boarding, no useful move
}

export function legalMoves(state) {
  if (!state.bays.some((b) => b === null)) return [];
  return state.parked.filter((b) => isUnblocked(b, state.parked));
}

export function applyMove(state, busId) {
  const next = clone(state);
  const idx = next.parked.findIndex((b) => b.id === busId);
  if (idx < 0) throw new Error("not parked " + busId);
  const bus = next.parked[idx];
  if (!isUnblocked(bus, next.parked)) throw new Error("blocked " + busId);
  const bay = next.bays.findIndex((b) => b === null);
  if (bay < 0) throw new Error("no bay");
  next.parked.splice(idx, 1);
  next.bays[bay] = { id: bus.id, colour: bus.colour, capacity: bus.capacity, filled: 0 };
  const occAfterPlace = occupiedBayCount(next);
  settle(next);
  next._movePeak = Math.max(occAfterPlace, next._settlePeak);
  return next;
}

export function keyOf(state) {
  const parked = state.parked.map((b) => b.id).sort().join(",");
  const bays = state.bays.map((b) => (b ? `${b.id}:${b.filled}` : "-")).join("|");
  const queue = state.queue.map((c) => c[0]).join("");
  const loop = state.loop.map((c) => c[0]).join("");
  return `${parked}#${bays}#${queue}#${loop}`;
}

export function isSolvable(state, limit = 400000) {
  if (isWon(state)) return true;
  const seen = new Set([keyOf(state)]);
  const q = [state];
  let exp = 0;
  while (q.length && exp < limit) {
    const s = q.shift();
    exp++;
    if (isWon(s)) return true;
    for (const bus of legalMoves(s)) {
      const next = applyMove(s, bus.id);
      const k = keyOf(next);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push(next);
    }
  }
  return false;
}

/**
 * BFS for shortest win. Tracks peak including just-after-placement occupancy.
 * Then Dijkstra by peak for bay pressure (min peak over any winning path).
 * Finds tempting wrong moves: legal moves from start or from any state on
 * ONE shortest path that lead to an unsolvable position.
 */
export function solve(level, opts = {}) {
  const limit = opts.limit || 400000;
  const start = initialState(level);
  const startKey = keyOf(start);

  // BFS min moves
  const bfs = new Map();
  bfs.set(startKey, { moves: 0, peak: 0, prevKey: null, busId: null, state: start });
  const q = [startKey];
  let winKey = null;
  let exp = 0;
  while (q.length && exp < limit) {
    const k = q.shift();
    const node = bfs.get(k);
    exp++;
    if (isWon(node.state)) { winKey = k; break; }
    for (const bus of legalMoves(node.state)) {
      const next = applyMove(node.state, bus.id);
      const nk = keyOf(next);
      if (bfs.has(nk)) continue;
      bfs.set(nk, {
        moves: node.moves + 1,
        peak: Math.max(node.peak, next._movePeak),
        prevKey: k,
        busId: bus.id,
        state: next,
      });
      q.push(nk);
    }
  }

  const solvable = winKey !== null;
  const minMoves = solvable ? bfs.get(winKey).moves : null;
  function reconstruct(map, end) {
    const path = [];
    let k = end;
    while (map.get(k)?.busId) {
      path.push(map.get(k).busId);
      k = map.get(k).prevKey;
    }
    path.reverse();
    return path;
  }
  const shortestPath = solvable ? reconstruct(bfs, winKey) : [];

  // States on this shortest path (keys in order, including start)
  const shortestStates = [];
  if (solvable) {
    const keys = [];
    let k = winKey;
    while (k) { keys.push(k); k = bfs.get(k).prevKey; }
    keys.reverse();
    for (const key of keys) shortestStates.push({ key, state: bfs.get(key).state, busId: bfs.get(key).busId });
  }

  // Dijkstra by peak then moves, for bay pressure
  let bayPressure = solvable ? bfs.get(winKey).peak : null; // upper bound (this path)
  const heap = [];
  const best = new Map();
  function hpush(n) { heap.push(n); }
  function hpop() {
    let bi = 0;
    for (let i = 1; i < heap.length; i++) {
      const a = heap[i], b = heap[bi];
      if (a.peak < b.peak || (a.peak === b.peak && a.moves < b.moves)) bi = i;
    }
    return heap.splice(bi, 1)[0];
  }
  hpush({ state: start, key: startKey, peak: 0, moves: 0, prevKey: null, busId: null });
  best.set(startKey, { peak: 0, moves: 0, prevKey: null, busId: null });
  let dExp = 0;
  let bpWin = null;
  while (heap.length && dExp < limit) {
    const node = hpop();
    const rec = best.get(node.key);
    if (rec && (node.peak > rec.peak || (node.peak === rec.peak && node.moves > rec.moves))) continue;
    dExp++;
    if (isWon(node.state)) { bpWin = node; break; }
    for (const bus of legalMoves(node.state)) {
      const next = applyMove(node.state, bus.id);
      const nk = keyOf(next);
      const peak = Math.max(node.peak, next._movePeak);
      const moves = node.moves + 1;
      const prev = best.get(nk);
      if (!prev || peak < prev.peak || (peak === prev.peak && moves < prev.moves)) {
        best.set(nk, { peak, moves, prevKey: node.key, busId: bus.id });
        hpush({ state: next, key: nk, peak, moves, prevKey: node.key, busId: bus.id });
      }
    }
  }
  if (bpWin) bayPressure = bpWin.peak;

  // Tempting wrong moves along the shortest path (including start)
  const tempting = [];
  if (solvable) {
    for (const step of shortestStates) {
      if (isWon(step.state)) continue;
      for (const bus of legalMoves(step.state)) {
        const next = applyMove(step.state, bus.id);
        if (!isSolvable(next, limit)) {
          tempting.push({
            afterMoves: reconstruct(bfs, step.key),
            fromKey: step.key,
            busId: bus.id,
            colour: bus.colour,
            slot: bus.slot,
            stuckImmediately: isStuck(next),
          });
        }
      }
    }
  }

  const startMoves = legalMoves(start);
  const goodStart = [];
  const badStart = [];
  if (solvable) {
    for (const bus of startMoves) {
      const next = applyMove(start, bus.id);
      const ok = isSolvable(next, limit);
      const rec = { id: bus.id, colour: bus.colour, slot: bus.slot };
      if (ok) goodStart.push(rec); else badStart.push(rec);
    }
  }

  return {
    solvable,
    minMoves,
    shortestPath,
    bayPressure,
    temptingWrong: tempting,
    temptingCount: tempting.length,
    goodStart,
    badStart,
    expansions: { bfs: exp, dijkstra: dExp },
    startLoop: start.loop.slice(),
    startQueueLen: start.queue.length,
    uniqueStatesBfs: bfs.size,
  };
}

export function summarizeLevel(level, result) {
  return {
    id: level.id,
    name: level.name,
    colours: new Set(level.queue).size,
    buses: level.buses.length,
    maxBlockingDepth: maxBlockingDepth(level.buses),
    bayPressure: result.bayPressure,
    queueOrderConflicts: queueConflicts(level.queue),
    minMoves: result.minMoves,
    people: level.queue.length,
    loopCapacity: level.loopCapacity,
    solvable: result.solvable,
    temptingCount: result.temptingCount,
    badStart: result.badStart,
    goodStart: result.goodStart,
    shortestPath: result.shortestPath,
  };
}
