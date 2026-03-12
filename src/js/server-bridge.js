/**
 * Server Bridge Module
 * ===================
 * Routes all app data operations through the Express/SQLite backend when
 * running in server mode (port 8061), and falls back to localStorage when
 * opened as a static file.
 *
 * Provides server-side patches for:
 *   - Login / Logout
 *   - User CRUD (add, edit, delete)
 *   - Schedule CRUD
 *   - Data sync (refreshDataFromServer)
 *   - saveData suppression (server owns that data)
 *
 * @module server-bridge
 */

'use strict';

const ServerBridge = (function () {

    // ─── STATE ────────────────────────────────────────────────────────────────
    let serverMode   = false;
    let authToken    = null;
    let pollInterval = null;
    const NOTIFICATION_POLL_MS = 30_000;

    // ─── FETCH HELPER ────────────────────────────────────────────────────────
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
                Logger && Logger.info('[Bridge] Server mode active');
                await tryRestoreSession();
                startNotificationPolling();
                showServerBadge();
                return true;
            }
        } catch (_) {}
        return false;
    }

    function showServerBadge() {
        const badge = document.createElement('div');
        badge.id = 'serverModeBadge';
        badge.title = 'Connected to Lifestar Server';
        badge.innerHTML = '🟢 Server';
        badge.style.cssText = `
            position:fixed;bottom:8px;left:8px;z-index:9999;
            background:rgba(16,185,129,.15);color:#10b981;
            border:1px solid rgba(16,185,129,.4);border-radius:999px;
            padding:3px 10px;font-size:11px;font-weight:600;
            pointer-events:none;letter-spacing:.3px;
        `;
        document.body.appendChild(badge);
    }

    // ─── SESSION RESTORE ──────────────────────────────────────────────────────
    async function tryRestoreSession() {
        const r = await apiFetch('GET', '/auth/me');
        if (r.ok && r.data.user) {
            _applyServerUser(r.data.user);
            await refreshDataFromServer();
            const loginPage = document.getElementById('loginPage');
            if (loginPage && !loginPage.classList.contains('hidden')) {
                if (typeof showDashboard === 'function') showDashboard();
            }
        }
    }

    function _applyServerUser(serverUser) {
        currentUser = {
            id:          serverUser.id,
            username:    serverUser.username,
            fullName:    serverUser.fullName,
            role:        serverUser.role,
            phone:       serverUser.phone || '',
            hoursWorked: serverUser.hoursWorked || 0,
            bonusHours:  serverUser.bonusHours  || 0,
            locationId:  serverUser.locationId  || null,
            active:      serverUser.active !== false,
        };
        localStorage.setItem('lifestarCurrentUser', JSON.stringify(currentUser));
    }

    // ─── LOGIN ────────────────────────────────────────────────────────────────
    function patchLogin() {
        const _original = window.handleLogin;
        window.handleLogin = async function handleLoginServer(e) {
            if (!serverMode) return _original.call(this, e);
            e.preventDefault();

            // Read inputs — try multiple IDs for resilience
            const usernameEl = document.getElementById('username');
            const passwordEl = document.getElementById('password');
            const username = (usernameEl?.value || '').trim();
            const password = (passwordEl?.value || '');

            if (!username || !password) {
                showAlert('Please enter both username and password', 'warning', 'loginAlert');
                return;
            }

            const btn = document.querySelector('#loginForm [type="submit"]');
            const orig = btn?.innerHTML;
            if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Signing in…'; }

            const r = await apiFetch('POST', '/auth/login', { username, password });

            if (btn) { btn.disabled = false; btn.innerHTML = orig; }

            if (r.ok && r.data.user) {
                if (r.data.token) authToken = r.data.token;
                _applyServerUser(r.data.user);
                await refreshDataFromServer();
                if (typeof addSystemLog === 'function') addSystemLog('User logged in: ' + username);
                if (typeof showDashboard === 'function') showDashboard();
            } else {
                const msg = r.data?.message || r.data?.error || 'Login failed. Please check your credentials.';
                showAlert(msg, 'danger', 'loginAlert');
            }
        };
    }

    // ─── LOGOUT ───────────────────────────────────────────────────────────────
    function patchLogout() {
        const _original = window.handleLogout;
        window.handleLogout = async function handleLogoutServer() {
            if (!serverMode) return _original?.call(this);
            await apiFetch('POST', '/auth/logout');
            authToken = null;
            stopNotificationPolling();
            if (_original) _original.call(this);
            else {
                currentUser = null;
                localStorage.removeItem('lifestarCurrentUser');
                const lp = document.getElementById('loginPage');
                if (lp) { lp.classList.remove('hidden'); lp.style.display = 'flex'; }
            }
        };
    }

    // ─── DATA SYNC ───────────────────────────────────────────────────────────
    async function refreshDataFromServer() {
        // Users (super/boss see full list, others get partial)
        const uRes = await apiFetch('GET', '/users?limit=500');
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
                createdAt:   u.createdAt,
            }));
            localStorage.setItem('lifestarUsers', JSON.stringify(users));
        }

        // Schedules — attach crews array to each
        const sRes = await apiFetch('GET', '/schedules?limit=500&includeCrews=true');
        if (sRes.ok && sRes.data.schedules) {
            schedules = sRes.data.schedules.map(s => ({
                ...s,
                crews: s.crews || [],
            }));
            localStorage.setItem('lifestarSchedules', JSON.stringify(schedules));
        }

        await refreshNotifications();
        Logger && Logger.info('[Bridge] Data synced from server');
    }

    // ─── USER CRUD PATCHES ────────────────────────────────────────────────────
    function patchUserCRUD() {
        // ----- CREATE / EDIT user -----
        const _origAdd = window.handleAddUser;
        window.handleAddUser = async function handleAddUserServer(e) {
            if (!serverMode) return _origAdd?.call(this, e);
            e.preventDefault();

            const isEdit = typeof editingUserId !== 'undefined' && editingUserId;
            const data = typeof getUserFormData === 'function' ? getUserFormData() : {};

            if (typeof validateUserData === 'function' && !validateUserData(data, !isEdit)) return;

            let r;
            if (isEdit) {
                // Build update payload — only include password if provided
                const payload = {
                    fullName: data.fullName,
                    role: data.role,
                    phone: data.phone,
                    locationId: data.locationId || null,
                };
                if (data.password) payload.password = data.password;

                r = await apiFetch('PUT', `/users/${isEdit}`, payload);
            } else {
                r = await apiFetch('POST', '/users', {
                    username:  data.username,
                    password:  data.password,
                    fullName:  data.fullName,
                    role:      data.role,
                    phone:     data.phone,
                    locationId: data.locationId || null,
                });
            }

            if (r.ok) {
                await refreshDataFromServer();
                if (typeof finalizeUserSave === 'function') finalizeUserSave(data.username, !!isEdit);
                if (isEdit && typeof editingUserId !== 'undefined') editingUserId = null;
                const form = document.getElementById('addUserForm');
                if (form) form.reset();
            } else {
                const msg = r.data?.message || r.data?.error || (isEdit ? 'Failed to update user' : 'Failed to create user');
                showAlert(msg, 'danger', 'userAlert');
            }
        };

        // ----- DELETE user -----
        const _origDelete = window.deleteUser;
        window.deleteUser = async function deleteUserServer(userId) {
            if (!serverMode) return _origDelete?.call(this, userId);
            const user = users.find(u => u.id === userId);
            if (!user) return;
            if (!confirm(`Delete user "${user.fullName}"? This cannot be undone.`)) return;

            const r = await apiFetch('DELETE', `/users/${userId}`);
            if (r.ok) {
                await refreshDataFromServer();
                if (typeof loadUsersTable === 'function') loadUsersTable();
                showAlert('User deleted', 'success');
            } else {
                showAlert(r.data?.error || 'Failed to delete user', 'danger');
            }
        };
    }

    // ─── SCHEDULE CRUD PATCHES ────────────────────────────────────────────────
    function patchCreateSchedule() {
        const _original = window.handleCreateSchedule;
        window.handleCreateSchedule = async function handleCreateScheduleServer(e) {
            if (!serverMode) return _original?.call(this, e);
            e.preventDefault();

            const name        = document.getElementById('scheduleName')?.value?.trim();
            const month       = document.getElementById('scheduleMonth')?.value;
            const year        = document.getElementById('scheduleYear')?.value;
            const description = document.getElementById('scheduleDescription')?.value?.trim();

            if (!name) { showAlert('Schedule name is required', 'warning', 'scheduleAlert'); return; }

            const r = await apiFetch('POST', '/schedules', { name, month, year, description });
            if (r.ok) {
                await refreshDataFromServer();
                showAlert('Schedule created successfully!', 'success', 'scheduleAlert');
                if (typeof renderSchedules === 'function') renderSchedules();
                if (typeof loadSchedules   === 'function') loadSchedules();
                if (typeof closeModal === 'function') closeModal('createScheduleModal');
            } else {
                showAlert(r.data?.error || 'Failed to create schedule', 'danger', 'scheduleAlert');
            }
        };
    }

    // ─── SAVE-DATA SUPPRESSION ────────────────────────────────────────────────
    function patchSaveData() {
        const _original = window._doSave;
        if (!_original) return;
        window._doSave = function _doSaveServerAware() {
            if (!serverMode) return _original.call(this);
            // In server mode only persist UI prefs, not data owned by the server
            try {
                ['lifestarFeatureStates','lifestar_theme','lifestarPermissions']
                    .forEach(k => {
                        const v = localStorage.getItem(k);
                        if (v) localStorage.setItem(k, v);
                    });
            } catch (_) {}
        };
    }

    // ─── NOTIFICATIONS ────────────────────────────────────────────────────────
    async function refreshNotifications() {
        if (!serverMode || !currentUser) return;
        const r = await apiFetch('GET', '/logs/notifications?unreadOnly=true&limit=10');
        if (!r.ok) return;
        const notifs = r.data.notifications || [];
        const badge = document.querySelector('.notification-badge,#notificationCount,[data-notification-count]');
        if (badge) badge.textContent = notifs.length || '';
        window._serverNotifications = notifs;
        if (typeof NotificationCenter !== 'undefined' && notifs.length) {
            notifs.forEach(n => {
                if (!n.read) NotificationCenter.addNotification({ title: n.title, message: n.message, type: n.type || 'info', id: n.id });
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

    // ─── PUBLIC API ───────────────────────────────────────────────────────────
    return {
        get isServerMode() { return serverMode; },
        refreshData: refreshDataFromServer,
        fetch: apiFetch,

        async init() {
            const available = await detectServer();
            if (!available) return;
            // Patch after app.js's DOMContentLoaded has fully run
            setTimeout(() => {
                patchLogin();
                patchLogout();
                patchSaveData();
                patchCreateSchedule();
                patchUserCRUD();
                Logger && Logger.info('[Bridge] All patches applied');
            }, 0);
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => ServerBridge.init(), { once: true });
window.ServerBridge = ServerBridge;

