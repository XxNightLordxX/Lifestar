/**
 * Core Calendar Module for Lifestar Ambulance Scheduling System
 * Consolidates: enhanced-calendar.js, staff-availability-calendar.js
 * 
 * Provides month/week/day views with color-coded shifts and staff availability
 */

(function() {
    'use strict';

    // ============================================
    // CALENDAR STATE
    // ============================================
    const CalendarState = {
        currentView: 'month', // 'month', 'week', 'day'
        currentDate: new Date(),
        currentScheduleId: null,
        shiftTypeColors: {
            'Day': '#4CAF50',
            'Night': '#2196F3',
            'Evening': '#FF9800',
            '24-Hour': '#9C27B0'
        },
        statusColors: {
            'available': '#4CAF50',
            'unavailable': '#F44336',
            'on-call': '#FF9800',
            'unknown': '#9E9E9E'
        }
    };

    // ============================================
    // ENHANCED CALENDAR
    // ============================================
    const EnhancedCalendar = {
        /**
         * Initialize calendar
         */
        init() {
            this.render();
            Logger.debug('✅ EnhancedCalendar initialized');
        },

        /**
         * Set calendar view mode
         */
        setView(view) {
            CalendarState.currentView = view;

            // Update button styles
            ['Month', 'Week', 'Day'].forEach(v => {
                const btn = document.getElementById(`calendarView${v}`);
                if (btn) {
                    btn.style.background = view === v.toLowerCase() ? 'var(--lifestar-blue)' : '';
                    btn.style.color = view === v.toLowerCase() ? 'white' : '';
                }
            });

            this.render();
        },

        /**
         * Change calendar period
         */
        changePeriod(direction) {
            const { currentView, currentDate } = CalendarState;

            if (currentView === 'month') {
                currentDate.setMonth(currentDate.getMonth() + direction);
            } else if (currentView === 'week') {
                currentDate.setDate(currentDate.getDate() + (direction * 7));
            } else {
                currentDate.setDate(currentDate.getDate() + direction);
            }

            this.render();
        },

        /**
         * Go to today
         */
        goToToday() {
            CalendarState.currentDate = new Date();
            this.render();
        },

        /**
         * Render calendar
         */
        render() {
            const grid = document.getElementById('calendarGrid');
            const label = document.getElementById('calendarPeriodLabel');

            if (!grid) return;

            // Get selected schedule
            const scheduleSelect = document.getElementById('calendarScheduleSelect');
            CalendarState.currentScheduleId = scheduleSelect?.value;

            // Get schedule data
            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const schedule = schedules.find(s => s.id === CalendarState.currentScheduleId);

            const { currentView } = CalendarState;

            if (currentView === 'month') {
                this.renderMonthView(grid, label, schedule);
            } else if (currentView === 'week') {
                this.renderWeekView(grid, label, schedule);
            } else {
                this.renderDayView(grid, label, schedule);
            }
        },

        /**
         * Render month view
         */
        renderMonthView(grid, label, schedule) {
            const { currentDate, shiftTypeColors } = CalendarState;
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            if (label) {
                label.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            }

            grid.style.gridTemplateColumns = 'repeat(7, 1fr)';

            let html = '';

            // Day headers
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            dayNames.forEach(day => {
                html += `<div style="font-weight: bold; text-align: center; padding: 10px; background: #f5f5f5;">${day}</div>`;
            });

            // Get first day and days in month
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // Empty cells before first day
            for (let i = 0; i < firstDay; i++) {
                html += '<div class="calendar-day empty"></div>';
            }

            // Days of month
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const shifts = this.getShiftsForDate(schedule, dateStr);

                html += `
                    <div class="calendar-day" data-date="${dateStr}">
                        <div class="day-number">${day}</div>
                        <div class="day-shifts">
                            ${shifts.map(shift => {
                                const color = shiftTypeColors[shift.type] || '#666';
                                const staff = window.users?.find(u => u.id === shift.staffId);
                                return `<div class="shift-badge" style="background: ${color};" title="${staff?.fullName || 'Unassigned'}">${shift.type}</div>`;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            grid.innerHTML = html;
        },

        /**
         * Render week view
         */
        renderWeekView(grid, label, schedule) {
            const { currentDate, shiftTypeColors } = CalendarState;

            // Get start of week (Sunday)
            const startOfWeek = new Date(currentDate);
            startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);

            if (label) {
                label.textContent = `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            }

            grid.style.gridTemplateColumns = 'repeat(7, 1fr)';

            let html = '';
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            for (let i = 0; i < 7; i++) {
                const date = new Date(startOfWeek);
                date.setDate(startOfWeek.getDate() + i);
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const shifts = this.getShiftsForDate(schedule, dateStr);

                html += `
                    <div class="calendar-day week-view" data-date="${dateStr}">
                        <div class="day-header">
                            <strong>${dayNames[i]}</strong>
                            <span>${date.getDate()}</span>
                        </div>
                        <div class="day-shifts">
                            ${shifts.map(shift => {
                                const color = shiftTypeColors[shift.type] || '#666';
                                const staff = window.users?.find(u => u.id === shift.staffId);
                                return `
                                    <div class="shift-card" style="border-left: 4px solid ${color};">
                                        <strong>${shift.type}</strong>
                                        <p>${staff?.fullName || 'Unassigned'}</p>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            grid.innerHTML = html;
        },

        /**
         * Render day view
         */
        renderDayView(grid, label, schedule) {
            const { currentDate, shiftTypeColors } = CalendarState;

            if (label) {
                label.textContent = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            }

            grid.style.gridTemplateColumns = '1fr';

            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const shifts = this.getShiftsForDate(schedule, dateStr);

            let html = '<div class="day-view-container">';

            if (shifts.length === 0) {
                html += '<p class="no-shifts">No shifts scheduled for this day</p>';
            } else {
                shifts.forEach(shift => {
                    const color = shiftTypeColors[shift.type] || '#666';
                    const staff = window.users?.find(u => u.id === shift.staffId);

                    html += `
                        <div class="shift-detail-card" style="border-left: 4px solid ${color};">
                            <h3>${shift.type} Shift</h3>
                            <p><strong>Staff:</strong> ${staff?.fullName || 'Unassigned'}</p>
                            <p><strong>Station:</strong> ${shift.station || 'Main'}</p>
                            <div class="shift-actions">
                                <button class="btn btn-sm btn-primary" onclick="editShift('${shift.id}')">Edit</button>
                            </div>
                        </div>
                    `;
                });
            }

            html += '</div>';
            grid.innerHTML = html;
        },

        /**
         * Get shifts for a specific date
         */
        getShiftsForDate(schedule, dateStr) {
            if (!schedule || !schedule.shifts) return [];

            return schedule.shifts.filter(shift => {
                // Check if shift date matches
                return shift.date === dateStr || shift.startDate === dateStr;
            });
        }
    };

    // ============================================
    // STAFF AVAILABILITY CALENDAR
    // ============================================
    const StaffAvailabilityCalendar = {
        currentDate: new Date(),

        /**
         * Initialize
         */
        init() {
            this.load();
            Logger.debug('✅ StaffAvailabilityCalendar initialized');
        },

        /**
         * Load availability calendar
         */
        load() {
            const calendar = document.getElementById('availabilityCalendar');
            const label = document.getElementById('availabilityMonthYear');
            const staffFilter = document.getElementById('availabilityStaffFilter');

            if (!calendar) return;

            // Get staff
            const allUsers = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            let staff = allUsers.filter(u => u.role === 'paramedic' || u.role === 'emt');

            // Apply filter
            const filterValue = staffFilter?.value;
            if (filterValue) {
                staff = staff.filter(s => s.id === filterValue);
            }

            // Populate staff filter if empty
            if (staffFilter && staffFilter.options.length <= 1) {
                staff.forEach(s => {
                    const option = document.createElement('option');
                    option.value = s.id;
                    option.textContent = s.firstName + ' ' + s.lastName;
                    staffFilter.appendChild(option);
                });
            }

            this.render(calendar, label, staff);
        },

        /**
         * Render availability calendar
         */
        render(calendar, label, staff) {
            const { statusColors } = CalendarState;
            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth();

            if (label) {
                label.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            }

            let html = '<table style="width: 100%; border-collapse: collapse;">';

            // Header row with staff names
            html += '<thead><tr><th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; min-width: 80px;">Date</th>';
            staff.forEach(s => {
                const name = this.escapeHtml(s.firstName + ' ' + s.lastName);
                html += `<th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; min-width: 100px;">${name}</th>`;
            });
            html += '</tr></thead>';

            // Days in month
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            html += '<tbody>';

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const date = new Date(year, month, day);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

                html += '<tr>';
                html += `<td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${day}<br><small>${dayName}</small></td>`;

                staff.forEach(s => {
                    const status = this.getAvailability(s.id, dateStr);
                    const color = statusColors[status] || statusColors['unknown'];
                    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

                    html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">`;
                    html += `<div style="background: ${color}; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;" `;
                    html += `onclick="StaffAvailabilityCalendar.editAvailability('${s.id}', '${dateStr}')">`;
                    html += statusLabel;
                    html += '</div></td>';
                });

                html += '</tr>';
            }

            html += '</tbody></table>';
            calendar.innerHTML = html;
        },

        /**
         * Get staff availability for date
         */
        getAvailability(staffId, dateStr) {
            const availability = JSON.parse(localStorage.getItem('lifestarAvailability') || '{}');
            const key = `${staffId}_${dateStr}`;
            return availability[key] || 'unknown';
        },

        /**
         * Edit availability
         */
        editAvailability(staffId, dateStr) {
            const currentStatus = this.getAvailability(staffId, dateStr);
            const statuses = ['available', 'unavailable', 'on-call', 'unknown'];
            const currentIndex = statuses.indexOf(currentStatus);
            const newStatus = statuses[(currentIndex + 1) % statuses.length];

            // Save
            const availability = JSON.parse(localStorage.getItem('lifestarAvailability') || '{}');
            availability[`${staffId}_${dateStr}`] = newStatus;
            localStorage.setItem('lifestarAvailability', JSON.stringify(availability));

            // Refresh
            this.load();

            if (typeof showToast === 'function') {
                showToast(`Availability updated to ${newStatus}`, 'success');
            }
        },

        /**
         * Change month
         */
        changeMonth(direction) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
            this.load();
        },

        /**
         * Escape HTML
         */
        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    // ============================================
    // INITIALIZE
    // ============================================
    EnhancedCalendar.init();
    StaffAvailabilityCalendar.init();

    // ============================================
    // EXPOSE TO GLOBAL SCOPE
    // ============================================
    window.CalendarState = CalendarState;
    window.EnhancedCalendar = EnhancedCalendar;
    window.StaffAvailabilityCalendar = StaffAvailabilityCalendar;

    // Backward compatibility aliases
    window.setCalendarView = (view) => EnhancedCalendar.setView(view);
    window.changeCalendarPeriod = (dir) => EnhancedCalendar.changePeriod(dir);
    window.renderCalendar = () => EnhancedCalendar.render();
    window.loadAvailabilityCalendar = () => StaffAvailabilityCalendar.load();
    window.editStaffAvailability = (staffId, date) => StaffAvailabilityCalendar.editAvailability(staffId, date);

    Logger.debug('✅ Core Calendar Module loaded');

})();