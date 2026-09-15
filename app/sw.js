/* Holdroom Phase 1 wireframe SW.
   Offline = “can’t reach the room.” Do not cache a corpus. */
const OFFLINE_URL = "/app/offline.html";
const CACHE = "holdroom-offline-v2";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.add(OFFLINE_URL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  /* Never cache library / document bodies. Network only. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(function () {
      if (request.destination === "document") {
        return caches.match(OFFLINE_URL);
      }
      return new Response("", { status: 503, statusText: "Can’t reach the Holdroom" });
    })
  );
});
