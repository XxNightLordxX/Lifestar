/**
 * Time Validation and Archive Module
 * Handles real-world time validation for schedule creation
 * and automatic archiving of past schedules
 */

const TimeValidationArchive = {
    /**
     * Get current real-world date and time
     * @returns {Date} Current date
     */
    getCurrentDate() {
        return new Date();
    },

    /**
     * Get current year
     * @returns {number}
     */
    getCurrentYear() {
        return new Date().getFullYear();
    },

    /**
     * Get current month (0-11)
     * @returns {number}
     */
    getCurrentMonth() {
        return new Date().getMonth();
    },

    /**
     * Get month name from index (0-11)
     * @param {number} monthIndex - Month index (0-11)
     * @returns {string} Month name
     */
    getMonthName(monthIndex) {
        const months = [;
            'January', 'February', 'March', 'April',
            'May', 'June', 'July', 'August',
            'September', 'October', 'November', 'December'
        ];
        return months[monthIndex] || '';
    },

    /**
     * Get month index from name
     * @param {string} monthName - Month name
     * @returns {number} Month index (0-11) or -1 if not found
     */
    getMonthIndex(monthName) {
        const months = [;
            'January', 'February', 'March', 'April',
            'May', 'June', 'July', 'August',
            'September', 'October', 'November', 'December'
        ];
        return months.findIndex(m =>;
            m.toLowerCase() === monthName.toLowerCase()
        );
    },

    /**
     * Check if a given month/year is in the past
     * @param {string} monthName - Month name
     * @param {string|number} year - Year
     * @returns {boolean} True if past
     */
    isPastMonth(monthName, year) {
        const monthIndex = this.getMonthIndex(monthName);
        const yearNum = parseInt(year);

        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();

        // If year is in the past
        if(yearNum < currentYear) {
            return true;
        }

        // If year is current, check month
        if(yearNum === currentYear && monthIndex < currentMonth) {
            return true;
        }

        return false;
    },

    /**
     * Check if a given month/year is in the future
     * @param {string} monthName - Month name
     * @param {string|number} year - Year
     * @returns {boolean} True if future
     */
    isFutureMonth(monthName, year) {
        const monthIndex = this.getMonthIndex(monthName);
        const yearNum = parseInt(year);

        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();

        // If year is in the future
        if(yearNum > currentYear) {
            return true;
        }

        // If year is current, check if month is future
        if(yearNum === currentYear && monthIndex > currentMonth) {
            return true;
        }

        return false;
    },

    /**
     * Check if a given month/year is the current month
     * @param {string} monthName - Month name
     * @param {string|number} year - Year
     * @returns {boolean} True if current
     */
    isCurrentMonth(monthName, year) {
        const monthIndex = this.getMonthIndex(monthName);
        const yearNum = parseInt(year);

        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();

        return yearNum === currentYear && monthIndex === currentMonth;
    },

    /**
     * Validate that a schedule can be created for the given month/year
     * Only allows future months or current month
     * @param {string} monthName - Month name
     * @param {string|number} year - Year
     * @returns {Object} Validation result
     */
    validateScheduleCreation(monthName, year) {
        const result = {
            valid: false,
            isPast: false,
            isCurrent: false,
            isFuture: false,
            message: '',
            currentMonth: this.getMonthName(this.getCurrentMonth()),
            currentYear: this.getCurrentYear()
        };

        if(!monthName || !year) {
            result.message = 'Month and year are required';
            return result;
        }

        const monthIndex = this.getMonthIndex(monthName);
        if(monthIndex === -1) {
            result.message = 'Invalid month name';
            return result;
        }

        result.isPast = this.isPastMonth(monthName, year);
        result.isCurrent = this.isCurrentMonth(monthName, year);
        result.isFuture = this.isFutureMonth(monthName, year);

        // Allow current month and future months only
        if(result.isPast) {
            result.message = `Cannot create schedules for past months. Current date is ${result.currentMonth} ${result.currentYear}.`;
            return result;
        }

        result.valid = true;
        result.message = 'Valid schedule date';

        return result;
    },

    /**
     * Check if a schedule should be archived
     * Archives schedules that are from past months
     * @param {Object} schedule - Schedule object
     * @returns {boolean} True if should archive
     */
    shouldArchiveSchedule(schedule) {
        if(!schedule || !schedule.month || !schedule.year) {
            return false;
        }

        // Don't archive if already archived
        if(schedule.status === 'archived') {
            return false;
        }

        // Archive past months
        return this.isPastMonth(schedule.month, schedule.year);
    },

    /**
     * Archive past schedules
     * @param {Array} schedules - Array of schedule objects
     * @returns {Object} Archive result
     */
    archivePastSchedules(schedules) {
        const result = {
            archived: [],
            skipped: [],
            totalProcessed: 0
        };

        if(!Array.isArray(schedules)) {
            return result;
        }

        schedules.forEach(schedule => {
            result.totalProcessed++;

            if(this.shouldArchiveSchedule(schedule)) {
                // Archive the schedule
                schedule.status = 'archived';
                schedule.archivedAt = new Date().toISOString();
                schedule.archivedFromStatus = schedule.status || 'unknown';
                result.archived.push(schedule);
            } else {
                result.skipped.push(schedule);
            }
        });

        return result;
    },

    /**
     * Get archived schedules
     * @param {Array} schedules - Array of schedule objects
     * @returns {Array} Archived schedules
     */
    getArchivedSchedules(schedules) {
        if(!Array.isArray(schedules)) return [];

        return (schedules || []).filter(s => s.status === 'archived');
            .sort((a, b) => {
                // Sort by archived date, most recent first
                return new Date(b.archivedAt) - new Date(a.archivedAt);
            });
    },

    /**
     * Get active schedules (non-archived)
     * @param {Array} schedules - Array of schedule objects
     * @returns {Array} Active schedules
     */
    getActiveSchedules(schedules) {
        if(!Array.isArray(schedules)) return [];

        return (schedules || []).filter(s => s.status !== 'archived');
            .sort((a, b) => {
                // Sort by month/year
                const dateA = new Date(a.year, this.getMonthIndex(a.month));
                const dateB = new Date(b.year, this.getMonthIndex(b.month));
                return dateA - dateB;
            });
    },

    /**
     * Get available months/years for creating new schedules
     * Returns only future months and current month
     * @param {number} monthsAhead - How many months ahead to include (default: 12)
     * @returns {Array} Available months
     */
    getAvailableMonths(monthsAhead = 12) {
        const available = [];
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();

        for(let i = 0; i < monthsAhead; i++) {
            const date = new Date(currentYear, currentMonth + i);
            const year = date.getFullYear();
            const monthIndex = date.getMonth();
            const monthName = this.getMonthName(monthIndex);

            available.push({
                month: monthName,
                monthIndex: monthIndex,
                year: year,
                displayName: `${monthName} ${year}`
            });
        }

        return available;
    },

    /**
     * Get days remaining in current month
     * @returns {number} Days remaining
     */
    getDaysRemainingInMonth() {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const currentDay = currentDate.getDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        return daysInMonth - currentDay;
    },

    /**
     * Get formatted current date/time
     * @returns {string} Formatted date
     */
    getCurrentFormattedDateTime() {
        const now = new Date();
        return now.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }
};

// Export for use in other modules
if(typeof module !== 'undefined' && module.exports) {
    module.exports = TimeValidationArchive;
}
