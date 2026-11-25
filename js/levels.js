// Loads the campaign JSON (cached by the service worker for offline play).
const cache = new Map();
let indexPromise = null;

export function loadIndex() {
  if (!indexPromise) indexPromise = fetch("levels/index.json").then((r) => r.json());
  return indexPromise;
}

export async function loadLevel(id) {
  if (!cache.has(id)) {
    const p = fetch(`levels/${String(id).padStart(2, "0")}.json`).then((r) => {
      if (!r.ok) throw new Error("level " + id + " missing");
      return r.json();
    });
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return cache.get(id);
}

export async function preloadAll() {
  const index = await loadIndex();
  await Promise.all(index.map((e) => loadLevel(e.id)));
  return index;
}
