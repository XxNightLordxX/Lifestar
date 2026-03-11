/**
 * Rate Limiting Middleware for Lifestar Ambulance Scheduling System
 * Provides protection against brute force and DDoS attacks
 */

(function() {
    'use strict';

    const RateLimiter = {
        // Configuration
        config: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            maxRequests: 100, // Max requests per window
            authMaxRequests: 5, // Max auth attempts per window
            blockDuration: 30 * 60 * 1000, // 30 minutes block
            trustedIPs: ['localhost', '127.0.0.1']
        },

        // Storage for request counts
        requestStore: new Map(),
        blockedIPs: new Map(),
        
        /**
         * Initialize the rate limiter
         */
        init: function(customConfig = {}) {
            this.config = { ...this.config, ...customConfig };
            
            // Start cleanup interval
            this.startCleanupInterval();
            
            Logger.debug('✅ Rate Limiter initialized');
            Logger.debug(`   Max requests: ${this.config.maxRequests} per ${this.config.windowMs / 60000} minutes`);
            Logger.debug(`   Max auth attempts: ${this.config.authMaxRequests} per ${this.config.windowMs / 60000} minutes`);
        },

        /**
         * Get client identifier (IP or session based)
         */
        getClientId: function(req) {
            // In browser environment, use a combination of identifiers
            if (typeof window !== 'undefined') {
                const stored = sessionStorage.getItem('clientId');
                if (stored) return stored;
                
                const clientId = 'client_' + Math.random().toString(36).substr(2, 9);
                sessionStorage.setItem('clientId', clientId);
                return clientId;
            }
            
            // In Node.js environment, use IP
            return req.ip || req.connection?.remoteAddress || 'unknown';
        },

        /**
         * Check if request should be allowed
         */
        checkLimit: function(identifier, isAuth = false) {
            const now = Date.now();
            const windowStart = now - this.config.windowMs;
            const maxRequests = isAuth ? this.config.authMaxRequests : this.config.maxRequests;

            // Check if blocked
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

            // Get or create request record
            let record = this.requestStore.get(identifier);
            if (!record) {
                record = { requests: [], blocked: false };
                this.requestStore.set(identifier, record);
            }

            // Filter out old requests
            record.requests = record.requests.filter(time => time > windowStart);

            // Check limit
            if (record.requests.length >= maxRequests) {
                // Block this client
                this.blockedIPs.set(identifier, now + this.config.blockDuration);
                return {
                    allowed: false,
                    reason: 'RATE_LIMIT_EXCEEDED',
                    message: `Rate limit exceeded. Please try again later.`
                };
            }

            // Add this request
            record.requests.push(now);

            return {
                allowed: true,
                remaining: maxRequests - record.requests.length,
                resetTime: now + this.config.windowMs
            };
        },

        /**
         * Express middleware for rate limiting
         */
        middleware: function(options = {}) {
            const isAuth = options.auth || false;
            
            return (req, res, next) => {
                const clientId = this.getClientId(req);
                const result = this.checkLimit(clientId, isAuth);

                // Add rate limit headers
                res.setHeader('X-RateLimit-Limit', isAuth ? this.config.authMaxRequests : this.config.maxRequests);
                res.setHeader('X-RateLimit-Remaining', result.remaining || 0);
                res.setHeader('X-RateLimit-Reset', result.resetTime || Date.now() + this.config.windowMs);

                if (!result.allowed) {
                    res.status(429).json({
                        error: 'Too Many Requests',
                        message: result.message,
                        retryAfter: result.remainingTime || Math.ceil(this.config.blockDuration / 60000)
                    });
                    return;
                }

                next();
            };
        },

        /**
         * Client-side rate limiting wrapper for fetch
         */
        wrapFetch: function() {
            const originalFetch = window.fetch;
            const self = this;
            
            window.fetch = async function(url, options = {}) {
                const identifier = self.getClientId();
                const isAuth = url.includes('/auth/') || url.includes('/login');
                
                const result = self.checkLimit(identifier, isAuth);
                
                if (!result.allowed) {
                    // Show user-friendly message
                    if (typeof showAlert === 'function') {
                        showAlert(result.message, 'warning');
                    }
                    throw new Error(result.message);
                }

                return originalFetch(url, options);
            };
        },

        /**
         * API endpoint rate limiting
         */
        apiLimiter: function(req, res, next) {
            const clientId = this.getClientId(req);
            const result = this.checkLimit(clientId, false);

            if (!result.allowed) {
                return res.status(429).json({
                    success: false,
                    error: 'Rate limit exceeded',
                    message: result.message
                });
            }

            next();
        },

        /**
         * Authentication rate limiting (stricter)
         */
        authLimiter: function(req, res, next) {
            const clientId = this.getClientId(req);
            const result = this.checkLimit(clientId, true);

            if (!result.allowed) {
                return res.status(429).json({
                    success: false,
                    error: 'Too many authentication attempts',
                    message: result.message
                });
            }

            next();
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

                // Clean request store
                for (const [id, record] of this.requestStore) {
                    record.requests = record.requests.filter(time => time > windowStart);
                    if (record.requests.length === 0) {
                        this.requestStore.delete(id);
                    }
                }

                // Clean expired blocks
                for (const [id, expiry] of this.blockedIPs) {
                    if (now > expiry) {
                        this.blockedIPs.delete(id);
                    }
                }
            }, 60000); // Run every minute
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
            const threshold = this.config.maxRequests * 0.8; // 80% of max requests;
            
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

    // Initialize with default config
    if (typeof window !== 'undefined') {
        RateLimiter.init();
        RateLimiter.wrapFetch();
    }

    // Export for use in Node.js
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = RateLimiter;
    }

    // Make globally available
    window.RateLimiter = RateLimiter;
})();