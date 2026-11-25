# Acceptance notes

Run on 25 November 2026, 21:54 (Europe/London) on a Linux build machine, headless Google Chrome 156.0.8078.47, Node v22.23.2.

## Automated

- **Unit tests** — `node --test tests/*.test.mjs`: 37 tests, 37 pass (settle, rules, undo/restart/resume, levels schema + metrics + solver, PWA files, storage).
- **Solver** — `node tools/solve.mjs`: all 12 levels solvable, M = B on every level, a tempting wrong move on levels 4–12, campaign rule holds. Two minimal tunings (levels 5 and 12). Full detail in `tools/solver-report.md`.
- **Browser** — `node tools/browser-check.mjs` against `python3 -m http.server` on localhost:
  - Level 4 documented trap (`r1, r2, r3, y1, y2`) shows "A bit stuck? Try Undo."
  - Level 1 played to the win: "Well done, Molly!" card with Next level / Levels.
  - Level 12 played through the UI along the solver path, with a page reload after 7 moves and "Play" resuming the exact position: won, and saved as complete.
  - Service worker `bus-buddies-v1` activated and controlling, 34 files precached.
  - **Offline** (DevTools network set to offline): levels 1, 7 and 12 load and start, and sounds come from the cache.

## Screenshots (docs/screenshots/)

1. `01-iphone-title.png` — iPhone 390×844 title screen
2. `02-iphone-level1.png` — iPhone level 1 after load
3. `03-iphone-level6-boarding.png` — iPhone level 6, buses in bays, seat dots filling
4. `04-ipad-portrait-level1.png` — iPad portrait 834×1194
5. `05-ipad-landscape-level1.png` — iPad landscape 1194×834, two-pane layout
6. Extras: level 12 (deepest car park), level 4 stuck prompt, iPhone SE 375×667 level 11, level 1 win, offline level 2, and `00-compare-with-mockup.png` side by side with the approved mockup.

## Not yet done here

- Chrome Lighthouse PWA audit (it needs Lighthouse installed from npm, which this build avoided). The installability parts it checks (manifest, icons, service worker, offline start URL) are covered by the tests above.
- Real-device checks in Safari on iPhone and iPad (Add to Home Screen, Airplane Mode cold start, safe areas): SPEC.md §9.5, to do once the game is hosted on HTTPS.
