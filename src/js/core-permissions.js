/**
 * Core Permissions Module for Lifestar Ambulance Scheduling System
 * Consolidates: permissions-system.js, advanced-permissions.js
 * 
 * Provides granular per-user permission management with role-based defaults
 */

(function() {
    'use strict';

    // ============================================
    // PERMISSION DEFINITIONS
    // ============================================
    const PERMISSION_DEFINITIONS = {
        // Scheduling Permissions
        'schedule.create': { label: 'Create Schedules', category: 'Scheduling', description: 'Create new draft schedules' },
        'schedule.edit': { label: 'Edit Schedules', category: 'Scheduling', description: 'Edit existing schedules' },
        'schedule.delete': { label: 'Delete Schedules', category: 'Scheduling', description: 'Delete schedules' },
        'schedule.publish': { label: 'Publish Schedules', category: 'Scheduling', description: 'Publish draft schedules' },
        'schedule.archive': { label: 'Archive Schedules', category: 'Scheduling', description: 'Archive past schedules' },
        'schedule.export': { label: 'Export Schedules', category: 'Scheduling', description: 'Export schedule data' },
        'schedule.duplicate': { label: 'Duplicate Schedules', category: 'Scheduling', description: 'Duplicate existing schedules' },
        'schedule.view_drafts': { label: 'View Draft Schedules', category: 'Scheduling', description: 'View draft schedules list' },
        'schedule.view_published': { label: 'View Published Schedules', category: 'Scheduling', description: 'View published schedules' },
        'schedule.view_archived': { label: 'View Past Schedules', category: 'Scheduling', description: 'View archived/past schedules' },
        'schedule.calendar': { label: 'Calendar View', category: 'Scheduling', description: 'Access calendar view' },
        'schedule.templates': { label: 'Schedule Templates', category: 'Scheduling', description: 'Manage schedule templates' },

        // Crew Management Permissions
        'crew.manage': { label: 'Manage Crews', category: 'Crew Management', description: 'Create and edit crew assignments' },
        'crew.delete': { label: 'Delete Crews', category: 'Crew Management', description: 'Remove crew assignments' },
        'crew.swap_staff': { label: 'Swap Crew Staff', category: 'Crew Management', description: 'Swap staff between crews' },

        // Staff Management Permissions
        'staff.view': { label: 'View Staff Directory', category: 'Staff Management', description: 'View staff member list' },
        'staff.view_details': { label: 'View Staff Details', category: 'Staff Management', description: 'View detailed staff info' },
        'staff.view_schedule': { label: 'View Staff Schedules', category: 'Staff Management', description: 'View individual staff schedules' },
        'staff.manage_availability': { label: 'Manage Availability', category: 'Staff Management', description: 'View and manage staff availability' },
        'staff.manage_training': { label: 'Manage Training', category: 'Staff Management', description: 'Track and manage training records' },
        'staff.manage_bonus': { label: 'Manage Bonus Hours', category: 'Staff Management', description: 'Manage bonus hour allocations' },

        // Request Permissions
        'requests.timeoff': { label: 'Manage Time Off', category: 'Requests', description: 'Approve/deny time off requests' },
        'requests.trades': { label: 'Manage Shift Trades', category: 'Requests', description: 'Approve/deny shift trade requests' },
        'requests.swap': { label: 'Swap Marketplace', category: 'Requests', description: 'Access swap marketplace' },
        'requests.timeoff_own': { label: 'Request Time Off', category: 'Requests', description: 'Submit own time off requests' },
        'requests.trade_own': { label: 'Request Shift Trades', category: 'Requests', description: 'Submit own shift trade requests' },

        // Operations Permissions
        'ops.callins': { label: 'Emergency Call-ins', category: 'Operations', description: 'Manage emergency call-ins' },
        'ops.absences': { label: 'Manage Absences', category: 'Operations', description: 'Track and manage absences' },
        'ops.oncall': { label: 'On-Call Rotation', category: 'Operations', description: 'Manage on-call rotation' },
        'ops.incidents': { label: 'Incident Reports', category: 'Operations', description: 'View and manage incident reports' },

        // Analysis Permissions
        'analysis.analytics': { label: 'View Analytics', category: 'Analysis', description: 'Access analytics dashboard' },
        'analysis.history': { label: 'Shift History', category: 'Analysis', description: 'View shift history records' },
        'analysis.reports': { label: 'Generate Reports', category: 'Analysis', description: 'Generate custom reports' },

        // Administration Permissions
        'admin.users': { label: 'User Management', category: 'Administration', description: 'Add, edit, delete users' },
        'admin.features': { label: 'Feature Toggles', category: 'Administration', description: 'Enable/disable system features' },
        'admin.api_keys': { label: 'API Key Management', category: 'Administration', description: 'Manage API keys' },
        'admin.logs': { label: 'System Logs', category: 'Administration', description: 'View system logs' },
        'admin.developer': { label: 'Developer Tools', category: 'Administration', description: 'Access developer tools' },
        'admin.permissions': { label: 'Permission Management', category: 'Administration', description: 'Manage user permissions' },
        'admin.ai': { label: 'AI Assistant', category: 'Administration', description: 'Access AI assistant' },
        'admin.settings': { label: 'System Settings', category: 'Administration', description: 'Modify system settings' },
        'admin.backup': { label: 'Backup & Restore', category: 'Administration', description: 'Manage system backups' },

        // Other Permissions
        'other.notes': { label: 'Supervisor Notes', category: 'Other', description: 'Create and manage supervisor notes' },
        'other.notifications': { label: 'Manage Notifications', category: 'Other', description: 'Configure notification settings' }
    };

    // ============================================
    // ROLE DEFAULT PERMISSIONS
    // ============================================
    const ROLE_PERMISSIONS = {
        'super': Object.keys(PERMISSION_DEFINITIONS), // Super admin gets all permissions

        'boss': [
            'schedule.create', 'schedule.edit', 'schedule.delete', 'schedule.publish',
            'schedule.archive', 'schedule.export', 'schedule.duplicate',
            'schedule.view_drafts', 'schedule.view_published', 'schedule.view_archived',
            'schedule.calendar', 'schedule.templates',
            'crew.manage', 'crew.delete', 'crew.swap_staff',
            'staff.view', 'staff.view_details', 'staff.view_schedule',
            'staff.manage_availability', 'staff.manage_training', 'staff.manage_bonus',
            'requests.timeoff', 'requests.trades', 'requests.swap',
            'ops.callins', 'ops.absences', 'ops.oncall', 'ops.incidents',
            'analysis.analytics', 'analysis.history', 'analysis.reports',
            'other.notes', 'other.notifications'
        ],

        'paramedic': [
            'schedule.view_published', 'schedule.calendar',
            'staff.view',
            'requests.swap', 'requests.timeoff_own', 'requests.trade_own',
            'analysis.history'
        ],

        'emt': [
            'schedule.view_published', 'schedule.calendar',
            'staff.view',
            'requests.swap', 'requests.timeoff_own', 'requests.trade_own',
            'analysis.history'
        ]
    };

    // ============================================
    // PERMISSION STATE
    // ============================================
    const PermissionState = {
        userPermissions: {},  // Custom per-user permissions
        roleOverrides: {}     // Role-level overrides
    };

    // ============================================
    // PERMISSIONS MANAGER
    // ============================================
    const PermissionsManager = {
        STORAGE_KEY: 'lifestarPermissions',

        /**
         * Initialize permissions system
         */
        init() {
            this.load();
            Logger.debug('✅ Permissions Manager initialized');
        },

        /**
         * Load permissions from storage
         */
        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) {
                    const data = JSON.parse(saved);
                    PermissionState.userPermissions = data.userPermissions || {};
                    PermissionState.roleOverrides = data.roleOverrides || {};
                }
            } catch (e) {
                Logger.error('[PermissionsManager.load]', e);
            }
        },

        /**
         * Save permissions to storage
         */
        save() {
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(PermissionState));
            } catch (e) {
                Logger.error('[PermissionsManager.save]', e);
            }
        },

        /**
         * Get all permission definitions
         */
        getDefinitions() {
            return { ...PERMISSION_DEFINITIONS };
        },

        /**
         * Get permissions by category
         */
        getByCategory() {
            const categories = {};
            Object.entries(PERMISSION_DEFINITIONS).forEach(([key, perm]) => {
                if (!categories[perm.category]) {
                    categories[perm.category] = [];
                }
                categories[perm.category].push({ key, ...perm });
            });
            return categories;
        },

        /**
         * Get default permissions for a role
         */
        getRoleDefaults(role) {
            return [...(ROLE_PERMISSIONS[role] || [])];
        },

        /**
         * Get all available roles
         */
        getRoles() {
            return Object.keys(ROLE_PERMISSIONS);
        },

        /**
         * Get permissions for a specific user
         */
        getUserPermissions(userId) {
            // Check for custom permissions first
            if (PermissionState.userPermissions[userId]) {
                return [...PermissionState.userPermissions[userId]];
            }

            // Fall back to role defaults
            const user = window.users?.find(u => u.id === userId);
            if (user && ROLE_PERMISSIONS[user.role]) {
                return [...ROLE_PERMISSIONS[user.role]];
            }

            return [];
        },

        /**
         * Check if current user has a specific permission
         */
        hasPermission(permissionKey) {
            if (!window.currentUser) return false;

            // Super admin always has all permissions
            if (window.currentUser.role === 'super') return true;

            const perms = this.getUserPermissions(window.currentUser.id);
            return perms.includes(permissionKey);
        },

        /**
         * Check if a specific user has a permission
         */
        userHasPermission(userId, permissionKey) {
            const user = window.users?.find(u => u.id === userId);
            if (!user) return false;

            // Super admin always has all permissions
            if (user.role === 'super') return true;

            const perms = this.getUserPermissions(userId);
            return perms.includes(permissionKey);
        },

        /**
         * Set custom permissions for a user
         */
        setUserPermissions(userId, permissions) {
            PermissionState.userPermissions[userId] = [...permissions];
            this.save();
        },

        /**
         * Grant a permission to a user
         */
        grantPermission(userId, permissionKey) {
            if (!PERMISSION_DEFINITIONS[permissionKey]) {
                Logger.warn(`Unknown permission: ${permissionKey}`);
                return false;
            }

            const perms = this.getUserPermissions(userId);
            if (!perms.includes(permissionKey)) {
                perms.push(permissionKey);
                this.setUserPermissions(userId, perms);
            }
            return true;
        },

        /**
         * Revoke a permission from a user
         */
        revokePermission(userId, permissionKey) {
            const perms = this.getUserPermissions(userId);
            const index = perms.indexOf(permissionKey);
            if (index !== -1) {
                perms.splice(index, 1);
                this.setUserPermissions(userId, perms);
            }
            return true;
        },

        /**
         * Toggle a permission for a user
         */
        togglePermission(userId, permissionKey) {
            const perms = this.getUserPermissions(userId);
            if (perms.includes(permissionKey)) {
                return this.revokePermission(userId, permissionKey);
            } else {
                return this.grantPermission(userId, permissionKey);
            }
        },

        /**
         * Reset user permissions to role defaults
         */
        resetUserPermissions(userId) {
            delete PermissionState.userPermissions[userId];
            this.save();
        },

        /**
         * Set role override permissions
         */
        setRoleOverride(role, permissions) {
            PermissionState.roleOverrides[role] = [...permissions];
            this.save();
        },

        /**
         * Check multiple permissions at once
         */
        checkPermissions(permissionKeys) {
            return permissionKeys.reduce((result, key) => {
                result[key] = this.hasPermission(key);
                return result;
            }, {});
        },

        /**
         * Get all permissions for current user with labels
         */
        getCurrentUserPermissionsWithLabels() {
            if (!window.currentUser) return [];

            const permKeys = this.getUserPermissions(window.currentUser.id);
            return permKeys.map(key => ({
                key,
                ...PERMISSION_DEFINITIONS[key]
            })).filter(p => p.label);
        },

        /**
         * Render permission editor UI
         */
        renderPermissionEditor(containerId, userId) {
            const container = document.getElementById(containerId);
            if (!container) return;

            const user = window.users?.find(u => u.id === userId);
            if (!user) return;

            const userPerms = this.getUserPermissions(userId);
            const categories = this.getByCategory();

            const esc = typeof InputSanitizer !== 'undefined' ? InputSanitizer.escapeHTML.bind(InputSanitizer) : (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
            const safeUserId = esc(String(userId));
            let html = `
                <div class="permission-editor">
                    <div class="permission-header">
                        <h3>Permissions for ${esc(user.fullName || user.username)}</h3>
                        <span class="badge">${esc(user.role)}</span>
                    </div>
                    <div class="permission-actions">
                        <button class="btn btn-sm btn-secondary" onclick="PermissionsManager.resetUserPermissions('${safeUserId}')">Reset to Defaults</button>
                    </div>
                    <div class="permission-categories">
            `;

            Object.entries(categories).forEach(([category, permissions]) => {
                html += `
                    <div class="permission-category">
                        <h4>${category}</h4>
                        <div class="permission-list">
                `;

                permissions.forEach(perm => {
                    const hasPermission = userPerms.includes(perm.key);
                    html += `
                        <div class="permission-item">
                            <label>
                                <input type="checkbox" 
                                    ${hasPermission ? 'checked' : ''} 
                                    onchange="PermissionsManager.togglePermission('${safeUserId}', '${esc(perm.key)}')">
                                <span>${perm.label}</span>
                            </label>
                            <p class="permission-description">${perm.description}</p>
                        </div>
                    `;
                });

                html += `</div></div>`;
            });

            html += `</div></div>`;
            container.innerHTML = html;
        },

        /**
         * Filter UI elements based on permissions
         */
        applyPermissionFilters() {
            // Hide elements that require permissions the user doesn't have
            document.querySelectorAll('[data-requires-permission]').forEach(el => {
                const permission = el.getAttribute('data-requires-permission');
                if (!this.hasPermission(permission)) {
                    el.style.display = 'none';
                    el.setAttribute('aria-hidden', 'true');
                } else {
                    el.style.display = '';
                    el.removeAttribute('aria-hidden');
                }
            });

            // Disable buttons that require permissions
            document.querySelectorAll('[data-requires-permission][data-disable-on-denied]').forEach(el => {
                const permission = el.getAttribute('data-requires-permission');
                if (!this.hasPermission(permission)) {
                    el.disabled = true;
                    el.classList.add('disabled');
                    el.setAttribute('title', 'You do not have permission to perform this action');
                } else {
                    el.disabled = false;
                    el.classList.remove('disabled');
                    el.removeAttribute('title');
                }
            });
        }
    };

    // ============================================
    // ROLE MANAGER
    // ============================================
    const RoleManager = {
        /**
         * Get role display name
         */
        getRoleName(role) {
            const names = {
                'super': 'Super Administrator',
                'boss': 'Supervisor',
                'paramedic': 'Paramedic',
                'emt': 'EMT'
            };
            return names[role] || role;
        },

        /**
         * Get role description
         */
        getRoleDescription(role) {
            const descriptions = {
                'super': 'Full system access with all permissions',
                'boss': 'Manage schedules, crews, and staff',
                'paramedic': 'View schedules and request changes',
                'emt': 'View schedules and request changes'
            };
            return descriptions[role] || 'No description available';
        },

        /**
         * Get role badge class
         */
        getRoleBadgeClass(role) {
            const classes = {
                'super': 'badge-danger',
                'boss': 'badge-primary',
                'paramedic': 'badge-success',
                'emt': 'badge-info'
            };
            return classes[role] || 'badge-secondary';
        },

        /**
         * Check if role can be modified
         */
        canModifyRole(role) {
            // Cannot modify super admin role
            return role !== 'super';
        },

        /**
         * Get available roles for assignment
         */
        getAssignableRoles(currentUserRole) {
            const allRoles = Object.keys(ROLE_PERMISSIONS);

            // Super admin can assign any role
            if (currentUserRole === 'super') {
                return allRoles;
            }

            // Boss can only assign paramedic and emt roles
            if (currentUserRole === 'boss') {
                return ['paramedic', 'emt'];
            }

            // Others cannot assign roles
            return [];
        }
    };

    // ============================================
    // INITIALIZE
    // ============================================
    PermissionsManager.init();

    // ============================================
    // EXPOSE TO GLOBAL SCOPE
    // ============================================
    window.PERMISSIONS = PERMISSION_DEFINITIONS;
    window.PERMISSION_DEFINITIONS = PERMISSION_DEFINITIONS;
    window.DEFAULT_PERMISSIONS = ROLE_PERMISSIONS;
    window.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
    window.PermissionsManager = PermissionsManager;
    window.RoleManager = RoleManager;
    window.PermissionState = PermissionState;

    // Backward compatibility aliases — use getter to track reassignment
    Object.defineProperty(window, 'userPermissions', {
        get() { return PermissionState.userPermissions; },
        configurable: true
    });
    window.loadPermissions = () => PermissionsManager.load();
    window.savePermissions = () => PermissionsManager.save();
    window.getUserPermissions = (userId) => PermissionsManager.getUserPermissions(userId);
    window.hasPermission = (permissionKey) => PermissionsManager.hasPermission(permissionKey);
    window.setUserPermissions = (userId, permissions) => PermissionsManager.setUserPermissions(userId, permissions);

    // Apply permission filters on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PermissionsManager.applyPermissionFilters());
    } else {
        PermissionsManager.applyPermissionFilters();
    }

    Logger.debug('✅ Core Permissions Module loaded');

})();