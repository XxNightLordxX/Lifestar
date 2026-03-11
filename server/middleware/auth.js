/**
 * Authentication & Authorization Middleware
 * Secure JWT-based auth with HttpOnly cookies, token refresh, and role-based access control
 * 
 * Features:
 * - JWT token generation with configurable expiration
 * - Token verification from HttpOnly cookie or Authorization header
 * - Role-based access control with hierarchical permissions
 * - Token refresh mechanism
 * - Security logging for authentication events
 * - Token blacklist for logout/revocation
 * 
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET || 'lifestar-jwt-secret-change-in-production-2026',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    JWT_ALGORITHM: 'HS256',
    
    // Token settings
    TOKEN_COOKIE_NAME: 'lifestar_token',
    REFRESH_TOKEN_COOKIE_NAME: 'lifestar_refresh_token',
    TOKEN_MAX_AGE_MS: 8 * 60 * 60 * 1000, // 8 hours
    REFRESH_TOKEN_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
    
    // Role hierarchy (higher number = more permissions)
    ROLE_HIERARCHY: {
        'super': 100,
        'boss': 50,
        'paramedic': 10,
        'emt': 5
    },
    
    // Valid roles
    VALID_ROLES: ['super', 'boss', 'paramedic', 'emt'],
    
    // HTTP Status codes
    HTTP_STATUS: {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        BAD_REQUEST: 400
    }
};

// ============================================
// TOKEN BLACKLIST (In-memory, use Redis in production)
// ============================================
const tokenBlacklist = new Set();
const refreshTokenBlacklist = new Set();

// Cleanup blacklisted tokens periodically (every hour)
setInterval(() => {
    // In a real implementation, you would check token expiration
    // For now, we just limit the size
    if (tokenBlacklist.size > 10000) {
        tokenBlacklist.clear();
    }
    if (refreshTokenBlacklist.size > 10000) {
        refreshTokenBlacklist.clear();
    }
}, 60 * 60 * 1000);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a secure random token ID
 * @returns {string} Random token ID
 */
function generateTokenId() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Check if environment is production
 * @returns {boolean} True if production
 */
function isProduction() {
    return process.env.NODE_ENV === 'production';
}

/**
 * Log authentication event (for security auditing)
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
function logAuthEvent(event, data) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        event,
        ...data
    };
    
    // In production, send to logging service
    if (isProduction()) {
        // Send to external logging service
        console.log(JSON.stringify(logEntry));
    } else {
        console.log(`[AUTH] ${timestamp} - ${event}:`, data);
    }
}

/**
 * Decode token without verification (for inspection)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null
 */
function decodeToken(token) {
    try {
        return jwt.decode(token);
    } catch {
        return null;
    }
}

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Generate JWT access token
 * @param {Object} user - User object with id, username, role
 * @param {Object} options - Additional options
 * @returns {string} JWT token
 */
function generateToken(user, options = {}) {
    if (!user || !user.id || !user.username || !user.role) {
        throw new Error('Invalid user object for token generation');
    }
    
    const tokenId = generateTokenId();
    
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        jti: tokenId, // JWT ID for blacklisting
        type: 'access'
    };
    
    // Add optional fields
    if (user.locationId) {
        payload.locationId = user.locationId;
    }
    
    if (options.ipAddress) {
        payload.ip = options.ipAddress;
    }
    
    return jwt.sign(payload, CONSTANTS.JWT_SECRET, {
        expiresIn: options.expiresIn || CONSTANTS.JWT_EXPIRES_IN,
        algorithm: CONSTANTS.JWT_ALGORITHM
    });
}

/**
 * Generate refresh token
 * @param {Object} user - User object
 * @returns {string} Refresh token
 */
function generateRefreshToken(user) {
    if (!user || !user.id) {
        throw new Error('Invalid user object for refresh token generation');
    }
    
    const tokenId = generateTokenId();
    
    const payload = {
        id: user.id,
        username: user.username,
        jti: tokenId,
        type: 'refresh'
    };
    
    return jwt.sign(payload, CONSTANTS.JWT_SECRET, {
        expiresIn: CONSTANTS.JWT_REFRESH_EXPIRES_IN,
        algorithm: CONSTANTS.JWT_ALGORITHM
    });
}

// ============================================
// TOKEN VERIFICATION
// ============================================

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or blacklisted
 */
function verifyToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Token is required');
    }
    
    // Check blacklist
    if (tokenBlacklist.has(token)) {
        throw new Error('Token has been revoked');
    }
    
    try {
        const decoded = jwt.verify(token, CONSTANTS.JWT_SECRET, {
            algorithms: [CONSTANTS.JWT_ALGORITHM]
        });
        
        // Validate token type
        if (decoded.type !== 'access') {
            throw new Error('Invalid token type');
        }
        
        return decoded;
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        } else if (err.name === 'JsonWebTokenError') {
            throw new Error('Invalid token');
        }
        throw err;
    }
}

/**
 * Verify refresh token
 * @param {string} token - Refresh token to verify
 * @returns {Object} Decoded token payload
 */
function verifyRefreshToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Refresh token is required');
    }
    
    // Check blacklist
    if (refreshTokenBlacklist.has(token)) {
        throw new Error('Refresh token has been revoked');
    }
    
    try {
        const decoded = jwt.verify(token, CONSTANTS.JWT_SECRET, {
            algorithms: [CONSTANTS.JWT_ALGORITHM]
        });
        
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }
        
        return decoded;
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new Error('Refresh token expired');
        }
        throw new Error('Invalid refresh token');
    }
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

/**
 * Authentication middleware
 * Verifies JWT from HttpOnly cookie or Authorization header
 */
function authenticate(req, res, next) {
    let token = null;
    let tokenSource = null;
    
    // 1. Check HttpOnly cookie first (preferred)
    if (req.cookies && req.cookies[CONSTANTS.TOKEN_COOKIE_NAME]) {
        token = req.cookies[CONSTANTS.TOKEN_COOKIE_NAME];
        tokenSource = 'cookie';
    }
    // 2. Fallback to Authorization header
    else if (req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
            tokenSource = 'header';
        }
    }
    
    if (!token) {
        logAuthEvent('AUTH_NO_TOKEN', {
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        
        return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
        });
    }
    
    try {
        const decoded = verifyToken(token);
        
        // Attach user to request
        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            tokenId: decoded.jti,
            locationId: decoded.locationId
        };
        
        // Attach token for potential refresh
        req.token = token;
        
        logAuthEvent('AUTH_SUCCESS', {
            userId: decoded.id,
            username: decoded.username,
            role: decoded.role,
            ip: req.ip,
            path: req.path
        });
        
        next();
    } catch (err) {
        logAuthEvent('AUTH_FAILED', {
            error: err.message,
            ip: req.ip,
            path: req.path,
            tokenSource
        });
        
        // Clear invalid token cookie
        if (tokenSource === 'cookie') {
            res.clearCookie(CONSTANTS.TOKEN_COOKIE_NAME, { path: '/' });
        }
        
        if (err.message === 'Token expired') {
            return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Session expired. Please login again.',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 */
function optionalAuth(req, res, next) {
    let token = null;
    
    if (req.cookies && req.cookies[CONSTANTS.TOKEN_COOKIE_NAME]) {
        token = req.cookies[CONSTANTS.TOKEN_COOKIE_NAME];
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
    }
    
    if (!token) {
        return next();
    }
    
    try {
        const decoded = verifyToken(token);
        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            tokenId: decoded.jti,
            locationId: decoded.locationId
        };
        req.token = token;
    } catch {
        // Ignore errors for optional auth
    }
    
    next();
}

// ============================================
// AUTHORIZATION MIDDLEWARE
// ============================================

/**
 * Role-based access control middleware factory
 * @param {...string} allowedRoles - Roles that can access the route
 * @returns {Function} Middleware function
 */
function authorize(...allowedRoles) {
    // Validate roles
    const validRoles = allowedRoles.filter(role => CONSTANTS.VALID_ROLES.includes(role));
    
    if (validRoles.length === 0) {
        console.warn('[AUTH] authorize() called with no valid roles');
    }
    
    return function(req, res, next) {
        if (!req.user) {
            logAuthEvent('AUTHZ_NO_USER', {
                ip: req.ip,
                path: req.path
            });
            
            return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        if (!validRoles.includes(req.user.role)) {
            logAuthEvent('AUTHZ_DENIED', {
                userId: req.user.id,
                username: req.user.username,
                role: req.user.role,
                requiredRoles: validRoles,
                ip: req.ip,
                path: req.path
            });
            
            return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        
        next();
    };
}

/**
 * Minimum role level authorization
 * @param {string} minRole - Minimum required role
 * @returns {Function} Middleware function
 */
function requireMinRole(minRole) {
    const minLevel = CONSTANTS.ROLE_HIERARCHY[minRole];
    
    if (!minLevel) {
        throw new Error(`Invalid role: ${minRole}`);
    }
    
    return function(req, res, next) {
        if (!req.user) {
            return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        const userLevel = CONSTANTS.ROLE_HIERARCHY[req.user.role] || 0;
        
        if (userLevel < minLevel) {
            logAuthEvent('AUTHZ_LEVEL_DENIED', {
                userId: req.user.id,
                userRole: req.user.role,
                userLevel,
                requiredRole: minRole,
                requiredLevel: minLevel,
                ip: req.ip
            });
            
            return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                error: `Requires ${minRole} role or higher`,
                code: 'INSUFFICIENT_ROLE'
            });
        }
        
        next();
    };
}

/**
 * Owner or admin authorization
 * Allows access if user is admin or accessing their own resource
 * @param {string} userIdParam - Parameter name for user ID (default: 'id')
 * @returns {Function} Middleware function
 */
function ownerOrAdmin(userIdParam = 'id') {
    return function(req, res, next) {
        if (!req.user) {
            return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        const resourceUserId = parseInt(req.params[userIdParam], 10);
        const isAdmin = req.user.role === 'super' || req.user.role === 'boss';
        const isOwner = req.user.id === resourceUserId;
        
        if (!isAdmin && !isOwner) {
            logAuthEvent('AUTHZ_NOT_OWNER', {
                userId: req.user.id,
                resourceUserId,
                ip: req.ip
            });
            
            return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                error: 'Access denied',
                code: 'NOT_OWNER'
            });
        }
        
        next();
    };
}

// ============================================
// COOKIE MANAGEMENT
// ============================================

/**
 * Set JWT as HttpOnly cookie
 * @param {Object} res - Express response object
 * @param {string} token - JWT token
 * @param {Object} options - Cookie options
 */
function setTokenCookie(res, token, options = {}) {
    const cookieOptions = {
        httpOnly: true,
        secure: isProduction(),
        sameSite: isProduction() ? 'strict' : 'lax',
        maxAge: options.maxAge || CONSTANTS.TOKEN_MAX_AGE_MS,
        path: '/',
        domain: options.domain
    };
    
    res.cookie(CONSTANTS.TOKEN_COOKIE_NAME, token, cookieOptions);
}

/**
 * Set refresh token as HttpOnly cookie
 * @param {Object} res - Express response object
 * @param {string} token - Refresh token
 */
function setRefreshTokenCookie(res, token) {
    res.cookie(CONSTANTS.REFRESH_TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProduction(),
        sameSite: isProduction() ? 'strict' : 'lax',
        maxAge: CONSTANTS.REFRESH_TOKEN_MAX_AGE_MS,
        path: '/api/auth/refresh' // Only sent to refresh endpoint
    });
}

/**
 * Clear JWT cookie
 * @param {Object} res - Express response object
 */
function clearTokenCookie(res) {
    res.clearCookie(CONSTANTS.TOKEN_COOKIE_NAME, { path: '/' });
}

/**
 * Clear refresh token cookie
 * @param {Object} res - Express response object
 */
function clearRefreshTokenCookie(res) {
    res.clearCookie(CONSTANTS.REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth/refresh' });
}

// ============================================
// TOKEN REVOCATION
// ============================================

/**
 * Revoke a token (add to blacklist)
 * @param {string} token - Token to revoke
 */
function revokeToken(token) {
    if (token) {
        tokenBlacklist.add(token);
        logAuthEvent('TOKEN_REVOKED', { tokenId: decodeToken(token)?.jti });
    }
}

/**
 * Revoke a refresh token
 * @param {string} token - Refresh token to revoke
 */
function revokeRefreshToken(token) {
    if (token) {
        refreshTokenBlacklist.add(token);
        logAuthEvent('REFRESH_TOKEN_REVOKED', { tokenId: decodeToken(token)?.jti });
    }
}

/**
 * Revoke all tokens for a user
 * @param {number} userId - User ID
 */
async function revokeAllUserTokens(userId) {
    // In a real implementation, you would:
    // 1. Store tokens in database with userId
    // 2. Update a token_version field on the user
    // 3. Or use Redis to track valid tokens
    
    logAuthEvent('ALL_TOKENS_REVOKED', { userId });
    
    // For now, we just log the event
    // In production, implement proper token versioning
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Token generation
    generateToken,
    generateRefreshToken,
    
    // Token verification
    verifyToken,
    verifyRefreshToken,
    
    // Middleware
    authenticate,
    optionalAuth,
    authorize,
    requireMinRole,
    ownerOrAdmin,
    
    // Cookie management
    setTokenCookie,
    setRefreshTokenCookie,
    clearTokenCookie,
    clearRefreshTokenCookie,
    
    // Token revocation
    revokeToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    
    // Utilities
    decodeToken,
    isProduction,
    
    // Constants (for testing)
    CONSTANTS
};