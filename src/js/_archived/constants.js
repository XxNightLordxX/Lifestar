/**
 * Application Constants
 * Centralized configuration values
 */

// Time constants (milliseconds)
const TIME_CONSTANTS = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000
};

// Shift duration constants (hours)
const SHIFT_CONSTANTS = {
    SHIFT_8: 8,
    SHIFT_12: 12,
    SHIFT_24: 24
};

// User roles
const USER_ROLES = {
    SUPER_ADMIN: 'super_admin',
    BOSS: 'boss',
    PARAMEDIC: 'paramedic',
    EMT: 'emt',
    DISPATCHER: 'dispatcher',
    ADMIN: 'admin'
};

// Shift types
const SHIFT_TYPES = {
    DAY: 'day',
    NIGHT: 'night',
    WEEKEND: 'weekend',
    HOLIDAY: 'holiday',
    ON_CALL: 'on_call'
};

// Certification levels
const CERTIFICATION_LEVELS = {
    ALS: 'ALS', // Advanced Life Support
    BLS: 'BLS'  // Basic Life Support
};

// Error codes
const ERROR_CODES = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR'
};

// Pagination defaults
const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
};

// Cache configuration
const CACHE_CONFIG = {
    MAX_SIZE: 1000,
    TTL: 5 * 60 * 1000, // 5 minutes
    CLEANUP_INTERVAL: 60 * 1000 // 1 minute
};

// API endpoints
const API_ENDPOINTS = {
    AUTH: '/api/auth',
    USERS: '/api/users',
    SHIFTS: '/api/shifts',
    CREWS: '/api/crews',
    SCHEDULES: '/api/schedules',
    NOTIFICATIONS: '/api/notifications'
};

// Validation rules
const VALIDATION_RULES = {
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    EMAIL_MAX_LENGTH: 255
};

// Export all constants (Node.js compatibility)
if(typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TIME_CONSTANTS,
        SHIFT_CONSTANTS,
        USER_ROLES,
        SHIFT_TYPES,
        CERTIFICATION_LEVELS,
        ERROR_CODES,
        PAGINATION,
        CACHE_CONFIG,
        API_ENDPOINTS,
        VALIDATION_RULES
    };
}
