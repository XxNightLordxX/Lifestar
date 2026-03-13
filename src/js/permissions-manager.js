/**
 * Permissions Manager UI — Lifestar Scheduling System
 *
 * Provides the complete, detailed permission management interface for super admins.
 * Supports:
 *  - Per-user permission overrides (grant extras beyond role defaults, or revoke defaults)
 *  - Role-level visibility of default permissions
 *  - Server-side persistence via /api/permissions
 *  - Fallback to localStorage when server is unavailable
 *  - Category-based display with search/filter
 *  - Bulk grant / bulk revoke within a category
 *  - Real-time unsaved-changes warning
 *
 * Entry point: window.loadPermissionsManager()
 * Called by app.js showSuperSection('permissions')
 */

(function () {
    'use strict';

    // ─── STATE ────────────────────────────────────────────────────────────────
    let _state = {
        definitions: {},      // permKey → { label, category, description }
        roleDefaults: {},     // role → string[]
        allUsers: [],         // { id, username, fullName, role, hasOverrides, effective }
        selectedUserId: null,
        pendingPermissions: null, // Set<string> — unsaved changes for selected user
        dirty: false,
        loading: false,
        searchQuery: '',
        userSearchQuery: '',
        filterCategory: 'all',
        serverMode: false,
    };

    // ─── SERVER HELPERS ───────────────────────────────────────────────────────

    async function apiFetch(method, path, body) {
        const opts = {
            method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);
        try {
            const r = await fetch('/api' + path, opts);
            const data = await r.json().catch(() => ({}));
            return { ok: r.ok, status: r.status, data };
        } catch (e) {
            return { ok: false, status: 0, data: { error: e.message } };
        }
    }

    // ─── DATA LOADING ─────────────────────────────────────────────────────────

    async function loadFromServer() {
        const r = await apiFetch('GET', '/permissions/all-users');
        if (!r.ok) return false;

        _state.definitions = r.data.definitions || {};
        _state.roleDefaults = r.data.roleDefaults || {};
        _state.allUsers = r.data.users || [];
        _state.serverMode = true;
        return true;
    }

    function loadFromLocal() {
        // Pull definitions from core-permissions.js globals
        _state.definitions = window.PERMISSION_DEFINITIONS || {};
        _state.roleDefaults = window.ROLE_PERMISSIONS || {};
        _state.serverMode = false;

        // Build user list from global users array
        _state.allUsers = (window.users || []).map(u => {
            const effective = window.PermissionsManager
                ? window.PermissionsManager.getUserPermissions(u.id)
                : (_state.roleDefaults[u.role] || []);
            const defaults = _state.roleDefaults[u.role] || [];
            const hasOverrides = window.PermissionState &&
                !!window.PermissionState.userPermissions[u.id];
            return {
                id: u.id,
                username: u.username,
                fullName: u.fullName || u.username,
                role: u.role,
                hasOverrides,
                effective,
            };
        });
    }

    // ─── SAVE ─────────────────────────────────────────────────────────────────

    async function savePermissions(userId, permArray) {
        if (_state.serverMode) {
            const r = await apiFetch('PUT', `/permissions/user/${userId}`, { permissions: permArray });
            if (!r.ok) {
                showToast('Save failed: ' + (r.data?.error || 'unknown error'), 'error');
                return false;
            }
            // Refresh user entry in local state
            const user = _state.allUsers.find(u => u.id === userId);
            if (user) {
                user.effective = r.data.effective || permArray;
                user.hasOverrides = true;
            }
        } else {
            // localStorage mode
            if (window.PermissionsManager) {
                window.PermissionsManager.setUserPermissions(userId, permArray);
            }
            const user = _state.allUsers.find(u => u.id === userId);
            if (user) { user.effective = [...permArray]; user.hasOverrides = true; }
        }
        return true;
    }

    async function resetUserToDefaults(userId) {
        if (_state.serverMode) {
            const r = await apiFetch('POST', `/permissions/user/${userId}/reset`);
            if (!r.ok) { showToast('Reset failed', 'error'); return false; }
            const user = _state.allUsers.find(u => u.id === userId);
            if (user) {
                user.effective = _state.roleDefaults[user.role] || [];
                user.hasOverrides = false;
            }
        } else {
            if (window.PermissionsManager) window.PermissionsManager.resetUserPermissions(userId);
            const user = _state.allUsers.find(u => u.id === userId);
            if (user) {
                user.effective = _state.roleDefaults[user.role] || [];
                user.hasOverrides = false;
            }
        }
        return true;
    }

    // ─── UI HELPERS ───────────────────────────────────────────────────────────

    function showToast(msg, type = 'info') {
        if (typeof showAlert === 'function') {
            showAlert(msg, type === 'error' ? 'danger' : type);
        } else {
            console.log(`[Permissions] ${type.toUpperCase()}: ${msg}`);
        }
    }

    function roleBadge(role) {
        const colors = { super: '#ef4444', boss: '#3b82f6', paramedic: '#10b981', emt: '#f59e0b' };
        const bg = colors[role] || '#6b7280';
        return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${role}</span>`;
    }

    function categoryIcon(cat) {
        const icons = {
            'Scheduling': '📅',
            'Crew Management': '👥',
            'Staff Management': '🧑‍⚕️',
            'Requests': '📝',
            'Operations': '🚑',
            'Analysis': '📊',
            'Administration': '⚙️',
            'Other': '🔧',
        };
        return icons[cat] || '🔑';
    }

    // ─── MAIN RENDER ─────────────────────────────────────────────────────────

    function render() {
        const container = document.getElementById('permissionsContainer');
        const adv = document.getElementById('advancedPermissionsManager');
        if (adv) adv.innerHTML = '';
        if (!container) return;

        const user = _state.selectedUserId != null
            ? _state.allUsers.find(u => u.id === _state.selectedUserId)
            : null;

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;min-height:600px">
                <!-- Left: User List -->
                <div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:12px;overflow:hidden">
                    ${renderUserListPanel()}
                </div>
                <!-- Right: Permission Editor -->
                <div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:12px;overflow:hidden">
                    ${user ? renderPermissionEditor(user) : renderEmptyState()}
                </div>
            </div>
        `;

        // Wire up event handlers
        bindEvents(container);
    }

    function renderUserListPanel() {
        const users = _state.allUsers;
        const rows = users.map(u => {
            const isSelected = u.id === _state.selectedUserId;
            const bg = isSelected ? 'var(--primary-color,#3b82f6)' : 'transparent';
            const fg = isSelected ? '#fff' : 'var(--text-color,#111)';
            const overrideDot = u.hasOverrides
                ? `<span title="Has custom permissions" style="width:7px;height:7px;border-radius:50%;background:#f59e0b;display:inline-block;margin-left:6px;flex-shrink:0"></span>`
                : '';
            return `
                <div class="perm-user-row" data-uid="${u.id}"
                     style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;
                            background:${bg};color:${fg};border-bottom:1px solid var(--border-color,#e5e7eb);
                            transition:background .15s">
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.fullName}</div>
                        <div style="font-size:11px;opacity:.75;margin-top:1px">${u.username}</div>
                    </div>
                    ${roleBadge(u.role)}${overrideDot}
                </div>
            `;
        }).join('');

        return `
            <div style="padding:14px;border-bottom:1px solid var(--border-color,#e5e7eb)">
                <div style="font-weight:700;font-size:14px;margin-bottom:8px">👤 Select User</div>
                <input id="pmUserSearch" type="text" placeholder="Search users…" value="${sanitizeHTML(_state.searchQuery || '')}"
                       style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--border-color,#e5e7eb);
                              border-radius:8px;font-size:12px;background:var(--bg-secondary,#f9fafb);color:inherit">
            </div>
            <div style="overflow-y:auto;max-height:520px">${rows || '<div style="padding:20px;text-align:center;opacity:.5;font-size:13px">No users found</div>'}</div>
        `;
    }

    function renderEmptyState() {
        return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:400px;gap:12px;opacity:.5">
            <div style="font-size:48px">🔐</div>
            <div style="font-weight:600;font-size:15px">Select a User</div>
            <div style="font-size:13px;text-align:center;max-width:260px">Choose a user from the left panel to view and edit their permissions</div>
        </div>`;
    }

    function renderPermissionEditor(user) {
        const perms = _state.pendingPermissions || new Set(user.effective || []);
        const defaults = new Set(_state.roleDefaults[user.role] || []);

        // Group permissions by category
        const categories = {};
        const defs = _state.definitions;
        const query = (_state.searchQuery || '').toLowerCase();
        const catFilter = _state.filterCategory;

        for (const [key, def] of Object.entries(defs)) {
            if (query && !def.label.toLowerCase().includes(query) && !def.description.toLowerCase().includes(query)) continue;
            if (catFilter !== 'all' && def.category !== catFilter) continue;
            if (!categories[def.category]) categories[def.category] = [];
            categories[def.category].push({ key, ...def });
        }

        const totalPerms = perms.size;
        const totalAll = Object.keys(defs).length;
        const isSuper = user.role === 'super';

        const catOptions = ['all', ...new Set(Object.values(defs).map(d => d.category))];
        const catSelect = catOptions.map(c =>
            `<option value="${c}" ${_state.filterCategory === c ? 'selected' : ''}>${c === 'all' ? 'All Categories' : c}</option>`
        ).join('');

        const hasChanges = _state.dirty && _state.pendingPermissions != null;
        const diffFromDefaults = hasChanges
            ? [...perms].filter(k => !defaults.has(k)).length + [...defaults].filter(k => !perms.has(k)).length
            : 0;

        // Build category blocks
        const catBlocks = Object.entries(categories).map(([cat, items]) => {
            const catGranted = items.filter(i => perms.has(i.key)).length;
            const catDefault = items.filter(i => defaults.has(i.key)).length;

            const rows = items.map(item => {
                const checked = perms.has(item.key);
                const isDefault = defaults.has(item.key);
                const isExtra = checked && !isDefault;
                const isRevoked = !checked && isDefault;

                let badge = '';
                if (isExtra) badge = `<span style="font-size:9px;background:#10b981;color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px">+EXTRA</span>`;
                if (isRevoked) badge = `<span style="font-size:9px;background:#ef4444;color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px">–REVOKED</span>`;

                return `
                    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;
                                border-bottom:1px solid var(--border-color,#e5e7eb);
                                background:${isRevoked ? 'rgba(239,68,68,.04)' : isExtra ? 'rgba(16,185,129,.04)' : 'transparent'}">
                        <label style="display:flex;align-items:flex-start;gap:8px;cursor:${isSuper ? 'default' : 'pointer'};width:100%">
                            <input type="checkbox"
                                   class="perm-check" data-key="${item.key}"
                                   ${checked ? 'checked' : ''}
                                   ${isSuper ? 'disabled title="Super admins always have all permissions"' : ''}
                                   style="margin-top:2px;flex-shrink:0;width:15px;height:15px;cursor:${isSuper ? 'default' : 'pointer'}">
                            <div style="flex:1;min-width:0">
                                <div style="font-size:13px;font-weight:600;display:flex;align-items:center;flex-wrap:wrap;gap:2px">
                                    ${item.label}${badge}
                                </div>
                                <div style="font-size:11px;opacity:.6;margin-top:2px">${item.description}</div>
                            </div>
                        </label>
                    </div>
                `;
            }).join('');

            return `
                <div style="margin-bottom:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;overflow:hidden">
                    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                                background:var(--bg-secondary,#f9fafb);border-bottom:1px solid var(--border-color,#e5e7eb)">
                        <span style="font-size:18px">${categoryIcon(cat)}</span>
                        <span style="font-weight:700;font-size:13px;flex:1">${cat}</span>
                        <span style="font-size:11px;opacity:.6">${catGranted} / ${items.length} granted (role default: ${catDefault})</span>
                        ${isSuper ? '' : `
                            <button class="perm-cat-all" data-cat="${cat}" data-action="grant"
                                    style="font-size:11px;padding:3px 8px;border:1px solid #10b981;color:#10b981;background:transparent;border-radius:6px;cursor:pointer;line-height:1.3">All</button>
                            <button class="perm-cat-all" data-cat="${cat}" data-action="revoke"
                                    style="font-size:11px;padding:3px 8px;border:1px solid #ef4444;color:#ef4444;background:transparent;border-radius:6px;cursor:pointer;line-height:1.3">None</button>
                        `}
                    </div>
                    ${rows}
                </div>
            `;
        }).join('');

        return `
            <!-- Header -->
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-color,#e5e7eb);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <div style="flex:1;min-width:200px">
                    <div style="font-weight:700;font-size:16px">${user.fullName}</div>
                    <div style="font-size:12px;opacity:.6;margin-top:2px">@${user.username} · ${roleBadge(user.role)}</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    ${!isSuper ? `
                        <button id="pmGrantAll" style="padding:6px 14px;background:#10b981;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Grant All</button>
                        <button id="pmRevokeAll" style="padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Revoke All</button>
                        <button id="pmResetDefaults" style="padding:6px 14px;background:var(--bg-secondary,#f1f5f9);color:inherit;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Reset to Role Defaults</button>
                    ` : ''}
                    ${!isSuper && hasChanges ? `
                        <button id="pmSave" style="padding:6px 18px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;animation:pulse 1.5s infinite">
                            💾 Save Changes ${diffFromDefaults > 0 ? `(${diffFromDefaults} diff)` : ''}
                        </button>
                    ` : (!isSuper ? `
                        <button id="pmSave" style="padding:6px 18px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">
                            💾 Save
                        </button>
                    ` : '')}
                </div>
            </div>
            <!-- Stats Bar -->
            <div style="padding:10px 20px;background:var(--bg-secondary,#f9fafb);border-bottom:1px solid var(--border-color,#e5e7eb);display:flex;gap:20px;align-items:center;flex-wrap:wrap">
                <div style="font-size:12px">
                    <span style="font-weight:700;font-size:18px;color:#3b82f6">${totalPerms}</span>
                    <span style="opacity:.6"> / ${totalAll} permissions granted</span>
                </div>
                ${user.hasOverrides ? `<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:6px">⚠️ Has custom overrides</span>` : `<span style="font-size:11px;background:#d1fae5;color:#065f46;padding:3px 8px;border-radius:6px">✓ Using role defaults</span>`}
                ${isSuper ? `<span style="font-size:11px;background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:6px">🛡️ Super admins have all permissions</span>` : ''}
                ${!_state.serverMode ? `<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:6px">📂 Saved locally (server offline)</span>` : ''}
            </div>
            <!-- Filters -->
            <div style="padding:10px 20px;border-bottom:1px solid var(--border-color,#e5e7eb);display:flex;gap:10px;align-items:center">
                <input id="pmPermSearch" type="text" placeholder="🔍 Filter permissions…" value="${sanitizeHTML(query)}"
                       style="flex:1;padding:6px 10px;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;font-size:12px;background:var(--bg-secondary,#f9fafb);color:inherit">
                <select id="pmCatFilter" style="padding:6px 10px;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;font-size:12px;background:var(--bg-secondary,#f9fafb);color:inherit">
                    ${catSelect}
                </select>
            </div>
            <!-- Permission Categories -->
            <div style="overflow-y:auto;max-height:550px;padding:16px 20px">
                ${catBlocks || `<div style="text-align:center;padding:40px;opacity:.5;font-size:13px">No permissions match your filter</div>`}
            </div>
        `;
    }

    // ─── EVENT BINDING ────────────────────────────────────────────────────────

    function bindEvents(container) {
        // User row selection
        container.querySelectorAll('.perm-user-row').forEach(row => {
            row.addEventListener('click', () => {
                if (_state.dirty && _state.pendingPermissions) {
                    if (!confirm('You have unsaved changes. Discard them?')) return;
                }
                _state.selectedUserId = parseInt(row.dataset.uid, 10);
                _state.pendingPermissions = null;
                _state.dirty = false;
                render();
            });
        });

        // User search (filters user list independently)
        const userSearch = container.querySelector('#pmUserSearch');
        if (userSearch) {
            userSearch.addEventListener('input', () => {
                _state.userSearchQuery = userSearch.value;
                render();
            });
        }

        // Permission search
        const permSearch = container.querySelector('#pmPermSearch');
        if (permSearch) {
            permSearch.addEventListener('input', () => {
                _state.searchQuery = permSearch.value;
                // Don't re-render fully, just filter inline
                const user = _state.allUsers.find(u => u.id === _state.selectedUserId);
                if (user) {
                    const editorCol = container.querySelector('.perm-editor-col, [data-editor]');
                    // Full re-render of editor column only
                    render();
                }
            });
        }

        // Category filter
        const catFilter = container.querySelector('#pmCatFilter');
        if (catFilter) {
            catFilter.addEventListener('change', () => {
                _state.filterCategory = catFilter.value;
                render();
            });
        }

        // Permission checkboxes
        container.querySelectorAll('.perm-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const user = _state.allUsers.find(u => u.id === _state.selectedUserId);
                if (!user) return;
                if (!_state.pendingPermissions) {
                    _state.pendingPermissions = new Set(user.effective || []);
                }
                if (cb.checked) {
                    _state.pendingPermissions.add(cb.dataset.key);
                } else {
                    _state.pendingPermissions.delete(cb.dataset.key);
                }
                _state.dirty = true;
                // Update save button appearance without full re-render
                const saveBtn = container.querySelector('#pmSave');
                if (saveBtn) {
                    const diff = computeDiff(user);
                    saveBtn.textContent = `💾 Save Changes (${diff} diff)`;
                    saveBtn.style.animation = 'none'; void saveBtn.offsetWidth;
                    saveBtn.style.animation = 'pulse 1.5s infinite';
                }
            });
        });

        // Category bulk grant/revoke
        container.querySelectorAll('.perm-cat-all').forEach(btn => {
            btn.addEventListener('click', () => {
                const user = _state.allUsers.find(u => u.id === _state.selectedUserId);
                if (!user) return;
                if (!_state.pendingPermissions) {
                    _state.pendingPermissions = new Set(user.effective || []);
                }
                const cat = btn.dataset.cat;
                const action = btn.dataset.action;
                const keys = Object.entries(_state.definitions)
                    .filter(([, d]) => d.category === cat)
                    .map(([k]) => k);

                if (action === 'grant') keys.forEach(k => _state.pendingPermissions.add(k));
                else keys.forEach(k => _state.pendingPermissions.delete(k));
                _state.dirty = true;
                render();
            });
        });

        // Grant All
        const grantAll = container.querySelector('#pmGrantAll');
        if (grantAll) {
            grantAll.addEventListener('click', () => {
                const user = _state.allUsers.find(u => u.id === _state.selectedUserId);
                if (!user) return;
                _state.pendingPermissions = new Set(Object.keys(_state.definitions));
                _state.dirty = true;
                render();
            });
        }

        // Revoke All
        const revokeAll = container.querySelector('#pmRevokeAll');
        if (revokeAll) {
            revokeAll.addEventListener('click', () => {
                if (!confirm('Revoke ALL permissions from this user? They will have no access.')) return;
                _state.pendingPermissions = new Set();
                _state.dirty = true;
                render();
            });
        }

        // Reset to Defaults
        const resetBtn = container.querySelector('#pmResetDefaults');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (!confirm('Reset this user\'s permissions to their role defaults?')) return;
                const user = _state.allUsers.find(u => u.id === _state.selectedUserId);
                if (!user) return;
                const ok = await resetUserToDefaults(user.id);
                if (ok) {
                    _state.pendingPermissions = null;
                    _state.dirty = false;
                    showToast('Permissions reset to role defaults', 'success');
                    render();
                }
            });
        }

        // Save
        const saveBtn = container.querySelector('#pmSave');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const user = _state.allUsers.find(u => u.id === _state.selectedUserId);
                if (!user) return;
                const perms = _state.pendingPermissions || new Set(user.effective || []);
                saveBtn.disabled = true;
                saveBtn.textContent = '⏳ Saving…';
                const ok = await savePermissions(user.id, [...perms]);
                if (ok) {
                    _state.dirty = false;
                    _state.pendingPermissions = null;
                    user.effective = [...perms];
                    user.hasOverrides = true;
                    showToast(`Permissions saved for ${user.fullName}`, 'success');
                    render();
                } else {
                    saveBtn.disabled = false;
                    saveBtn.textContent = '💾 Save Changes';
                }
            });
        }
    }

    function computeDiff(user) {
        if (!_state.pendingPermissions) return 0;
        const defaults = new Set(_state.roleDefaults[user.role] || []);
        const pending = _state.pendingPermissions;
        return [...pending].filter(k => !defaults.has(k)).length +
               [...defaults].filter(k => !pending.has(k)).length;
    }

    // ─── PUBLIC ENTRY POINT ───────────────────────────────────────────────────

    async function loadPermissionsManager() {
        const container = document.getElementById('permissionsContainer');
        if (!container) return;

        // Reset selection when switching to this tab
        _state.selectedUserId = null;
        _state.pendingPermissions = null;
        _state.dirty = false;
        _state.searchQuery = '';
        _state.filterCategory = 'all';

        // Show loading
        container.innerHTML = `<div style="padding:40px;text-align:center;opacity:.5">
            <div style="font-size:36px;margin-bottom:10px">⏳</div>
            <div>Loading permissions…</div>
        </div>`;

        // Try server first, fall back to local
        const serverOk = await loadFromServer();
        if (!serverOk) loadFromLocal();

        render();
    }

    // ─── EXPOSE ───────────────────────────────────────────────────────────────
    window.loadPermissionsManager = loadPermissionsManager;

    Logger && Logger.debug('✅ Permissions Manager UI loaded');

})();
