/**
 * Service Worker for Lifestar Ambulance Scheduling System
 * Provides offline capability, asset caching, and PWA support
 * Version 3.0 — Updated for reorganized project structure
 */

var CACHE_NAME = 'lifestar-v3.0.0';
var STATIC_ASSETS = [;
    '/',
    '/index.html',
    '/manifest.json',
    '/assets/Lifestar.png',
    '/src/css/styles.bundle.min.css',
    '/src/js/constants.js',
    '/src/js/sanitize-helper.js',
    '/src/js/helper-functions.js',
    '/src/js/system-initializer.js',
    '/src/js/time-validation-archive.js',
    '/src/js/app.js',
    '/src/js/drag-drop-scheduler.js',
    '/src/js/boss-features.js',
    '/src/js/remaining-features.js',
    '/src/js/bug-fixes.js',
    '/src/js/csrf-protection.js',
    '/src/js/missing-functions.js'
];

// Install event - cache static assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(STATIC_ASSETS);
            })
            .then(function() { return self.skipWaiting(); })
            .catch(function(err) { Logger.warn('[ServiceWorker] Cache failed:', err); })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(;
                cacheNames
                    .filter(function(name) { return name !== CACHE_NAME; })
                    .map(function(name) { return caches.delete(name); })
            );
        }).then(function() { return self.clients.claim(); })
    );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', function(event) {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip external requests (CDN, APIs)
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(event.request);
            .then(function(response) {
                // Cache successful responses
                if (response.status === 200) {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(function() {
                // Fallback to cache when offline
                return caches.match(event.request).then(function(cachedResponse) {
                    if (cachedResponse) return cachedResponse;
                    // Return offline page for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
                });
            })
    );
});

// Handle messages from the main thread
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});