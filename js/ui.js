// DOM helpers: screens, cards, level select, stuck banner.
const $ = (id) => document.getElementById(id);
export { $ };

export function showScreen(name) {
  for (const s of ["title", "levels", "game"]) $("screen-" + s).hidden = s !== name;
}

/** Show a calm card. actions: [{ label, soft?, onClick }]; opts.variant "lose" sits lower with side-by-side buttons. */
export function showCard(title, bodyHTML, actions, opts = {}) {
  $("overlay").classList.toggle("lose", opts.variant === "lose");
  $("card-title").textContent = title;
  $("card-body").innerHTML = bodyHTML || "";
  const box = $("card-actions");
  box.innerHTML = "";
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill" + (a.soft ? " pill-soft" : "");
    b.textContent = a.label;
    b.addEventListener("click", () => { hideCard(); a.onClick?.(); });
    box.appendChild(b);
  }
  $("overlay").hidden = false;
  box.querySelector("button")?.focus({ preventScroll: true });
}

export function hideCard() { $("overlay").hidden = true; }
export function cardOpen() { return !$("overlay").hidden; }

export function setStuckVisible(v) { $("stuck").hidden = !v; }

export function setHint(text) { $("hint").textContent = text; }
export function setLevelLabel(n) { $("hud-level").textContent = `Level ${n}`; }
export function setUndoEnabled(v) { $("btn-undo").classList.toggle("muted", !v); $("btn-undo").setAttribute("aria-disabled", String(!v)); }

const LEVEL_COLOURS = ["#E23B2F", "#F5C518", "#2F7DE1", "#3BA55C", "#8B4ACB", "#E85A9B"];

export function renderLevelGrid(index, progress, isUnlocked, onPick) {
  const grid = $("level-grid");
  grid.innerHTML = "";
  const done = progress.completedLevels.length;
  const total = index.length;
  const prog = $("level-progress");
  if (prog) prog.textContent = done === total ? "Every level done. What a planner!" : `Finished ${done} of ${total}`;
  let nextOpen = null;
  for (const e of index) {
    if (e.id % 10 === 1) {
      const h = document.createElement("div");
      h.className = "level-decade";
      const end = Math.min(e.id + 9, total);
      h.textContent = e.id === end ? `Level ${e.id}` : `Levels ${e.id}–${end}`;
      grid.appendChild(h);
    }
    const b = document.createElement("button");
    b.type = "button";
    const open = isUnlocked(progress, e.id);
    const finished = progress.completedLevels.includes(e.id);
    b.className = "level-btn" + (open ? "" : " locked") + (finished ? " done" : "");
    b.style.background = LEVEL_COLOURS[(e.id - 1) % LEVEL_COLOURS.length];
    b.textContent = String(e.id);
    b.setAttribute("aria-label", `Level ${e.id}, ${e.name}${open ? "" : ", not open yet"}${finished ? ", done" : ""}`);
    if (finished) {
      const t = document.createElement("span"); t.className = "tick"; t.textContent = "✓"; b.appendChild(t);
    }
    b.disabled = !open;
    if (open) b.addEventListener("click", () => onPick(e.id));
    if (open && !finished && !nextOpen) nextOpen = b;
    grid.appendChild(b);
  }
  const focus = nextOpen || grid.querySelector(".level-btn.done:last-of-type") || grid.querySelector(".level-btn");
  requestAnimationFrame(() => focus?.scrollIntoView({ block: "center", inline: "nearest" }));
}

export const HOW_TO_PLAY = `<div class="how">
  <div><b>1</b><span>Tap a bus. It drives the way its arrow points, if the road is clear.</span></div>
  <div><b>2</b><span>People hop on at the bottom of the circle, onto a bus of their colour. If their bus is not there, they go round again.</span></div>
  <div><b>3</b><span>The number shows empty seats. At 0 the bus drives away.</span></div>
  <div><b>4</b><span>Dark buses with a ? show their colour when their road is clear.</span></div>
  <div><b>5</b><span>Keep a bay free! Five full bays means out of room.</span></div>
</div>`;
