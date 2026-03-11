/**
 * Memory Leak Prevention and Cleanup for Lifestar Ambulance Scheduling System
 * Addresses potential memory leaks from intervals, timeouts, and event listeners
 */

(function() {
    'use strict';

    const MemoryManager = {
        // Track all intervals, timeouts, and event listeners
        intervals: new Map(),
        timeouts: new Map(),
        eventListeners: new Map(),
        animationFrames: new Map(),
        
        // Counter for unique IDs
        idCounter: 0,

        /**
         * Initialize memory manager
         */
        init: function() {
            // Setup cleanup on page unload
            window.addEventListener('beforeunload', () => this.cleanupAll());
            
            // Setup cleanup on visibility change (for mobile/SPA)
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.cleanupNonEssential();
                }
            });

            Logger.debug('✅ Memory Manager initialized');
        },

        /**
         * Generate unique ID
         */
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
                this.timeouts.delete(id); // Auto-cleanup after execution
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

        /**
         * Clear a specific interval
         */
        clearInterval: function(id) {
            const interval = this.intervals.get(id);
            if (interval) {
                window.clearInterval(interval.id);
                this.intervals.delete(id);
            }
        },

        /**
         * Clear a specific timeout
         */
        clearTimeout: function(id) {
            const timeout = this.timeouts.get(id);
            if (timeout) {
                window.clearTimeout(timeout.id);
                this.timeouts.delete(id);
            }
        },

        /**
         * Cancel animation frame
         */
        cancelAnimationFrame: function(id) {
            const frame = this.animationFrames.get(id);
            if (frame) {
                window.cancelAnimationFrame(frame.id);
                this.animationFrames.delete(id);
            }
        },

        /**
         * Remove event listener
         */
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
            
            // Clear all intervals
            for (const [id, interval] of this.intervals) {
                window.clearInterval(interval.id);
            }
            this.intervals.clear();
            
            // Clear all timeouts
            for (const [id, timeout] of this.timeouts) {
                window.clearTimeout(timeout.id);
            }
            this.timeouts.clear();
            
            // Cancel all animation frames
            for (const [id, frame] of this.animationFrames) {
                window.cancelAnimationFrame(frame.id);
            }
            this.animationFrames.clear();
            
            // Remove all event listeners
            for (const [id, listener] of this.eventListeners) {
                listener.element.removeEventListener(listener.event, listener.callback);
            }
            this.eventListeners.clear();
            
            Logger.debug('✅ All resources cleaned up');
        },

        /**
         * Clean up non-essential resources (called when page is hidden)
         */
        cleanupNonEssential: function() {
            // Remove event listeners that are marked as non-essential
            for (const [id, listener] of this.eventListeners) {
                if (listener.name.includes('nonEssential') || listener.name.includes('animation')) {
                    listener.element.removeEventListener(listener.event, listener.callback);
                    this.eventListeners.delete(id);
                }
            }
            
            // Cancel non-essential animation frames
            for (const [id, frame] of this.animationFrames) {
                if (frame.name.includes('nonEssential')) {
                    window.cancelAnimationFrame(frame.id);
                    this.animationFrames.delete(id);
                }
            }
        },

        /**
         * Get memory usage statistics
         */
        getStats: function() {
            return {
                intervals: this.intervals.size,
                timeouts: this.timeouts.size,
                eventListeners: this.eventListeners.size,
                animationFrames: this.animationFrames.size,
                total: this.intervals.size + this.timeouts.size + this.eventListeners.size + this.animationFrames.size
            };
        },

        /**
         * Check for potential memory leaks
         */
        checkForLeaks: function() {
            const stats = this.getStats();
            const warnings = [];
            
            if (stats.intervals > 10) {
                warnings.push(`High number of intervals: ${stats.intervals}`);
            }
            
            if (stats.eventListeners > 100) {
                warnings.push(`High number of event listeners: ${stats.eventListeners}`);
            }
            
            // Check for old resources
            const now = Date.now();
            const maxAge = 30 * 60 * 1000; // 30 minutes;
            
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

        /**
         * Create a managed object pool for reusing objects
         */
        createObjectPool: function(factory, initialSize = 10) {
            const pool = [];
            const inUse = new Set();
            
            // Pre-populate pool
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

    // Patch global functions to use memory manager
    const originalSetInterval = window.setInterval;
    const originalSetTimeout = window.setTimeout;
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    // Auto-patch if desired (can be disabled)
    window.setIntervalManaged = function(callback, delay, name) {
        return MemoryManager.setInterval(callback, delay, name);
    };

    window.setTimeoutManaged = function(callback, delay, name) {
        return MemoryManager.setTimeout(callback, delay, name);
    };

    window.requestAnimationFrameManaged = function(callback, name) {
        return MemoryManager.requestAnimationFrame(callback, name);
    };

    // Add cleanup helper for specific use cases
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

    // Initialize
    MemoryManager.init();

    // Export for module use
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MemoryManager;
    }

    window.MemoryManager = MemoryManager;
})();