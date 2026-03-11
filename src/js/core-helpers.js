/**
 * Core Helpers Module - Consolidated from multiple files
 * Helper functions for data validation, formatting, and business logic
 * @module core-helpers
 * @version 1.0.0
 * 
 * Consolidated from:
 * - helper-functions.js
 * - code-quality-utils.js
 * - validation-helper.js
 * - loading-helper.js
 * - missing-functions.js
 */

'use strict';

// ========================================
// DATA VALIDATION HELPERS
// ========================================

// DATA VALIDATION HELPERS
// ========================================
//
// NOTE: The full validation implementations now live in core-validation.js as
// SchemaValidator. DataValidators below is a thin delegation layer kept only
// for backward compatibility. New code should use SchemaValidator directly.
// This removes the duplicate logic that previously existed between these files.

const DataValidators = {
    validateSchedule(schedule) {
        if (typeof SchemaValidator !== 'undefined') return SchemaValidator.validateSchedule(schedule);
        const errors = [];
        if (!schedule) return { isValid: false, errors: ['Schedule is required'] };
        if (!schedule.name || !schedule.name.trim()) errors.push('Schedule name is required');
        if (!schedule.month || schedule.month < 1 || schedule.month > 12) errors.push('Valid month (1-12) is required');
        if (!schedule.year || schedule.year < 2020 || schedule.year > 2100) errors.push('Valid year (2020-2100) is required');
        return { isValid: errors.length === 0, errors };
    },
    validateEmployee(employee) {
        if (typeof SchemaValidator !== 'undefined') return SchemaValidator.validateEmployee(employee);
        const errors = [];
        if (!employee) return { isValid: false, errors: ['Employee data is required'] };
        if (!employee.name || !employee.name.trim()) errors.push('Employee name is required');
        const validRoles = ['paramedic', 'emt', 'boss', 'admin', 'dispatcher', 'super_admin'];
        if (!employee.role || !validRoles.includes(employee.role)) errors.push('Valid role is required');
        return { isValid: errors.length === 0, errors };
    },
    validateShift(shift) {
        if (typeof SchemaValidator !== 'undefined') return SchemaValidator.validateShift(shift);
        const errors = [];
        if (!shift) return { isValid: false, errors: ['Shift data is required'] };
        if (!shift.date) errors.push('Shift date is required');
        if (!shift.startTime) errors.push('Start time is required');
        if (!shift.endTime) errors.push('End time is required');
        return { isValid: errors.length === 0, errors };
    },
    validateCrew(crew) {
        if (typeof SchemaValidator !== 'undefined') return SchemaValidator.validateCrew(crew);
        const errors = [];
        if (!crew) return { isValid: false, errors: ['Crew data is required'] };
        if (!crew.name || !crew.name.trim()) errors.push('Crew name is required');
        if (!crew.type || !['ALS', 'BLS'].includes(crew.type)) errors.push('Valid crew type (ALS/BLS) is required');
        return { isValid: errors.length === 0, errors };
    },
    isEmail(email) {
        return typeof ValidationUtils !== 'undefined' ? ValidationUtils.isEmail(email) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    isPhone(phone) {
        return typeof ValidationUtils !== 'undefined' ? ValidationUtils.isPhone(phone) : /^[\d\-+()]{10,}$/.test(phone);
    },
    isRequired(value) {
        return value !== null && value !== undefined && value !== '';
    }
};


// ========================================
// SHIFT & SCHEDULE CALCULATIONS
// ========================================

const ShiftCalculations = {
    /**
     * Calculate shift hours
     */
    calculateHours(startTime, endTime) {
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
     * Check for shift conflicts
     */
    checkConflicts(newShift, existingShifts) {
        const conflicts = [];

        if (!Array.isArray(existingShifts)) return conflicts;

        existingShifts.forEach(existing => {
            if (existing.date === newShift.date && existing.id !== newShift.id) {
                // Check for crew overlap
                if (existing.crewId === newShift.crewId) {
                    conflicts.push({
                        type: 'crew_overlap',
                        shift: existing,
                        message: 'Crew already assigned to another shift on this date'
                    });
                }

                // Check for employee overlap
                if (existing.employees && newShift.employees) {
                    const overlap = existing.employees.filter(e => newShift.employees.includes(e));
                    if (overlap.length > 0) {
                        conflicts.push({
                            type: 'employee_overlap',
                            shift: existing,
                            employees: overlap,
                            message: 'Employee(s) already assigned to another shift on this date'
                        });
                    }
                }
            }
        });

        return conflicts;
    },

    /**
     * Calculate overtime hours
     */
    calculateOvertime(shifts, threshold = 160) {
        let totalHours = 0;

        if (!Array.isArray(shifts)) {
            return { totalHours: 0, threshold, overtimeHours: 0, isOvertime: false, percentage: '0.0' };
        }

        shifts.forEach(shift => {
            if (shift.startTime && shift.endTime) {
                totalHours += this.calculateHours(shift.startTime, shift.endTime);
            }
        });

        return {
            totalHours: totalHours,
            threshold: threshold,
            overtimeHours: Math.max(0, totalHours - threshold),
            isOvertime: totalHours > threshold,
            percentage: ((totalHours / threshold) * 100).toFixed(1)
        };
    },

    /**
     * Calculate fairness score for shift distribution
     */
    calculateFairnessScore(distribution) {
        const values = Object.values(distribution);
        if (values.length === 0) return { score: 100, deviation: 0 };

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = avg > 0 ? (stdDev / avg) * 100 : 0;

        // Score: 100 = perfectly fair, 0 = very unfair
        const score = Math.max(0, 100 - coefficientOfVariation);

        return {
            score: Math.round(score),
            average: avg.toFixed(1),
            standardDeviation: stdDev.toFixed(2),
            coefficientOfVariation: coefficientOfVariation.toFixed(2),
            min: Math.min(...values),
            max: Math.max(...values),
            range: Math.max(...values) - Math.min(...values)
        };
    }
};

// ========================================
// DATE/TIME HELPERS
// ========================================

const DateTimeHelpers = {
    /**
     * Format duration in human-readable format
     */
    formatDuration(milliseconds) {
        if (!milliseconds || milliseconds < 0) return '0s';
        
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return days + 'd ' + (hours % 24) + 'h';
        if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
        if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
        return seconds + 's';
    },

    /**
     * Get relative time (e.g., "2 hours ago")
     */
    getRelativeTime(date) {
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
        return d.toLocaleDateString();
    },

    /**
     * Get week number of year
     */
    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    },

    /**
     * Check if date is weekend
     */
    isWeekend(date) {
        const d = new Date(date);
        const day = d.getDay();
        return day === 0 || day === 6;
    },

    /**
     * Get days in month
     */
    getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }
};

// ========================================
// OBJECT & ARRAY HELPERS
// ========================================

const ObjectHelpers = {
    /**
     * Deep clone an object
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));

        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    },

    /**
     * Generate unique ID
     */
    generateId(prefix = 'id') {
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Check if value is empty
     */
    isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    },

    /**
     * Safe JSON parse with fallback
     */
    safeJSONParse(str, fallback = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    },

    /**
     * Safe JSON stringify
     */
    safeJSONStringify(obj, fallback = '{}') {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            return fallback;
        }
    }
};

// ========================================
// PERFORMANCE HELPERS
// ========================================

const PerformanceHelpers = {
    /**
     * Debounce function calls
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function calls
     */
    throttle(func, limit = 300) {
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
     * Safe async wrapper with error handling
     */
    asyncWrapper(fn) {
        return async function(...args) {
            try {
                return await fn(...args);
            } catch (error) {
                if (typeof Logger !== 'undefined') {
                    Logger.error('Async error:', error);
                }
                throw error;
            }
        };
    }
};

// ========================================
// UI HELPERS
// ========================================

const UIHelpers = {
    /**
     * Show loading indicator
     */
    showLoading(message = 'Loading...') {
        let loader = document.getElementById('global-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
            loader.innerHTML = `
                <div style="background:white;padding:2rem;border-radius:8px;text-align:center;">
                    <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #007bff;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 1rem;"></div>
                    <div id="loader-message">${message}</div>
                </div>
            `;
            document.body.appendChild(loader);

            // Add spin animation if not exists
            if (!document.getElementById('spin-animation')) {
                const style = document.createElement('style');
                style.id = 'spin-animation';
                style.textContent = '@keyframes spin {0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
                document.head.appendChild(style);
            }
        } else {
            const msgEl = document.getElementById('loader-message');
            if (msgEl) msgEl.textContent = message;
            loader.style.display = 'flex';
        }
    },

    /**
     * Hide loading indicator
     */
    hideLoading() {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    },

    /**
     * Safe execute function with error handling
     */
    safeExecute(fn, fallback = null, context = '') {
        try {
            return fn();
        } catch (e) {
            if (typeof Logger !== 'undefined') {
                Logger.error(`[Error${context ? ' - ' + context : ''}]`, e.message);
            }
            return fallback;
        }
    },

    /**
     * Safe async execute
     */
    async safeAsyncExecute(fn, fallback = null, context = '') {
        try {
            return await fn();
        } catch (e) {
            if (typeof Logger !== 'undefined') {
                Logger.error(`[Async Error${context ? ' - ' + context : ''}]`, e.message);
            }
            return fallback;
        }
    }
};

// ========================================
// MISSING FUNCTIONS PATCH
// ========================================

const MissingFunctionsPatch = {
    /**
     * Save users to localStorage
     */
    saveUsers() {
        try {
            if (typeof users !== 'undefined') {
                localStorage.setItem('lifestarUsers', JSON.stringify(users));
            }
        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.error('Error saving users:', error);
            }
        }
    },

    /**
     * Save schedules to localStorage
     */
    saveSchedules() {
        try {
            if (typeof schedules !== 'undefined') {
                localStorage.setItem('lifestarSchedules', JSON.stringify(schedules));
            }
        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.error('Error saving schedules:', error);
            }
        }
    },

    /**
     * Filter employee list by role
     */
    filterEmployeeList() {
        try {
            const filter = document.getElementById('staffFilter')?.value || 'all';
            const employees = document.querySelectorAll('.employee-card');

            employees.forEach(card => {
                const role = card.dataset.employeeRole;
                if (filter === 'all') {
                    card.style.display = '';
                } else if (filter === role) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.error('[filterEmployeeList] Error:', error.message || error);
            }
        }
    },

    /**
     * Navigate calendar to today
     */
    goToToday() {
        try {
            if (typeof loadCalendar === 'function') {
                const now = new Date();
                if (typeof window.calendarMonth !== 'undefined') window.calendarMonth = now.getMonth();
                if (typeof window.calendarYear !== 'undefined') window.calendarYear = now.getFullYear();
                loadCalendar();
            }
        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.error('[goToToday] Error:', error.message || error);
            }
        }
    }
};

// ========================================
// GLOBAL FUNCTION ALIASES
// ========================================

// Validation functions
const validateScheduleData = (schedule) => DataValidators.validateSchedule(schedule);
const validateEmployeeData = (employee) => DataValidators.validateEmployee(employee);
const validateShiftData = (shift) => DataValidators.validateShift(shift);
const validateCrewData = (crew) => DataValidators.validateCrew(crew);

// Calculation functions
const calculateShiftHours = (start, end) => ShiftCalculations.calculateHours(start, end);
const checkShiftConflicts = (newShift, existing) => ShiftCalculations.checkConflicts(newShift, existing);
const calculateOvertime = (shifts, threshold) => ShiftCalculations.calculateOvertime(shifts, threshold);
const calculateFairnessScore = (distribution) => ShiftCalculations.calculateFairnessScore(distribution);

// Date/time functions
const formatDuration = (ms) => DateTimeHelpers.formatDuration(ms);
const getRelativeTime = (date) => DateTimeHelpers.getRelativeTime(date);

// Object helpers
const generateId = (prefix) => ObjectHelpers.generateId(prefix);
const deepClone = (obj) => ObjectHelpers.deepClone(obj);

// Performance helpers
const debounce = (fn, wait) => PerformanceHelpers.debounce(fn, wait);
const throttle = (fn, limit) => PerformanceHelpers.throttle(fn, limit);

// UI helpers
const showLoading = (message) => UIHelpers.showLoading(message);
const hideLoading = () => UIHelpers.hideLoading();
const safeExecute = (fn, fallback, context) => UIHelpers.safeExecute(fn, fallback, context);

// Missing functions
const saveUsers = () => MissingFunctionsPatch.saveUsers();
const saveSchedules = () => MissingFunctionsPatch.saveSchedules();
const filterEmployeeList = () => MissingFunctionsPatch.filterEmployeeList();
const goToToday = () => MissingFunctionsPatch.goToToday();

// ========================================
// GLOBAL EXPORTS
// ========================================

// Make helper objects available globally
window.DataValidators = DataValidators;
window.ShiftCalculations = ShiftCalculations;
window.DateTimeHelpers = DateTimeHelpers;
window.ObjectHelpers = ObjectHelpers;
window.PerformanceHelpers = PerformanceHelpers;
window.UIHelpers = UIHelpers;
window.MissingFunctionsPatch = MissingFunctionsPatch;

// Make function aliases available globally
window.validateScheduleData = validateScheduleData;
window.validateEmployeeData = validateEmployeeData;
window.validateShiftData = validateShiftData;
window.validateCrewData = validateCrewData;
window.calculateShiftHours = calculateShiftHours;
window.checkShiftConflicts = checkShiftConflicts;
window.calculateOvertime = calculateOvertime;
window.calculateFairnessScore = calculateFairnessScore;
window.formatDuration = formatDuration;
window.getRelativeTime = getRelativeTime;
window.generateId = generateId;
window.deepClone = deepClone;
window.debounce = debounce;
window.throttle = throttle;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.safeExecute = safeExecute;
window.saveUsers = saveUsers;
window.saveSchedules = saveSchedules;
window.filterEmployeeList = filterEmployeeList;
window.goToToday = goToToday;

// LoadingIndicator alias
window.LoadingIndicator = {
    show: showLoading,
    hide: hideLoading
};

// Validator alias
window.Validator = DataValidators;

// CodeQualityUtils alias
window.CodeQualityUtils = {
    asyncWrapper: PerformanceHelpers.asyncWrapper,
    debounce: debounce,
    throttle: throttle,
    deepClone: deepClone,
    isEmpty: ObjectHelpers.isEmpty,
    generateId: generateId,
    formatDate: (date, format) => typeof formatDate === 'function' ? formatDate(date, format) : DateTimeHelpers.getRelativeTime(date),
    safeJsonParse: ObjectHelpers.safeJSONParse,
    safeJsonStringify: ObjectHelpers.safeJSONStringify
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DataValidators,
        ShiftCalculations,
        DateTimeHelpers,
        ObjectHelpers,
        PerformanceHelpers,
        UIHelpers,
        MissingFunctionsPatch
    };
}