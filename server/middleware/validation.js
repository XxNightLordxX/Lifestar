/**
 * Input Validation Middleware
 * Comprehensive validation and sanitization for request inputs
 * 
 * Features:
 * - Schema-based validation
 * - Type coercion and checking
 * - Pattern matching
 * - Custom validators
 * - XSS prevention
 * - SQL injection detection
 * 
 * @module middleware/validation
 */

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // Common validation patterns
    PATTERNS: {
        username: /^[a-zA-Z0-9_]{3,30}$/,
        password: /^.{8,128}$/,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phone: /^[\d\s\-\(\)\+]{10,20}$/,
        name: /^[a-zA-Z\s\-']{2,100}$/,
        code: /^[A-Z0-9]{2,10}$/,
        id: /^\d+$/,
        date: /^\d{4}-\d{2}-\d{2}$/,
        time: /^\d{2}:\d{2}$/,
        zip: /^\d{5}(-\d{4})?$/
    },
    
    // SQL injection patterns — only flag multi-keyword sequences that look
    // like real injection attempts.  Single words such as "delete" or "select"
    // are common in ordinary English and must NOT be blocked.  The app uses
    // parameterised queries everywhere, so these are a defence-in-depth layer.
    SQL_INJECTION_PATTERNS: [
        /\b(UNION)\s+(ALL\s+)?SELECT\b/i,
        /\b(INSERT)\s+INTO\b/i,
        /\b(DELETE)\s+FROM\b/i,
        /\b(DROP)\s+(TABLE|DATABASE|INDEX|VIEW)\b/i,
        /\b(ALTER)\s+TABLE\b/i,
        /\b(TRUNCATE)\s+TABLE\b/i,
        /\b(UPDATE)\s+\w+\s+SET\b/i,
        /\bEXEC(UTE)?\s*\(/i,
        /\bSELECT\b.+\bFROM\b/i,
        /\b(CREATE)\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE)\b/i,
        /(\/\*[\s\S]*?\*\/)/,
        /('|")\s*(OR|AND)\s+\d+\s*=\s*\d+/i,
        /('|")\s*(OR|AND)\s*('|")/i
    ],
    
    // XSS patterns
    XSS_PATTERNS: [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /<object/i,
        /<embed/i,
        /<img[^>]+onerror/i
    ],
    
    // HTTP Status codes
    HTTP_STATUS: {
        BAD_REQUEST: 400
    }
};

// ============================================
// ERROR CLASS
// ============================================

/**
 * Validation error class
 */
class ValidationError extends Error {
    constructor(errors, statusCode = 400) {
        super('Validation Error');
        this.name = 'ValidationError';
        this.errors = errors;
        this.statusCode = statusCode;
    }
    
    toJSON() {
        return {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: this.errors
        };
    }
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate a single field
 * @param {string} field - Field name
 * @param {*} value - Field value
 * @param {Object} rules - Validation rules
 * @returns {string|null} Error message or null
 */
function validateField(field, value, rules) {
    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
        return `${field} is required`;
    }
    
    // Skip further validation if optional and empty
    if (!rules.required && (value === undefined || value === null || value === '')) {
        return null;
    }
    
    // Type checks
    if (rules.type) {
        const typeError = validateType(field, value, rules.type, rules);
        if (typeError) return typeError;
    }
    
    // String length checks
    if (typeof value === 'string') {
        if (rules.minLength !== undefined && value.length < rules.minLength) {
            return `${field} must be at least ${rules.minLength} characters`;
        }
        
        if (rules.maxLength !== undefined && value.length > rules.maxLength) {
            return `${field} must be at most ${rules.maxLength} characters`;
        }
    }
    
    // Pattern check
    if (rules.pattern && !rules.pattern.test(String(value))) {
        return rules.patternMessage || `${field} format is invalid`;
    }
    
    // Enum check
    if (rules.enum && !rules.enum.includes(value)) {
        return `${field} must be one of: ${rules.enum.join(', ')}`;
    }
    
    // Range check for numbers
    if (rules.type === 'number' || rules.type === 'integer') {
        const num = Number(value);
        if (rules.min !== undefined && num < rules.min) {
            return `${field} must be at least ${rules.min}`;
        }
        if (rules.max !== undefined && num > rules.max) {
            return `${field} must be at most ${rules.max}`;
        }
    }
    
    // Custom validation
    if (rules.custom && typeof rules.custom === 'function') {
        const customError = rules.custom(value);
        if (customError) return customError;
    }
    
    return null;
}

/**
 * Validate field type
 * @param {string} field - Field name
 * @param {*} value - Field value
 * @param {string} type - Expected type
 * @param {Object} rules - Additional rules
 * @returns {string|null} Error message or null
 */
function validateType(field, value, type, rules = {}) {
    switch (type) {
        case 'string':
            if (typeof value !== 'string') {
                return `${field} must be a string`;
            }
            break;
            
        case 'number':
            if (isNaN(Number(value))) {
                return `${field} must be a number`;
            }
            break;
            
        case 'integer':
            if (!Number.isInteger(Number(value))) {
                return `${field} must be an integer`;
            }
            break;
            
        case 'boolean':
            if (typeof value !== 'boolean' && value !== 'true' && value !== 'false' && value !== 1 && value !== 0) {
                return `${field} must be a boolean`;
            }
            break;
            
        case 'array':
            if (!Array.isArray(value)) {
                return `${field} must be an array`;
            }
            if (rules.minItems !== undefined && value.length < rules.minItems) {
                return `${field} must have at least ${rules.minItems} items`;
            }
            if (rules.maxItems !== undefined && value.length > rules.maxItems) {
                return `${field} must have at most ${rules.maxItems} items`;
            }
            break;
            
        case 'object':
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                return `${field} must be an object`;
            }
            break;
            
        case 'email':
            if (!CONSTANTS.PATTERNS.email.test(String(value))) {
                return `${field} must be a valid email address`;
            }
            break;
            
        case 'date': {
            if (!CONSTANTS.PATTERNS.date.test(String(value))) {
                return `${field} must be a valid date (YYYY-MM-DD)`;
            }
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                return `${field} must be a valid date`;
            }
            break;
        }

        case 'uuid': {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidPattern.test(String(value))) {
                return `${field} must be a valid UUID`;
            }
            break;
        }
    }
    
    return null;
}

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

/**
 * Sanitize string input (remove potentially harmful characters)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, 'data-blocked=')
        .replace(/[<>]/g, match => match === '<' ? '&lt;' : '&gt;')
        .trim();
}

/**
 * Deep sanitize object recursively
 * @param {*} obj - Object to sanitize
 * @param {number} depth - Current recursion depth
 * @returns {*} Sanitized object
 */
function sanitizeObject(obj, depth = 0) {
    // Prevent infinite recursion
    if (depth > 10) {
        return obj;
    }
    
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, depth + 1));
    }
    
    if (typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            // Sanitize key
            const sanitizedKey = sanitizeString(key);
            // Sanitize value
            sanitized[sanitizedKey] = sanitizeObject(value, depth + 1);
        }
        return sanitized;
    }
    
    return obj;
}

/**
 * Detect potential SQL injection
 * @param {string} value - Value to check
 * @returns {boolean} True if suspicious
 */
function detectSqlInjection(value) {
    if (typeof value !== 'string') return false;
    
    return CONSTANTS.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Detect potential XSS
 * @param {string} value - Value to check
 * @returns {boolean} True if suspicious
 */
function detectXss(value) {
    if (typeof value !== 'string') return false;
    
    return CONSTANTS.XSS_PATTERNS.some(pattern => pattern.test(value));
}

// ============================================
// MIDDLEWARE FACTORIES
// ============================================

/**
 * Validate request body against schema
 * @param {Object} schema - Validation schema
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function validateBody(schema, options = {}) {
    return (req, res, next) => {
        const errors = [];
        const sanitized = {};
        
        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];
            
            // Validate
            const error = validateField(field, value, rules);
            if (error) {
                errors.push({ field, message: error });
            }
            
            // Sanitize if string and no error
            if (!error && value !== undefined && value !== null) {
                sanitized[field] = typeof value === 'string' ? sanitizeString(value) : value;
            }
        }
        
        // Check for extra fields if strict mode
        if (options.strict) {
            for (const field of Object.keys(req.body)) {
                if (!schema[field]) {
                    errors.push({ field, message: `Unknown field: ${field}` });
                }
            }
        }
        
        if (errors.length > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors
            });
        }
        
        // Replace body with sanitized values
        req.body = { ...req.body, ...sanitized };
        
        next();
    };
}

/**
 * Validate request params against schema
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
function validateParams(schema) {
    return (req, res, next) => {
        const errors = [];
        
        for (const [field, rules] of Object.entries(schema)) {
            const error = validateField(field, req.params[field], rules);
            if (error) {
                errors.push({ field, message: error });
            }
        }
        
        if (errors.length > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors
            });
        }
        
        next();
    };
}

/**
 * Validate request query against schema
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
function validateQuery(schema) {
    return (req, res, next) => {
        const errors = [];
        
        for (const [field, rules] of Object.entries(schema)) {
            const error = validateField(field, req.query[field], rules);
            if (error) {
                errors.push({ field, message: error });
            }
        }
        
        if (errors.length > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors
            });
        }
        
        next();
    };
}

/**
 * Sanitize request body middleware
 */
function sanitizeBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    next();
}

/**
 * Sanitize request query middleware
 */
function sanitizeQuery(req, res, next) {
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
    }
    next();
}

/**
 * Check for SQL injection attempts
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function checkSqlInjection(options = {}) {
    return (req, res, next) => {
        const checkValue = (value, path) => {
            if (typeof value === 'string' && detectSqlInjection(value)) {
                if (options.log !== false) {
                    console.log(`[SECURITY] Potential SQL injection detected at ${path}:`, {
                        ip: req.ip,
                        value: value.substring(0, 100)
                    });
                }
                return true;
            }
            return false;
        };
        
        const checkObject = (obj, path) => {
            if (!obj || typeof obj !== 'object') return false;
            
            for (const [key, value] of Object.entries(obj)) {
                const currentPath = `${path}.${key}`;
                if (checkValue(value, currentPath)) return true;
                if (typeof value === 'object' && checkObject(value, currentPath)) return true;
            }
            return false;
        };
        
        if (checkObject(req.body, 'body') ||
            checkObject(req.query, 'query') ||
            checkObject(req.params, 'params')) {
            return res.status(400).json({
                error: 'Invalid input detected',
                code: 'INVALID_INPUT'
            });
        }
        
        next();
    };
}

/**
 * Check for XSS attempts
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function checkXss(options = {}) {
    return (req, res, next) => {
        const checkValue = (value, path) => {
            if (typeof value === 'string' && detectXss(value)) {
                if (options.log !== false) {
                    console.log(`[SECURITY] Potential XSS detected at ${path}:`, {
                        ip: req.ip,
                        value: value.substring(0, 100)
                    });
                }
                return true;
            }
            return false;
        };
        
        const checkObject = (obj, path) => {
            if (!obj || typeof obj !== 'object') return false;
            
            for (const [key, value] of Object.entries(obj)) {
                const currentPath = `${path}.${key}`;
                if (checkValue(value, currentPath)) return true;
                if (typeof value === 'object' && checkObject(value, currentPath)) return true;
            }
            return false;
        };
        
        if (checkObject(req.body, 'body') ||
            checkObject(req.query, 'query')) {
            return res.status(400).json({
                error: 'Invalid input detected',
                code: 'INVALID_INPUT'
            });
        }
        
        next();
    };
}

// ============================================
// COMMON VALIDATION SCHEMAS
// ============================================

const schemas = {
    login: {
        username: { required: true, pattern: CONSTANTS.PATTERNS.username, patternMessage: 'Username must be 3-30 alphanumeric characters' },
        password: { required: true, minLength: 1, maxLength: 128 }  // No minimum for login — just needs to be non-empty
    },
    
    register: {
        username: { required: true, pattern: CONSTANTS.PATTERNS.username, patternMessage: 'Username must be 3-30 alphanumeric characters' },
        password: { required: true, minLength: 8, maxLength: 128 },
        fullName: { required: true, pattern: CONSTANTS.PATTERNS.name, patternMessage: 'Name must be 2-100 letters, spaces, hyphens, or apostrophes' },
        role: { required: true, enum: ['super', 'boss', 'paramedic', 'emt'] },
        phone: { required: false, pattern: CONSTANTS.PATTERNS.phone, patternMessage: 'Invalid phone number format' }
    },
    
    userUpdate: {
        username: { required: false, pattern: CONSTANTS.PATTERNS.username },
        fullName: { required: false, pattern: CONSTANTS.PATTERNS.name },
        role: { required: false, enum: ['super', 'boss', 'paramedic', 'emt'] },
        phone: { required: false, pattern: CONSTANTS.PATTERNS.phone }
    },
    
    location: {
        name: { required: true, minLength: 2, maxLength: 100 },
        code: { required: true, pattern: CONSTANTS.PATTERNS.code, patternMessage: 'Code must be 2-10 uppercase alphanumeric characters' },
        address: { required: false, maxLength: 200 },
        city: { required: false, maxLength: 100 },
        state: { required: false, maxLength: 50 },
        zip: { required: false, pattern: CONSTANTS.PATTERNS.zip, patternMessage: 'Invalid ZIP code format' },
        phone: { required: false, pattern: CONSTANTS.PATTERNS.phone }
    },
    
    schedule: {
        name: { required: true, minLength: 2, maxLength: 100 },
        month: { required: false, type: 'integer', min: 1, max: 12 },
        year: { required: false, type: 'integer', min: 2020, max: 2100 },
        description: { required: false, maxLength: 500 }
    },
    
    timeoff: {
        startDate: { required: true, type: 'date' },
        endDate: { required: true, type: 'date' },
        reason: { required: false, maxLength: 500 }
    },
    
    id: {
        id: { required: true, pattern: CONSTANTS.PATTERNS.id, patternMessage: 'ID must be a positive integer' }
    },
    
    pagination: {
        page: { required: false, type: 'integer', min: 1 },
        limit: { required: false, type: 'integer', min: 1, max: 100 }
    }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Classes
    ValidationError,
    
    // Validation functions
    validateField,
    validateType,
    validateBody,
    validateParams,
    validateQuery,
    
    // Sanitization functions
    sanitizeString,
    sanitizeObject,
    sanitizeBody,
    sanitizeQuery,
    
    // Security checks
    checkSqlInjection,
    checkXss,
    detectSqlInjection,
    detectXss,
    
    // Common schemas
    schemas,
    patterns: CONSTANTS.PATTERNS,
    
    // Constants
    CONSTANTS
};