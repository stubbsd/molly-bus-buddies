// Regenerates the PRECACHE list in sw.js from the files on disk. Run after adding assets:
//   node tools/write-sw.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const list = ["./", "index.html", "styles.css", "manifest.webmanifest"];
for (const dir of ["js", "levels", "icons", "audio"]) for (const f of readdirSync(new URL(dir + "/", root)).sort()) list.push(`${dir}/${f}`);
const sw = readFileSync(new URL("sw.js", root), "utf8");
const out = sw.replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = [\n${list.map((f) => `  ${JSON.stringify(f)},`).join("\n")}\n];`);
writeFileSync(new URL("sw.js", root), out);
console.log(`precache: ${list.length} files`);
