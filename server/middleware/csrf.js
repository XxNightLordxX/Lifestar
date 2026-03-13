/**
 * CSRF Protection Middleware
 * Secure CSRF token generation and validation for state-changing requests
 * 
 * Features:
 * - Token generation with cryptographic security
 * - Configurable token expiration
 * - Support for multiple token storage backends
 * - Automatic cleanup of expired tokens
 * 
 * @module middleware/csrf
 */

const crypto = require('crypto');

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // Token settings
    TOKEN_LENGTH: 32,
    SESSION_KEY_LENGTH: 16,
    TOKEN_EXPIRY_MS: 60 * 60 * 1000, // 1 hour
    MAX_TOKENS: 10000, // Maximum tokens in store
    
    // Cookie names
    CSRF_KEY_COOKIE: 'csrf_key',
    
    // HTTP Status codes
    HTTP_STATUS: {
        FORBIDDEN: 403,
        BAD_REQUEST: 400
    }
};

// ============================================
// TOKEN STORAGE
// ============================================

/**
 * In-memory token store
 * In production, replace with Redis or database
 */
class TokenStore {
    constructor() {
        this.tokens = new Map();
        this.lastCleanup = Date.now();
    }
    
    /**
     * Set a token
     * @param {string} key - Token key
     * @param {string} token - CSRF token
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, token, ttl = CONSTANTS.TOKEN_EXPIRY_MS) {
        // Enforce max tokens
        if (this.tokens.size >= CONSTANTS.MAX_TOKENS) {
            this.cleanup();
        }
        
        this.tokens.set(key, {
            token,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttl
        });
    }
    
    /**
     * Get a token
     * @param {string} key - Token key
     * @returns {string|null} Token or null if not found/expired
     */
    get(key) {
        const entry = this.tokens.get(key);
        
        if (!entry) {
            return null;
        }
        
        // Check expiration
        if (Date.now() > entry.expiresAt) {
            this.tokens.delete(key);
            return null;
        }
        
        return entry.token;
    }
    
    /**
     * Delete a token
     * @param {string} key - Token key
     */
    delete(key) {
        this.tokens.delete(key);
    }
    
    /**
     * Validate a token
     * @param {string} key - Token key
     * @param {string} token - Token to validate
     * @returns {boolean} True if valid
     */
    validate(key, token) {
        const storedToken = this.get(key);
        
        if (!storedToken) {
            return false;
        }
        
        // Use timing-safe comparison
        try {
            return crypto.timingSafeEqual(
                Buffer.from(storedToken, 'hex'),
                Buffer.from(token, 'hex')
            );
        } catch {
            return false;
        }
    }
    
    /**
     * Cleanup expired tokens
     */
    cleanup() {
        const now = Date.now();
        
        for (const [key, entry] of this.tokens.entries()) {
            if (now > entry.expiresAt) {
                this.tokens.delete(key);
            }
        }
        
        this.lastCleanup = now;
    }
    
    /**
     * Get store statistics
     * @returns {Object} Store stats
     */
    getStats() {
        return {
            totalTokens: this.tokens.size,
            lastCleanup: new Date(this.lastCleanup).toISOString()
        };
    }
}

// Global token store instance
const tokenStore = new TokenStore();

// Periodic cleanup (every 10 minutes)
setInterval(() => {
    tokenStore.cleanup();
}, 10 * 60 * 1000);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a secure random token
 * @param {number} length - Token length in bytes
 * @returns {string} Hex-encoded token
 */
function generateSecureToken(length = CONSTANTS.TOKEN_LENGTH) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a session key
 * @param {number} length - Key length in bytes
 * @returns {string} Hex-encoded key
 */
function generateSessionKey(length = CONSTANTS.SESSION_KEY_LENGTH) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Get session identifier from request
 * @param {Object} req - Express request
 * @returns {string} Session identifier
 */
function getSessionId(req) {
    return req.cookies?.session_id ||
           req.cookies?.[CONSTANTS.CSRF_KEY_COOKIE] ||
           req.headers?.['x-session-id'] ||
           req.user?.id?.toString() ||
           null;
}

// ============================================
// CSRF MIDDLEWARE
// ============================================

/**
 * Generate a CSRF token
 * @param {string} sessionId - Session identifier
 * @param {Object} options - Generation options
 * @returns {Object} Token and key
 */
function generateToken(sessionId, options = {}) {
    const token = generateSecureToken(options.tokenLength || CONSTANTS.TOKEN_LENGTH);
    const key = sessionId || generateSessionKey();
    
    tokenStore.set(key, token, options.ttl || CONSTANTS.TOKEN_EXPIRY_MS);
    
    return { token, key };
}

/**
 * Validate a CSRF token
 * @param {string} key - Token key
 * @param {string} token - Token to validate
 * @returns {boolean} True if valid
 */
function validateToken(key, token) {
    if (!key || !token) {
        return false;
    }
    
    const isValid = tokenStore.validate(key, token);
    
    // Delete token after validation (single-use)
    if (isValid) {
        tokenStore.delete(key);
    }
    
    return isValid;
}

/**
 * CSRF protection middleware
 * Validates CSRF tokens on state-changing requests
 */
function csrfProtection(req, res, next) {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(req.method)) {
        attachToken(req, res);
        return next();
    }
    
    // Get CSRF token and key from various sources
    const csrfToken = req.headers?.['x-csrf-token'] ||
                      req.body?._csrf ||
                      req.query?._csrf;
    
    const csrfKey = req.headers?.['x-csrf-key'] ||
                    req.cookies?.[CONSTANTS.CSRF_KEY_COOKIE] ||
                    req.cookies?.csrf_key ||
                    getSessionId(req);
    
    // Check if token is present
    if (!csrfToken || !csrfKey) {
        logCsrfEvent('CSRF_MISSING', req);
        
        return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
            error: 'CSRF token missing',
            code: 'CSRF_MISSING',
            message: 'Please refresh the page and try again'
        });
    }
    
    // Validate token
    if (!validateToken(csrfKey, csrfToken)) {
        logCsrfEvent('CSRF_INVALID', req, { key: csrfKey });
        
        return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
            error: 'Invalid CSRF token',
            code: 'CSRF_INVALID',
            message: 'Your session may have expired. Please refresh the page.'
        });
    }
    
    logCsrfEvent('CSRF_VALID', req);
    
    // Generate new token for next request
    attachToken(req, res);
    
    next();
}

/**
 * Optional CSRF middleware
 * Generates token but doesn't enforce validation
 */
function csrfOptional(req, res, next) {
    attachToken(req, res);
    next();
}

/**
 * Attach CSRF token to response
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function attachToken(req, res) {
    const sessionId = getSessionId(req);
    const { token, key } = generateToken(sessionId);
    
    // Attach to locals for template rendering
    res.locals.csrfToken = token;
    res.locals.csrfKey = key;
    
    // Set headers
    res.setHeader('X-CSRF-Token', token);
    res.setHeader('X-CSRF-Key', key);
    
    // Set cookie for key (not the token - that goes in header)
    res.cookie(CONSTANTS.CSRF_KEY_COOKIE, key, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: CONSTANTS.TOKEN_EXPIRY_MS,
        path: '/'
    });
}

/**
 * Log CSRF event
 * @param {string} event - Event type
 * @param {Object} req - Express request
 * @param {Object} data - Additional data
 */
function logCsrfEvent(event, req, data = {}) {
    if (process.env.NODE_ENV === 'production') {
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            event,
            ip: req.ip,
            path: req.path,
            method: req.method,
            ...data
        }));
    } else if (event !== 'CSRF_VALID') {
        console.log(`[CSRF] ${event}:`, { ip: req.ip, path: req.path, ...data });
    }
}

// ============================================
// DOUBLE SUBMIT COOKIE PATTERN
// ============================================

/**
 * Double submit cookie CSRF middleware
 * Alternative pattern that doesn't require server-side storage
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function doubleSubmitCsrf(options = {}) {
    const cookieName = options.cookieName || 'csrf_token';
    const headerName = options.headerName || 'x-csrf-token';
    
    return function(req, res, next) {
        // Generate and set token for safe methods
        if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(req.method)) {
            const token = generateSecureToken();
            
            res.cookie(cookieName, token, {
                httpOnly: false, // Must be readable by JavaScript
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: CONSTANTS.TOKEN_EXPIRY_MS,
                path: '/'
            });
            
            res.locals.csrfToken = token;
            return next();
        }
        
        // Validate for state-changing methods
        const cookieToken = req.cookies?.[cookieName];
        const headerToken = req.headers?.[headerName];
        
        if (!cookieToken || !headerToken) {
            return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                error: 'CSRF token missing',
                code: 'CSRF_MISSING'
            });
        }
        
        // Timing-safe comparison
        try {
            const cookieBuf = Buffer.from(cookieToken, 'utf8');
            const headerBuf = Buffer.from(headerToken, 'utf8');
            if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
                return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                    error: 'Invalid CSRF token',
                    code: 'CSRF_INVALID'
                });
            }
        } catch {
            return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                error: 'Invalid CSRF token',
                code: 'CSRF_INVALID'
            });
        }
        
        next();
    };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Main middleware
    csrfProtection,
    csrfOptional,
    doubleSubmitCsrf,
    
    // Token functions
    generateToken,
    validateToken,
    
    // Utilities
    generateSecureToken,
    tokenStore,
    
    // Constants
    CONSTANTS
};