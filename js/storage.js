// On-device progress only (SPEC.md §2.5). Single localStorage key.
export const STORAGE_KEY = "mollysBusBuddies.v1";

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

export function loadProgress(storage = globalThis.localStorage) {
  try { return sanitise(JSON.parse(storage.getItem(STORAGE_KEY))); } catch { return defaultProgress(); }
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage full or blocked: keep playing */ }
}

export function isUnlocked(progress, id) {
  return id === 1 || progress.completedLevels.includes(id - 1);
}
