/**
 * Server Bridge Module
 * ===================
 * Transparently routes all app data operations through the real
 * Express/SQLite backend when running in server mode (port 8061),
 * and falls back to the existing localStorage path when loaded as a
 * static file — so the app keeps working either way without any
 * conditional branching in the rest of the codebase.
 *
 * How it works:
 *   1. On DOMContentLoaded it probes /api/health. If the probe
 *      succeeds, SERVER_MODE is set to true and from that point
 *      on every login, logout, user-list fetch, schedule fetch, etc.
 *      talks to the real API.
 *   2. If the probe fails (or the app is opened as a local file) the
 *      bridge is a no-op and the existing localStorage code runs as
 *      always.
 *   3. The bridge patches a small number of well-defined functions on
 *      the global scope (handleLogin, handleLogout, loadData) that
 *      app.js already owns.  All UI remains app.js's concern; this
 *      module only provides data.
 *
 * @module server-bridge
 */

'use strict';

const ServerBridge = (function () {

    // ─── STATE ────────────────────────────────────────────────────────────────

    let serverMode   = false;   // true once /api/health responds OK
    let authToken    = null;    // JWT stored in memory (also in httpOnly cookie server-side)
    let pollInterval = null;    // notification polling timer

    // How often to poll for new notifications (ms)
    const NOTIFICATION_POLL_MS = 30_000;

    // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────

    /**
     * Thin wrapper around fetch that:
     *   – always sends credentials (cookies)
     *   – always sends JSON
     *   – always reads JSON back
     *   – normalises errors into a consistent {ok, status, data} shape
     */
    async function apiFetch(method, path, body) {
        const opts = {
            method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        };
        if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
        if (body)      opts.body = JSON.stringify(body);

        try {
            const resp = await fetch('/api' + path, opts);
            const data = await resp.json().catch(() => ({}));
            return { ok: resp.ok, status: resp.status, data };
        } catch (err) {
            return { ok: false, status: 0, data: { error: err.message } };
        }
    }

    // ─── SERVER DETECTION ─────────────────────────────────────────────────────

    async function detectServer() {
        try {
            const r = await fetch('/api/health', { method: 'GET', credentials: 'include' });
            if (r.ok) {
                serverMode = true;
                Logger && Logger.info('[Bridge] Server mode active — using REST API');

                // Try to restore an existing session
                await tryRestoreSession();

                // Start notification polling
                startNotificationPolling();

                showServerBadge();
                return true;
            }
        } catch (_) { /* static file, no server */ }
        return false;
    }

    function showServerBadge() {
        // Small unobtrusive badge showing the app is in server mode
        const badge = document.createElement('div');
        badge.id = 'serverModeBadge';
        badge.title = 'Connected to Lifestar Server';
        badge.innerHTML = '🟢 Server';
        badge.style.cssText = `
            position:fixed; bottom:8px; left:8px; z-index:9999;
            background:rgba(16,185,129,0.15); color:#10b981;
            border:1px solid rgba(16,185,129,0.4); border-radius:999px;
            padding:3px 10px; font-size:11px; font-weight:600;
            pointer-events:none; letter-spacing:.3px;
        `;
        document.body.appendChild(badge);
    }

    // ─── SESSION RESTORE ──────────────────────────────────────────────────────

    async function tryRestoreSession() {
        const r = await apiFetch('GET', '/auth/me');
        if (r.ok && r.data.user) {
            _applyServerUser(r.data.user);
        }
    }

    function _applyServerUser(serverUser) {
        // Map server user shape → app's expected shape
        currentUser = {
            id:          serverUser.id,
            username:    serverUser.username,
            fullName:    serverUser.fullName,
            role:        serverUser.role,
            phone:       serverUser.phone || '',
            hoursWorked: serverUser.hoursWorked || 0,
            bonusHours:  serverUser.bonusHours  || 0,
            locationId:  serverUser.locationId  || null,
        };
        // Keep localStorage in sync so the rest of app.js is happy
        localStorage.setItem('lifestarCurrentUser', JSON.stringify(currentUser));
    }

    // ─── LOGIN OVERRIDE ───────────────────────────────────────────────────────

    /**
     * Replaces the localStorage-based handleLogin with one that posts
     * credentials to /api/auth/login.  The JWT is stored in the httpOnly
     * cookie by the server; we also keep a copy in memory for Authorization
     * headers in non-browser environments.
     */
    function patchLogin() {
        const _original = window.handleLogin;

        window.handleLogin = async function handleLoginServer(e) {
            if (!serverMode) { return _original.call(this, e); }

            e.preventDefault();
            const username = (document.getElementById('username') || {}).value?.trim();
            const password = (document.getElementById('password') || {}).value;

            if (!username || !password) {
                showAlert('Please enter both username and password', 'warning', 'loginAlert');
                return;
            }

            // Show a brief loading state on the submit button
            const btn = document.querySelector('#loginForm [type="submit"]');
            const original = btn && btn.innerHTML;
            if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Signing in…'; }

            const r = await apiFetch('POST', '/auth/login', { username, password });

            if (btn) { btn.disabled = false; btn.innerHTML = original; }

            if (r.ok && r.data.user) {
                if (r.data.token) authToken = r.data.token;
                _applyServerUser(r.data.user);

                // Pull full data from server into the in-memory arrays app.js uses
                await refreshDataFromServer();

                addSystemLog('User logged in: ' + username);
                showDashboard();
            } else {
                const msg = r.data?.message || r.data?.error || 'Login failed. Please try again.';
                showAlert(msg, 'danger', 'loginAlert');
            }
        };
    }

    // ─── LOGOUT OVERRIDE ─────────────────────────────────────────────────────

    function patchLogout() {
        const _original = window.handleLogout;

        window.handleLogout = async function handleLogoutServer() {
            if (!serverMode) { return _original && _original.call(this); }

            await apiFetch('POST', '/auth/logout');
            authToken = null;
            stopNotificationPolling();

            // Delegate visual teardown back to the original
            if (_original) _original.call(this);
            else {
                currentUser = null;
                localStorage.removeItem('lifestarCurrentUser');
                document.getElementById('loginPage').classList.remove('hidden');
                document.getElementById('loginPage').style.display = 'flex';
            }
        };
    }

    // ─── DATA SYNC ───────────────────────────────────────────────────────────

    /**
     * Pull users and schedules from the server and populate the
     * global arrays that app.js reads.  Called after login and
     * can be called manually to force a refresh.
     */
    async function refreshDataFromServer() {
        // Users (boss/super only — others get an empty array, which is fine)
        const uRes = await apiFetch('GET', '/users?limit=200');
        if (uRes.ok && uRes.data.users) {
            users = uRes.data.users.map(u => ({
                id:          u.id,
                username:    u.username,
                fullName:    u.fullName,
                role:        u.role,
                phone:       u.phone  || '',
                hoursWorked: u.hoursWorked || 0,
                bonusHours:  u.bonusHours  || 0,
                locationId:  u.locationId  || null,
                active:      u.active !== false,
            }));
            localStorage.setItem('lifestarUsers', JSON.stringify(users));
        }

        // Schedules
        const sRes = await apiFetch('GET', '/schedules?limit=200');
        if (sRes.ok && sRes.data.schedules) {
            schedules = sRes.data.schedules;
            localStorage.setItem('lifestarSchedules', JSON.stringify(schedules));
        }

        // Notifications — populate the notification bell
        await refreshNotifications();

        Logger && Logger.info('[Bridge] Data refreshed from server');
    }

    // ─── NOTIFICATIONS POLLING ────────────────────────────────────────────────

    async function refreshNotifications() {
        if (!serverMode || !currentUser) return;

        const r = await apiFetch('GET', '/logs/notifications?unreadOnly=true&limit=10');
        if (!r.ok) return;

        const notifs = r.data.notifications || [];

        // Update the notification badge count in the UI
        const badge = document.querySelector('.notification-badge, #notificationCount, [data-notification-count]');
        if (badge) badge.textContent = notifs.length || '';

        // Expose notifications so the UI can render them
        window._serverNotifications = notifs;

        // Trigger the existing notification system if available
        if (typeof NotificationCenter !== 'undefined' && notifs.length) {
            notifs.forEach(n => {
                if (!n.read) {
                    NotificationCenter.addNotification({
                        title:   n.title,
                        message: n.message,
                        type:    n.type || 'info',
                        id:      n.id
                    });
                }
            });
        }
    }

    function startNotificationPolling() {
        if (pollInterval) return;
        pollInterval = setInterval(refreshNotifications, NOTIFICATION_POLL_MS);
    }

    function stopNotificationPolling() {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    // ─── SAVE-DATA OVERRIDE ───────────────────────────────────────────────────

    /**
     * In server mode, suppress localStorage writes for users/schedules
     * (the server owns that data). We still allow saving UI preferences
     * and feature flags because those live only in the browser.
     */
    function patchSaveData() {
        const _original = window._doSave;
        if (!_original) return;

        window._doSave = function _doSaveServerAware() {
            if (!serverMode) { return _original.call(this); }
            // In server mode only persist non-data keys (feature flags, prefs, etc.)
            try {
                const featureStates = localStorage.getItem('lifestarFeatureStates');
                if (featureStates) localStorage.setItem('lifestarFeatureStates', featureStates);
            } catch (_) {}
        };
    }

    // ─── SCHEDULE CREATE PATCH ────────────────────────────────────────────────

    /**
     * In server mode, POST new schedules to the API and then sync back.
     * Falls through to the original for the static mode.
     */
    function patchCreateSchedule() {
        const _original = window.handleCreateSchedule;
        if (!_original) return;

        window.handleCreateSchedule = async function handleCreateScheduleServer(e) {
            if (!serverMode) { return _original.call(this, e); }

            e.preventDefault();
            const name        = document.getElementById('scheduleName')?.value?.trim();
            const month       = document.getElementById('scheduleMonth')?.value;
            const year        = document.getElementById('scheduleYear')?.value;
            const description = document.getElementById('scheduleDescription')?.value?.trim();

            if (!name) {
                showAlert('Schedule name is required', 'warning', 'scheduleAlert');
                return;
            }

            const r = await apiFetch('POST', '/schedules', { name, month, year, description });

            if (r.ok && r.data.schedule) {
                await refreshDataFromServer();
                showAlert('Schedule created successfully', 'success', 'scheduleAlert');
                // Trigger existing UI refresh
                if (typeof renderSchedules === 'function') renderSchedules();
                if (typeof loadSchedules   === 'function') loadSchedules();
            } else {
                showAlert(r.data?.error || 'Failed to create schedule', 'danger', 'scheduleAlert');
            }
        };
    }

    // ─── PUBLIC API ───────────────────────────────────────────────────────────

    return {
        /** True when the backend is available and in use */
        get isServerMode() { return serverMode; },

        /** Force a full data refresh from the server */
        refreshData: refreshDataFromServer,

        /** Low-level fetch — available for custom calls from other modules */
        fetch: apiFetch,

        /**
         * Called once on DOMContentLoaded to detect the server and
         * patch the relevant global functions.
         */
        async init() {
            const available = await detectServer();
            if (!available) return;

            // Patch core app functions — we wait until next tick so
            // app.js's own DOMContentLoaded handler has fully run first.
            setTimeout(() => {
                patchLogin();
                patchLogout();
                patchSaveData();
                patchCreateSchedule();
            }, 0);
        }
    };

})();

// Auto-initialise — this script loads before app.js's event listener fires
// because it's included in the same <script> block but higher.
document.addEventListener('DOMContentLoaded', () => ServerBridge.init(), { once: true });

// Expose globally for use from browser console and other modules
window.ServerBridge = ServerBridge;
