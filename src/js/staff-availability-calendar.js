/**
 * Staff Availability Calendar Module
 * Visual calendar showing staff availability status
 */


const StaffAvailabilityCalendar = (function() {
    'use strict';

    const currentDate = new Date();

    const statusColors = {
        'available': '#4CAF50',
        'unavailable': '#F44336',
        'on-call': '#FF9800',
        'unknown': '#9E9E9E'
    };

    /**
     * Load the availability calendar
     */
    function loadAvailabilityCalendar() {
        const calendar = document.getElementById('availabilityCalendar');
        const label = document.getElementById('availabilityMonthYear');
        const staffFilter = document.getElementById('availabilityStaffFilter');
        
        if (!calendar) return;
        
        // Get staff
        const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
        const staff = users.filter(function(u) {
            return u.role === 'paramedic' || u.role === 'emt';
        });
        
        // Apply filter
        const filterValue = staffFilter ? staffFilter.value : '';
        if (filterValue) {
            staff = staff.filter(function(s) { return s.id === filterValue; });
        }
        
        // Populate staff filter if empty
        if (staffFilter && staffFilter.options.length === 1) {
            staff.forEach(function(s) {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.firstName + ' ' + s.lastName;
                staffFilter.appendChild(option);
            });
        }
        
        // Render calendar
        renderAvailabilityCalendar(calendar, label, staff);
    }

    /**
     * Render the availability calendar
     */
    function renderAvailabilityCalendar(calendar, label, staff) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        if (label) {
            label.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
        
        const html = '';
        
        // Header row with staff names
        html += '<table style="width: 100%; border-collapse: collapse;">';
        html += '<thead><tr><th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; min-width: 80px;">Date</th>';
        staff.forEach(function(s) {
            html += '<th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; min-width: 100px;">' + 
                   sanitizeHTML(s.firstName + ' ' + s.lastName) + '</th>';
        });
        html += '</tr></thead>';
        
        // Get days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        html += '<tbody>';
        
        for (const day = 1; day <= daysInMonth; day++) {
            const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            const date = new Date(year, month, day);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            
            html += '<tr>';
            html += '<td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">' + day + '<br><small>' + dayName + '</small></td>';
            
            staff.forEach(function(s) {
                const status = getStaffAvailability(s.id, dateStr);
                const color = statusColors[status] || statusColors['unknown'];
                const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
                
                html += '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">';
                html += '<div style="background: ' + color + '; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;" ';
                html += 'onclick="editStaffAvailability(\'' + s.id + '\', \'' + dateStr + '\')">';
                html += statusLabel;
                html += '</div>';
                html += '</td>';
            });
            
            html += '</tr>';
        }
        
        html += '</tbody></table>';
        calendar.textContent = html;
    }

    /**
     * Get staff availability for a specific date
     */
    function getStaffAvailability(staffId, dateStr) {
        // Get availability data from localStorage
        const availability = JSON.parse(localStorage.getItem('lifestarStaffAvailability') || '[]');
        const record = availability.find(function(a) {
            return a.staffId === staffId && a.date === dateStr;
        });
        
        return record ? record.status : 'unknown';
    }

    /**
     * Change the availability month
     */
    function changeAvailabilityMonth(direction) {
        currentDate.setMonth(currentDate.getMonth() + direction);
        loadAvailabilityCalendar();
    }

    /**
     * Edit staff availability (placeholder for modal)
     */
    function editStaffAvailability(staffId, dateStr) {
        Logger.debug('Edit availability for staff:', staffId, 'on date:', dateStr);
        // TODO: Open modal to edit availability
    }

    // Public API
    return {
        load: loadAvailabilityCalendar,
        changeMonth: changeAvailabilityMonth,
        editAvailability: editStaffAvailability
    };
})();

// Make functions globally available for onclick handlers
window.loadAvailabilityCalendar = StaffAvailabilityCalendar.load;
window.changeAvailabilityMonth = StaffAvailabilityCalendar.changeMonth;
window.editStaffAvailability = StaffAvailabilityCalendar.editAvailability;