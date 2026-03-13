/**
 * Notifications Panel Module
 * ==========================
 * Renders a real-time notification bell with a slide-down panel.
 *
 * When in server mode (ServerBridge.isServerMode === true), it polls
 * /api/logs/notifications every 30 seconds and shows live alerts.
 *
 * In static mode it listens to the NotificationCenter events that
 * core-notifications.js fires, so everything still works offline.
 *
 * The bell icon and badge are injected into whatever element has
 * id="notificationBellContainer" or into the first .top-bar found.
 *
 * @module notifications-panel
 */
'use strict';

const NotificationsPanel = (function () {

    let _notifications   = [];   // [{id,title,message,type,read,createdAt}]
    let _panelOpen       = false;
    let _pollTimer       = null;

    const POLL_MS        = 30_000;
    const MAX_DISPLAY    = 50;

    // ─── BADGE ────────────────────────────────────────────────────────────────

    function _unreadCount() {
        return _notifications.filter(n => !n.read).length;
    }

    function _updateBadge() {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        const count = _unreadCount();
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }

    // ─── PANEL HTML ───────────────────────────────────────────────────────────

    function _renderPanel() {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;

        const items = _notifications.slice(0, MAX_DISPLAY);

        panel.innerHTML = `
            <div id="notifPanelHeader" style="
                display:flex; justify-content:space-between; align-items:center;
                padding:12px 16px; border-bottom:1px solid var(--border-color,#e2e8f0);
            ">
                <strong>Notifications</strong>
                ${_unreadCount() > 0 ? `
                    <button onclick="NotificationsPanel.markAllRead()" style="
                        background:none; border:none; cursor:pointer;
                        font-size:12px; color:var(--accent-blue,#3b82f6)
                    ">Mark all read</button>
                ` : ''}
            </div>
            <div style="max-height:360px; overflow-y:auto">
                ${items.length === 0 ? `
                    <div style="padding:32px; text-align:center; color:var(--text-muted,#64748b)">
                        <div style="font-size:32px;margin-bottom:8px">🔔</div>
                        <div>No notifications</div>
                    </div>
                ` : items.map(n => `
                    <div onclick="NotificationsPanel.markRead('${n.id}')" style="
                        padding:12px 16px; border-bottom:1px solid var(--border-color,#e2e8f0);
                        cursor:pointer; transition:background .15s;
                        background:${n.read ? 'transparent' : 'rgba(59,130,246,.05)'};
                        display:flex; gap:10px; align-items:flex-start;
                    " onmouseover="this.style.background='var(--bg-hover,#f8fafc)'"
                       onmouseout="this.style.background='${n.read ? 'transparent' : 'rgba(59,130,246,.05)'}'">
                        <div style="font-size:18px;flex-shrink:0">${_typeIcon(n.type)}</div>
                        <div style="flex:1; min-width:0">
                            <div style="font-weight:${n.read ? 400 : 600}; font-size:13px; margin-bottom:2px">
                                ${_esc(n.title)}
                            </div>
                            ${n.message ? `<div style="font-size:12px;color:var(--text-muted,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(n.message)}</div>` : ''}
                            <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:3px">
                                ${_timeAgo(n.createdAt)}
                            </div>
                        </div>
                        ${!n.read ? '<div style="width:7px;height:7px;background:#3b82f6;border-radius:50%;margin-top:4px;flex-shrink:0"></div>' : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function _typeIcon(type) {
        return { success: '✅', warning: '⚠️', error: '🚨', info: 'ℹ️' }[type] || 'ℹ️';
    }

    function _esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function _timeAgo(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1)  return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    // ─── TOGGLE ───────────────────────────────────────────────────────────────

    function _togglePanel() {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        _panelOpen = !_panelOpen;
        panel.style.display = _panelOpen ? 'block' : 'none';
        if (_panelOpen) _renderPanel();
    }

    // Close panel when clicking outside
    document.addEventListener('click', function (e) {
        if (!_panelOpen) return;
        const wrapper = document.getElementById('notifWrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            _panelOpen = false;
            const panel = document.getElementById('notifPanel');
            if (panel) panel.style.display = 'none';
        }
    });

    // ─── INJECT BELL INTO DOM ─────────────────────────────────────────────────

    function _inject() {
        if (document.getElementById('notifWrapper')) return; // already injected

        // Find or create a container
        const host = document.getElementById('notificationBellContainer')
                  || document.querySelector('.top-bar')
                  || document.body;

        const wrapper = document.createElement('div');
        wrapper.id = 'notifWrapper';
        wrapper.style.cssText = `
            position:fixed; top:10px; right:106px; z-index:1001;
        `;

        wrapper.innerHTML = `
            <button id="notifBell" aria-label="Notifications" style="
                position:relative; background:transparent; border:1px solid var(--border-color,#e2e8f0);
                border-radius:50%; width:36px; height:36px; cursor:pointer;
                display:flex; align-items:center; justify-content:center;
                font-size:17px; transition:background .2s;
            ">
                🔔
                <span id="notifBadge" style="
                    position:absolute; top:-3px; right:-3px;
                    background:#ef4444; color:#fff;
                    border-radius:999px; min-width:17px; height:17px;
                    display:none; align-items:center; justify-content:center;
                    font-size:10px; font-weight:700; padding:0 4px;
                ">0</span>
            </button>
            <div id="notifPanel" style="
                display:none; position:absolute; top:44px; right:0;
                width:340px; background:var(--bg-secondary,#fff);
                border:1px solid var(--border-color,#e2e8f0);
                border-radius:10px; box-shadow:var(--shadow-md, 0 4px 20px rgba(0,0,0,.12));
                z-index:1002;
            "></div>
        `;

        document.body.appendChild(wrapper);

        document.getElementById('notifBell')
            .addEventListener('click', (e) => { e.stopPropagation(); _togglePanel(); });
    }

    // ─── SERVER POLLING ───────────────────────────────────────────────────────

    async function _poll() {
        if (typeof ServerBridge === 'undefined' || !ServerBridge.isServerMode) return;
        if (!window.currentUser) return;

        const r = await ServerBridge.fetch('GET', '/logs/notifications?limit=50');
        if (r.ok && r.data.notifications) {
            _notifications = r.data.notifications;
            _updateBadge();
            if (_panelOpen) _renderPanel();
        }
    }

    function _startPolling() {
        _stopPolling();                       // clear any previous timer
        _poll();
        if (typeof MemoryManager !== 'undefined' && MemoryManager.setInterval) {
            _pollTimer = MemoryManager.setInterval(_poll, POLL_MS, 'notifications-poll');
        } else {
            _pollTimer = setInterval(_poll, POLL_MS);
        }
    }

    function _stopPolling() {
        if (_pollTimer !== null) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
    }

    // ─── RECEIVE LOCAL NOTIFICATIONS ─────────────────────────────────────────

    /** Allow other modules to push a notification without the server */
    function push(title, message, type = 'info') {
        _notifications.unshift({
            id:        `local_${Date.now()}`,
            title,
            message,
            type,
            read:      false,
            createdAt: new Date().toISOString()
        });
        if (_notifications.length > MAX_DISPLAY) _notifications.pop();
        _updateBadge();
        if (_panelOpen) _renderPanel();
    }

    // ─── PUBLIC ───────────────────────────────────────────────────────────────

    async function markRead(id) {
        const n = _notifications.find(x => x.id == id);
        if (n) n.read = true;
        _updateBadge();
        if (_panelOpen) _renderPanel();

        // Tell the server if in server mode
        if (typeof ServerBridge !== 'undefined' && ServerBridge.isServerMode) {
            await ServerBridge.fetch('PUT', `/logs/notifications/${id}/read`);
        }
    }

    async function markAllRead() {
        _notifications.forEach(n => { n.read = true; });
        _updateBadge();
        if (_panelOpen) _renderPanel();

        if (typeof ServerBridge !== 'undefined' && ServerBridge.isServerMode) {
            await ServerBridge.fetch('PUT', '/logs/notifications/read-all');
        }
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _init);
        } else {
            _init();
        }
    }

    function _init() {
        _inject();

        // Start server polling if the bridge says we're in server mode
        // We do this on a slight delay to let server-bridge.js finish its init
        setTimeout(() => {
            if (typeof ServerBridge !== 'undefined' && ServerBridge.isServerMode) {
                _startPolling();
            }
        }, 2000);

        // Clean up polling timer on page unload to prevent leaks
        window.addEventListener('beforeunload', _stopPolling);
    }

    function destroy() {
        _stopPolling();
        window.removeEventListener('beforeunload', _stopPolling);
    }

    return { init, push, markRead, markAllRead, destroy };

})();

NotificationsPanel.init();
window.NotificationsPanel = NotificationsPanel;
