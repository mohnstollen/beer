// Service Worker: App-Shell cache-first, damit die App komplett offline läuft.
// VERSION wird beim Deployment automatisch durch den Commit ersetzt (siehe .github/workflows/pages.yml).
const VERSION = 'v5';
const CACHE = `beer-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/model.js',
  './js/ui.js',
  './js/styles.js',
  './js/extras.js',
  './js/sync-core.js',
  './js/sync.js',
  './js/native.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'beer-libs').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Versionierte Bibliotheken (Scanner, Karte) nach dem ersten Laden auch offline bereithalten
const LIB_ORIGINS = ['https://unpkg.com'];

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (LIB_ORIGINS.includes(url.origin)) {
    e.respondWith(caches.open('beer-libs').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
