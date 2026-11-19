// Keel service worker: makes the app installable and fast, never touches the API.
// - Built files (/assets/*, /img/*, /icons/*): cache-first (their names change on every build).
// - Pages: network-first, falling back to the last cached app shell when offline.
// - /api/*, other origins (PayPal, Didit, Google) and non-GET requests: left alone.
const VERSION = "keel-v2";
const SHELL = "/";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// waitUntil keeps the worker alive until the write finishes; without it the browser may stop the worker first.
const store = (e, req, res) => e.waitUntil(caches.open(VERSION).then((c) => c.put(req, res)).catch(() => {}));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/docs" || url.pathname === "/openapi.json") return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) store(e, SHELL, res.clone());
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r ?? Response.error())),
    );
    return;
  }

  if (/^\/(assets|img|icons)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) store(e, req, res.clone());
            return res;
          }),
      ),
    );
  }
});
