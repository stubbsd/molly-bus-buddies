# Molly's Bus Buddies

A gentle planning puzzle for Molly, aged 5. Groups of people board buses of their own colour. The skill is choosing which bus to send into one of five loading bays, and in which order, so that the line keeps moving and the bays never fill up.

The game is original and ad-free. It has no timer, no tracking, no coins and no in-app purchases. It is a static HTML, CSS and JavaScript web app that works offline after the first load, and can be added to the home screen on iPhone and iPad.

Play it at https://stubbsd.github.io/molly-bus-buddies/ (GitHub Pages, served from `main`).

## Rules (v2)

1. **Roof arrows.** Each parked bus has a white arrow on its roof and can only drive out that way. If another bus is in front of it, it bumps gently and stays put (no move, nothing to undo).
2. **Front of the queue only.** People walk round the circle in order. Only the person at the front (with the soft glow) can hop on, onto the earliest-arrived bay bus of their colour. A wrong colour at the front holds everyone up.
3. **Seat countdowns.** The yellow badge on a bay bus shows its empty seats. At 0 it drives off and frees the bay.
4. **Mystery buses.** Dark buses with a `?` show their colour once their road is clear.
5. **Out of room.** If all five bays are full and another bus is sent out, a gentle "Out of room!" card offers Try again or Undo.

`SPEC.md` is the original v1 build specification. Where it differs from the rules above (boarding by overtaking on the loop, the "noBay" shake, seat dots), the rules above and `js/game.js` win. The v2 mockups are in `docs/reference/v2-mockup-*.png`.

## Play it locally

No build step. Serve the folder as static files and open it in a browser:

```
python3 -m http.server 8765 --bind 127.0.0.1
# then open http://127.0.0.1:8765/
```

`?level=N` jumps straight to a level (handy for testing). Progress is saved on the device only (`localStorage` key `mollysBusBuddies.v2`; v1 progress is migrated, keeping the sound setting and unlocked levels but not a half-played board).

## Check it

All checks use Node 18+ only, nothing to install.

```
node --test tests/*.test.mjs     # unit tests (rules, settle, undo, levels, PWA, storage)
node tools/solve.mjs             # official solver over all 12 levels, writes tools/solver-report.md
node tools/design-levels.mjs     # seeded level designer (rewrites levels/*.json; dev only)
node tools/browser-check.mjs     # needs Chrome + the local server above: screenshots + offline test
node tools/write-sw.mjs          # regenerate the service-worker precache list after adding files
```

Remember to bump `VERSION` in `sw.js` whenever a cached file changes, so devices pick up the update.

## Layout of the code

- `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js` — the PWA shell.
- `js/game.js` — the official rules (settle, moves, undo, win, stuck, out of room). Shared by the game, solver and tests.
- `js/slots.js` — the shared parking slot map (roof-arrow direction and what blocks each space). `js/render.js` — canvas layout and artwork. `js/main.js` — input, animation, screens. `js/ui.js`, `js/storage.js`, `js/levels.js`, `js/audio.js` — helpers.
- `levels/` — the 12 campaign levels (source of truth). `tools/solver-report.md` — proof and metrics.
- `docs/screenshots/` — iPhone and iPad renders from `tools/browser-check.mjs`.
