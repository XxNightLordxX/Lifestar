/**
 * Code Quality Utilities
 * Helper functions for cleaner code
 */

const CodeQualityUtils = {
    /**
     * Safe async wrapper with error handling
     */
    asyncWrapper: function(fn) {
        return async function(...args) {
            try {
                return await fn(...args);
            } catch (error) {
                Logger.error('Async error:', error);
                throw error;
            }
        };
    },
    
    /**
     * Debounce function calls
     */
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    /**
     * Throttle function calls
     */
    throttle: function(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    /**
     * Deep clone an object
     */
    deepClone: function(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
        
        const cloned = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    },
    
    /**
     * Check if value is empty
     */
    isEmpty: function(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    },
    
    /**
     * Generate unique ID
     */
    generateId: function(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    /**
     * Format date safely
     */
    formatDate: function(date, format = 'short') {
        try {
            const d = date instanceof Date ? date : new Date(date);
            if (isNaN(d.getTime())) return 'Invalid Date';
            
            if (format === 'short') {
                return d.toLocaleDateString();
            } else if (format === 'long') {
                return d.toLocaleString();
            } else if (format === 'iso') {
                return d.toISOString();
            }
            return d.toLocaleDateString();
        } catch (e) {
            return 'Invalid Date';
        }
    },
    
    /**
     * Safe JSON parse
     */
    safeJsonParse: function(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return defaultValue;
        }
    },
    
    /**
     * Safe JSON stringify
     */
    safeJsonStringify: function(obj, defaultValue = '{}') {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            return defaultValue;
        }
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CodeQualityUtils;
}
