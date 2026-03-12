/**
 * Payroll System for Lifestar Ambulance Scheduling
 * Handles hours tracking, rate calculation, and payroll reports
 */

// Payroll configuration
const PAYROLL_CONFIG = {
    STANDARD_HOURS_PER_WEEK: 40,
    OVERTIME_MULTIPLIER: 1.5,
    HOLIDAY_MULTIPLIER: 2.0,
    NIGHT_SHIFT_DIFFERENTIAL: 1.25,
    WEEKEND_MULTIPLIER: 1.5
};

// Shift type multipliers
const SHIFT_RATES = {
    'Day': 1.0,
    'Night': 1.25,
    'Evening': 1.15,
    'Overtime': 1.5
};

/**
 * Calculate hours worked for a shift
 * @param {Object} shift - Shift object with type and date
 * @returns {number} Hours worked
 */
function calculateShiftHoursByType(shift) {
    if (!shift) return 0;
    
    const hoursMap = {
        'Day': 8,
        'Night': 12,
        'Evening': 8,
        'Overtime': 4
    };
    
    return hoursMap[shift.type] || 8;
}

/**
 * Get employee pay rate
 * @param {string} employeeId - Employee ID
 * @returns {number} Hourly pay rate
 */
function getEmployeePayRate(employeeId) {
    const storedUsers = safeJSONParse(localStorage.getItem('lifestarUsers')) || safeJSONParse(localStorage.getItem('users')) || [];
    const employee = storedUsers.find(u => u.id === employeeId);
    
    // Default rates by role
    const defaultRates = {
        'paramedic': 35,
        'emt': 25
    };
    
    return employee?.payRate || defaultRates[employee?.role] || 30;
}

/**
 * Calculate pay for a single shift
 * @param {Object} shift - Shift object
 * @param {string} employeeId - Employee ID
 * @returns {Object} Pay details {regularHours, overtimeHours, regularPay, overtimePay, totalPay}
 */
function calculateShiftPay(shift, employeeId) {
    const baseRate = getEmployeePayRate(employeeId);
    const hours = calculateShiftHoursByType(shift);
    const shiftMultiplier = SHIFT_RATES[shift.type] || 1.0;
    
    // Determine if overtime (based on weekly hours would need tracking)
    const isOvertime = shift.type === 'Overtime';
    const effectiveMultiplier = isOvertime ? PAYROLL_CONFIG.OVERTIME_MULTIPLIER : shiftMultiplier;
    
    const regularHours = isOvertime ? 0 : hours;
    const overtimeHours = isOvertime ? hours : 0;
    
    const regularPay = regularHours * baseRate * shiftMultiplier;
    const overtimePay = overtimeHours * baseRate * PAYROLL_CONFIG.OVERTIME_MULTIPLIER;
    
    return {
        regularHours,
        overtimeHours,
        regularPay,
        overtimePay,
        totalPay: regularPay + overtimePay,
        baseRate,
        shiftType: shift.type
    };
}

/**
 * Calculate payroll for an employee for a date range
 * @param {string} employeeId - Employee ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Object} Payroll summary
 */
function calculateEmployeePayroll(employeeId, startDate, endDate) {
    const schedules = safeJSONParse(localStorage.getItem('lifestarSchedules')) || safeJSONParse(localStorage.getItem('schedules')) || [];
    const crews = safeJSONParse(localStorage.getItem('crews')) || [];
    
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    let totalRegularPay = 0;
    let totalOvertimePay = 0;
    let shiftDetails = [];
    
    // Find all shifts for this employee within date range
    schedules.forEach(schedule => {
        if (schedule.status !== 'published') return;
        
        const scheduleDate = new Date(schedule.date);
        if (scheduleDate < startDate || scheduleDate > endDate) return;
        
        // Find crew assignments for this schedule
        schedule.crewAssignments?.forEach(assignment => {
            if (assignment.employeeId === employeeId) {
                const shift = {
                    type: assignment.shiftType || 'Day',
                    date: schedule.date
                };
                
                const payDetails = calculateShiftPay(shift, employeeId);
                
                totalRegularHours += payDetails.regularHours;
                totalOvertimeHours += payDetails.overtimeHours;
                totalRegularPay += payDetails.regularPay;
                totalOvertimePay += payDetails.overtimePay;
                
                shiftDetails.push({
                    date: schedule.date,
                    scheduleName: schedule.name,
                    ...payDetails
                });
            }
        });
    });
    
    return {
        employeeId,
        employeeName: getEmployeeName(employeeId),
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        totalRegularHours,
        totalOvertimeHours,
        totalHours: totalRegularHours + totalOvertimeHours,
        totalRegularPay,
        totalOvertimePay,
        totalPay: totalRegularPay + totalOvertimePay,
        shifts: shiftDetails
    };
}

/**
 * Get employee name by ID
 * @param {string} employeeId - Employee ID
 * @returns {string} Employee name
 */
function getEmployeeName(employeeId) {
    const storedUsers = safeJSONParse(localStorage.getItem('lifestarUsers')) || safeJSONParse(localStorage.getItem('users')) || [];
    const employee = storedUsers.find(u => u.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown';
}

/**
 * Calculate payroll for all employees for a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Array of payroll records
 */
function calculateAllPayroll(startDate, endDate) {
    const storedUsers = safeJSONParse(localStorage.getItem('lifestarUsers')) || safeJSONParse(localStorage.getItem('users')) || [];
    const employees = (storedUsers || []).filter(u => u.role === 'paramedic' || u.role === 'emt');
    
    return employees.map(employee =>
        calculateEmployeePayroll(employee.id, startDate, endDate)
    );
}

/**
 * Generate payroll report for a pay period
 * @param {string} periodType - 'weekly', 'biweekly', or 'monthly'
 * @param {Date} referenceDate - Reference date for calculation
 * @returns {Object} Complete payroll report
 */
function generatePayrollReport(periodType = 'biweekly', referenceDate = new Date()) {
    let startDate, endDate;
    
    switch (periodType) {
        case 'weekly':
            // Start from Monday of current week
            startDate = new Date(referenceDate);
            startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            break;
            
        case 'biweekly':
            // Start from Monday of current biweekly period
            startDate = new Date(referenceDate);
            const weekNumber = Math.floor(startDate.getDate() / 7);
            if (weekNumber % 2 === 1) {
                startDate.setDate(startDate.getDate() - 7);
            }
            startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 13);
            endDate.setHours(23, 59, 59, 999);
            break;
            
        case 'monthly':
            // Start from first day of month
            startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
            endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
            
        default:
            throw new Error('Invalid period type. Use: weekly, biweekly, or monthly');
    }
    
    const payrollRecords = calculateAllPayroll(startDate, endDate);
    
    // Calculate summary
    const summary = payrollRecords.reduce((acc, record) => {
        acc.totalRegularHours += record.totalRegularHours;
        acc.totalOvertimeHours += record.totalOvertimeHours;
        acc.totalRegularPay += record.totalRegularPay;
        acc.totalOvertimePay += record.totalOvertimePay;
        return acc;
    }, {
        totalRegularHours: 0,
        totalOvertimeHours: 0,
        totalRegularPay: 0,
        totalOvertimePay: 0
    });
    
    return {
        periodType,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        generatedDate: new Date().toISOString(),
        summary: {
            ...summary,
            totalHours: summary.totalRegularHours + summary.totalOvertimeHours,
            totalPay: summary.totalRegularPay + summary.totalOvertimePay,
            employeeCount: payrollRecords.length
        },
        records: payrollRecords
    };
}

/**
 * Save payroll report to localStorage
 * @param {Object} report - Payroll report
 */
function savePayrollReport(report) {
    const reports = safeJSONParse(localStorage.getItem('payrollReports')) || [];
    reports.push({
        id: Date.now(),
        ...report
    });
    localStorage.setItem('payrollReports', JSON.stringify(reports));
}

/**
 * Get all saved payroll reports
 * @returns {Array} Array of saved reports
 */
function getPayrollReports() {
    return safeJSONParse(localStorage.getItem('payrollReports')) || [];
}

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

/**
 * Load payroll dashboard section
 */
/**
 * Generate payroll summary cards HTML
 * @param {Object} report - Payroll report object
 * @returns {string} HTML string
 */
function generatePayrollSummaryCards(report) {
    return `;
        <div class="payroll-summary-cards">
            <div class="summary-card">
                <h3>Total Payroll</h3>
                <p class="amount">${formatCurrency(report.summary.totalPay)}</p>
            </div>
            <div class="summary-card">
                <h3>Total Hours</h3>
                <p class="hours">${report.summary.totalHours.toFixed(1)}</p>
            </div>
            <div class="summary-card">
                <h3>Regular Pay</h3>
                <p class="amount">${formatCurrency(report.summary.totalRegularPay)}</p>
            </div>
            <div class="summary-card">
                <h3>Overtime Pay</h3>
                <p class="amount">${formatCurrency(report.summary.totalOvertimePay)}</p>
            </div>
        </div>
    `;
}

/**
 * Generate payroll header HTML
 * @returns {string} HTML string
 */
function generatePayrollHeader() {
    return `;
        <div class="payroll-header">
            <h2>Payroll Management</h2>
            <div class="payroll-controls">
                <select id="payrollPeriodType" onchange="updatePayrollDisplay()">
                    <option value="weekly">Weekly</option>
                    <option value="biweekly" selected>Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
                <input type="date" id="payrollReferenceDate" onchange="updatePayrollDisplay()">
                <button class="btn-primary" onclick="saveCurrentPayrollReport()">Save Report</button>
            </div>
        </div>
    `;
}

/**
 * Generate payroll table row HTML
 * @param {Object} record - Payroll record
 * @returns {string} HTML string
 */
function generatePayrollTableRow(record) {
    return `;
        <tr>
            <td>${record.employeeName}</td>
            <td>${record.regularHours.toFixed(1)}</td>
            <td>${record.overtimeHours.toFixed(1)}</td>
            <td>${formatCurrency(record.regularPay)}</td>
            <td>${formatCurrency(record.overtimePay)}</td>
            <td>${formatCurrency(record.totalPay)}</td>
            <td>
                <button onclick="viewPayrollDetails('${record.employeeId}')" class="btn-small">Details</button>
            </td>
        </tr>
    `;
}

/**
 * Generate payroll table HTML
 * @param {Object} report - Payroll report
 * @returns {string} HTML string
 */
function generatePayrollTable(report) {
    const rows = report.records.map(generatePayrollTableRow).join('');
    
    return `;
        <div class="payroll-table-container">
            <h3>Payroll Details - ${report.periodType.charAt(0).toUpperCase() + report.periodType.slice(1)} (${report.startDate} to ${report.endDate})</h3>
            <table class="payroll-table">
                <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Regular Hours</th>
                        <th>Overtime Hours</th>
                        <th>Regular Pay</th>
                        <th>Overtime Pay</th>
                        <th>Total Pay</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function loadPayrollDashboard() {
    const payrollContainer = document.getElementById('bossPayroll');
    if (!payrollContainer) return;
    
    const report = generatePayrollReport('biweekly');
    
    payrollContainer.innerHTML = `
        <div class="payroll-dashboard">
            ${generatePayrollHeader()}
            ${generatePayrollSummaryCards(report)}
            ${generatePayrollTable(report)}
        </div>
    `;
}

/**
 * Update payroll display based on selected options
 */
function updatePayrollDisplay() {
    const periodType = document.getElementById('payrollPeriodType').value;
    const referenceDate = new Date(document.getElementById('payrollReferenceDate').value);
    
    const report = generatePayrollReport(periodType, referenceDate);
    
    // Update summary cards
    const summaryCards = document.querySelectorAll('.summary-card');
    summaryCards[0].querySelector('.amount').textContent = formatCurrency(report.summary.totalPay);
    summaryCards[1].querySelector('.hours').textContent = report.summary.totalHours.toFixed(1);
    summaryCards[2].querySelector('.amount').textContent = formatCurrency(report.summary.totalRegularPay);
    summaryCards[3].querySelector('.amount').textContent = formatCurrency(report.summary.totalOvertimePay);
    
    // Update table
    const tbody = document.querySelector('.payroll-table tbody');
    tbody.innerHTML = report.records.map(record => `
        <tr>
            <td>${sanitizeHTML(record.employeeName)}</td>
            <td>${record.totalRegularHours.toFixed(1)}</td>
            <td>${record.totalOvertimeHours.toFixed(1)}</td>
            <td>${formatCurrency(record.totalRegularPay)}</td>
            <td>${formatCurrency(record.totalOvertimePay)}</td>
            <td><strong>${formatCurrency(record.totalPay)}</strong></td>
            <td>
                <button class="btn-small" onclick="viewEmployeePayrollDetails(${record.employeeId}, '${report.startDate}', '${report.endDate}')">View Details</button>
            </td>
        </tr>
    `).join('');
    
    // Update date display
    document.querySelector('.payroll-table-container h3').textContent = 
        `Payroll Details - ${periodType.charAt(0).toUpperCase() + periodType.slice(1)} (${report.startDate} to ${report.endDate})`;
}

/**
 * Save current payroll report
 */
function saveCurrentPayrollReport() {
    const periodType = document.getElementById('payrollPeriodType').value;
    const referenceDate = new Date(document.getElementById('payrollReferenceDate').value);
    
    const report = generatePayrollReport(periodType, referenceDate);
    savePayrollReport(report);
    
    showToast('Payroll report saved successfully!', 'success');
    loadPayrollReportsList();
}

/**
 * Load list of saved payroll reports
 */
function loadPayrollReportsList() {
    const reports = getPayrollReports();
    const container = document.getElementById('payrollReportsList');
    
    if (reports.length === 0) {
        container.innerHTML = '<p class="empty-state">No saved reports yet.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="reports-table">
            <thead>
                <tr>
                    <th>Period</th>
                    <th>Date Range</th>
                    <th>Total Pay</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${reports.map(report => `
                    <tr>
                        <td>${report.periodType.charAt(0).toUpperCase() + report.periodType.slice(1)}</td>
                        <td>${report.startDate} to ${report.endDate}</td>
                        <td>${formatCurrency(report.summary.totalPay)}</td>
                        <td>
                            <button class="btn-small" onclick="loadSavedPayrollReport(${report.id})">View</button>
                            <button class="btn-small btn-danger" onclick="deletePayrollReport(${report.id})">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Load a saved payroll report
 * @param {number} reportId - Report ID
 */
function loadSavedPayrollReport(reportId) {
    const reports = getPayrollReports();
    const report = reports.find(r => r.id === reportId);
    
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }
    
    // Update period selector
    document.getElementById('payrollPeriodType').value = report.periodType;
    document.getElementById('payrollReferenceDate').value = report.startDate;
    
    // Display report
    updatePayrollDisplay();
}

/**
 * Delete a saved payroll report
 * @param {number} reportId - Report ID
 */
function deletePayrollReport(reportId) {
    if (!confirm('Are you sure you want to delete this payroll report?')) return;
    
    let reports = getPayrollReports();
    reports = reports.filter(r => r.id !== reportId);
    localStorage.setItem('payrollReports', JSON.stringify(reports));
    
    showToast('Payroll report deleted', 'success');
    loadPayrollReportsList();
}

/**
 * View detailed payroll information for an employee
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 */
function viewEmployeePayrollDetails(employeeId, startDate, endDate) {
    const payroll = calculateEmployeePayroll(;
        employeeId,
        new Date(startDate),
        new Date(endDate)
    );
    
    const modalContent = `;
        <h3>Payroll Details for ${sanitizeHTML(payroll.employeeName)}</h3>
        <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
        
        <div class="payroll-detail-summary">
            <div class="detail-row">
                <span>Total Regular Hours:</span>
                <span>${payroll.totalRegularHours.toFixed(1)}</span>
            </div>
            <div class="detail-row">
                <span>Total Overtime Hours:</span>
                <span>${payroll.totalOvertimeHours.toFixed(1)}</span>
            </div>
            <div class="detail-row">
                <span>Total Regular Pay:</span>
                <span>${formatCurrency(payroll.totalRegularPay)}</span>
            </div>
            <div class="detail-row">
                <span>Total Overtime Pay:</span>
                <span>${formatCurrency(payroll.totalOvertimePay)}</span>
            </div>
            <div class="detail-row total">
                <span>Total Pay:</span>
                <span>${formatCurrency(payroll.totalPay)}</span>
            </div>
        </div>
        
        <h4>Shift Breakdown</h4>
        <table class="shift-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Schedule</th>
                    <th>Type</th>
                    <th>Hours</th>
                    <th>Pay</th>
                </tr>
            </thead>
            <tbody>
                ${payroll.shifts.map(shift => `
                    <tr>
                        <td>${shift.date}</td>
                        <td>${sanitizeHTML(shift.scheduleName)}</td>
                        <td>${shift.shiftType}</td>
                        <td>${(shift.regularHours + shift.overtimeHours).toFixed(1)}</td>
                        <td>${formatCurrency(shift.totalPay)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    showModal('Employee Payroll Details', modalContent);
}

// Initialize payroll dashboard when boss section is shown
window.addEventListener('DOMContentLoaded', () => {
    // Payroll dashboard will be loaded when boss payroll section is clicked
});