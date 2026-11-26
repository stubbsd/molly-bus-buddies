// Car-park geometry (v3). Every parked bus is a rectangle in level units; the
// renderer draws exactly this rectangle, and the rules use exactly this maths:
// a bus can leave only if the strip it sweeps when it drives straight ahead
// along its roof arrow touches no other parked bus.
// Angles are degrees clockwise from "up" (screen y grows downwards).

export const BUS = Object.freeze({ len: 2, wid: 0.9 });
// Bigger buses are longer, like the reference (4 seats short ... 10 seats long).
export const BUS_LEN = Object.freeze({ 4: 1.5, 6: 1.72, 8: 1.88, 10: 2 });
export const lenOf = (b) => BUS_LEN[b.capacity] ?? BUS.len;
const FAR = 1000;
const EPS = 1e-6;

const rad = (d) => (d * Math.PI) / 180;
export function axes(angle) {
  const a = rad(angle);
  return { u: { x: Math.sin(a), y: -Math.cos(a) }, v: { x: Math.cos(a), y: Math.sin(a) } };
}

/** The four corners of a bus body. */
export function busCorners(b) {
  const { u, v } = axes(b.angle);
  const hl = lenOf(b) / 2, hw = BUS.wid / 2;
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([p, q]) => ({ x: b.x + u.x * p + v.x * q, y: b.y + u.y * p + v.y * q }));
}

/** The strip a bus sweeps as it drives straight out along its arrow. */
export function sweepCorners(b) {
  const { u, v } = axes(b.angle);
  const hl = lenOf(b) / 2, hw = BUS.wid / 2;
  return [[FAR, hw], [FAR, -hw], [-hl, -hw], [-hl, hw]].map(([p, q]) => ({ x: b.x + u.x * p + v.x * q, y: b.y + u.y * p + v.y * q }));
}

function project(poly, ax) {
  let lo = Infinity, hi = -Infinity;
  for (const p of poly) { const d = p.x * ax.x + p.y * ax.y; if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
}

/** True when two convex quads overlap by more than a hair (touching is not overlapping). */
export function overlaps(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const ax = { x: -(q.y - p.y), y: q.x - p.x };
      const n = Math.hypot(ax.x, ax.y); ax.x /= n; ax.y /= n;
      const [a0, a1] = project(A, ax), [b0, b1] = project(B, ax);
      if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false;
    }
  }
  return true;
}

/** Does bus `other` stand in the way of bus `b` driving out? */
export function blocks(other, b) {
  return overlaps(sweepCorners(b), busCorners(other));
}

/** For every bus, the ids of the buses in its way (fixed for a level). */
export function blockerMap(buses) {
  const out = {};
  const bodies = buses.map(busCorners);
  for (const b of buses) {
    const sw = sweepCorners(b);
    out[b.id] = buses.filter((o, j) => o.id !== b.id && overlaps(sw, bodies[j])).map((o) => o.id);
  }
  return out;
}

/** Any two bus bodies overlapping? Returns the first offending pair or null. */
export function firstOverlap(buses) {
  const bodies = buses.map(busCorners);
  for (let i = 0; i < buses.length; i++) for (let j = i + 1; j < buses.length; j++) if (overlaps(bodies[i], bodies[j])) return [buses[i].id, buses[j].id];
  return null;
}

/**
 * Peel the car park: layer 0 is free at the start, layer k is free once layers < k
 * have gone. Returns { layers, stuck } where stuck lists buses that can never leave.
 */
export function peel(buses, map = blockerMap(buses)) {
  const left = new Set(buses.map((b) => b.id));
  const layers = [];
  while (left.size) {
    const free = [...left].filter((id) => !map[id].some((o) => left.has(o)));
    if (!free.length) break;
    layers.push(free);
    for (const id of free) left.delete(id);
  }
  return { layers, stuck: [...left] };
}
