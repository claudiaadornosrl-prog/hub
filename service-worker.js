// ═══════════════════════════════════════════════════════════════════════
//  Service Worker — Claude Adorno Hub
//  Estrategia: network-first con cache fallback (para que siempre veas
//  la última versión cuando hay red, pero funciona offline).
// ═══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'claude-adorno-hub-v14-logo-alineado';
const ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Solo cacheamos same-origin (no Google Fonts, no Tabler CDN — esos los maneja el browser)
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});


// ═══════════════════════════════════════════════════════════════
//  PUSH (centro de notificaciones del Hub)
//  El payload viene de la Edge Function enviar-push. Al tocar la
//  notificación abrimos la URL del módulo que la generó.
// ═══════════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (e) { payload = { title: 'Claude Adorno', body: event.data ? event.data.text() : 'Tenés una novedad' }; }

  const title = payload.title || 'Claude Adorno';
  const options = {
    body:  payload.body  || '',
    icon:  payload.icon  || './icon-192.png',
    badge: payload.badge || './icon-192.png',
    tag:   payload.tag   || 'hub-default',
    data:  { url: payload.url || './' },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
