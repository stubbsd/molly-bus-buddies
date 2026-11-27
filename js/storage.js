// On-device progress only (SPEC.md §2.5). Single localStorage key.
// v4: boarding is from the bottom of the ring (people who cannot hop on go round). Older progress is migrated:
// sound setting and unlocked levels are kept; a half-played v1 level is dropped
// because its saved board no longer matches the new level.
export const STORAGE_KEY = "mollysBusBuddies.v4";
export const LEGACY_KEYS = ["mollysBusBuddies.v3", "mollysBusBuddies.v2", "mollysBusBuddies.v1"];
export const LEVEL_COUNT = 100;

export function defaultProgress() {
  return { soundMuted: false, completedLevels: [], currentLevel: 1, inProgress: null };
}

function inCampaign(n) {
  return Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT;
}

export function sanitise(raw) {
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  return {
    soundMuted: raw.soundMuted === true,
    completedLevels: Array.isArray(raw.completedLevels) ? raw.completedLevels.filter(inCampaign) : [],
    currentLevel: inCampaign(raw.currentLevel) ? raw.currentLevel : 1,
    inProgress: raw.inProgress && typeof raw.inProgress === "object" && inCampaign(raw.inProgress.levelId) && raw.inProgress.state ? raw.inProgress : null,
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
