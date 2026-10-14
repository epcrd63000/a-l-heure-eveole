const CACHE_NAME = "a-lheure-shell-v10";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./api.js",
  "./storage.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async asset => {
      const request = new Request(new URL(asset, self.registration.scope), { cache: "reload" });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Impossible de mettre en cache ${asset} (${response.status}).`);
      await cache.put(request, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("a-lheure-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }
  const update = fetch(request).then(response => {
    if (!response.ok) return response;
    const copy = response.clone();
    return caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).then(() => response);
  });
  event.waitUntil(update.then(() => undefined).catch(() => undefined));
  event.respondWith(
    caches.match(request).then(cached => cached || update)
  );
});
