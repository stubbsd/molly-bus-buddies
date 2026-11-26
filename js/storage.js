// On-device progress only (SPEC.md §2.5). Single localStorage key.
// v2: the levels were redesigned for the new rules. Old (v1) progress is migrated:
// sound setting and unlocked levels are kept; a half-played v1 level is dropped
// because its saved board no longer matches the new level.
export const STORAGE_KEY = "mollysBusBuddies.v2";
export const LEGACY_KEYS = ["mollysBusBuddies.v1"];

export function defaultProgress() {
  return { soundMuted: false, completedLevels: [], currentLevel: 1, inProgress: null };
}

export function sanitise(raw) {
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  return {
    soundMuted: raw.soundMuted === true,
    completedLevels: Array.isArray(raw.completedLevels) ? raw.completedLevels.filter((n) => Number.isInteger(n) && n >= 1 && n <= 12) : [],
    currentLevel: Number.isInteger(raw.currentLevel) && raw.currentLevel >= 1 && raw.currentLevel <= 12 ? raw.currentLevel : 1,
    inProgress: raw.inProgress && typeof raw.inProgress === "object" && Number.isInteger(raw.inProgress.levelId) && raw.inProgress.state ? raw.inProgress : null,
  };
}

export function migrateLegacy(raw) {
  const p = sanitise(raw);
  p.inProgress = null;
  return p;
}

export function loadProgress(storage = globalThis.localStorage) {
  try {
    const now = storage.getItem(STORAGE_KEY);
    if (now !== null) return sanitise(JSON.parse(now));
    for (const k of LEGACY_KEYS) {
      const old = storage.getItem(k);
      if (old !== null) {
        const p = migrateLegacy(JSON.parse(old));
        saveProgress(p, storage);
        return p;
      }
    }
    return defaultProgress();
  } catch { return defaultProgress(); }
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage full or blocked: keep playing */ }
}

export function isUnlocked(progress, id) {
  return id === 1 || progress.completedLevels.includes(id - 1);
}
