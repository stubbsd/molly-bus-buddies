// Canvas renderer: layout maths and original procedural artwork.
import { SLOTS } from "./slots.js";

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

export function computeLayout(w, h, insets, peopleCount = 30) {
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
    L.car = { x: Math.max(insets.left, (w - Math.min(w, 760)) / 2), y: grassH + roadH + 8, w: Math.min(w, 760) - insets.left - insets.right, h: h - grassH - roadH - 8 - ctrlH };
    L.hudBottom = st + 76;
  } else {
    const pw = Math.round(w * 0.5);
    const roadH = Math.round(clamp(h * 0.17, 100, 160));
    L.grass = { x: 0, y: 0, w: pw, h: h - roadH - sb };
    L.road = { x: 0, y: h - roadH - sb, w: pw, h: roadH + sb };
    L.carArea = { x: pw, y: 0, w: w - pw, h };
    L.car = { x: pw + 10, y: st + 74, w: w - pw - 20 - insets.right, h: h - st - 74 - ctrlH };
    L.hudBottom = st + 80;
  }
  // Loop + queue geometry inside the grass band.
  const g = L.grass;
  const top = L.hudBottom + 4;
  const bottom = g.y + g.h - 10;
  const Ruo = Math.max(70, Math.min(g.w / 2 - 30, (bottom - top - 16) / 1.5));
  const br = clamp(Ruo * 0.058, 5, 13);
  const laneW = br * 2.05;
  const lanes = 3;              // people stand three abreast in the queue channel
  const step = br * 2.05;       // spacing between ranks along the channel
  const cx = g.x + g.w / 2;
  const cy = top + Ruo;
  const RuIn = Ruo - lanes * laneW - 4;
  const trackW = br * 2.7;
  const R = RuIn - 8 - trackW / 2;
  L.island = { cx, cy, R, islandR: R - trackW / 2 - 2, trackW, Ruo, RuIn, lanes, laneW };
  L.br = br; L.step = step;
  L.door = { x: cx, y: cy + R };
  L.laneBottom = { x: cx, y: L.road.y + 6 };
  // Queue ranks follow the horseshoe from 8 o'clock (150°) clockwise over the top to 4 o'clock (390°).
  const midR = (RuIn + 2 + Ruo - 2) / 2;
  L.queueRanks = Math.floor((rad(240) * midR) / step);
  L.queueGeom = { cx, cy, r0: RuIn + 2 + laneW / 2, midR };
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
  // Parked buses: as large as possible without neighbours touching.
  const c = L.car;
  const cs = 0.16 * c.w, rs = 0.18 * c.h;
  const a40 = rad(40);
  // perpendicular gap between parallel neighbours in a column (row step) and across columns
  const perpRow = Math.abs(rs * Math.sin(a40) - 0.02 * c.w * Math.cos(a40));
  const perpCol = cs * Math.cos(a40);
  // Neighbours in a column may just touch, like toy buses parked nose to tail.
  let W = Math.min(perpRow * 1.05, perpCol * 0.86, L.bayBus.wid * 1.05);
  let Lb = Math.min(W * 2.3, L.bayBus.len * 1.1);
  Lb = Math.min(Lb, (0.24 * c.w * 0.95 - 0.77 * W) / 0.64, (0.1 * c.h + 14) / 0.4);
  W = Math.min(W, 50); Lb = Math.min(Lb, 118);
  L.parkBus = { len: Lb, wid: W, hit: Math.max(22, W * 0.75) };
  return L;
}

export function slotPos(L, slotId) {
  const s = SLOTS[slotId];
  return { x: L.car.x + s.x * L.car.w, y: L.car.y + s.y * L.car.h, angle: s.angle };
}

export function queuePoint(L, i) {
  const { cx, cy, r0, midR } = L.queueGeom;
  const lanes = L.island.lanes;
  let rank = Math.floor(i / lanes), lane = i % lanes;
  if (rank >= L.queueRanks) { rank = L.queueRanks - 1; lane = lanes - 1; }
  const a = rad(150 + 1.2 + ((rank + 0.5) * L.step * 180) / (Math.PI * midR));
  const r = r0 + lane * L.island.laneW;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function loopXY(L, angleDeg) {
  const { cx, cy, R } = L.island;
  return { x: cx + R * Math.cos(rad(angleDeg)), y: cy + R * Math.sin(rad(angleDeg)) };
}

/** Hit test parked buses: returns id of the closest bus whose (expanded) body contains the point. */
export function hitBus(L, parked, x, y) {
  let best = null, bestD = Infinity;
  const { len, wid, hit } = L.parkBus;
  for (const b of parked) {
    const p = slotPos(L, b.slot);
    const a = rad(p.angle);
    const dx = x - p.x, dy = y - p.y;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= Math.max(wid / 2 + 4, hit) && Math.abs(ly) <= Math.max(len / 2 + 4, hit)) {
      const d = Math.hypot(dx, dy);
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
  ctx.fillStyle = "#2A3340";
  ctx.font = `800 ${Math.max(13, Wd * 0.48)}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 0, Lh * 0.1);
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

export function drawBackground(ctx, L) {
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
  // island, loop track, queue channel, boarding lane
  const { cx, cy, R, islandR, trackW, Ruo, RuIn } = L.island;
  // lane
  ctx.fillStyle = "#ffffff";
  const lw = trackW + 6;
  roundRect(ctx, cx - lw / 2, cy + R - 4, lw, L.laneBottom.y - (cy + R) + 4, lw / 2); ctx.fill();
  ctx.fillStyle = "#D7DCE3";
  roundRect(ctx, cx - trackW / 2, cy + R, trackW, L.laneBottom.y - (cy + R), trackW / 2); ctx.fill();
  // queue channel (horseshoe from 150° to 30° over the top)
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Ruo - RuIn + 8;
  ctx.beginPath(); ctx.arc(cx, cy, (Ruo + RuIn) / 2, rad(150), rad(390)); ctx.stroke();
  ctx.strokeStyle = P.channel; ctx.lineWidth = Ruo - RuIn;
  ctx.beginPath(); ctx.arc(cx, cy, (Ruo + RuIn) / 2, rad(150), rad(390)); ctx.stroke();
  // short join from queue front to the loop at 8 o'clock
  ctx.strokeStyle = "#D7DCE3"; ctx.lineWidth = trackW * 0.8;
  ctx.beginPath();
  ctx.moveTo(cx + RuIn * Math.cos(rad(150)), cy + RuIn * Math.sin(rad(150)));
  ctx.lineTo(cx + R * Math.cos(rad(150)), cy + R * Math.sin(rad(150))); ctx.stroke();
  // loop track
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = trackW + 6;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#D7DCE3"; ctx.lineWidth = trackW;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  // island
  const ig = ctx.createRadialGradient(cx - islandR * 0.3, cy - islandR * 0.3, 2, cx, cy, islandR);
  ig.addColorStop(0, "#B9E35A"); ig.addColorStop(1, P.grassDeep);
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(cx, cy, islandR, 0, Math.PI * 2); ctx.fill();
  // small flower bed on the island
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? "#fff3a8" : "#ffffff";
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * islandR * 0.45, cy + Math.sin(a) * islandR * 0.45, Math.max(2, islandR * 0.06), 0, Math.PI * 2); ctx.fill();
  }
  // blossom trees at each end of the road
  const ts = clamp(Math.min(L.road.h * 0.26, (rd.w / 2 - Ruo) * 0.7), 12, 40);
  drawTree(ctx, rd.x + ts * 0.85, rd.y - ts * 0.7, ts);
  drawTree(ctx, rd.x + rd.w - ts * 0.85, rd.y - ts * 0.7, ts);
}
