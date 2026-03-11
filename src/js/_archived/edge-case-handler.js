/**
 * Edge Case Handler for Lifestar Ambulance Scheduling System
 * Comprehensive handling of edge cases, null values, and unusual inputs
 */

(function() {
    'use strict';

    const EdgeCaseHandler = {
        /**
         * Initialize edge case handler
         */
        init: function() {
            this.patchGlobalFunctions();
            Logger.debug('✅ Edge Case Handler initialized');
        },

        /**
         * Safe getter for nested object properties
         */
        safeGet: function(obj, path, defaultValue = null) {
            if (obj === null || obj === undefined) {
                return defaultValue;
            }
            
            const keys = path.split('.');
            let current = obj;
            
            for (const key of keys) {
                if (current === null || current === undefined) {
                    return defaultValue;
                }
                current = current[key];
            }
            
            return current !== undefined ? current : defaultValue;
        },

        /**
         * Safe number parsing with validation
         */
        safeNumber: function(value, defaultValue = 0, min = null, max = null) {
            const num = parseFloat(value);
            
            if (isNaN(num) || !isFinite(num)) {
                return defaultValue;
            }
            
            let result = num;
            
            if (min !== null && result < min) {
                result = min;
            }
            if (max !== null && result > max) {
                result = max;
            }
            
            return result;
        },

        /**
         * Safe integer parsing with validation
         */
        safeInteger: function(value, defaultValue = 0, min = null, max = null) {
            const num = parseInt(value, 10);
            
            if (isNaN(num) || !isFinite(num)) {
                return defaultValue;
            }
            
            let result = num;
            
            if (min !== null && result < min) {
                result = min;
            }
            if (max !== null && result > max) {
                result = max;
            }
            
            return result;
        },

        /**
         * Safe string handling
         */
        safeString: function(value, defaultValue = '', maxLength = null) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            let result = String(value);
            
            if (maxLength !== null && result.length > maxLength) {
                result = result.substring(0, maxLength);
            }
            
            return result;
        },

        /**
         * Safe array handling
         */
        safeArray: function(value, defaultValue = []) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            if (Array.isArray(value)) {
                return value;
            }
            
            // Try to convert to array
            if (typeof value === 'object' && value.length !== undefined) {
                return Array.from(value);
            }
            
            return defaultValue;
        },

        /**
         * Safe object handling
         */
        safeObject: function(value, defaultValue = {}) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            if (typeof value === 'object' && !Array.isArray(value)) {
                return value;
            }
            
            return defaultValue;
        },

        /**
         * Safe date parsing
         */
        safeDate: function(value, defaultValue = null) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            // Already a Date object
            if (value instanceof Date) {
                return isNaN(value.getTime()) ? defaultValue : value;
            }
            
            // Parse string or number
            const date = new Date(value);
            return isNaN(date.getTime()) ? defaultValue : date;
        },

        /**
         * Safe JSON parsing
         */
        safeJSON: function(value, defaultValue = null) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            try {
                return JSON.parse(value);
            } catch (e) {
                return defaultValue;
            }
        },

        /**
         * Safe function execution
         */
        safeExecute: function(fn, defaultValue = null, ...args) {
            if (typeof fn !== 'function') {
                return defaultValue;
            }
            
            try {
                return fn(...args);
            } catch (error) {
                Logger.error('Safe execution error:', error);
                return defaultValue;
            }
        },

        /**
         * Handle timezone conversions
         */
        timezone: {
            /**
             * Get user's timezone
             */
            getUserTimezone: function() {
                try {
                    return Intl.DateTimeFormat().resolvedOptions().timeZone;
                } catch (e) {
                    return 'UTC';
                }
            },

            /**
             * Convert date to user's timezone
             */
            toUserTimezone: function(date, timezone = null) {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return null;
                
                const tz = timezone || this.getUserTimezone();
                
                try {
                    return new Date(d.toLocaleString('en-US', { timeZone: tz }));
                } catch (e) {
                    return d;
                }
            },

            /**
             * Format date with timezone
             */
            formatWithTimezone: function(date, format = 'short') {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return '';
                
                try {
                    const options = format === 'long'; 
                        ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }
                        : { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                    
                    return d.toLocaleString(undefined, options);
                } catch (e) {
                    return d.toString();
                }
            },

            /**
             * Get start of day in timezone
             */
            startOfDay: function(date, timezone = null) {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return null;
                
                const tz = timezone || this.getUserTimezone();
                
                try {
                    const str = d.toLocaleDateString('en-US', { timeZone: tz });
                    return new Date(str + ' 00:00:00');
                } catch (e) {
                    d.setHours(0, 0, 0, 0);
                    return d;
                }
            },

            /**
             * Get end of day in timezone
             */
            endOfDay: function(date, timezone = null) {
                const d = EdgeCaseHandler.safeDate(date);
                if (!d) return null;
                
                const tz = timezone || this.getUserTimezone();
                
                try {
                    const str = d.toLocaleDateString('en-US', { timeZone: tz });
                    return new Date(str + ' 23:59:59');
                } catch (e) {
                    d.setHours(23, 59, 59, 999);
                    return d;
                }
            }
        },

        /**
         * Handle empty data states
         */
        emptyState: {
            /**
             * Check if value is empty
             */
            isEmpty: function(value) {
                if (value === null || value === undefined) {
                    return true;
                }
                
                if (typeof value === 'string') {
                    return value.trim().length === 0;
                }
                
                if (Array.isArray(value)) {
                    return value.length === 0;
                }
                
                if (typeof value === 'object') {
                    return Object.keys(value).length === 0;
                }
                
                return false;
            },

            /**
             * Get default message for empty state
             */
            getEmptyMessage: function(type) {
                const messages = {
                    schedules: 'No schedules found. Create your first schedule to get started.',
                    staff: 'No staff members found. Add staff to begin scheduling.',
                    crews: 'No crews configured. Create crew templates for easier scheduling.',
                    shifts: 'No shifts assigned. Assign shifts to crew members.',
                    requests: 'No pending requests.',
                    history: 'No history available.',
                    notifications: 'No notifications.',
                    search: 'No results found. Try adjusting your search criteria.',
                    data: 'No data available.',
                    default: 'No items found.'
                };
                
                return messages[type] || messages.default;
            },

            /**
             * Render empty state UI
             */
            renderEmptyState: function(container, type, actionCallback = null) {
                if (!container) return;
                
                const message = this.getEmptyMessage(type);
                let html = `;
                    <div class="empty-state" role="status" aria-live="polite">
                        <div class="empty-state-icon">📋</div>
                        <p class="empty-state-message">${message}</p>
                `;
                
                if (actionCallback) {
                    html += `<button class="btn btn-primary empty-state-action" onclick="${actionCallback}">Add New</button>`;
                }
                
                html += `</div>`;
                
                container.textContent = html;
            }
        },

        /**
         * Special character handling
         */
        specialChars: {
            /**
             * Escape HTML special characters
             */
            escapeHtml: function(str) {
                if (str === null || str === undefined) {
                    return '';
                }
                
                const htmlEntities = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;'
                };
                
                return String(str).replace(/[&<>"']/g, char => htmlEntities[char]);
            },

            /**
             * Unescape HTML entities
             */
            unescapeHtml: function(str) {
                if (str === null || str === undefined) {
                    return '';
                }
                
                const htmlEntities = {
                    '&amp;': '&',
                    '&lt;': '<',
                    '&gt;': '>',
                    '&quot;': '"',
                    '&#39;': "'"
                };
                
                return String(str).replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, entity => htmlEntities[entity]);
            },

            /**
             * Sanitize for URL
             */
            sanitizeForUrl: function(str) {
                if (str === null || str === undefined) {
                    return '';
                }
                
                return String(str);
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
            },

            /**
             * Sanitize filename
             */
            sanitizeFilename: function(str) {
                if (str === null || str === undefined) {
                    return 'file';
                }
                
                return String(str);
                    .replace(/[<>:"/\\|?*]/g, '_')
                    .replace(/\s+/g, '_')
                    .substring(0, 255);
            },

            /**
             * Check for emoji
             */
            hasEmoji: function(str) {
                if (str === null || str === undefined) {
                    return false;
                }
                
                const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
                return emojiRegex.test(str);
            },

            /**
             * Remove emoji
             */
            removeEmoji: function(str) {
                if (str === null || str === undefined) {
                    return '';
                }
                
                const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
                return String(str).replace(emojiRegex, '');
            }
        },

        /**
         * Unicode handling
         */
        unicode: {
            /**
             * Normalize unicode string
             */
            normalize: function(str, form = 'NFC') {
                if (str === null || str === undefined) {
                    return '';
                }
                
                try {
                    return String(str).normalize(form);
                } catch (e) {
                    return String(str);
                }
            },

            /**
             * Check if string contains unicode
             */
            hasUnicode: function(str) {
                if (str === null || str === undefined) {
                    return false;
                }
                
                for (let i = 0; i < str.length; i++) {
                    if (str.charCodeAt(i) > 127) {
                        return true;
                    }
                }
                return false;
            },

            /**
             * Get string length accounting for unicode
             */
            length: function(str) {
                if (str === null || str === undefined) {
                    return 0;
                }
                
                return [...String(str)].length;
            }
        },

        /**
         * Patch global functions for safety
         */
        patchGlobalFunctions: function() {
            // Safe JSON.parse wrapper
            const originalJSONParse = JSON.parse;
            JSON.parseSafe = function(text, defaultValue = null) {
                try {
                    return originalJSONParse(text);
                } catch (e) {
                    return defaultValue;
                }
            };

            // Safe parseInt/Float wrappers
            const originalParseInt = parseInt;
            const originalParseFloat = parseFloat;
            
            parseInt.safe = function(value, radix = 10, defaultValue = 0) {
                const result = originalParseInt(value, radix);
                return isNaN(result) ? defaultValue : result;
            };
            
            parseFloat.safe = function(value, defaultValue = 0) {
                const result = originalParseFloat(value);
                return isNaN(result) ? defaultValue : result;
            };
        },

        /**
         * Validate and fix common data issues
         */
        validateData: function(data, schema) {
            if (!data || typeof data !== 'object') {
                return { valid: false, data: null, errors: ['Invalid data object'] };
            }
            
            const errors = [];
            const fixed = { ...data };
            
            for (const [key, rules] of Object.entries(schema)) {
                const value = fixed[key];
                
                // Required check
                if (rules.required && (value === null || value === undefined || value === '')) {
                    if (rules.default !== undefined) {
                        fixed[key] = rules.default;
                    } else {
                        errors.push(`${key} is required`);
                    }
                    continue;
                }
                
                // Type check
                if (rules.type && value !== null && value !== undefined) {
                    const actualType = Array.isArray(value) ? 'array' : typeof value;
                    if (actualType !== rules.type) {
                        // Try to convert
                        switch (rules.type) {
                            case 'string':
                                fixed[key] = String(value);
                                break;
                            case 'number':
                                const num = parseFloat(value);
                                if (!isNaN(num)) {
                                    fixed[key] = num;
                                } else {
                                    errors.push(`${key} must be a number`);
                                }
                                break;
                            case 'boolean':
                                fixed[key] = Boolean(value);
                                break;
                            case 'array':
                                if (typeof value === 'object') {
                                    fixed[key] = Array.isArray(value) ? value : [value];
                                } else {
                                    errors.push(`${key} must be an array`);
                                }
                                break;
                        }
                    }
                }
                
                // Min/Max check for numbers
                if (rules.type === 'number' && typeof fixed[key] === 'number') {
                    if (rules.min !== undefined && fixed[key] < rules.min) {
                        fixed[key] = rules.min;
                    }
                    if (rules.max !== undefined && fixed[key] > rules.max) {
                        fixed[key] = rules.max;
                    }
                }
                
                // MinLength/MaxLength check for strings
                if (rules.type === 'string' && typeof fixed[key] === 'string') {
                    if (rules.minLength !== undefined && fixed[key].length < rules.minLength) {
                        errors.push(`${key} must be at least ${rules.minLength} characters`);
                    }
                    if (rules.maxLength !== undefined && fixed[key].length > rules.maxLength) {
                        fixed[key] = fixed[key].substring(0, rules.maxLength);
                    }
                }
            }
            
            return {
                valid: errors.length === 0,
                data: fixed,
                errors: errors
            };
        }
    };

    // Initialize
    EdgeCaseHandler.init();

    // Export for module use
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EdgeCaseHandler;
    }

    // Make globally available
    window.EdgeCaseHandler = EdgeCaseHandler;
    window.safeGet = EdgeCaseHandler.safeGet;
    window.safeNumber = EdgeCaseHandler.safeNumber;
    window.safeString = EdgeCaseHandler.safeString;
    window.safeArray = EdgeCaseHandler.safeArray;
    window.safeExecute = EdgeCaseHandler.safeExecute;
})();