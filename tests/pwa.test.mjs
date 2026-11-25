import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { readText, ROOT } from "./helpers.mjs";

const files = (d) => readdirSync(new URL(d + "/", ROOT)).map((f) => `${d}/${f}`);

test("manifest has name, start_url, standalone display and 192/512 icons", () => {
  const m = JSON.parse(readText("manifest.webmanifest"));
  assert.equal(m.name, "Molly's Bus Buddies");
  assert.equal(m.short_name, "Bus Buddies");
  assert.equal(m.start_url, "./");
  assert.equal(m.display, "standalone");
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"));
  for (const i of m.icons) readText(i.src); // exists
});

test("sw.js has a versioned cache and precaches every local asset", () => {
  const sw = readText("sw.js");
  assert.match(sw, /bus-buddies-v\d+/);
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  for (const f of ["index.html", "styles.css", "manifest.webmanifest", "icons/apple-touch-icon.png", ...files("js"), ...files("levels"), ...files("icons"), ...files("audio")]) {
    assert.ok(list.includes(f), "precache missing " + f);
  }
  for (const f of list) if (f !== "./") readText(f.replace(/^\.\//, "")); // every listed file exists
});

test("index.html references the manifest, apple-touch icon and module entry", () => {
  const html = readText("index.html");
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon.png">/);
  assert.match(html, /<script type="module" src="js\/main.js">/);
  assert.match(html, /viewport-fit=cover/);
});

test("the shipped game requests nothing from another origin", () => {
  for (const f of ["index.html", "styles.css", ...files("js"), "sw.js"]) {
    const t = readText(f);
    assert.doesNotMatch(t, /(src|href)=["']https?:/i, f);
    assert.doesNotMatch(t, /fetch\(["']https?:/i, f);
    assert.doesNotMatch(t, /@import|fonts\.googleapis|cdn\./i, f);
  }
});

test("player-facing text has no harsh or US spellings", () => {
  const t = (readText("index.html") + readText("js/ui.js") + readText("js/main.js")).replace(/[\w-]*-color/g, "");
  assert.doesNotMatch(t, /game over|you lose|failed|\bcolor/i);
});
