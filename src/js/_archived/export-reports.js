/**
 * Export & Reports Module
 * Handles exporting schedules, staff directory, and payroll reports to various formats
 */

(function() {
    'use strict';

    const ExportReports = {
        /**
         * Export schedules to PDF
         */
        exportSchedulesToPDF: function(scheduleId = null) {
            try {
                const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
                const crews = JSON.parse(localStorage.getItem('lifestarCrews') || '[]');
                const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
                
                let schedulesToExport = schedules;
                if (scheduleId) {
                    schedulesToExport = schedules.filter(s => s.id === scheduleId);
                }
                
                if (schedulesToExport.length === 0) {
                    showToast('No schedules to export', 'error');
                    return;
                }

                // Generate HTML for PDF
                let html = `;
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Lifestar Schedule Report</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h1 { color: #6366f1; text-align: center; }
                            .schedule { margin-bottom: 30px; page-break-inside: avoid; }
                            .schedule-header { background: #6366f1; color: white; padding: 10px; border-radius: 5px; }
                            .schedule-info { margin: 10px 0; }
                            .crew-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                            .crew-table th, .crew-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                            .crew-table th { background: #f5f5f5; }
                            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <h1>Lifestar Ambulance Schedule Report</h1>
                        <p>Generated: ${new Date().toLocaleString()}</p>
                `;

                schedulesToExport.forEach(schedule => {
                    const scheduleCrews = crews.filter(c => c.scheduleId === schedule.id);
                    
                    html += `
                        <div class="schedule">
                            <div class="schedule-header">
                                <h2>${schedule.name}</h2>
                            </div>
                            <div class="schedule-info">
                                <p><strong>Status:</strong> ${schedule.status}</p>
                                <p><strong>Period:</strong> ${schedule.startDate} to ${schedule.endDate}</p>
                                <p><strong>Location:</strong> ${schedule.location || 'Main Station'}</p>
                            </div>
                            <h3>Crew Assignments</h3>
                            <table class="crew-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Shift Type</th>
                                        <th>Paramedic</th>
                                        <th>EMT</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    scheduleCrews.forEach(crew => {
                        const paramedic = users.find(u => u.id === crew.paramedicId);
                        const emt = users.find(u => u.id === crew.emtId);
                        
                        html += `
                            <tr>
                                <td>${crew.date}</td>
                                <td>${crew.shiftType}</td>
                                <td>${paramedic ? paramedic.name : 'Unassigned'}</td>
                                <td>${emt ? emt.name : 'Unassigned'}</td>
                            </tr>
                        `;
                    });

                    html += `
                                </tbody>
                            </table>
                        </div>
                    `;
                });

                html += `
                        <div class="footer">
                            <p>Lifestar Ambulance Scheduling System</p>
                        </div>
                    </body>
                    </html>
                `;

                // Create and print
                const printWindow = window.open('', '_blank');
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.print();
                
                showToast('Schedule exported to PDF', 'success');
            } catch (error) {
                Logger.error('Error exporting schedule to PDF:', error);
                showToast('Failed to export schedule', 'error');
            }
        },

        /**
         * Export staff directory to CSV
         */
        exportStaffDirectoryToCSV: function() {
            try {
                const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
                const locations = JSON.parse(localStorage.getItem('lifestarLocations') || '[]');
                
                if (users.length === 0) {
                    showToast('No staff to export', 'error');
                    return;
                }

                // CSV header
                let csv = 'Name,Username,Role,Email,Phone,Location,Certification,Status\n';

                // CSV rows
                users.forEach(user => {
                    const location = locations.find(l => l.id === user.locationId);
                    const locationName = location ? location.name : 'Unassigned';
                    
                    // Escape CSV values
                    const escapeCSV = (val) => {
                        if (!val) return '';
                        return `"${String(val).replace(/"/g, '""')}"`;
                    };

                    csv += [
                        escapeCSV(user.name),
                        escapeCSV(user.username),
                        escapeCSV(user.role),
                        escapeCSV(user.email || ''),
                        escapeCSV(user.phone || ''),
                        escapeCSV(locationName),
                        escapeCSV(user.certification || ''),
                        escapeCSV(user.status || 'Active');
                    ].join(',') + '\n';
                });

                // Create download
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                
                link.setAttribute('href', url);
                link.setAttribute('download', `staff-directory-${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                showToast('Staff directory exported to CSV', 'success');
            } catch (error) {
                Logger.error('Error exporting staff directory:', error);
                showToast('Failed to export staff directory', 'error');
            }
        },

        /**
         * Export payroll report to CSV
         */
        exportPayrollReportToCSV: function(reportId = null) {
            try {
                const reports = JSON.parse(localStorage.getItem('lifestarPayrollReports') || '[]');
                
                let reportsToExport = reports;
                if (reportId) {
                    reportsToExport = reports.filter(r => r.id === reportId);
                }
                
                if (reportsToExport.length === 0) {
                    showToast('No payroll reports to export', 'error');
                    return;
                }

                reportsToExport.forEach(report => {
                    // CSV header
                    let csv = `Payroll Report - ${report.period}\n`;
                    csv += `Generated: ${new Date(report.generatedAt).toLocaleString()}\n`;
                    csv += `Total Hours: ${report.totalHours}\n`;
                    csv += `Total Pay: $${report.totalPay.toFixed(2)}\n\n`;
                    csv += 'Name,Role,Regular Hours,Overtime Hours,Total Hours,Hourly Rate,Regular Pay,Overtime Pay,Total Pay\n';

                    // CSV rows
                    report.entries.forEach(entry => {
                        const escapeCSV = (val) => {
                            if (!val) return '';
                            return `"${String(val).replace(/"/g, '""')}"`;
                        };

                        csv += [
                            escapeCSV(entry.name),
                            escapeCSV(entry.role),
                            entry.regularHours,
                            entry.overtimeHours,
                            entry.totalHours,
                            entry.hourlyRate,
                            entry.regularPay.toFixed(2),
                            entry.overtimePay.toFixed(2),
                            entry.totalPay.toFixed(2)
                        ].join(',') + '\n';
                    });

                    // Create download
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    const url = URL.createObjectURL(blob);
                    
                    link.setAttribute('href', url);
                    link.setAttribute('download', `payroll-report-${report.period.replace(/\s+/g, '-')}.csv`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
                
                showToast('Payroll report exported to CSV', 'success');
            } catch (error) {
                Logger.error('Error exporting payroll report:', error);
                showToast('Failed to export payroll report', 'error');
            }
        },

        /**
         * Generate monthly summary report
         */
        generateMonthlySummary: function(year, month) {
            try {
                const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
                const crews = JSON.parse(localStorage.getItem('lifestarCrews') || '[]');
                const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
                const timeoff = JSON.parse(localStorage.getItem('lifestarTimeoff') || '[]');
                
                // Filter for the specified month
                const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
                const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-31`;
                
                const monthSchedules = schedules.filter(s => s.startDate <= monthEnd && s.endDate >= monthStart);
                const monthCrews = crews.filter(c => c.date >= monthStart && c.date <= monthEnd);
                const monthTimeoff = timeoff.filter(t => t.startDate >= monthStart && t.startDate <= monthEnd);
                
                // Calculate statistics
                const totalShifts = monthCrews.length;
                const totalHours = monthCrews.reduce((sum, c) => {
                    const hours = this.getShiftHours(c.shiftType);
                    return sum + hours;
                }, 0);
                
                const approvedTimeoff = monthTimeoff.filter(t => t.status === 'approved').length;
                const pendingTimeoff = monthTimeoff.filter(t => t.status === 'pending').length;
                
                // Staff utilization
                const staffUtilization = {};
                users.filter(u => u.role !== 'super').forEach(user => {
                    const userCrews = monthCrews.filter(c => c.paramedicId === user.id || c.emtId === user.id);
                    const userHours = userCrews.reduce((sum, c) => sum + this.getShiftHours(c.shiftType), 0);
                    staffUtilization[user.name] = {
                        shifts: userCrews.length,
                        hours: userHours
                    };
                });

                // Generate HTML report
                const reportHtml = `;
                    <div style="padding: 20px;">
                        <h2 style="color: #6366f1;">Monthly Summary Report</h2>
                        <p><strong>Period:</strong> ${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
                        
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0;">
                            <div style="background: #e0e7ff; padding: 15px; border-radius: 8px;">
                                <h3 style="margin: 0 0 10px 0; color: #4338ca;">Total Shifts</h3>
                                <p style="font-size: 24px; margin: 0;">${totalShifts}</p>
                            </div>
                            <div style="background: #dcfce7; padding: 15px; border-radius: 8px;">
                                <h3 style="margin: 0 0 10px 0; color: #166534;">Total Hours</h3>
                                <p style="font-size: 24px; margin: 0;">${totalHours}</p>
                            </div>
                            <div style="background: #fef3c7; padding: 15px; border-radius: 8px;">
                                <h3 style="margin: 0 0 10px 0; color: #92400e;">Approved Time Off</h3>
                                <p style="font-size: 24px; margin: 0;">${approvedTimeoff}</p>
                            </div>
                            <div style="background: #fee2e2; padding: 15px; border-radius: 8px;">
                                <h3 style="margin: 0 0 10px 0; color: #991b1b;">Pending Requests</h3>
                                <p style="font-size: 24px; margin: 0;">${pendingTimeoff}</p>
                            </div>
                        </div>
                        
                        <h3 style="margin-top: 30px;">Staff Utilization</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                            <thead>
                                <tr style="background: #f5f5f5;">
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Staff Member</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Shifts</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(staffUtilization).map(([name, data]) => `
                                    <tr>
                                        <td style="border: 1px solid #ddd; padding: 8px;">${name}</td>
                                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${data.shifts}</td>
                                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${data.hours}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        
                        <div style="margin-top: 30px; text-align: center;">
                            <button onclick="ExportReports.exportMonthlySummaryToPDF(${year}, ${month})" 
                                    style="background: #6366f1; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">;
                                Export to PDF
                            </button>
                        </div>
                    </div>
                `;

                return reportHtml;
            } catch (error) {
                Logger.error('Error generating monthly summary:', error);
                return '<p style="color: red;">Error generating report</p>';
            }
        },

        /**
         * Export monthly summary to PDF
         */
        exportMonthlySummaryToPDF: function(year, month) {
            try {
                const html = `;
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Monthly Summary Report</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h2 { color: #6366f1; }
                            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                            th { background: #f5f5f5; }
                        </style>
                    </head>
                    <body>
                        ${this.generateMonthlySummary(year, month)}
                    </body>
                    </html>
                `;

                const printWindow = window.open('', '_blank');
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.print();
                
                showToast('Monthly summary exported to PDF', 'success');
            } catch (error) {
                Logger.error('Error exporting monthly summary:', error);
                showToast('Failed to export monthly summary', 'error');
            }
        },

        /**
         * Get hours for shift type
         */
        getShiftHours: function(shiftType) {
            const hours = {
                'Day': 8,
                'Night': 12,
                'Evening': 8,
                '24-Hour': 24,
                'Overtime': 4
            };
            return hours[shiftType] || 8;
        },

        /**
         * Load reports section
         */
        loadReportsSection: function() {
            // Set default month to current month
            const now = new Date();
            document.getElementById('reportYear').value = now.getFullYear();
            document.getElementById('reportMonth').value = now.getMonth();
        }
    };

    // Make available globally
    window.ExportReports = ExportReports;
    
    // Global function for generating monthly summary report
    window.generateMonthlySummaryReport = function() {
        const year = parseInt(document.getElementById('reportYear').value);
        const month = parseInt(document.getElementById('reportMonth').value);
        const reportHtml = ExportReports.generateMonthlySummary(year, month);
        document.getElementById('monthlySummaryReport').textContent = reportHtml;
    };
    
    Logger.debug('Export & Reports module loaded');
})();