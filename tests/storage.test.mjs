import { test } from "node:test";
import assert from "node:assert/strict";
import { loadProgress, saveProgress, defaultProgress, isUnlocked, STORAGE_KEY, LEGACY_KEYS } from "../js/storage.js";

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

test("older progress migrates: sound and unlocks kept, the old half-played board dropped", () => {
  assert.equal(STORAGE_KEY, "mollysBusBuddies.v3");
  assert.deepEqual(LEGACY_KEYS, ["mollysBusBuddies.v2", "mollysBusBuddies.v1"]);
  const s = mem();
  s.setItem(LEGACY_KEYS[0], JSON.stringify({ soundMuted: true, completedLevels: [1, 2, 3], currentLevel: 4, inProgress: { levelId: 4, state: { queue: [] }, undoStack: [] } }));
  const p = loadProgress(s);
  assert.equal(p.soundMuted, true);
  assert.deepEqual(p.completedLevels, [1, 2, 3]);
  assert.equal(p.inProgress, null);
  assert.ok(s.m.has(STORAGE_KEY), "migrated copy saved under the v3 key");
  // the current key wins once present
  saveProgress({ ...defaultProgress(), completedLevels: [1] }, s);
  assert.deepEqual(loadProgress(s).completedLevels, [1]);
});
