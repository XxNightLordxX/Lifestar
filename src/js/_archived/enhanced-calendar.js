/**
 * Enhanced Calendar Module
 * Supports month/week/day views with color-coded shifts and crew assignments
 */


const EnhancedCalendar = (function() {
    'use strict';

    const currentView = 'month'; // 'month', 'week', 'day';
    const currentDate = new Date();
    const currentScheduleId = null;

    const shiftTypeColors = {
        'Day': '#4CAF50',
        'Night': '#2196F3',
        'Evening': '#FF9800',
        '24-Hour': '#9C27B0'
    };

    /**
     * Set the calendar view mode
     */
    function setCalendarView(view) {
        currentView = view;
        
        // Update button styles
        document.getElementById('calendarViewMonth').style.background = view === 'month' ? 'var(--lifestar-blue)' : '';
        document.getElementById('calendarViewMonth').style.color = view === 'month' ? 'white' : '';
        document.getElementById('calendarViewWeek').style.background = view === 'week' ? 'var(--lifestar-blue)' : '';
        document.getElementById('calendarViewWeek').style.color = view === 'week' ? 'white' : '';
        document.getElementById('calendarViewDay').style.background = view === 'day' ? 'var(--lifestar-blue)' : '';
        document.getElementById('calendarViewDay').style.color = view === 'day' ? 'white' : '';
        
        renderCalendar();
    }

    /**
     * Change the calendar period (previous/next)
     */
    function changeCalendarPeriod(direction) {
        if (currentView === 'month') {
            currentDate.setMonth(currentDate.getMonth() + direction);
        } else if (currentView === 'week') {
            currentDate.setDate(currentDate.getDate() + (direction * 7));
        } else {
            currentDate.setDate(currentDate.getDate() + direction);
        }
        renderCalendar();
    }

    /**
     * Render the calendar based on current view
     */
    function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const label = document.getElementById('calendarPeriodLabel');
        
        if (!grid) return;
        
        // Get selected schedule
        currentScheduleId = document.getElementById('calendarScheduleSelect').value;
        
        // Get schedule data
        const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
        const schedule = schedules.find(function(s) { return s.id === currentScheduleId; });
        
        if (currentView === 'month') {
            renderMonthView(grid, label, schedule);
        } else if (currentView === 'week') {
            renderWeekView(grid, label, schedule);
        } else {
            renderDayView(grid, label, schedule);
        }
    }

    /**
     * Render month view
     */
    function renderMonthView(grid, label, schedule) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        label.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Set grid to 7 columns
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        
        const html = '';
        
        // Day headers
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(function(day) {
            html += '<div style="font-weight: bold; text-align: center; padding: 10px; background: #f5f5f5;">' + day + '</div>';
        });
        
        // Get first day of month and total days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Empty cells for days before first day
        for (const i = 0; i < firstDay; i++) {
            html += '<div style="padding: 10px; background: #fafafa;"></div>';
        }
        
        // Days of month
        for (const day = 1; day <= daysInMonth; day++) {
            const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            const shifts = getShiftsForDate(schedule, dateStr);
            
            html += '<div style="padding: 5px; border: 1px solid #ddd; min-height: 80px; background: white;">';
            html += '<div style="font-weight: bold; margin-bottom: 5px;">' + day + '</div>';
            
            shifts.forEach(function(shift) {
                const color = shiftTypeColors[shift.type] || '#999';
                html += '<div style="background: ' + color + '; color: white; padding: 2px 5px; margin-bottom: 2px; font-size: 11px; border-radius: 2px; cursor: pointer;" onclick="viewShiftDetails(\'' + shift.id + '\')">';
                html += sanitizeHTML(shift.type) + ' - ' + sanitizeHTML(shift.crew || 'Unassigned');
                html += '</div>';
            });
            
            html += '</div>';
        }
        
        grid.textContent = html;
    }

    /**
     * Render week view
     */
    function renderWeekView(grid, label, schedule) {
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        label.textContent = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' - ' + 
                          endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        // Set grid to 7 columns
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        
        const html = '';
        
        // Day headers
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (const i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            html += '<div style="font-weight: bold; text-align: center; padding: 10px; background: #f5f5f5;">';
            html += dayNames[i] + '<br>' + date.getDate();
            html += '</div>';
        }
        
        // Days
        for (const i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const shifts = getShiftsForDate(schedule, dateStr);
            
            html += '<div style="padding: 10px; border: 1px solid #ddd; min-height: 200px; background: white;">';
            
            shifts.forEach(function(shift) {
                const color = shiftTypeColors[shift.type] || '#999';
                html += '<div style="background: ' + color + '; color: white; padding: 8px; margin-bottom: 5px; border-radius: 3px; cursor: pointer;" onclick="viewShiftDetails(\'' + shift.id + '\')">';
                html += '<strong>' + shift.type + '</strong><br>';
                html += '<small>' + (shift.crew || 'Unassigned') + '</small>';
                html += '</div>';
            });
            
            html += '</div>';
        }
        
        grid.textContent = html;
    }

    /**
     * Render day view
     */
    function renderDayView(grid, label, schedule) {
        label.textContent = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        
        // Set grid to 1 column
        grid.style.gridTemplateColumns = '1fr';
        
        const dateStr = currentDate.toISOString().split('T')[0];
        const shifts = getShiftsForDate(schedule, dateStr);
        
        const html = '';
        
        if (shifts.length === 0) {
            html = '<div style="text-align: center; padding: 40px; color: #999;">No shifts scheduled for this day</div>';
        } else {
            shifts.forEach(function(shift) {
                const color = shiftTypeColors[shift.type] || '#999';
                html += '<div style="background: ' + color + '; color: white; padding: 20px; margin-bottom: 15px; border-radius: 5px; cursor: pointer;" onclick="viewShiftDetails(\'' + shift.id + '\')">';
                html += '<h3 style="margin: 0 0 10px 0;">' + sanitizeHTML(shift.type) + ' Shift</h3>';
                html += '<p style="margin: 5px 0;"><strong>Crew:</strong> ' + sanitizeHTML(shift.crew || 'Unassigned') + '</p>';
                html += '<p style="margin: 5px 0;"><strong>Time:</strong> ' + sanitizeHTML(shift.time || 'TBD') + '</p>';
                html += '</div>';
            });
        }
        
        grid.textContent = html;
    }

    /**
     * Get shifts for a specific date
     */
    function getShiftsForDate(schedule, dateStr) {
        if (!schedule || !schedule.crews) return [];
        
        return schedule.crews.filter(function(crew) {
            return crew.date === dateStr;
        }).map(function(crew) {
            return {
                id: crew.id,
                type: crew.shiftType || 'Day',
                crew: crew.crewName || 'Unassigned',
                time: crew.time || ''
            };
        });
    }

    /**
     * View shift details (placeholder for modal)
     */
    function viewShiftDetails(shiftId) {
        Logger.debug('View shift details:', shiftId);
        // TODO: Open modal with shift details
    }

    // Public API
    return {
        setView: setCalendarView,
        changePeriod: changeCalendarPeriod,
        render: renderCalendar,
        viewShiftDetails: viewShiftDetails
    };
})();

// Make functions globally available for onclick handlers
window.setCalendarView = EnhancedCalendar.setView;
window.changeCalendarPeriod = EnhancedCalendar.changePeriod;
window.viewShiftDetails = EnhancedCalendar.viewShiftDetails;