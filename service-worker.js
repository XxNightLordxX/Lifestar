/**
 * Service Worker for Lifestar Ambulance Scheduling System
 * Provides offline capability, asset caching, and PWA support
 * Version 3.2 — Updated for consolidated project structure
 */

var CACHE_NAME = 'lifestar-v3.2.0';
var STATIC_ASSETS = [
    '/',
    '/index.html',
    '/src/css/styles.bundle.min.css',
    '/src/js/core-constants.js',
    '/src/js/core-utils.js',
    '/src/js/core-helpers.js',
    '/src/js/core-security.js',
    '/src/js/core-ui.js',
    '/src/js/core-validation.js',
    '/src/js/core-features.js',
    '/src/js/core-permissions.js',
    '/src/js/core-accessibility.js',
    '/src/js/core-notifications.js',
    '/src/js/core-calendar.js',
    '/src/js/core-analytics.js',
    '/src/js/core-enhancements.js',
    '/src/js/core-performance.js',
    '/src/js/dark-mode-toggle.js',
    '/src/js/server-bridge.js',
    '/src/js/api-client.js',
    '/src/js/app.js',
    '/src/js/drag-drop-scheduler.js',
    '/src/js/bug-fixes.js',
    '/src/js/fixes-and-features.js'
];

// Install event — pre-cache all static assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(STATIC_ASSETS);
            })
            .then(function() { return self.skipWaiting(); })
            .catch(function(err) { console.warn('[ServiceWorker] Cache failed:', err); })
    );
});

// Activate event — purge old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function(name) { return name !== CACHE_NAME; })
                    .map(function(name) { return caches.delete(name); })
            );
        }).then(function() { return self.clients.claim(); })
    );
});

// Fetch event — network first, fallback to cache
self.addEventListener('fetch', function(event) {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip external requests (CDN, APIs)
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(event.request)
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
                    // Return index.html for navigation requests
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
