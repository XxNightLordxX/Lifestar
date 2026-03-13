/**
 * Incident Reports Frontend Module
 *
 * Provides the complete UI for the incident reporting system:
 *   - Report creation form with validation
 *   - Report list with filtering by status, type, priority
 *   - Detail view with status management (boss/super)
 *   - Priority colour coding and badges
 *
 * Works in both static mode (localStorage) and server mode (API).
 *
 * @module incident-reports
 */

(function() {
    'use strict';

    // ============================================
    // STATE
    // ============================================

    const STORAGE_KEY = 'lifestarIncidentReports';

    const TYPES = {
        'patient-care': 'Patient Care',
        'vehicle':      'Vehicle',
        'workplace':    'Workplace',
        'equipment':    'Equipment',
        'other':        'Other'
    };

    const PRIORITIES = {
        'low':      { label: 'Low',      color: '#28a745', bg: '#d4edda' },
        'medium':   { label: 'Medium',   color: '#ffc107', bg: '#fff3cd' },
        'high':     { label: 'High',     color: '#fd7e14', bg: '#ffe8d6' },
        'critical': { label: 'Critical', color: '#dc3545', bg: '#f8d7da' }
    };

    const STATUSES = {
        'open':          { label: 'Open',          color: '#0d6efd' },
        'under-review':  { label: 'Under Review',  color: '#fd7e14' },
        'resolved':      { label: 'Resolved',      color: '#28a745' },
        'closed':        { label: 'Closed',        color: '#6c757d' }
    };

    // ============================================
    // DATA LAYER (localStorage mode)
    // ============================================

    function loadReports() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveReports(reports) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
        } catch (e) {
            if (typeof Logger !== 'undefined') Logger.error('[IncidentReports] Save failed:', e);
        }
    }

    function createReport(data) {
        const reports = loadReports();
        const report = {
            id:           Date.now(),
            title:        (data.title || '').trim(),
            type:         data.type || 'other',
            priority:     data.priority || 'medium',
            status:       'open',
            description:  (data.description || '').trim(),
            location:     (data.location || '').trim(),
            involvedStaff: Array.isArray(data.involvedStaff) ? data.involvedStaff : [],
            reportedBy:   (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : 'unknown',
            reportedByName: (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.fullName || currentUser.username) : 'Unknown',
            resolvedAt:   null,
            createdAt:    new Date().toISOString(),
            updatedAt:    new Date().toISOString()
        };
        reports.unshift(report);
        saveReports(reports);
        return report;
    }

    function updateReportStatus(id, status) {
        const reports = loadReports();
        const idx = reports.findIndex(r => r.id === id);
        if (idx === -1) return false;
        reports[idx].status    = status;
        reports[idx].updatedAt = new Date().toISOString();
        if (status === 'resolved' || status === 'closed') {
            reports[idx].resolvedAt = reports[idx].resolvedAt || new Date().toISOString();
        }
        saveReports(reports);
        return true;
    }

    function _deleteReportData(id) {
        const reports = loadReports().filter(r => r.id != id);
        saveReports(reports);
    }

    // ============================================
    // HELPERS
    // ============================================

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function relativeTime(isoStr) {
        if (!isoStr) return 'Unknown';
        const diff = Date.now() - new Date(isoStr).getTime();
        const mins  = Math.floor(diff / 60000);
        const hours = Math.floor(mins  / 60);
        const days  = Math.floor(hours / 24);
        if (days  > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (mins  > 0) return `${mins}m ago`;
        return 'Just now';
    }

    function priorityBadge(priority) {
        const p = PRIORITIES[priority] || PRIORITIES.medium;
        return `<span style="background:${p.bg};color:${p.color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${p.label}</span>`;
    }

    function statusBadge(status) {
        const s = STATUSES[status] || STATUSES.open;
        return `<span style="background:${s.color}22;color:${s.color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${s.label}</span>`;
    }

    function isManager() {
        return typeof currentUser !== 'undefined' && currentUser &&
               (currentUser.role === 'boss' || currentUser.role === 'super');
    }

    // ============================================
    // RENDER — REPORT LIST
    // ============================================

    /**
     * Render the incidents list into a container element.
     * @param {string} containerId  - DOM element ID to render into.
     * @param {Object} filters      - Optional { status, type, priority }
     */
    function renderReportList(containerId, filters) {
        filters = filters || {};
        const container = document.getElementById(containerId);
        if (!container) return;

        let reports = loadReports();

        // Managers see all; others see only their own
        if (!isManager() && typeof currentUser !== 'undefined' && currentUser) {
            reports = reports.filter(r => r.reportedBy === currentUser.username);
        }

        // Apply filters
        if (filters.status)   reports = reports.filter(r => r.status   === filters.status);
        if (filters.type)     reports = reports.filter(r => r.type     === filters.type);
        if (filters.priority) reports = reports.filter(r => r.priority === filters.priority);

        // Sort: critical first, then by date desc
        const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        reports.sort((a, b) => {
            const pd = (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2);
            if (pd !== 0) return pd;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        if (reports.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:48px 24px;color:#666;">
                    <div style="font-size:48px;margin-bottom:12px;">📋</div>
                    <div style="font-size:16px;font-weight:600;margin-bottom:8px;">No incident reports</div>
                    <div style="font-size:14px;color:#999;">
                        ${isManager() ? 'No reports have been filed yet.' : 'You have not filed any reports yet.'}
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = reports.map(r => `
            <div class="incident-card" data-id="${r.id}" onclick="IncidentReports.showDetail(${r.id})"
                 style="background:#fff;border:1px solid #e0e0e0;border-left:4px solid ${(PRIORITIES[r.priority]||PRIORITIES.medium).color};
                        border-radius:8px;padding:16px 20px;margin-bottom:12px;cursor:pointer;
                        transition:box-shadow .15s;${r.priority === 'critical' ? 'animation:pulse-incident 2s infinite;' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;font-size:15px;margin-bottom:6px;color:#222;">${esc(r.title)}</div>
                        <div style="font-size:13px;color:#666;margin-bottom:8px;">
                            ${esc(TYPES[r.type] || r.type)} • Reported by <strong>${esc(r.reportedByName || r.reportedBy)}</strong> • ${relativeTime(r.createdAt)}
                        </div>
                        ${r.location ? `<div style="font-size:12px;color:#888;">📍 ${esc(r.location)}</div>` : ''}
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                        ${priorityBadge(r.priority)}
                        ${statusBadge(r.status)}
                    </div>
                </div>
                ${r.description ? `<div style="margin-top:10px;font-size:13px;color:#555;border-top:1px solid #f0f0f0;padding-top:10px;
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">${esc(r.description)}</div>` : ''}
            </div>
        `).join('');
    }

    // ============================================
    // RENDER — DETAIL VIEW (modal)
    // ============================================

    function showDetail(id) {
        const reports = loadReports();
        const report = reports.find(r => r.id == id);
        if (!report) return;

        const canManage = isManager();
        const isOwnerOpen = typeof currentUser !== 'undefined' && currentUser &&
                            report.reportedBy === currentUser.username &&
                            report.status === 'open';

        const modalHTML = `
            <div id="incidentDetailModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;
                 display:flex;align-items:center;justify-content:center;padding:20px;" onclick="IncidentReports.closeDetail(event)">
                <div style="background:#fff;border-radius:12px;max-width:640px;width:100%;max-height:90vh;
                            overflow-y:auto;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.3);"
                     onclick="event.stopPropagation()">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                        <div>
                            <h2 style="font-size:20px;margin:0 0 8px;">${esc(report.title)}</h2>
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                                ${priorityBadge(report.priority)}
                                ${statusBadge(report.status)}
                                <span style="font-size:12px;color:#888;">#${report.id}</span>
                            </div>
                        </div>
                        <button onclick="IncidentReports.closeDetail()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#666;">✕</button>
                    </div>

                    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
                        <tr><td style="padding:6px 0;color:#888;width:120px;">Type</td><td><strong>${esc(TYPES[report.type] || report.type)}</strong></td></tr>
                        <tr><td style="padding:6px 0;color:#888;">Reported by</td><td>${esc(report.reportedByName || report.reportedBy)}</td></tr>
                        <tr><td style="padding:6px 0;color:#888;">Filed</td><td>${new Date(report.createdAt).toLocaleString()}</td></tr>
                        ${report.location ? `<tr><td style="padding:6px 0;color:#888;">Location</td><td>${esc(report.location)}</td></tr>` : ''}
                        ${report.resolvedAt ? `<tr><td style="padding:6px 0;color:#888;">Resolved</td><td>${new Date(report.resolvedAt).toLocaleString()}</td></tr>` : ''}
                        ${report.involvedStaff && report.involvedStaff.length > 0 ?
                            `<tr><td style="padding:6px 0;color:#888;vertical-align:top;">Involved</td><td>${report.involvedStaff.map(s => esc(s)).join(', ')}</td></tr>` : ''}
                    </table>

                    <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;">
                        <div style="font-size:12px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Description</div>
                        <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(report.description)}</div>
                    </div>

                    ${(canManage || isOwnerOpen) ? `
                        <div style="border-top:1px solid #eee;padding-top:20px;">
                            ${canManage ? `
                                <div style="margin-bottom:12px;">
                                    <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px;">Update Status</label>
                                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                        ${Object.entries(STATUSES).map(([val, info]) => `
                                            <button onclick="IncidentReports.updateStatus(${report.id}, '${val}')"
                                                    style="padding:6px 14px;border:2px solid ${info.color};border-radius:20px;
                                                           background:${report.status === val ? info.color : '#fff'};
                                                           color:${report.status === val ? '#fff' : info.color};
                                                           font-size:12px;font-weight:600;cursor:pointer;">
                                                ${info.label}
                                            </button>`).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            ${(typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'super') ? `
                                <button onclick="IncidentReports.deleteReport(${report.id})"
                                        style="padding:8px 16px;background:#dc3545;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;margin-top:8px;">
                                    Delete Report
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    function closeDetail(e) {
        if (e && e.target && e.target !== document.getElementById('incidentDetailModal')) return;
        const modal = document.getElementById('incidentDetailModal');
        if (modal) modal.remove();
    }

    function updateStatus(id, status) {
        if (updateReportStatus(id, status)) {
            closeDetail();
            if (typeof showToast === 'function') showToast(`Status updated to ${STATUSES[status]?.label || status}`, 'success');
            // Re-render whatever list is visible
            if (document.getElementById('incidentsList')) renderReportList('incidentsList');
            if (document.getElementById('bossIncidentsList')) renderReportList('bossIncidentsList');
        }
    }

    function deleteReport(id) {
        if (!confirm('Delete this incident report? This cannot be undone.')) return;
        _deleteReportData(id);
        closeDetail();
        if (typeof showAlert === 'function') showAlert('Report deleted', 'info');
        if (document.getElementById('incidentsList')) renderReportList('incidentsList');
        if (document.getElementById('bossIncidentsList')) renderReportList('bossIncidentsList');
    }

    // ============================================
    // RENDER — CREATE FORM
    // ============================================

    function renderCreateForm(containerId, onSuccess) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e0e0e0;">
                <h3 style="margin:0 0 20px;font-size:18px;">File Incident Report</h3>

                <div class="form-group" style="margin-bottom:16px;">
                    <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">Title *</label>
                    <input id="ir_title" type="text" maxlength="200" placeholder="Brief summary of the incident"
                           style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                    <div class="form-group">
                        <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">Type *</label>
                        <select id="ir_type" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                            <option value="">Select type</option>
                            ${Object.entries(TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">Priority</label>
                        <select id="ir_priority" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                            ${Object.entries(PRIORITIES).map(([v, p]) => `<option value="${v}">${p.label}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom:16px;">
                    <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">Location</label>
                    <input id="ir_location" type="text" maxlength="200" placeholder="Where did this occur? (optional)"
                           style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                </div>

                <div class="form-group" style="margin-bottom:16px;">
                    <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">Description *</label>
                    <textarea id="ir_description" rows="5" maxlength="5000"
                              placeholder="Describe the incident in detail. Include what happened, when, and any immediate actions taken."
                              style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;resize:vertical;"></textarea>
                    <div style="text-align:right;font-size:11px;color:#999;margin-top:4px;">
                        <span id="ir_desc_count">0</span>/5000
                    </div>
                </div>

                <div id="ir_error" style="display:none;background:#f8d7da;color:#721c24;padding:10px 14px;
                     border-radius:6px;margin-bottom:16px;font-size:13px;"></div>

                <button id="ir_submit_btn" onclick="IncidentReports.submitCreate()"
                        style="padding:12px 28px;background:#e31c25;color:#fff;border:none;border-radius:8px;
                               font-size:14px;font-weight:600;cursor:pointer;width:100%;">
                    Submit Report
                </button>
            </div>
        `;

        // Character counter
        const desc = document.getElementById('ir_description');
        const counter = document.getElementById('ir_desc_count');
        if (desc && counter) {
            desc.addEventListener('input', () => { counter.textContent = desc.value.length; });
        }

        window._incidentOnSuccess = onSuccess;
    }

    function submitCreate() {
        const title       = (document.getElementById('ir_title')?.value || '').trim();
        const type        = document.getElementById('ir_type')?.value || '';
        const priority    = document.getElementById('ir_priority')?.value || 'medium';
        const location    = (document.getElementById('ir_location')?.value || '').trim();
        const description = (document.getElementById('ir_description')?.value || '').trim();
        const errorEl     = document.getElementById('ir_error');
        const submitBtn   = document.getElementById('ir_submit_btn');

        // Client-side validation
        const errors = [];
        if (!title)       errors.push('Title is required');
        if (!type)        errors.push('Please select a type');
        if (!description) errors.push('Description is required');
        if (description.length > 5000) errors.push('Description is too long (max 5000 characters)');

        if (errors.length > 0) {
            if (errorEl) { errorEl.innerHTML = errors.join('<br>'); errorEl.style.display = 'block'; }
            return;
        }

        if (errorEl) errorEl.style.display = 'none';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

        try {
            const report = createReport({ title, type, priority, location, description });

            if (typeof addSystemLog === 'function') {
                addSystemLog(`Incident report filed: "${title}" (${TYPES[type]})`);
            }

            if (typeof showToast === 'function') {
                showToast('Incident report submitted successfully', 'success');
            }

            if (typeof window._incidentOnSuccess === 'function') {
                window._incidentOnSuccess(report);
            }

            // Clear form
            ['ir_title', 'ir_type', 'ir_location', 'ir_description'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            if (document.getElementById('ir_desc_count')) {
                document.getElementById('ir_desc_count').textContent = '0';
            }

        } catch (err) {
            if (errorEl) { errorEl.innerHTML = 'Failed to submit report. Please try again.'; errorEl.style.display = 'block'; }
            if (typeof Logger !== 'undefined') Logger.error('[IncidentReports] Submit error:', err);
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Report'; }
        }
    }

    // ============================================
    // MAIN LOAD FUNCTION (called from app.js section routing)
    // ============================================

    function loadIncidentReports(containerId) {
        containerId = containerId || 'incidentsList';
        const container = document.getElementById(containerId);
        if (!container) return;

        const canCreate = typeof currentUser !== 'undefined' && currentUser &&
                          ['paramedic', 'emt', 'boss', 'super'].includes(currentUser.role);

        container.innerHTML = `
            <div style="padding:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
                    <h2 style="margin:0;font-size:20px;">Incident Reports</h2>
                    ${canCreate ? `<button onclick="IncidentReports.toggleCreateForm()" id="ir_toggle_btn"
                            style="padding:10px 20px;background:#e31c25;color:#fff;border:none;border-radius:8px;
                                   font-size:14px;font-weight:600;cursor:pointer;">
                        + New Report
                    </button>` : ''}
                </div>

                <div id="ir_create_area" style="display:none;margin-bottom:24px;"></div>

                <!-- Filter bar -->
                <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
                    <select id="ir_filter_status" onchange="IncidentReports.applyFilters()"
                            style="padding:7px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                        <option value="">All Statuses</option>
                        ${Object.entries(STATUSES).map(([v, s]) => `<option value="${v}">${s.label}</option>`).join('')}
                    </select>
                    <select id="ir_filter_priority" onchange="IncidentReports.applyFilters()"
                            style="padding:7px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                        <option value="">All Priorities</option>
                        ${Object.entries(PRIORITIES).map(([v, p]) => `<option value="${v}">${p.label}</option>`).join('')}
                    </select>
                    <select id="ir_filter_type" onchange="IncidentReports.applyFilters()"
                            style="padding:7px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                        <option value="">All Types</option>
                        ${Object.entries(TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
                    </select>
                </div>

                <div id="ir_list_container"></div>
            </div>
        `;

        renderReportList('ir_list_container');
    }

    function toggleCreateForm() {
        const area = document.getElementById('ir_create_area');
        const btn  = document.getElementById('ir_toggle_btn');
        if (!area) return;
        if (area.style.display === 'none') {
            area.style.display = 'block';
            renderCreateForm('ir_create_area', function() {
                area.style.display = 'none';
                if (btn) btn.textContent = '+ New Report';
                renderReportList('ir_list_container');
            });
            if (btn) btn.textContent = '✕ Cancel';
        } else {
            area.style.display = 'none';
            if (btn) btn.textContent = '+ New Report';
        }
    }

    function applyFilters() {
        const status   = document.getElementById('ir_filter_status')?.value || '';
        const priority = document.getElementById('ir_filter_priority')?.value || '';
        const type     = document.getElementById('ir_filter_type')?.value || '';
        renderReportList('ir_list_container', { status, priority, type });
    }

    // ============================================
    // STATS WIDGET (for boss dashboard)
    // ============================================

    function renderStatsWidget(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const reports = loadReports();
        const byStatus = {};
        const byPriority = {};

        for (const r of reports) {
            byStatus[r.status]     = (byStatus[r.status]     || 0) + 1;
            byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
        }

        const openCount     = byStatus['open']    || 0;
        const reviewCount   = byStatus['under-review'] || 0;
        const criticalCount = byPriority['critical'] || 0;
        const highCount     = byPriority['high'] || 0;

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                <div style="background:#fff3cd;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#856404;">${openCount}</div>
                    <div style="font-size:12px;color:#856404;margin-top:4px;">Open</div>
                </div>
                <div style="background:#cfe2ff;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#0a58ca;">${reviewCount}</div>
                    <div style="font-size:12px;color:#0a58ca;margin-top:4px;">Under Review</div>
                </div>
                <div style="background:#f8d7da;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#dc3545;">${criticalCount}</div>
                    <div style="font-size:12px;color:#dc3545;margin-top:4px;">Critical</div>
                </div>
                <div style="background:#ffe8d6;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#fd7e14;">${highCount}</div>
                    <div style="font-size:12px;color:#fd7e14;margin-top:4px;">High Priority</div>
                </div>
            </div>
        `;
    }

    // ============================================
    // CSS INJECTION
    // ============================================

    function injectStyles() {
        if (document.getElementById('incident-reports-styles')) return;
        const style = document.createElement('style');
        style.id = 'incident-reports-styles';
        style.textContent = `
            .incident-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.12); }
            @keyframes pulse-incident {
                0%, 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4); }
                50%       { box-shadow: 0 0 0 6px rgba(220, 53, 69, 0); }
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    // PUBLIC API
    // ============================================

    const IncidentReports = {
        load:              loadIncidentReports,
        renderList:        renderReportList,
        renderCreateForm,
        renderStatsWidget,
        showDetail,
        closeDetail,
        updateStatus,
        deleteReport:      function(id) {
            if (!confirm('Delete this incident report? This cannot be undone.')) return;
            deleteReport(id);
            closeDetail();
            if (typeof showToast === 'function') showToast('Report deleted', 'info');
            renderReportList('ir_list_container');
        },
        submitCreate,
        toggleCreateForm,
        applyFilters,
        getStats() {
            const reports = loadReports();
            const byStatus = {};
            for (const r of reports) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
            return { total: reports.length, byStatus };
        }
    };

    window.IncidentReports = IncidentReports;

    // Keep backward compatibility with the existing app.js call site
    window.loadIncidentReports = loadIncidentReports;

    // Inject styles when module loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyles);
    } else {
        injectStyles();
    }

    if (typeof Logger !== 'undefined') Logger.debug('✅ IncidentReports module loaded');

})();
