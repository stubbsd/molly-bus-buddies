// Small optional sounds. Unlocked on first tap; one switch mutes everything.
const NAMES = ["tap", "shake", "board", "depart", "win"];
let ctx = null;
const buffers = {};
let muted = false;
let lastBoard = 0;

export function setMuted(m) { muted = !!m; }
export function isMuted() { return muted; }

export function unlock() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  for (const n of NAMES) {
    fetch(`audio/${n}.wav`).then((r) => r.arrayBuffer())
      .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .then((buf) => { buffers[n] = buf; })
      .catch(() => {});
  }
}

export function play(name, volume = 0.5) {
  if (muted || !ctx || !buffers[name]) return;
  if (name === "board") { // keep a stream of boarders soft
    const now = performance.now();
    if (now - lastBoard < 90) return;
    lastBoard = now;
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.buffer = buffers[name];
  src.connect(gain).connect(ctx.destination);
  src.start();
}
