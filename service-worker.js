// ═══════════════════════════════════════════════════════════════════════
//  Service Worker — Claude Adorno Hub
//  Estrategia: network-first con cache fallback (para que siempre veas
//  la última versión cuando hay red, pero funciona offline).
// ═══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'claude-adorno-hub-v11-scope-raiz';
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
