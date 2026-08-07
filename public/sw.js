// Spectral Scout service worker -- see INSTALL_PWA.md.
//
// Scope, deliberately: precache a *minimal* app shell (manifest, icons,
// the static /offline fallback) rather than every hashed JS/CSS chunk.
// Next.js's build output filenames change on every deploy and there's no
// build-time tool here (no next-pwa/Workbox) injecting an up-to-date asset
// manifest into this file, so hand-listing chunk names would silently go
// stale on the very next deploy and fail closed (a 404 inside the SW
// cache). What actually matters per the acceptance criteria -- installable,
// launches from cache, and captures aren't lost offline -- doesn't require
// that: the shell below covers "installable + a real offline page,"
// navigation caching covers "previously-visited pages still render," and
// the offline capture queue (lib/offline-queue.ts, app-layer IndexedDB,
// not this file) is what actually guarantees "nothing is lost in a dead
// zone" for scouting/trap/treatment submissions.
const VERSION = "v1";
const CACHE_NAME = `spectral-scout-${VERSION}`;
const APP_SHELL = ["/offline", "/manifest.webmanifest", "/favicon.png", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // mutations pass straight through -- the offline queue handles those at the app layer
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations (HTML pages): network-first so a signed-in grower always
  // gets fresh data when online, falling back to whatever was last cached
  // for that URL, and finally the static offline page if nothing's cached
  // yet for it.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline")))
    );
    return;
  }

  // Static assets under /icons or the manifest itself: cache-first, since
  // these never change without a deploy.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.png") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  // Read-only API data (map/events/tasks/etc GETs): stale-while-revalidate
  // -- serve the cached copy instantly if there is one (so a previously
  // loaded screen still renders offline), and refresh the cache in the
  // background whenever the network is actually available.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
