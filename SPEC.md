# Molly's Bus Buddies — Build Specification

**Version:** 1.0  
**Date:** 25 November 2026 (Europe/London)  
**Audience:** Molly, aged 5, and her parent David  
**Language:** Plain UK English in every player-facing string  
**Status:** Ready for implementation. Levels 1–4 have been solved by the prototype validator in `tools/prototype/`. Levels 5–12 have complete designed data and must be proved and, if needed, tuned by the official solver.

---

## 0. Ready-to-paste prompt for Grok Build

Copy the block below into Grok Build on David's Mac. Do not run this build from any other machine unless David asks.

```
You are building Molly's Bus Buddies, an original, ad-free, offline-first planning puzzle for Molly, aged 5, and her parent David.

1. Clone the private GitHub repository stubbsd/molly-bus-buddies (or work in a checkout of it). Do all implementation work inside that repository. Do not replace, shrink, or overwrite SPEC.md, README.md, or docs/reference/.

2. Implement this specification as a static HTML, CSS and vanilla JavaScript PWA. There must be no build step, no bundler, no transpiler, no framework, and no runtime CDN or npm dependencies. The game must open as static files from any static HTTPS host (GitHub Pages, a Netlify drop, or a simple local HTTPS server).

3. Match the layout of docs/reference/approved-mockup.jpg. Use the stills in docs/reference/ only to understand structure: a dense U-shaped queue of capsule people feeding a circular walking loop around a grass island, a grey road with exactly five loading bays, and a pale mint car park of diagonally parked toy buses with roof arrows. Do not copy branding, assets, icons, typography, sounds, power-ups, VIP features, shop buttons, or artwork from the reference stills. All art, names and UI must be original.

4. Place game files at the repository root as specified in §2 of SPEC.md (index.html, styles.css, js/, levels/, icons/, audio/, sw.js, manifest.webmanifest, tests/, tools/).

5. Implement the official rules, settle algorithm, data model, parking slot map, and the 12-level campaign in §4–§6 exactly, including unlimited Undo of exact state, Restart, no timer, and the friendly "Try Undo" stuck prompt (never a harsh game over).

6. Expand tools/ into the official Node solver/validator required by §7. You may start from tools/prototype/, which already searches settled states. The prototype has verified Levels 1–4 as solvable with the minimum-move counts in the §6 table. Levels 5–12 have complete designed JSON and matching people-to-seats counts, but they are NOT yet proved. You must run the official solver on all 12 levels. If a level from 5–12 is unsolvable, lacks a tempting wrong move (levels 4+), or fails the "each level increases at least one difficulty metric without dropping the overall challenge" rule, make the smallest possible change to that level's queue order, loopCapacity, capacities or slot placement that fixes the failure, without making the level easier than the one before it. Write the solver output and any tunings into tools/solver-report.md.

7. Write and run the unit tests in §9. Run the solver over all 12 levels. Report: unit-test results, the solver report (solvable, minimum moves, bay pressure, tempting wrong move) for every level, and every level tweak you made.

8. Do not add advertisements, analytics, tracking, in-app purchases, account sign-in, App Store or other store prompts, or a timer.

Work until the acceptance checks in §9 that can be run in this environment pass, then summarise the results in plain UK English.
```

---

## 1. Overview and constraints

Molly runs a colourful bus station. People of the same colour travel together. Molly's job is to send the right buses into the loading bays, in the right order, so that everyone gets a seat on a bus of their own colour. The skill is planning: a bus can block another bus, a full set of bays can leave the walking loop stuck, and a bus sent too early can sit in a bay that is needed later.

This is an **original** game. It is inspired by the *kind* of puzzle in the reference video David provided, not a copy of that game.

**Hard constraints (non-negotiable):**

- Original name, original art, original UI. Do not copy branding, assets, characters, icons, typography, sounds, or layout decorations from the reference stills or from any commercial bus-sort game. The stills in `docs/reference/` are a layout reference only.
- No advertisements, no sponsored content, no ad SDKs.
- No tracking, no analytics, no telemetry, no crash reporters that phone home, no third-party fonts or scripts loaded from the network.
- No in-app purchases, no coins, no lives, no "VIP" bays, no consumable power-ups, no shop, no rewarded video.
- No App Store, Play Store, or other store prompts. No "rate us", no sign-in, no account, no social share sheet that leaves the game.
- Nothing scary, nothing sadistic, no harsh "Game Over", no jump scares, no time pressure. Failure is always recoverable.
- No timer, no countdown, no stars that punish slow play, no leaderboard.
- Unlimited Undo of the exact previous state, and a Restart control, on every level.
- All player-facing text in plain UK English (colour, not color; organise, not organize). Keep wording short and kind, suitable for a five-year-old, with a parent nearby.
- Offline after the first load. Progress saved only on the device, in `localStorage`.
- Must work as a home-screen web app on iPhone and iPad in Safari, in portrait, and on iPad also in landscape.

---

## 2. Technology, PWA and file layout

### 2.1 Stack

- Static **HTML5**, **CSS3**, and **vanilla ES modules** in JavaScript. No TypeScript transpilation is required (plain `.js` only).
- **No build step.** No webpack, Vite, Rollup, Parcel, or bundler of any kind. David (and Grok Build) must be able to play the game by serving the folder as static files.
- **No runtime CDN or npm dependencies.** The shipped game must not request any URL outside its own origin. Dev-only tests and the solver may use Node's standard library only (no `npm install` required to play, test, or solve).
- Rendering: **SVG or 2D canvas** (or a mix: SVG for chrome and buses, canvas for the walking people). Choose one primary renderer and stick to it. All artwork is original vector or procedurally drawn; do not rasterise third-party game assets.
- Fonts: system rounded fonts only, for example  
  `ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", system-ui, sans-serif`.  
  Do not load Google Fonts or any other hosted font.

### 2.2 File layout

Place these files in the repository root, alongside `SPEC.md`, `README.md`, and `docs/`:

```
index.html
styles.css
manifest.webmanifest
sw.js
js/
  main.js              # boot, screen routing
  render.js            # SVG or canvas drawing
  game.js              # rules, settle, moves, win/stuck
  levels.js            # loads / caches campaign JSON
  storage.js           # localStorage progress
  audio.js             # optional sounds, mute
  ui.js                # HUD, pause, prompts, level select
levels/
  index.json           # campaign manifest (ids, names)
  01.json … 12.json    # one file per level (see §5)
icons/
  icon-192.png
  icon-512.png
  apple-touch-icon.png # 180 × 180 PNG, used as apple-touch-icon
audio/                 # short bundled .mp3 or .wav, original or clearly public-domain
  board.mp3
  depart.mp3
  shake.mp3
  win.mp3
  tap.mp3
tests/
  rules.test.mjs
  settle.test.mjs
  levels.test.mjs
  undo.test.mjs
  pwa.test.mjs
tools/
  solve.mjs            # official solver/validator (§7)
  solver-report.md     # written by the solver run
  prototype/           # starting-point engine and level data
docs/
  reference/           # approved mockup + stills (do not copy art from stills)
```

`index.html` must be a complete document that loads `styles.css` and `js/main.js` as `type="module"`, declares the web manifest, and includes:

```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#B6E04A">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Register `sw.js` from `js/main.js` only when the page is served over HTTPS (or localhost).

### 2.3 Manifest

`manifest.webmanifest` must include at least:

- `name`: "Molly's Bus Buddies"
- `short_name`: "Bus Buddies"
- `start_url`: "./"
- `scope`: "./"
- `display`: "standalone"
- `orientation`: "any"
- `background_color` and `theme_color` matching the lime grass
- `icons`: 192×192 and 512×512 PNG, `purpose` `"any maskable"` as well as a plain `"any"` icon if a separate safe-inset asset is provided

### 2.4 Service worker and offline

- Use a **versioned precache** cache name, for example `bus-buddies-v1`. Every time a cached asset changes, bump the version string.
- Precache an explicit list of every local asset: `index.html`, `styles.css`, `manifest.webmanifest`, every file under `js/`, `levels/`, `icons/`, and `audio/`.
- On install: precache all listed URLs, then `self.skipWaiting()`.
- On activate: delete old caches whose names start with `bus-buddies-` but do not match the current version, then `self.clients.claim()`.
- Fetch handler: cache-first for precached assets; for a navigation request, fall back to the cached `index.html` so the app loads offline. Do not cache unknown cross-origin responses (there should be none).
- After the first successful online load, the game must work with the network off, including all twelve levels and sounds.
- When a new service-worker version is waiting, activate it on the next launch. Do not nag the child with an "update available" modal; a quiet refresh is enough.

### 2.5 Progress storage

Single `localStorage` key: `mollysBusBuddies.v1`.

```json
{
  "soundMuted": false,
  "completedLevels": [1, 2],
  "currentLevel": 3,
  "inProgress": null
}
```

`inProgress`, when present, is `{ "levelId": 3, "state": {…}, "undoStack": […], "redoStack": [] }` so a refresh mid-level resumes exactly. Save after every completed move, after Undo, after Restart, after level complete, and on `visibilitychange` / `pagehide`. If the stored JSON is missing or malformed, start from a clean default without crashing. Never store anything off-device.

### 2.6 Hosting

The folder must work, without a build:

- Dropped onto Netlify Drop, or
- Published as GitHub Pages from the repository root (or `/docs` only if you also keep a root copy of `index.html` — prefer the root), or
- Served by `npx serve` / `python3 -m http.server` for local checks (HTTPS is required for some PWA features on a device; GitHub Pages and Netlify provide it).

Relative URLs only. No absolute domain names in asset paths.

---

## 3. Layout, look and controls

Match `docs/reference/approved-mockup.jpg`. The screen is a portrait stack of three bands, plus a small HUD.

### 3.1 Colour and art direction

Original palette (use these tokens in CSS; do not sample typography or ornaments from the stills):

| Token | Hex | Use |
|---|---|---|
| `grass` | `#B6E04A` | Upper playfield |
| `grass-deep` | `#8BC53F` | Island and soft shadows |
| `road` | `#A8B0BC` | Middle loading strip |
| `bay` | `#EEF1F5` | Empty bay fill |
| `bay-stroke` | `#FFFFFF` | Bay outline |
| `carpark` | `#D9F1E6` | Lower pale mint parking area |
| `title` | `#FFFFFF` | Title and level label, with a soft `#1F3B2C` shadow |
| `red` | `#E23B2F` | People and buses |
| `yellow` | `#F5C518` | People and buses |
| `blue` | `#2F7DE1` | People and buses |
| `green` | `#3BA55C` | People and buses |
| `purple` | `#8B4ACB` | People and buses |
| `pink` | `#E85A9B` | People and buses |
| `button` | `#2F7DE1` | Undo / Restart discs |

People are glossy **capsule / bead** figures (rounded pillows or spheres with a small white highlight), packed tightly in colour groups. Buses are original toy-like isometric coaches: rounded body, two rows of windows, dark wheels, and a **white direction arrow on the roof** pointing along the bus's exit direction. Two small, simple blossom trees may sit at the left and right ends of the road, as in the approved mockup, drawn originally.

Do not add capacity numbers, VIP badges, mystery buses, plus-sign locked bays, or shop buttons. A bus in a bay may show remaining seats as small dots or a tiny "3 / 6" only if it stays calm and readable; it is optional on levels 1–2 and recommended from level 3.

### 3.2 Band 1 — lime upper field (queue and loop)

- Bright lime grass fills the top of the screen.
- A **dense U-shaped channel** of waiting people occupies the top of this band. Groups sit in tight colour runs, several beads abreast, following the U (left arm, top, right arm). This is the **queue**.
- In the opening of the U is a **circular walking loop** around a small grass island. This is where people walk once they have left the queue.
- A short **boarding lane** leaves the loop at the bottom (about 6 o'clock) and leads down onto the road, aimed at the loading bays.
- **Loop entrance:** the join at about 8 o'clock (lower left of the island), where the front of the U-queue meets the circle.
- Title **"Molly's Bus Buddies"** is centred near the top of the grass, with **"Level N"** just under it, both in rounded white letters. A **pause** control (two white bars in a small dark or white-outline pill) sits at the top right, clear of the notch.

The U-queue is visually packed and almost stationary. The loop is visibly a walking path: people on it move. When the loop has space, the person at the front of the queue (the person nearest the 8 o'clock entrance) steps onto the loop and starts walking.

### 3.3 Band 2 — grey road with five loading bays

- A horizontal grey asphalt strip, the full width of the screen, sits between the grass and the car park.
- It contains **exactly five** loading bays, evenly spaced, drawn as rounded rectangles with a light fill and a white outline, like parking boxes on a road. All five are always available. Never lock, hide, sell, or mark a bay with a plus sign.
- Number the bays **0–4 from left to right**. A bus sent from the car park always drives into the **leftmost empty bay**.
- A bus in a bay sits nose-forward (towards the grass / boarding lane) with its roof arrow pointing up.
- People who can board leave the loop at 6 o'clock, walk down the boarding lane, and hop into their matching bus.

### 3.4 Band 3 — pale mint car park

- The lower half of the screen is a pale mint parking field.
- Parked buses sit on a **two-wing herringbone**: a left wing angled about +40° (roof arrow up-right, towards the road) and a right wing angled about −40° (roof arrow up-left). This matches the approved mockup.
- Slot coordinates and exit-blocking rules are defined in §5. Empty slots are not drawn as harsh grids; simply leave a gap.
- Under the buses, two large circular **Undo** and **Restart** buttons sit side by side: blue discs with a simple white undo-arrow icon and a simple white restart / "from the top" icon, with the words "Undo" and "Restart" underneath. Below them, a short hint reads **"Choose a bus for the queue"** on the playing screen (change to "Nice planning, Molly!" only after a win, then return).

### 3.5 Screens and chrome

**Title screen.** The game name, a small original illustration of a colourful bus and a few bead-people, a large "Play" button (opens the first uncompleted level, or level 1), and a "Levels" button. Optional "How to play" with three quiet panels: (1) tap a bus that has a clear way out; (2) people walk around the circle and board a matching bus; (3) a full bus drives away. No text walls.

**Level select.** Twelve colourful, bus-shaped or bead-shaped buttons labelled 1–12. A level is playable if it is level 1 or the previous level is in `completedLevels`. Locked levels are visible but muted, with no grim lock-and-chain artwork; a simple outline is enough. Completed levels show a small cheerful tick.

**Pause overlay** (from the pause button): "Resume", "Sound: on/off", and "Choose a level". No ads, no "quit to store".

**Level complete overlay:** a short celebration (see §8), "Next level" (hidden after 12), and "Levels".

**Stuck prompt:** a friendly, non-blocking banner or small card: **"A bit stuck? Try Undo."** with two buttons, "Undo" and "Keep looking". It must never say "Game Over", "You lose", "Failed", or play a sad sting. It can be dismissed. It reappears only if the player is still stuck after further moves (see §4.9).

### 3.6 Viewports, safe areas and touch

Primary layout is **portrait iPhone**, matching the mockup.

- Design and test at **390×844** CSS pixels (iPhone 14/15). Also fit 375×667, 393×852 and 430×932 without clipping HUD or buses.
- **iPad portrait** (768×1024, 820×1180, 834×1194): same three-band stack, more generous spacing, buses at least as large as on iPhone.
- **iPad landscape** (1024×768, 1180×820 and similar): do not simply squash the portrait stack. Use a two-pane layout: the grass, loop and five bays on the **left**; the car park, Undo and Restart on the **right**, so buses remain large enough to tap.
- Honour `env(safe-area-inset-top/right/bottom/left)` on every screen. The title and pause sit below the notch / Dynamic Island. Undo and Restart sit above the home indicator, with at least 8px plus the safe-area inset of padding.
- Every tappable control (pause, undo, restart, play, level buttons, overlay buttons, mute) has a hit area of **at least 44×44 CSS pixels**. Every parked bus has a hit area of at least 44×44 CSS pixels, even if the drawing is slightly smaller on a cramped phone.

---

## 4. Rules (precise)

The only player action during a level is **tapping a parked bus**, plus Undo, Restart, and Pause. Walking, boarding, departing and filling the loop are automatic.

### 4.1 Colours, people and seats

- Each person has one colour. Each bus has one colour and a capacity of **3, 4 or 6** seats.
- In every campaign level, for each colour, the number of people equals the total seat capacity of all buses of that colour. When the last person of a level has boarded, every bus has left.
- People board only a bus of their own colour that is currently in a loading bay and has at least one empty seat.

### 4.2 Queue, loop and loop capacity

- The **queue** is an ordered list of people. Index 0 is the front: the person nearest the 8 o'clock loop entrance.
- The **loop** is an ordered ring of walkers, with a maximum length equal to that level's integer `loopCapacity`. People on the loop walk **clockwise** from the entrance (8 o'clock) towards the boarding point at **6 o'clock**.
- A person may leave the queue and enter the loop only while `loop.length < loopCapacity`, and only from the front of the queue (no overtaking in the queue).
- At the start of a level the loop is empty and the queue holds everyone. The game then **settles** (see §4.3) before the first tap, so the loop fills up to `loopCapacity` (or until the queue is empty). Nobody can board yet, because no bus is in a bay.

### 4.3 The settle algorithm (official, deterministic)

After the level is loaded, and after every successful bus-to-bay move, run `settle(state)` to completion before accepting another tap. Animations may play this out over time (see §8), but logically it is a single atomic step. Undo restores the state from *before* the tap, not a mid-settle frame.

```
function settle(state):
  cap = state.loopCapacity
  loop forever:
    while loop.length < cap and queue is not empty:
      append queue.shift() to the loop
    if loop is empty: stop
    rotated = 0
    boarded = false
    n = loop.length
    while rotated < n:
      if loop[0] can board a bay bus of their colour that has a free seat:
        remove loop[0]
        seat them on the matching bus (see §4.4)
        if that bus is now full: the bus departs, its bay becomes empty
        boarded = true
        break
      else:
        move loop[0] to the end of the loop   // walked past the door
        rotated += 1
    if not boarded: stop   // a full lap, nobody could board
```

"Can board" looks at buses currently in bays, left to right, and accepts the **earliest-placed** bus (FIFO among the five bays) of the same colour with `filled < capacity`. Implementation: store an increasing `arrivedAt` tick on each bay bus and pick the matching bus with the smallest `arrivedAt`.

This model is the single source of truth for the game and for the solver. Do not invent a second, looser rule for animations.

### 4.4 Boarding and departing

- When a person boards, `filled` increases by one. They hop down the boarding lane into the bus (§8).
- When `filled === capacity`, the bus **departs** immediately after that last boarding (a short depart animation is allowed, but the bay is logically free before the next settle iteration continues — the algorithm above clears the bay as soon as the seat is taken). The bus drives forward / along the road and off the screen, happily, and is gone for the rest of the level.
- A departed bus never returns.

### 4.5 Sending a bus from the car park

- The player taps a parked bus.
- **Blocked:** if any slot listed in that bus's slot's `exitBlockedBy` currently still has a parked bus, the tap is **not a move**. The tapped bus plays a **gentle shake** (about 250ms, a small rotation wiggle). No state change, nothing is pushed onto the Undo stack. Optional soft "bonk" sound. Do not flash red, do not rattle the whole screen.
- **Unblocked, but no empty bay:** same gentle shake, no state change, no Undo entry.
- **Unblocked, and at least one bay is empty:** this is a **legal move**.
  1. Push a deep snapshot of the current settled state onto the Undo stack and clear the redo stack (if you keep one).
  2. Remove the bus from its parking slot.
  3. Animate it along a short path onto the road and into the **leftmost empty bay** (bay index 0–4).
  4. Place it in that bay with `filled = 0` and a new `arrivedAt`.
  5. Run `settle` to completion (playing walk and board animations).
  6. Then evaluate win (§4.8) or stuck (§4.9).

A legal move is the only thing that costs an Undo step. Shakes do not.

A parked bus is **unblocked** if and only if every slot in `SLOTS[bus.slot].exitBlockedBy` is empty (no parked bus in that slot). Blocking is not transitive beyond that list: the lists in §5 already include the whole exit path, so a bus in row 2 lists both row 1 and row 0.

### 4.6 Undo

- Unlimited. Each successful bus-to-bay move (and only those) pushes one snapshot.
- A snapshot is a deep copy of: the queue, the loop (order and colours), every parked bus still in the car park, the five bays (bus id, colour, capacity, filled, arrivedAt), and which buses have departed.
- Undo pops the latest snapshot and restores it instantly (skip mid-move animations). If the stuck prompt is visible, dismiss it.
- If the stack is empty, the Undo button is visually muted and taps do nothing.
- Undo itself is not pushed as a move. You may keep a redo stack of undone states and clear it on the next fresh move; redo is optional and not required.

### 4.7 Restart

- Tapping Restart shows a calm two-button card: **"Start this level again?"** with **"Start again"** and **"Keep playing"**. No dark overlay that feels like a failure.
- "Start again" reloads the level's initial settled state and **clears the Undo stack**. No penalty, no lost stars.
- Restart is always available.

### 4.8 Winning

The player wins when, after a settle:

- the queue is empty, and
- the loop is empty, and
- no bus remains in a bay, and
- no bus remains in the car park.

Equivalently: every person has boarded and every bus has departed. Show the level-complete celebration, add the level id to `completedLevels` if it is not already there, and unlock the next level.

### 4.9 Stuck state and "Try Undo"

After a settle, the position is **stuck** when all of the following are true:

1. The position is not a win.
2. Nobody on the loop can board (no loop colour matches a bay bus that still has a free seat).
3. The loop is at `loopCapacity`, or the queue is empty (so nobody else can enter and change matters).
4. There is **no legal move**: either every bay is occupied, or every remaining parked bus is blocked (or both).

When this first becomes true, show the friendly **"A bit stuck? Try Undo."** prompt. Never use "Game Over". The player may Undo, Restart, or dismiss the prompt and keep looking (there is nothing useful to tap, so Undo or Restart is the real way forward). Do not auto-restart. Do not deduct anything.

If the player later reaches a non-stuck state (via Undo), hide the prompt. If they become stuck again, show it again.

### 4.10 What the player is planning

Typical hard thinking, which later levels should require:

- A bus at the back of a wing cannot move until the buses in front of it, along its arrow, have left the car park.
- Sending a colour that is not needed yet can leave a bus sitting in a bay. With only five bays, that can block a later necessary send.
- The queue cannot be reordered. People enter the loop in written order. A tight `loopCapacity` means a clump of the wrong colour can fill the loop.
- Large-capacity buses (4 or 6) often sit until a later run of the same colour arrives. They occupy a bay for longer than a 3-seater that matches an early run.

---

## 5. Data model and level JSON

### 5.1 Colours

The only legal colour strings are:

`red`, `yellow`, `blue`, `green`, `purple`, `pink`.

### 5.2 Shared parking slot map

Every level uses the same slot catalogue. Positions `x` and `y` are normalised inside the car-park band (0,0 is the top-left of that band, near the road; 1,1 is the bottom-right). `angle` is in degrees, clockwise from up, and is the roof-arrow / exit direction. `exitBlockedBy` is the complete list of slots that must be empty for a bus in this slot to have a clear exit path to the road.

```json
{
  "LW0": { "x": 0.22, "y": 0.10, "angle": 40,  "exitBlockedBy": [] },
  "LC0": { "x": 0.38, "y": 0.10, "angle": 40,  "exitBlockedBy": [] },
  "RC0": { "x": 0.62, "y": 0.10, "angle": -40, "exitBlockedBy": [] },
  "RE0": { "x": 0.78, "y": 0.10, "angle": -40, "exitBlockedBy": [] },

  "LW1": { "x": 0.20, "y": 0.28, "angle": 40,  "exitBlockedBy": ["LW0"] },
  "LC1": { "x": 0.36, "y": 0.28, "angle": 40,  "exitBlockedBy": ["LC0"] },
  "RC1": { "x": 0.64, "y": 0.28, "angle": -40, "exitBlockedBy": ["RC0"] },
  "RE1": { "x": 0.80, "y": 0.28, "angle": -40, "exitBlockedBy": ["RE0"] },

  "LW2": { "x": 0.18, "y": 0.46, "angle": 40,  "exitBlockedBy": ["LW1", "LW0"] },
  "LC2": { "x": 0.34, "y": 0.46, "angle": 40,  "exitBlockedBy": ["LC1", "LC0"] },
  "RC2": { "x": 0.66, "y": 0.46, "angle": -40, "exitBlockedBy": ["RC1", "RC0"] },
  "RE2": { "x": 0.82, "y": 0.46, "angle": -40, "exitBlockedBy": ["RE1", "RE0"] },

  "LW3": { "x": 0.16, "y": 0.64, "angle": 40,  "exitBlockedBy": ["LW2", "LW1", "LW0"] },
  "LC3": { "x": 0.32, "y": 0.64, "angle": 40,  "exitBlockedBy": ["LC2", "LC1", "LC0"] },
  "RC3": { "x": 0.68, "y": 0.64, "angle": -40, "exitBlockedBy": ["RC2", "RC1", "RC0"] },
  "RE3": { "x": 0.84, "y": 0.64, "angle": -40, "exitBlockedBy": ["RE2", "RE1", "RE0"] },

  "LW4": { "x": 0.14, "y": 0.82, "angle": 40,  "exitBlockedBy": ["LW3", "LW2", "LW1", "LW0"] },
  "LC4": { "x": 0.30, "y": 0.82, "angle": 40,  "exitBlockedBy": ["LC3", "LC2", "LC1", "LC0"] },
  "RC4": { "x": 0.70, "y": 0.82, "angle": -40, "exitBlockedBy": ["RC3", "RC2", "RC1", "RC0"] },
  "RE4": { "x": 0.86, "y": 0.82, "angle": -40, "exitBlockedBy": ["RE3", "RE2", "RE1", "RE0"] }
}
```

The left wing is `LW*` and `LC*`. The right wing is `RC*` and `RE*`. Row 0 is nearest the road and is always unblocked. A level's **max blocking depth** is the maximum, over its parked buses at the start, of the number of *occupied* slots in that bus's `exitBlockedBy` list.

Keep this map in `js/slots.js` (or inside `levels.js`) and reference it from every level JSON by slot id. Do not silently change `exitBlockedBy` per level.

### 5.3 Level JSON schema

Each `levels/NN.json` file has this shape:

```json
{
  "id": 4,
  "name": "Look ahead",
  "loopCapacity": 6,
  "queue": ["red", "red", "red", "yellow"],
  "buses": [
    { "id": "r1", "colour": "red", "capacity": 6, "slot": "LW0" }
  ]
}
```

Rules:

- `id` is 1–12 and matches the file name.
- `name` is the short UK-English level name in the table in §6.
- `loopCapacity` is a positive integer.
- `queue` is an array of colour strings, index 0 at the front. It may also be stored as a compact string of letters `R Y B G P K` in the solver fixtures, but the game itself must load the explicit array form above.
- Each bus `id` is unique within the level (short lowercase identifiers such as `r1`, `y2`).
- `capacity` is 3, 4 or 6.
- `slot` is a key in the slot map, and no two buses share a slot.
- For every colour, `count(queue, colour) === sum(capacity of buses of that colour)`.
- `levels/index.json` lists `{ "id", "name" }` in campaign order.

### 5.4 Runtime state

The official runtime (and solver) state is:

```text
{
  loopCapacity,
  queue,          // remaining people, front at index 0
  loop,           // walkers, order = walking order, index 0 is next at the door
  parked,         // buses still in the car park (id, colour, capacity, slot)
  bays            // length-5 array: null or { id, colour, capacity, filled, arrivedAt }
}
```

A **legal move** is the `id` of a parked bus that is unblocked and for which a null bay exists. Applying it places the bus in the leftmost null bay, then calls `settle`.

State equality for Undo and for the solver key: compare queue, loop, the set of parked ids, and each bay's `id` plus `filled`.

### 5.5 Official difficulty metrics

Measure these on the *as-shipped* level data (after any allowed solver tunings):

| Metric | How to measure |
|---|---|
| **Colours (C)** | Number of distinct colours in the queue. |
| **Buses (B)** | Number of buses. |
| **Max blocking depth (D)** | Defined in §5.2. |
| **Bay pressure (BP)** | Among all winning play-throughs, the minimum of each play-through's peak simultaneous bay occupancy. Occupancy is counted immediately after a bus is placed into a bay, and after every step of `settle` (so a bus that fills and leaves in the same settle still counts as 1 during that move). A level that can be won by sending one bus at a time, each leaving before the next is sent, has BP = 1. |
| **Queue-order conflicts (Q)** | (Number of colour runs in the queue) minus (number of distinct colours). A run is a maximal consecutive block of one colour. Q = 0 means each colour appears as a single block. |
| **Minimum moves (M)** | Length of a shortest winning sequence of legal bus-to-bay taps, as reported by the solver. Because every bus must be sent exactly once, M equals B on a solvable level with no wasted sends; if a solver ever reports M > B, the model is wrong. |

**Campaign rule:** Level *n*+1 must have a strictly greater value than level *n* in **at least one** of C, B, D, BP, Q, M, and must not be easier overall (do not reduce more than one metric, and never reduce C or B unless a different metric clearly rises and the solver still finds the later level at least as long in M). Levels 1–2 must remain very gentle: BP = 1, no tempting wrong move required, every opening unblocked bus on level 1 leads to a win.

---

## 6. Twelve-level campaign

### 6.1 Verification status (read this first)

A Node prototype of the official rules lives in `tools/prototype/`. It was run on 25 November 2026 (Europe/London).

| Levels | Status |
|---|---|
| **1–4** | **Verified by the prototype.** Solvable. Minimum moves, C, B, D and Q below are measured. Level 4 has at least one tempting wrong move (see the note under level 4). Prototype-measured BP is 1 for all four (a careful order can still clear buses one at a time). |
| **5–12** | **Designed, not yet proved.** People counts match seats. Metrics C, B, D and Q are computed from the data below. BP and M are *intended* values (M is intended to equal B). **Grok Build must run the official solver on all twelve levels**, confirm 1–4 still match, and prove or minimally tune 5–12 as required by §0 and §7. Do not ship a level the solver cannot win. |

### 6.2 Metrics table

BP and M for levels 5–12 are intended until the official solver reports them. "Prov." means prototype-measured.

| Lv | Name | C | B | D | BP | Q | M | People | Loop | Status |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | First ride | 2 | 3 | 0 | 1 | 0 | 3 | 9 | 16 | Prototype verified |
| 2 | The shy bus | 2 | 4 | 1 | 1 | 0 | 4 | 12 | 16 | Prototype verified |
| 3 | New friends | 3 | 5 | 1 | 1 | 2 | 5 | 15 | 14 | Prototype verified |
| 4 | Look ahead | 3 | 6 | 2 | 1* | 2 | 6 | 28 | 6 | Prototype verified; has a trap |
| 5 | Long bus, short bus | 3 | 6 | 2 | 2 | 3 | 6 | 28 | 6 | Must verify |
| 6 | A new colour | 4 | 7 | 2 | 2 | 4 | 7 | 31 | 6 | Must verify |
| 7 | Busy platform | 4 | 8 | 2 | 2 | 5 | 8 | 34 | 6 | Must verify |
| 8 | The long way out | 4 | 9 | 3 | 3 | 6 | 9 | 37 | 5 | Must verify |
| 9 | Purple arrives | 5 | 10 | 3 | 3 | 6 | 10 | 43 | 5 | Must verify |
| 10 | Four at once | 5 | 11 | 3 | 4 | 7 | 11 | 46 | 5 | Must verify |
| 11 | Pink too | 6 | 12 | 4 | 4 | 8 | 12 | 52 | 5 | Must verify |
| 12 | Molly's master plan | 6 | 14 | 4 | 5 | 8 | 14 | 58 | 5 | Must verify |

\* Level 4's prototype BP is 1; some winning lines occupy many more bays, and one official trap line fills all five. If the official solver reports a higher BP on the *minimum* peak winning line, keep the higher figure and check the campaign rule still holds (D, B and M already rise from level 3).

Each level from 2 onwards increases at least one of C, B, D, Q or M in the designed data (level 5 raises Q; later levels raise C, B, D or Q). Intended BP is non-decreasing from level 4. Grok Build must not lower this ramp when tuning.

### 6.3 Teaching intent (for designers)

- **Level 1 (very gentle):** Tap any bus. People of that colour board. A full bus leaves. Any of the three opening buses wins if you keep going.
- **Level 2 (very gentle):** One yellow bus sits behind another. Tapping the blocked bus shakes. Send the front yellow first.
- **Level 3:** A third colour and a second visit of red and yellow. The loop is still roomy, so early experiments recover.
- **Level 4:** Depth 2, 6-seaters that can sit in a bay, a tighter loop, and a real trap: after sending `r1`, `r2`, `r3` and `y1`, sending `y2` fills all five bays with red and yellow buses, six blues occupy the loop, and the blue bus cannot be sent. Undo recovers. The winning idea is to give the blue bus a bay *before* every red and yellow bus is sitting.
- **Levels 5–12:** Longer queues, a fourth then fifth then sixth colour, deeper wings, tighter loops, and more ways to clog the five bays. Level 12 is the campaign finale, not a wall.

### 6.4 Compact queue alphabet

In the listings below, letters are `R` red, `Y` yellow, `B` blue, `G` green, `P` purple, `K` pink. Expand each letter to the full colour string in the JSON files. The same data is in `tools/prototype/levels.mjs`.

### 6.5 Level 1 — First ride (prototype verified)

- `loopCapacity`: 16
- `queue`: `RRRYYYYYY` (3 red, 6 yellow)
- Buses: `r1` red 3 at `LW0`; `y1` yellow 3 at `RC0`; `y2` yellow 3 at `RE0`
- Prototype: solvable, M = 3, one shortest path `r1, y1, y2`. Every opening bus is a good first move. No trap. BP = 1.

### 6.6 Level 2 — The shy bus (prototype verified)

- `loopCapacity`: 16
- `queue`: `RRRRRRYYYYYY` (6 red, 6 yellow)
- Buses: `r1` red 3 at `LW0`; `r2` red 3 at `LC0`; `y1` yellow 3 at `RC0`; `y2` yellow 3 at `RC1` (blocked by `y1`)
- Prototype: solvable, M = 4, path `r1, r2, y1, y2`. Good first moves: `r1`, `r2`, `y1`. Tapping `y2` at the start shakes. BP = 1.

### 6.7 Level 3 — New friends (prototype verified)

- `loopCapacity`: 14
- `queue`: `RRRYYYBBBRRRYYY` (6 red, 6 yellow, 3 blue)
- Buses: `r1` red 3 at `LW0`; `y1` yellow 3 at `LC0`; `b1` blue 3 at `RC0`; `r2` red 3 at `RE0`; `y2` yellow 3 at `LC1` (blocked by `y1`)
- Prototype: solvable, M = 5, path `r1, y1, b1, r2, y2`. Four good opening buses. BP = 1, Q = 2.

### 6.8 Level 4 — Look ahead (prototype verified, first trap)

- `loopCapacity`: 6
- `queue`: `RRRYYYYYBBBBBBRRRRRRRRRRYYYY` (13 red, 9 yellow, 6 blue)
- Buses:
  - `r1` red 6 at `LW0`
  - `r2` red 4 at `LW1` (blocked by `r1`)
  - `r3` red 3 at `LW2` (blocked by `r1` and `r2`; depth 2)
  - `y1` yellow 6 at `LC0`
  - `y2` yellow 3 at `RC0`
  - `b1` blue 6 at `RE0`
- Prototype: solvable, M = 6. One shortest path is `r1, r2, r3, y1, b1, y2`.
- **Verified tempting wrong move:** from the settled state after `r1, r2, r3, y1`, tapping `y2` fills all five bays (`r1` 3/6, `r2` 0/4, `r3` 0/3, `y1` 5/6, `y2` 0/3), the loop is `BBBBBB`, and `b1` cannot be sent. The official stuck prompt must appear. Undo returns to the previous state, from which sending `b1` instead still wins.
- A careful different order can still finish with BP = 1, which is why the prototype reports BP = 1. The trap is required, and is present.

### 6.9 Level 5 — Long bus, short bus (must verify)

- `loopCapacity`: 6
- `queue`: `RRRYYYBBBRRRRRRRRRRYYYYYYBBB` (13 red, 9 yellow, 6 blue; Q = 3)
- Buses: same fleet and slots as level 4 (`r1` R6 LW0, `r2` R4 LW1, `r3` R3 LW2, `y1` Y6 LC0, `y2` Y3 RC0, `b1` B6 RE0)
- Intent: the mid-queue blue run makes colour order matter more. Intended BP = 2, M = 6. Must include a tempting wrong move (re-check; retune the queue if the solver finds none).

### 6.10 Level 6 — A new colour (must verify)

- `loopCapacity`: 6
- `queue`: `RRRYYYRBBBGGGRRRRRRRRRYYYYYYBBB` (13 red, 9 yellow, 6 blue, 3 green; Q = 4)
- Buses:
  - `r1` red 6 at `LW0`; `r2` red 4 at `LW1`; `r3` red 3 at `LW2`
  - `y1` yellow 6 at `LC0`; `y2` yellow 3 at `LC1`
  - `g1` green 3 at `RC0` (unblocked front-row decoy)
  - `b1` blue 6 at `RE0`
- Intent: C = 4, B = 7, M = 7, BP = 2. The obvious front green bus is a candidate trap if green is not yet needed.

### 6.11 Level 7 — Busy platform (must verify)

- `loopCapacity`: 6
- `queue`: `RRRYYYRBBBGGGRRRRRRRRRYYYYYYBBBGGG` (13 red, 9 yellow, 6 blue, 6 green; Q = 5)
- Buses: level 6 plus `g2` green 3 at `RC1` (blocked by `g1`)
- Intent: B = 8, M = 8, BP = 2.

### 6.12 Level 8 — The long way out (must verify)

- `loopCapacity`: 5
- `queue`: `RRRYYYRBBBGGGRRRRRRRRRYYYBBBGGGYYYYYY` (13 red, 12 yellow, 6 blue, 6 green; Q = 6)
- Buses: level 7 plus `y3` yellow 3 at `LW3` (blocked by `r1`, `r2`, `r3`; depth 3)
- Intent: B = 9, D = 3, M = 9, BP = 3. The tighter loop of 5 should raise bay pressure.

### 6.13 Level 9 — Purple arrives (must verify)

- `loopCapacity`: 5
- `queue`: `RRRYYYBBBGGGPPPRRRRRRRRRRYYYYYYBBBGGGYYYPPP` (13 red, 12 yellow, 6 blue, 6 green, 6 purple; Q = 6)
- Buses: level 8 plus `p1` purple 6 at `RE1` (blocked by `b1` on `RE0`)
- Intent: C = 5, B = 10, M = 10, BP = 3.

### 6.14 Level 10 — Four at once (must verify)

- `loopCapacity`: 5
- `queue`: `RRRYYYBBBGGGPPPRYYYYYYRRRRRRRRRBBBBBBGGGYYYPPP` (13 red, 12 yellow, 9 blue, 6 green, 6 purple; Q = 7)
- Buses: level 9 plus `b2` blue 3 at `RC2` (blocked by `g1`, `g2`)
- Intent: B = 11, M = 11, BP = 4.

### 6.15 Level 11 — Pink too (must verify)

- `loopCapacity`: 5
- `queue`: `RRRYYYBBBGGGPPPKKKRYYYYYYRRRRRRRRRBBBBBBGGGYYYPPPKKK` (13 red, 12 yellow, 9 blue, 6 green, 6 purple, 6 pink; Q = 8)
- Buses:
  - `r1` red 6 `LW0`; `r2` red 4 `LW1`; `r3` red 3 `LW2`; `y3` yellow 3 `LW3`; `g2` green 3 `LW4` (depth 4)
  - `y1` yellow 6 `LC0`; `y2` yellow 3 `LC1`; `k1` pink 6 `LC2`
  - `g1` green 3 `RC0`; `b2` blue 3 `RC1`
  - `b1` blue 6 `RE0`; `p1` purple 6 `RE1`
- Intent: C = 6, B = 12, D = 4, M = 12, BP = 4.

### 6.16 Level 12 — Molly's master plan (must verify)

- `loopCapacity`: 5
- `queue`: `RRRYYYBBBGGGPPPKKKRYYYYYYRRRRRRRRRBBBBBBGGGGGGYYYPPPKKKKKK` (13 red, 12 yellow, 9 blue, 9 green, 6 purple, 9 pink; Q = 8)
- Buses: level 11, but `k1` pink 6 moves to `RE2`, plus `g3` green 3 at `LC2` and `k2` pink 3 at `RC2`
  - `r1` R6 `LW0`; `r2` R4 `LW1`; `r3` R3 `LW2`; `y3` Y3 `LW3`; `g2` G3 `LW4` (depth 4)
  - `y1` Y6 `LC0`; `y2` Y3 `LC1`; `g3` G3 `LC2`
  - `g1` G3 `RC0`; `b2` B3 `RC1`; `k2` K3 `RC2`
  - `b1` B6 `RE0`; `p1` P6 `RE1`; `k1` K6 `RE2`
- Intent: B = 14, M = 14, BP = 5. The finale should need all five bays at the tightest point of every winning line if the solver can hold that; if a winning line with BP 4 exists, report the measured BP honestly and, if it drops below level 10 or 11, retune rather than lowering the earlier levels.

### 6.17 Full JSON

Ship each level as its own `levels/NN.json` file using the schema in §5.3. The prototype file `tools/prototype/levels.mjs` already encodes the same buses, slots, capacities, loop capacities and queues (as compact strings) and may be used as the source to emit those files.

---

## 7. Solver and validator

Grok Build must ship and run a Node ESM script: `node tools/solve.mjs`.

It may start from `tools/prototype/engine.mjs` and `tools/prototype/levels.mjs`, but the official script has to implement the rules in §4.3–§4.9 and the metrics in §5.5 *exactly* (including occupancy immediately after a placement when measuring BP).

### 7.1 Requirements

- Language: Node, standard library only. No `npm install`.
- Search: **breadth-first search** for minimum moves, over **settled** states. **A\* / Dijkstra** (or a second BFS with a peak-occupancy cost) for bay pressure: find a winning path whose peak occupancy is minimal, then report that peak as BP.
- State key: a canonical hash of parked bus ids, each bay's `id` and `filled`, the remaining queue, and the loop order.
- For each of the twelve levels, the script must print and also write to `tools/solver-report.md`:
  - solvable or not
  - minimum moves M, and one shortest path as a list of bus ids
  - bay pressure BP, and one winning path that achieves it
  - C, B, D, Q, people, `loopCapacity`
  - for **levels 4–12 only:** at least one **tempting wrong move**, or a clear failure if none exists
- Exit with a non-zero status if any level is unsolvable, if people do not match seats, if two buses share a slot, if M does not equal B on a solvable level, if levels 4–12 have no tempting wrong move, or if the campaign rule in §5.5 is broken.

### 7.2 Tempting wrong move (levels 4+)

A tempting wrong move is a **legal** move from the initial settled state, **or from any settled state along a shortest winning path**, whose resulting settled state is **unsolvable** (every continuation is stuck, not a win). The player can recover with Undo.

The prototype already exhibits one on level 4 (send `y2` after `r1, r2, r3, y1`). Levels 5–12 must each have at least one after verification or tuning.

The report should name the prefix path, the bad bus id, and whether the stuck prompt condition holds immediately after the bad move.

### 7.3 Search budget

Level 12 has fourteen buses and five bays. Use settled states only, a compact key, and a time budget of at least 30 seconds per level before declaring a failure to prove. If a level blows the budget, simplify its queue slightly rather than weakening the rules.

### 7.4 Allowed tunings

If levels 5–12 fail a check, Grok Build may change *only* that level's `queue` order, `loopCapacity` (not above 8 from level 5 onwards), a bus's `capacity` (still 3, 4 or 6, seats still matching people), or a bus's `slot` (still on the official map, no two buses in one slot). Do not add ads, extra bays, or power-ups. Do not make the level easier than the previous one on the overall ramp. Re-run the solver after every change and document it in `tools/solver-report.md`.

---

## 8. Animation and feel

The game should feel like a calm toy, not an arcade machine.

- **Walking:** people on the loop move clockwise at a steady, gentle pace. About 8–10 seconds for a full lap at normal speed is right. No sudden teleporting unless reduced motion is on.
- **Entering the loop:** the front queue person takes a short step from the U onto the circle.
- **Boarding:** at 6 o'clock the person peels off, hops down the boarding lane, and pops into their bus. A tiny stretch or bounce is enough. Stagger hops so a stream of the same colour is readable, not a single flash.
- **Bus to bay:** the chosen bus eases out of its slot, follows a short curve onto the road, and parks in the leftmost empty bay. Duration about 600–900ms.
- **Gentle shake:** 200–300ms, a few degrees of rotation, decelerating. Never a violent vibrate of the whole device (no `navigator.vibrate` on iPhone anyway; do not rely on it).
- **Departure:** the full bus rolls forward / along the road and off, with a small cheerful ease. The bay is logically empty as soon as the last person has boarded (§4.3).
- **Level complete:** a short celebration — buses already gone, remaining beads can do a tiny bounce, a soft "Well done, Molly!" title, and a simple burst of coloured beads or confetti that does not fill the screen or play a loud sting. Two seconds is plenty, then the Next-level actions are tappable. Nothing jumps at the player's face.
- **Optional sounds,** all bundled, all original or public domain, all short and soft: tap, shake (bonk), board, depart, and win. **A mute toggle lives in the pause overlay** and is remembered in `localStorage`. Default sound **on**, but a single tap must mute everything. Never auto-play sound before a user gesture if the browser would block it; unlock on first tap.
- **Frame rate:** target **60fps** on a recent iPhone and iPad during walking and moves. If more than 40 people are animating, instanced or batched drawing is required; do not drop to one DOM node per expensive filter. Pause `requestAnimationFrame` when the tab is hidden.
- **Reduced motion:** if `prefers-reduced-motion: reduce`, skip continuous walking (people may sit at logical loop positions or slide in a single short ease), skip confetti, and shorten bus moves to a brief fade or 200ms slide. The rules and settle results stay the same. Honour this without a second settings hunt; the pause overlay may still include the mute toggle.

---

## 9. Acceptance tests

### 9.1 Unit tests to write and run

Run with `node --test tests/*.test.mjs` (Node 18+ built-in test runner). No extra packages.

`tests/settle.test.mjs`

- An empty-bay settle on level 1 fills the loop with all 9 people (loopCapacity 16) and boards nobody.
- After placing `r1` on level 1, settle boards exactly 3 reds, `r1` departs, and 6 yellows remain on the loop.
- A full lap with no matching bay bus leaves the loop membership unchanged (apart from rotation, which must not change the multiset) and then stops.
- FIFO: two red buses in bays, the earlier arrival is filled first.

`tests/rules.test.mjs`

- A blocked bus is not a legal move; an unblocked bus into a free bay is.
- After a legal move on level 2, `y1` leaving `RC0` makes `y2` at `RC1` unblocked.
- Win is detected only when queue, loop, bays and car park are all empty.
- The stuck predicate is true for the official level-4 trap state (five bays occupied by r1, r2, r3, y1, y2; loop six blues; `b1` still parked) and false at the start of level 1.
- People counts equal seats on every shipped level.

`tests/undo.test.mjs`

- A legal move grows the Undo stack by one; a shake does not.
- Undo restores the exact previous queue, loop, bays and parked set.
- After Undo, a different legal bus can be sent.
- Restart asks for confirmation in the UI (manual), and the state helper that Restart calls resets to the initial settled state and clears the stack.

`tests/levels.test.mjs`

- All twelve JSON files parse, match the schema, use only official slot ids and colours, have unique bus ids and slots, and have matching people and seats.
- C, B, D and Q computed from the files match the table in §6.2 (or the solver-report table, if a level 5–12 was legally tuned — in that case the test should read the report or the tuned files).
- `loopCapacity` is a positive integer.

`tests/pwa.test.mjs`

- `manifest.webmanifest` exists and has `name`, `start_url`, `display: standalone`, and icons 192 and 512.
- `sw.js` contains a cache name matching `/bus-buddies-v\\d+/` and an explicit precache list that includes `index.html`, `styles.css`, every `js/` file, every `levels/` file, and the apple-touch icon.
- `index.html` references the manifest and `icons/apple-touch-icon.png`.

### 9.2 Manual checklist

Play on a real or simulated device, starting from a clean `localStorage`.

- [ ] Level 1 can be finished by a five-year-old with almost no coaching; any opening bus still leads to a win.
- [ ] Level 2: tapping the back yellow bus shakes and does nothing; sending the front yellow then the back yellow works.
- [ ] Level 4: the documented trap can be reproduced; the "A bit stuck? Try Undo." prompt appears; Undo then sending `b1` recovers; there is no "Game Over" wording anywhere in the app.
- [ ] Unlimited Undo across a long level; Restart asks calmly and resets the level.
- [ ] Pause: Resume, mute, and level select all work; mute is remembered after a reload.
- [ ] Completing level *n* unlocks *n*+1; refresh in the middle of a level restores the exact position.
- [ ] Turning the network off after the first load, the title screen, all unlocked levels, Undo, sounds (if not muted) and the win screen still work.
- [ ] No timer, no ads, no shop, no sign-in, no store prompt, no VIP, no extra locked bays.
- [ ] All on-screen sentences are plain UK English, kind, and short.

### 9.3 Viewport screenshots

Capture, in a browser or Simulator, and store under `docs/screenshots/` (create the folder; do not overwrite `docs/reference/`):

1. iPhone portrait 390×844 — title screen
2. iPhone portrait 390×844 — level 1, just after load (queue, loop, five empty bays, three parked buses, HUD)
3. iPhone portrait 390×844 — a later level with a bus in a bay and people on the boarding lane
4. iPad portrait 834×1194 — level 1
5. iPad landscape 1194×834 — level 1, two-pane layout

Compare 2 against `docs/reference/approved-mockup.jpg`: lime U-queue and circular island, grey five-bay road, mint herringbone car park, title, level label, pause, Undo, Restart, and the hint line. The art must be original, but the *structure* should be obviously the same game as the mockup.

### 9.4 Lighthouse

On a static HTTPS preview (or `npx serve` plus a tunnel if needed), run Chrome Lighthouse in mobile mode:

- **PWA** audit should pass installability (manifest, service worker, icon, start URL).
- **Offline** (Application → Service Workers, or the Lighthouse PWA "current page and all start_url respond with 200 when offline" check) should pass after one load.
- Best-effort performance: avoid obvious layout thrash; 60fps is the in-game target, not a Lighthouse score requirement.

Record the report date and the PWA/offline results in `tools/solver-report.md` or a short `docs/acceptance-notes.md`.

### 9.5 Add to Home Screen (manual, Safari)

**iPad, Safari:**

1. Open the hosted HTTPS URL in Safari (not Chrome).
2. Share → Add to Home Screen. The name should default to a readable "Molly's Bus Buddies" or "Bus Buddies". The icon should be the apple-touch / maskable icon, not a generic screenshot of the page if it can be avoided.
3. Open the home-screen icon. It should run standalone (no Safari chrome).
4. Airplane Mode on. Cold-start the icon. The game still loads, and a completed-level 1 still shows as complete.

**iPhone, Safari:** repeat the same four steps, in portrait, with the notch / Dynamic Island: title and pause below the safe area, Undo and Restart above the home indicator, all hit areas still comfortable.

---

## 10. Out of scope

Do not build: accounts, cloud saves, multiplayer, daily challenges, ads, analytics, IAP, a level editor in the player app, mystery or hidden-colour buses, extra paid bays, limited lives, or a native App Store binary. A later native wrap is a different project. This specification is the static PWA only.

---

## 11. Glossary for David and Molly

- **Queue:** the people waiting in the U at the top, not yet walking.
- **Loop:** the circle around the grass island, where people walk.
- **Bay:** one of the five parking boxes on the grey road. A bus here can be boarded.
- **Blocked bus:** a bus whose way out is standing behind another bus. It will gently shake if tapped.
- **Settle:** the automatic sequence of walking, boarding and departing that happens after each bus is sent.
- **Undo:** take back the last bus you sent, exactly.
- **Stuck:** no one can board and no useful bus can be sent. Try Undo; you have not lost.

That's the whole game: look at the colours in the queue, look at which buses can move, and send the one that keeps a path open for everyone.
