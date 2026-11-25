import { readFileSync } from "node:fs";
export const ROOT = new URL("../", import.meta.url);
export const readText = (p) => readFileSync(new URL(p, ROOT), "utf8");
export const loadLevel = (id) => JSON.parse(readText(`levels/${String(id).padStart(2, "0")}.json`));
export const allLevels = () => JSON.parse(readText("levels/index.json")).map((e) => loadLevel(e.id));
export function placeBus(state, bus, bayIndex, filled = 0) {
  state.parked = state.parked.filter((b) => b.id !== bus.id);
  state.tick += 1;
  state.bays[bayIndex] = { id: bus.id, colour: bus.colour, capacity: bus.capacity, filled, arrivedAt: state.tick };
}
