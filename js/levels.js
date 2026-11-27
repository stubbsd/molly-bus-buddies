// Loads the packed campaign (one file, cached by the service worker for offline play).
let campaignPromise = null;

export function loadCampaign() {
  if (!campaignPromise) {
    campaignPromise = fetch("levels/campaign.json").then((r) => {
      if (!r.ok) throw new Error("campaign missing");
      return r.json();
    }).then((data) => {
      const levels = Array.isArray(data) ? data : data.levels;
      if (!Array.isArray(levels) || !levels.length) throw new Error("campaign empty");
      return levels;
    });
    campaignPromise.catch(() => { campaignPromise = null; });
  }
  return campaignPromise;
}

export async function loadIndex() {
  const levels = await loadCampaign();
  return levels.map((l) => ({ id: l.id, name: l.name }));
}

export async function loadLevel(id) {
  const levels = await loadCampaign();
  const l = levels.find((x) => x.id === id);
  if (!l) throw new Error("level " + id + " missing");
  return l;
}

export async function preloadAll() {
  return loadIndex();
}
