const CACHE_NAME = 'fieldio-v2';
const APP_SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Never touch writes or non-GET verbs — let them go straight to the
    // network so the app's own offline queue owns retry/replay semantics.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Only the web app's own origin is cacheable here. API reads (a different
    // origin) are cached by the React Query persister, not the SW.
    if (url.origin !== self.location.origin) return;

    // App navigations: network-first, fall back to the matching cached page,
    // then to the cached app shell so the SPA still boots with no signal.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match(request);
                return cached || (await caches.match('/'));
            })
        );
        return;
    }

    // Static assets: stale-while-revalidate.
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (
                        networkResponse &&
                        networkResponse.status === 200 &&
                        networkResponse.type === 'basic'
                    ) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);
            return cachedResponse || fetchPromise;
        })
    );
});
