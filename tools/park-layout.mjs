// Dev-only: packs a car park like the reference jam. Diagonal rows on the left and
// right lean in towards a straight centre column (a chevron), buses nose to tail and
// side by side with a small gap, arrows mixed. Pure geometry; see js/park.js.
import { BUS, axes, firstOverlap, blockerMap, peel } from "../js/park.js";

export const GAP = 0.12;
const SIDE = Number(process.env.SIDE || 64); // side rows lean like the reference: nearly level, noses a little up

function overlapAny(b, list) {
  const B = { ...b, id: "_", capacity: 10 };
  return list.some((o) => firstOverlap([B, { ...o, id: "o", capacity: 10 }]));
}

/**
 * A chevron car park of `k` ladders a side and `n` buses per ladder. A ladder is a
 * stack of side-by-side buses leaning at SIDE degrees, each a step lower than the
 * one above (so they look staggered, as in the reference). `cols` straight centre
 * columns run down the middle.
 */
export function spaces(k, n, cols) {
  const a = (SIDE * Math.PI) / 180;
  const dy = (BUS.wid + GAP) / Math.sin(a) + 0.005;
  const pitch = BUS.len + GAP;
  const list = [];
  const colX = [];
  for (let c = 0; c < cols; c++) colX.push((c - (cols - 1) / 2) * (BUS.wid + GAP));
  const height = (n - 1) * dy + BUS.len * Math.cos(a) + BUS.wid * Math.sin(a);
  const nc = Math.max(1, Math.floor((height + GAP) / pitch));
  const centre = [];
  for (const x of colX) for (let j = 0; j < nc; j++) centre.push({ x, y: (j - (nc - 1) / 2) * pitch, angle: 0 });
  list.push(...centre);
  // first ladder: as close to the centre column as it can sit
  const ladder = (x0, sgn, stagger) => {
    const out = [];
    for (let j = 0; j < n; j++) out.push({ x: x0, y: (j - (n - 1) / 2 + stagger) * dy, angle: sgn < 0 ? -SIDE : SIDE });
    return out;
  };
  for (const sgn of [-1, 1]) {
    let placed = centre.slice();
    let x = sgn * (colX[colX.length - 1] + BUS.wid / 2 + 0.2);
    for (let i = 0; i < k; i++) {
      const st = i % 2 ? 0.5 : 0;
      while (ladder(x, sgn, st).some((b) => overlapAny(b, placed))) x += sgn * 0.02;
      const l = ladder(x, sgn, st);
      list.push(...l); placed = placed.concat(l);
      x += sgn * pitch * 0.85;
    }
  }
  return list;
}

/**
 * N spaces packed as tightly as possible: the smallest chevron with room, trimmed
 * from the top and bottom corners, then cropped to the buses.
 */
export function packedSpaces(N) {
  let best = null, bestScore = Infinity;
  for (let k = 1; k <= 4; k++) for (let n = 2; n <= 12; n++) for (const cols of [1, 2]) {
    if (cols === 2 && k < 3) continue;
    const list = spaces(k, n, cols);
    if (list.length < N) continue;
    const xs = list.map((b) => b.x), ys = list.map((b) => b.y);
    const w = Math.max(...xs) - Math.min(...xs) + 2.2, h = Math.max(...ys) - Math.min(...ys) + 1.8;
    const asp = w / h;
    // prefer little trimming and a shape like the phone's car park (about 1.4 : 1)
    const score = (list.length - N) * 1.0 + Math.abs(Math.log(asp / 1.45)) * (N >= 20 ? 30 : 10) + (k === 1 ? 20 : 0);
    if (score < bestScore) { bestScore = score; best = list; }
  }
  if (!best) throw new Error("car park too big");
  // trim the corner-most spaces, a mirror pair at a time so the jam stays symmetric
  const far = (b) => Math.hypot(b.x / 1.45, b.y);
  const sides = best.filter((b) => b.x < -1e-6).sort((a, b) => far(b) - far(a));
  const drop = new Set();
  let extra = best.length - N;
  for (const b of sides) {
    if (extra < 2) break;
    const m = best.find((o) => Math.abs(o.x + b.x) < 1e-6 && Math.abs(o.y - b.y) < 1e-6);
    drop.add(b); if (m) drop.add(m); extra -= m ? 2 : 1;
  }
  // an odd one out comes off a side, never the centre column
  for (const b of sides) { if (extra <= 0) break; if (!drop.has(b)) { drop.add(b); extra--; } }
  const keep = best.filter((b) => !drop.has(b));
  return crop(keep);
}

function crop(keep) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of keep) {
    const { u, v } = axes(b.angle);
    for (const [p, q] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      const x = b.x + u.x * p * BUS.len / 2 + v.x * q * BUS.wid / 2, y = b.y + u.y * p * BUS.len / 2 + v.y * q * BUS.wid / 2;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const m = 0.15;
  const list = keep.map((b) => ({ x: +(b.x - minX + m).toFixed(3), y: +(b.y - minY + m).toFixed(3), angle: b.angle }));
  if (firstOverlap(list.map((b, i) => ({ ...b, id: "s" + i })))) throw new Error("packing overlap");
  return { w: +(maxX - minX + 2 * m).toFixed(3), h: +(maxY - minY + 2 * m).toFixed(3), list };
}

/**
 * Choose each bus's direction along its row so that the jam can be cleared,
 * most buses start blocked, and the clearing takes `depth` waves or more.
 */
export function chooseArrows(list, r, { maxFreeFrac, minDepth, caps, outward = 0.65 }, tries = 4000) {
  const W = Math.max(...list.map((b) => b.x)) + Math.min(...list.map((b) => b.x));
  for (let t = 0; t < tries; t++) {
    const buses = list.map((b, i) => {
      // side rows mostly face out (as in the reference); the centre column goes either way
      const out = b.angle === 0 ? r() < 0.5 : (b.x < W / 2) === (b.angle < 0) ? r() < outward : r() >= outward;
      return { id: "s" + i, capacity: caps[Math.floor(r() * caps.length)], x: b.x, y: b.y, angle: (out ? b.angle : b.angle + 180 + 360) % 360 };
    });
    // nudge: flip stuck buses until the jam can be cleared
    let ok = false;
    for (let k = 0; k < 40 && !ok; k++) {
      const { stuck } = peel(buses);
      if (!stuck.length) { ok = true; break; }
      const id = stuck[Math.floor(r() * stuck.length)];
      const b = buses.find((x) => x.id === id); b.angle = (b.angle + 180) % 360;
    }
    if (!ok) continue;
    // then tighten: turn free buses round while the jam stays clearable, so that
    // most buses start blocked
    let { layers } = peel(buses);
    for (let k = 0; k < buses.length * 6; k++) {
      const b = buses[Math.floor(r() * buses.length)];
      b.angle = (b.angle + 180) % 360;
      const p = peel(buses);
      if (p.stuck.length || p.layers[0].length > layers[0].length) b.angle = (b.angle + 180) % 360;
      else layers = p.layers;
    }
    const freeFrac = layers[0].length / buses.length;
    if (freeFrac <= maxFreeFrac && layers.length - 1 >= minDepth) return { buses, map: blockerMap(buses), layers };
  }
  return null;
}
