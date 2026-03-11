/**
 * Export Utilities Module
 *
 * Provides CSV download and print-to-PDF functionality for schedules,
 * payroll reports, and incident reports. Works entirely client-side with
 * no server dependency, so it functions in both static and server modes.
 *
 * All exports are triggered by calling ExportUtils.export*(data, options).
 * The module handles quoting/escaping CSV fields, building print-ready HTML,
 * and triggering the browser's native print dialog.
 *
 * @module export-utils
 */

(function() {
    'use strict';

    // ============================================
    // CSV HELPERS
    // ============================================

    /**
     * Escape a single value for CSV output. Values containing commas, quotes,
     * or newlines are quoted; internal double-quotes are doubled per RFC 4180.
     * @param {any} val
     * @returns {string}
     */
    function csvCell(val) {
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Quote if the string contains commas, double-quotes, or newlines
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    /**
     * Convert an array of objects to a CSV string. Column order follows the
     * keys array; if no keys array is provided, the keys of the first row are used.
     * @param {Object[]} rows
     * @param {string[]} [keys]
     * @returns {string}
     */
    function toCsv(rows, keys) {
        if (!rows || rows.length === 0) return '';
        keys = keys || Object.keys(rows[0]);
        const header = keys.map(csvCell).join(',');
        const body   = rows.map(row =>
            keys.map(k => csvCell(row[k])).join(',')
        ).join('\n');
        return header + '\n' + body;
    }

    /**
     * Trigger a browser download of a CSV string.
     * @param {string} csv       - CSV content
     * @param {string} filename  - Suggested filename (without extension)
     */
    function downloadCsv(csv, filename) {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href     = url;
        link.download = (filename || 'export') + '.csv';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // ============================================
    // PRINT / PDF HELPERS
    // ============================================

    /**
     * Open a new window with print-ready HTML and trigger the print dialog.
     * This produces a PDF when the user selects "Save as PDF" in the dialog.
     * @param {string} htmlContent  - Inner HTML for the printable page
     * @param {string} title        - Page / document title
     */
    function printToPDF(htmlContent, title) {
        const win  = window.open('', '_blank', 'width=900,height=700');
        if (!win) {
            alert('Pop-up blocked. Please allow pop-ups for this site to use PDF export.');
            return;
        }

        win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${_esc(title || 'Lifestar Report')}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #222; padding: 32px; }
        h1 { font-size: 20px; margin-bottom: 4px; color: #0033a0; }
        .subtitle { font-size: 12px; color: #666; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #0033a0; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
        tr:nth-child(even) td { background: #f8f9fa; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
        .badge-critical { background: #f8d7da; color: #dc3545; }
        .badge-high     { background: #ffe8d6; color: #fd7e14; }
        .badge-medium   { background: #fff3cd; color: #856404; }
        .badge-low      { background: #d4edda; color: #155724; }
        .badge-open         { background: #cfe2ff; color: #0a58ca; }
        .badge-under-review { background: #ffe8d6; color: #fd7e14; }
        .badge-resolved     { background: #d4edda; color: #155724; }
        .badge-closed       { background: #e2e3e5; color: #383d41; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #999; }
        @media print {
            body { padding: 16px; }
            @page { margin: 1cm; }
        }
    </style>
</head>
<body>
    ${htmlContent}
    <div class="footer">
        Generated by Lifestar Ambulance Scheduling System &bull; ${new Date().toLocaleString()}
    </div>
    <script>
        window.onload = function() {
            window.print();
        };
    </script>
</body>
</html>`);
        win.document.close();
    }

    function _esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ============================================
    // SCHEDULE EXPORT
    // ============================================

    /**
     * Export a schedule to CSV. Each crew assignment becomes one row.
     * @param {Object} schedule   - Schedule object with name, month, year, crews[]
     * @param {Object} [opts]     - { filename }
     */
    function exportScheduleCsv(schedule, opts) {
        if (!schedule) { _toast('No schedule selected', 'warning'); return; }
        opts = opts || {};

        const crews = schedule.crews || [];
        if (crews.length === 0) { _toast('Schedule has no crew assignments to export', 'warning'); return; }

        const rows = crews.map(c => ({
            'Date':       c.date       || '',
            'Rig':        c.rig        || '',
            'Shift Type': c.shiftType  || '',
            'Crew Type':  c.type       || '',
            'Paramedic':  c.paramedic  || '',
            'EMT':        c.emt        || '',
            'Notes':      c.notes      || ''
        }));

        const filename = opts.filename || (schedule.name + ' - ' + (schedule.month || '') + ' ' + (schedule.year || '')).trim();
        downloadCsv(toCsv(rows), filename);
        _toast('Schedule exported to CSV', 'success');
    }

    /**
     * Print a schedule as a formatted table (opens browser print dialog).
     * @param {Object} schedule
     */
    function printSchedule(schedule) {
        if (!schedule) { _toast('No schedule selected', 'warning'); return; }

        const crews = (schedule.crews || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));

        const rows = crews.map(c => `
            <tr>
                <td>${_esc(c.date || '')}</td>
                <td>${_esc(c.rig || '')}</td>
                <td>${_esc(c.shiftType || '')}</td>
                <td>${_esc(c.type || '')}</td>
                <td>${_esc(c.paramedic || '')}</td>
                <td>${_esc(c.emt || '')}</td>
            </tr>
        `).join('');

        const html = `
            <h1>${_esc(schedule.name)}</h1>
            <p class="subtitle">${_esc(schedule.month || '')} ${_esc(schedule.year || '')}
                &bull; Status: ${_esc(schedule.status || 'draft')}
                &bull; ${crews.length} crew assignment${crews.length !== 1 ? 's' : ''}</p>
            <table>
                <thead>
                    <tr>
                        <th>Date</th><th>Rig</th><th>Shift</th><th>Type</th><th>Paramedic</th><th>EMT</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6">No crew assignments</td></tr>'}</tbody>
            </table>
        `;

        printToPDF(html, schedule.name);
    }

    // ============================================
    // INCIDENT REPORTS EXPORT
    // ============================================

    /**
     * Export incident reports to CSV.
     * @param {Object[]} reports  - Array of incident report objects
     * @param {Object}   [opts]   - { filename }
     */
    function exportIncidentsCsv(reports, opts) {
        if (!reports || reports.length === 0) {
            // Load from storage if not provided
            try {
                reports = JSON.parse(localStorage.getItem('lifestarIncidentReports') || '[]');
            } catch (e) { reports = []; }
        }
        if (reports.length === 0) { _toast('No incident reports to export', 'warning'); return; }
        opts = opts || {};

        const rows = reports.map(r => ({
            'ID':          r.id || '',
            'Title':       r.title || '',
            'Type':        r.type || '',
            'Priority':    r.priority || '',
            'Status':      r.status || '',
            'Description': (r.description || '').replace(/\n/g, ' '),
            'Location':    r.location || '',
            'Reported By': r.reportedByName || r.reportedBy || '',
            'Filed':       r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
            'Resolved':    r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : '',
        }));

        const filename = opts.filename || ('Incident_Reports_' + _dateStamp());
        downloadCsv(toCsv(rows), filename);
        _toast('Incident reports exported to CSV', 'success');
    }

    /**
     * Print incident reports as a formatted table.
     * @param {Object[]} reports
     */
    function printIncidents(reports) {
        if (!reports || reports.length === 0) {
            try {
                reports = JSON.parse(localStorage.getItem('lifestarIncidentReports') || '[]');
            } catch (e) { reports = []; }
        }
        if (reports.length === 0) { _toast('No incident reports to print', 'warning'); return; }

        // Sort: critical first
        const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const sorted = reports.slice().sort((a, b) => (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2));

        const rows = sorted.map(r => `
            <tr>
                <td>#${_esc(r.id)}</td>
                <td>${_esc(r.title)}</td>
                <td>${_esc(r.type || '')}</td>
                <td><span class="badge badge-${_esc(r.priority)}">${_esc(r.priority || '')}</span></td>
                <td><span class="badge badge-${_esc(r.status)}">${_esc(r.status || '')}</span></td>
                <td>${_esc(r.reportedByName || r.reportedBy || '')}</td>
                <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</td>
            </tr>
        `).join('');

        const openCount = reports.filter(r => r.status === 'open' || r.status === 'under-review').length;

        const html = `
            <h1>Incident Reports</h1>
            <p class="subtitle">${reports.length} total &bull; ${openCount} open/under-review
                &bull; as of ${new Date().toLocaleDateString()}</p>
            <table>
                <thead>
                    <tr><th>#</th><th>Title</th><th>Type</th><th>Priority</th><th>Status</th><th>Reported By</th><th>Filed</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

        printToPDF(html, 'Incident Reports');
    }

    // ============================================
    // PAYROLL EXPORT
    // ============================================

    /**
     * Export payroll data to CSV.
     * @param {Object[]} records  - Payroll records with employee, hours, pay fields
     * @param {Object}   [opts]   - { filename, period }
     */
    function exportPayrollCsv(records, opts) {
        if (!records || records.length === 0) { _toast('No payroll data to export', 'warning'); return; }
        opts = opts || {};

        const rows = records.map(r => ({
            'Employee':      r.employeeName || r.employee || '',
            'Role':          r.role || '',
            'Regular Hours': r.regularHours || 0,
            'Overtime Hours': r.overtimeHours || 0,
            'Total Hours':   r.totalHours || 0,
            'Rate ($/hr)':   r.hourlyRate || r.rate || 0,
            'Regular Pay':   r.regularPay  || 0,
            'Overtime Pay':  r.overtimePay || 0,
            'Bonus Pay':     r.bonusPay    || 0,
            'Total Pay':     r.totalPay    || 0,
            'Period':        opts.period || r.period || '',
        }));

        const filename = opts.filename || ('Payroll_' + (opts.period || _dateStamp()));
        downloadCsv(toCsv(rows), filename);
        _toast('Payroll exported to CSV', 'success');
    }

    // ============================================
    // STAFF DIRECTORY EXPORT
    // ============================================

    /**
     * Export the staff directory to CSV.
     */
    function exportStaffCsv() {
        let users = [];
        try {
            users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
        } catch (e) { users = []; }

        if (users.length === 0) { _toast('No staff data to export', 'warning'); return; }

        const rows = users
            .filter(u => u.username !== 'super') // omit system accounts
            .map(u => ({
                'Full Name': u.fullName || u.username || '',
                'Username':  u.username || '',
                'Role':      u.role || '',
                'Phone':     u.phone || '',
                'Hours':     u.hoursWorked || 0,
                'Bonus Hours': u.bonusHours || 0,
                'Active':    u.active !== false ? 'Yes' : 'No',
            }));

        downloadCsv(toCsv(rows), 'Staff_Directory_' + _dateStamp());
        _toast('Staff directory exported to CSV', 'success');
    }

    // ============================================
    // UTILITY
    // ============================================

    function _dateStamp() {
        return new Date().toISOString().slice(0, 10).replace(/-/g, '');
    }

    function _toast(msg, type) {
        if (typeof showToast === 'function') {
            showToast(msg, type || 'info');
        } else {
            console.log('[ExportUtils]', msg);
        }
    }

    // ============================================
    // EXPORT MENU WIDGET
    // ============================================

    /**
     * Render a small export dropdown button.
     * @param {string}   containerId  - Where to render the button
     * @param {Object}   options      - { schedule, incidents, payroll, staff }
     */
    function renderExportMenu(containerId, options) {
        const container = document.getElementById(containerId);
        if (!container) return;
        options = options || {};

        const items = [];
        if (options.schedule) {
            items.push(`<button onclick="ExportUtils.exportScheduleCsv(window._exportSchedule)" class="export-item">📊 Schedule CSV</button>`);
            items.push(`<button onclick="ExportUtils.printSchedule(window._exportSchedule)"    class="export-item">🖨️ Schedule PDF</button>`);
            window._exportSchedule = options.schedule;
        }
        if (options.incidents !== false) {
            items.push(`<button onclick="ExportUtils.exportIncidentsCsv()" class="export-item">📋 Incidents CSV</button>`);
            items.push(`<button onclick="ExportUtils.printIncidents()"     class="export-item">🖨️ Incidents PDF</button>`);
        }
        if (options.staff !== false) {
            items.push(`<button onclick="ExportUtils.exportStaffCsv()" class="export-item">👥 Staff CSV</button>`);
        }
        if (options.payroll) {
            items.push(`<button onclick="ExportUtils.exportPayrollCsv(window._exportPayroll)" class="export-item">💰 Payroll CSV</button>`);
            window._exportPayroll = options.payroll;
        }

        if (items.length === 0) return;

        container.innerHTML = `
            <div style="position:relative;display:inline-block;" id="export_menu_wrap">
                <button onclick="ExportUtils.toggleMenu()" 
                        style="padding:8px 16px;background:#0033a0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">
                    ⬇ Export
                </button>
                <div id="export_menu_dropdown" style="display:none;position:absolute;right:0;top:calc(100% + 4px);
                     background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);
                     min-width:180px;z-index:1000;overflow:hidden;">
                    ${items.map(i => i.replace('class="export-item"',
                        'style="display:block;width:100%;padding:10px 16px;background:none;border:none;text-align:left;cursor:pointer;font-size:13px;" onmouseover="this.style.background=\'#f5f5f5\'" onmouseout="this.style.background=\'none\'"'
                    )).join('')}
                </div>
            </div>
        `;
    }

    function toggleMenu() {
        const dropdown = document.getElementById('export_menu_dropdown');
        if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        const wrap = document.getElementById('export_menu_wrap');
        if (wrap && !wrap.contains(e.target)) {
            const dropdown = document.getElementById('export_menu_dropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    // ============================================
    // PUBLIC API
    // ============================================

    const ExportUtils = {
        // CSV exports
        exportScheduleCsv,
        exportIncidentsCsv,
        exportPayrollCsv,
        exportStaffCsv,

        // Print/PDF
        printSchedule,
        printIncidents,
        printToPDF,

        // Widget
        renderExportMenu,
        toggleMenu,

        // Raw helpers (useful for custom exports)
        toCsv,
        downloadCsv,
    };

    window.ExportUtils = ExportUtils;

    if (typeof Logger !== 'undefined') Logger.debug('✅ ExportUtils module loaded');

})();
