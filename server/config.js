/**
 * Centralized Server Configuration
 *
 * Single source of truth for all server-side constants. Every route and
 * middleware imports from here rather than defining its own CONSTANTS block,
 * which was causing the bcrypt-rounds inconsistency (10 vs 12 in different
 * files) and the silent-fallback secrets problem.
 *
 * At startup, validateEnv() throws if any required production variables are
 * missing rather than silently using hardcoded fallbacks that are publicly
 * known.
 *
 * @module config
 */

'use strict';

const isProduction = process.env.NODE_ENV === 'production';

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

/**
 * Validate that all required environment variables are set.
 * Call this once during server startup — it will throw with a clear
 * message listing every missing variable rather than blowing up
 * silently in the middle of a request.
 */
function validateEnv() {
    const required = ['JWT_SECRET', 'COOKIE_SECRET'];
    const missing = required.filter(key => !process.env[key]);

    if (isProduction && missing.length > 0) {
        throw new Error(
            `[config] Missing required environment variables for production:\n` +
            missing.map(k => `  • ${k}`).join('\n') +
            `\n\nCopy .env.example to .env and fill in the missing values.`
        );
    }

    if (!isProduction && missing.length > 0) {
        // In development, warn loudly but don't crash
        console.warn(
            `\n⚠️  [config] WARNING: Missing environment variables: ${missing.join(', ')}\n` +
            `   Using insecure development fallbacks. Copy .env.example → .env\n`
        );
    }
}

// ============================================
// SECURITY CONSTANTS
// ============================================

const SECURITY = {
    /**
     * bcrypt work factor. Uniform across all files — users.js was using 12
     * while auth.js and database.js used 10. Standardising at 12 for strong
     * security while keeping login latency under ~150ms on modern hardware.
     */
    BCRYPT_ROUNDS: 12,

    JWT_SECRET: process.env.JWT_SECRET || (
        isProduction ? null : 'lifestar-dev-jwt-secret-NOT-FOR-PRODUCTION'
    ),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    JWT_ALGORITHM: 'HS256',

    COOKIE_SECRET: process.env.COOKIE_SECRET || (
        isProduction ? null : 'lifestar-dev-cookie-secret-NOT-FOR-PRODUCTION'
    ),
    TOKEN_COOKIE_NAME: 'lifestar_token',
    REFRESH_TOKEN_COOKIE_NAME: 'lifestar_refresh_token',
    TOKEN_MAX_AGE_MS:         8  * 60 * 60 * 1000,  // 8 hours
    REFRESH_TOKEN_MAX_AGE_MS: 7  * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================
// AUTH CONSTANTS
// ============================================

const AUTH = {
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,

    // Brute-force protection
    MAX_LOGIN_ATTEMPTS:    5,
    LOCKOUT_DURATION_MS:   15 * 60 * 1000, // 15 minutes

    /** Numeric hierarchy for role-based access checks */
    ROLE_HIERARCHY: {
        super:     100,
        boss:       50,
        paramedic:  10,
        emt:         5,
    },

    VALID_ROLES: ['super', 'boss', 'paramedic', 'emt'],
};

// ============================================
// RATE LIMITING
// ============================================

const RATE_LIMIT = {
    LOGIN_WINDOW_MS:      15 * 60 * 1000,
    LOGIN_MAX_ATTEMPTS:   5,
    API_WINDOW_MS:        60 * 1000,
    API_MAX_REQUESTS:     100,
    AUTH_MAX_REQUESTS:    30,
    CREATE_WINDOW_MS:     60 * 60 * 1000,
    CREATE_MAX_REQUESTS:  20,
};

// ============================================
// DATABASE
// ============================================

const DATABASE = {
    // Mirrored from database.js — centralised so both places stay in sync
    SLOW_QUERY_THRESHOLD: 100, // ms; queries above this are logged as warnings
    MAX_BACKUPS: 10,
    BACKUP_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours
};

// ============================================
// SERVER
// ============================================

const SERVER = {
    PORT: parseInt(process.env.PORT, 10) || 8061,
    NODE_ENV: process.env.NODE_ENV || 'development',
    API_VERSION: '3.2.0',
    JSON_LIMIT: '10mb',
    KEEP_ALIVE_TIMEOUT: 65000,
    HEADERS_TIMEOUT:    66000,
    LOG_EXCLUDED_PATHS: ['/api/health', '/favicon.ico', '/css/', '/js/', '/images/'],
};

// ============================================
// INCIDENT REPORTS
// ============================================

const INCIDENTS = {
    VALID_TYPES:       ['patient-care', 'vehicle', 'workplace', 'equipment', 'other'],
    VALID_PRIORITIES:  ['low', 'medium', 'high', 'critical'],
    VALID_STATUSES:    ['open', 'under-review', 'resolved', 'closed'],
    MAX_DESCRIPTION:   5000,
    MAX_TITLE:         200,
};

// ============================================
// HTTP STATUS CODES
// ============================================

const HTTP_STATUS = {
    OK:           200,
    CREATED:      201,
    NO_CONTENT:   204,
    BAD_REQUEST:  400,
    UNAUTHORIZED: 401,
    FORBIDDEN:    403,
    NOT_FOUND:    404,
    CONFLICT:     409,
    RATE_LIMITED: 429,
    SERVER_ERROR: 500,
    UNAVAILABLE:  503,
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
    validateEnv,
    isProduction,
    SECURITY,
    AUTH,
    RATE_LIMIT,
    DATABASE,
    SERVER,
    INCIDENTS,
    HTTP_STATUS,
};
