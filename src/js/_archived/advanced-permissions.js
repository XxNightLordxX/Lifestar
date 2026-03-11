/**
 * Advanced Permissions System
 * Allows Super Admin to grant granular permissions to any role or user
 * Includes permission delegation control (which permissions can be granted)
 */

(function() {
    'use strict';

    const AdvancedPermissions = {
        initialized: false,
        
        // All available permissions with categories
        PERMISSIONS: {
            // User Management
            'users.view': { category: 'User Management', name: 'View Users', description: 'Can view user list and details' },
            'users.create': { category: 'User Management', name: 'Create Users', description: 'Can create new user accounts' },
            'users.edit': { category: 'User Management', name: 'Edit Users', description: 'Can edit user information' },
            'users.delete': { category: 'User Management', name: 'Delete Users', description: 'Can delete user accounts' },
            'users.reset_password': { category: 'User Management', name: 'Reset Passwords', description: 'Can reset user passwords' },
            
            // Role Management
            'roles.view': { category: 'Role Management', name: 'View Roles', description: 'Can view role information' },
            'roles.assign': { category: 'Role Management', name: 'Assign Roles', description: 'Can assign roles to users' },
            'roles.create': { category: 'Role Management', name: 'Create Roles', description: 'Can create new roles' },
            'roles.edit': { category: 'Role Management', name: 'Edit Roles', description: 'Can edit role definitions' },
            'roles.delete': { category: 'Role Management', name: 'Delete Roles', description: 'Can delete roles' },
            
            // Permission Management
            'permissions.view': { category: 'Permission Management', name: 'View Permissions', description: 'Can view permission settings' },
            'permissions.grant': { category: 'Permission Management', name: 'Grant Permissions', description: 'Can grant permissions to users/roles' },
            'permissions.revoke': { category: 'Permission Management', name: 'Revoke Permissions', description: 'Can revoke permissions from users/roles' },
            'permissions.delegate': { category: 'Permission Management', name: 'Delegate Permissions', description: 'Can grant permission-granting authority' },
            
            // Schedule Management
            'schedules.view': { category: 'Schedule Management', name: 'View Schedules', description: 'Can view schedules' },
            'schedules.create': { category: 'Schedule Management', name: 'Create Schedules', description: 'Can create new schedules' },
            'schedules.edit': { category: 'Schedule Management', name: 'Edit Schedules', description: 'Can edit existing schedules' },
            'schedules.delete': { category: 'Schedule Management', name: 'Delete Schedules', description: 'Can delete schedules' },
            'schedules.publish': { category: 'Schedule Management', name: 'Publish Schedules', description: 'Can publish schedules' },
            'schedules.archive': { category: 'Schedule Management', name: 'Archive Schedules', description: 'Can archive schedules' },
            
            // Crew Management
            'crews.view': { category: 'Crew Management', name: 'View Crews', description: 'Can view crew assignments' },
            'crews.create': { category: 'Crew Management', name: 'Create Crews', description: 'Can create crew assignments' },
            'crews.edit': { category: 'Crew Management', name: 'Edit Crews', description: 'Can edit crew assignments' },
            'crews.delete': { category: 'Crew Management', name: 'Delete Crews', description: 'Can delete crew assignments' },
            
            // Time Off Management
            'timeoff.view': { category: 'Time Off Management', name: 'View Time Off', description: 'Can view time-off requests' },
            'timeoff.request': { category: 'Time Off Management', name: 'Request Time Off', description: 'Can submit time-off requests' },
            'timeoff.approve': { category: 'Time Off Management', name: 'Approve Time Off', description: 'Can approve time-off requests' },
            'timeoff.deny': { category: 'Time Off Management', name: 'Deny Time Off', description: 'Can deny time-off requests' },
            'timeoff.cancel': { category: 'Time Off Management', name: 'Cancel Time Off', description: 'Can cancel time-off requests' },
            
            // Shift Trading
            'trades.view': { category: 'Shift Trading', name: 'View Trades', description: 'Can view shift trades' },
            'trades.request': { category: 'Shift Trading', name: 'Request Trades', description: 'Can request shift trades' },
            'trades.approve': { category: 'Shift Trading', name: 'Approve Trades', description: 'Can approve shift trades' },
            'trades.deny': { category: 'Shift Trading', name: 'Deny Trades', description: 'Can deny shift trades' },
            
            // Analytics & Reports
            'analytics.view': { category: 'Analytics & Reports', name: 'View Analytics', description: 'Can view analytics dashboard' },
            'analytics.export': { category: 'Analytics & Reports', name: 'Export Reports', description: 'Can export reports' },
            'analytics.advanced': { category: 'Analytics & Reports', name: 'Advanced Analytics', description: 'Can access advanced analytics features' },
            
            // Payroll
            'payroll.view': { category: 'Payroll', name: 'View Payroll', description: 'Can view payroll information' },
            'payroll.edit': { category: 'Payroll', name: 'Edit Payroll', description: 'Can edit payroll data' },
            'payroll.approve': { category: 'Payroll', name: 'Approve Payroll', description: 'Can approve payroll' },
            
            // System Administration
            'system.view_logs': { category: 'System Administration', name: 'View Logs', description: 'Can view system logs' },
            'system.manage_features': { category: 'System Administration', name: 'Manage Features', description: 'Can manage feature toggles' },
            'system.manage_api_keys': { category: 'System Administration', name: 'Manage API Keys', description: 'Can manage API keys' },
            'system.settings': { category: 'System Administration', name: 'System Settings', description: 'Can modify system settings' },
            
            // Location Management
            'locations.view': { category: 'Location Management', name: 'View Locations', description: 'Can view locations' },
            'locations.create': { category: 'Location Management', name: 'Create Locations', description: 'Can create new locations' },
            'locations.edit': { category: 'Location Management', name: 'Edit Locations', description: 'Can edit locations' },
            'locations.delete': { category: 'Location Management', name: 'Delete Locations', description: 'Can delete locations' },
            
            // Training Management
            'training.view': { category: 'Training Management', name: 'View Training', description: 'Can view training records' },
            'training.create': { category: 'Training Management', name: 'Create Training', description: 'Can create training records' },
            'training.edit': { category: 'Training Management', name: 'Edit Training', description: 'Can edit training records' },
            'training.delete': { category: 'Training Management', name: 'Delete Training', description: 'Can delete training records' },
            
            // Emergency Management
            'emergency.view': { category: 'Emergency Management', name: 'View Emergencies', description: 'Can view emergency call-ins' },
            'emergency.create': { category: 'Emergency Management', name: 'Create Emergency', description: 'Can create emergency call-ins' },
            'emergency.manage': { category: 'Emergency Management', name: 'Manage Emergencies', description: 'Can manage emergency situations' }
        },

        /**
         * Initialize the advanced permissions system
         */
        init() {
            if (this.initialized) return;
            this.initialized = true;
            Logger.debug('AdvancedPermissions initialized');
        },

        /**
         * Load the advanced permissions manager UI
         */
        loadAdvancedPermissionsManager() {
            const container = document.getElementById('advancedPermissionsManager');
            if (!container) return;

            container.innerHTML = `
                <div class="advanced-permissions-container">
                    <div class="permissions-header">
                        <h2>🔐 Advanced Permissions Manager</h2>
                        <p>Grant granular permissions to users and roles, including permission delegation authority</p>
                    </div>

                    <div class="permissions-tabs">
                        <button class="tab-btn active" data-tab="users">User Permissions</button>
                        <button class="tab-btn" data-tab="roles">Role Permissions</button>
                        <button class="tab-btn" data-tab="delegation">Permission Delegation</button>
                    </div>

                    <!-- User Permissions Tab -->
                    <div id="tab-users" class="tab-content active">
                        <div class="permissions-controls">
                            <div class="control-group">
                                <label for="userSelect">Select User:</label>
                                <select id="userSelect" class="form-control">
                                    <option value="">-- Select User --</option>
                                </select>
                            </div>
                            <div class="control-group">
                                <label for="userPermissionFilter">Filter by Category:</label>
                                <select id="userPermissionFilter" class="form-control">
                                    <option value="all">All Categories</option>
                                </select>
                            </div>
                            <div class="control-group">
                                <button onclick="AdvancedPermissions.grantAllUserPermissions()" class="btn btn-success">Grant All</button>
                                <button onclick="AdvancedPermissions.revokeAllUserPermissions()" class="btn btn-danger">Revoke All</button>
                                <button onclick="AdvancedPermissions.resetUserPermissions()" class="btn btn-warning">Reset to Role Defaults</button>
                            </div>
                        </div>

                        <div id="userPermissionsGrid" class="permissions-grid">
                            <p class="text-muted">Select a user to view and manage their permissions</p>
                        </div>
                    </div>

                    <!-- Role Permissions Tab -->
                    <div id="tab-roles" class="tab-content">
                        <div class="permissions-controls">
                            <div class="control-group">
                                <label for="roleSelect">Select Role:</label>
                                <select id="roleSelect" class="form-control">
                                    <option value="">-- Select Role --</option>
                                    <option value="super_admin">Super Admin</option>
                                    <option value="boss">Boss</option>
                                    <option value="paramedic">Paramedic</option>
                                    <option value="emt">EMT</option>
                                </select>
                            </div>
                            <div class="control-group">
                                <label for="rolePermissionFilter">Filter by Category:</label>
                                <select id="rolePermissionFilter" class="form-control">
                                    <option value="all">All Categories</option>
                                </select>
                            </div>
                            <div class="control-group">
                                <button onclick="AdvancedPermissions.grantAllRolePermissions()" class="btn btn-success">Grant All</button>
                                <button onclick="AdvancedPermissions.revokeAllRolePermissions()" class="btn btn-danger">Revoke All</button>
                            </div>
                        </div>

                        <div id="rolePermissionsGrid" class="permissions-grid">
                            <p class="text-muted">Select a role to view and manage their permissions</p>
                        </div>
                    </div>

                    <!-- Permission Delegation Tab -->
                    <div id="tab-delegation" class="tab-content">
                        <div class="permissions-controls">
                            <div class="control-group">
                                <label for="delegatorSelect">Select Delegator (who can grant):</label>
                                <select id="delegatorSelect" class="form-control">
                                    <option value="">-- Select User --</option>
                                </select>
                            </div>
                            <div class="control-group">
                                <label for="delegationFilter">Filter by Category:</label>
                                <select id="delegationFilter" class="form-control">
                                    <option value="all">All Categories</option>
                                </select>
                            </div>
                            <div class="control-group">
                                <button onclick="AdvancedPermissions.grantAllDelegation()" class="btn btn-success">Grant All Delegation</button>
                                <button onclick="AdvancedPermissions.revokeAllDelegation()" class="btn btn-danger">Revoke All Delegation</button>
                            </div>
                        </div>

                        <div class="delegation-info">
                            <div class="alert alert-info">
                                <strong>ℹ️ Permission Delegation</strong><br>
                                This tab controls which permissions a user can grant to others. For example, if you grant "users.create" delegation to a user, they can grant the "users.create" permission to other users.
                            </div>
                        </div>

                        <div id="delegationGrid" class="permissions-grid">
                            <p class="text-muted">Select a user to view and manage their delegation permissions</p>
                        </div>
                    </div>
                </div>
            `;

            this.setupEventListeners();
            this.populateUserSelects();
            this.populateCategoryFilters();
        },

        /**
         * Setup event listeners
         */
        setupEventListeners() {
            // Tab switching
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tab = e.target.dataset.tab;
                    this.switchTab(tab);
                });
            });

            // User selection
            const userSelect = document.getElementById('userSelect');
            if (userSelect) {
                userSelect.addEventListener('change', () => {
                    this.loadUserPermissions();
                });
            }

            // Role selection
            const roleSelect = document.getElementById('roleSelect');
            if (roleSelect) {
                roleSelect.addEventListener('change', () => {
                    this.loadRolePermissions();
                });
            }

            // Delegator selection
            const delegatorSelect = document.getElementById('delegatorSelect');
            if (delegatorSelect) {
                delegatorSelect.addEventListener('change', () => {
                    this.loadDelegationPermissions();
                });
            }

            // Category filters
            const userFilter = document.getElementById('userPermissionFilter');
            if (userFilter) {
                userFilter.addEventListener('change', () => {
                    this.loadUserPermissions();
                });
            }

            const roleFilter = document.getElementById('rolePermissionFilter');
            if (roleFilter) {
                roleFilter.addEventListener('change', () => {
                    this.loadRolePermissions();
                });
            }

            const delegationFilter = document.getElementById('delegationFilter');
            if (delegationFilter) {
                delegationFilter.addEventListener('change', () => {
                    this.loadDelegationPermissions();
                });
            }
        },

        /**
         * Switch between tabs
         */
        switchTab(tabName) {
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.tab === tabName) {
                    btn.classList.add('active');
                }
            });

            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            const activeTab = document.getElementById(`tab-${tabName}`);
            if (activeTab) {
                activeTab.classList.add('active');
            }
        },

        /**
         * Populate user select dropdowns
         */
        populateUserSelects() {
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            
            const userSelect = document.getElementById('userSelect');
            const delegatorSelect = document.getElementById('delegatorSelect');
            
            if (userSelect) {
                userSelect.innerHTML = '<option value="">-- Select User --</option>';
                users.forEach(user => {
                    if (user.role !== 'super_admin') {
                        const safeName = typeof escapeHTML === 'function' ? escapeHTML(user.name) : user.name;
                        const safeRole = typeof escapeHTML === 'function' ? escapeHTML(user.role) : user.role;
                        userSelect.innerHTML += `<option value="${user.id}">${safeName} (${safeRole})</option>`;
                    }
                });
            }
            
            if (delegatorSelect) {
                delegatorSelect.innerHTML = '<option value="">-- Select User --</option>';
                users.forEach(user => {
                    if (user.role !== 'super_admin') {
                        const safeName = typeof escapeHTML === 'function' ? escapeHTML(user.name) : user.name;
                        const safeRole = typeof escapeHTML === 'function' ? escapeHTML(user.role) : user.role;
                        delegatorSelect.innerHTML += `<option value="${user.id}">${safeName} (${safeRole})</option>`;
                    }
                });
            }
        },

        /**
         * Populate category filter dropdowns
         */
        populateCategoryFilters() {
            const categories = new Set();
            Object.values(this.PERMISSIONS).forEach(perm => {
                categories.add(perm.category);
            });

            const filters = ['userPermissionFilter', 'rolePermissionFilter', 'delegationFilter'];
            filters.forEach(filterId => {
                const filter = document.getElementById(filterId);
                if (filter) {
                    filter.innerHTML = '<option value="all">All Categories</option>';
                    Array.from(categories).sort().forEach(category => {
                        filter.innerHTML += `<option value="${category}">${category}</option>`;
                    });
                }
            });
        },

        /**
         * Get user permissions from localStorage
         */
        getUserPermissions(userId) {
            const allPermissions = JSON.parse(localStorage.getItem('lifestarUserPermissions') || '{}');
            return allPermissions[userId] || [];
        },

        /**
         * Set user permissions in localStorage
         */
        setUserPermissions(userId, permissions) {
            const allPermissions = JSON.parse(localStorage.getItem('lifestarUserPermissions') || '{}');
            allPermissions[userId] = permissions;
            localStorage.setItem('lifestarUserPermissions', JSON.stringify(allPermissions));
        },

        /**
         * Get role permissions from localStorage
         */
        getRolePermissions(role) {
            const allPermissions = JSON.parse(localStorage.getItem('lifestarRolePermissions') || '{}');
            return allPermissions[role] || this.getDefaultRolePermissions(role);
        },

        /**
         * Set role permissions in localStorage
         */
        setRolePermissions(role, permissions) {
            const allPermissions = JSON.parse(localStorage.getItem('lifestarRolePermissions') || '{}');
            allPermissions[role] = permissions;
            localStorage.setItem('lifestarRolePermissions', JSON.stringify(allPermissions));
        },

        /**
         * Get delegation permissions for a user
         */
        getDelegationPermissions(userId) {
            const allDelegation = JSON.parse(localStorage.getItem('lifestarDelegationPermissions') || '{}');
            return allDelegation[userId] || [];
        },

        /**
         * Set delegation permissions for a user
         */
        setDelegationPermissions(userId, permissions) {
            const allDelegation = JSON.parse(localStorage.getItem('lifestarDelegationPermissions') || '{}');
            allDelegation[userId] = permissions;
            localStorage.setItem('lifestarDelegationPermissions', JSON.stringify(allDelegation));
        },

        /**
         * Get default permissions for a role
         */
        getDefaultRolePermissions(role) {
            const defaults = {
                super_admin: Object.keys(this.PERMISSIONS),
                boss: [
                    'users.view', 'schedules.view', 'schedules.create', 'schedules.edit', 'schedules.delete',
                    'schedules.publish', 'schedules.archive', 'crews.view', 'crews.create', 'crews.edit', 'crews.delete',
                    'timeoff.view', 'timeoff.approve', 'timeoff.deny', 'trades.view', 'trades.approve', 'trades.deny',
                    'analytics.view', 'analytics.export', 'payroll.view', 'locations.view', 'training.view',
                    'emergency.view', 'emergency.create', 'emergency.manage'
                ],
                paramedic: [
                    'schedules.view', 'crews.view', 'timeoff.view', 'timeoff.request', 'trades.view', 'trades.request',
                    'analytics.view', 'training.view', 'emergency.view', 'emergency.create'
                ],
                emt: [
                    'schedules.view', 'crews.view', 'timeoff.view', 'timeoff.request', 'trades.view', 'trades.request',
                    'analytics.view', 'training.view', 'emergency.view', 'emergency.create'
                ]
            };
            return defaults[role] || [];
        },

        /**
         * Load user permissions grid
         */
        loadUserPermissions() {
            const userId = document.getElementById('userSelect').value;
            const grid = document.getElementById('userPermissionsGrid');
            const filter = document.getElementById('userPermissionFilter').value;

            if (!userId) {
                grid.innerHTML = '<p class="text-muted">Select a user to view and manage their permissions</p>';
                return;
            }

            const userPermissions = this.getUserPermissions(userId);
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const user = users.find(u => u.id === userId);
            const roleDefaults = this.getDefaultRolePermissions(user?.role || 'emt');

            let html = '<div class="permissions-categories">';
            
            // Group permissions by category
            const categories = {};
            Object.entries(this.PERMISSIONS).forEach(([key, perm]) => {
                if (filter === 'all' || perm.category === filter) {
                    if (!categories[perm.category]) {
                        categories[perm.category] = [];
                    }
                    categories[perm.category].push({ key, ...perm });
                }
            });

            Object.entries(categories).forEach(([category, perms]) => {
                html += `
                    <div class="permission-category">
                        <h3>${category}</h3>
                        <div class="permission-items">
                `;
                
                perms.forEach(perm => {
                    const hasPermission = userPermissions.includes(perm.key);
                    const isDefault = roleDefaults.includes(perm.key);
                    
                    html += `
                        <div class="permission-item">
                            <div class="permission-info">
                                <label class="permission-toggle">
                                    <input type="checkbox" 
                                           data-permission="${perm.key}" 
                                           ${hasPermission ? 'checked' : ''}
                                           onchange="AdvancedPermissions.toggleUserPermission('${userId}', '${perm.key}')">;
                                    <span class="toggle-slider"></span>
                                </label>
                                <div class="permission-details">
                                    <strong>${perm.name}</strong>
                                    <p>${perm.description}</p>
                                    ${isDefault ? '<span class="badge badge-info">Default for role</span>' : ''}
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            grid.textContent = html;
        },

        /**
         * Load role permissions grid
         */
        loadRolePermissions() {
            const role = document.getElementById('roleSelect').value;
            const grid = document.getElementById('rolePermissionsGrid');
            const filter = document.getElementById('rolePermissionFilter').value;

            if (!role) {
                grid.innerHTML = '<p class="text-muted">Select a role to view and manage their permissions</p>';
                return;
            }

            const rolePermissions = this.getRolePermissions(role);

            let html = '<div class="permissions-categories">';
            
            // Group permissions by category
            const categories = {};
            Object.entries(this.PERMISSIONS).forEach(([key, perm]) => {
                if (filter === 'all' || perm.category === filter) {
                    if (!categories[perm.category]) {
                        categories[perm.category] = [];
                    }
                    categories[perm.category].push({ key, ...perm });
                }
            });

            Object.entries(categories).forEach(([category, perms]) => {
                html += `
                    <div class="permission-category">
                        <h3>${category}</h3>
                        <div class="permission-items">
                `;
                
                perms.forEach(perm => {
                    const hasPermission = rolePermissions.includes(perm.key);
                    
                    html += `
                        <div class="permission-item">
                            <div class="permission-info">
                                <label class="permission-toggle">
                                    <input type="checkbox" 
                                           data-permission="${perm.key}" 
                                           ${hasPermission ? 'checked' : ''}
                                           onchange="AdvancedPermissions.toggleRolePermission('${role}', '${perm.key}')">;
                                    <span class="toggle-slider"></span>
                                </label>
                                <div class="permission-details">
                                    <strong>${perm.name}</strong>
                                    <p>${perm.description}</p>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            grid.textContent = html;
        },

        /**
         * Load delegation permissions grid
         */
        loadDelegationPermissions() {
            const userId = document.getElementById('delegatorSelect').value;
            const grid = document.getElementById('delegationGrid');
            const filter = document.getElementById('delegationFilter').value;

            if (!userId) {
                grid.innerHTML = '<p class="text-muted">Select a user to view and manage their delegation permissions</p>';
                return;
            }

            const delegationPermissions = this.getDelegationPermissions(userId);

            let html = '<div class="permissions-categories">';
            
            // Group permissions by category
            const categories = {};
            Object.entries(this.PERMISSIONS).forEach(([key, perm]) => {
                if (filter === 'all' || perm.category === filter) {
                    if (!categories[perm.category]) {
                        categories[perm.category] = [];
                    }
                    categories[perm.category].push({ key, ...perm });
                }
            });

            Object.entries(categories).forEach(([category, perms]) => {
                html += `
                    <div class="permission-category">
                        <h3>${category}</h3>
                        <div class="permission-items">
                `;
                
                perms.forEach(perm => {
                    const hasDelegation = delegationPermissions.includes(perm.key);
                    
                    html += `
                        <div class="permission-item">
                            <div class="permission-info">
                                <label class="permission-toggle">
                                    <input type="checkbox" 
                                           data-permission="${perm.key}" 
                                           ${hasDelegation ? 'checked' : ''}
                                           onchange="AdvancedPermissions.toggleDelegationPermission('${userId}', '${perm.key}')">;
                                    <span class="toggle-slider"></span>
                                </label>
                                <div class="permission-details">
                                    <strong>${perm.name}</strong>
                                    <p>${perm.description}</p>
                                    <span class="badge badge-warning">Can grant this permission</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            grid.textContent = html;
        },

        /**
         * Toggle user permission
         */
        toggleUserPermission(userId, permission) {
            const permissions = this.getUserPermissions(userId);
            const index = permissions.indexOf(permission);
            
            if (index > -1) {
                permissions.splice(index, 1);
            } else {
                permissions.push(permission);
            }
            
            this.setUserPermissions(userId, permissions);
            showToast(`Permission ${index > -1 ? 'revoked' : 'granted'} successfully`, 'success');
        },

        /**
         * Toggle role permission
         */
        toggleRolePermission(role, permission) {
            const permissions = this.getRolePermissions(role);
            const index = permissions.indexOf(permission);
            
            if (index > -1) {
                permissions.splice(index, 1);
            } else {
                permissions.push(permission);
            }
            
            this.setRolePermissions(role, permissions);
            showToast(`Role permission ${index > -1 ? 'revoked' : 'granted'} successfully`, 'success');
        },

        /**
         * Toggle delegation permission
         */
        toggleDelegationPermission(userId, permission) {
            const permissions = this.getDelegationPermissions(userId);
            const index = permissions.indexOf(permission);
            
            if (index > -1) {
                permissions.splice(index, 1);
            } else {
                permissions.push(permission);
            }
            
            this.setDelegationPermissions(userId, permissions);
            showToast(`Delegation permission ${index > -1 ? 'revoked' : 'granted'} successfully`, 'success');
        },

        /**
         * Grant all user permissions
         */
        grantAllUserPermissions() {
            const userId = document.getElementById('userSelect').value;
            if (!userId) {
                showToast('Please select a user first', 'error');
                return;
            }
            
            const allPermissions = Object.keys(this.PERMISSIONS);
            this.setUserPermissions(userId, allPermissions);
            this.loadUserPermissions();
            showToast('All permissions granted to user', 'success');
        },

        /**
         * Revoke all user permissions
         */
        revokeAllUserPermissions() {
            const userId = document.getElementById('userSelect').value;
            if (!userId) {
                showToast('Please select a user first', 'error');
                return;
            }
            
            this.setUserPermissions(userId, []);
            this.loadUserPermissions();
            showToast('All permissions revoked from user', 'success');
        },

        /**
         * Reset user permissions to role defaults
         */
        resetUserPermissions() {
            const userId = document.getElementById('userSelect').value;
            if (!userId) {
                showToast('Please select a user first', 'error');
                return;
            }
            
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const user = users.find(u => u.id === userId);
            
            if (!user) {
                showToast('User not found', 'error');
                return;
            }
            
            const defaults = this.getDefaultRolePermissions(user.role);
            this.setUserPermissions(userId, defaults);
            this.loadUserPermissions();
            showToast('Permissions reset to role defaults', 'success');
        },

        /**
         * Grant all role permissions
         */
        grantAllRolePermissions() {
            const role = document.getElementById('roleSelect').value;
            if (!role) {
                showToast('Please select a role first', 'error');
                return;
            }
            
            const allPermissions = Object.keys(this.PERMISSIONS);
            this.setRolePermissions(role, allPermissions);
            this.loadRolePermissions();
            showToast('All permissions granted to role', 'success');
        },

        /**
         * Revoke all role permissions
         */
        revokeAllRolePermissions() {
            const role = document.getElementById('roleSelect').value;
            if (!role) {
                showToast('Please select a role first', 'error');
                return;
            }
            
            this.setRolePermissions(role, []);
            this.loadRolePermissions();
            showToast('All permissions revoked from role', 'success');
        },

        /**
         * Grant all delegation permissions
         */
        grantAllDelegation() {
            const userId = document.getElementById('delegatorSelect').value;
            if (!userId) {
                showToast('Please select a user first', 'error');
                return;
            }
            
            const allPermissions = Object.keys(this.PERMISSIONS);
            this.setDelegationPermissions(userId, allPermissions);
            this.loadDelegationPermissions();
            showToast('All delegation permissions granted', 'success');
        },

        /**
         * Revoke all delegation permissions
         */
        revokeAllDelegation() {
            const userId = document.getElementById('delegatorSelect').value;
            if (!userId) {
                showToast('Please select a user first', 'error');
                return;
            }
            
            this.setDelegationPermissions(userId, []);
            this.loadDelegationPermissions();
            showToast('All delegation permissions revoked', 'success');
        },

        /**
         * Check if user has a specific permission
         */
        hasPermission(userId, permission) {
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const user = users.find(u => u.id === userId);
            
            if (!user) return false;
            
            // Super admin has all permissions
            if (user.role === 'super_admin') return true;
            
            // Check user-specific permissions
            const userPermissions = this.getUserPermissions(userId);
            if (userPermissions.includes(permission)) return true;
            
            // Check role permissions
            const rolePermissions = this.getRolePermissions(user.role);
            return rolePermissions.includes(permission);
        },

        /**
         * Check if user can grant a specific permission
         */
        canGrantPermission(granterUserId, permission) {
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const granter = users.find(u => u.id === granterUserId);
            
            if (!granter) return false;
            
            // Super admin can grant any permission
            if (granter.role === 'super_admin') return true;
            
            // Check if user has delegation permission for this specific permission
            const delegationPermissions = this.getDelegationPermissions(granterUserId);
            return delegationPermissions.includes(permission);
        }
    };

    // Export to global scope
    window.AdvancedPermissions = AdvancedPermissions;
})();