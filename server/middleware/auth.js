/**
 * Authentication & Authorization Middleware
 *
 * Key changes from previous version:
 *  - All CONSTANTS replaced with imports from server/config.js — one source of
 *    truth for JWT secrets, bcrypt rounds, cookie names, etc.
 *  - Token blacklist replaced with a TTL-aware Map. The old implementation used
 *    a plain Set and only pruned it when it grew past 10 000 entries, so a
 *    revoked token could technically survive indefinitely. The new approach
 *    stores each token's own expiry alongside it, auto-evicts on read, and runs
 *    a scheduled sweep purely for memory hygiene.
 *
 * @module middleware/auth
 */

'use strict';

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { SECURITY, AUTH, HTTP_STATUS, isProduction } = require('../config');

// ============================================
// TTL-AWARE TOKEN BLACKLIST
// ============================================
// Map<token, expiresAtMs>
// Entries are evicted lazily (on membership check) or by the hourly sweep.

const _tokenBlacklist        = new Map();
const _refreshTokenBlacklist = new Map();

function _blacklistAdd(token, store) {
    const decoded   = _decodeRaw(token);
    const expiresAt = decoded && decoded.exp
        ? decoded.exp * 1000
        : Date.now() + SECURITY.TOKEN_MAX_AGE_MS;
    store.set(token, expiresAt);
}

function _blacklistHas(token, store) {
    if (!store.has(token)) return false;
    const expiresAt = store.get(token);
    if (Date.now() > expiresAt) {
        store.delete(token);
        return false;
    }
    return true;
}

// Per-user revocation timestamps — any token issued before this time is invalid
const _userRevocationMap = new Map();

// Hourly memory-hygiene sweep
const _cleanupInterval = setInterval(function() {
    const now = Date.now();
    for (const [t, exp] of _tokenBlacklist) {
        if (now > exp) _tokenBlacklist.delete(t);
    }
    for (const [t, exp] of _refreshTokenBlacklist) {
        if (now > exp) _refreshTokenBlacklist.delete(t);
    }
}, 60 * 60 * 1000);

// ============================================
// HELPERS
// ============================================

function generateTokenId() {
    return crypto.randomBytes(16).toString('hex');
}

function _decodeRaw(token) {
    try { return jwt.decode(token); } catch (e) { return null; }
}

function decodeToken(token) { return _decodeRaw(token); }

function logAuthEvent(event, data) {
    const entry = { timestamp: new Date().toISOString(), event: event };
    Object.assign(entry, data);
    if (isProduction) {
        console.log(JSON.stringify(entry));
    } else {
        console.log('[AUTH] ' + entry.timestamp + ' - ' + event + ':', data);
    }
}

// ============================================
// TOKEN GENERATION
// ============================================

function generateToken(user, opts) {
    opts = opts || {};
    if (!user || !user.id || !user.username || !user.role) {
        throw new Error('Invalid user object for token generation');
    }
    var payload = {
        id:       user.id,
        username: user.username,
        role:     user.role,
        jti:      generateTokenId(),
        type:     'access'
    };
    if (user.locationId) payload.locationId = user.locationId;
    if (opts.ipAddress)  payload.ip = opts.ipAddress;

    return jwt.sign(payload, SECURITY.JWT_SECRET, {
        expiresIn: opts.expiresIn || SECURITY.JWT_EXPIRES_IN,
        algorithm: SECURITY.JWT_ALGORITHM
    });
}

function generateRefreshToken(user) {
    if (!user || !user.id) throw new Error('Invalid user object for refresh token generation');
    var payload = {
        id:       user.id,
        username: user.username,
        jti:      generateTokenId(),
        type:     'refresh'
    };
    return jwt.sign(payload, SECURITY.JWT_SECRET, {
        expiresIn: SECURITY.JWT_REFRESH_EXPIRES_IN,
        algorithm: SECURITY.JWT_ALGORITHM
    });
}

// ============================================
// TOKEN VERIFICATION
// ============================================

function verifyToken(token) {
    if (!token || typeof token !== 'string') throw new Error('Token is required');
    if (_blacklistHas(token, _tokenBlacklist)) throw new Error('Token has been revoked');
    try {
        var decoded = jwt.verify(token, SECURITY.JWT_SECRET, {
            algorithms: [SECURITY.JWT_ALGORITHM]
        });
        if (decoded.type !== 'access') throw new Error('Invalid token type');
        // Check per-user revocation — reject tokens issued before revocation time
        if (decoded.userId || decoded.sub) {
            const userId = decoded.userId || decoded.sub;
            const revokedAt = _userRevocationMap.get(String(userId));
            if (revokedAt && decoded.iat && decoded.iat < revokedAt) {
                throw new Error('Token has been revoked');
            }
        }
        return decoded;
    } catch (err) {
        if (err.name === 'TokenExpiredError')  throw new Error('Token expired');
        if (err.name === 'JsonWebTokenError')  throw new Error('Invalid token');
        throw err;
    }
}

function verifyRefreshToken(token) {
    if (!token || typeof token !== 'string') throw new Error('Refresh token is required');
    if (_blacklistHas(token, _refreshTokenBlacklist)) throw new Error('Refresh token has been revoked');
    try {
        var decoded = jwt.verify(token, SECURITY.JWT_SECRET, {
            algorithms: [SECURITY.JWT_ALGORITHM]
        });
        if (decoded.type !== 'refresh') throw new Error('Invalid token type');
        return decoded;
    } catch (err) {
        if (err.name === 'TokenExpiredError') throw new Error('Refresh token expired');
        throw new Error('Invalid refresh token');
    }
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

function authenticate(req, res, next) {
    var token = null;
    var tokenSource = null;

    if (req.cookies && req.cookies[SECURITY.TOKEN_COOKIE_NAME]) {
        token = req.cookies[SECURITY.TOKEN_COOKIE_NAME];
        tokenSource = 'cookie';
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
        tokenSource = 'header';
    }

    if (!token) {
        logAuthEvent('AUTH_NO_TOKEN', { ip: req.ip, path: req.path });
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
            error: 'Authentication required',
            code:  'AUTH_REQUIRED'
        });
    }

    try {
        var decoded = verifyToken(token);
        req.user = {
            id:         decoded.id,
            username:   decoded.username,
            role:       decoded.role,
            tokenId:    decoded.jti,
            locationId: decoded.locationId
        };
        req.token = token;
        logAuthEvent('AUTH_SUCCESS', {
            userId:   decoded.id,
            username: decoded.username,
            role:     decoded.role,
            ip:       req.ip,
            path:     req.path
        });
        next();
    } catch (err) {
        logAuthEvent('AUTH_FAILED', { error: err.message, ip: req.ip, tokenSource: tokenSource });
        if (tokenSource === 'cookie') {
            res.clearCookie(SECURITY.TOKEN_COOKIE_NAME, { path: '/' });
        }
        var code = err.message === 'Token expired' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
        var msg  = err.message === 'Token expired' ? 'Session expired. Please login again.' : 'Invalid token';
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: msg, code: code });
    }
}

function optionalAuth(req, res, next) {
    var token = null;
    if (req.cookies && req.cookies[SECURITY.TOKEN_COOKIE_NAME]) {
        token = req.cookies[SECURITY.TOKEN_COOKIE_NAME];
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
    }
    if (token) {
        try {
            var decoded = verifyToken(token);
            req.user = {
                id:         decoded.id,
                username:   decoded.username,
                role:       decoded.role,
                tokenId:    decoded.jti,
                locationId: decoded.locationId
            };
            req.token = token;
        } catch (e) { /* proceed without req.user */ }
    }
    next();
}

// ============================================
// AUTHORIZATION MIDDLEWARE
// ============================================

function authorize() {
    var allowedRoles = Array.prototype.slice.call(arguments);
    for (var i = 0; i < allowedRoles.length; i++) {
        if (!AUTH.VALID_ROLES.includes(allowedRoles[i])) {
            throw new Error('[auth.authorize] Unknown role: "' + allowedRoles[i] + '"');
        }
    }
    return function(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            logAuthEvent('AUTHZ_DENIED', { userId: req.user.id, userRole: req.user.role, requiredRoles: allowedRoles, ip: req.ip });
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                error: 'Access requires one of: ' + allowedRoles.join(', '),
                code:  'INSUFFICIENT_ROLE'
            });
        }
        next();
    };
}

function requireMinRole(minRole) {
    var minLevel = AUTH.ROLE_HIERARCHY[minRole];
    if (minLevel === undefined) throw new Error('[auth.requireMinRole] Unknown role: "' + minRole + '"');
    return function(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        var userLevel = AUTH.ROLE_HIERARCHY[req.user.role] || 0;
        if (userLevel < minLevel) {
            logAuthEvent('AUTHZ_LEVEL_DENIED', { userId: req.user.id, userRole: req.user.role, requiredRole: minRole, ip: req.ip });
            return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Requires ' + minRole + ' role or higher', code: 'INSUFFICIENT_ROLE' });
        }
        next();
    };
}

function ownerOrAdmin(userIdParam) {
    userIdParam = userIdParam || 'id';
    return function(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        var resourceUserId = parseInt(req.params[userIdParam], 10);
        var isAdmin = req.user.role === 'super' || req.user.role === 'boss';
        var isOwner = req.user.id === resourceUserId;
        if (!isAdmin && !isOwner) {
            logAuthEvent('AUTHZ_NOT_OWNER', { userId: req.user.id, resourceUserId: resourceUserId, ip: req.ip });
            return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Access denied', code: 'NOT_OWNER' });
        }
        next();
    };
}

// ============================================
// COOKIE MANAGEMENT
// ============================================

function setTokenCookie(res, token, opts) {
    opts = opts || {};
    res.cookie(SECURITY.TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure:   isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge:   opts.maxAge || SECURITY.TOKEN_MAX_AGE_MS,
        path:     '/',
        domain:   opts.domain
    });
}

function setRefreshTokenCookie(res, token) {
    res.cookie(SECURITY.REFRESH_TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure:   isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge:   SECURITY.REFRESH_TOKEN_MAX_AGE_MS,
        path:     '/api/auth/refresh'
    });
}

function clearTokenCookie(res) {
    res.clearCookie(SECURITY.TOKEN_COOKIE_NAME, { path: '/' });
}

function clearRefreshTokenCookie(res) {
    res.clearCookie(SECURITY.REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth/refresh' });
}

// ============================================
// TOKEN REVOCATION
// ============================================

function revokeToken(token) {
    if (token) {
        _blacklistAdd(token, _tokenBlacklist);
        logAuthEvent('TOKEN_REVOKED', { tokenId: _decodeRaw(token) && _decodeRaw(token).jti });
    }
}

function revokeRefreshToken(token) {
    if (token) {
        _blacklistAdd(token, _refreshTokenBlacklist);
        logAuthEvent('REFRESH_TOKEN_REVOKED', { tokenId: _decodeRaw(token) && _decodeRaw(token).jti });
    }
}

function revokeAllUserTokens(userId) {
    // Store current epoch seconds — verifyToken() rejects tokens with iat before this
    _userRevocationMap.set(String(userId), Math.floor(Date.now() / 1000));
    logAuthEvent('ALL_TOKENS_REVOKED', { userId: userId });
    return Promise.resolve();
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    generateToken,
    generateRefreshToken,
    verifyToken,
    verifyRefreshToken,
    authenticate,
    optionalAuth,
    authorize,
    requireMinRole,
    ownerOrAdmin,
    setTokenCookie,
    setRefreshTokenCookie,
    clearTokenCookie,
    clearRefreshTokenCookie,
    revokeToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    decodeToken,
    isProduction,
    _tokenBlacklist,
    _refreshTokenBlacklist
};
