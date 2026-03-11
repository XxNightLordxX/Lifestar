/**
 * Analytics Charts - Advanced Visualizations for Lifestar Scheduling
 * Creates and manages charts using Chart.js
 */

// Chart instances
let staffHoursChart = null;
let shiftTypeChart = null;
let availabilityTrendChart = null;

/**
 * Initialize analytics charts when analytics section is loaded
 */
function initializeAnalyticsCharts() {
    // Wait for Chart.js to load
    if (typeof Chart === 'undefined') {
        Logger.warn('Chart.js not loaded yet, retrying in 500ms...');
        setTimeout(initializeAnalyticsCharts, 500);
        return;
    }
    
    Logger.debug('Initializing analytics charts...');
    updateAnalyticsCharts();
}

/**
 * Update all analytics charts with current data
 */
function updateAnalyticsCharts() {
    if (typeof Chart === 'undefined') {
        return;
    }
    
    // Get data from localStorage
    const users = JSON.parse(localStorage.getItem('lifestar_users') || '[]');
    const schedules = JSON.parse(localStorage.getItem('lifestar_schedules') || '[]');
    const shifts = JSON.parse(localStorage.getItem('lifestar_shifts') || '[]');
    
    // Calculate analytics data
    const staffData = calculateStaffHoursData(users, shifts);
    const shiftTypeData = calculateShiftTypeData(shifts);
    const availabilityData = calculateAvailabilityTrend(schedules);
    
    // Create/update charts
    createStaffHoursChart(staffData);
    createShiftTypeChart(shiftTypeData);
    createAvailabilityTrendChart(availabilityData);
}

/**
 * Calculate hours worked by each staff member
 */
function calculateStaffHoursData(users, shifts) {
    const staffHours = {};
    
    // Initialize all staff with 0 hours
    users.filter(u => u.role === 'paramedic' || u.role === 'emt').forEach(user => {
        staffHours[user.username] = {
            name: user.username,
            hours: 0,
            shifts: 0
        };
    });
    
    // Calculate hours from shifts
    shifts.forEach(shift => {
        if (shift.assignedStaff && shift.assignedStaff.length > 0) {
            shift.assignedStaff.forEach(staffId => {
                const user = users.find(u => u.id === staffId);
                if (user && staffHours[user.username]) {
                    staffHours[user.username].hours += shift.hours || 8;
                    staffHours[user.username].shifts += 1;
                }
            });
        }
    });
    
    return Object.values(staffHours).sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate shift distribution by type
 */
function calculateShiftTypeData(shifts) {
    const shiftTypes = {
        'Day': 0,
        'Night': 0,
        'Evening': 0,
        'Overtime': 0,
        'Other': 0
    };
    
    shifts.forEach(shift => {
        const type = shift.type || 'Other';
        if (shiftTypes[type] !== undefined) {
            shiftTypes[type]++;
        } else {
            shiftTypes['Other']++;
        }
    });
    
    return shiftTypes;
}

/**
 * Calculate availability trend over time (last 30 days)
 */
function calculateAvailabilityTrend(schedules) {
    const days = 30;
    const trend = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        // Count scheduled shifts for this date
        let scheduledCount = 0;
        let availableCount = 0;
        
        schedules.forEach(schedule => {
            if (schedule.shifts) {
                schedule.shifts.forEach(shift => {
                    if (shift.date === dateStr) {
                        scheduledCount++;
                        if (shift.assignedStaff && shift.assignedStaff.length > 0) {
                            availableCount += shift.assignedStaff.length;
                        }
                    }
                });
            }
        });
        
        trend.push({
            date: dateStr,
            scheduled: scheduledCount,
            available: availableCount,
            dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        });
    }
    
    return trend;
}

/**
 * Create staff hours bar chart
 */
function createStaffHoursChart(staffData) {
    const ctx = document.getElementById('staffHoursChart');
    if (!ctx) return;
    
    const labels = staffData.map(s => s.name);
    const hoursData = staffData.map(s => s.hours);
    const shiftsData = staffData.map(s => s.shifts);
    
    // Destroy existing chart if it exists
    if (staffHoursChart) {
        staffHoursChart.destroy();
    }
    
    staffHoursChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Hours Worked',
                    data: hoursData,
                    backgroundColor: 'rgba(255, 107, 107, 0.7)',
                    borderColor: 'rgba(255, 107, 107, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Number of Shifts',
                    data: shiftsData,
                    backgroundColor: 'rgba(52, 206, 87, 0.7)',
                    borderColor: 'rgba(52, 206, 87, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Hours'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false,
                    },
                    title: {
                        display: true,
                        text: 'Shifts'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: false
                }
            }
        }
    });
}

/**
 * Create shift type pie chart
 */
function createShiftTypeChart(shiftTypeData) {
    const ctx = document.getElementById('shiftTypeChart');
    if (!ctx) return;
    
    const labels = Object.keys(shiftTypeData);
    const data = Object.values(shiftTypeData);
    
    // Destroy existing chart if it exists
    if (shiftTypeChart) {
        shiftTypeChart.destroy();
    }
    
    const colors = [
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 99, 132, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)'
    ];
    
    const borderColors = [
        'rgba(54, 162, 235, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(153, 102, 255, 1)'
    ];
    
    shiftTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                title: {
                    display: false
                }
            }
        }
    });
}

/**
 * Create availability trend line chart
 */
function createAvailabilityTrendChart(availabilityData) {
    const ctx = document.getElementById('availabilityTrendChart');
    if (!ctx) return;
    
    const labels = availabilityData.map(d => d.dateLabel);
    const scheduledData = availabilityData.map(d => d.scheduled);
    const availableData = availabilityData.map(d => d.available);
    
    // Destroy existing chart if it exists
    if (availabilityTrendChart) {
        availabilityTrendChart.destroy();
    }
    
    availabilityTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Scheduled Shifts',
                    data: scheduledData,
                    borderColor: 'rgba(255, 107, 107, 1)',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Available Staff',
                    data: availableData,
                    borderColor: 'rgba(52, 206, 87, 1)',
                    backgroundColor: 'rgba(52, 206, 87, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Count'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: false
                }
            }
        }
    });
}

/**
 * Update analytics charts when analytics section is shown
 */
window.addEventListener('DOMContentLoaded', function() {
    // Initialize charts when analytics section is shown
    const originalShowBossSection = window.showBossSection;
    if (originalShowBossSection) {
        window.showBossSection = function(section) {
            originalShowBossSection(section);
            if (section === 'analytics') {
                setTimeout(initializeAnalyticsCharts, 500);
            }
        };
    }
});