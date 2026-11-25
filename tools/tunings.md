Two minimal tunings were needed. Levels 1–4 and 6–11 ship exactly as designed in SPEC.md §6.

1. **Level 5 — Long bus, short bus.** As designed (`RRRYYYBBBRRRRRRRRRRYYYYYYBBB`) it was solvable but had **no tempting wrong move**: the queue ended with the second blue run, so no position could leave six blues on the loop behind five red and yellow buses. No single change (adjacent queue swap, loop capacity 4–8, one slot move, slot swap or capacity swap) nor any pair of such changes fixed it. The smallest fix found by the tuner moves the final `BBB` run forward, between the first two yellows and the third:
   - before: `RRRYYYBBBRRRRRRRRRRYYYYYYBBB` (Q = 3, BP = 1, no trap)
   - after:  `RRRYYBBBYBBBRRRRRRRRRRYYYYYY` (Q = 4, BP = 2, trap: after `r1, r2, r3, y1`, sending `y2` gets stuck)
   - People and seats are unchanged (13 red, 9 yellow, 6 blue). BP now matches the designed intent of 2.
2. **Level 12 — Molly's master plan.** As designed it was solvable with M = 14 but its bay pressure was **3**, below level 11's 4 (SPEC.md §6.16 says to retune rather than accept a drop). One slot move fixes it: **`b2` (blue 3) moves from `RC1` to `RC3`**, behind `k2` on `RC2` and `g1` on `RC0`. BP is now 4, D stays 4, and M is still 14. No single change reached BP 5, so BP 4 is reported honestly.
