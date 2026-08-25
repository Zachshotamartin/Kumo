/* global self, caches, fetch, Response, URL */

const CACHE_NAME = "kumo-shell-v3";
const INBOX_CACHE = "kumo-offline-inbox-v1";
const INBOX_URL = "/__kumo/offline-inbox";
const PRECACHE_URLS = ["/", "/manifest.json" /* __KUMO_PRECACHE_MANIFEST__ */];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE_NAME, INBOX_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (!response.ok) return response;
      return caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone())).then(() => response);
    }).catch(() => caches.match(event.request).then((response) => response || caches.match("/"))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (!response.ok) return response;
    return caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())).then(() => response);
  }).catch(() => Response.error())));
});

self.addEventListener("push", (event) => {
  const payload = (() => { try { return event.data?.json() || {}; } catch { return { body: event.data?.text() || "" }; } })();
  const item = { id: payload.tag || `push:${Date.now()}`, title: payload.title || "Kumo", body: payload.body || "You have a Kumo update.", url: payload.url || "/?view=inbox", receivedAt: new Date().toISOString() };
  event.waitUntil(Promise.all([
    self.registration.showNotification(item.title, { body: item.body, tag: item.id, data: { url: item.url }, icon: "/logo192.png", badge: "/logo192.png" }),
    caches.open(INBOX_CACHE).then(async (cache) => {
      const previous = await cache.match(INBOX_URL).then((response) => response?.json()).catch(() => []);
      await cache.put(INBOX_URL, new Response(JSON.stringify([item, ...(Array.isArray(previous) ? previous : [])].slice(0, 100)), { headers: { "Content-Type": "application/json" } }));
    }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedTarget = new URL(event.notification.data?.url || "/?view=inbox", self.location.origin);
  const target = new URL(
    requestedTarget.origin === self.location.origin ? requestedTarget.toString() : "/?view=inbox",
    self.location.origin
  ).toString();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.focus().then(() => existing.navigate(target));
    return self.clients.openWindow(target);
  }));
});
