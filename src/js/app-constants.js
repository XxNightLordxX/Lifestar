/**
 * Application Constants
 * Central location for all magic numbers and configuration values
 */

const APP_CONSTANTS = {
    // Time values (in milliseconds)
    ONE_SECOND_MS: 1000,
    THREE_SECONDS_MS: 3000,
    FIVE_SECONDS_MS: 5000,
    TEN_SECONDS_MS: 10000,
    THIRTY_SECONDS_MS: 30000,
    ONE_MINUTE_MS: 60000,
    FIVE_MINUTES_MS: 300000,
    FIFTEEN_MINUTES_MS: 900000,
    THIRTY_MINUTES_MS: 1800000,
    ONE_HOUR_MS: 3600000,
    ONE_DAY_MS: 86400000,
    
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
};

// Freeze to prevent modifications
Object.freeze(APP_CONSTANTS);

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APP_CONSTANTS;
}
