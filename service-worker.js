/**
 * SOJ QC — Service Worker
 * Caches the static app shell (the 4 pages, manifest, icons) for fast loads
 * and installability. Deliberately does NOT cache anything going to the
 * Apps Script backends (script.google.com) — report/attendance data is
 * always fetched live, never served from cache.
 */

const CACHE_NAME = 'soj-qc-shell-v1';

const APP_SHELL = [
  '/',
  '/post-report/',
  '/timer-observer/',
  '/dashboard/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GET requests. Anything going to a different
  // origin (script.google.com, docs.google.com, etc.) is left completely
  // alone — no interception, no caching, always live.
  if (url.origin !== self.location.origin || request.method !== 'GET') {
    return;
  }

  // Stale-while-revalidate: serve from cache instantly if we have it, but
  // always refresh the cache in the background so updates show up on the
  // next visit. Falls back to cache if the network is unavailable (offline).
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
