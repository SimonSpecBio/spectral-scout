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
const VERSION = "v5";
const CACHE_NAME = `spectral-scout-${VERSION}`;
const APP_SHELL = ["/offline", "/manifest.webmanifest", "/favicon.png", "/icons/icon-192.png", "/icons/icon-512.png"];

// How long a cached API response is treated as "fresh enough to show
// instantly" before a read has to wait on the network first (ticket
// recmnUcdRHPF6nrPz) -- previously an entry only ever left the cache on a
// VERSION bump, which meant a grower could be looking at pest-count data
// from days ago and have no way to know it wasn't live. 5 minutes matches
// the kind of staleness a dashboard reload already tolerates; a fetch
// failure still falls back to this same stale copy regardless of age,
// since stale-but-real beats the static offline page.
const API_CACHE_MAX_AGE_MS = 5 * 60_000;
// Own header name (not a real HTTP response header) stamped onto every API
// response this SW caches, read back to decide freshness -- Cache Storage
// itself has no built-in per-entry expiry.
const CACHED_AT_HEADER = "x-sw-cached-at";

function isPrivateResponse(response) {
  const cacheControl = response.headers.get("Cache-Control") || "";
  return cacheControl.toLowerCase().includes("private");
}

// Wraps a response with a cached-at timestamp header before storing it --
// cache.put() stores whatever Response is given it verbatim, so stamping
// has to happen on a clone before the put, not after.
async function putWithTimestamp(cache, request, response) {
  const body = await response.clone().blob();
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

function isFresh(cachedResponse) {
  const stamp = cachedResponse.headers.get(CACHED_AT_HEADER);
  if (!stamp) return false; // no timestamp (a pre-v5 cache entry, or the app-shell/static branches which don't stamp) -- treat as stale rather than trusting it indefinitely
  return Date.now() - Number(stamp) < API_CACHE_MAX_AGE_MS;
}

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

// Web Push (ticket 91) -- payload is always our own JSON shape
// ({title, body, url}, see lib/push.ts), never third-party/untrusted, since
// it only ever comes from our own VAPID-signed sends.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, url } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url } })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // mutations pass straight through -- the offline queue handles those at the app layer
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Auth redirects (demo-login's session-creation hop, and NextAuth's own
  // sign-in/callback flow) must never be intercepted. A service worker
  // that calls fetch(request) on a NAVIGATION and the fetch follows a
  // redirect internally gets back a Response whose .url is the final
  // (redirected-to) address -- but respondWith()'ing that for a
  // navigation renders the target page's content while the browser's
  // address bar and Next.js's own client router still think they're at
  // the ORIGINAL url. That mismatch broke client-side hydration and
  // bounced the tab back to "/" (root cause of "test account link sends
  // me to the sign-in page" -- the auth/session logic itself was never
  // broken, this was). Letting the browser handle these as a normal,
  // uncontrolled navigation sidesteps the whole problem.
  if (request.mode === "navigate" && (url.pathname === "/api/demo-login" || url.pathname.startsWith("/api/auth/"))) {
    return;
  }

  // Navigations (HTML pages): network-first so a signed-in grower always
  // gets fresh data when online, falling back to whatever was last cached
  // for that URL, and finally the static offline page if nothing's cached
  // yet for it.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // A page that opts into Cache-Control: private (none do today,
          // but this is the same defensive check the API branch below
          // uses) is explicitly saying "this response is for one specific
          // user" -- never let it become the next signed-out/different
          // visitor's cached fallback (ticket recmnUcdRHPF6nrPz).
          if (!isPrivateResponse(response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
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

  // Escalation status (ticket 96) is a one-shot "did a person get back to
  // me yet" check -- stale-while-revalidate's whole point is fine staleness
  // for map/events/tasks data, but here it actively lies (a grower reloading
  // right after staff resolves their request would still see "pending" from
  // the stale cache entry, with no second trigger to ever re-check). Always
  // go to the network for this one path instead of the generic /api/ branch
  // below.
  if (url.pathname.endsWith("/escalate")) {
    event.respondWith(fetch(request));
    return;
  }

  // Read-only API data (map/events/tasks/etc GETs): stale-while-revalidate,
  // but only while the cached copy is still within API_CACHE_MAX_AGE_MS
  // (ticket recmnUcdRHPF6nrPz) -- past that it's not instantly trustworthy
  // enough to show as if live, so this waits on the network first and only
  // falls back to the stale copy if that fetch actually fails. Never
  // caches a Cache-Control: private response, for the same reason as the
  // navigation branch above.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok && !isPrivateResponse(response)) putWithTimestamp(cache, request, response.clone());
            return response;
          })
          .catch(() => cached);
        if (cached && isFresh(cached)) return cached;
        return network;
      })
    );
  }
});
