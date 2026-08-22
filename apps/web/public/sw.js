// Patches PWA Service Worker — shell caching & offline resilience
const CACHE_NAME = 'patches-shell-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key.startsWith('patches-shell-'))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests that are not assets
  if (request.method !== 'GET') {
    return;
  }

  // Never cache Connect edge gRPC / API calls
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/patches.v1.')) {
    return;
  }

  // Navigation requests: Network-First with cached SPA index.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached || caches.match('/')),
      ),
    );
    return;
  }

  // Static build assets (e.g. /assets/*.js, /assets/*.css, icons)
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/') || PRECACHE_URLS.includes(url.pathname)) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) {
            // Revalidate in background for updated assets
            fetch(request)
              .then((response) => {
                if (response && response.status === 200) {
                  const clone = response.clone();
                  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
              })
              .catch(() => {});
            return cached;
          }
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          });
        }),
      );
    }
  }
});
