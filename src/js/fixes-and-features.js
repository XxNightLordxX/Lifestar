/**
 * fixes-and-features.js
 * =====================
 * 1. Critical missing functions (were in _archived/ but called throughout the app)
 * 2. Bug fixes that require new logic
 * 3. New UX features inspired by best-in-class scheduling apps
 *    (When I Work, Deputy, Sling, AMR SmartForce, EMS Manager)
 */

// ============================================================
// SECTION 1 — CRITICAL MISSING FUNCTIONS (from _archived)
// ============================================================

/**
 * Save only the users array to localStorage.
 * Called from drag-drop-scheduler.js after crew edits.
 */
function saveUsers() {
    try {
        localStorage.setItem('lifestarUsers', JSON.stringify(users));
    } catch (error) {
        Logger.error('[saveUsers] Error:', error);
    }
}

/**
 * Save only the schedules array to localStorage.
 * Called from drag-drop-scheduler.js after every crew change.
 */
function saveSchedules() {
    try {
        localStorage.setItem('lifestarSchedules', JSON.stringify(schedules));
    } catch (error) {
        Logger.error('[saveSchedules] Error:', error);
    }
}

/**
 * Safely build <option> elements from an array and return an HTML string.
 * NOTE: Callers must assign result to element.innerHTML, not .textContent.
 * @param {Array}  items         - Data array
 * @param {string} valueKey      - Property to use as option value
 * @param {string} textKey       - Property to use as option label
 * @param {string} selectedValue - Pre-select this value
 * @param {string} placeholder   - First "empty" option label
 * @returns {string} Safe HTML string of <option> tags
 */
function safeCreateOptions(items, valueKey, textKey, selectedValue, placeholder) {
    placeholder = placeholder || 'Select';
    const esc = (s) => {
        if (s === null || s === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    };
    let html = `<option value="">${esc(placeholder)}</option>`;
    for (const item of (items || [])) {
        const val = esc(String(item[valueKey] || ''));
        const txt = esc(String(item[textKey] || item.username || ''));
        const sel = String(item[valueKey]) === String(selectedValue) ? ' selected' : '';
        html += `<option value="${val}"${sel}>${txt}</option>`;
    }
    return html;
}

/**
 * Submit an incident report from staff dashboards.
 * Lives here instead of _archived/remaining-features.js so it loads.
 * @param {string} type - 'paramedic' or 'emt'
 */
function submitIncidentReport(type) {
    try {
        const prefix = (type === 'paramedic') ? '' : 'emt';
        const dateId       = prefix ? 'emtIncidentDate'        : 'incidentDate';
        const typeId       = prefix ? 'emtIncidentType'        : 'incidentType';
        const severityId   = prefix ? 'emtIncidentSeverity'    : 'incidentSeverity';
        const descId       = prefix ? 'emtIncidentDescription' : 'incidentDescription';

        const incidentDate   = (document.getElementById(dateId)       || {value: ''}).value.trim();
        const incidentType   = (document.getElementById(typeId)       || {value: ''}).value.trim();
        const incidentSeverity = (document.getElementById(severityId) || {value: ''}).value.trim();
        const description    = (document.getElementById(descId)       || {value: ''}).value.trim();

        if (!incidentDate || !incidentType || !description) {
            showAlert('Please fill in the date, type, and description', 'warning');
            return;
        }

        // Load existing reports
        if (typeof incidentReports === 'undefined') window.incidentReports = [];
        let reports = incidentReports;
        if (!Array.isArray(reports)) {
            reports = [];
            window.incidentReports = reports;
        }

        const report = {
            id: Date.now(),
            reporterId: currentUser.id,
            reporterName: currentUser.fullName || currentUser.username,
            date: incidentDate,
            type: incidentType,
            severity: incidentSeverity || 'Medium',
            description: description,
            status: 'Submitted',
            createdAt: new Date().toISOString()
        };

        reports.push(report);
        try { localStorage.setItem('lifestarIncidentReports', JSON.stringify(reports)); } catch(e) {}

        // Clear form
        ['dateId', 'typeId', 'severityId', 'descId'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        showAlert('Incident report submitted successfully', 'success');
        addSystemLog('Incident report submitted by: ' + currentUser.username);
    } catch (error) {
        Logger.error('[submitIncidentReport] Error:', error.message || error);
    }
}

/**
 * Filter employee list in the schedule editor by role
 */
function filterEmployeeList() {
    try {
        const filter = (document.getElementById('staffFilter') || {value: 'all'}).value;
        document.querySelectorAll('.employee-card').forEach(card => {
            const role = card.dataset.employeeRole;
            card.style.display = (filter === 'all' || filter === role) ? '' : 'none';
        });
    } catch (error) {
        Logger.error('[filterEmployeeList] Error:', error);
    }
}

// ============================================================
// SECTION 2 — openScheduleEditor READ-ONLY MODE
// (Supports the publishSchedule lock fix in app.js)
// ============================================================

/**
 * Open the schedule editor. Supports a readOnly flag for published schedules.
 * Replaces the version in drag-drop-scheduler.js for published schedules.
 */
const _origOpenScheduleEditor = typeof openScheduleEditor === 'function' ? openScheduleEditor : null;
window.openScheduleEditor = function(scheduleId, readOnly) {
    try {
        currentEditingSchedule = schedules.find(s => String(s.id) === String(scheduleId));
        if (!currentEditingSchedule) {
            showAlert('Schedule not found', 'error');
            return;
        }

        // Hide all sections, show schedule editor
        if (typeof hideAllSections === 'function') hideAllSections();
        const editorEl = document.getElementById('scheduleEditor');
        if (editorEl) editorEl.classList.remove('hidden');

        // Initialize the editor
        if (typeof initializeScheduleEditor === 'function') initializeScheduleEditor();

        // Apply read-only overlay for published schedules
        if (readOnly) {
            const addShiftBtn = document.getElementById('addShiftBtn');
            const editorActions = document.querySelectorAll('.editor-action-btn, #saveScheduleBtn, #publishScheduleBtn');
            if (addShiftBtn) { addShiftBtn.disabled = true; addShiftBtn.title = 'Published — read only'; }
            editorActions.forEach(b => { b.disabled = true; });

            // Banner
            let banner = document.getElementById('readOnlyBanner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'readOnlyBanner';
                banner.style.cssText = 'background:#f39c12;color:#fff;padding:10px 20px;text-align:center;font-weight:600;letter-spacing:.3px;';
                banner.textContent = '🔒 This schedule is published and locked. Archive it first to make changes.';
                if (editorEl) editorEl.insertBefore(banner, editorEl.firstChild);
            }
        } else {
            const banner = document.getElementById('readOnlyBanner');
            if (banner) banner.remove();
        }
    } catch (error) {
        Logger.error('[openScheduleEditor] Error:', error.message || error);
    }
};

// ============================================================
// SECTION 3 — TODAY'S COVERAGE WIDGET
// Inspired by When I Work's "Today" dashboard panel
// ============================================================

/**
 * Render a "Today's Coverage" panel inside a given container element.
 * Shows who is on shift today, any gaps, and call-in status.
 * @param {string} containerId - ID of the element to render into
 */
function renderTodaysCoverage(containerId) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return;

        const today = new Date().toISOString().split('T')[0];
        const todayCrews = [];

        (schedules || []).forEach(s => {
            if (s.status !== 'published') return;
            (s.crews || []).forEach(c => {
                if (c.date === today) {
                    const paramedic = users.find(u => String(u.id) === String(c.paramedicId));
                    const emt = users.find(u => String(u.id) === String(c.emtId));
                    todayCrews.push({
                        rig: c.rig,
                        shiftType: c.shiftType,
                        type: c.type || 'ALS',
                        paramedicName: paramedic ? (paramedic.fullName || paramedic.username) : (c.paramedic || 'Unassigned'),
                        emtName: emt ? (emt.fullName || emt.username) : (c.emt || 'Unassigned'),
                        scheduleName: s.name
                    });
                }
            });
        });

        const todayStr = new Date().toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});

        let html = `
            <div style="background:var(--card-bg,#fff);border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid var(--lifestar-red,#e74c3c);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="margin:0;font-size:1.1rem;color:var(--text-primary,#333);">🚑 Today's Coverage — <span style="color:var(--lifestar-red,#e74c3c)">${sanitizeHTML(todayStr)}</span></h3>
                    <span style="background:${todayCrews.length > 0 ? '#27ae60' : '#e74c3c'};color:#fff;padding:4px 12px;border-radius:20px;font-size:.8rem;font-weight:600;">${todayCrews.length} Active ${todayCrews.length === 1 ? 'Crew' : 'Crews'}</span>
                </div>
        `;

        if (todayCrews.length === 0) {
            html += `<div style="text-align:center;padding:20px;color:var(--text-muted,#888);">
                <div style="font-size:2.5rem;margin-bottom:8px;">⚠️</div>
                <p style="margin:0;font-weight:600;">No crews scheduled for today</p>
                <p style="margin:4px 0 0;font-size:.85rem;">Publish a schedule that includes today's date to see coverage here.</p>
            </div>`;
        } else {
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">';
            todayCrews.forEach(crew => {
                const typeColor = crew.type === 'ALS' ? 'var(--lifestar-red,#e74c3c)' : 'var(--lifestar-light-blue,#3498db)';
                html += `
                    <div style="border:1px solid var(--border-color,#dee2e6);border-radius:8px;padding:14px;position:relative;overflow:hidden;">
                        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${typeColor};"></div>
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                            <strong style="font-size:1rem;">${sanitizeHTML(crew.rig)}</strong>
                            <span style="background:${typeColor};color:#fff;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:700;">${sanitizeHTML(crew.type)}</span>
                        </div>
                        <div style="font-size:.85rem;color:var(--text-muted,#666);margin-bottom:6px;">⏱️ ${sanitizeHTML(crew.shiftType)}</div>
                        <div style="font-size:.85rem;">👨‍⚕️ <strong>${sanitizeHTML(crew.paramedicName)}</strong></div>
                        <div style="font-size:.85rem;">🚑 ${sanitizeHTML(crew.emtName)}</div>
                    </div>
                `;
            });
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        Logger.error('[renderTodaysCoverage] Error:', error);
    }
}

// ============================================================
// SECTION 4 — QUICK CALL-IN SICK BUTTON FOR STAFF
// Inspired by Deputy's one-tap "I can't work" feature
// ============================================================

/**
 * Show a quick call-in sick dialog for the current staff member.
 * Creates a time-off request for today with "Emergency/Sick" reason.
 */
function quickCallInSick() {
    try {
        if (!currentUser) return;

        const today = new Date().toISOString().split('T')[0];

        // Check if they're even scheduled today
        let todayShift = null;
        (schedules || []).forEach(s => {
            if (s.status !== 'published') return;
            (s.crews || []).forEach(c => {
                if (c.date === today && (String(c.paramedicId) === String(currentUser.id) || String(c.emtId) === String(currentUser.id))) {
                    todayShift = c;
                }
            });
        });

        const shiftInfo = todayShift ? ` (${todayShift.rig} — ${todayShift.shiftType})` : '';
        const reason = `Sick/Unable to work${shiftInfo}`;

        // Check for existing request today
        const existing = timeoffRequests && timeoffRequests.find(r =>
            String(r.staffId) === String(currentUser.id) &&
            r.startDate === today
        );
        if (existing) {
            showAlert('You already have a request submitted for today.', 'info');
            return;
        }

        if (!confirm(`Call in sick for today (${today})${shiftInfo}?\n\nYour manager will be notified.`)) return;

        if (!timeoffRequests) window.timeoffRequests = [];
        timeoffRequests.push({
            id: Date.now(),
            staffId: currentUser.id,
            startDate: today,
            endDate: today,
            reason: reason,
            status: 'pending',
            urgent: true,
            createdAt: new Date().toISOString()
        });

        try { localStorage.setItem('lifestarTimeoffRequests', JSON.stringify(timeoffRequests)); } catch(e) {}

        showAlert('Your call-in has been submitted. Your supervisor has been notified.', 'success');
        addSystemLog('CALL-IN: ' + (currentUser.fullName || currentUser.username) + ' called in sick for ' + today);

        // Try to notify via NotificationCenter if available
        if (typeof NotificationCenter !== 'undefined' && NotificationCenter.add) {
            NotificationCenter.add({
                title: '📢 Call-In Alert',
                message: (currentUser.fullName || currentUser.username) + ' called in sick for today.',
                type: 'warning'
            });
        }
    } catch (error) {
        Logger.error('[quickCallInSick] Error:', error);
    }
}

// ============================================================
// SECTION 5 — SCHEDULE DUPLICATE/COPY
// Inspired by When I Work's "Copy week" and Sling's template copy
// ============================================================

/**
 * Duplicate an existing schedule into a new draft for a different month/year.
 * Preserves rig assignments and staff (by ID), updates dates proportionally.
 * @param {number|string} scheduleId - ID of the schedule to duplicate
 */
function duplicateSchedule(scheduleId) {
    try {
        const source = schedules.find(s => String(s.id) === String(scheduleId));
        if (!source) { showAlert('Schedule not found', 'error'); return; }

        const targetMonth = prompt('Enter target month (e.g. March):');
        if (!targetMonth) return;
        const targetYear = prompt('Enter target year (e.g. 2026):');
        if (!targetYear) return;

        const monthNames = ['January','February','March','April','May','June',
                           'July','August','September','October','November','December'];
        const mIdx = monthNames.findIndex(m => m.toLowerCase() === targetMonth.trim().toLowerCase());
        if (mIdx === -1) { showAlert('Invalid month name. Please use e.g. "March"', 'error'); return; }
        const yr = parseInt(targetYear);
        if (isNaN(yr)) { showAlert('Invalid year', 'error'); return; }

        // Check for existing schedule for that month/year
        const exists = schedules.find(s => s.month === monthNames[mIdx] && String(s.year) === String(yr));
        if (exists) {
            if (!confirm(`A schedule for ${monthNames[mIdx]} ${yr} already exists ("${exists.name}"). Create a duplicate anyway?`)) return;
        }

        // Clone crews, shifting dates to new month/year
        const sourceMonthIdx = monthNames.findIndex(m => m === source.month);
        const newCrews = (source.crews || []).map(c => {
            let newDate = c.date;
            if (c.date) {
                const d = new Date(c.date);
                if (!isNaN(d)) {
                    const newD = new Date(yr, mIdx, d.getDate());
                    // Clamp to last day of target month
                    const lastDay = new Date(yr, mIdx + 1, 0).getDate();
                    newD.setDate(Math.min(d.getDate(), lastDay));
                    newDate = newD.toISOString().split('T')[0];
                }
            }
            return { ...c, id: Date.now() + Math.random(), date: newDate };
        });

        const newSchedule = {
            id: Date.now(),
            name: `${monthNames[mIdx]} ${yr} (copy of ${source.name})`,
            month: monthNames[mIdx],
            year: String(yr),
            description: `Duplicated from: ${source.name}`,
            locationId: source.locationId || null,
            status: 'draft',
            crews: newCrews,
            totalHours: source.totalHours || 0,
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.id : null
        };

        schedules.push(newSchedule);
        saveData();
        if (typeof loadDraftSchedules === 'function') loadDraftSchedules();
        if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
        showAlert(`Schedule duplicated as "${newSchedule.name}"`, 'success');
        addSystemLog('Schedule duplicated: ' + newSchedule.name);
    } catch (error) {
        Logger.error('[duplicateSchedule] Error:', error);
    }
}

// ============================================================
// SECTION 6 — COVERAGE GAPS INDICATOR
// Shows red warning badges on calendar days with no crew assigned
// (Inspired by AMR SmartForce's gap detection)
// ============================================================

/**
 * Scan a schedule for days in its month that have zero crew assigned.
 * Returns an array of date strings (YYYY-MM-DD) with no coverage.
 * @param {Object} schedule - Schedule object
 * @returns {Array<string>} Uncovered date strings
 */
function getScheduleCoverageGaps(schedule) {
    if (!schedule || !schedule.month || !schedule.year) return [];
    const monthNames = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
    const mIdx = monthNames.findIndex(m => m === schedule.month);
    const yr = parseInt(schedule.year);
    if (mIdx === -1 || isNaN(yr)) return [];

    const daysInMonth = new Date(yr, mIdx + 1, 0).getDate();
    const coveredDates = new Set((schedule.crews || []).map(c => c.date));
    const gaps = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yr}-${String(mIdx+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if (!coveredDates.has(dateStr)) gaps.push(dateStr);
    }
    return gaps;
}

/**
 * Show a coverage gap summary in the schedule card.
 * Call after loadDraftSchedules to annotate cards.
 */
function annotateCoverageGaps() {
    try {
        (schedules || []).filter(s => s.status === 'draft').forEach(schedule => {
            const gaps = getScheduleCoverageGaps(schedule);
            if (gaps.length === 0) return;
            // Find card by data attribute
            const cards = document.querySelectorAll(`[data-schedule-id="${schedule.id}"], .schedule-item`);
            cards.forEach(card => {
                if (!card.querySelector('.coverage-gap-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'coverage-gap-badge';
                    badge.style.cssText = 'font-size:.75rem;color:#e74c3c;margin-top:4px;font-weight:600;';
                    badge.textContent = `⚠️ ${gaps.length} day${gaps.length>1?'s':''} without coverage`;
                    card.appendChild(badge);
                }
            });
        });
    } catch (e) {}
}

// ============================================================
// SECTION 7 — CERTIFICATION EXPIRY VISUAL INDICATOR
// Color-coded expiry warnings in staff directory
// (Inspired by EMS Manager's cert tracking)
// ============================================================

/**
 * Get certification expiry status for a user.
 * @param {Object} user - User object (must have certifications array)
 * @returns {{ status: 'ok'|'expiring'|'expired', label: string }}
 */
function getCertStatus(user) {
    if (!user.certifications || user.certifications.length === 0) {
        return { status: 'unknown', label: 'No certs on file' };
    }
    const now = new Date();
    let earliest = null;
    user.certifications.forEach(cert => {
        if (cert.expiryDate) {
            const d = new Date(cert.expiryDate);
            if (!earliest || d < earliest) earliest = d;
        }
    });
    if (!earliest) return { status: 'unknown', label: 'No expiry dates' };
    const daysLeft = Math.ceil((earliest - now) / 86400000);
    if (daysLeft < 0) return { status: 'expired', label: `Expired ${Math.abs(daysLeft)}d ago` };
    if (daysLeft <= 30) return { status: 'expiring', label: `Expires in ${daysLeft}d` };
    return { status: 'ok', label: `Valid (${daysLeft}d remaining)` };
}

/**
 * Inject a cert status badge into a staff card element.
 * @param {HTMLElement} cardEl - Staff card element
 * @param {Object} user - User object
 */
function injectCertBadge(cardEl, user) {
    try {
        const status = getCertStatus(user);
        const colors = { ok: '#27ae60', expiring: '#f39c12', expired: '#e74c3c', unknown: '#95a5a6' };
        const badge = document.createElement('div');
        badge.style.cssText = `display:inline-block;background:${colors[status.status]};color:#fff;padding:3px 10px;border-radius:12px;font-size:.75rem;font-weight:600;margin-top:6px;`;
        badge.textContent = '🏥 ' + status.label;
        cardEl.appendChild(badge);
    } catch(e) {}
}

// ============================================================
// SECTION 8 — SCHEDULE HEALTH DASHBOARD WIDGET
// Boss dashboard overview: staff counts, hours load, coverage %
// ============================================================

/**
 * Update the boss/super overview with a schedule health summary.
 * Injects into element with id 'scheduleHealthWidget' if present.
 */
function renderScheduleHealthWidget() {
    try {
        const container = document.getElementById('scheduleHealthWidget');
        if (!container) return;

        const publishedCount = (schedules || []).filter(s => s.status === 'published').length;
        const draftCount = (schedules || []).filter(s => s.status === 'draft').length;
        const totalStaff = (users || []).filter(u => u.role === 'paramedic' || u.role === 'emt').length;

        // Today's coverage
        const today = new Date().toISOString().split('T')[0];
        let todayCrewCount = 0;
        (schedules || []).forEach(s => {
            if (s.status === 'published') {
                (s.crews || []).forEach(c => { if (c.date === today) todayCrewCount++; });
            }
        });

        // Pending time-off
        const pendingTimeoff = (timeoffRequests || []).filter(r => r.status === 'pending').length;

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">
                <div style="background:var(--card-bg,#fff);border-radius:10px;padding:16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.07);border-top:3px solid #27ae60;">
                    <div style="font-size:2rem;font-weight:700;color:#27ae60;">${todayCrewCount}</div>
                    <div style="font-size:.8rem;color:var(--text-muted,#888);margin-top:4px;">Crews On Today</div>
                </div>
                <div style="background:var(--card-bg,#fff);border-radius:10px;padding:16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.07);border-top:3px solid var(--lifestar-red,#e74c3c);">
                    <div style="font-size:2rem;font-weight:700;color:var(--lifestar-red,#e74c3c);">${publishedCount}</div>
                    <div style="font-size:.8rem;color:var(--text-muted,#888);margin-top:4px;">Published Schedules</div>
                </div>
                <div style="background:var(--card-bg,#fff);border-radius:10px;padding:16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.07);border-top:3px solid #f39c12;">
                    <div style="font-size:2rem;font-weight:700;color:#f39c12;">${draftCount}</div>
                    <div style="font-size:.8rem;color:var(--text-muted,#888);margin-top:4px;">Drafts In Progress</div>
                </div>
                <div style="background:var(--card-bg,#fff);border-radius:10px;padding:16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.07);border-top:3px solid #3498db;">
                    <div style="font-size:2rem;font-weight:700;color:#3498db;">${totalStaff}</div>
                    <div style="font-size:.8rem;color:var(--text-muted,#888);margin-top:4px;">Active Staff</div>
                </div>
                <div style="background:var(--card-bg,#fff);border-radius:10px;padding:16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.07);border-top:3px solid ${pendingTimeoff > 0 ? '#e74c3c' : '#95a5a6'};">
                    <div style="font-size:2rem;font-weight:700;color:${pendingTimeoff > 0 ? '#e74c3c' : '#95a5a6'};">${pendingTimeoff}</div>
                    <div style="font-size:.8rem;color:var(--text-muted,#888);margin-top:4px;">Pending Time-Off</div>
                </div>
            </div>
        `;
    } catch (error) {
        Logger.error('[renderScheduleHealthWidget] Error:', error);
    }
}

// ============================================================
// SECTION 9 — WIRE UP NEW FEATURES ON DASHBOARD LOAD
// ============================================================

// Hook into showDashboard to render new widgets after login
(function() {
    const _origShowDashboard = typeof showDashboard === 'function' ? showDashboard : null;
    window.showDashboard = function() {
        if (_origShowDashboard) _origShowDashboard.apply(this, arguments);
        // Defer widget renders so the DOM is ready
        setTimeout(() => {
            try { renderTodaysCoverage('todaysCoverageWidget'); } catch(e) {}
            try { renderTodaysCoverage('superTodaysCoverageWidget'); } catch(e) {}
            try { renderScheduleHealthWidget(); } catch(e) {}
        }, 600);
    };
})();

// Hook into loadBossDashboard
(function() {
    const _orig = typeof loadBossDashboard === 'function' ? loadBossDashboard : null;
    window.loadBossDashboard = function() {
        if (_orig) _orig.apply(this, arguments);
        setTimeout(() => {
            try { renderTodaysCoverage('todaysCoverageWidget'); } catch(e) {}
            try { renderScheduleHealthWidget(); } catch(e) {}
        }, 400);
    };
})();

// Hook into loadSuperAdminDashboard
(function() {
    const _orig = typeof loadSuperAdminDashboard === 'function' ? loadSuperAdminDashboard : null;
    window.loadSuperAdminDashboard = function() {
        if (_orig) _orig.apply(this, arguments);
        setTimeout(() => {
            try { renderTodaysCoverage('superTodaysCoverageWidget'); } catch(e) {}
            try { renderScheduleHealthWidget(); } catch(e) {}
        }, 400);
    };
})();

// ============================================================
// SECTION 10 — FIX: updateOverviewStats (boss + super stats)
// ============================================================

/**
 * Enhanced overview stats — shows real numbers including today's crews
 */
window.updateOverviewStats = function() {
    try {
        const totalUsers = document.getElementById('totalUsersCount');
        const totalSchedules = document.getElementById('totalSchedulesCount');
        const lastUpdate = document.getElementById('lastSystemUpdate');

        if (totalUsers) totalUsers.textContent = (users || []).length;
        if (totalSchedules) totalSchedules.textContent = (schedules || []).length;
        if (lastUpdate) lastUpdate.textContent = new Date().toLocaleString();

        // Render health widget whenever stats update
        setTimeout(() => { try { renderScheduleHealthWidget(); } catch(e) {} }, 200);
    } catch (error) {
        Logger.error('[updateOverviewStats] Error:', error);
    }
};

Logger.debug('✅ fixes-and-features.js loaded — missing functions restored, new features active');

// ============================================
// CONSOLIDATED FROM bug-fixes.js
// (merged here to reduce script count)
// ============================================

/** Lazy-load large datasets into a container using requestAnimationFrame batching */
function lazyLoadData(containerId, items, renderItem, batchSize) {
    batchSize = batchSize || 20;
    try {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.textContent = '';
        let currentIndex = 0;
        const loadBatch = function() {
            const fragment = document.createDocumentFragment();
            const endIndex = Math.min(currentIndex + batchSize, items.length);
            for (let i = currentIndex; i < endIndex; i++) {
                const item = renderItem(items[i]);
                if (item) fragment.appendChild(item);
            }
            container.appendChild(fragment);
            currentIndex = endIndex;
            if (currentIndex < items.length) requestAnimationFrame(loadBatch);
        };
        loadBatch();
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.error('[lazyLoadData]', e);
    }
}

/** Announce a message to screen readers via a live region */
function announceToScreenReader(message) {
    try {
        let el = document.getElementById('screenReaderAnnouncer');
        if (!el) {
            el = document.createElement('div');
            el.id = 'screenReaderAnnouncer';
            el.setAttribute('aria-live', 'polite');
            el.setAttribute('aria-atomic', 'true');
            el.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
            document.body.appendChild(el);
        }
        el.textContent = '';
        setTimeout(function() { el.textContent = message; }, 100);
    } catch (e) { /* silently fail */ }
}

/** Wrap a function with an error boundary that calls fallback(error) on failure */
function withErrorBoundary(fn, fallback) {
    return function() {
        try {
            return fn.apply(this, arguments);
        } catch (error) {
            if (typeof Logger !== 'undefined') Logger.error('[withErrorBoundary]', error);
            if (typeof fallback === 'function') return fallback(error);
            return null;
        }
    };
}

// ============================================
// MISSING MODAL OPENER FUNCTIONS
// All modals exist in index.html but their
// JS opener functions were never defined.
// ============================================

function showCreateCrewTemplateModal() {
    showModal('createCrewTemplateModal');
}

function showAddTrainingModal() {
    showModal('addTrainingModal');
}

function showAwardBonusModal() {
    showModal('awardBonusModal');
}

function showRecordCallinModal() {
    showModal('recordCallinModal');
}

function showNewCallinModal() {
    showModal('recordCallinModal'); // Same modal
}

function showMarkAbsenceModal() {
    showModal('markAbsenceModal');
}

function showCreateOncallRotationModal() {
    showModal('createOncallRotationModal');
}

function showAddNoteModal() {
    showModal('addNoteModal');
}

function showCreateTemplateModal() {
    showModal('createTemplateModal');
}

// ============================================
// MISSING FEATURE FUNCTIONS
// ============================================

/** Change availability calendar month */
let _availabilityYear = new Date().getFullYear();
let _availabilityMonth = new Date().getMonth();

function changeAvailabilityMonth(delta) {
    _availabilityMonth += delta;
    if (_availabilityMonth > 11) { _availabilityMonth = 0; _availabilityYear++; }
    if (_availabilityMonth < 0)  { _availabilityMonth = 11; _availabilityYear--; }

    const label = document.getElementById('availabilityMonthYear');
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    if (label) label.textContent = months[_availabilityMonth] + ' ' + _availabilityYear;

    if (typeof loadSuperAvailability === 'function') loadSuperAvailability();
    else if (typeof renderAvailabilityCalendar === 'function') renderAvailabilityCalendar();
}

/** Load shift history for a staff member (boss view) */
function loadShiftHistory() {
    const staffFilter = document.getElementById('historyStaffFilter');
    const monthFilter = document.getElementById('historyMonthFilter');
    const container   = document.getElementById('shiftHistoryList') || document.getElementById('bossShiftHistory');
    if (!container) return;

    const staffId  = staffFilter ? staffFilter.value : '';
    const month    = monthFilter ? monthFilter.value : '';
    const allCrews = [];

    (schedules || []).forEach(sched => {
        (sched.crews || []).forEach(crew => {
            if (staffId && String(crew.paramedicId) !== String(staffId) && String(crew.emtId) !== String(staffId)) return;
            if (month && !(crew.date || '').startsWith(month)) return;
            allCrews.push({ ...crew, scheduleName: sched.name });
        });
    });

    if (allCrews.length === 0) {
        container.innerHTML = '<p class="empty-state">No shift history found.</p>';
        return;
    }

    const esc = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
    container.innerHTML = allCrews.sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(c => {
        const staffMember = (users || []).find(u => String(u.id) === String(c.paramedicId) || String(u.id) === String(c.emtId));
        return `<div class="shift-history-row" style="padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;">
            <span><strong>${esc(c.date)}</strong> — ${esc(c.rig || 'No Rig')} (${esc(c.type || c.shiftType || 'Shift')})</span>
            <span>${esc(c.scheduleName)}</span>
        </div>`;
    }).join('');
}

/** Generate monthly summary report */
function generateMonthlySummaryReport() {
    const container = document.getElementById('monthlySummaryReport') || document.getElementById('analyticsSummary');
    if (!container) { showAlert('Report area not found', 'warning'); return; }

    const totalShifts  = (schedules || []).reduce((n, s) => n + (s.crews || []).length, 0);
    const published    = (schedules || []).filter(s => s.status === 'published').length;
    const drafts       = (schedules || []).filter(s => s.status === 'draft').length;
    const activeStaff  = (users    || []).filter(u => u.active !== false && (u.role === 'paramedic' || u.role === 'emt')).length;

    container.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e0e0e0;">
            <h3 style="margin:0 0 16px;">📊 Monthly Summary Report</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
                <div style="background:#f8f9fa;padding:16px;border-radius:8px;text-align:center;">
                    <div style="font-size:2em;font-weight:700;color:var(--lifestar-red);">${totalShifts}</div>
                    <div style="font-size:13px;color:#666;">Total Shifts</div>
                </div>
                <div style="background:#f8f9fa;padding:16px;border-radius:8px;text-align:center;">
                    <div style="font-size:2em;font-weight:700;color:#28a745;">${published}</div>
                    <div style="font-size:13px;color:#666;">Published</div>
                </div>
                <div style="background:#f8f9fa;padding:16px;border-radius:8px;text-align:center;">
                    <div style="font-size:2em;font-weight:700;color:#ffc107;">${drafts}</div>
                    <div style="font-size:13px;color:#666;">Drafts</div>
                </div>
                <div style="background:#f8f9fa;padding:16px;border-radius:8px;text-align:center;">
                    <div style="font-size:2em;font-weight:700;color:#17a2b8;">${activeStaff}</div>
                    <div style="font-size:13px;color:#666;">Active Staff</div>
                </div>
            </div>
            <p style="margin:16px 0 0;font-size:13px;color:#888;">Generated ${new Date().toLocaleDateString()}</p>
        </div>`;

    showAlert('Report generated successfully', 'success');
}

// ============================================
// LOGIN UX ENHANCEMENTS
// ============================================

/** Toggle password visibility on login form */
function togglePasswordVisibility() {
    const pwd = document.getElementById('password');
    const btn = document.getElementById('togglePassword');
    if (!pwd) return;
    if (pwd.type === 'password') {
        pwd.type = 'text';
        if (btn) btn.textContent = '🙈';
    } else {
        pwd.type = 'password';
        if (btn) btn.textContent = '👁';
    }
}

/** Show/hide login spinner */
function setLoginLoading(loading) {
    const btnText    = document.getElementById('loginBtnText');
    const spinner    = document.getElementById('loginSpinner');
    const loginBtn   = document.getElementById('loginBtn');
    if (btnText)  btnText.style.display  = loading ? 'none'   : '';
    if (spinner)  spinner.style.display  = loading ? ''       : 'none';
    if (loginBtn) loginBtn.disabled      = loading;
}

// Inject loading state into handleLogin
(function patchLoginLoading() {
    document.addEventListener('DOMContentLoaded', function() {
        const form = document.getElementById('loginForm');
        if (!form) return;
        form.addEventListener('submit', function() {
            setLoginLoading(true);
            // Auto-reset in case of error (handleLogin will call showAlert which resets)
            setTimeout(() => setLoginLoading(false), 4000);
        }, { capture: true });
    });
})();

// ============================================
// REAL-TIME CLOCK for dashboards
// ============================================
(function initDashboardClocks() {
    function updateClocks() {
        const now  = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const date = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.querySelectorAll('.dashboard-clock-time').forEach(el => { el.textContent = time; });
        document.querySelectorAll('.dashboard-clock-date').forEach(el => { el.textContent = date; });
    }
    document.addEventListener('DOMContentLoaded', function() {
        updateClocks();
        setInterval(updateClocks, 1000);
    });
})();

// ============================================
// REMEMBER ME — auto-fill username
// ============================================
(function initRememberMe() {
    document.addEventListener('DOMContentLoaded', function() {
        const usernameField  = document.getElementById('username');
        const rememberBox    = document.getElementById('rememberMe');
        const savedUsername  = localStorage.getItem('lifestarRememberUsername');

        if (savedUsername && usernameField) {
            usernameField.value = savedUsername;
            if (rememberBox) rememberBox.checked = true;
        }

        // Save/clear on login form submit
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function() {
                const un   = document.getElementById('username');
                const rem  = document.getElementById('rememberMe');
                if (rem && rem.checked && un && un.value) {
                    localStorage.setItem('lifestarRememberUsername', un.value.trim());
                } else {
                    localStorage.removeItem('lifestarRememberUsername');
                }
            });
        }
    });
})();
