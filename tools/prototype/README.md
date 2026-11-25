# Prototype solver

A starting point for the official validator required by SPEC.md §7. It implements the settle algorithm, blocking, breadth-first minimum-move search, and a peak-occupancy search for bay pressure.

This is **not** the game. It does not render anything and must not be shipped as a runtime dependency of the PWA.

## Run

From this folder, with Node 18 or later, no packages required:

```
node run.mjs          # all levels that load
node run.mjs 1 2 3 4  # prototype-verified levels only
node scan.mjs 4       # look for dead-end moves on a single level
```

## Status on 25 November 2026 (Europe/London)

- Levels 1–4 load, match people to seats, and are **solvable**. Minimum moves equal the bus counts (3, 4, 5, 6). Level 4 has a documented tempting wrong move (`y2` after `r1, r2, r3, y1`).
- Levels 5–12 load with matching people and seats and the designed metrics in SPEC.md §6, but they have **not** been proved. Grok Build must verify and, if needed, tune them with the official solver.
