/* 墨課 · Service Worker（離線可用） */
const CACHE = 'moke-v126';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/board.js',
  'js/share.js',
  'js/lesson.js',
  'js/app.js',
  'js/vendor/peerjs.min.js',
  'js/vendor/qrcode.min.js',
  'js/vendor/jspdf.umd.min.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // v80：頁面導航改 network-first（cache-first 曾導致壞快取卡死，線上永遠先抓新的）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: false }).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        // 同源 GET 成功就順手快取
        if (resp.ok && new URL(req.url).origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
