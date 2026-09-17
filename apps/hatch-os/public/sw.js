/* Hatch OS Phase 1 service worker.
   Offline = “can’t reach the room.” Do not cache a corpus. */
const OFFLINE_URL = "/offline.html";
const CACHE = "hatch-os-offline-v1";

function isCorpusish(url) {
  const path = url.pathname;
  return (
    path.startsWith("/api/library") ||
    path.startsWith("/api/search") ||
    path.startsWith("/api/ingest") ||
    path.startsWith("/api/chat") ||
    path.includes("/corpus") ||
    path.includes("/files/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/")) return;
  if (isCorpusish(url)) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "Can’t reach Hatch OS" }), {
            status: 503,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => {
      if (request.destination === "document") {
        return caches.match(OFFLINE_URL);
      }
      return new Response("", { status: 503, statusText: "Can’t reach Hatch OS" });
    }),
  );
});
