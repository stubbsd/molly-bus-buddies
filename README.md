# Molly's Bus Buddies

A gentle planning puzzle for Molly, aged 5. Groups of people board buses of their own colour. The skill is choosing which bus to send into one of five loading bays, and in which order, so that the walking loop never gets stuck.

The game is original, ad-free, has no timer, no tracking and no in-app purchases. It is a static HTML, CSS and JavaScript web app that works offline after the first load, and can be added to the home screen on iPhone and iPad.

**Implement per SPEC.md.**

That document is the complete build specification: rules, layout (see `docs/reference/approved-mockup.jpg`), data model, all twelve campaign levels, the solver/validator, and acceptance tests. A prototype of the solver and the level data lives in `tools/prototype/`. Levels 1–4 have already been proved solvable by that prototype; levels 5–12 still need official solver proof as described in SPEC.md.

This repository is private. The game is now built in it (see below).

## Play it

No build step. Serve the folder as static files and open it in a browser:

```
python3 -m http.server 8765 --bind 127.0.0.1
# then open http://127.0.0.1:8765/
```

`?level=N` jumps straight to a level (handy for testing). Progress is saved on the device only (`localStorage` key `mollysBusBuddies.v1`).

To put it on an iPhone or iPad it must be served over HTTPS (the service worker and Add to Home Screen need it). See "Hosting" below.

## Check it

All checks use Node 18+ only, nothing to install.

```
node --test tests/*.test.mjs     # unit tests (rules, settle, undo, levels, PWA, storage)
node tools/solve.mjs             # official solver over all 12 levels, writes tools/solver-report.md
node tools/browser-check.mjs     # needs Chrome + the local server above: screenshots + offline test
node tools/write-sw.mjs          # regenerate the service-worker precache list after adding files
```

Remember to bump `VERSION` in `sw.js` whenever a cached file changes, so devices pick up the update.

## Layout of the code

- `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js` — the PWA shell.
- `js/game.js` — the official rules (settle, moves, undo, win, stuck). Shared by the game, solver and tests.
- `js/slots.js` — the shared parking slot map. `js/render.js` — canvas layout and artwork. `js/main.js` — input, animation, screens. `js/ui.js`, `js/storage.js`, `js/levels.js`, `js/audio.js` — helpers.
- `levels/` — the 12 campaign levels (source of truth). `tools/solver-report.md` — proof and metrics, including the two tunings.
- `docs/screenshots/` — iPhone and iPad renders, and a side-by-side with the approved mockup.

## Hosting

The repository is private. Free ways to put the game on an HTTPS address without making the repo public:

- **Netlify** (free plan): drag the folder onto Netlify Drop, or connect the private GitHub repo. Static, HTTPS, no build command needed.
- **Cloudflare Pages** (free plan): connect the private repo, build command empty, output directory `/`.
- **Vercel** (free Hobby plan): import the private repo as a static site with no framework and no build command.
- **GitHub Pages** is only free for public repositories. Publishing Pages from a private repository needs a paid GitHub plan (Pro, Team or Enterprise).
