'use strict';
// Bump this version whenever application-shell files change.
const CACHE_VERSION = 'v2.1.2';
const BASE = new URL('./', self.location.href);
const CACHE_PREFIX = `today-work:${BASE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const CORE_FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css', 'css/features.css', 'css/plans.css', 'css/personalization.css',
  'js/storage.js', 'js/defaults.js', 'js/models.js', 'js/plans.js', 'js/plan-ui.js', 'js/assets.js', 'js/personalization.js', 'js/stats.js', 'js/app.js', 'js/features.js', 'js/pwa.js',
  'icons/logo.svg', 'icons/favicon-32.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
const CORE_URLS = new Set(CORE_FILES.map(path => new URL(path, BASE).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...CORE_URLS])));
  // Let active pages finish using their current version. A new worker activates after they close.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'TODAY_WORK_VERSION') event.ports[0]?.postMessage({ version: CACHE_VERSION });
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const isHome = request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname);
  const canonical = new URL(url.pathname, BASE.origin).href;
  if (!isHome && !CORE_URLS.has(canonical)) return;
  // Keep one coherent shell version, including HTML. No task data or downloads are cached.
  const target = isHome ? new URL('index.html', BASE).href : canonical;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const stored = await cache.match(target);
    return stored || fetch(request);
  })());
});
