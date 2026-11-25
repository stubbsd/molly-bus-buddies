/**
 * Molly's Bus Buddies — campaign level data used by the prototype solver.
 *
 * Verification status (prototype, 25 November 2026, Europe/London):
 *   Levels 1–4: solved by tools/prototype (see README). Figures below for
 *   those levels are measured.
 *   Levels 5–12: designed with matching people/seats, intended metrics, and
 *   a difficulty ramp. Grok Build MUST prove them with the official solver
 *   and may make minimal tunings as SPEC.md §6 and §7 allow.
 */
import {
  parseQueue, assertPeopleMatchSeats, queueConflicts, maxBlockingDepth,
} from "./engine.mjs";

function L(p) {
  const level = { ...p, queue: typeof p.queue === "string" ? parseQueue(p.queue) : p.queue };
  assertPeopleMatchSeats(level);
  level._conflicts = queueConflicts(level.queue);
  level._depth = maxBlockingDepth(level.buses);
  return level;
}

export const LEVELS = [];

LEVELS.push(L({
  id: 1, name: "First ride",
  verifiedByPrototype: true,
  loopCapacity: 16,
  queue: "RRRYYYYYY",
  buses: [
    { id: "r1", colour: "red", capacity: 3, slot: "LW0" },
    { id: "y1", colour: "yellow", capacity: 3, slot: "RC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "RE0" },
  ],
  notes: "Any of the three unblocked buses can be sent first. One colour at a time works.",
}));

LEVELS.push(L({
  id: 2, name: "The shy bus",
  verifiedByPrototype: true,
  loopCapacity: 16,
  queue: "RRRRRRYYYYYY",
  buses: [
    { id: "r1", colour: "red", capacity: 3, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 3, slot: "LC0" },
    { id: "y1", colour: "yellow", capacity: 3, slot: "RC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "RC1" },
  ],
  notes: "y2 is blocked by y1. Tapping y2 gives a gentle shake.",
}));

LEVELS.push(L({
  id: 3, name: "New friends",
  verifiedByPrototype: true,
  loopCapacity: 14,
  queue: "RRRYYYBBBRRRYYY",
  buses: [
    { id: "r1", colour: "red", capacity: 3, slot: "LW0" },
    { id: "y1", colour: "yellow", capacity: 3, slot: "LC0" },
    { id: "b1", colour: "blue", capacity: 3, slot: "RC0" },
    { id: "r2", colour: "red", capacity: 3, slot: "RE0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
  ],
  notes: "A third colour and a second red and yellow run. The loop is still roomy.",
}));

// Prototype-verified (trap queue): after r1,r2,r3,y1, sending y2 jams all five bays
// with red/yellow buses while six blues occupy the loop and b1 cannot be sent.
LEVELS.push(L({
  id: 4, name: "Look ahead",
  verifiedByPrototype: true,
  loopCapacity: 6,
  queue: "RRRYYYYYBBBBBBRRRRRRRRRRYYYY",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "RC0" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
  ],
  notes: "Depth 2. 6-seaters sit until later runs. Tempting wrong move: y2 after r1,r2,r3,y1.",
}));

LEVELS.push(L({
  id: 5, name: "Long bus, short bus",
  verifiedByPrototype: false,
  loopCapacity: 6,
  queue: "RRRYYYBBBRRRRRRRRRRYYYYYYBBB",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "RC0" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
  ],
  notes: "Same fleet as level 4; a mid-queue blue run raises queue-order conflicts to 3.",
}));

LEVELS.push(L({
  id: 6, name: "A new colour",
  verifiedByPrototype: false,
  loopCapacity: 6,
  queue: "RRRYYYRBBBGGGRRRRRRRRRYYYYYYBBB",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
    { id: "g1", colour: "green", capacity: 3, slot: "RC0" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
  ],
  notes: "Fourth colour (green). g1 is an unblocked front-row decoy.",
}));

LEVELS.push(L({
  id: 7, name: "Busy platform",
  verifiedByPrototype: false,
  loopCapacity: 6,
  queue: "RRRYYYRBBBGGGRRRRRRRRRYYYYYYBBBGGG",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
    { id: "g1", colour: "green", capacity: 3, slot: "RC0" },
    { id: "g2", colour: "green", capacity: 3, slot: "RC1" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
  ],
  notes: "Second green bus and a longer queue. Eight buses, five bays.",
}));

LEVELS.push(L({
  id: 8, name: "The long way out",
  verifiedByPrototype: false,
  loopCapacity: 5,
  queue: "RRRYYYRBBBGGGRRRRRRRRRYYYBBBGGGYYYYYY",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y3", colour: "yellow", capacity: 3, slot: "LW3" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
    { id: "g1", colour: "green", capacity: 3, slot: "RC0" },
    { id: "g2", colour: "green", capacity: 3, slot: "RC1" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
  ],
  notes: "Depth 3 (y3 behind r1–r3). Tighter loop of 5.",
}));

LEVELS.push(L({
  id: 9, name: "Purple arrives",
  verifiedByPrototype: false,
  loopCapacity: 5,
  queue: "RRRYYYBBBGGGPPPRRRRRRRRRRYYYYYYBBBGGGYYYPPP",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y3", colour: "yellow", capacity: 3, slot: "LW3" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
    { id: "g1", colour: "green", capacity: 3, slot: "RC0" },
    { id: "g2", colour: "green", capacity: 3, slot: "RC1" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
    { id: "p1", colour: "purple", capacity: 6, slot: "RE1" },
  ],
  notes: "Fifth colour (purple). Ten buses.",
}));

LEVELS.push(L({
  id: 10, name: "Four at once",
  verifiedByPrototype: false,
  loopCapacity: 5,
  queue: "RRRYYYBBBGGGPPPRYYYYYYRRRRRRRRRBBBBBBGGGYYYPPP",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y3", colour: "yellow", capacity: 3, slot: "LW3" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
    { id: "g1", colour: "green", capacity: 3, slot: "RC0" },
    { id: "g2", colour: "green", capacity: 3, slot: "RC1" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
    { id: "b2", colour: "blue", capacity: 3, slot: "RC2" },
    { id: "p1", colour: "purple", capacity: 6, slot: "RE1" },
  ],
  notes: "Eleven buses. Intended bay pressure 4.",
}));

LEVELS.push(L({
  id: 11, name: "Pink too",
  verifiedByPrototype: false,
  loopCapacity: 5,
  queue: "RRRYYYBBBGGGPPPKKKRYYYYYYRRRRRRRRRBBBBBBGGGYYYPPPKKK",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y3", colour: "yellow", capacity: 3, slot: "LW3" },
    { id: "g2", colour: "green", capacity: 3, slot: "LW4" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
    { id: "g1", colour: "green", capacity: 3, slot: "RC0" },
    { id: "b2", colour: "blue", capacity: 3, slot: "RC1" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
    { id: "p1", colour: "purple", capacity: 6, slot: "RE1" },
    { id: "k1", colour: "pink", capacity: 6, slot: "LC2" },
  ],
  notes: "Sixth colour (pink). Depth 4 via g2 at LW4. Twelve buses.",
}));

LEVELS.push(L({
  id: 12, name: "Molly's master plan",
  verifiedByPrototype: false,
  loopCapacity: 5,
  queue: "RRRYYYBBBGGGPPPKKKRYYYYYYRRRRRRRRRBBBBBBGGGGGGYYYPPPKKKKKK",
  buses: [
    { id: "r1", colour: "red", capacity: 6, slot: "LW0" },
    { id: "r2", colour: "red", capacity: 4, slot: "LW1" },
    { id: "r3", colour: "red", capacity: 3, slot: "LW2" },
    { id: "y3", colour: "yellow", capacity: 3, slot: "LW3" },
    { id: "g2", colour: "green", capacity: 3, slot: "LW4" },
    { id: "y1", colour: "yellow", capacity: 6, slot: "LC0" },
    { id: "y2", colour: "yellow", capacity: 3, slot: "LC1" },
    { id: "g3", colour: "green", capacity: 3, slot: "LC2" },
    { id: "g1", colour: "green", capacity: 3, slot: "RC0" },
    { id: "b2", colour: "blue", capacity: 3, slot: "RC1" },
    { id: "k2", colour: "pink", capacity: 3, slot: "RC2" },
    { id: "b1", colour: "blue", capacity: 6, slot: "RE0" },
    { id: "p1", colour: "purple", capacity: 6, slot: "RE1" },
    { id: "k1", colour: "pink", capacity: 6, slot: "RE2" },
  ],
  notes: "Fourteen buses, intended bay pressure 5, the campaign finale.",
}));

export function getLevels(ids) {
  return ids ? LEVELS.filter((l) => ids.includes(l.id)) : LEVELS;
}
