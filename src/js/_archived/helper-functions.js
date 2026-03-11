/**
 * Helper Functions Module
 * Extracted from long functions to improve code quality
 * @module helpers
 */

/**
 * Validate schedule data structure
 * @param {Object} schedule - Schedule object to validate
 * @returns {Object} Validation result with isValid and errors
 */

function validateScheduleData(schedule) {
    const errors = [];

    if(!schedule) {
        errors.push('Schedule is required');
        return { isValid: false, errors };
    }

    if(!schedule.name || schedule.name.trim() === '') {
        errors.push('Schedule name is required');
    }

    if(!schedule.month || schedule.month < 1 || schedule.month > 12) {
        errors.push('Valid month (1-12) is required');
    }

    if(!schedule.year || schedule.year < 2020 || schedule.year > 2100) {
        errors.push('Valid year (2020-2100) is required');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * Validate employee data structure
 * @param {Object} employee - Employee object to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validateEmployeeData(employee) {
    const errors = [];

    if(!employee) {
        errors.push('Employee data is required');
        return { isValid: false, errors };
    }

    if(!employee.name || employee.name.trim() === '') {
        errors.push('Employee name is required');
    }

    if(!employee.role || !['paramedic', 'emt', 'boss', 'admin', 'dispatcher', 'super_admin'].includes(employee.role)) {
        errors.push('Valid role is required');
    }

    if(!employee.certification || !['ALS', 'BLS'].includes(employee.certification)) {
        errors.push('Valid certification (ALS/BLS) is required');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * Validate shift data structure
 * @param {Object} shift - Shift object to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validateShiftData(shift) {
    const errors = [];

    if(!shift) {
        errors.push('Shift data is required');
        return { isValid: false, errors };
    }

    if(!shift.date) {
        errors.push('Shift date is required');
    }

    if(!shift.type || !['day', 'night', 'weekend', 'holiday', 'on_call'].includes(shift.type)) {
        errors.push('Valid shift type is required');
    }

    if(!shift.startTime) {
        errors.push('Start time is required');
    }

    if(!shift.endTime) {
        errors.push('End time is required');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * Validate crew data structure
 * @param {Object} crew - Crew object to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validateCrewData(crew) {
    const errors = [];

    if(!crew) {
        errors.push('Crew data is required');
        return { isValid: false, errors };
    }

    if(!crew.name || crew.name.trim() === '') {
        errors.push('Crew name is required');
    }

    if(!crew.type || !['ALS', 'BLS'].includes(crew.type)) {
        errors.push('Valid crew type (ALS/BLS) is required');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string (short/long/iso)
 * @returns {string} Formatted date string
 */
function formatDate(date, format = 'short') {
    const d = new Date(date);

    switch (format) {
        case 'short':
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        case 'long':
            return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        case 'iso':
            return d.toISOString().split('T')[0];
        case 'time':
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        default:
            return d.toLocaleDateString();
    }
}

/**
 * Format time duration
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if(days > 0) return days + 'd ' + (hours % 24) + 'h';
    if(hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
    if(minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
    return seconds + 's';
}

/**
 * Calculate shift hours
 * @param {string} startTime - Start time (HH:MM)
 * @param {string} endTime - End time (HH:MM)
 * @returns {number} Hours worked
 */
function calculateShiftHours(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let hours = endH - startH;
    let minutes = endM - startM;

    if(minutes < 0) {
        hours--;
        minutes += 60;
    }

    if(hours < 0) {
        hours += 24; // Overnight shift
    }

    return hours + (minutes / 60);
}

/**
 * Check for shift conflicts
 * @param {Object} newShift - New shift to check
 * @param {Array} existingShifts - Existing shifts
 * @returns {Array} Array of conflicting shifts
 */
function checkShiftConflicts(newShift, existingShifts) {
    const conflicts = [];

    existingShifts.forEach(existing => {
        if(existing.date === newShift.date && existing.id !== newShift.id) {
            // Check for crew overlap
            if(existing.crewId === newShift.crewId) {
                conflicts.push({
                    type: 'crew_overlap',
                    shift: existing,
                    message: 'Crew already assigned to another shift on this date'
                });
            }

            // Check for employee overlap
            if(existing.employees && newShift.employees) {
                const overlap = existing.employees.filter(e => newShift.employees.includes(e));
                if(overlap.length > 0) {
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
}

/**
 * Calculate overtime hours
 * @param {Array} shifts - Array of shifts for an employee
 * @param {number} threshold - Overtime threshold in hours (default: 160)
 * @returns {Object} Overtime calculation result
 */
function calculateOvertime(shifts, threshold = 160) {
    let totalHours = 0;

    shifts.forEach(shift => {
        if(shift.startTime && shift.endTime) {
            totalHours += calculateShiftHours(shift.startTime, shift.endTime);
        }
    });

    return {
        totalHours: totalHours,
        threshold: threshold,
        overtimeHours: Math.max(0, totalHours - threshold),
        isOvertime: totalHours > threshold,
        percentage: ((totalHours / threshold) * 100).toFixed(1)
    };
}

/**
 * Calculate fairness score for shift distribution
 * @param {Object} distribution - Shift distribution by employee
 * @returns {Object} Fairness metrics
 */
function calculateFairnessScore(distribution) {
    const values = Object.values(distribution);
    if(values.length === 0) return { score: 100, deviation: 0 };

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

/**
 * Generate unique ID
 * @param {string} prefix - ID prefix
 * @returns {string} Unique ID
 */
function generateId(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
    if(obj === null || typeof obj !== 'object') return obj;
    if(obj instanceof Date) return new Date(obj);
    if(obj instanceof Array) return obj.map(item => deepClone(item));

    const cloned = {};
    for(const key in obj) {
        if(obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

/**
 * Safe JSON parse with fallback
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Fallback value on error
 * @returns {*} Parsed value or fallback
 */
function safeJSONParse(str, fallback = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

/**
 * Sanitize HTML to prevent XSS
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeHTML(html) {
    if(!html) return '';
    return String(html);
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit = 300) {
    let inThrottle;
    return function(...args) {
        if(!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
