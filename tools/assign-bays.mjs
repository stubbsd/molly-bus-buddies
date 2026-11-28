#!/usr/bin/env node
// Dev-only: give every level its number of loading bays (3 to 5, never falling).
// A level needs at least BP + 1 bays (one spare, so several buses can be out at
// once) and enough that a careful but short-sighted player wins at least 60% of
// games, so no level is brutal. The count only ever rises as the campaign goes on.
// Rewrites levels/campaign.json in the same layout.
//   node tools/assign-bays.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { model, search, carefulWinRate } from "./solve.mjs";
import { BAY_COUNT } from "../js/slots.js";

export const MIN_LEVEL_BAYS = 3;
export const baysFor = (bp) => Math.max(MIN_LEVEL_BAYS, Math.min(BAY_COUNT, bp + 1));
export const FAIR = 0.9;

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = new URL("../levels/campaign.json", import.meta.url);
  const data = JSON.parse(readFileSync(file, "utf8"));
  const levels = Array.isArray(data) ? data : data.levels;
  let floor = MIN_LEVEL_BAYS;
  const out = levels.map((l) => {
    const { bays, ...rest } = l;
    const m = model({ ...rest, bays: BAY_COUNT });
    let bp = null;
    for (let k = 1; k <= BAY_COUNT; k++) if (search(m, k).ok) { bp = k; break; }
    if (bp === null) throw new Error("level " + l.id + " is not solvable");
    let need = baysFor(bp);
    while (need < BAY_COUNT && carefulWinRate(model({ ...rest, bays: need }), 400) < FAIR) need++;
    floor = Math.max(floor, need);
    // keep "bays" right after "name" so the file reads well
    const o = {};
    for (const [k, v] of Object.entries(rest)) { o[k] = v; if (k === "name") o.bays = floor; }
    return o;
  });
  const body = "{\n  \"levels\": [\n" + out.map((l) => "    " + JSON.stringify(l)).join(",\n") + "\n  ]\n}\n";
  writeFileSync(file, body);
  const hist = {};
  for (const l of out) hist[l.bays] = (hist[l.bays] || 0) + 1;
  console.log("bays per level written:", JSON.stringify(hist));
}
