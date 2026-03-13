/**
 * Analytics Dashboard Module
 * ==========================
 * Fetches live data from /api/analytics/* when running in server mode
 * and renders KPI cards, bar charts, and summary tables for the boss
 * and super-admin analytics sections.
 *
 * Falls back gracefully to localStorage-derived statistics when the
 * server is unavailable (static / offline mode).
 *
 * Depends on:
 *   – Chart.js  (loaded deferred via CDN in index.html)
 *   – ServerBridge (server-bridge.js)  — optional, checked at runtime
 *   – window.users, window.schedules   — app.js global arrays
 *
 * @module analytics-dashboard
 */

'use strict';

const AnalyticsDashboard = (function () {

    // ─── CHART REGISTRY ───────────────────────────────────────────────────────
    // Keep references so we can destroy-and-recreate on theme change
    const charts = {};

    function destroyChart(id) {
        if (charts[id]) { try { charts[id].destroy(); } catch (_) {} delete charts[id]; }
    }

    // ─── DATA SOURCES ─────────────────────────────────────────────────────────

    /** Fetch from the server API if available, otherwise return null */
    async function fetchServerData(endpoint) {
        if (typeof ServerBridge === 'undefined' || !ServerBridge.isServerMode) return null;
        const r = await ServerBridge.fetch('GET', '/analytics' + endpoint);
        return r.ok ? r.data : null;
    }

    /** Build stats from the in-memory arrays when offline */
    function buildLocalStats() {
        const u = window.users    || [];
        const s = window.schedules || [];

        const byRole = {};
        u.forEach(usr => { byRole[usr.role] = (byRole[usr.role] || 0) + 1; });

        const totalHours  = u.reduce((acc, usr) => acc + (usr.hoursWorked || 0), 0);
        const activeScheds = s.filter(sc => sc.status === 'published').length;

        return {
            kpis: {
                totalUsers:        u.length,
                totalSchedules:    s.length,
                publishedSchedules: activeScheds,
                pendingTimeoff:    0,
                openIncidents:     0,
                openSwaps:         0,
                avgHoursWorked:    u.length ? Math.round(totalHours / u.length * 10) / 10 : 0,
            },
            usersByRole: Object.entries(byRole).map(([role, count]) => ({ role, count })),
            hoursByRole: Object.entries(byRole).map(([role, count]) => ({
                role, staffCount: count,
                totalHours: u.filter(x => x.role === role).reduce((a, x) => a + (x.hoursWorked || 0), 0)
            })),
        };
    }

    // ─── RENDERERS ────────────────────────────────────────────────────────────

    function renderKpis(kpis, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const items = [
            { label: 'Active Staff',        value: kpis.totalUsers,          icon: '👥', color: '#3b82f6' },
            { label: 'Total Schedules',     value: kpis.totalSchedules,      icon: '📅', color: '#8b5cf6' },
            { label: 'Published',           value: kpis.publishedSchedules,  icon: '✅', color: '#10b981' },
            { label: 'Pending Time-Off',    value: kpis.pendingTimeoff,      icon: '⏳', color: '#f59e0b' },
            { label: 'Open Incidents',      value: kpis.openIncidents,       icon: '⚠️', color: '#ef4444' },
            { label: 'Open Swaps',          value: kpis.openSwaps,           icon: '🔄', color: '#06b6d4' },
            { label: 'Avg Hours/Staff',     value: kpis.avgHoursWorked,      icon: '⏱️', color: '#84cc16' },
        ];

        el.innerHTML = items.map(item => `
            <div class="card" style="
                display:flex; flex-direction:column; align-items:center;
                padding:18px 12px; gap:6px; text-align:center;
                border-top: 3px solid ${item.color};
            ">
                <div style="font-size:26px">${item.icon}</div>
                <div style="font-size:28px; font-weight:700; color:${item.color}">${item.value}</div>
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:var(--text-secondary, #64748b)">${item.label}</div>
            </div>
        `).join('');
    }

    function renderRoleChart(usersByRole, canvasId) {
        if (typeof Chart === 'undefined') return;
        destroyChart(canvasId);

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const labels = usersByRole.map(r => r.role.charAt(0).toUpperCase() + r.role.slice(1));
        const counts = usersByRole.map(r => r.count);

        charts[canvasId] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: counts,
                    backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444'],
                    borderWidth: 2,
                    borderColor: isDark ? '#1e293b' : '#ffffff',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: isDark ? '#f1f5f9' : '#1e293b', padding: 12 }
                    }
                }
            }
        });
    }

    function renderHoursChart(hoursByRole, canvasId) {
        if (typeof Chart === 'undefined') return;
        destroyChart(canvasId);

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
        const tickColor = isDark ? '#94a3b8' : '#475569';

        charts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: hoursByRole.map(r => r.role),
                datasets: [
                    {
                        label: 'Total Hours',
                        data: hoursByRole.map(r => r.totalHours || 0),
                        backgroundColor: 'rgba(59,130,246,.7)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        borderRadius: 4,
                    },
                    {
                        label: 'Staff Count',
                        data: hoursByRole.map(r => r.staffCount || 0),
                        backgroundColor: 'rgba(16,185,129,.7)',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'count',
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: isDark ? '#f1f5f9' : '#1e293b' } } },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: tickColor } },
                    y: { title: { display: true, text: 'Hours', color: tickColor },
                         grid: { color: gridColor }, ticks: { color: tickColor } },
                    count: { position: 'right', title: { display: true, text: 'Staff', color: tickColor },
                             grid: { display: false }, ticks: { color: tickColor } }
                }
            }
        });
    }

    function renderRecentLogs(logs, containerId) {
        const el = document.getElementById(containerId);
        if (!el || !logs) return;

        el.innerHTML = `
            <div class="card">
                <div class="card-header"><h3 style="margin:0">Recent Activity</h3></div>
                <div class="card-body" style="padding:0">
                    <table style="width:100%; border-collapse:collapse; font-size:13px">
                        <thead><tr>
                            <th style="padding:8px 12px; text-align:left">Time</th>
                            <th style="padding:8px 12px; text-align:left">User</th>
                            <th style="padding:8px 12px; text-align:left">Message</th>
                            <th style="padding:8px 12px; text-align:left">Level</th>
                        </tr></thead>
                        <tbody>
                            ${logs.map(l => `
                                <tr>
                                    <td style="padding:8px 12px; white-space:nowrap; color:var(--text-muted,#64748b)">
                                        ${new Date(l.createdAt).toLocaleString()}
                                    </td>
                                    <td style="padding:8px 12px">${l.username || '—'}</td>
                                    <td style="padding:8px 12px">${escapeHtml(l.message)}</td>
                                    <td style="padding:8px 12px">
                                        <span class="badge badge-${l.level === 'error' ? 'danger' : l.level === 'warn' ? 'warning' : 'info'}">${l.level}</span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─── INJECT ANALYTICS HTML ────────────────────────────────────────────────

    /**
     * Build the enhanced analytics section HTML if the placeholder is empty.
     * The containers referenced below are injected here, then populated by
     * the render functions above.
     */
    function ensureAnalyticsHTML(containerId) {
        const el = document.getElementById(containerId);
        if (!el || el.querySelector('[data-analytics-kpis]')) return; // already built

        el.innerHTML = `
            <div data-analytics-kpis style="
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                gap: 12px; margin-bottom: 20px;
            " id="analyticsKpis"></div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px">
                <div class="card">
                    <div class="card-header"><h3 style="margin:0">Staff by Role</h3></div>
                    <div class="card-body" style="height:220px; position:relative">
                        <canvas id="roleChart"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3 style="margin:0">Hours by Role</h3></div>
                    <div class="card-body" style="height:220px; position:relative">
                        <canvas id="hoursChart"></canvas>
                    </div>
                </div>
            </div>

            <div id="analyticsActivityLog"></div>
        `;
    }

    // ─── MAIN LOAD ────────────────────────────────────────────────────────────

    async function load(containerId) {
        // Try multiple container IDs used across boss / super dashboards
        const targetId = containerId
            || (document.getElementById('superAnalyticsStats') ? 'superAnalyticsStats' : null)
            || 'bossAnalyticsContainer';

        ensureAnalyticsHTML(targetId);

        let overview, staffData;

        const serverOverview = await fetchServerData('/overview');
        const serverStaff    = await fetchServerData('/staff');

        if (serverOverview) {
            overview  = serverOverview;
            staffData = serverStaff;
        } else {
            // Fall back to localStorage data
            const local = buildLocalStats();
            overview  = { kpis: local.kpis, usersByRole: local.usersByRole, recentLogs: [] };
            staffData = { hoursByRole: local.hoursByRole };
        }

        renderKpis(overview.kpis, 'analyticsKpis');
        renderRoleChart(overview.usersByRole, 'roleChart');
        if (staffData) renderHoursChart(staffData.hoursByRole, 'hoursChart');
        if (overview.recentLogs) renderRecentLogs(overview.recentLogs, 'analyticsActivityLog');

        // Also update the legacy plain-text stat elements that exist in the HTML
        const legacyFields = {
            superAnalyticsTotalStaff:       overview.kpis.totalUsers,
            superAnalyticsTotalHours:        overview.kpis.avgHoursWorked + ' avg hrs',
            superAnalyticsActiveSchedules:   overview.kpis.publishedSchedules,
        };
        Object.entries(legacyFields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });
    }

    // Re-render charts when dark mode toggles
    window.addEventListener('themechange', () => {
        // Destroy charts so they repaint with the correct palette
        Object.keys(charts).forEach(destroyChart);
    });

    // ─── PUBLIC ───────────────────────────────────────────────────────────────
    return { load };

})();

// Wire up to the existing generateAnalyticsReport global
window.generateAnalyticsReport = function (containerId) {
    AnalyticsDashboard.load(containerId);
};

window.AnalyticsDashboard = AnalyticsDashboard;
