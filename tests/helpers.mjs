import { readFileSync } from "node:fs";
export const ROOT = new URL("../", import.meta.url);
export const readText = (p) => readFileSync(new URL(p, ROOT), "utf8");

let campaign = null;
export function loadCampaign() {
  if (!campaign) {
    const data = JSON.parse(readText("levels/campaign.json"));
    campaign = Array.isArray(data) ? data : data.levels;
  }
  return campaign;
}
export const loadLevel = (id) => {
  const l = loadCampaign().find((x) => x.id === id);
  if (!l) throw new Error("level " + id + " missing");
  return l;
};
export const allLevels = () => loadCampaign().slice();
export function placeBus(state, bus, bayIndex, filled = 0) {
  state.parked = state.parked.filter((b) => b.id !== bus.id);
  state.tick += 1;
  state.bays[bayIndex] = { id: bus.id, colour: bus.colour, capacity: bus.capacity, filled, arrivedAt: state.tick };
}
