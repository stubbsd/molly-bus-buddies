// DOM helpers: screens, cards, level select, stuck banner.
const $ = (id) => document.getElementById(id);
export { $ };

export function showScreen(name) {
  for (const s of ["title", "levels", "game"]) $("screen-" + s).hidden = s !== name;
}

/** Show a calm card. actions: [{ label, soft?, onClick }]. */
export function showCard(title, bodyHTML, actions) {
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
  for (const e of index) {
    const b = document.createElement("button");
    b.type = "button";
    const open = isUnlocked(progress, e.id);
    b.className = "level-btn" + (open ? "" : " locked");
    b.style.background = LEVEL_COLOURS[(e.id - 1) % LEVEL_COLOURS.length];
    b.textContent = String(e.id);
    b.setAttribute("aria-label", `Level ${e.id}, ${e.name}${open ? "" : ", not open yet"}${progress.completedLevels.includes(e.id) ? ", done" : ""}`);
    if (progress.completedLevels.includes(e.id)) {
      const t = document.createElement("span"); t.className = "tick"; t.textContent = "✓"; b.appendChild(t);
    }
    b.disabled = !open;
    if (open) b.addEventListener("click", () => onPick(e.id));
    grid.appendChild(b);
  }
}

export const HOW_TO_PLAY = `<div class="how">
  <div><b>1</b><span>Tap a bus that has a clear way out.</span></div>
  <div><b>2</b><span>People walk round the circle and hop on a bus of their colour.</span></div>
  <div><b>3</b><span>A full bus drives away. Get everyone home!</span></div>
</div>`;
