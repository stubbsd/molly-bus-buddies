// Official shared parking slot map (SPEC.md §5.2). Do not change per level.
// x, y are normalised inside the car-park band; angle is degrees clockwise
// from up and is the roof-arrow / exit direction.
export const SLOTS = Object.freeze({
  LW0: { x: 0.22, y: 0.10, angle: 40, exitBlockedBy: [] },
  LC0: { x: 0.38, y: 0.10, angle: 40, exitBlockedBy: [] },
  RC0: { x: 0.62, y: 0.10, angle: -40, exitBlockedBy: [] },
  RE0: { x: 0.78, y: 0.10, angle: -40, exitBlockedBy: [] },
  LW1: { x: 0.20, y: 0.28, angle: 40, exitBlockedBy: ["LW0"] },
  LC1: { x: 0.36, y: 0.28, angle: 40, exitBlockedBy: ["LC0"] },
  RC1: { x: 0.64, y: 0.28, angle: -40, exitBlockedBy: ["RC0"] },
  RE1: { x: 0.80, y: 0.28, angle: -40, exitBlockedBy: ["RE0"] },
  LW2: { x: 0.18, y: 0.46, angle: 40, exitBlockedBy: ["LW1", "LW0"] },
  LC2: { x: 0.34, y: 0.46, angle: 40, exitBlockedBy: ["LC1", "LC0"] },
  RC2: { x: 0.66, y: 0.46, angle: -40, exitBlockedBy: ["RC1", "RC0"] },
  RE2: { x: 0.82, y: 0.46, angle: -40, exitBlockedBy: ["RE1", "RE0"] },
  LW3: { x: 0.16, y: 0.64, angle: 40, exitBlockedBy: ["LW2", "LW1", "LW0"] },
  LC3: { x: 0.32, y: 0.64, angle: 40, exitBlockedBy: ["LC2", "LC1", "LC0"] },
  RC3: { x: 0.68, y: 0.64, angle: -40, exitBlockedBy: ["RC2", "RC1", "RC0"] },
  RE3: { x: 0.84, y: 0.64, angle: -40, exitBlockedBy: ["RE2", "RE1", "RE0"] },
  LW4: { x: 0.14, y: 0.82, angle: 40, exitBlockedBy: ["LW3", "LW2", "LW1", "LW0"] },
  LC4: { x: 0.30, y: 0.82, angle: 40, exitBlockedBy: ["LC3", "LC2", "LC1", "LC0"] },
  RC4: { x: 0.70, y: 0.82, angle: -40, exitBlockedBy: ["RC3", "RC2", "RC1", "RC0"] },
  RE4: { x: 0.86, y: 0.82, angle: -40, exitBlockedBy: ["RE3", "RE2", "RE1", "RE0"] },
});

export const COLOURS = Object.freeze(["red", "yellow", "blue", "green", "purple", "pink"]);
export const CAPACITIES = Object.freeze([3, 4, 6]);
export const BAY_COUNT = 5;
