// Anusuya Inventory — Service Worker v6
const CACHE = 'anusuya-v8';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always network for Firebase
  if (e.request.url.includes('firebaseio.com') ||
      e.request.url.includes('firebase') ||
      e.request.url.includes('gstatic.com')) {
    return;
  }
  // Network first for app files
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
