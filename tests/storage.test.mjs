import { test } from "node:test";
import assert from "node:assert/strict";
import { loadProgress, saveProgress, defaultProgress, isUnlocked, STORAGE_KEY } from "../js/storage.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };

test("missing or malformed storage falls back to a clean default", () => {
  assert.deepEqual(loadProgress(mem()), defaultProgress());
  const s = mem(); s.setItem(STORAGE_KEY, "{not json");
  assert.deepEqual(loadProgress(s), defaultProgress());
});

test("progress round-trips and unlocks the next level", () => {
  const s = mem();
  saveProgress({ ...defaultProgress(), soundMuted: true, completedLevels: [1, 2], currentLevel: 3 }, s);
  const p = loadProgress(s);
  assert.equal(p.soundMuted, true);
  assert.ok(isUnlocked(p, 3));
  assert.ok(!isUnlocked(p, 4));
  assert.ok(isUnlocked(defaultProgress(), 1));
});
