/**
 * Advanced Performance Optimizer Module
 * Extensive performance optimizations beyond the basic optimizer
 */

const AdvancedPerformanceOptimizer = {
    // Advanced caching mechanisms
    objectCache: new Map(),
    functionCache: new WeakMap(),
    imageCache: new Map(),

    // Performance monitoring
    metrics: {
        operationTimes: new Map(),
        memoryUsage: [],
        renderTimes: []
    },

    // Virtual DOM diffing
    virtualDOMCache: new Map(),

    /**
     * Advanced object pooling for memory efficiency
     */
    objectPool: {
        pools: new Map(),

        get(poolName, createFn) {
            if(!this.pools.has(poolName)) {
                this.pools.set(poolName, []);
            }

            const pool = this.pools.get(poolName);
            if(pool.length > 0) {
                return pool.pop();
            }

            return createFn();
        },

        release(poolName, object) {
            if(!this.pools.has(poolName)) {
                this.pools.set(poolName, []);
            }

            // Reset object if it has a reset method
            if(typeof object.reset === 'function') {
                object.reset();
            }

            this.pools.get(poolName).push(object);
        },

        clear(poolName) {
            if(poolName) {
                this.pools.delete(poolName);
            } else {
                this.pools.clear();
            }
        }
    },

    /**
     * Advanced lazy loading with Intersection Observer
     */
    lazyLoadObserver: null,

    setupAdvancedLazyLoad() {
        if('IntersectionObserver' in window) {
            this.lazyLoadObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if(entry.isIntersecting) {
                        const element = entry.target;
                        const src = element.dataset.src;

                        if(src) {
                            element.src = src;
                            element.classList.add('loaded');
                            element.removeAttribute('data-src');
                        }

                        // Call load callback if exists
                        if(typeof element.onload === 'function') {
                            element.onload();
                        }

                        this.lazyLoadObserver.unobserve(element);
                    }
                });
            }, {
                rootMargin: '100px',
                threshold: 0.01
            });
        }
    },

    lazyLoadElement(element) {
        if(this.lazyLoadObserver && element) {
            this.lazyLoadObserver.observe(element);
        }
    },

    /**
     * Advanced debounce with trailing edge
     */
    advancedDebounce(key, func, wait, options = {}) {
        if(!this.debounceTimers) {
            this.debounceTimers = new Map();
        }

        const { leading = false, trailing = true, maxWait } = options;

        return function debounced(...args) {
            const now = Date.now();

            if(!this.debounceTimers.has(key)) {
                this.debounceTimers.set(key, {
                    lastCallTime: now,
                    timer: null
                });
            }

            const timerData = this.debounceTimers.get(key);
            const timeSinceLastCall = now - timerData.lastCallTime;

            // Clear existing timer
            if(timerData.timer) {
                clearTimeout(timerData.timer);
            }

            // Execute immediately if leading edge and first call
            if(leading && !timerData.lastCallTime) {
                func.apply(this, args);
                return;
            }

            // Check max wait
            if(maxWait && timeSinceLastCall >= maxWait) {
                func.apply(this, args);
                this.debounceTimers.delete(key);
                return;
            }

            // Schedule trailing edge
            if(trailing) {
                timerData.timer = setTimeout(() => {
                    func.apply(this, args);
                    this.debounceTimers.delete(key);
                }, wait - timeSinceLastCall);
            }

            timerData.lastCallTime = now;
        }.bind(this);
    },

    /**
     * Advanced throttle with leading and trailing options
     */
    advancedThrottle(func, wait, options = {}) {
        const { leading = true, trailing = true } = options;
        let lastCallTime = 0;
        let timer = null;

        return function throttled(...args) {
            const now = Date.now();
            const timeSinceLastCall = now - lastCallTime;

            // Clear existing timer
            if(timer) {
                clearTimeout(timer);
            }

            // Execute immediately if leading edge and first call
            if(leading && timeSinceLastCall >= wait) {
                func.apply(this, args);
                lastCallTime = now;
                return;
            }

            // Schedule trailing edge
            if(trailing) {
                timer = setTimeout(() => {
                    func.apply(this, args);
                    lastCallTime = Date.now();
                }, wait - timeSinceLastCall);
            }
        }.bind(this);
    },

    /**
     * Request Animation Frame optimization
     */
    rafQueue: [],
    rafId: null,

    scheduleRaf(callback) {
        this.rafQueue.push(callback);

        if(!this.rafId) {
            this.rafId = requestAnimationFrame(() => {
                const queue = this.rafQueue.slice();
                this.rafQueue = [];
                this.rafId = null;

                queue.forEach(cb => cb());
            });
        }
    },

    /**
     * Batch multiple DOM updates in a single RAF
     */
    batchDOMUpdatesAdvanced(updates) {
        this.scheduleRaf(() => {
            updates.forEach(update => update());
        });
    },

    /**
     * Advanced localStorage with compression
     */
    async compressLocalStorage(key, value) {
        try {
            const jsonString = JSON.stringify(value);

            // Simple compression: remove whitespace
            const compressed = jsonString.replace(/\s+/g, '');

            localStorage.setItem(key, compressed);
            return true;
        } catch (error) {
            Logger.error('Compression error:', error);
            return false;
        }
    },

    async decompressLocalStorage(key) {
        try {
            const compressed = (localStorage.getItem(key) || null);
            if(!compressed) return null;

            // Decompress by parsing JSON
            return JSON.parse(compressed);
        } catch (error) {
            Logger.error('Decompression error:', error);
            return null;
        }
    },

    /**
     * IndexedDB wrapper for large datasets
     */
    indexedDB: {
        db: null,

        async init(dbName = 'LifestarDB', version = 1) {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(dbName, version);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    // Create object stores
                    if(!db.objectStoreNames.contains('schedules')) {
                        db.createObjectStore('schedules', { keyPath: 'id' });
                    }
                    if(!db.objectStoreNames.contains('users')) {
                        db.createObjectStore('users', { keyPath: 'id' });
                    }
                    if(!db.objectStoreNames.contains('logs')) {
                        db.createObjectStore('logs', { keyPath: 'id' });
                    }
                };
            });
        },

        async put(storeName, data) {
            if(!this.db) await this.init();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async get(storeName, key) {
            if(!this.db) await this.init();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async getAll(storeName) {
            if(!this.db) await this.init();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
    },

    /**
     * Web Workers for background processing
     */
    webWorkers: {
        workers: new Map(),

        createWorker(scriptContent) {
            const blob = new Blob([scriptContent], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            const worker = new Worker(url);

            return { worker, url };
        },

        processInBackground(scriptContent, data) {
            return new Promise((resolve, reject) => {
                const { worker, url } = this.createWorker(scriptContent);

                worker.onmessage = (e) => {
                    resolve(e.data);
                    worker.terminate();
                    URL.revokeObjectURL(url);
                };

                worker.onerror = (error) => {
                    reject(error);
                    worker.terminate();
                    URL.revokeObjectURL(url);
                };

                worker.postMessage(data);
            });
        }
    },

    /**
     * Service Worker for offline support
     */
    async registerServiceWorker() {
        if('serviceWorker' in navigator) {
            try {
                // Create a simple service worker inline
                const swCode = `;
                    self.addEventListener('install', (event) => {
                        self.skipWaiting();
                    });

                    self.addEventListener('fetch', (event) => {
                        event.respondWith(
                            caches.match(event.request).then((response) => {
                                return response || fetch(event.request);
                            })
                        );
                    });
                `;

                const blob = new Blob([swCode], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);

                const registration = await navigator.serviceWorker.register(url);
                Logger.debug('Service Worker registered:', registration);

                return registration;
            } catch (error) {
                Logger.error('Service Worker registration failed:', error);
            }
        }
    },

    /**
     * Memory optimization - clear caches periodically
     */
    setupMemoryOptimization() {
        // Clear caches every 5 minutes
        setInterval(() => {
            this.clearOldCacheEntries();
            this.objectPool.clear();
        }, 5 * 60 * 1000);
    },

    clearOldCacheEntries(maxAge = 10 * 60 * 1000) {
        const now = Date.now();

        this.objectCache.forEach((value, key) => {
            if(value.timestamp && (now - value.timestamp) > maxAge) {
                this.objectCache.delete(key);
            }
        });
    },

    /**
     * Performance monitoring
     */
    startPerformanceMeasure(label) {
        performance.mark(`${label}-start`);
    },

    endPerformanceMeasure(label) {
        performance.mark(`${label}-end`);
        performance.measure(label, `${label}-start`, `${label}-end`);

        const measure = performance.getEntriesByName(label)[0];
        const duration = measure.duration;

        // Store metric
        if(!this.metrics.operationTimes.has(label)) {
            this.metrics.operationTimes.set(label, []);
        }
        this.metrics.operationTimes.get(label).push(duration);

        // Clean up marks
        performance.clearMarks(`${label}-start`);
        performance.clearMarks(`${label}-end`);
        performance.clearMeasures(label);

        return duration;
    },

    getPerformanceMetrics() {
        const metrics = {};

        this.metrics.operationTimes.forEach((times, label) => {
            metrics[label] = {
                average: times.reduce((a, b) => a + b, 0) / times.length,
                min: Math.min(...times),
                max: Math.max(...times),
                count: times.length
            };
        });

        return metrics;
    },

    /**
     * Optimize CSS rendering
     */
    optimizeCSSRendering() {
        // Use will-change for animated elements
        const animatedElements = document.querySelectorAll('[data-animate]');
        animatedElements.forEach(el => {
            el.style.willChange = 'transform, opacity';
        });

        // Use contain for complex elements
        const complexElements = document.querySelectorAll('.card, .modal');
        complexElements.forEach(el => {
            el.style.contain = 'layout style paint';
        });
    },

    /**
     * Optimize image loading
     */
    optimizeImages() {
        const images = document.querySelectorAll('img[data-src]');
        images.forEach(img => {
            this.lazyLoadElement(img);
        });
    },

    /**
     * Prefetch critical resources
     */
    prefetchResources(urls) {
        urls.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = url;
            document.head.appendChild(link);
        });
    },

    /**
     * Preload critical resources
     */
    preloadResources(urls) {
        urls.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = url;
            link.as = url.endsWith('.js') ? 'script' : 'style';
            document.head.appendChild(link);
        });
    }
};

// Initialize advanced performance optimizations
if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AdvancedPerformanceOptimizer.setupAdvancedLazyLoad();
        AdvancedPerformanceOptimizer.setupMemoryOptimization();
        AdvancedPerformanceOptimizer.optimizeCSSRendering();
        AdvancedPerformanceOptimizer.optimizeImages();
    });
} else {
    AdvancedPerformanceOptimizer.setupAdvancedLazyLoad();
    AdvancedPerformanceOptimizer.setupMemoryOptimization();
    AdvancedPerformanceOptimizer.optimizeCSSRendering();
    AdvancedPerformanceOptimizer.optimizeImages();
}

// Export for use in other modules
if(typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedPerformanceOptimizer;
}
