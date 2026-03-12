/**
 * Core Utilities Module - Consolidated from multiple files
 * Central module for all shared utility functions
 * @module core-utils
 * @version 2.0.0
 */

'use strict';

// ========================================
// LOGGER (Consolidated from logger.js)
// ========================================

const Logger = (function() {
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };

    let currentLevel = LOG_LEVELS.INFO;
    let logHistory = [];
    const MAX_LOG_HISTORY = 1000;

    function formatTimestamp() {
        return new Date().toISOString();
    }

    function addToHistory(level, message, ...args) {
        logHistory.push({
            timestamp: formatTimestamp(),
            level,
            message,
            args
        });
        if (logHistory.length > MAX_LOG_HISTORY) {
            logHistory.shift();
        }
    }

    return {
        LEVELS: LOG_LEVELS,
        
        setLevel(level) {
            if (typeof level === 'string') {
                currentLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
            } else {
                currentLevel = level;
            }
        },

        debug(message, ...args) {
            if (currentLevel <= LOG_LEVELS.DEBUG) {
                console.debug(`[${formatTimestamp()}] [DEBUG]`, message, ...args);
                addToHistory('DEBUG', message, ...args);
            }
        },

        info(message, ...args) {
            if (currentLevel <= LOG_LEVELS.INFO) {
                console.info(`[${formatTimestamp()}] [INFO]`, message, ...args);
                addToHistory('INFO', message, ...args);
            }
        },

        warn(message, ...args) {
            if (currentLevel <= LOG_LEVELS.WARN) {
                console.warn(`[${formatTimestamp()}] [WARN]`, message, ...args);
                addToHistory('WARN', message, ...args);
            }
        },

        error(message, ...args) {
            if (currentLevel <= LOG_LEVELS.ERROR) {
                console.error(`[${formatTimestamp()}] [ERROR]`, message, ...args);
                addToHistory('ERROR', message, ...args);
            }
        },

        getHistory() {
            return [...logHistory];
        },

        clearHistory() {
            logHistory = [];
        },

        exportLogs() {
            return JSON.stringify(logHistory, null, 2);
        }
    };
})();

// ========================================
// DOM UTILITIES (Consolidated from utils.js)
// ========================================

const DOMUtils = {
    /**
     * Safely get a DOM element by ID
     */
    getById(id, warn = true) {
        const el = document.getElementById(id);
        if (!el && warn) {
            Logger.warn(`[DOM] Element not found: ${id}`);
        }
        return el;
    },

    /**
     * Query all elements by selector
     */
    queryAll(selector, parent = document) {
        return parent.querySelectorAll(selector) || [];
    },

    /**
     * Query single element by selector
     */
    queryOne(selector, parent = document) {
        return parent.querySelector(selector);
    },

    /**
     * Create element with optional attributes and children
     */
    create(tag, attributes = {}, children = []) {
        const el = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([k, v]) => el.dataset[k] = v);
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        });

        children.forEach(child => {
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                el.appendChild(child);
            }
        });

        return el;
    },

    /**
     * Set element text content safely
     */
    setText(element, text) {
        const el = typeof element === 'string' ? this.getById(element, false) : element;
        if (el) el.textContent = text;
    },

    /**
     * Set element HTML content (sanitized)
     */
    setHTML(element, html) {
        const el = typeof element === 'string' ? this.getById(element, false) : element;
        if (el) {
            el.textContent = typeof sanitizeHTML === 'function' ? sanitizeHTML(html) : html;
        }
    },

    /**
     * Toggle element visibility
     */
    toggle(element, show) {
        const el = typeof element === 'string' ? this.getById(element, false) : element;
        if (el) {
            el.classList.toggle('hidden', !show);
            el.style.display = show ? '' : 'none';
        }
    },

    /**
     * Add event listener with cleanup tracking
     */
    on(element, event, handler, options = {}) {
        const el = typeof element === 'string' ? this.getById(element, false) : element;
        if (el) {
            el.addEventListener(event, handler, options);
            return () => el.removeEventListener(event, handler, options);
        }
        return () => {};
    },

    /**
     * Delegate events to parent
     */
    delegate(parent, selector, event, handler) {
        return this.on(parent, event, (e) => {
            const target = e.target.closest(selector);
            if (target && parent.contains(target)) {
                handler.call(target, e, target);
            }
        });
    }
};

// ========================================
// STORAGE UTILITIES (Consolidated)
// ========================================

const StorageUtils = {
    /**
     * Get item from localStorage
     */
    get(key, fallback = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : fallback;
        } catch (e) {
            Logger.warn(`[Storage] Get error for key "${key}":`, e.message);
            return fallback;
        }
    },

    /**
     * Set item in localStorage
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            Logger.error(`[Storage] Set error for key "${key}":`, e.message);
            return false;
        }
    },

    /**
     * Remove item from localStorage
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            Logger.error(`[Storage] Remove error for key "${key}":`, e.message);
            return false;
        }
    },

    /**
     * Clear all localStorage
     */
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (e) {
            Logger.error('[Storage] Clear error:', e.message);
            return false;
        }
    },

    /**
     * Get storage usage info
     */
    getUsage() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return {
            used: total,
            usedKB: (total / 1024).toFixed(2),
            usedMB: (total / (1024 * 1024)).toFixed(4)
        };
    }
};

// ========================================
// DATE/TIME UTILITIES (Consolidated)
// ========================================

const DateUtils = {
    /**
     * Format date with various formats
     */
    format(date, format = 'short') {
        const d = date instanceof Date ? date : new Date(date);
        
        if (isNaN(d.getTime())) {
            return 'Invalid Date';
        }

        const formats = {
            short: { month: 'short', day: 'numeric', year: 'numeric' },
            long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
            iso: null,
            time: { hour: '2-digit', minute: '2-digit' },
            datetime: { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' },
            military: { hour: '2-digit', minute: '2-digit', hour12: false }
        };

        if (format === 'iso') {
            return d.toISOString();
        }

        return d.toLocaleDateString('en-US', formats[format] || formats.short);
    },

    /**
     * Format time
     */
    formatTime(date, military = false) {
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: !military
        });
    },

    /**
     * Get relative time string
     */
    relative(date) {
        const d = date instanceof Date ? date : new Date(date);
        const now = new Date();
        const diff = now - d;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        
        return this.format(d, 'short');
    },

    /**
     * Get start/end of day
     */
    startOfDay(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    },

    endOfDay(date) {
        const d = new Date(date);
        d.setHours(23, 59, 59, 999);
        return d;
    },

    /**
     * Check if date is today
     */
    isToday(date) {
        const d = new Date(date);
        const today = new Date();
        return d.toDateString() === today.toDateString();
    },

    /**
     * Get days in month
     */
    daysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    },

    /**
     * Get array of dates between two dates
     */
    getDatesBetween(start, end) {
        const dates = [];
        const current = new Date(start);
        const endDate = new Date(end);
        
        while (current <= endDate) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        
        return dates;
    }
};

// ========================================
// STRING UTILITIES (Consolidated)
// ========================================

const StringUtils = {
    /**
     * Capitalize first letter
     */
    capitalize(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
    },

    /**
     * Convert to title case
     */
    titleCase(str) {
        return str.replace(/\w\S*/g, txt => this.capitalize(txt));
    },

    /**
     * Truncate string with ellipsis
     */
    truncate(str, length = 100, ellipsis = '...') {
        if (!str || str.length <= length) return str;
        return str.substring(0, length - ellipsis.length) + ellipsis;
    },

    /**
     * Generate random ID
     */
    randomId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 9);
        return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
    },

    /**
     * Slugify string
     */
    slugify(str) {
        return str
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return str.replace(/[&<>"']/g, char => escapeMap[char]);
    },

    /**
     * Format phone number
     */
    formatPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return phone;
    }
};

// ========================================
// NUMBER UTILITIES (Consolidated)
// ========================================

const NumberUtils = {
    /**
     * Format number with commas
     */
    format(num, decimals = 0) {
        return num.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    },

    /**
     * Format as currency
     */
    currency(num, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency
        }).format(num);
    },

    /**
     * Format as percentage
     */
    percent(num, decimals = 1) {
        return `${(num * 100).toFixed(decimals)}%`;
    },

    /**
     * Clamp number between min and max
     */
    clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    },

    /**
     * Round to decimal places
     */
    round(num, decimals = 0) {
        const factor = Math.pow(10, decimals);
        return Math.round(num * factor) / factor;
    },

    /**
     * Generate random number in range
     */
    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};

// ========================================
// ARRAY UTILITIES (Consolidated)
// ========================================

const ArrayUtils = {
    /**
     * Remove duplicates from array
     */
    unique(arr) {
        return [...new Set(arr)];
    },

    /**
     * Group array by key
     */
    groupBy(arr, key) {
        return arr.reduce((groups, item) => {
            const group = typeof key === 'function' ? key(item) : item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    },

    /**
     * Sort array by key
     */
    sortBy(arr, key, desc = false) {
        return [...arr].sort((a, b) => {
            const aVal = typeof key === 'function' ? key(a) : a[key];
            const bVal = typeof key === 'function' ? key(b) : b[key];
            
            if (aVal < bVal) return desc ? 1 : -1;
            if (aVal > bVal) return desc ? -1 : 1;
            return 0;
        });
    },

    /**
     * Chunk array into smaller arrays
     */
    chunk(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    },

    /**
     * Flatten nested arrays
     */
    flatten(arr) {
        return arr.reduce((flat, item) => 
            Array.isArray(item) ? flat.concat(this.flatten(item)) : flat.concat(item)
        , []);
    },

    /**
     * Find item by key value
     */
    findBy(arr, key, value) {
        return arr.find(item => item[key] === value);
    },

    /**
     * Remove item by key value
     */
    removeBy(arr, key, value) {
        const index = arr.findIndex(item => item[key] === value);
        if (index > -1) {
            return [...arr.slice(0, index), ...arr.slice(index + 1)];
        }
        return arr;
    }
};

// ========================================
// VALIDATION UTILITIES (Consolidated)
// ========================================

const ValidationUtils = {
    /**
     * Validate email
     */
    isEmail(str) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
    },

    /**
     * Validate phone number
     */
    isPhone(str) {
        return /^\+?[\d\s-()]{10,}$/.test(str);
    },

    /**
     * Validate URL
     */
    isUrl(str) {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Check if string is empty
     */
    isEmpty(str) {
        return !str || str.trim().length === 0;
    },

    /**
     * Check if value is numeric
     */
    isNumeric(val) {
        return !isNaN(parseFloat(val)) && isFinite(val);
    },

    /**
     * Validate object has required fields
     */
    hasRequired(obj, fields) {
        return fields.every(field => {
            const value = obj[field];
            return value !== undefined && value !== null && value !== '';
        });
    },

    /**
     * Validate schedule data
     */
    validateSchedule(schedule) {
        const errors = [];
        
        if (!schedule) {
            errors.push('Schedule is required');
            return { isValid: false, errors };
        }
        
        if (!schedule.name?.trim()) {
            errors.push('Schedule name is required');
        }
        
        if (!schedule.month || schedule.month < 1 || schedule.month > 12) {
            errors.push('Valid month (1-12) is required');
        }
        
        if (!schedule.year || schedule.year < 2020 || schedule.year > 2100) {
            errors.push('Valid year (2020-2100) is required');
        }
        
        return { isValid: errors.length === 0, errors };
    },

    /**
     * Validate user data
     */
    validateUser(user) {
        const errors = [];
        
        if (!user) {
            errors.push('User data is required');
            return { isValid: false, errors };
        }
        
        if (!user.username?.trim()) {
            errors.push('Username is required');
        }
        
        if (!user.role || !['paramedic', 'emt', 'boss', 'admin', 'super_admin'].includes(user.role)) {
            errors.push('Valid role is required');
        }
        
        return { isValid: errors.length === 0, errors };
    }
};

// ========================================
// SANITIZATION UTILITIES
// ========================================

const SanitizeUtils = {
    /**
     * Sanitize HTML - remove dangerous tags
     */
    html(str) {
        if (!str) return '';
        
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },

    /**
     * Sanitize for SQL (basic)
     */
    sql(str) {
        if (!str) return '';
        return str.replace(/[';\\-]/g, '');
    },

    /**
     * Sanitize object recursively
     */
    object(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return typeof obj === 'string' ? this.html(obj) : obj;
        }
        
        const sanitized = Array.isArray(obj) ? [] : {};
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                sanitized[key] = this.object(obj[key]);
            }
        }
        
        return sanitized;
    }
};

// Global function aliases for backward compatibility
const safeGetElement = (id, warn = true) => DOMUtils.getById(id, warn);
const safeQueryAll = (selector) => DOMUtils.queryAll(selector);
const safeQueryOne = (selector) => DOMUtils.queryOne(selector);
const safeSetText = (el, text) => DOMUtils.setText(el, text);
const safeSetHTML = (el, html) => DOMUtils.setHTML(el, html);
const toggleVisibility = (el, show) => DOMUtils.toggle(el, show);
const safeJSONParse = (json, fallback = null) => {
    if (json === null || json === undefined) return fallback;
    // If passed a non-string (already parsed), return as-is
    if (typeof json !== 'string') return json || fallback;
    try {
        return JSON.parse(json);
    } catch (e) {
        return fallback;
    }
};
const safeJSONStringify = (data, fallback = '{}') => JSON.stringify(data);
const getStorageItem = (key, fallback = null) => StorageUtils.get(key, fallback);
const setStorageItem = (key, value) => StorageUtils.set(key, value);
const removeStorageItem = (key) => StorageUtils.remove(key);
const formatDate = (date, format = 'short') => DateUtils.format(date, format);
const formatTime = (date, military = false) => DateUtils.formatTime(date, military);
const sanitizeHTML = (str) => SanitizeUtils.html(str);

// Make core utilities available globally for backward compatibility
window.Logger = Logger;
window.DOMUtils = DOMUtils;
window.StorageUtils = StorageUtils;
window.DateUtils = DateUtils;
window.StringUtils = StringUtils;
window.NumberUtils = NumberUtils;
window.ArrayUtils = ArrayUtils;
window.SanitizeUtils = SanitizeUtils;

// Global function aliases for backward compatibility
window.safeGetElement = safeGetElement;
window.safeQueryAll = safeQueryAll;
window.safeQueryOne = safeQueryOne;
window.safeSetText = safeSetText;
window.safeSetHTML = safeSetHTML;
window.toggleVisibility = toggleVisibility;
window.safeJSONParse = safeJSONParse;
window.safeJSONStringify = safeJSONStringify;
window.getStorageItem = getStorageItem;
window.setStorageItem = setStorageItem;
window.removeStorageItem = removeStorageItem;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.sanitizeHTML = sanitizeHTML;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Logger,
        DOMUtils,
        StorageUtils,
        DateUtils,
        StringUtils,
        NumberUtils,
        ArrayUtils,
        ValidationUtils,
        SanitizeUtils,
        safeGetElement,
        safeQueryAll,
        safeQueryOne,
        safeSetText,
        safeSetHTML,
        toggleVisibility,
        safeJSONParse,
        safeJSONStringify,
        getStorageItem,
        setStorageItem,
        removeStorageItem,
        formatDate,
        formatTime,
        sanitizeHTML
    };
}