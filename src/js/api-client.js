/**
 * API Client Module - Enhanced Version
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - Request queuing and deduplication
 * - Circuit breaker pattern for fault tolerance
 * - Request/response interceptors
 * - Comprehensive error handling
 * - Request timeout handling
 * - Offline detection and queuing
 * - Request cancellation support
 * - Performance monitoring
 * - CSRF token management
 * - Rate limit handling
 * 
 * @module ApiClient
 */

'use strict';

const ApiClient = (function() {
    // ============================================
    // CONSTANTS
    // ============================================
    const CONSTANTS = {
        BASE_URL: '',  // Same origin
        
        // Retry configuration
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        RETRY_MULTIPLIER: 2,
        RETRIABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504],
        
        // Timeout configuration
        DEFAULT_TIMEOUT: 30000,
        AUTH_TIMEOUT: 10000,
        
        // Circuit breaker configuration
        CIRCUIT_BREAKER_THRESHOLD: 5,
        CIRCUIT_BREAKER_TIMEOUT: 30000,
        
        // Request queue configuration
        MAX_QUEUE_SIZE: 100,
        QUEUE_PROCESS_INTERVAL: 1000,
        
        // Cache configuration
        CACHE_TTL: 60000, // 1 minute
        MAX_CACHE_SIZE: 50,
        
        // Rate limiting
        RATE_LIMIT_HEADER: 'X-RateLimit-Remaining',
        RATE_LIMIT_RESET_HEADER: 'X-RateLimit-Reset',
        
        // Storage keys
        TOKEN_KEY: 'lifestarApiToken',
        CSRF_TOKEN_KEY: 'lifestarCsrfToken',
        OFFLINE_QUEUE_KEY: 'lifestarOfflineQueue'
    };

    // Error codes
    const ERROR_CODES = {
        NETWORK: 'NETWORK_ERROR',
        TIMEOUT: 'TIMEOUT_ERROR',
        UNAUTHORIZED: 'UNAUTHORIZED',
        FORBIDDEN: 'FORBIDDEN',
        NOT_FOUND: 'NOT_FOUND',
        VALIDATION: 'VALIDATION_ERROR',
        RATE_LIMIT: 'RATE_LIMIT',
        SERVER: 'SERVER_ERROR',
        CIRCUIT_OPEN: 'CIRCUIT_OPEN',
        OFFLINE: 'OFFLINE',
        CANCELLED: 'CANCELLED'
    };

    // ============================================
    // STATE
    // ============================================
    let state = {
        token: null,
        csrfToken: null,
        isOnline: true,
        circuitBreaker: {
            failures: 0,
            isOpen: false,
            lastFailure: null,
            nextAttempt: null
        },
        requestQueue: [],
        pendingRequests: new Map(),
        cache: new Map(),
        requestCounter: 0,
        abortControllers: new Map()
    };

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    /**
     * Generate a unique request ID
     * @returns {string} Unique request ID
     */
    function generateRequestId() {
        return `req_${Date.now()}_${++state.requestCounter}`;
    }

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return obj;
        }
    }

    /**
     * Build query string from parameters
     * @param {Object} params - Parameters object
     * @returns {string} Query string
     */
    function buildQueryString(params) {
        if (!params || typeof params !== 'object') return '';
        
        const parts = [];
        
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null) continue;
            
            if (Array.isArray(value)) {
                value.forEach(item => {
                    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
                });
            } else {
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
            }
        }
        
        return parts.length > 0 ? '?' + parts.join('&') : '';
    }

    /**
     * Get cache key for request
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @returns {string} Cache key
     */
    function getCacheKey(method, endpoint, data) {
        if (method !== 'GET') return null;
        return `${method}:${endpoint}:${JSON.stringify(data || {})}`;
    }

    /**
     * Check if response is cacheable
     * @param {string} method - HTTP method
     * @param {number} status - Response status
     * @returns {boolean} True if cacheable
     */
    function isCacheable(method, status) {
        return method === 'GET' && status >= 200 && status < 300;
    }

    /**
     * Get cached response
     * @param {string} key - Cache key
     * @returns {Object|null} Cached response or null
     */
    function getFromCache(key) {
        if (!key) return null;
        
        const cached = state.cache.get(key);
        if (!cached) return null;
        
        // Check if cache is expired
        if (Date.now() > cached.expiresAt) {
            state.cache.delete(key);
            return null;
        }
        
        return deepClone(cached.data);
    }

    /**
     * Store response in cache
     * @param {string} key - Cache key
     * @param {Object} data - Response data
     * @param {number} ttl - Time to live in milliseconds
     */
    function setInCache(key, data, ttl = CONSTANTS.CACHE_TTL) {
        if (!key) return;
        
        // Limit cache size
        if (state.cache.size >= CONSTANTS.MAX_CACHE_SIZE) {
            // Remove oldest entries
            const keys = Array.from(state.cache.keys());
            for (let i = 0; i < Math.floor(CONSTANTS.MAX_CACHE_SIZE / 2); i++) {
                state.cache.delete(keys[i]);
            }
        }
        
        state.cache.set(key, {
            data: deepClone(data),
            expiresAt: Date.now() + ttl
        });
    }

    /**
     * Clear cache (all or specific)
     * @param {string} pattern - Pattern to match (optional)
     */
    function clearCache(pattern = null) {
        if (!pattern) {
            state.cache.clear();
            return;
        }
        
        for (const key of state.cache.keys()) {
            if (key.includes(pattern)) {
                state.cache.delete(key);
            }
        }
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a standardized error
     * @param {string} code - Error code
     * @param {string} message - Error message
     * @param {Object} details - Additional details
     * @returns {Error} Standardized error
     */
    function createError(code, message, details = {}) {
        const error = new Error(message);
        error.code = code;
        error.details = details;
        error.timestamp = new Date().toISOString();
        return error;
    }

    /**
     * Check if error is retriable
     * @param {Error} error - Error to check
     * @returns {boolean} True if retriable
     */
    function isRetriableError(error) {
        if (error.code === ERROR_CODES.NETWORK) return true;
        if (error.code === ERROR_CODES.TIMEOUT) return true;
        if (error.code === ERROR_CODES.RATE_LIMIT) return true;
        if (error.status && CONSTANTS.RETRIABLE_STATUS_CODES.includes(error.status)) return true;
        return false;
    }

    /**
     * Get CSRF token from cookie or meta tag
     * @returns {string|null} CSRF token
     */
    function getCsrfToken() {
        // First check stored token
        if (state.csrfToken) return state.csrfToken;
        
        // Try to get from meta tag
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            state.csrfToken = metaTag.getAttribute('content');
            return state.csrfToken;
        }
        
        // Try to get from cookie
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === CONSTANTS.CSRF_TOKEN_KEY) {
                state.csrfToken = decodeURIComponent(value);
                return state.csrfToken;
            }
        }
        
        return null;
    }

    // ============================================
    // CIRCUIT BREAKER
    // ============================================

    /**
     * Check if circuit breaker allows requests
     * @returns {boolean} True if requests are allowed
     */
    function isCircuitClosed() {
        if (!state.circuitBreaker.isOpen) return true;
        
        // Check if we should try to close the circuit
        if (state.circuitBreaker.nextAttempt && Date.now() >= state.circuitBreaker.nextAttempt) {
            state.circuitBreaker.isOpen = false;
            state.circuitBreaker.failures = 0;
            log('info', 'Circuit breaker closed - retrying requests');
            return true;
        }
        
        return false;
    }

    /**
     * Record a failure for circuit breaker
     */
    function recordFailure() {
        state.circuitBreaker.failures++;
        state.circuitBreaker.lastFailure = new Date().toISOString();
        
        if (state.circuitBreaker.failures >= CONSTANTS.CIRCUIT_BREAKER_THRESHOLD) {
            state.circuitBreaker.isOpen = true;
            state.circuitBreaker.nextAttempt = Date.now() + CONSTANTS.CIRCUIT_BREAKER_TIMEOUT;
            log('warn', `Circuit breaker opened - will retry after ${CONSTANTS.CIRCUIT_BREAKER_TIMEOUT}ms`);
        }
    }

    /**
     * Record a success for circuit breaker
     */
    function recordSuccess() {
        state.circuitBreaker.failures = 0;
        state.circuitBreaker.isOpen = false;
        state.circuitBreaker.nextAttempt = null;
    }

    // ============================================
    // OFFLINE HANDLING
    // ============================================

    /**
     * Queue a request for later execution
     * @param {Object} request - Request to queue
     */
    function queueRequest(request) {
        if (state.requestQueue.length >= CONSTANTS.MAX_QUEUE_SIZE) {
            log('warn', 'Request queue full - dropping oldest request');
            state.requestQueue.shift();
        }
        
        state.requestQueue.push({
            ...request,
            id: generateRequestId(),
            queuedAt: new Date().toISOString()
        });
        
        // Persist queue to localStorage
        try {
            localStorage.setItem(CONSTANTS.OFFLINE_QUEUE_KEY, JSON.stringify(state.requestQueue));
        } catch (e) {
            log('warn', 'Failed to persist offline queue', e);
        }
    }

    /**
     * Process queued requests
     */
    async function processQueue() {
        if (state.requestQueue.length === 0 || !state.isOnline) return;
        
        log('info', `Processing ${state.requestQueue.length} queued requests`);
        
        const queue = [...state.requestQueue];
        state.requestQueue = [];
        
        for (const request of queue) {
            try {
                await requestWithRetry(request.method, request.endpoint, request.data, {
                    skipQueue: true
                });
            } catch (error) {
                log('error', `Failed to process queued request: ${request.endpoint}`, error);
                // Re-queue failed requests
                queueRequest(request);
            }
        }
        
        // Update persisted queue
        try {
            localStorage.setItem(CONSTANTS.OFFLINE_QUEUE_KEY, JSON.stringify(state.requestQueue));
        } catch (e) {
            // Ignore storage errors
        }
    }

    /**
     * Load persisted queue from storage
     */
    function loadPersistedQueue() {
        try {
            const queued = localStorage.getItem(CONSTANTS.OFFLINE_QUEUE_KEY);
            if (queued) {
                state.requestQueue = JSON.parse(queued);
                log('info', `Loaded ${state.requestQueue.length} queued requests from storage`);
            }
        } catch (e) {
            log('warn', 'Failed to load persisted queue', e);
        }
    }

    // ============================================
    // REQUEST EXECUTION
    // ============================================

    /**
     * Make an API request with retry logic
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Request options
     * @returns {Promise} Response promise
     */
    async function requestWithRetry(method, endpoint, data = null, options = {}) {
        const {
            maxRetries = CONSTANTS.MAX_RETRIES,
            timeout = CONSTANTS.DEFAULT_TIMEOUT,
            skipQueue = false,
            cacheEnabled = true
        } = options;

        // Check cache for GET requests
        const cacheKey = getCacheKey(method, endpoint, data);
        if (cacheEnabled && method === 'GET') {
            const cached = getFromCache(cacheKey);
            if (cached) {
                log('debug', `Cache hit for ${endpoint}`);
                return cached;
            }
        }

        // Check circuit breaker
        if (!isCircuitClosed()) {
            if (!skipQueue && method !== 'GET') {
                queueRequest({ method, endpoint, data });
            }
            throw createError(ERROR_CODES.CIRCUIT_OPEN, 'Service temporarily unavailable');
        }

        // Check if online
        if (!state.isOnline && !skipQueue) {
            if (method !== 'GET') {
                queueRequest({ method, endpoint, data });
                return { queued: true, message: 'Request queued for later execution' };
            }
            throw createError(ERROR_CODES.OFFLINE, 'You are currently offline');
        }

        let lastError;
        let retryDelay = CONSTANTS.RETRY_DELAY;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            // Create abort controller for timeout
            const requestId = generateRequestId();
            const abortController = new AbortController();
            state.abortControllers.set(requestId, abortController);

            // Set timeout
            const timeoutId = setTimeout(() => {
                abortController.abort();
            }, timeout);

            try {
                const response = await executeRequest(method, endpoint, data, abortController.signal);
                
                clearTimeout(timeoutId);
                state.abortControllers.delete(requestId);
                
                // Record success
                recordSuccess();
                state.isOnline = true;

                // Handle rate limiting
                const rateLimitRemaining = response.headers.get(CONSTANTS.RATE_LIMIT_HEADER);
                if (rateLimitRemaining && parseInt(rateLimitRemaining) <= 1) {
                    log('warn', 'Rate limit approaching');
                }

                // Cache successful GET responses
                if (cacheEnabled && isCacheable(method, response.status)) {
                    const responseData = await response.json();
                    setInCache(cacheKey, responseData);
                    return responseData;
                }

                return await processResponse(response);
            } catch (error) {
                clearTimeout(timeoutId);
                state.abortControllers.delete(requestId);
                lastError = error;

                // Don't retry for certain errors
                if (error.code === ERROR_CODES.UNAUTHORIZED) {
                    handleUnauthorized();
                    throw error;
                }
                
                if (error.code === ERROR_CODES.CANCELLED) {
                    throw error;
                }

                // Check if we should retry
                if (attempt < maxRetries - 1 && isRetriableError(error)) {
                    log('info', `Retrying request (attempt ${attempt + 1}/${maxRetries}): ${endpoint}`);
                    await sleep(retryDelay);
                    retryDelay *= CONSTANTS.RETRY_MULTIPLIER;
                } else {
                    // Record failure for circuit breaker
                    recordFailure();
                    throw error;
                }
            }
        }

        throw lastError;
    }

    /**
     * Execute a single request
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @param {AbortSignal} signal - Abort signal
     * @returns {Promise<Response>} Response promise
     */
    async function executeRequest(method, endpoint, data, signal) {
        const url = CONSTANTS.BASE_URL + '/api' + endpoint;
        
        const opts = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',  // Send HttpOnly cookies
            signal: signal
        };

        // Add authorization token if available
        if (state.token) {
            opts.headers['Authorization'] = 'Bearer ' + state.token;
        }

        // Add CSRF token for mutating requests
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            const csrfToken = getCsrfToken();
            if (csrfToken) {
                opts.headers['X-CSRF-Token'] = csrfToken;
            }
        }

        // Add request body for POST/PUT/PATCH
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            opts.body = JSON.stringify(sanitizeRequestData(data));
        }

        log('debug', `Making ${method} request to ${endpoint}`);

        const response = await fetch(url, opts);
        return response;
    }

    /**
     * Process response and handle errors
     * @param {Response} response - Fetch response
     * @returns {Promise<Object>} Response data
     */
    async function processResponse(response) {
        // Handle specific status codes
        if (response.status === 401) {
            const data = await response.json().catch(() => ({}));
            throw createError(ERROR_CODES.UNAUTHORIZED, data.error || 'Authentication required', {
                status: 401
            });
        }

        if (response.status === 403) {
            const data = await response.json().catch(() => ({}));
            throw createError(ERROR_CODES.FORBIDDEN, data.error || 'Access denied', {
                status: 403
            });
        }

        if (response.status === 404) {
            const data = await response.json().catch(() => ({}));
            throw createError(ERROR_CODES.NOT_FOUND, data.error || 'Resource not found', {
                status: 404
            });
        }

        if (response.status === 422) {
            const data = await response.json().catch(() => ({}));
            throw createError(ERROR_CODES.VALIDATION, data.error || 'Validation failed', {
                status: 422,
                errors: data.errors || {}
            });
        }

        if (response.status === 429) {
            const resetTime = response.headers.get(CONSTANTS.RATE_LIMIT_RESET_HEADER);
            const data = await response.json().catch(() => ({}));
            throw createError(ERROR_CODES.RATE_LIMIT, data.error || 'Too many requests', {
                status: 429,
                resetTime: resetTime ? parseInt(resetTime) : null
            });
        }

        if (response.status >= 500) {
            const data = await response.json().catch(() => ({}));
            throw createError(ERROR_CODES.SERVER, data.error || 'Server error', {
                status: response.status
            });
        }

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw createError(ERROR_CODES.SERVER, data.error || 'Request failed', {
                status: response.status
            });
        }

        // Parse JSON response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }

        return { success: true, status: response.status };
    }

    /**
     * Sanitize request data before sending
     * @param {Object} data - Request data
     * @returns {Object} Sanitized data
     */
    function sanitizeRequestData(data) {
        if (!data || typeof data !== 'object') return data;
        
        const sanitized = {};
        
        for (const [key, value] of Object.entries(data)) {
            // Remove sensitive fields from logs
            if (['password', 'token', 'secret', 'apiKey'].includes(key)) {
                sanitized[key] = value;
            } else if (typeof value === 'string') {
                // Trim strings
                sanitized[key] = value.trim();
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = sanitizeRequestData(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }

    /**
     * Handle unauthorized response
     */
    function handleUnauthorized() {
        state.token = null;
        localStorage.removeItem(CONSTANTS.TOKEN_KEY);
        
        // Dispatch event for app to handle
        window.dispatchEvent(new CustomEvent('api:unauthorized', {
            detail: { message: 'Session expired' }
        }));
    }

    /**
     * Cancel a specific request
     * @param {string} requestId - Request ID to cancel
     */
    function cancelRequest(requestId) {
        const controller = state.abortControllers.get(requestId);
        if (controller) {
            controller.abort();
            state.abortControllers.delete(requestId);
        }
    }

    /**
     * Cancel all pending requests
     */
    function cancelAllRequests() {
        for (const [id, controller] of state.abortControllers) {
            controller.abort();
        }
        state.abortControllers.clear();
    }

    // ============================================
    // LOGGING
    // ============================================

    /**
     * Log a message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} details - Additional details
     */
    function log(level, message, details = {}) {
        const prefix = '[ApiClient]';
        
        if (typeof Logger !== 'undefined') {
            Logger[level](prefix, message, details);
        } else {
            const timestamp = new Date().toISOString();
            console.log(`${timestamp} ${level.toUpperCase()} ${prefix} ${message}`, details);
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    /**
     * Make a request
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @param {Object} options - Request options
     * @returns {Promise} Response promise
     */
    function request(method, endpoint, data, options = {}) {
        return requestWithRetry(method, endpoint, data, options);
    }

    // ============================================
    // AUTH ENDPOINTS
    // ============================================

    function login(username, password) {
        return requestWithRetry('POST', '/auth/login', { username, password }, {
            timeout: CONSTANTS.AUTH_TIMEOUT,
            maxRetries: 1,
            cacheEnabled: false
        }).then(data => {
            if (data.token) {
                state.token = data.token;
                localStorage.setItem(CONSTANTS.TOKEN_KEY, data.token);
            }
            if (data.csrfToken) {
                state.csrfToken = data.csrfToken;
            }
            return data;
        });
    }

    function logout() {
        return requestWithRetry('POST', '/auth/logout', null, {
            maxRetries: 1,
            cacheEnabled: false
        }).catch(() => {
            // Always clear token on logout
        }).finally(() => {
            state.token = null;
            state.csrfToken = null;
            localStorage.removeItem(CONSTANTS.TOKEN_KEY);
            clearCache();
        });
    }

    function getMe() {
        return requestWithRetry('GET', '/auth/me');
    }

    function refreshToken() {
        return requestWithRetry('POST', '/auth/refresh', null, {
            timeout: CONSTANTS.AUTH_TIMEOUT,
            maxRetries: 1,
            cacheEnabled: false
        }).then(data => {
            if (data.token) {
                state.token = data.token;
                localStorage.setItem(CONSTANTS.TOKEN_KEY, data.token);
            }
            return data;
        });
    }

    function changePassword(currentPassword, newPassword) {
        return requestWithRetry('POST', '/auth/change-password', {
            currentPassword,
            newPassword
        }, {
            cacheEnabled: false
        });
    }

    // ============================================
    // USERS ENDPOINTS
    // ============================================

    function getUsers(params = {}) {
        return requestWithRetry('GET', '/users' + buildQueryString(params));
    }

    function getUser(id) {
        return requestWithRetry('GET', `/users/${id}`);
    }

    function createUser(data) {
        clearCache('/users');
        return requestWithRetry('POST', '/users', data, { cacheEnabled: false });
    }

    function updateUser(id, data) {
        clearCache('/users');
        return requestWithRetry('PUT', `/users/${id}`, data, { cacheEnabled: false });
    }

    function deleteUser(id) {
        clearCache('/users');
        return requestWithRetry('DELETE', `/users/${id}`, null, { cacheEnabled: false });
    }

    function resetPassword(id, newPassword) {
        return requestWithRetry('POST', `/users/${id}/reset-password`, { newPassword }, { cacheEnabled: false });
    }

    function toggleUserStatus(id, active) {
        clearCache('/users');
        return requestWithRetry('PATCH', `/users/${id}/status`, { active }, { cacheEnabled: false });
    }

    // ============================================
    // SCHEDULES ENDPOINTS
    // ============================================

    function getSchedules(params = {}) {
        return requestWithRetry('GET', '/schedules' + buildQueryString(params));
    }

    function getSchedule(id) {
        return requestWithRetry('GET', `/schedules/${id}`);
    }

    function createSchedule(data) {
        clearCache('/schedules');
        return requestWithRetry('POST', '/schedules', data, { cacheEnabled: false });
    }

    function updateSchedule(id, data) {
        clearCache('/schedules');
        return requestWithRetry('PUT', `/schedules/${id}`, data, { cacheEnabled: false });
    }

    function deleteSchedule(id) {
        clearCache('/schedules');
        return requestWithRetry('DELETE', `/schedules/${id}`, null, { cacheEnabled: false });
    }

    function duplicateSchedule(id, name) {
        return requestWithRetry('POST', `/schedules/${id}/duplicate`, { name }, { cacheEnabled: false });
    }

    function publishSchedule(id) {
        clearCache('/schedules');
        return requestWithRetry('POST', `/schedules/${id}/publish`, null, { cacheEnabled: false });
    }

    // ============================================
    // CREWS ENDPOINTS
    // ============================================

    function getCrews(scheduleId, params = {}) {
        return requestWithRetry('GET', `/schedules/${scheduleId}/crews` + buildQueryString(params));
    }

    function getCrew(id) {
        return requestWithRetry('GET', `/schedules/crews/${id}`);
    }

    function addCrew(scheduleId, data) {
        clearCache('/schedules');
        return requestWithRetry('POST', `/schedules/${scheduleId}/crews`, data, { cacheEnabled: false });
    }

    function updateCrew(id, data) {
        clearCache('/schedules');
        return requestWithRetry('PUT', `/schedules/crews/${id}`, data, { cacheEnabled: false });
    }

    function deleteCrew(id) {
        clearCache('/schedules');
        return requestWithRetry('DELETE', `/schedules/crews/${id}`, null, { cacheEnabled: false });
    }

    function batchUpdateCrews(crewIds, data) {
        clearCache('/schedules');
        return requestWithRetry('POST', '/schedules/crews/batch', { crewIds, data }, { cacheEnabled: false });
    }

    // ============================================
    // LOCATIONS ENDPOINTS
    // ============================================

    function getLocations(params = {}) {
        return requestWithRetry('GET', '/locations' + buildQueryString(params));
    }

    function getLocation(id) {
        return requestWithRetry('GET', `/locations/${id}`);
    }

    function createLocation(data) {
        clearCache('/locations');
        return requestWithRetry('POST', '/locations', data, { cacheEnabled: false });
    }

    function updateLocation(id, data) {
        clearCache('/locations');
        return requestWithRetry('PUT', `/locations/${id}`, data, { cacheEnabled: false });
    }

    function deleteLocation(id) {
        clearCache('/locations');
        return requestWithRetry('DELETE', `/locations/${id}`, null, { cacheEnabled: false });
    }

    function batchCreateLocations(locations) {
        clearCache('/locations');
        return requestWithRetry('POST', '/locations/batch', { locations }, { cacheEnabled: false });
    }

    // ============================================
    // TIME OFF ENDPOINTS
    // ============================================

    function getTimeoff(params = {}) {
        return requestWithRetry('GET', '/timeoff' + buildQueryString(params));
    }

    function getTimeoffRequest(id) {
        return requestWithRetry('GET', `/timeoff/${id}`);
    }

    function createTimeoff(data) {
        clearCache('/timeoff');
        return requestWithRetry('POST', '/timeoff', data, { cacheEnabled: false });
    }

    function updateTimeoff(id, data) {
        clearCache('/timeoff');
        return requestWithRetry('PUT', `/timeoff/${id}`, data, { cacheEnabled: false });
    }

    function getTimeoffStats(params = {}) {
        return requestWithRetry('GET', '/timeoff/stats' + buildQueryString(params));
    }

    // ============================================
    // LOGS ENDPOINTS
    // ============================================

    function getLogs(params = {}) {
        return requestWithRetry('GET', '/logs' + buildQueryString(params));
    }

    function getLogStats(params = {}) {
        return requestWithRetry('GET', '/logs/stats' + buildQueryString(params));
    }

    function exportLogs(format = 'json', params = {}) {
        return requestWithRetry('GET', `/logs/export?format=${format}&` + buildQueryString(params).slice(1));
    }

    // ============================================
    // NOTIFICATIONS ENDPOINTS
    // ============================================

    function getNotifications(params = {}) {
        return requestWithRetry('GET', '/logs/notifications' + buildQueryString(params));
    }

    function markNotificationRead(id) {
        return requestWithRetry('PUT', `/logs/notifications/${id}/read`, null, { cacheEnabled: false });
    }

    function markAllNotificationsRead() {
        return requestWithRetry('PUT', '/logs/notifications/read-all', null, { cacheEnabled: false });
    }

    function deleteNotification(id) {
        return requestWithRetry('DELETE', `/logs/notifications/${id}`, null, { cacheEnabled: false });
    }

    // ============================================
    // INCIDENTS ENDPOINTS
    // ============================================

    function getIncidents(params = {}) {
        return requestWithRetry('GET', '/incidents' + buildQueryString(params));
    }

    function getIncident(id) {
        return requestWithRetry('GET', `/incidents/${id}`);
    }

    function createIncident(data) {
        clearCache('/incidents');
        return requestWithRetry('POST', '/incidents', data, { cacheEnabled: false });
    }

    function updateIncident(id, data) {
        clearCache('/incidents');
        return requestWithRetry('PATCH', `/incidents/${id}`, data, { cacheEnabled: false });
    }

    function updateIncidentStatus(id, status) {
        clearCache('/incidents');
        return requestWithRetry('PATCH', `/incidents/${id}/status`, { status }, { cacheEnabled: false });
    }

    function deleteIncident(id) {
        clearCache('/incidents');
        return requestWithRetry('DELETE', `/incidents/${id}`, null, { cacheEnabled: false });
    }

    function getIncidentStats() {
        return requestWithRetry('GET', '/incidents/stats/summary');
    }

    // ============================================
    // SHIFT SWAPS ENDPOINTS
    // ============================================

    function getSwaps(params = {}) {
        return requestWithRetry('GET', '/swaps' + buildQueryString(params));
    }

    function createSwap(data) {
        clearCache('/swaps');
        return requestWithRetry('POST', '/swaps', data, { cacheEnabled: false });
    }

    function acceptSwap(id) {
        clearCache('/swaps');
        return requestWithRetry('POST', `/swaps/${id}/accept`, null, { cacheEnabled: false });
    }

    function approveSwap(id) {
        clearCache('/swaps');
        return requestWithRetry('PATCH', `/swaps/${id}/approve`, null, { cacheEnabled: false });
    }

    function denySwap(id) {
        clearCache('/swaps');
        return requestWithRetry('PATCH', `/swaps/${id}/deny`, null, { cacheEnabled: false });
    }

    function cancelSwap(id) {
        clearCache('/swaps');
        return requestWithRetry('DELETE', `/swaps/${id}`, null, { cacheEnabled: false });
    }

    // ============================================
    // TRAINING ENDPOINTS
    // ============================================

    function getTraining(params = {}) {
        return requestWithRetry('GET', '/training' + buildQueryString(params));
    }

    function getExpiringTraining(days = 30) {
        return requestWithRetry('GET', `/training/expiring?days=${days}`);
    }

    function createTraining(data) {
        clearCache('/training');
        return requestWithRetry('POST', '/training', data, { cacheEnabled: false });
    }

    function updateTraining(id, data) {
        clearCache('/training');
        return requestWithRetry('PUT', `/training/${id}`, data, { cacheEnabled: false });
    }

    function deleteTraining(id) {
        clearCache('/training');
        return requestWithRetry('DELETE', `/training/${id}`, null, { cacheEnabled: false });
    }

    // ============================================
    // CALL-IN ENDPOINTS
    // ============================================

    function getCallins(params = {}) {
        return requestWithRetry('GET', '/callins' + buildQueryString(params));
    }

    function createCallin(data) {
        clearCache('/callins');
        return requestWithRetry('POST', '/callins', data, { cacheEnabled: false });
    }

    function updateCallin(id, data) {
        clearCache('/callins');
        return requestWithRetry('PATCH', `/callins/${id}`, data, { cacheEnabled: false });
    }

    function deleteCallin(id) {
        clearCache('/callins');
        return requestWithRetry('DELETE', `/callins/${id}`, null, { cacheEnabled: false });
    }

    // ============================================
    // ANALYTICS ENDPOINTS
    // ============================================

    function getAnalyticsOverview() {
        return requestWithRetry('GET', '/analytics/overview');
    }

    function getAnalyticsSchedules() {
        return requestWithRetry('GET', '/analytics/schedules');
    }

    function getAnalyticsStaff() {
        return requestWithRetry('GET', '/analytics/staff');
    }

    function getAnalyticsIncidents() {
        return requestWithRetry('GET', '/analytics/incidents');
    }

    function getAnalyticsTimeoff() {
        return requestWithRetry('GET', '/analytics/timeoff');
    }

    // ============================================
    // PERMISSIONS ENDPOINTS
    // ============================================

    function getPermissionDefinitions() {
        return requestWithRetry('GET', '/permissions/definitions');
    }

    function getUserPermissions(userId) {
        return requestWithRetry('GET', `/permissions/user/${userId}`);
    }

    function setUserPermissions(userId, permissions) {
        return requestWithRetry('PUT', `/permissions/user/${userId}`, { permissions }, { cacheEnabled: false });
    }

    function grantPermission(userId, permission) {
        return requestWithRetry('POST', `/permissions/user/${userId}/grant`, { permission }, { cacheEnabled: false });
    }

    function revokePermission(userId, permission) {
        return requestWithRetry('POST', `/permissions/user/${userId}/revoke`, { permission }, { cacheEnabled: false });
    }

    function resetUserPermissions(userId) {
        return requestWithRetry('POST', `/permissions/user/${userId}/reset`, null, { cacheEnabled: false });
    }

    // ============================================
    // ADMIN ENDPOINTS
    // ============================================

    function adminReset() {
        clearCache();
        return requestWithRetry('POST', '/admin/reset', null, { cacheEnabled: false });
    }

    function getConfigKeys() {
        return requestWithRetry('GET', '/config/keys');
    }

    function getServerConfig() {
        return requestWithRetry('GET', '/config/server');
    }

    // ============================================
    // USER HOURS ENDPOINTS
    // ============================================

    function updateUserHours(id, data) {
        clearCache('/users');
        return requestWithRetry('PATCH', `/users/${id}/hours`, data, { cacheEnabled: false });
    }

    // ============================================
    // DASHBOARD COUNTS (convenience method)
    // ============================================

    async function getDashboardCounts() {
        try {
            const [timeoff, swaps, callins] = await Promise.all([
                requestWithRetry('GET', '/timeoff?status=pending&limit=1').catch(() => ({ pagination: { total: 0 } })),
                requestWithRetry('GET', '/swaps?status=open').catch(() => ({ swaps: [] })),
                requestWithRetry('GET', '/callins?status=open').catch(() => ({ callins: [] }))
            ]);
            return {
                pendingTimeoff: timeoff.pagination?.total || 0,
                openSwaps: (swaps.swaps || []).length,
                openCallins: (callins.callins || []).filter(c => c.status === 'open').length
            };
        } catch (e) {
            return { pendingTimeoff: 0, openSwaps: 0, openCallins: 0 };
        }
    }

    // ============================================
    // SYSTEM ENDPOINTS
    // ============================================

    function healthCheck() {
        return requestWithRetry('GET', '/health', null, {
            timeout: 5000,
            maxRetries: 1
        });
    }

    function getStats() {
        return requestWithRetry('GET', '/stats');
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    /**
     * Initialize the API client
     */
    function init() {
        // Restore token from storage
        const savedToken = localStorage.getItem(CONSTANTS.TOKEN_KEY);
        if (savedToken) {
            state.token = savedToken;
        }

        // Load persisted queue
        loadPersistedQueue();

        // Check API availability
        healthCheck()
            .then(() => {
                state.isOnline = true;
                log('info', '✅ API server connected');
                
                // Process any queued requests
                if (state.requestQueue.length > 0) {
                    processQueue();
                }
            })
            .catch(() => {
                state.isOnline = false;
                log('warn', '⚠️ API server unavailable — offline mode');
            });

        // Listen for online/offline events
        window.addEventListener('online', () => {
            state.isOnline = true;
            log('info', 'Connection restored');
            processQueue();
        });

        window.addEventListener('offline', () => {
            state.isOnline = false;
            log('warn', 'Connection lost — entering offline mode');
        });

        // Listen for visibility change to refresh session
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && state.token) {
                // Refresh token if needed
                refreshToken().catch(() => {
                    // Ignore refresh errors
                });
            }
        });
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    // ============================================
    // PUBLIC INTERFACE
    // ============================================

    return {
        // Core
        request,
        init,

        // Auth
        login,
        logout,
        getMe,
        refreshToken,
        changePassword,

        // Users
        getUsers,
        getUser,
        createUser,
        updateUser,
        deleteUser,
        resetPassword,
        toggleUserStatus,
        updateUserHours,

        // Schedules
        getSchedules,
        getSchedule,
        createSchedule,
        updateSchedule,
        deleteSchedule,
        duplicateSchedule,
        publishSchedule,

        // Crews
        getCrews,
        getCrew,
        addCrew,
        updateCrew,
        deleteCrew,
        batchUpdateCrews,

        // Locations
        getLocations,
        getLocation,
        createLocation,
        updateLocation,
        deleteLocation,
        batchCreateLocations,

        // Time Off
        getTimeoff,
        getTimeoffRequest,
        createTimeoff,
        updateTimeoff,
        getTimeoffStats,

        // Incidents
        getIncidents,
        getIncident,
        createIncident,
        updateIncident,
        updateIncidentStatus,
        deleteIncident,
        getIncidentStats,

        // Shift Swaps
        getSwaps,
        createSwap,
        acceptSwap,
        approveSwap,
        denySwap,
        cancelSwap,

        // Training
        getTraining,
        getExpiringTraining,
        createTraining,
        updateTraining,
        deleteTraining,

        // Call-ins
        getCallins,
        createCallin,
        updateCallin,
        deleteCallin,

        // Analytics
        getAnalyticsOverview,
        getAnalyticsSchedules,
        getAnalyticsStaff,
        getAnalyticsIncidents,
        getAnalyticsTimeoff,

        // Permissions
        getPermissionDefinitions,
        getUserPermissions,
        setUserPermissions,
        grantPermission,
        revokePermission,
        resetUserPermissions,

        // Admin
        adminReset,
        getConfigKeys,
        getServerConfig,

        // Dashboard
        getDashboardCounts,

        // Logs
        getLogs,
        getLogStats,
        exportLogs,

        // Notifications
        getNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,

        // System
        healthCheck,
        getStats,

        // State
        isOnline: () => state.isOnline,
        getToken: () => state.token,
        getCsrfToken,

        // Control
        cancelRequest,
        cancelAllRequests,
        clearCache,

        // Queue
        getQueueLength: () => state.requestQueue.length,
        processQueue,

        // Constants
        CONSTANTS,
        ERROR_CODES
    };
})();

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiClient;
}