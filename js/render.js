// Canvas renderer: layout maths and original procedural artwork.
import { BUS, lenOf } from "./park.js";

export const COLOUR_HEX = {
  red: "#E23B2F", yellow: "#F5C518", blue: "#2F7DE1",
  green: "#3BA55C", purple: "#8B4ACB", pink: "#E85A9B",
};
const P = {
  grass: "#B6E04A", grassDeep: "#8BC53F", road: "#A8B0BC", bay: "#EEF1F5",
  bayStroke: "#FFFFFF", carpark: "#D9F1E6", track: "#E9F0D8", channel: "#DCEBB8",
};

function shade(hex, f) { // f<0 darker, f>0 lighter
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (d) => (d * Math.PI) / 180;

// ---------------- layout ----------------

export function computeLayout(w, h, insets, level = null) {
  const st = insets.top, sb = insets.bottom;
  const landscape = w > h * 1.15 && w >= 700;
  const L = { w, h, landscape, insets };
  const compact = h < 720;
  const ctrlH = sb + (compact ? 94 : 112);
  if (!landscape) {
    const grassH = Math.round(compact ? h * 0.375 : clamp(h * 0.41, 250, 540));
    const roadH = Math.round(compact ? 76 : clamp(h * 0.115, 82, 150));
    L.grass = { x: 0, y: 0, w, h: grassH };
    L.road = { x: 0, y: grassH, w, h: roadH };
    L.carArea = { x: 0, y: grassH + roadH, w, h: h - grassH - roadH };
    L.car = { x: Math.max(insets.left, (w - Math.min(w, 760)) / 2) + 6, y: grassH + roadH + 10, w: Math.min(w, 760) - insets.left - insets.right - 12, h: h - grassH - roadH - 10 - ctrlH };
    L.hudBottom = st + 76;
  } else {
    const pw = Math.round(w * 0.5);
    const roadH = Math.round(clamp(h * 0.17, 100, 160));
    L.grass = { x: 0, y: 0, w: pw, h: h - roadH - sb };
    L.road = { x: 0, y: h - roadH - sb, w: pw, h: roadH + sb };
    L.carArea = { x: pw, y: 0, w: w - pw, h };
    L.car = { x: pw + 14, y: st + 74, w: w - pw - 28 - insets.right, h: h - st - 74 - ctrlH };
    L.hudBottom = st + 80;
  }
  // Feeder + ring geometry inside the grass band, after the reference video: two
  // feeder channels come down on the left and right, curve in like a big U and merge
  // into a thick ring (three people wide) round a small grass hole. The ring opens at
  // the bottom onto the bay road. People stand packed shoulder to shoulder.
  const g = L.grass;
  const top = L.hudBottom + 2;
  const bottom = g.y + g.h - 4;
  const Ro = clamp(Math.min((bottom - top) / 2, g.w * 0.25), 70, 200);
  const trackW = Ro * 0.72; // small hole, thick ring, as in the reference
  const Ri = Ro - trackW;
  const lanes = 3;
  const laneW = (trackW - 6) / lanes;
  const br = clamp(laneW * 0.53, 5, 24);
  const step = 2 * br * 0.9; // rows in the feeders overlap a touch, like a crowd
  const cx = g.x + g.w / 2;
  const cy = bottom - Ro;
  const Rm = (Ro + Ri) / 2;
  L.island = { cx, cy, Ro, Ri, Rm, trackW, lanes, laneW, R: Rm, islandR: Ri };
  L.br = br; L.step = step;
  L.ringR = [0, 1, 2].map((k) => Ri + 3 + laneW * (k + 0.5));
  // Ring places, packed per lane, ordered from the door (6 o'clock) back round the ring
  // clockwise: up the left side, over the top, down the right. f = share of the lap.
  const slots = [];
  L.ringR.forEach((r, k) => {
    const n = Math.max(3, Math.floor((2 * Math.PI * r) / (2 * br * 0.96)));
    for (let j = 0; j < n; j++) slots.push({ r, f: (j + (k % 2 ? 0.5 : 0.25)) / n });
  });
  slots.sort((a, b) => a.f - b.f || a.r - b.r);
  L.ringSlots = slots;
  L.ringCap = slots.length;
  L.door = { x: cx, y: cy + Ro - laneW * 0.4 };
  L.laneBottom = { x: cx, y: L.road.y + 6 };
  // Who waits in which feeder: rows of three take turns, left then right, so both
  // feeders stay equally full and each colour band shows on both sides, as in the
  // reference. Index = place in the level's whole line (0 = front).
  const q = level ? level.queue : [];
  L.armOf = [];
  const count = [0, 0];
  for (let i = 0; i < q.length; i++) {
    if (i < L.ringCap) { L.armOf.push(-1); continue; }
    const arm = Math.floor((i - L.ringCap) / lanes) % 2;
    L.armOf.push(arm); count[arm]++;
  }
  // Feeder arms. Centre line from where it meets the ring back up the side. Each arm is
  // just long enough for the people waiting in it at the start (or runs off the top).
  const armW = trackW;
  const need = trackW * 0.5 + 4 + Math.ceil(Math.max(count[0], count[1], 3) / lanes) * step + br * 0.4;
  const maxSpread = Math.min(g.w / 2 - armW / 2 - 12, Ro * 2.05);
  const minSpread = Math.min(maxSpread, Ro + trackW / 2 + 10);
  const build = (spread) => [-1, 1].map((side) => {
    const a = rad(side < 0 ? 160 : 20);
    const J = { x: cx + Rm * Math.cos(a), y: cy + Rm * Math.sin(a) };
    const inward = { x: -Math.cos(a), y: -Math.sin(a) };
    const A = { x: cx + side * spread, y: cy - Ro * 0.15 };
    const k = Math.hypot(A.x - J.x, A.y - J.y) * 0.55;
    const P1 = { x: J.x - inward.x * k, y: J.y - inward.y * k }, P2 = { x: A.x, y: A.y + k };
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40, v = 1 - u;
      pts.push({ x: v * v * v * J.x + 3 * v * v * u * P1.x + 3 * v * u * u * P2.x + u * u * u * A.x, y: v * v * v * J.y + 3 * v * v * u * P1.y + 3 * v * u * u * P2.y + u * u * u * A.y });
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { side, pts, cum, J, A, w: armW };
  });
  let arms = null;
  for (let sp = maxSpread; sp >= minSpread - 1e-6; sp -= 4) {
    arms = build(sp);
    if (arms[0].cum[arms[0].cum.length - 1] <= need) break;
  }
  if (!arms) arms = build(minSpread);
  for (const arm of arms) {
    const bez = arm.cum[arm.cum.length - 1];
    let endY = arm.A.y - Math.max(0, need - bez);
    if (endY < g.y + br * 3) endY = g.y - 900; // runs off the top like the reference
    if (endY < arm.A.y - 0.5) { arm.pts.push({ x: arm.A.x, y: endY }); arm.cum.push(bez + (arm.A.y - endY)); }
  }
  L.arms = arms;
  // Bays
  const rd = L.road;
  const usable = rd.w - 24;
  const bayW = Math.min(usable / 5 - 12, 84);
  const bayH = Math.min((rd.h - (landscape ? insets.bottom : 0)) * 0.8, bayW * 1.55);
  const gap = (usable - bayW * 5) / 5;
  L.bays = [];
  for (let i = 0; i < 5; i++) {
    const x = rd.x + 12 + gap / 2 + i * (bayW + gap);
    const y = rd.y + ((rd.h - (landscape ? insets.bottom : 0)) - bayH) / 2;
    L.bays.push({ x, y, w: bayW, h: bayH, cx: x + bayW / 2, cy: y + bayH / 2 });
  }
  L.bayBus = { len: bayH * 0.84, wid: Math.min(bayW * 0.6, bayH * 0.42) };
  // Car park: the level's jam scaled to fill the band (never bigger than a bay bus).
  const park = level?.park ?? { w: 10, h: 7 };
  const c = L.car;
  const sc = Math.min(c.w / park.w, c.h / park.h, (L.bayBus.wid * 1.1) / BUS.wid);
  L.park = { s: sc, ox: c.x + (c.w - park.w * sc) / 2, oy: c.y + (c.h - park.h * sc) / 2, w: park.w * sc, h: park.h * sc };
  L.parkBus = { len: BUS.len * sc, wid: BUS.wid * sc };
  return L;
}

/** Where a parked bus is drawn: centre, angle and body size in CSS pixels. */
export function busPos(L, b) {
  const { s, ox, oy } = L.park;
  return { x: ox + b.x * s, y: oy + b.y * s, angle: b.angle, len: lenOf(b) * s, wid: BUS.wid * s };
}

/** Point at distance s back from the ring along an arm's centre line, offset sideways. */
function armXY(arm, s, off) {
  const { pts, cum } = arm;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const u = clamp((s - cum[i - 1]) / seg, 0, 1);
  const dx = (b.x - a.x) / seg, dy = (b.y - a.y) / seg;
  return { x: a.x + (b.x - a.x) * u - dy * off, y: a.y + (b.y - a.y) * u + dx * off };
}

/** Where the j-th waiting person in a feeder arm stands (0 = front, nearest the ring). */
export function queuePoint(L, arm, j) {
  const A = L.arms[arm];
  const rank = Math.floor(j / L.island.lanes), lane = j % L.island.lanes;
  const off = (lane - 1) * L.island.laneW * A.side * -1;
  // the front rank stands just outside the ring wall, ready to step on
  return armXY(A, L.island.trackW * 0.5 + 4 + (rank + 0.5) * L.step, off);
}

/** A point on the ring at a given radius (default: the middle lane). */
export function loopXY(L, angleDeg, r = L.ringR[1]) {
  const { cx, cy } = L.island;
  return { x: cx + r * Math.cos(rad(angleDeg)), y: cy + r * Math.sin(rad(angleDeg)) };
}

/** Ring place i (0 = the front, at the door) as an angle (degrees) and radius. */
export function ringSlot(L, i) {
  const s = L.ringSlots[Math.min(i, L.ringSlots.length - 1)];
  return { a: 90 + s.f * 360, r: s.r };
}

/**
 * Hit test parked buses: the bus whose body (plus a small margin) holds the point;
 * where margins overlap in the packed jam, the one the point is most inside wins.
 */
export function hitBus(L, parked, x, y) {
  let best = null, bestD = Infinity;
  for (const b of parked) {
    const p = busPos(L, b);
    const a = rad(p.angle);
    const dx = x - p.x, dy = y - p.y;
    const along = dx * Math.sin(a) - dy * Math.cos(a);
    const across = dx * Math.cos(a) + dy * Math.sin(a);
    const pad = 6;
    if (Math.abs(along) <= p.len / 2 + pad && Math.abs(across) <= p.wid / 2 + pad) {
      const d = Math.max(Math.abs(along) / (p.len / 2), Math.abs(across) / (p.wid / 2));
      if (d < bestD) { bestD = d; best = b.id; }
    }
  }
  return best;
}

// ---------------- sprites ----------------

const beadCache = new Map();
export function beadSprite(colour, r, dpr) {
  const key = `${colour}|${r.toFixed(1)}|${dpr}`;
  if (beadCache.has(key)) return beadCache.get(key);
  const size = Math.ceil((r * 2 + 4) * dpr);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(size, size) : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const c = cv.getContext("2d");
  c.scale(dpr, dpr);
  const o = r + 2;
  c.fillStyle = "rgba(31,59,44,.25)";
  c.beginPath(); c.ellipse(o, o + r * 0.35, r * 0.95, r * 0.75, 0, 0, Math.PI * 2); c.fill();
  const hex = COLOUR_HEX[colour];
  const g = c.createRadialGradient(o - r * 0.35, o - r * 0.45, r * 0.1, o, o, r);
  g.addColorStop(0, shade(hex, 0.45)); g.addColorStop(0.55, hex); g.addColorStop(1, shade(hex, -0.25));
  c.fillStyle = g;
  c.beginPath(); c.arc(o, o, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(255,255,255,.85)";
  c.beginPath(); c.ellipse(o - r * 0.35, o - r * 0.42, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2); c.fill();
  const s = { cv, size: size / dpr, o };
  beadCache.set(key, s);
  return s;
}

export function drawBead(ctx, colour, x, y, r, dpr, scale = 1) {
  const s = beadSprite(colour, r, dpr);
  const sz = s.size * scale;
  ctx.drawImage(s.cv, x - s.o * scale, y - s.o * scale, sz, sz);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Original top-down toy coach. angle: degrees clockwise from up (nose direction). */
export function drawBus(ctx, x, y, angle, len, wid, colour, opts = {}) {
  const hex = COLOUR_HEX[colour];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad(angle));
  if (opts.scale) ctx.scale(opts.scale, opts.scale);
  const W = wid, Lh = len, r = W * 0.34;
  // shadow
  ctx.fillStyle = "rgba(31,59,44,.22)";
  roundRect(ctx, -W / 2 + W * 0.08, -Lh / 2 + W * 0.16, W, Lh, r); ctx.fill();
  // wheels
  ctx.fillStyle = "#2b2f36";
  for (const sy of [-0.3, 0.3]) for (const sx of [-1, 1]) {
    roundRect(ctx, sx * (W / 2) - (sx > 0 ? W * 0.02 : W * 0.14), sy * Lh - W * 0.17, W * 0.16, W * 0.34, W * 0.06); ctx.fill();
  }
  // body side (darker) and roof
  ctx.fillStyle = shade(hex, -0.22);
  roundRect(ctx, -W / 2, -Lh / 2, W, Lh, r); ctx.fill();
  ctx.fillStyle = hex;
  roundRect(ctx, -W / 2 + W * 0.05, -Lh / 2 + W * 0.02, W * 0.9, Lh - W * 0.1, r * 0.9); ctx.fill();
  // windscreen at the nose
  ctx.fillStyle = "#cfe9ff";
  roundRect(ctx, -W * 0.36, -Lh / 2 + W * 0.1, W * 0.72, Lh * 0.09, W * 0.12); ctx.fill();
  // side windows (two rows)
  ctx.fillStyle = "#bfe0fb";
  const wn = 4, wy0 = -Lh / 2 + Lh * 0.24, wl = (Lh * 0.66) / wn;
  for (let i = 0; i < wn; i++) for (const sx of [-1, 1]) {
    roundRect(ctx, sx > 0 ? W * 0.26 : -W * 0.38, wy0 + i * wl + wl * 0.1, W * 0.12, wl * 0.78, W * 0.04); ctx.fill();
  }
  // roof panel
  ctx.fillStyle = shade(hex, 0.18);
  roundRect(ctx, -W * 0.22, -Lh / 2 + Lh * 0.22, W * 0.44, Lh * 0.66, W * 0.14); ctx.fill();
  // white roof arrow pointing to the nose
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round"; ctx.lineWidth = W * 0.1;
  const ay = -Lh / 2 + Lh * 0.3;
  ctx.beginPath(); ctx.moveTo(0, Lh * 0.28); ctx.lineTo(0, ay + W * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, ay - W * 0.05); ctx.lineTo(W * 0.17, ay + W * 0.22); ctx.lineTo(-W * 0.17, ay + W * 0.22); ctx.closePath(); ctx.fill();
  // headlights
  ctx.fillStyle = "#fff7c2";
  ctx.beginPath(); ctx.arc(-W * 0.3, -Lh / 2 + W * 0.06, W * 0.07, 0, Math.PI * 2); ctx.arc(W * 0.3, -Lh / 2 + W * 0.06, W * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Dark 'mystery' bus in the same toy-coach style, with a white ? on the roof. */
export function drawMysteryBus(ctx, x, y, angle, len, wid) {
  const hex = "#3C4450";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad(angle));
  const Wd = wid, Lh = len, r = Wd * 0.34;
  ctx.fillStyle = "rgba(31,59,44,.22)";
  roundRect(ctx, -Wd / 2 + Wd * 0.08, -Lh / 2 + Wd * 0.16, Wd, Lh, r); ctx.fill();
  ctx.fillStyle = "#2b2f36";
  for (const sy of [-0.3, 0.3]) for (const sx of [-1, 1]) {
    roundRect(ctx, sx * (Wd / 2) - (sx > 0 ? Wd * 0.02 : Wd * 0.14), sy * Lh - Wd * 0.17, Wd * 0.16, Wd * 0.34, Wd * 0.06); ctx.fill();
  }
  ctx.fillStyle = shade(hex, -0.18);
  roundRect(ctx, -Wd / 2, -Lh / 2, Wd, Lh, r); ctx.fill();
  ctx.fillStyle = hex;
  roundRect(ctx, -Wd / 2 + Wd * 0.05, -Lh / 2 + Wd * 0.02, Wd * 0.9, Lh - Wd * 0.1, r * 0.9); ctx.fill();
  ctx.fillStyle = "#9aa7b5";
  roundRect(ctx, -Wd * 0.36, -Lh / 2 + Wd * 0.1, Wd * 0.72, Lh * 0.09, Wd * 0.12); ctx.fill();
  ctx.fillStyle = "#2a3038";
  const wn = 4, wy0 = -Lh / 2 + Lh * 0.24, wl = (Lh * 0.66) / wn;
  for (let i = 0; i < wn; i++) for (const sx of [-1, 1]) {
    roundRect(ctx, sx > 0 ? Wd * 0.26 : -Wd * 0.38, wy0 + i * wl + wl * 0.1, Wd * 0.12, wl * 0.78, Wd * 0.04); ctx.fill();
  }
  ctx.fillStyle = shade(hex, 0.16);
  roundRect(ctx, -Wd * 0.22, -Lh / 2 + Lh * 0.22, Wd * 0.44, Lh * 0.66, Wd * 0.14); ctx.fill();
  // tiny faint arrow so the exit direction is still readable
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.lineCap = "round"; ctx.lineWidth = Wd * 0.07;
  const ay = -Lh / 2 + Lh * 0.28;
  ctx.beginPath(); ctx.moveTo(0, Lh * 0.06); ctx.lineTo(0, ay + Wd * 0.22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, ay - Wd * 0.02); ctx.lineTo(Wd * 0.13, ay + Wd * 0.18); ctx.lineTo(-Wd * 0.13, ay + Wd * 0.18); ctx.closePath(); ctx.fill();
  // friendly white ? badge on the mid-roof
  const br = Wd * 0.32;
  ctx.fillStyle = "#F4F7FB";
  ctx.beginPath(); ctx.arc(0, Lh * 0.08, br, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(31,59,44,.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.rotate(-rad(angle)); // keep the ? upright whichever way the bus faces
  ctx.translate(-Math.sin(rad(angle)) * Lh * 0.1, Math.cos(rad(angle)) * Lh * 0.1);
  ctx.fillStyle = "#2A3340";
  ctx.font = `800 ${Math.max(11, Wd * 0.48)}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 0, 1);
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad(angle));
  ctx.fillStyle = "#e8eef3";
  ctx.beginPath(); ctx.arc(-Wd * 0.3, -Lh / 2 + Wd * 0.06, Wd * 0.07, 0, Math.PI * 2); ctx.arc(Wd * 0.3, -Lh / 2 + Wd * 0.06, Wd * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Yellow seat-countdown badge under a bay bus. */
export function drawCountdown(ctx, bay, n, scale = 1) {
  const x = bay.cx;
  const y = bay.y + bay.h - 3;
  const r = clamp(bay.w * 0.21, 10, 18) * scale;
  ctx.save();
  ctx.fillStyle = "rgba(31,59,44,.22)";
  ctx.beginPath(); ctx.arc(x, y + 1.5, r, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - 3, y - 4, 2, x, y, r);
  g.addColorStop(0, "#FFE56A");
  g.addColorStop(0.7, "#F5C518");
  g.addColorStop(1, "#D9A40E");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.fillStyle = "#23412F";
  ctx.font = `800 ${Math.round(r * 1.2)}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), x, y + 0.5);
  ctx.restore();
}

/** Soft halo marking the person at the front of the line. */
export function drawFrontGlow(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.15);
  g.addColorStop(0, "rgba(255,255,255,.95)");
  g.addColorStop(0.45, "rgba(255,248,180,.7)");
  g.addColorStop(1, "rgba(255,248,180,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 2.15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.95)";
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(x, y, r * 1.28, 0, Math.PI * 2); ctx.stroke();
}

/** Gentle cartoon 'boop' at the point two buses touch — not an explosion. */
export function drawBumpBurst(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // soft glow
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
  glow.addColorStop(0, "rgba(255,255,255,.95)");
  glow.addColorStop(0.4, "rgba(255,230,120,.65)");
  glow.addColorStop(1, "rgba(255,230,120,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
  // little star-puff
  ctx.fillStyle = "#FFF8D8";
  ctx.strokeStyle = "#F0C430";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 13 : 5.5;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // short motion ticks
  ctx.strokeStyle = "rgba(35,65,47,.45)";
  ctx.lineCap = "round";
  ctx.lineWidth = 2;
  for (const [a, l] of [[-50, 9], [-15, 11], [20, 8]]) {
    const ang = rad(a);
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 13, Math.sin(ang) * 13);
    ctx.lineTo(Math.cos(ang) * (13 + l), Math.sin(ang) * (13 + l));
    ctx.stroke();
  }
  ctx.restore();
}



// ---------------- static background ----------------

function drawTree(ctx, x, y, s) {
  ctx.fillStyle = "rgba(31,59,44,.18)";
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y + s * 0.55, s * 0.8, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8a5a3c";
  roundRect(ctx, x - s * 0.08, y, s * 0.16, s * 0.55, s * 0.05); ctx.fill();
  const blobs = [[0, -0.2, 0.5], [-0.4, 0.05, 0.38], [0.4, 0.05, 0.38], [-0.2, -0.5, 0.36], [0.25, -0.48, 0.34]];
  for (const [bx, by, r] of blobs) {
    const g = ctx.createRadialGradient(x + bx * s - r * s * 0.3, y + by * s - r * s * 0.3, 1, x + bx * s, y + by * s, r * s);
    g.addColorStop(0, "#ffe1ee"); g.addColorStop(1, "#f3a6c8");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + bx * s, y + by * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
}

/** Length of feeder track (px along the arm) needed for n people waiting in it. */
export function armNeed(L, n) {
  return n > 0 ? L.island.trackW * 0.5 + 4 + Math.ceil(n / L.island.lanes) * L.step + L.br * 0.4 : 0;
}

/** Points of an arm's centre line from the ring out to distance len. */
function armPts(arm, len) {
  const out = [arm.pts[0]];
  for (let i = 1; i < arm.pts.length; i++) {
    if (arm.cum[i] <= len) { out.push(arm.pts[i]); continue; }
    const a = arm.pts[i - 1], b = arm.pts[i];
    const u = (len - arm.cum[i - 1]) / (arm.cum[i] - arm.cum[i - 1] || 1);
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    break;
  }
  return out;
}

/**
 * Static scene. `armLens` (px, one per feeder) draws each feeder only as long as its
 * line of people, so no empty feeder track shows; omit it for full-length feeders.
 */
export function drawBackground(ctx, L, armLens = null) {
  const { grass: g, road: rd, carArea: ca } = L;
  ctx.fillStyle = P.carpark; ctx.fillRect(0, 0, L.w, L.h);
  ctx.fillStyle = P.carpark; ctx.fillRect(ca.x, ca.y, ca.w, ca.h);
  const gg = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
  gg.addColorStop(0, "#BEE556"); gg.addColorStop(1, P.grass);
  ctx.fillStyle = gg; ctx.fillRect(g.x, g.y, g.w, g.h);
  // road
  ctx.fillStyle = "#ffffff"; ctx.fillRect(rd.x, rd.y - 4, rd.w, rd.h + 8);
  ctx.fillStyle = P.road; ctx.fillRect(rd.x, rd.y, rd.w, rd.h);
  ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(rd.x, rd.y + 3, rd.w, 2);
  for (const b of L.bays) {
    ctx.fillStyle = "rgba(0,0,0,.08)"; roundRect(ctx, b.x + 2, b.y + 3, b.w, b.h, 10); ctx.fill();
    ctx.fillStyle = P.bay; roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = P.bayStroke; ctx.stroke();
  }
  // feeder arms + ring + exit stub, drawn as one shape: white walls first, then the floor
  const { cx, cy, Ro, Ri, Rm, trackW } = L.island;
  const paths = (c) => {
    L.arms.forEach((arm, k) => {
      const len = armLens ? armLens[k] : Infinity;
      if (len <= 0) return;
      const pts = armPts(arm, len);
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (const q of pts) c.lineTo(q.x, q.y);
      c.lineWidth = arm.w + c.__extra; c.stroke();
    });
    c.beginPath(); c.arc(cx, cy, Rm, 0, Math.PI * 2); c.lineWidth = trackW + c.__extra; c.stroke();
    c.beginPath(); c.moveTo(cx, cy + Rm); c.lineTo(cx, L.laneBottom.y); c.lineWidth = trackW * 0.55 + c.__extra; c.stroke();
  };
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(31,59,44,.28)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  ctx.strokeStyle = "#FFFFFF"; ctx.__extra = 10; paths(ctx);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#E3E8EC"; ctx.__extra = 0; paths(ctx);
  ctx.restore();
  // the hole in the middle of the ring: grass with a white rim
  ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(cx, cy, Ri + 1, 0, Math.PI * 2); ctx.fill();
  const ig = ctx.createRadialGradient(cx - Ri * 0.3, cy - Ri * 0.3, 2, cx, cy, Ri);
  ig.addColorStop(0, "#C4EA5E"); ig.addColorStop(1, P.grassDeep);
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(cx, cy, Ri - 4, 0, Math.PI * 2); ctx.fill();
  // blossom trees at each end of the road
  const ts = clamp(Math.min(L.road.h * 0.26, (rd.w / 2 - Ro) * 0.25), 12, 40);
  drawTree(ctx, rd.x + ts * 0.85, rd.y - ts * 0.7, ts);
  drawTree(ctx, rd.x + rd.w - ts * 0.85, rd.y - ts * 0.7, ts);
}
