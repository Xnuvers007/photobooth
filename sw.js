const CACHE_NAME = 'cutebooth-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/face-api.min.js',
  './assets/models/tiny_face_detector_model-weights_manifest.json',
  './assets/models/tiny_face_detector_model-shard1',
  './manifest.json',
  // Note: We don't cache external fonts here directly to avoid opaque response issues,
  // but they will be fetched normally by the browser if online.
];

// Install Event: Cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        console.log('[Service Worker] Caching App Shell');
        for (let asset of ASSETS_TO_CACHE) {
          try {
            const response = await fetch(asset);
            if (response.ok) {
              await cache.put(asset, response);
            } else {
              console.warn('[Service Worker] Gagal fetch aset:', asset, response.status);
            }
          } catch (e) {
            console.warn('[Service Worker] Penyimpanan diblokir untuk aset:', asset);
          }
        }
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[Service Worker] Akses ke Cache Storage diblokir browser. Fitur offline dimatikan.');
        return self.skipWaiting();
      })
  );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Event: Stale-While-Revalidate Strategy for robust offline support
self.addEventListener('fetch', event => {
  // Only handle GET requests and HTTP/HTTPS (ignore chrome-extension:// etc)
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Cache the fresh response if it's a valid response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache).catch(() => {}); // Abaikan jika dilarang
          }).catch(() => {}); // Abaikan jika dilarang
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for offline mode if network fails and no cache exists
        console.warn('[Service Worker] Network request failed and no cache available for:', event.request.url);
      });

      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
