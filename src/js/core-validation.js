/**
 * Core Validation Module - Consolidated from multiple files
 * Central module for all validation, sanitization, and data integrity functions
 * @module core-validation
 * @version 2.0.0
 */

'use strict';

// ========================================
// VALIDATION UTILITIES
// ========================================

const ValidationUtils = {
    // Common regex patterns
    patterns: {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phone: /^[\d\-+()]{10,}$/,
        alphanumeric: /^[a-zA-Z0-9]+$/,
        username: /^[a-zA-Z0-9_]{3,30}$/,
        password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
        date: /^\d{4}-\d{2}-\d{2}$/,
        time: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
        zip: /^\d{5}(-\d{4})?$/
    },

    /**
     * Validate email address
     * @param {string} email - Email to validate
     * @returns {boolean}
     */
    isEmail(email) {
        return typeof email === 'string' && this.patterns.email.test(email.trim());
    },

    /**
     * Validate phone number
     * @param {string} phone - Phone to validate
     * @returns {boolean}
     */
    isPhone(phone) {
        return typeof phone === 'string' && this.patterns.phone.test(phone.replace(/\s/g, ''));
    },

    /**
     * Validate string length
     * @param {string} str - String to check
     * @param {number} min - Minimum length
     * @param {number} max - Maximum length (optional)
     * @returns {boolean}
     */
    isLength(str, min, max = Infinity) {
        if (typeof str !== 'string') return false;
        const len = str.trim().length;
        return len >= min && len <= max;
    },

    /**
     * Check if value is not empty
     * @param {any} value - Value to check
     * @returns {boolean}
     */
    isRequired(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return Object.keys(value).length > 0;
        return true;
    },

    /**
     * Validate numeric range
     * @param {number} value - Value to check
     * @param {number} min - Minimum
     * @param {number} max - Maximum
     * @returns {boolean}
     */
    isInRange(value, min, max) {
        const num = Number(value);
        return !isNaN(num) && num >= min && num <= max;
    },

    /**
     * Validate date string
     * @param {string} dateStr - Date string to validate
     * @returns {boolean}
     */
    isDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return false;
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
    },

    /**
     * Validate time string (HH:MM format)
     * @param {string} timeStr - Time string to validate
     * @returns {boolean}
     */
    isTime(timeStr) {
        return typeof timeStr === 'string' && this.patterns.time.test(timeStr);
    },

    /**
     * Validate username
     * @param {string} username - Username to validate
     * @returns {boolean}
     */
    isUsername(username) {
        return typeof username === 'string' && this.patterns.username.test(username);
    },

    /**
     * Validate password strength
     * @param {string} password - Password to validate
     * @returns {Object} Result with valid and message
     */
    isStrongPassword(password) {
        if (!password || typeof password !== 'string') {
            return { valid: false, message: 'Password is required' };
        }
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters' };
        }
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain lowercase letter' };
        }
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain uppercase letter' };
        }
        if (!/\d/.test(password)) {
            return { valid: false, message: 'Password must contain a number' };
        }
        return { valid: true, message: 'Password is strong' };
    },

    /**
     * Sanitize string input
     * @param {string} str - String to sanitize
     * @returns {string}
     */
    sanitize(str) {
        if (typeof str !== 'string') return '';
        return str.trim()
            .replace(/[<>]/g, '') // Remove potential HTML
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '');
    },

    /**
     * Sanitize HTML content
     * @param {string} html - HTML to sanitize
     * @returns {string}
     */
    sanitizeHTML(html) {
        if (typeof html !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }
};

// ========================================
// SCHEMA VALIDATOR
// ========================================

const SchemaValidator = {
    /**
     * Validate schedule data structure
     * @param {Object} schedule - Schedule object to validate
     * @returns {Object} Validation result with isValid and errors
     */
    validateSchedule(schedule) {
        const errors = [];

        if (!schedule) {
            errors.push('Schedule is required');
            return { isValid: false, errors };
        }

        if (!schedule.name || schedule.name.trim() === '') {
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
     * Validate employee data structure
     * @param {Object} employee - Employee object to validate
     * @returns {Object} Validation result with isValid and errors
     */
    validateEmployee(employee) {
        const errors = [];
        const validRoles = ['paramedic', 'emt', 'boss', 'admin', 'dispatcher', 'super_admin'];
        const validCerts = ['ALS', 'BLS', 'NREMT', ''];

        if (!employee) {
            errors.push('Employee data is required');
            return { isValid: false, errors };
        }

        if (!employee.name || employee.name.trim() === '') {
            errors.push('Employee name is required');
        }

        if (!employee.role || !validRoles.includes(employee.role)) {
            errors.push('Valid role is required: ' + validRoles.join(', '));
        }

        if (employee.certification && !validCerts.includes(employee.certification)) {
            errors.push('Valid certification (ALS/BLS/NREMT) required');
        }

        if (employee.email && !ValidationUtils.isEmail(employee.email)) {
            errors.push('Invalid email format');
        }

        if (employee.phone && !ValidationUtils.isPhone(employee.phone)) {
            errors.push('Invalid phone format');
        }

        return { isValid: errors.length === 0, errors };
    },

    /**
     * Validate shift data structure
     * @param {Object} shift - Shift object to validate
     * @returns {Object} Validation result with isValid and errors
     */
    validateShift(shift) {
        const errors = [];
        const validTypes = ['day', 'night', 'weekend', 'holiday', 'on_call'];

        if (!shift) {
            errors.push('Shift data is required');
            return { isValid: false, errors };
        }

        if (!shift.date) {
            errors.push('Shift date is required');
        } else if (!ValidationUtils.isDate(shift.date)) {
            errors.push('Invalid date format');
        }

        if (!shift.type || !validTypes.includes(shift.type)) {
            errors.push('Valid shift type is required: ' + validTypes.join(', '));
        }

        if (shift.startTime && !ValidationUtils.isTime(shift.startTime)) {
            errors.push('Invalid start time format (use HH:MM)');
        }

        if (shift.endTime && !ValidationUtils.isTime(shift.endTime)) {
            errors.push('Invalid end time format (use HH:MM)');
        }

        return { isValid: errors.length === 0, errors };
    },

    /**
     * Validate crew data structure
     * @param {Object} crew - Crew object to validate
     * @returns {Object} Validation result with isValid and errors
     */
    validateCrew(crew) {
        const errors = [];
        const validTypes = ['ALS', 'BLS'];

        if (!crew) {
            errors.push('Crew data is required');
            return { isValid: false, errors };
        }

        if (!crew.name || crew.name.trim() === '') {
            errors.push('Crew name is required');
        }

        if (!crew.type || !validTypes.includes(crew.type)) {
            errors.push('Valid crew type (ALS/BLS) is required');
        }

        return { isValid: errors.length === 0, errors };
    },

    /**
     * Validate time-off request
     * @param {Object} request - Time-off request object
     * @returns {Object} Validation result with isValid and errors
     */
    validateTimeOff(request) {
        const errors = [];
        const validTypes = ['vacation', 'sick', 'personal', 'bereavement', 'other'];

        if (!request) {
            errors.push('Request data is required');
            return { isValid: false, errors };
        }

        if (!request.type || !validTypes.includes(request.type)) {
            errors.push('Valid request type is required');
        }

        if (!request.startDate) {
            errors.push('Start date is required');
        }

        if (!request.endDate) {
            errors.push('End date is required');
        }

        if (request.startDate && request.endDate) {
            const start = new Date(request.startDate);
            const end = new Date(request.endDate);
            if (end < start) {
                errors.push('End date cannot be before start date');
            }
        }

        return { isValid: errors.length === 0, errors };
    }
};

// ========================================
// TIME VALIDATION
// ========================================

const TimeValidation = {
    months: [
        'January', 'February', 'March', 'April',
        'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'
    ],

    getCurrentDate() {
        return new Date();
    },

    getCurrentYear() {
        return new Date().getFullYear();
    },

    getCurrentMonth() {
        return new Date().getMonth();
    },

    getMonthName(monthIndex) {
        return this.months[monthIndex] || '';
    },

    getMonthIndex(monthName) {
        return this.months.findIndex(m =>
            m.toLowerCase() === monthName.toLowerCase()
        );
    },

    /**
     * Check if a given month/year is in the past
     */
    isPastMonth(monthName, year) {
        const monthIndex = this.getMonthIndex(monthName);
        const yearNum = parseInt(year);
        const currentYear = this.getCurrentYear();
        const currentMonth = this.getCurrentMonth();

        if (yearNum < currentYear) return true;
        if (yearNum === currentYear && monthIndex < currentMonth) return true;
        return false;
    },

    /**
     * Check if a given month/year is in the future
     */
    isFutureMonth(monthName, year) {
        const monthIndex = this.getMonthIndex(monthName);
        const yearNum = parseInt(year);
        const currentYear = this.getCurrentYear();
        const currentMonth = this.getCurrentMonth();

        if (yearNum > currentYear) return true;
        if (yearNum === currentYear && monthIndex > currentMonth) return true;
        return false;
    },

    /**
     * Check if a given month/year is current
     */
    isCurrentMonth(monthName, year) {
        const monthIndex = this.getMonthIndex(monthName);
        const yearNum = parseInt(year);
        return yearNum === this.getCurrentYear() && monthIndex === this.getCurrentMonth();
    },

    /**
     * Validate schedule creation time
     */
    validateScheduleCreation(monthName, year) {
        const result = {
            valid: false,
            isPast: this.isPastMonth(monthName, year),
            isCurrent: this.isCurrentMonth(monthName, year),
            isFuture: this.isFutureMonth(monthName, year),
            message: '',
            currentMonth: this.getMonthName(this.getCurrentMonth()),
            currentYear: this.getCurrentYear()
        };

        if (result.isPast) {
            result.message = `Cannot create schedules for past months. Current: ${result.currentMonth} ${result.currentYear}`;
        } else {
            result.valid = true;
            result.message = result.isCurrent ? 'Creating schedule for current month' : 'Creating schedule for future month';
        }

        return result;
    },

    /**
     * Calculate shift hours
     */
    calculateShiftHours(startTime, endTime) {
        if (!startTime || !endTime) return 0;
        
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        let hours = endH - startH;
        let minutes = endM - startM;

        if (minutes < 0) {
            hours--;
            minutes += 60;
        }

        if (hours < 0) {
            hours += 24; // Overnight shift
        }

        return hours + (minutes / 60);
    },

    /**
     * Format duration
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
};

// ========================================
// FORM VALIDATOR
// ========================================

const FormValidator = {
    /**
     * Validate a form element
     * @param {HTMLFormElement} form - Form to validate
     * @param {Object} rules - Validation rules
     * @returns {Object} Validation result
     */
    validate(form, rules = {}) {
        const errors = [];
        const formData = new FormData(form);

        for (const [field, fieldRules] of Object.entries(rules)) {
            const value = formData.get(field);

            for (const rule of fieldRules) {
                const result = this.validateRule(field, value, rule, formData);
                if (!result.valid) {
                    errors.push({ field, message: result.message });
                    break; // Stop at first error per field
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            getData() {
                const data = {};
                formData.forEach((value, key) => {
                    data[key] = value;
                });
                return data;
            }
        };
    },

    validateRule(field, value, rule, formData) {
        if (typeof rule === 'string') {
            rule = { type: rule };
        }

        switch (rule.type) {
            case 'required':
                if (!ValidationUtils.isRequired(value)) {
                    return { valid: false, message: rule.message || `${field} is required` };
                }
                break;

            case 'email':
                if (value && !ValidationUtils.isEmail(value)) {
                    return { valid: false, message: rule.message || 'Invalid email format' };
                }
                break;

            case 'phone':
                if (value && !ValidationUtils.isPhone(value)) {
                    return { valid: false, message: rule.message || 'Invalid phone format' };
                }
                break;

            case 'min':
                if (value && value.length < rule.value) {
                    return { valid: false, message: rule.message || `Minimum ${rule.value} characters` };
                }
                break;

            case 'max':
                if (value && value.length > rule.value) {
                    return { valid: false, message: rule.message || `Maximum ${rule.value} characters` };
                }
                break;

            case 'match':
                const matchValue = formData.get(rule.field);
                if (value !== matchValue) {
                    return { valid: false, message: rule.message || 'Fields do not match' };
                }
                break;

            case 'pattern':
                if (value && !rule.regex.test(value)) {
                    return { valid: false, message: rule.message || 'Invalid format' };
                }
                break;

            case 'custom':
                if (rule.validator && !rule.validator(value, formData)) {
                    return { valid: false, message: rule.message || 'Validation failed' };
                }
                break;
        }

        return { valid: true };
    },

    /**
     * Add real-time validation to form fields
     */
    addLiveValidation(form, rules) {
        for (const [field, fieldRules] of Object.entries(rules)) {
            const input = form.querySelector(`[name="${field}"]`);
            if (!input) continue;

            input.addEventListener('blur', () => {
                const value = input.value;
                let isValid = true;
                let message = '';

                for (const rule of fieldRules) {
                    const result = this.validateRule(field, value, rule, new FormData(form));
                    if (!result.valid) {
                        isValid = false;
                        message = result.message;
                        break;
                    }
                }

                this.showFieldFeedback(input, isValid, message);
            });
        }
    },

    showFieldFeedback(input, isValid, message) {
        const container = input.closest('.form-group') || input.parentElement;
        let feedback = container.querySelector('.validation-feedback');

        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'validation-feedback';
            container.appendChild(feedback);
        }

        input.classList.remove('is-valid', 'is-invalid');
        input.classList.add(isValid ? 'is-valid' : 'is-invalid');
        feedback.textContent = isValid ? '' : message;
        feedback.className = `validation-feedback ${isValid ? 'text-success' : 'text-danger'}`;
    }
};

// ========================================
// GLOBAL EXPORTS FOR BACKWARD COMPATIBILITY
// ========================================

// Make available globally
window.ValidationUtils = ValidationUtils;
window.SchemaValidator = SchemaValidator;
window.TimeValidation = TimeValidation;
window.FormValidator = FormValidator;

// Legacy function aliases
function validateScheduleData(schedule) { return SchemaValidator.validateSchedule(schedule); }
function validateEmployeeData(employee) { return SchemaValidator.validateEmployee(employee); }
function validateShiftData(shift) { return SchemaValidator.validateShift(shift); }
function validateCrewData(crew) { return SchemaValidator.validateCrew(crew); }
function isEmail(email) { return ValidationUtils.isEmail(email); }
function isPhone(phone) { return ValidationUtils.isPhone(phone); }
function sanitize(str) { return ValidationUtils.sanitize(str); }

// Export for ES6 modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ValidationUtils,
        SchemaValidator,
        TimeValidation,
        FormValidator
    };
}