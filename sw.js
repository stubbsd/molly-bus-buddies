// Molly's Bus Buddies service worker: versioned precache, cache-first, offline navigation.
// Bump VERSION whenever any cached file changes. Regenerate the list with: node tools/write-sw.mjs
const VERSION = "bus-buddies-v6";
const PRECACHE = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "js/audio.js",
  "js/game.js",
  "js/levels.js",
  "js/main.js",
  "js/park.js",
  "js/render.js",
  "js/slots.js",
  "js/storage.js",
  "js/ui.js",
  "levels/campaign.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "audio/board.wav",
  "audio/depart.wav",
  "audio/shake.wav",
  "audio/tap.wav",
  "audio/win.wav",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bus-buddies-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin (there should be none)
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))
        .then((hit) => hit || fetch(req))
        .catch(() => caches.match("index.html")),
    );
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
