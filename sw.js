/* Works offline. Bump VERSION whenever you change files so phones pick up the update. */
const VERSION = 'coc-v5';
const FILES = ['./', 'index.html', 'styles.css', 'config.js', 'core.js', 'persist.js', 'cloud.js', 'game.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // network first (never the browser's HTTP cache) so a new version shows on the next open; the saved copy is only for offline
  e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true }))));
});
