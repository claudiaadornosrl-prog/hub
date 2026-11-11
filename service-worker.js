// ═══════════════════════════════════════════════════════════════════════
//  Service Worker — Claude Adorno Hub
//  Estrategia: network-first con cache fallback (para que siempre veas
//  la última versión cuando hay red, pero funciona offline).
// ═══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'hub-v100-icono-moneda';
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
    data:  Object.assign({ url: payload.url || './' }, payload.data || {}),
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // (6-nov-2026) Botones Aceptar/Rechazar de un pedido de autorización del POS: se resuelve acá mismo con el token, sin abrir nada
  const nd = event.notification.data || {};
  if ((event.action === 'aceptar' || event.action === 'rechazar') && nd.aut && nd.token) {
    const K = 'sb_publishable_udSPma98Sw9eskeeLCgdCw_S2vIX0Fk', acepta = event.action === 'aceptar';
    event.waitUntil(fetch('https://jfwtiagteuwmyvblgwms.supabase.co/rest/v1/rpc/pos_autorizacion_token', { method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: nd.aut, p_token: nd.token, p_acepta: acepta }) }).then((r) => r.json()).catch(() => ({ ok: false, msg: 'Sin conexión: abrí el Hub y resolvelo desde ahí' }))
      .then((j) => self.registration.showNotification(j && j.ok ? (acepta ? '✔ Autorizado' : '✖ Rechazado') : 'No se pudo', { body: (j && j.msg) || '', tag: 'pos-aut-r-' + nd.aut, icon: './icon-192-v2.png', data: { url: './' } })));
    return;
  }
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  const scope = self.registration.scope;
  // (6-nov-2026) Primero una ventana del Hub (mismo scope): le avisamos por mensaje (pos-autorizar.js escucha 'abrir-url') y
  // además navegamos; en el iPhone la PWA no puede abrir otra app, así que el link siempre tiene que ser del Hub.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const propios = clientList.filter((c) => c.url.startsWith(scope));
      // (6-nov) En el iPhone la PWA del Hub muestra el último módulo usado (p.ej. el POS): esa ventana no la controla este SW
      // (navigate falla), pero el mensaje sí le llega y el módulo muestra la cajita de autorización.
      const client = propios[0] || clientList.find((c) => c.url.startsWith(self.location.origin));
      if (client && 'focus' in client) {
        client.focus();
        try { client.postMessage({ tipo: 'abrir-url', url: targetUrl }); } catch (_) {}
        if (propios[0] && 'navigate' in client) client.navigate(targetUrl).catch(() => {});
        return;
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
