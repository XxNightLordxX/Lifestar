/**
 * Core Performance Module
 * Consolidates: advanced-performance-optimizer.js, memory-leak-fixes.js, 
 * edge-case-handler.js, rate-limiter.js
 * 
 * Version: 2.0.0
 * Total lines consolidated: ~1700 lines → optimized
 */

(function() {
    'use strict';

    // ============================================================
    // PERFORMANCE STATE
    // ============================================================
    const PerformanceState = {
        initialized: false,
        metrics: {
            operationTimes: new Map(),
            memoryUsage: [],
            renderTimes: []
        }
    };

    // ============================================================
    // MEMORY MANAGER
    // ============================================================
    const MemoryManager = {
        intervals: new Map(),
        timeouts: new Map(),
        eventListeners: new Map(),
        animationFrames: new Map(),
        idCounter: 0,

        /**
         * Initialize memory manager
         */
        init: function() {
            window.addEventListener('beforeunload', () => this.cleanupAll());
            
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.cleanupNonEssential();
                }
            });

            Logger.debug('[MemoryManager] Initialized');
        },

        generateId: function() {
            return ++this.idCounter;
        },

        /**
         * Trackable setInterval - automatically cleaned up
         */
        setInterval: function(callback, delay, name = 'unnamed') {
            const id = this.generateId();
            const intervalId = window.setInterval(() => {
                try {
                    callback();
                } catch (error) {
                    Logger.error(`Interval ${name} error:`, error);
                }
            }, delay);
            
            this.intervals.set(id, {
                id: intervalId,
                name: name,
                created: Date.now(),
                delay: delay
            });
            
            return id;
        },

        /**
         * Trackable setTimeout - automatically cleaned up
         */
        setTimeout: function(callback, delay, name = 'unnamed') {
            const id = this.generateId();
            const timeoutId = window.setTimeout(() => {
                this.timeouts.delete(id);
                try {
                    callback();
                } catch (error) {
                    Logger.error(`Timeout ${name} error:`, error);
                }
            }, delay);
            
            this.timeouts.set(id, {
                id: timeoutId,
                name: name,
                created: Date.now(),
                delay: delay
            });
            
            return id;
        },

        /**
         * Trackable requestAnimationFrame
         */
        requestAnimationFrame: function(callback, name = 'unnamed') {
            const id = this.generateId();
            const frameId = window.requestAnimationFrame((timestamp) => {
                this.animationFrames.delete(id);
                try {
                    callback(timestamp);
                } catch (error) {
                    Logger.error(`Animation frame ${name} error:`, error);
                }
            });
            
            this.animationFrames.set(id, {
                id: frameId,
                name: name,
                created: Date.now()
            });
            
            return id;
        },

        /**
         * Trackable addEventListener
         */
        addEventListener: function(element, event, callback, options = {}, name = 'unnamed') {
            const id = this.generateId();
            const wrappedCallback = (e) => {
                try {
                    callback(e);
                } catch (error) {
                    Logger.error(`Event listener ${name} error:`, error);
                }
            };
            
            element.addEventListener(event, wrappedCallback, options);
            
            this.eventListeners.set(id, {
                element: element,
                event: event,
                callback: wrappedCallback,
                originalCallback: callback,
                name: name,
                created: Date.now()
            });
            
            return id;
        },

        clearInterval: function(id) {
            const interval = this.intervals.get(id);
            if (interval) {
                window.clearInterval(interval.id);
                this.intervals.delete(id);
            }
        },

        clearTimeout: function(id) {
            const timeout = this.timeouts.get(id);
            if (timeout) {
                window.clearTimeout(timeout.id);
                this.timeouts.delete(id);
            }
        },

        cancelAnimationFrame: function(id) {
            const frame = this.animationFrames.get(id);
            if (frame) {
                window.cancelAnimationFrame(frame.id);
                this.animationFrames.delete(id);
            }
        },

        removeEventListener: function(id) {
            const listener = this.eventListeners.get(id);
            if (listener) {
                listener.element.removeEventListener(listener.event, listener.callback);
                this.eventListeners.delete(id);
            }
        },

        /**
         * Clean up all intervals, timeouts, and event listeners
         */
        cleanupAll: function() {
            Logger.debug('🧹 Cleaning up all tracked resources...');
            
            for (const [id, interval] of this.intervals) {
                window.clearInterval(interval.id);
            }
            this.intervals.clear();
            
            for (const [id, timeout] of this.timeouts) {
                window.clearTimeout(timeout.id);
            }
            this.timeouts.clear();
            
            for (const [id, frame] of this.animationFrames) {
                window.cancelAnimationFrame(frame.id);
            }
            this.animationFrames.clear();
            
            for (const [id, listener] of this.eventListeners) {
                listener.element.removeEventListener(listener.event, listener.callback);
            }
            this.eventListeners.clear();
            
            Logger.debug('✅ All resources cleaned up');
        },

        cleanupNonEssential: function() {
            for (const [id, listener] of this.eventListeners) {
                if (listener.name.includes('nonEssential') || listener.name.includes('animation')) {
                    listener.element.removeEventListener(listener.event, listener.callback);
                    this.eventListeners.delete(id);
                }
            }
            
            for (const [id, frame] of this.animationFrames) {
                if (frame.name.includes('nonEssential')) {
                    window.cancelAnimationFrame(frame.id);
                    this.animationFrames.delete(id);
                }
            }
        },

        getStats: function() {
            return {
                intervals: this.intervals.size,
                timeouts: this.timeouts.size,
                eventListeners: this.eventListeners.size,
                animationFrames: this.animationFrames.size,
                total: this.intervals.size + this.timeouts.size + this.eventListeners.size + this.animationFrames.size
            };
        },

        checkForLeaks: function() {
            const stats = this.getStats();
            const warnings = [];
            
            if (stats.intervals > 10) {
                warnings.push(`High number of intervals: ${stats.intervals}`);
            }
            
            if (stats.eventListeners > 100) {
                warnings.push(`High number of event listeners: ${stats.eventListeners}`);
            }
            
            const now = Date.now();
            const maxAge = 30 * 60 * 1000;
            
            for (const [id, interval] of this.intervals) {
                if (now - interval.created > maxAge) {
                    warnings.push(`Long-running interval: ${interval.name} (${Math.round((now - interval.created) / 60000)} minutes)`);
                }
            }
            
            return {
                stats: stats,
                warnings: warnings,
                hasIssues: warnings.length > 0
            };
        },

        createObjectPool: function(factory, initialSize = 10) {
            const pool = [];
            const inUse = new Set();
            
            for (let i = 0; i < initialSize; i++) {
                pool.push(factory());
            }
            
            return {
                get: function() {
                    let obj = pool.pop();
                    if (!obj) {
                        obj = factory();
                    }
                    inUse.add(obj);
                    return obj;
                },
                
                release: function(obj) {
                    if (inUse.has(obj)) {
                        inUse.delete(obj);
                        if (typeof obj.reset === 'function') {
                            obj.reset();
                        }
                        pool.push(obj);
                    }
                },
                
                getStats: function() {
                    return {
                        available: pool.length,
                        inUse: inUse.size
                    };
                }
            };
        }
    };

    // ============================================================
    // ADVANCED PERFORMANCE OPTIMIZER
    // ============================================================
    const PerformanceOptimizer = {
        objectCache: new Map(),
        functionCache: new WeakMap(),
        imageCache: new Map(),
        virtualDOMCache: new Map(),
        lazyLoadObserver: null,
        rafQueue: [],
        rafId: null,

        // Object pooling
        objectPool: {
            pools: new Map(),

            get: function(poolName, createFn) {
                if (!this.pools.has(poolName)) {
                    this.pools.set(poolName, []);
                }

                const pool = this.pools.get(poolName);
                if (pool.length > 0) {
                    return pool.pop();
                }

                return createFn();
            },

            release: function(poolName, object) {
                if (!this.pools.has(poolName)) {
                    this.pools.set(poolName, []);
                }

                if (typeof object.reset === 'function') {
                    object.reset();
                }

                this.pools.get(poolName).push(object);
            },

            clear: function(poolName) {
                if (poolName) {
                    this.pools.delete(poolName);
                } else {
                    this.pools.clear();
                }
            }
        },

        /**
         * Initialize performance optimizer
         */
        init: function() {
            this.setupAdvancedLazyLoad();
            this.setupMemoryOptimization();
            this.optimizeCSSRendering();
            this.optimizeImages();
            Logger.debug('[PerformanceOptimizer] Initialized');
        },

        /**
         * Setup advanced lazy loading with Intersection Observer
         */
        setupAdvancedLazyLoad: function() {
            if ('IntersectionObserver' in window) {
                this.lazyLoadObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const element = entry.target;
                            const src = element.dataset.src;

                            if (src) {
                                element.src = src;
                                element.classList.add('loaded');
                                element.removeAttribute('data-src');
                            }

                            if (typeof element.onload === 'function') {
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

        lazyLoadElement: function(element) {
            if (this.lazyLoadObserver && element) {
                this.lazyLoadObserver.observe(element);
            }
        },

        /**
         * Advanced debounce with trailing edge
         */
        debounce: function(key, func, wait, options = {}) {
            if (!this.debounceTimers) {
                this.debounceTimers = new Map();
            }

            const { leading = false, trailing = true, maxWait } = options;
            const self = this;

            return function debounced(...args) {
                const now = Date.now();

                if (!self.debounceTimers.has(key)) {
                    self.debounceTimers.set(key, {
                        lastCallTime: now,
                        timer: null
                    });
                }

                const timerData = self.debounceTimers.get(key);

                if (timerData.timer) {
                    clearTimeout(timerData.timer);
                }

                if (leading && !timerData.lastCallTime) {
                    func.apply(this, args);
                    return;
                }

                if (maxWait && (now - timerData.lastCallTime) >= maxWait) {
                    func.apply(this, args);
                    self.debounceTimers.delete(key);
                    return;
                }

                if (trailing) {
                    timerData.timer = setTimeout(() => {
                        func.apply(this, args);
                        self.debounceTimers.delete(key);
                    }, wait);
                }

                timerData.lastCallTime = now;
            };
        },

        /**
         * Advanced throttle with leading and trailing options
         */
        throttle: function(func, wait, options = {}) {
            const { leading = true, trailing = true } = options;
            let lastCallTime = 0;
            let timer = null;

            return function throttled(...args) {
                const now = Date.now();
                const timeSinceLastCall = now - lastCallTime;

                if (timer) {
                    clearTimeout(timer);
                }

                if (leading && timeSinceLastCall >= wait) {
                    func.apply(this, args);
                    lastCallTime = now;
                    return;
                }

                if (trailing) {
                    timer = setTimeout(() => {
                        func.apply(this, args);
                        lastCallTime = Date.now();
                    }, wait - timeSinceLastCall);
                }
            };
        },

        /**
         * Request Animation Frame optimization
         */
        scheduleRaf: function(callback) {
            this.rafQueue.push(callback);

            if (!this.rafId) {
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
        batchDOMUpdates: function(updates) {
            this.scheduleRaf(() => {
                updates.forEach(update => update());
            });
        },

        /**
         * Advanced localStorage with compression
         */
        compressLocalStorage: async function(key, value) {
            try {
                const jsonString = JSON.stringify(value);
                const compressed = jsonString.replace(/\s+/g, '');
                localStorage.setItem(key, compressed);
                return true;
            } catch (error) {
                Logger.error('Compression error:', error);
                return false;
            }
        },

        decompressLocalStorage: async function(key) {
            try {
                const compressed = localStorage.getItem(key);
                if (!compressed) return null;
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

            init: async function(dbName = 'LifestarDB', version = 1) {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbName, version);

                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        this.db = request.result;
                        resolve(this.db);
                    };

                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;

                        if (!db.objectStoreNames.contains('schedules')) {
                            db.createObjectStore('schedules', { keyPath: 'id' });
                        }
                        if (!db.objectStoreNames.contains('users')) {
                            db.createObjectStore('users', { keyPath: 'id' });
                        }
                        if (!db.objectStoreNames.contains('logs')) {
                            db.createObjectStore('logs', { keyPath: 'id' });
                        }
                    };
                });
            },

            put: async function(storeName, data) {
                if (!this.db) await this.init();

                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction([storeName], 'readwrite');
                    const store = transaction.objectStore(storeName);
                    const request = store.put(data);

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            },

            get: async function(storeName, key) {
                if (!this.db) await this.init();

                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction([storeName], 'readonly');
                    const store = transaction.objectStore(storeName);
                    const request = store.get(key);

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            },

            getAll: async function(storeName) {
                if (!this.db) await this.init();

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
         * Setup memory optimization - clear caches periodically
         */
        setupMemoryOptimization: function() {
            setInterval(() => {
                this.clearOldCacheEntries();
                this.objectPool.clear();
            }, 5 * 60 * 1000);
        },

        clearOldCacheEntries: function(maxAge = 10 * 60 * 1000) {
            const now = Date.now();

            this.objectCache.forEach((value, key) => {
                if (value.timestamp && (now - value.timestamp) > maxAge) {
                    this.objectCache.delete(key);
                }
            });
        },

        /**
         * Performance monitoring
         */
        startPerformanceMeasure: function(label) {
            performance.mark(`${label}-start`);
        },

        endPerformanceMeasure: function(label) {
            performance.mark(`${label}-end`);
            performance.measure(label, `${label}-start`, `${label}-end`);

            const measure = performance.getEntriesByName(label)[0];
            const duration = measure.duration;

            if (!PerformanceState.metrics.operationTimes.has(label)) {
                PerformanceState.metrics.operationTimes.set(label, []);
            }
            PerformanceState.metrics.operationTimes.get(label).push(duration);

            performance.clearMarks(`${label}-start`);
            performance.clearMarks(`${label}-end`);
            performance.clearMeasures(label);

            return duration;
        },

        getPerformanceMetrics: function() {
            const metrics = {};

            PerformanceState.metrics.operationTimes.forEach((times, label) => {
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
        optimizeCSSRendering: function() {
            const animatedElements = document.querySelectorAll('[data-animate]');
            animatedElements.forEach(el => {
                el.style.willChange = 'transform, opacity';
            });

            const complexElements = document.querySelectorAll('.card, .modal');
            complexElements.forEach(el => {
                el.style.contain = 'layout style paint';
            });
        },

        /**
         * Optimize image loading
         */
        optimizeImages: function() {
            const images = document.querySelectorAll('img[data-src]');
            images.forEach(img => {
                this.lazyLoadElement(img);
            });
        },

        /**
         * Prefetch critical resources
         */
        prefetchResources: function(urls) {
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
        preloadResources: function(urls) {
            urls.forEach(url => {
                const link = document.createElement('link');
                link.rel = 'preload';
                link.href = url;
                link.as = url.endsWith('.js') ? 'script' : 'style';
                document.head.appendChild(link);
            });
        }
    };

    // ============================================================
    // EDGE CASE HANDLER
    // ============================================================
    const EdgeCaseHandler = {
        /**
         * Initialize edge case handler
         */
        init: function() {
            this.patchGlobalFunctions();
            Logger.debug('[EdgeCaseHandler] Initialized');
        },

        /**
         * Safe getter for nested object properties
         */
        safeGet: function(obj, path, defaultValue = null) {
            if (obj === null || obj === undefined) {
                return defaultValue;
            }
            
            const keys = path.split('.');
            let current = obj;
            
            for (const key of keys) {
                if (current === null || current === undefined) {
                    return defaultValue;
                }
                current = current[key];
            }
            
            return current !== undefined ? current : defaultValue;
        },

        /**
         * Safe number parsing with validation
         */
        safeNumber: function(value, defaultValue = 0, min = null, max = null) {
            const num = parseFloat(value);
            
            if (isNaN(num) || !isFinite(num)) {
                return defaultValue;
            }
            
            let result = num;
            
            if (min !== null && result < min) {
                result = min;
            }
            if (max !== null && result > max) {
                result = max;
            }
            
            return result;
        },

        /**
         * Safe integer parsing with validation
         */
        safeInteger: function(value, defaultValue = 0, min = null, max = null) {
            const num = parseInt(value, 10);
            
            if (isNaN(num) || !isFinite(num)) {
                return defaultValue;
            }
            
            let result = num;
            
            if (min !== null && result < min) {
                result = min;
            }
            if (max !== null && result > max) {
                result = max;
            }
            
            return result;
        },

        /**
         * Safe string handling
         */
        safeString: function(value, defaultValue = '', maxLength = null) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            let result = String(value);
            
            if (maxLength !== null && result.length > maxLength) {
                result = result.substring(0, maxLength);
            }
            
            return result;
        },

        /**
         * Safe array handling
         */
        safeArray: function(value, defaultValue = []) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            if (Array.isArray(value)) {
                return value;
            }
            
            if (typeof value === 'object' && value.length !== undefined) {
                return Array.from(value);
            }
            
            return defaultValue;
        },

        /**
         * Safe object handling
         */
        safeObject: function(value, defaultValue = {}) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            if (typeof value === 'object' && !Array.isArray(value)) {
                return value;
            }
            
            return defaultValue;
        },

        /**
         * Safe date parsing
         */
        safeDate: function(value, defaultValue = null) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            if (value instanceof Date) {
                return isNaN(value.getTime()) ? defaultValue : value;
            }
            
            const date = new Date(value);
            return isNaN(date.getTime()) ? defaultValue : date;
        },

        /**
         * Safe JSON parsing
         */
        safeJSON: function(value, defaultValue = null) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            try {
                return JSON.parse(value);
            } catch (e) {
                return defaultValue;
            }
        },

        /**
         * Safe function execution
         */
        safeExecute: function(fn, defaultValue = null, ...args) {
            if (typeof fn !== 'function') {
                return defaultValue;
            }
            
            try {
                return fn(...args);
            } catch (error) {
                Logger.error('Safe execution error:', error);
                return defaultValue;
            }
        },

        /**
         * Timezone handling
         */
        timezone: {
            getUserTimezone: function() {
                try {
                    return Intl.DateTimeFormat().resolvedOptions().timeZone;
                } catch (e) {
                    return 'UTC';
                }
            },

            toUserTimezone: function(date, timezone = null) {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return null;
                
                const tz = timezone || this.getUserTimezone();
                
                try {
                    return new Date(d.toLocaleString('en-US', { timeZone: tz }));
                } catch (e) {
                    return d;
                }
            },

            formatWithTimezone: function(date, format = 'short') {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return '';
                
                try {
                    const options = format === 'long'
                        ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }
                        : { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                    
                    return d.toLocaleString(undefined, options);
                } catch (e) {
                    return d.toString();
                }
            },

            startOfDay: function(date, timezone = null) {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return null;
                
                d.setHours(0, 0, 0, 0);
                return d;
            },

            endOfDay: function(date, timezone = null) {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return null;
                
                d.setHours(23, 59, 59, 999);
                return d;
            }
        },

        /**
         * Empty state handling
         */
        emptyState: {
            isEmpty: function(value) {
                if (value === null || value === undefined) {
                    return true;
                }
                
                if (typeof value === 'string') {
                    return value.trim().length === 0;
                }
                
                if (Array.isArray(value)) {
                    return value.length === 0;
                }
                
                if (typeof value === 'object') {
                    return Object.keys(value).length === 0;
                }
                
                return false;
            },

            getEmptyMessage: function(type) {
                const messages = {
                    schedules: 'No schedules found. Create your first schedule to get started.',
                    staff: 'No staff members found. Add staff to begin scheduling.',
                    crews: 'No crews configured. Create crew templates for easier scheduling.',
                    shifts: 'No shifts assigned. Assign shifts to crew members.',
                    requests: 'No pending requests.',
                    history: 'No history available.',
                    notifications: 'No notifications.',
                    search: 'No results found. Try adjusting your search criteria.',
                    data: 'No data available.',
                    default: 'No items found.'
                };
                
                return messages[type] || messages.default;
            },

            renderEmptyState: function(container, type, actionCallback = null) {
                if (!container) return;
                
                const message = this.getEmptyMessage(type);
                let html = `
                    <div class="empty-state" role="status" aria-live="polite" style="text-align:center;padding:40px;">
                        <div class="empty-state-icon" style="font-size:48px;margin-bottom:16px;">📋</div>
                        <p class="empty-state-message" style="color:#6b7280;margin-bottom:16px;">${message}</p>
                `;
                
                if (actionCallback) {
                    html += `<button class="btn btn-primary empty-state-action" onclick="${actionCallback}">Add New</button>`;
                }
                
                html += `</div>`;
                
                container.innerHTML = html;
            }
        },

        /**
         * Special character handling
         */
        specialChars: {
            escapeHtml: function(str) {
                if (str === null || str === undefined) {
                    return '';
                }
                
                const htmlEntities = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;'
                };
                
                return String(str).replace(/[&<>"']/g, char => htmlEntities[char]);
            },

            unescapeHtml: function(str) {
                if (str === null || str === undefined) {
                    return '';
                }
                
                const htmlEntities = {
                    '&amp;': '&',
                    '&lt;': '<',
                    '&gt;': '>',
                    '&quot;': '"',
                    '&#39;': "'"
                };
                
                return String(str).replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, entity => htmlEntities[entity]);
            },

            sanitizeForUrl: function(str) {
                if (str === null || str === undefined) {
                    return '';
                }
                
                return String(str)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
            },

            sanitizeFilename: function(str) {
                if (str === null || str === undefined) {
                    return 'file';
                }
                
                return String(str)
                    .replace(/[<>:"/\\|?*]/g, '_')
                    .replace(/\s+/g, '_')
                    .substring(0, 255);
            }
        },

        /**
         * Patch global functions for safety
         */
        patchGlobalFunctions: function() {
            const originalJSONParse = JSON.parse;
            JSON.parseSafe = function(text, defaultValue = null) {
                try {
                    return originalJSONParse(text);
                } catch (e) {
                    return defaultValue;
                }
            };

            const originalParseInt = parseInt;
            const originalParseFloat = parseFloat;
            
            parseInt.safe = function(value, radix = 10, defaultValue = 0) {
                const result = originalParseInt(value, radix);
                return isNaN(result) ? defaultValue : result;
            };
            
            parseFloat.safe = function(value, defaultValue = 0) {
                const result = originalParseFloat(value);
                return isNaN(result) ? defaultValue : result;
            };
        },

        /**
         * Validate and fix common data issues
         */
        validateData: function(data, schema) {
            if (!data || typeof data !== 'object') {
                return { valid: false, data: null, errors: ['Invalid data object'] };
            }
            
            const errors = [];
            const fixed = { ...data };
            
            for (const [key, rules] of Object.entries(schema)) {
                const value = fixed[key];
                
                if (rules.required && (value === null || value === undefined || value === '')) {
                    if (rules.default !== undefined) {
                        fixed[key] = rules.default;
                    } else {
                        errors.push(`${key} is required`);
                    }
                    continue;
                }
                
                if (rules.type && value !== null && value !== undefined) {
                    const actualType = Array.isArray(value) ? 'array' : typeof value;
                    if (actualType !== rules.type) {
                        switch (rules.type) {
                            case 'string':
                                fixed[key] = String(value);
                                break;
                            case 'number':
                                const num = parseFloat(value);
                                if (!isNaN(num)) {
                                    fixed[key] = num;
                                } else {
                                    errors.push(`${key} must be a number`);
                                }
                                break;
                            case 'boolean':
                                fixed[key] = Boolean(value);
                                break;
                            case 'array':
                                if (typeof value === 'object') {
                                    fixed[key] = Array.isArray(value) ? value : [value];
                                } else {
                                    errors.push(`${key} must be an array`);
                                }
                                break;
                        }
                    }
                }
                
                if (rules.type === 'number' && typeof fixed[key] === 'number') {
                    if (rules.min !== undefined && fixed[key] < rules.min) {
                        fixed[key] = rules.min;
                    }
                    if (rules.max !== undefined && fixed[key] > rules.max) {
                        fixed[key] = rules.max;
                    }
                }
                
                if (rules.type === 'string' && typeof fixed[key] === 'string') {
                    if (rules.maxLength !== undefined && fixed[key].length > rules.maxLength) {
                        fixed[key] = fixed[key].substring(0, rules.maxLength);
                    }
                }
            }
            
            return {
                valid: errors.length === 0,
                data: fixed,
                errors: errors
            };
        }
    };

    // ============================================================
    // RATE LIMITER
    // ============================================================
    const RateLimiter = {
        config: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 100,
            authMaxRequests: 5,
            blockDuration: 30 * 60 * 1000,
            trustedIPs: ['localhost', '127.0.0.1']
        },

        requestStore: new Map(),
        blockedIPs: new Map(),

        /**
         * Initialize the rate limiter
         */
        init: function(customConfig = {}) {
            this.config = { ...this.config, ...customConfig };
            this.startCleanupInterval();
            this.wrapFetch();
            Logger.debug('[RateLimiter] Initialized');
        },

        /**
         * Get client identifier
         */
        getClientId: function(req) {
            if (typeof window !== 'undefined') {
                const stored = sessionStorage.getItem('clientId');
                if (stored) return stored;
                
                const clientId = 'client_' + Math.random().toString(36).substr(2, 9);
                sessionStorage.setItem('clientId', clientId);
                return clientId;
            }
            
            return req.ip || req.connection?.remoteAddress || 'unknown';
        },

        /**
         * Check if request should be allowed
         */
        checkLimit: function(identifier, isAuth = false) {
            const now = Date.now();
            const windowStart = now - this.config.windowMs;
            const maxRequests = isAuth ? this.config.authMaxRequests : this.config.maxRequests;

            if (this.blockedIPs.has(identifier)) {
                const blockExpiry = this.blockedIPs.get(identifier);
                if (now < blockExpiry) {
                    const remainingTime = Math.ceil((blockExpiry - now) / 60000);
                    return {
                        allowed: false,
                        reason: 'BLOCKED',
                        remainingTime: remainingTime,
                        message: `Too many requests. Please try again in ${remainingTime} minutes.`
                    };
                } else {
                    this.blockedIPs.delete(identifier);
                }
            }

            let record = this.requestStore.get(identifier);
            if (!record) {
                record = { requests: [], blocked: false };
                this.requestStore.set(identifier, record);
            }

            record.requests = record.requests.filter(time => time > windowStart);

            if (record.requests.length >= maxRequests) {
                this.blockedIPs.set(identifier, now + this.config.blockDuration);
                return {
                    allowed: false,
                    reason: 'RATE_LIMIT_EXCEEDED',
                    message: `Rate limit exceeded. Please try again later.`
                };
            }

            record.requests.push(now);

            return {
                allowed: true,
                remaining: maxRequests - record.requests.length,
                resetTime: now + this.config.windowMs
            };
        },

        /**
         * Client-side rate limiting wrapper for fetch
         */
        wrapFetch: function() {
            if (typeof window === 'undefined' || !window.fetch) return;
            
            const originalFetch = window.fetch;
            const self = this;
            
            window.fetch = async function(url, options = {}) {
                const identifier = self.getClientId();
                const isAuth = url.includes('/auth/') || url.includes('/login');
                
                const result = self.checkLimit(identifier, isAuth);
                
                if (!result.allowed) {
                    if (typeof showAlert === 'function') {
                        showAlert(result.message, 'warning');
                    }
                    throw new Error(result.message);
                }

                return originalFetch(url, options);
            };
        },

        /**
         * Check if IP is blocked
         */
        isBlocked: function(identifier) {
            if (this.blockedIPs.has(identifier)) {
                const expiry = this.blockedIPs.get(identifier);
                return Date.now() < expiry;
            }
            return false;
        },

        /**
         * Manually block an IP
         */
        block: function(identifier, duration = null) {
            const blockDuration = duration || this.config.blockDuration;
            this.blockedIPs.set(identifier, Date.now() + blockDuration);
            Logger.debug(`🚫 Blocked ${identifier} for ${blockDuration / 60000} minutes`);
        },

        /**
         * Unblock an IP
         */
        unblock: function(identifier) {
            this.blockedIPs.delete(identifier);
            this.requestStore.delete(identifier);
            Logger.debug(`✅ Unblocked ${identifier}`);
        },

        /**
         * Clear all blocks and request counts
         */
        clearAll: function() {
            this.blockedIPs.clear();
            this.requestStore.clear();
            Logger.debug('🧹 Rate limiter cache cleared');
        },

        /**
         * Start periodic cleanup of old entries
         */
        startCleanupInterval: function() {
            setInterval(() => {
                const now = Date.now();
                const windowStart = now - this.config.windowMs;

                for (const [id, record] of this.requestStore) {
                    record.requests = record.requests.filter(time => time > windowStart);
                    if (record.requests.length === 0) {
                        this.requestStore.delete(id);
                    }
                }

                for (const [id, expiry] of this.blockedIPs) {
                    if (now > expiry) {
                        this.blockedIPs.delete(id);
                    }
                }
            }, 60000);
        },

        /**
         * Get statistics
         */
        getStats: function() {
            return {
                totalClients: this.requestStore.size,
                blockedClients: this.blockedIPs.size,
                config: this.config
            };
        },

        /**
         * DDoS detection
         */
        detectDDoS: function() {
            const stats = this.getStats();
            const threshold = this.config.maxRequests * 0.8;
            
            let suspiciousClients = 0;
            for (const [id, record] of this.requestStore) {
                if (record.requests.length > threshold) {
                    suspiciousClients++;
                }
            }

            if (suspiciousClients > 10) {
                Logger.warn(`⚠️ Potential DDoS attack detected: ${suspiciousClients} suspicious clients`);
                return {
                    detected: true,
                    suspiciousClients: suspiciousClients
                };
            }

            return { detected: false };
        }
    };

    // ============================================================
    // MAIN INITIALIZATION
    // ============================================================
    const CorePerformance = {
        init: function() {
            if (PerformanceState.initialized) {
                Logger.warn('[CorePerformance] Already initialized');
                return;
            }

            MemoryManager.init();
            PerformanceOptimizer.init();
            EdgeCaseHandler.init();
            RateLimiter.init();

            PerformanceState.initialized = true;
            Logger.debug('✅ Core Performance module loaded');
        },

        // Expose sub-modules
        Memory: MemoryManager,
        Optimizer: PerformanceOptimizer,
        EdgeCase: EdgeCaseHandler,
        RateLimit: RateLimiter,

        // Convenience methods
        debounce: function(key, func, wait, options) {
            return PerformanceOptimizer.debounce(key, func, wait, options);
        },

        throttle: function(func, wait, options) {
            return PerformanceOptimizer.throttle(func, wait, options);
        },

        safeGet: function(obj, path, defaultValue) {
            return EdgeCaseHandler.safeGet(obj, path, defaultValue);
        },

        safeNumber: function(value, defaultValue, min, max) {
            return EdgeCaseHandler.safeNumber(value, defaultValue, min, max);
        },

        safeString: function(value, defaultValue, maxLength) {
            return EdgeCaseHandler.safeString(value, defaultValue, maxLength);
        },

        safeArray: function(value, defaultValue) {
            return EdgeCaseHandler.safeArray(value, defaultValue);
        },

        safeExecute: function(fn, defaultValue, ...args) {
            return EdgeCaseHandler.safeExecute(fn, defaultValue, ...args);
        },

        getMemoryStats: function() {
            return MemoryManager.getStats();
        },

        checkForLeaks: function() {
            return MemoryManager.checkForLeaks();
        },

        getPerformanceMetrics: function() {
            return PerformanceOptimizer.getPerformanceMetrics();
        },

        startMeasure: function(label) {
            return PerformanceOptimizer.startPerformanceMeasure(label);
        },

        endMeasure: function(label) {
            return PerformanceOptimizer.endPerformanceMeasure(label);
        }
    };

    // Make available globally
    window.CorePerformance = CorePerformance;
    window.MemoryManager = MemoryManager;
    window.PerformanceOptimizer = PerformanceOptimizer;
    window.EdgeCaseHandler = EdgeCaseHandler;
    window.RateLimiter = RateLimiter;

    // Global convenience functions
    window.safeGet = EdgeCaseHandler.safeGet;
    window.safeNumber = EdgeCaseHandler.safeNumber;
    window.safeString = EdgeCaseHandler.safeString;
    window.safeArray = EdgeCaseHandler.safeArray;
    window.safeExecute = EdgeCaseHandler.safeExecute;

    // Managed timer functions
    window.setIntervalManaged = function(callback, delay, name) {
        return MemoryManager.setInterval(callback, delay, name);
    };

    window.setTimeoutManaged = function(callback, delay, name) {
        return MemoryManager.setTimeout(callback, delay, name);
    };

    window.requestAnimationFrameManaged = function(callback, name) {
        return MemoryManager.requestAnimationFrame(callback, name);
    };

    window.cleanupResource = function(type, id) {
        switch (type) {
            case 'interval':
                MemoryManager.clearInterval(id);
                break;
            case 'timeout':
                MemoryManager.clearTimeout(id);
                break;
            case 'listener':
                MemoryManager.removeEventListener(id);
                break;
            case 'animation':
                MemoryManager.cancelAnimationFrame(id);
                break;
        }
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CorePerformance.init());
    } else {
        CorePerformance.init();
    }

    // Export for module use
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CorePerformance;
    }
})();