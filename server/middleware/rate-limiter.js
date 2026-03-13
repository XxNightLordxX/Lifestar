/**
 * Rate Limiting Middleware
 * Comprehensive rate limiting to prevent brute force, abuse, and DDoS attacks
 * 
 * Features:
 * - Sliding window rate limiting
 * - Multiple rate limit tiers
 * - IP-based and user-based limiting
 * - Configurable responses
 * - Whitelist/blacklist support
 * - Rate limit headers
 * 
 * @module middleware/rate-limiter
 */

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // Default settings
    DEFAULT_WINDOW_MS: 60000, // 1 minute
    DEFAULT_MAX_REQUESTS: 100,
    DEFAULT_BLOCK_DURATION_MS: 60000, // 1 minute
    
    // Cleanup interval
    CLEANUP_INTERVAL_MS: 60000, // 1 minute
    
    // Header names
    HEADERS: {
        LIMIT: 'X-RateLimit-Limit',
        REMAINING: 'X-RateLimit-Remaining',
        RESET: 'X-RateLimit-Reset',
        RETRY_AFTER: 'Retry-After'
    },
    
    // HTTP Status codes
    HTTP_STATUS: {
        TOO_MANY_REQUESTS: 429
    }
};

// ============================================
// RATE LIMITER CLASS
// ============================================

/**
 * Advanced in-memory rate limiter with sliding window
 * For production, consider using Redis-based solution
 */
class RateLimiter {
    /**
     * Create a rate limiter instance
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.windowMs = options.windowMs || CONSTANTS.DEFAULT_WINDOW_MS;
        this.maxRequests = options.maxRequests || CONSTANTS.DEFAULT_MAX_REQUESTS;
        this.blockDurationMs = options.blockDurationMs || CONSTANTS.DEFAULT_BLOCK_DURATION_MS;
        this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
        this.skipCondition = options.skipCondition || null;
        this.handler = options.handler || this.defaultHandler;
        this.skipFailedRequests = options.skipFailedRequests || false;
        this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
        this.headers = options.headers !== false;
        
        // Storage
        this.requests = new Map();
        this.blocks = new Map();
        
        // Start cleanup interval
        this.cleanupTimer = setInterval(() => this.cleanup(), CONSTANTS.CLEANUP_INTERVAL_MS);
    }
    
    /**
     * Default key generator
     * @param {Object} req - Express request
     * @returns {string} Client identifier
     */
    defaultKeyGenerator(req) {
        return req.ip ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.connection?.remoteAddress ||
               'unknown';
    }
    
    /**
     * Default handler for rate limit exceeded
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Object} info - Rate limit info
     */
    defaultHandler(req, res, info) {
        res.status(CONSTANTS.HTTP_STATUS.TOO_MANY_REQUESTS).json({
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Please wait ${info.retryAfter} seconds before trying again`,
            retryAfter: info.retryAfter
        });
    }
    
    /**
     * Check if a key is blocked
     * @param {string} key - Client identifier
     * @returns {Object|null} Block info or null
     */
    isBlocked(key) {
        const block = this.blocks.get(key);
        
        if (!block) {
            return null;
        }
        
        if (Date.now() > block.blockedUntil) {
            this.blocks.delete(key);
            return null;
        }
        
        return block;
    }
    
    /**
     * Block a key
     * @param {string} key - Client identifier
     * @param {number} duration - Block duration in ms
     */
    block(key, duration = this.blockDurationMs) {
        this.blocks.set(key, {
            blockedAt: Date.now(),
            blockedUntil: Date.now() + duration
        });
    }
    
    /**
     * Check rate limit for a key
     * @param {string} key - Client identifier
     * @returns {Object} Rate limit info
     */
    check(key) {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        // Check if blocked
        const block = this.isBlocked(key);
        if (block) {
            return {
                allowed: false,
                blocked: true,
                remaining: 0,
                resetTime: block.blockedUntil,
                retryAfter: Math.ceil((block.blockedUntil - now) / 1000)
            };
        }
        
        // Get or create request log
        let requestLog = this.requests.get(key) || [];
        
        // Filter out old requests (sliding window)
        requestLog = requestLog.filter(time => time > windowStart);
        
        // Calculate remaining and reset time
        const current = requestLog.length;
        const remaining = Math.max(0, this.maxRequests - current);
        const resetTime = requestLog.length > 0
            ? requestLog[0] + this.windowMs
            : now + this.windowMs;
        
        // Check if limit exceeded
        if (current >= this.maxRequests) {
            // Auto-block on limit exceeded
            if (this.blockDurationMs > 0) {
                this.block(key);
            }
            
            return {
                allowed: false,
                blocked: false,
                remaining: 0,
                resetTime,
                retryAfter: Math.ceil((resetTime - now) / 1000)
            };
        }
        
        // Record request
        requestLog.push(now);
        this.requests.set(key, requestLog);
        
        return {
            allowed: true,
            blocked: false,
            remaining: remaining - 1,
            resetTime,
            retryAfter: 0
        };
    }
    
    /**
     * Decrement request count (for skip options)
     * @param {string} key - Client identifier
     */
    decrement(key) {
        const requestLog = this.requests.get(key);
        if (requestLog && requestLog.length > 0) {
            requestLog.pop();
            if (requestLog.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, requestLog);
            }
        }
    }
    
    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        
        // Clean up old requests
        for (const [key, requestLog] of this.requests.entries()) {
            const validRequests = requestLog.filter(time => time > now - this.windowMs);
            if (validRequests.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, validRequests);
            }
        }
        
        // Clean up expired blocks
        for (const [key, block] of this.blocks.entries()) {
            if (now > block.blockedUntil) {
                this.blocks.delete(key);
            }
        }
    }
    
    /**
     * Get statistics
     * @returns {Object} Stats
     */
    getStats() {
        return {
            activeKeys: this.requests.size,
            blockedKeys: this.blocks.size,
            config: {
                windowMs: this.windowMs,
                maxRequests: this.maxRequests,
                blockDurationMs: this.blockDurationMs
            }
        };
    }
    
    /**
     * Express middleware
     * @returns {Function} Middleware function
     */
    middleware() {
        return (req, res, next) => {
            // Check skip condition
            if (this.skipCondition && this.skipCondition(req)) {
                return next();
            }
            
            // Generate key
            const key = this.keyGenerator(req);
            
            // Check rate limit
            const result = this.check(key);
            
            // Set headers
            if (this.headers) {
                res.setHeader(CONSTANTS.HEADERS.LIMIT, this.maxRequests);
                res.setHeader(CONSTANTS.HEADERS.REMAINING, result.remaining);
                res.setHeader(CONSTANTS.HEADERS.RESET, Math.ceil(result.resetTime / 1000));
            }
            
            if (!result.allowed) {
                if (this.headers) {
                    res.setHeader(CONSTANTS.HEADERS.RETRY_AFTER, result.retryAfter);
                }
                
                return this.handler(req, res, {
                    ...result,
                    key,
                    windowMs: this.windowMs,
                    maxRequests: this.maxRequests
                });
            }
            
            // Handle skip options
            if (this.skipFailedRequests || this.skipSuccessfulRequests) {
                const originalEnd = res.end;
                const limiter = this;
                
                res.end = function(...args) {
                    const statusCode = res.statusCode;
                    
                    if (limiter.skipFailedRequests && statusCode >= 400) {
                        limiter.decrement(key);
                    }
                    
                    if (limiter.skipSuccessfulRequests && statusCode < 400) {
                        limiter.decrement(key);
                    }
                    
                    return originalEnd.apply(this, args);
                };
            }
            
            next();
        };
    }
    
    /**
     * Destroy the rate limiter
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.requests.clear();
        this.blocks.clear();
    }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a rate limiter middleware
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
    const limiter = new RateLimiter(options);
    return limiter.middleware();
}

// ============================================
// PRE-CONFIGURED RATE LIMITERS
// ============================================

/**
 * Strict rate limiter for authentication endpoints
 * 10 requests per 15 minutes
 */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    blockDurationMs: 15 * 60 * 1000, // Block for 15 minutes
    handler: (req, res, info) => {
        res.status(429).json({
            error: 'Too many login attempts',
            code: 'AUTH_RATE_LIMIT',
            message: 'Please wait before trying again',
            retryAfter: info.retryAfter
        });
    }
});

/**
 * Moderate rate limiter for API write operations
 * 50 requests per minute
 */
const writeLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,
    blockDurationMs: 60 * 1000
});

/**
 * Standard API rate limiter
 * 100 requests per minute
 */
const apiLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    blockDurationMs: 60 * 1000
});

/**
 * Lenient rate limiter for read operations
 * 300 requests per minute
 */
const readLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 300,
    blockDurationMs: 30 * 1000 // 30 second block after exceeding limit
});

/**
 * Strict rate limiter for password reset
 * 3 requests per hour
 */
const passwordResetLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    blockDurationMs: 60 * 60 * 1000, // Block for 1 hour
    handler: (req, res, info) => {
        res.status(429).json({
            error: 'Too many password reset attempts',
            code: 'PASSWORD_RESET_RATE_LIMIT',
            message: 'Please check your email or try again later',
            retryAfter: info.retryAfter
        });
    }
});

/**
 * User-based rate limiter (requires authentication)
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function userRateLimiter(options = {}) {
    const windowMs = options.windowMs || 60000;
    const maxRequests = options.maxRequests || 100;
    
    const limiter = new RateLimiter({
        windowMs,
        maxRequests,
        keyGenerator: (req) => {
            // Use user ID if authenticated, fall back to IP
            return req.user?.id?.toString() || req.ip || 'unknown';
        },
        ...options
    });
    
    return limiter.middleware();
}

/**
 * IP whitelist middleware
 * @param {string[]} whitelist - Array of allowed IPs
 * @returns {Function} Express middleware
 */
function ipWhitelist(whitelist = []) {
    return (req, res, next) => {
        const clientIp = req.ip || req.connection?.remoteAddress;
        
        if (whitelist.length === 0 || whitelist.includes(clientIp)) {
            next();
        } else {
            res.status(403).json({
                error: 'Access denied',
                code: 'IP_NOT_WHITELISTED'
            });
        }
    };
}

/**
 * IP blacklist middleware
 * @param {string[]} blacklist - Array of blocked IPs
 * @returns {Function} Express middleware
 */
function ipBlacklist(blacklist = []) {
    return (req, res, next) => {
        const clientIp = req.ip || req.connection?.remoteAddress;
        
        if (blacklist.includes(clientIp)) {
            res.status(403).json({
                error: 'Access denied',
                code: 'IP_BLOCKED'
            });
        } else {
            next();
        }
    };
}

// ============================================
// COMBINED MIDDLEWARE
// ============================================

/**
 * Create a combined rate limiting setup
 * @param {Object} config - Configuration object
 * @returns {Object} Object with middleware functions
 */
function createRateLimitSetup(config = {}) {
    const global = createRateLimiter(config.global || {
        windowMs: 60 * 1000,
        maxRequests: 100
    });
    
    const auth = createRateLimiter(config.auth || {
        windowMs: 15 * 60 * 1000,
        maxRequests: 10
    });
    
    const api = createRateLimiter(config.api || {
        windowMs: 60 * 1000,
        maxRequests: 100
    });
    
    const read = createRateLimiter(config.read || {
        windowMs: 60 * 1000,
        maxRequests: 300
    });
    
    return { global, auth, api, read };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Class
    RateLimiter,
    
    // Factory function
    createRateLimiter,
    userRateLimiter,
    createRateLimitSetup,
    
    // Pre-configured limiters
    authLimiter,
    writeLimiter,
    apiLimiter,
    readLimiter,
    passwordResetLimiter,
    
    // IP filtering
    ipWhitelist,
    ipBlacklist,
    
    // Constants
    CONSTANTS
};