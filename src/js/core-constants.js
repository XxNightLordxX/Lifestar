/**
 * Core Constants Module - Consolidated from multiple files
 * Central location for all application constants
 * @module core-constants
 * @version 1.0.0
 * 
 * Consolidated from:
 * - constants.js
 * - app-constants.js
 */

'use strict';

// ========================================
// TIME CONSTANTS (Milliseconds)
// ========================================

const TIME_CONSTANTS = Object.freeze({
    SECOND: 1000,
    THREE_SECONDS: 3000,
    FIVE_SECONDS: 5000,
    TEN_SECONDS: 10000,
    THIRTY_SECONDS: 30000,
    MINUTE: 60 * 1000,
    FIVE_MINUTES: 5 * 60 * 1000,
    FIFTEEN_MINUTES: 15 * 60 * 1000,
    THIRTY_MINUTES: 30 * 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000
});

// ========================================
// APPLICATION CONSTANTS
// ========================================

const APP_CONSTANTS = Object.freeze({
    // Timeouts
    DEFAULT_TIMEOUT_MS: 5000,
    SHORT_TIMEOUT_MS: 3000,
    LONG_TIMEOUT_MS: 10000,
    RETRY_DELAY_MS: 1000,
    
    // Server
    DEFAULT_PORT: 8061,
    MAX_REQUESTS_PER_WINDOW: 100,
    AUTH_MAX_REQUESTS: 5,
    BLOCK_DURATION_MS: 1800000,
    
    // Limits
    MAX_LOGIN_ATTEMPTS: 5,
    SESSION_TIMEOUT_MS: 1800000,
    MAX_STORAGE_SIZE_MB: 5,
    
    // UI
    PERCENTAGE_MAX: 100,
    MAX_PAGE_SIZE: 100,
    DEFAULT_PAGE_SIZE: 10,
    
    // Pagination
    PAGINATION_LIMIT: 50,
    
    // File sizes
    MAX_FILE_SIZE_MB: 10,
    MAX_UPLOAD_SIZE_MB: 5
});

// ========================================
// SHIFT CONSTANTS
// ========================================

const SHIFT_CONSTANTS = Object.freeze({
    SHIFT_8: 8,
    SHIFT_12: 12,
    SHIFT_24: 24,
    
    // Shift types
    TYPES: Object.freeze({
        DAY: 'day',
        NIGHT: 'night',
        WEEKEND: 'weekend',
        HOLIDAY: 'holiday',
        ON_CALL: 'on_call'
    }),
    
    // Default shift times
    DEFAULT_START: '08:00',
    DEFAULT_END: '20:00',
    NIGHT_START: '20:00',
    NIGHT_END: '08:00'
});

// ========================================
// USER ROLES
// ========================================

const USER_ROLES = Object.freeze({
    SUPER_ADMIN: 'super',
    BOSS: 'boss',
    PARAMEDIC: 'paramedic',
    EMT: 'emt',

    // Role hierarchy (higher = more permissions)
    HIERARCHY: Object.freeze({
        'super': 100,
        'boss': 70,
        'paramedic': 30,
        'emt': 20
    }),

    // Role display names
    DISPLAY_NAMES: Object.freeze({
        'super': 'Super Admin',
        'boss': 'Supervisor',
        'paramedic': 'Paramedic',
        'emt': 'EMT'
    })
});

// ========================================
// CERTIFICATION LEVELS
// ========================================

const CERTIFICATION_LEVELS = Object.freeze({
    ALS: 'ALS', // Advanced Life Support
    BLS: 'BLS', // Basic Life Support
    
    DISPLAY_NAMES: Object.freeze({
        'ALS': 'Advanced Life Support',
        'BLS': 'Basic Life Support'
    })
});

// ========================================
// ERROR CODES
// ========================================

const ERROR_CODES = Object.freeze({
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    
    // Error messages
    MESSAGES: Object.freeze({
        'VALIDATION_ERROR': 'Invalid data provided',
        'AUTHENTICATION_ERROR': 'Authentication failed',
        'AUTHORIZATION_ERROR': 'Access denied',
        'DATABASE_ERROR': 'Database operation failed',
        'NETWORK_ERROR': 'Network connection error',
        'NOT_FOUND': 'Resource not found',
        'SESSION_EXPIRED': 'Session has expired',
        'RATE_LIMIT_EXCEEDED': 'Too many requests'
    })
});

// ========================================
// PAGINATION DEFAULTS
// ========================================

const PAGINATION = Object.freeze({
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    
    // Quick link sizes
    QUICK_SIZES: Object.freeze([10, 25, 50, 100])
});

// ========================================
// HTTP STATUS CODES
// ========================================

const HTTP_STATUS = Object.freeze({
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
});

// ========================================
// LOCAL STORAGE KEYS
// ========================================

const STORAGE_KEYS = Object.freeze({
    USER: 'lifestarUser',
    TOKEN: 'lifestarToken',
    THEME: 'lifestarTheme',
    SCHEDULES: 'lifestarSchedules',
    EMPLOYEES: 'lifestarEmployees',
    SETTINGS: 'lifestarSettings',
    TIMEOFF_REQUESTS: 'lifestarTimeoffRequests',
    NOTIFICATIONS: 'lifestarNotifications',
    RECENT_SEARCHES: 'lifestarRecentSearches',
    PREFERENCES: 'lifestarPreferences'
});

// ========================================
// NOTIFICATION TYPES
// ========================================

const NOTIFICATION_TYPES = Object.freeze({
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    SYSTEM: 'system'
});

// ========================================
// SCHEDULE STATUS
// ========================================

const SCHEDULE_STATUS = Object.freeze({
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
    
    DISPLAY_NAMES: Object.freeze({
        'draft': 'Draft',
        'published': 'Published',
        'archived': 'Archived'
    })
});

// ========================================
// LEAVE/ABSENCE TYPES
// ========================================

const LEAVE_TYPES = Object.freeze({
    VACATION: 'vacation',
    SICK: 'sick',
    PERSONAL: 'personal',
    BEREAVEMENT: 'bereavement',
    JURY_DUTY: 'jury_duty',
    MILITARY: 'military',
    OTHER: 'other',
    
    DISPLAY_NAMES: Object.freeze({
        'vacation': 'Vacation',
        'sick': 'Sick Leave',
        'personal': 'Personal Leave',
        'bereavement': 'Bereavement',
        'jury_duty': 'Jury Duty',
        'military': 'Military Leave',
        'other': 'Other'
    })
});

// ========================================
// LOG LEVELS
// ========================================

const LOG_LEVELS = Object.freeze({
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    NONE: 'none'
});

// ========================================
// DATE FORMATS
// ========================================

const DATE_FORMATS = Object.freeze({
    SHORT: 'short',
    LONG: 'long',
    ISO: 'iso',
    TIME: 'time',
    DATETIME: 'datetime',
    DISPLAY: 'display',
    INPUT: 'YYYY-MM-DD'
});

// ========================================
// EVENT NAMES
// ========================================

const EVENTS = Object.freeze({
    // User events
    USER_LOGIN: 'user:login',
    USER_LOGOUT: 'user:logout',
    USER_UPDATE: 'user:update',
    
    // Schedule events
    SCHEDULE_CREATE: 'schedule:create',
    SCHEDULE_UPDATE: 'schedule:update',
    SCHEDULE_DELETE: 'schedule:delete',
    SCHEDULE_PUBLISH: 'schedule:publish',
    
    // Shift events
    SHIFT_ASSIGN: 'shift:assign',
    SHIFT_UNASSIGN: 'shift:unassign',
    SHIFT_SWAP: 'shift:swap',
    
    // Notification events
    NOTIFICATION_NEW: 'notification:new',
    NOTIFICATION_READ: 'notification:read',
    NOTIFICATION_CLEAR: 'notification:clear',
    
    // UI events
    MODAL_OPEN: 'modal:open',
    MODAL_CLOSE: 'modal:close',
    TAB_CHANGE: 'tab:change',
    THEME_CHANGE: 'theme:change'
});

// ========================================
// VALIDATION RULES
// ========================================

const VALIDATION_RULES = Object.freeze({
    // Password requirements
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
    PASSWORD_REQUIRE_UPPERCASE: true,
    PASSWORD_REQUIRE_LOWERCASE: true,
    PASSWORD_REQUIRE_NUMBER: true,
    PASSWORD_REQUIRE_SPECIAL: true,
    
    // Username requirements
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    
    // Name requirements
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
    
    // Email
    EMAIL_MAX_LENGTH: 254,
    
    // Phone
    PHONE_MIN_LENGTH: 10,
    PHONE_MAX_LENGTH: 20
});

// ========================================
// API ENDPOINTS (Relative paths)
// ========================================

const API_ENDPOINTS = Object.freeze({
    // Auth
    LOGIN: '/api/login',
    LOGOUT: '/api/logout',
    VERIFY_TOKEN: '/api/verify-token',
    
    // Users
    USERS: '/api/users',
    USER_BY_ID: '/api/users/:id',
    USER_PROFILE: '/api/users/profile',
    
    // Schedules
    SCHEDULES: '/api/schedules',
    SCHEDULE_BY_ID: '/api/schedules/:id',
    
    // Shifts
    SHIFTS: '/api/shifts',
    SHIFT_BY_ID: '/api/shifts/:id',
    
    // Employees
    EMPLOYEES: '/api/employees',
    EMPLOYEE_BY_ID: '/api/employees/:id',
    
    // Time off
    TIMEOFF: '/api/timeoff',
    TIMEOFF_BY_ID: '/api/timeoff/:id'
});

// ========================================
// GLOBAL EXPORTS
// ========================================

// Make all constants available globally
window.TIME_CONSTANTS = TIME_CONSTANTS;
window.APP_CONSTANTS = APP_CONSTANTS;
window.SHIFT_CONSTANTS = SHIFT_CONSTANTS;
window.USER_ROLES = USER_ROLES;
window.CERTIFICATION_LEVELS = CERTIFICATION_LEVELS;
window.ERROR_CODES = ERROR_CODES;
window.PAGINATION = PAGINATION;
window.HTTP_STATUS = HTTP_STATUS;
window.STORAGE_KEYS = STORAGE_KEYS;
window.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
window.SCHEDULE_STATUS = SCHEDULE_STATUS;
window.LEAVE_TYPES = LEAVE_TYPES;
window.LOG_LEVELS = LOG_LEVELS;
window.DATE_FORMATS = DATE_FORMATS;
window.EVENTS = EVENTS;
window.VALIDATION_RULES = VALIDATION_RULES;
window.API_ENDPOINTS = API_ENDPOINTS;

// Backward compatibility aliases
window.TIME_VALUES = TIME_CONSTANTS;
window.SHIFT_TYPES = SHIFT_CONSTANTS.TYPES;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TIME_CONSTANTS,
        APP_CONSTANTS,
        SHIFT_CONSTANTS,
        USER_ROLES,
        CERTIFICATION_LEVELS,
        ERROR_CODES,
        PAGINATION,
        HTTP_STATUS,
        STORAGE_KEYS,
        NOTIFICATION_TYPES,
        SCHEDULE_STATUS,
        LEAVE_TYPES,
        LOG_LEVELS,
        DATE_FORMATS,
        EVENTS,
        VALIDATION_RULES,
        API_ENDPOINTS
    };
}