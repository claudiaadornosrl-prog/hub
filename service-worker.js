// ═══════════════════════════════════════════════════════════════════════
//  Service Worker — Claude Adorno Hub
//  Estrategia: network-first con cache fallback (para que siempre veas
//  la última versión cuando hay red, pero funciona offline).
// ═══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'hub-v82-autorizar';
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
  // (hub v72) solo lo del Hub: las páginas de los módulos que el Hub baja por adelantado van a la caché del navegador
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
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
    icon:  payload.icon  || './icon-192-v2.png',
    badge: payload.badge || './icon-192-v2.png',
    tag:   payload.tag   || 'hub-default',
    data:  { url: payload.url || './' },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  const scope = self.registration.scope;
  // (6-nov-2026) Primero una ventana del Hub (mismo scope): le avisamos por mensaje (pos-autorizar.js escucha 'abrir-url') y
  // además navegamos; en el iPhone la PWA no puede abrir otra app, así que el link siempre tiene que ser del Hub.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const propios = clientList.filter((c) => c.url.startsWith(scope));
      const client = propios[0] || clientList.find((c) => c.url.includes(self.location.origin));
      if (client && 'focus' in client) {
        client.focus();
        try { client.postMessage({ tipo: 'abrir-url', url: targetUrl }); } catch (_) {}
        if ('navigate' in client) client.navigate(targetUrl).catch(() => {});
        return;
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
