// Fieldio service worker.
// Hand-written (no workbox/next-pwa). Strategies:
//   - navigations: network-first → cached page → cached shell → offline.html
//   - same-origin static assets: stale-while-revalidate
//   - non-GET / cross-origin: passthrough (the RQ persister + offline queue
//     own read caching and mutation replay)
//
// Update flow: this SW does NOT auto-skipWaiting. A freshly installed worker
// parks in `waiting` until the app posts { type: 'SKIP_WAITING' } (driven by
// the in-app "update available" toast), then activates and clientsClaim()s so
// the next controllerchange can trigger a single reload.

const CACHE_NAME = 'fieldio-v4';
const OFFLINE_URL = '/offline.html';

// App shell + assets we want available on a cold, signal-less launch. The two
// field routes are precached so a tech who force-quit the app can still open
// their schedule and van stock with no signal (they were navigation-only before,
// so only "/" survived cold offline).
const APP_SHELL = [
    '/',
    '/my-schedule',
    '/my-van/stock',
    OFFLINE_URL,
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-192.png',
    '/icons/icon-maskable-512.png',
    '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // Don't let one 404 abort the whole precache.
            Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
        )
    );
    // NB: intentionally no skipWaiting() here — see file header.
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map((name) => (name !== CACHE_NAME ? caches.delete(name) : undefined))
            );
            await self.clients.claim();
        })()
    );
});

// The app posts this when the user accepts the "update available" toast.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
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

    // App navigations: network-first, and cache each successful page so it can be
    // served on a later cold, signal-less launch (not just "/"). On failure fall
    // back to the matching cached page, then the cached app shell, then the
    // dedicated offline page so a cold offline launch shows the Fieldio frame.
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const networkResponse = await fetch(request);
                    // Cache successful, non-redirected same-origin navigations only.
                    // (A redirect to /login can't be cache.put under a nav request,
                    // and we never want to pin an auth bounce as a page.)
                    if (
                        networkResponse &&
                        networkResponse.ok &&
                        networkResponse.type === 'basic' &&
                        !networkResponse.redirected
                    ) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
                    }
                    return networkResponse;
                } catch {
                    const cache = await caches.open(CACHE_NAME);
                    return (
                        (await cache.match(request)) ||
                        (await cache.match('/')) ||
                        (await cache.match(OFFLINE_URL))
                    );
                }
            })()
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
