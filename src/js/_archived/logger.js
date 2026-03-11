/**
 * Logger Utility - Production-ready logging with configurable levels
 * 
 * Usage:
 *   Logger.debug('Debug message');  // Only in development
 *   Logger.info('Info message');    // Always logged
 *   Logger.warn('Warning message'); // Always logged
 *   Logger.error('Error message');  // Always logged
 */

const Logger = (function() {
    // Configuration
    const config = {
        enabled: true,
        level: 'debug', // Can be 'debug', 'info', 'warn', or 'error'
        prefix: '[Lifestar]'
    };
    
    // Log levels
    const levels = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };
    
    // Check if message should be logged
    function shouldLog(level) {
        return config.enabled && levels[level] >= levels[config.level];
    }
    
    // Format log message
    function format(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const prefix = `${config.prefix} [${level.toUpperCase()}]`;
        return `${timestamp} ${prefix} ${message}`;
    }
    
    // Log methods
    return {
        /**
         * Set log level
         * @param {string} level - 'debug', 'info', 'warn', or 'error'
         */
        setLevel: function(level) {
            if (levels[level] !== undefined) {
                config.level = level;
            }
        },
        
        /**
         * Enable or disable logging
         * @param {boolean} enabled
         */
        setEnabled: function(enabled) {
            config.enabled = enabled;
        },
        
        /**
         * Debug level logging (development only)
         * @param {string} message
         * @param {...any} args
         */
        debug: function(message, ...args) {
            if (shouldLog('debug')) {
                Logger.info(format('debug', message), ...args);
            }
        },
        
        /**
         * Info level logging
         * @param {string} message
         * @param {...any} args
         */
        info: function(message, ...args) {
            if (shouldLog('info')) {
                Logger.info(format('info', message), ...args);
            }
        },
        
        /**
         * Warning level logging
         * @param {string} message
         * @param {...any} args
         */
        warn: function(message, ...args) {
            if (shouldLog('warn')) {
                Logger.warn(format('warn', message), ...args);
            }
        },
        
        /**
         * Error level logging
         * @param {string} message
         * @param {...any} args
         */
        error: function(message, ...args) {
            if (shouldLog('error')) {
                Logger.error(format('error', message), ...args);
            }
        },
        
        /**
         * Group related logs
         * @param {string} label
         */
        group: function(label) {
            if (shouldLog('debug')) {
                console.group(label);
            }
        },
        
        /**
         * End log group
         */
        groupEnd: function() {
            if (shouldLog('debug')) {
                console.groupEnd();
            }
        },
        
        /**
         * Time a operation
         * @param {string} label
         */
        time: function(label) {
            if (shouldLog('debug')) {
                console.time(label);
            }
        },
        
        /**
         * End timing
         * @param {string} label
         */
        timeEnd: function(label) {
            if (shouldLog('debug')) {
                console.timeEnd(label);
            }
        }
    };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logger;
}