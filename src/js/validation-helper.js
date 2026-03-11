
/**
 * Input validation helper
 */
const Validator = {
    /**
     * Validate email
     */
    isEmail: function(email) {
        return /^[^s@]+@[^s@]+.[^s@]+$/.test(email);
    },
    
    /**
     * Validate phone number
     */
    isPhone: function(phone) {
        return /^[\d\-+()]{10,}$/.test(phone);
    },
    
    /**
     * Validate string length
     */
    isLength: function(str, min, max) {
        return str.length >= min && str.length <= max;
    },
    
    /**
     * Sanitize string
     */
    sanitize: function(str) {
        if (typeof str !== 'string') return str;
        return str.trim().replace(/[<>]/g, '');
    },
    
    /**
     * Validate required fields
     */
    required: function(value) {
        return value !== null && value !== undefined && value !== '';
    }
};
