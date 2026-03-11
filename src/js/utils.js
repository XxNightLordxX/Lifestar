/**
 * Utility Functions Module
 * Centralized utility functions for the Lifestar Ambulance Scheduling System
 * @module utils
 */

'use strict';

// ========================================
// DOM UTILITIES
// ========================================

/**
 * Safely get a DOM element by ID with null protection
 * @param {string} id - Element ID
 * @param {boolean} warn - Whether to warn if not found (default: true)
 * @returns {HTMLElement|null}
 */
function safeGetElement(id, warn = true) {
    const el = document.getElementById(id);
    if (!el && warn) {
        Logger.warn(`[DOM] Element not found: ${id}`);
    }
    return el;
}

/**
 * Safely get multiple DOM elements by selector
 * @param {string} selector - CSS selector
 * @returns {NodeList}
 */
function safeQueryAll(selector) {
    return document.querySelectorAll(selector) || [];
}

/**
 * Safely get a single DOM element by selector
 * @param {string} selector - CSS selector
 * @returns {HTMLElement|null}
 */
function safeQueryOne(selector) {
    return document.querySelector(selector);
}

/**
 * Safely set element text content
 * @param {string|HTMLElement} element - Element ID or element
 * @param {string} text - Text content
 */
function safeSetText(element, text) {
    const el = typeof element === 'string' ? safeGetElement(element, false) : element;
    if (el) el.textContent = text;
}

/**
 * Safely set element HTML content (sanitized)
 * @param {string|HTMLElement} element - Element ID or element
 * @param {string} html - HTML content (will be sanitized)
 */
function safeSetHTML(element, html) {
    const el = typeof element === 'string' ? safeGetElement(element, false) : element;
    if (el) el.textContent = typeof sanitizeHTML === 'function' ? sanitizeHTML(html) : html;
}

/**
 * Toggle element visibility
 * @param {string|HTMLElement} element - Element ID or element
 * @param {boolean} show - Show or hide
 */
function toggleVisibility(element, show) {
    const el = typeof element === 'string' ? safeGetElement(element, false) : element;
    if (el) {
        el.classList.toggle('hidden', !show);
        el.style.display = show ? '' : 'none';
    }
}

// ========================================
// DATA UTILITIES
// ========================================

/**
 * Safely parse JSON with fallback
 * @param {string} json - JSON string
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*}
 */
function safeJSONParse(json, fallback = null) {
    try {
        return json ? JSON.parse(json) : fallback;
    } catch (e) {
        Logger.warn('[JSON] Parse error:', e.message);
        return fallback;
    }
}

/**
 * Safely stringify to JSON
 * @param {*} data - Data to stringify
 * @param {string} fallback - Fallback string if stringify fails
 * @returns {string}
 */
function safeJSONStringify(data, fallback = '{}') {
    try {
        return JSON.stringify(data);
    } catch (e) {
        Logger.warn('[JSON] Stringify error:', e.message);
        return fallback;
    }
}

/**
 * Safe localStorage getter
 * @param {string} key - Storage key
 * @param {*} fallback - Fallback value
 * @returns {*}
 */
function getStorageItem(key, fallback = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? safeJSONParse(item, fallback) : fallback;
    } catch (e) {
        Logger.warn('[Storage] Get error:', e.message);
        return fallback;
    }
}

/**
 * Safe localStorage setter
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {boolean} Success status
 */
function setStorageItem(key, value) {
    try {
        localStorage.setItem(key, safeJSONStringify(value));
        return true;
    } catch (e) {
        Logger.error('[Storage] Set error:', e.message);
        return false;
    }
}

/**
 * Remove item from localStorage
 * @param {string} key - Storage key
 */
function removeStorageItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        Logger.warn('[Storage] Remove error:', e.message);
    }
}

// ========================================
// VALIDATION UTILITIES
// ========================================

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Check if value is a valid email
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Check if value is a valid phone number
 * @param {string} phone - Phone to validate
 * @returns {boolean}
 */
function isValidPhone(phone) {
    const phoneRegex = /^[\d\s\-() +]{10,}$/;
    return phoneRegex.test(phone);
}

/**
 * Check if value is a valid date string
 * @param {string} date - Date string to validate
 * @returns {boolean}
 */
function isValidDate(date) {
    const d = new Date(date);
    return !isNaN(d.getTime());
}

/**
 * Validate required fields in an object
 * @param {Object} obj - Object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @returns {{valid: boolean, missing: string[]}}
 */
function validateRequired(obj, requiredFields) {
    const missing = requiredFields.filter(field => isEmpty(obj[field]));
    return {
        valid: missing.length === 0,
        missing
    };
}

// ========================================
// STRING UTILITIES
// ========================================

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string}
 */
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string}
 */
function truncate(str, maxLength, suffix = '...') {
    if (!str || str.length <= maxLength) return str || '';
    return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Format phone number
 * @param {string} phone - Phone number
 * @returns {string}
 */
function formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
}

// ========================================
// DATE UTILITIES
// ========================================

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Format type: 'short', 'long', 'iso'
 * @returns {string}
 */
function formatDate(date, format = 'short') {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    
    switch (format) {
        case 'iso':
            return d.toISOString().split('T')[0];
        case 'long':
            return d.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        case 'short':
        default:
            return d.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
    }
}

/**
 * Get relative time string (e.g., "2 hours ago")
 * @param {Date|string} date - Date to compare
 * @returns {string}
 */
function getRelativeTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    return formatDate(d);
}

// ========================================
// ARRAY UTILITIES
// ========================================

/**
 * Remove duplicates from array
 * @param {Array} arr - Array with potential duplicates
 * @param {string} [key] - Key to compare for objects
 * @returns {Array}
 */
function uniqueArray(arr, key = null) {
    if (!Array.isArray(arr)) return [];
    if (key) {
        const seen = new Set();
        return arr.filter(item => {
            const val = item[key];
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
        });
    }
    return [...new Set(arr)];
}

/**
 * Group array by key
 * @param {Array} arr - Array to group
 * @param {string} key - Key to group by
 * @returns {Object}
 */
function groupBy(arr, key) {
    if (!Array.isArray(arr)) return {};
    return arr.reduce((groups, item) => {
        const val = item[key];
        (groups[val] = groups[val] || []).push(item);
        return groups;
    }, {});
}

/**
 * Sort array by key
 * @param {Array} arr - Array to sort
 * @param {string} key - Key to sort by
 * @param {boolean} ascending - Sort order (default: true)
 * @returns {Array}
 */
function sortBy(arr, key, ascending = true) {
    if (!Array.isArray(arr)) return [];
    return [...arr].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
    });
}

// ========================================
// ERROR HANDLING
// ========================================

/**
 * Safe function execution wrapper
 * @param {Function} fn - Function to execute
 * @param {*} fallback - Fallback value on error
 * @param {string} context - Error context for logging
 * @returns {*}
 */
function safeExecute(fn, fallback = null, context = '') {
    try {
        return fn();
    } catch (e) {
        Logger.error(`[Error${context ? ' - ' + context : ''}]`, e.message);
        return fallback;
    }
}

/**
 * Async safe function execution wrapper
 * @param {Function} fn - Async function to execute
 * @param {*} fallback - Fallback value on error
 * @param {string} context - Error context for logging
 * @returns {Promise<*>}
 */
async function safeAsync(fn, fallback = null, context = '') {
    try {
        return await fn();
    } catch (e) {
        Logger.error(`[Async Error${context ? ' - ' + context : ''}]`, e.message);
        return fallback;
    }
}

// ========================================
// DEBOUNCE & THROTTLE
// ========================================

/**
 * Debounce function execution
 * @param {Function} fn - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function}
 */
function debounce(fn, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Throttle function execution
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function}
 */
function throttle(fn, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ========================================
// EXPORTS
// ========================================

const Utils = {
    // DOM
    safeGetElement,
    safeQueryAll,
    safeQueryOne,
    safeSetText,
    safeSetHTML,
    toggleVisibility,
    
    // Data
    safeJSONParse,
    safeJSONStringify,
    getStorageItem,
    setStorageItem,
    removeStorageItem,
    
    // Validation
    isEmpty,
    isValidEmail,
    isValidPhone,
    isValidDate,
    validateRequired,
    
    // String
    capitalize,
    truncate,
    formatPhone,
    
    // Date
    formatDate,
    getRelativeTime,
    
    // Array
    uniqueArray,
    groupBy,
    sortBy,
    
    // Error handling
    safeExecute,
    safeAsync,
    
    // Performance
    debounce,
    throttle
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}