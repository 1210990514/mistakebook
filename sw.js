/* sw.js — 离线缓存：应用 shell 预缓存 + 运行时缓存优先 */
const CACHE = 'cuoti-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/db.js',
  './js/ocr.js',
  './js/app.js',
  './vendor/vue.global.prod.js',
  './vendor/dexie.min.js',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // OCR 语言包 / wasm 核心：缓存优先，失败时回源并写入缓存
  const isOcrAsset = url.origin === self.location.origin
    ? url.pathname.includes('/vendor/tesseract/')
    : (url.hostname === 'tessdata.projectnaptha.com' ||
       url.hostname === 'cdn.jsdelivr.net' ||
       url.hostname === 'unpkg.com');

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && (isOcrAsset || url.origin === self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch((err) => {
        // 导航请求离线兜底
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw err;
      });
    })
  );
});
