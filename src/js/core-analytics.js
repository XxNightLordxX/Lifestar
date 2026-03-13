/**
 * Core Analytics Module for Lifestar Ambulance Scheduling System
 * Consolidates: analytics-charts.js, data-visualization.js, export-reports.js
 * 
 * Provides charts, data visualization, and export functionality
 */

(function() {
    'use strict';

    // ============================================
    // ANALYTICS STATE
    // ============================================
    const AnalyticsState = {
        charts: {},
        initialized: false
    };

    // ============================================
    // ANALYTICS MANAGER
    // ============================================
    const AnalyticsManager = {
        /**
         * Initialize analytics
         */
        init() {
            if (AnalyticsState.initialized) return;
            AnalyticsState.initialized = true;

            // Wait for Chart.js
            this.waitForChartJS(() => {
                Logger.debug('✅ AnalyticsManager initialized');
            });
        },

        /**
         * Wait for Chart.js to load
         */
        waitForChartJS(callback, attempts = 0) {
            if (typeof Chart !== 'undefined') {
                callback();
            } else if (attempts < 20) {
                setTimeout(() => this.waitForChartJS(callback, attempts + 1), 500);
            } else {
                Logger.warn('Chart.js not loaded after 10 seconds');
            }
        },

        /**
         * Update all charts
         */
        updateCharts() {
            if (typeof Chart === 'undefined') return;

            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const shifts = this.getAllShifts(schedules);

            this.createStaffHoursChart(users, shifts);
            this.createShiftTypeChart(shifts);
            this.createAvailabilityChart(schedules);
            this.updateStats(users, shifts);
        },

        /**
         * Get all shifts from schedules
         */
        getAllShifts(schedules) {
            const shifts = [];
            schedules.forEach(schedule => {
                if (schedule.shifts) {
                    shifts.push(...schedule.shifts);
                }
            });
            return shifts;
        },

        /**
         * Create staff hours chart
         */
        createStaffHoursChart(users, shifts) {
            const canvas = document.getElementById('staffHoursChart');
            if (!canvas) return;

            const staffHours = {};
            users.filter(u => u.role === 'paramedic' || u.role === 'emt').forEach(user => {
                staffHours[user.id] = { name: user.fullName || user.username, hours: 0, shifts: 0 };
            });

            shifts.forEach(shift => {
                if (shift.staffId && staffHours[shift.staffId]) {
                    staffHours[shift.staffId].hours += shift.hours || 8;
                    staffHours[shift.staffId].shifts += 1;
                }
            });

            const data = Object.values(staffHours).sort((a, b) => b.hours - a.hours).slice(0, 10);

            // Destroy existing chart
            if (AnalyticsState.charts.staffHours) {
                AnalyticsState.charts.staffHours.destroy();
            }

            AnalyticsState.charts.staffHours = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: data.map(d => d.name),
                    datasets: [{
                        label: 'Hours Worked',
                        data: data.map(d => d.hours),
                        backgroundColor: 'rgba(99, 102, 241, 0.8)',
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        },

        /**
         * Create shift type chart
         */
        createShiftTypeChart(shifts) {
            const canvas = document.getElementById('shiftTypeChart');
            if (!canvas) return;

            const typeCount = {};
            shifts.forEach(shift => {
                const type = shift.type || 'Day';
                typeCount[type] = (typeCount[type] || 0) + 1;
            });

            const labels = Object.keys(typeCount);
            const data = Object.values(typeCount);
            const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'];

            if (AnalyticsState.charts.shiftType) {
                AnalyticsState.charts.shiftType.destroy();
            }

            AnalyticsState.charts.shiftType = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors.slice(0, labels.length)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        },

        /**
         * Create availability trend chart
         */
        createAvailabilityChart(schedules) {
            const canvas = document.getElementById('availabilityTrendChart');
            if (!canvas) return;

            // Generate last 30 days
            const labels = [];
            const data = [];
            for (let i = 29; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

                // Count shifts for this date
                const dateStr = date.toISOString().split('T')[0];
                let count = 0;
                schedules.forEach(s => {
                    if (s.shifts) {
                        count += s.shifts.filter(shift => shift.date === dateStr).length;
                    }
                });
                data.push(count);
            }

            if (AnalyticsState.charts.availability) {
                AnalyticsState.charts.availability.destroy();
            }

            AnalyticsState.charts.availability = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Shifts',
                        data,
                        borderColor: 'rgba(99, 102, 241, 1)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        },

        /**
         * Update stats display
         */
        updateStats(users, shifts) {
            const totalShifts = document.getElementById('vizTotalShifts');
            const totalHours = document.getElementById('vizTotalHours');
            const activeStaff = document.getElementById('vizActiveStaff');
            const totalCost = document.getElementById('vizTotalCost');

            if (totalShifts) totalShifts.textContent = shifts.length;
            if (totalHours) totalHours.textContent = shifts.reduce((sum, s) => sum + (s.hours || 8), 0);

            const activeUsers = users.filter(u => u.role === 'paramedic' || u.role === 'emt').length;
            if (activeStaff) activeStaff.textContent = activeUsers;

            const cost = shifts.reduce((sum, s) => sum + ((s.hours || 8) * 25), 0); // $25/hr avg
            if (totalCost) totalCost.textContent = '$' + cost.toLocaleString();
        }
    };

    // ============================================
    // DATA VISUALIZATION
    // ============================================
    const DataVisualization = {
        /**
         * Load visualization section
         */
        loadSection() {
            const container = document.getElementById('bossDataVisualization');
            if (!container) return;

            container.innerHTML = `
                <div class="data-visualization-container">
                    <div class="viz-header">
                        <h2>📊 Data Visualization</h2>
                        <div class="viz-controls">
                            <select id="vizTimeRange" class="form-control">
                                <option value="7">Last 7 Days</option>
                                <option value="30" selected>Last 30 Days</option>
                                <option value="90">Last 90 Days</option>
                            </select>
                            <button onclick="DataVisualization.refresh()" class="btn btn-primary">🔄 Refresh</button>
                        </div>
                    </div>

                    <div class="viz-stats-grid">
                        <div class="viz-stat-card">
                            <div class="viz-stat-value" id="vizTotalShifts">0</div>
                            <div class="viz-stat-label">Total Shifts</div>
                        </div>
                        <div class="viz-stat-card">
                            <div class="viz-stat-value" id="vizTotalHours">0</div>
                            <div class="viz-stat-label">Total Hours</div>
                        </div>
                        <div class="viz-stat-card">
                            <div class="viz-stat-value" id="vizActiveStaff">0</div>
                            <div class="viz-stat-label">Active Staff</div>
                        </div>
                        <div class="viz-stat-card">
                            <div class="viz-stat-value" id="vizTotalCost">$0</div>
                            <div class="viz-stat-label">Est. Cost</div>
                        </div>
                    </div>

                    <div class="viz-charts-grid">
                        <div class="viz-chart-card">
                            <h3>📈 Staff Hours</h3>
                            <canvas id="staffHoursChart" height="200"></canvas>
                        </div>
                        <div class="viz-chart-card">
                            <h3>📊 Shift Types</h3>
                            <canvas id="shiftTypeChart" height="200"></canvas>
                        </div>
                        <div class="viz-chart-card wide">
                            <h3>📉 30-Day Trend</h3>
                            <canvas id="availabilityTrendChart" height="150"></canvas>
                        </div>
                    </div>
                </div>
            `;

            AnalyticsManager.updateCharts();
        },

        /**
         * Refresh charts
         */
        refresh() {
            AnalyticsManager.updateCharts();
            if (typeof showToast === 'function') {
                showToast('Charts refreshed', 'success');
            }
        }
    };

    // ============================================
    // EXPORT REPORTS
    // ============================================
    const ExportReports = {
        /**
         * Export schedules to PDF
         */
        exportSchedulesToPDF(scheduleId = null) {
            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');

            let toExport = scheduleId ? schedules.filter(s => s.id === scheduleId) : schedules;
            if (toExport.length === 0) {
                if (typeof showToast === 'function') showToast('No schedules to export', 'error');
                return;
            }

            // Generate HTML for print
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                if (typeof showToast === 'function') showToast('Popup blocked. Please allow popups for this site.', 'error');
                return;
            }
            let html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Lifestar Schedule Report</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { color: #6366f1; text-align: center; }
                        .schedule { margin-bottom: 30px; page-break-inside: avoid; }
                        .schedule-header { background: #6366f1; color: white; padding: 10px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background: #f5f5f5; }
                    </style>
                </head>
                <body>
                    <h1>Lifestar Ambulance Schedule Report</h1>
                    <p>Generated: ${new Date().toLocaleString()}</p>
            `;

            toExport.forEach(schedule => {
                html += `
                    <div class="schedule">
                        <div class="schedule-header"><h2>${this.escapeHtml(schedule.name)}</h2></div>
                        <p><strong>Period:</strong> ${schedule.startDate} to ${schedule.endDate}</p>
                        <table>
                            <thead><tr><th>Date</th><th>Shift</th><th>Staff</th><th>Station</th></tr></thead>
                            <tbody>
                `;

                if (schedule.shifts) {
                    schedule.shifts.forEach(shift => {
                        const staff = users.find(u => u.id === shift.staffId);
                        html += `
                            <tr>
                                <td>${shift.date || '-'}</td>
                                <td>${this.escapeHtml(shift.type || 'Day')}</td>
                                <td>${staff ? this.escapeHtml(staff.fullName || staff.username) : 'Unassigned'}</td>
                                <td>${this.escapeHtml(shift.station || 'Main')}</td>
                            </tr>
                        `;
                    });
                }

                html += '</tbody></table></div>';
            });

            html += '</body></html>';
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.print();
        },

        /**
         * Export to CSV
         */
        exportToCSV(type = 'schedules') {
            let data = [];
            let filename = '';

            if (type === 'schedules') {
                const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
                const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');

                schedules.forEach(schedule => {
                    if (schedule.shifts) {
                        schedule.shifts.forEach(shift => {
                            const staff = users.find(u => u.id === shift.staffId);
                            data.push({
                                Schedule: schedule.name,
                                Date: shift.date,
                                Shift: shift.type,
                                Staff: staff?.fullName || 'Unassigned',
                                Station: shift.station || 'Main'
                            });
                        });
                    }
                });
                filename = 'schedules.csv';
            } else if (type === 'staff') {
                const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
                users.forEach(user => {
                    data.push({
                        Name: user.fullName || user.username,
                        Role: user.role,
                        Email: user.email || '',
                        Phone: user.phone || ''
                    });
                });
                filename = 'staff.csv';
            }

            if (data.length === 0) {
                if (typeof showToast === 'function') showToast('No data to export', 'error');
                return;
            }

            // Convert to CSV
            const headers = Object.keys(data[0]);
            const csv = [
                headers.join(','),
                ...data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            // Download
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            if (typeof showToast === 'function') showToast('Export complete', 'success');
        },

        /**
         * Export payroll report
         */
        exportPayrollReport() {
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');

            const payroll = {};
            users.filter(u => u.role === 'paramedic' || u.role === 'emt').forEach(user => {
                payroll[user.id] = { name: user.fullName || user.username, hours: 0, shifts: 0 };
            });

            schedules.forEach(schedule => {
                if (schedule.shifts) {
                    schedule.shifts.forEach(shift => {
                        if (shift.staffId && payroll[shift.staffId]) {
                            payroll[shift.staffId].hours += shift.hours || 8;
                            payroll[shift.staffId].shifts += 1;
                        }
                    });
                }
            });

            // Generate report
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                if (typeof showToast === 'function') showToast('Popup blocked. Please allow popups for this site.', 'error');
                return;
            }
            let html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Payroll Report</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; }
                        th { background: #f5f5f5; }
                    </style>
                </head>
                <body>
                    <h1>Payroll Report</h1>
                    <p>Generated: ${new Date().toLocaleString()}</p>
                    <table>
                        <thead><tr><th>Staff</th><th>Hours</th><th>Shifts</th><th>Est. Pay ($25/hr)</th></tr></thead>
                        <tbody>
            `;

            Object.values(payroll).forEach(p => {
                html += `<tr><td>${this.escapeHtml(p.name)}</td><td>${p.hours}</td><td>${p.shifts}</td><td>$${p.hours * 25}</td></tr>`;
            });

            html += '</tbody></table></body></html>';
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.print();
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
    AnalyticsManager.init();

    // ============================================
    // EXPOSE TO GLOBAL SCOPE
    // ============================================
    window.AnalyticsState = AnalyticsState;
    window.ChartAnalyticsManager = AnalyticsManager;
    window.DataVisualization = DataVisualization;
    window.ExportReports = ExportReports;

    // Backward compatibility aliases
    window.initializeAnalyticsCharts = () => AnalyticsManager.updateCharts();
    window.updateAnalyticsCharts = () => AnalyticsManager.updateCharts();
    window.exportSchedulesToPDF = (id) => ExportReports.exportSchedulesToPDF(id);
    window.exportToCSV = (type) => ExportReports.exportToCSV(type);
    window.exportPayrollReport = () => ExportReports.exportPayrollReport();

    Logger.debug('✅ Core Analytics Module loaded');

})();