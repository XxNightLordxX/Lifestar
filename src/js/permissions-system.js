/**
 * Lifestar Ambulance - Permission Management System
 * Granular per-user permissions for every function
 */

// ========================================
// PERMISSION DEFINITIONS
// ========================================

const PERMISSIONS = {
    // Scheduling
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

    // Crew Management
    'crew.manage': { label: 'Manage Crews', category: 'Crew Management', description: 'Create and edit crew assignments' },
    'crew.delete': { label: 'Delete Crews', category: 'Crew Management', description: 'Remove crew assignments' },
    'crew.swap_staff': { label: 'Swap Crew Staff', category: 'Crew Management', description: 'Swap staff between crews' },

    // Staff Management
    'staff.view': { label: 'View Staff Directory', category: 'Staff Management', description: 'View staff member list' },
    'staff.view_details': { label: 'View Staff Details', category: 'Staff Management', description: 'View detailed staff info' },
    'staff.view_schedule': { label: 'View Staff Schedules', category: 'Staff Management', description: 'View individual staff schedules' },
    'staff.manage_availability': { label: 'Manage Availability', category: 'Staff Management', description: 'View and manage staff availability' },
    'staff.manage_training': { label: 'Manage Training', category: 'Staff Management', description: 'Track and manage training records' },
    'staff.manage_bonus': { label: 'Manage Bonus Hours', category: 'Staff Management', description: 'Manage bonus hour allocations' },

    // Requests
    'requests.timeoff': { label: 'Manage Time Off', category: 'Requests', description: 'Approve/deny time off requests' },
    'requests.trades': { label: 'Manage Shift Trades', category: 'Requests', description: 'Approve/deny shift trade requests' },
    'requests.swap': { label: 'Swap Marketplace', category: 'Requests', description: 'Access swap marketplace' },

    // Operations
    'ops.callins': { label: 'Emergency Call-ins', category: 'Operations', description: 'Manage emergency call-ins' },
    'ops.absences': { label: 'Manage Absences', category: 'Operations', description: 'Track and manage absences' },
    'ops.oncall': { label: 'On-Call Rotation', category: 'Operations', description: 'Manage on-call rotation' },

    // Analysis
    'analysis.analytics': { label: 'View Analytics', category: 'Analysis', description: 'Access analytics dashboard' },
    'analysis.history': { label: 'Shift History', category: 'Analysis', description: 'View shift history records' },

    // Other
    'other.notes': { label: 'Supervisor Notes', category: 'Other', description: 'Create and manage supervisor notes' },

    // Admin
    'admin.users': { label: 'User Management', category: 'Administration', description: 'Add, edit, delete users' },
    'admin.features': { label: 'Feature Toggles', category: 'Administration', description: 'Enable/disable system features' },
    'admin.api_keys': { label: 'API Key Management', category: 'Administration', description: 'Manage API keys' },
    'admin.logs': { label: 'System Logs', category: 'Administration', description: 'View system logs' },
    'admin.developer': { label: 'Developer Tools', category: 'Administration', description: 'Access developer tools' },
    'admin.permissions': { label: 'Permission Management', category: 'Administration', description: 'Manage user permissions' },
    'admin.ai': { label: 'AI Assistant', category: 'Administration', description: 'Access AI assistant' }
};

// Default permission sets by role
const DEFAULT_PERMISSIONS = {
    'super': Object.keys(PERMISSIONS), // Super admin gets everything
    'boss': [
        'schedule.create', 'schedule.edit', 'schedule.delete', 'schedule.publish',
        'schedule.archive', 'schedule.export', 'schedule.duplicate',
        'schedule.view_drafts', 'schedule.view_published', 'schedule.view_archived',
        'schedule.calendar', 'schedule.templates',
        'crew.manage', 'crew.delete', 'crew.swap_staff',
        'staff.view', 'staff.view_details', 'staff.view_schedule',
        'staff.manage_availability', 'staff.manage_training', 'staff.manage_bonus',
        'requests.timeoff', 'requests.trades', 'requests.swap',
        'ops.callins', 'ops.absences', 'ops.oncall',
        'analysis.analytics', 'analysis.history',
        'other.notes'
    ],
    'paramedic': [
        'schedule.view_published', 'schedule.calendar',
        'staff.view',
        'requests.swap',
        'analysis.history'
    ],
    'emt': [
        'schedule.view_published', 'schedule.calendar',
        'staff.view',
        'requests.swap',
        'analysis.history'
    ]
};

// ========================================
// PERMISSION STORAGE & CHECKING
// ========================================

let userPermissions = {};

/** Load permissions from localStorage */
function loadPermissions() {
    try {
        const saved = localStorage.getItem('lifestarPermissions');
        if(saved) {
            userPermissions = JSON.parse(saved);
        }
    } catch (e) {
        Logger.error('[loadPermissions] Error:', e);
        userPermissions = {};
    }
}

/** Save permissions to localStorage */
function savePermissions() {
    try {
        localStorage.setItem('lifestarPermissions', JSON.stringify(userPermissions));
    } catch (e) {
        Logger.error('[savePermissions] Error:', e);
    }
}

/** Get permissions for a specific user */
function getUserPermissions(userId) {
    if(userPermissions[userId]) {
        return userPermissions[userId];
    }
    // Return defaults based on role
    const user = users.find(u => u.id === userId);
    if(user && DEFAULT_PERMISSIONS[user.role]) {
        return [...DEFAULT_PERMISSIONS[user.role]];
    }
    return [];
}

/** Check if current user has a specific permission */
function hasPermission(permissionKey) {
    if(!currentUser) return false;
    // Super admin always has all permissions
    if(currentUser.role === 'super') return true;

    const perms = getUserPermissions(currentUser.id);
    return perms.includes(permissionKey);
}

/** Set permissions for a user */
function setUserPermissions(userId, permissions) {
    userPermissions[userId] = permissions;
    savePermissions();
}

/** Toggle a single permission for a user */
function togglePermission(userId, permissionKey) {
    if(!userPermissions[userId]) {
        const user = users.find(u => u.id === userId);
        userPermissions[userId] = user ? [...(DEFAULT_PERMISSIONS[user.role] || [])] : [];
    }

    const idx = userPermissions[userId].indexOf(permissionKey);
    if(idx >= 0) {
        userPermissions[userId].splice(idx, 1);
    } else {
        userPermissions[userId].push(permissionKey);
    }
    savePermissions();
}

// ========================================
// PERMISSION MANAGEMENT UI
// ========================================

/** Load the permissions management section */
function loadPermissionsManager() {
    const container = document.getElementById('permissionsContainer');
    if(!container) return;

    // Build user selector
    const allUsers = users.filter(u => u.role !== 'super'); // Can't edit super admin perms;

    let html = `;
        <div class="card" style="margin-bottom: 20px;">
            <div class="card-body">
                <div class="form-group">
                    <label for="permUserSelect"><strong>Select User to Manage Permissions:</strong></label>
                    <select id="permUserSelect" class="form-select" onchange="loadUserPermissionGrid()" style="font-size: 16px;">
                        <option value="">-- Select a User --</option>
                        ${allUsers.map(u => `<option value="${u.id}">${sanitizeHTML(u.fullName || u.username)} (${sanitizeHTML(u.role).toUpperCase()})</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>
        <div id="permissionGrid"></div>
    `;

    container.textContent = html;
}

/** Load the permission grid for a selected user */
function loadUserPermissionGrid() {
    const userId = parseInt(document.getElementById('permUserSelect').value);
    const grid = document.getElementById('permissionGrid');

    if(!userId) {
        grid.innerHTML = '<div class="card" style="text-align: center; padding: 40px;"><p class="text-muted">Select a user above to manage their permissions</p></div>';
        return;
    }

    const user = users.find(u => u.id === userId);
    if(!user) return;

    const perms = getUserPermissions(userId);

    // Group permissions by category
    const categories = {};
    Object.entries(PERMISSIONS).forEach(([key, def]) => {
        if(!categories[def.category]) categories[def.category] = [];
        categories[def.category].push({ key, ...def });
    });

    // Sanitize user data for display
    const safeFullName = typeof escapeHTML === 'function' ? escapeHTML(user.fullName || user.username) : (user.fullName || user.username);
    const safeRole = typeof escapeHTML === 'function' ? escapeHTML(user.role) : user.role;
    
    let html = `;
        <div class="card" style="margin-bottom: 15px;">
            <div class="card-header" style="background: linear-gradient(135deg, #6f42c1, #8e5eb8);">
                <h2>Permissions for ${safeFullName} <span class="badge badge-${safeRole}" style="margin-left: 10px;">${safeRole.toUpperCase()}</span></h2>
            </div>
            <div class="card-body" style="padding: 10px 20px;">
                <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                    <button class="btn btn-sm btn-success" onclick="grantAllPermissions(${userId})">✅ Grant All</button>
                    <button class="btn btn-sm btn-danger" onclick="revokeAllPermissions(${userId})">❌ Revoke All</button>
                    <button class="btn btn-sm btn-info" onclick="resetToDefaults(${userId})">🔄 Reset to Role Defaults</button>
                </div>
            </div>
        </div>
    `;

    Object.entries(categories).forEach(([category, items]) => {
        // Skip admin perms for non-super roles display (they can still be granted)
        const categoryIcon = getCategoryIcon(category);

        html += `
            <div class="card" style="margin-bottom: 12px;">
                <div class="card-header" style="padding: 12px 20px;">
                    <h2>${categoryIcon} ${category}</h2>
                </div>
                <div class="card-body" style="padding: 10px 15px;">
        `;

        items.forEach(item => {
            const checked = perms.includes(item.key);
            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 8px; border-bottom: 1px solid #f0f0f0; min-height: 44px;">
                    <div style="flex: 1;">
                        <strong style="font-size: 14px;">${item.label}</strong>
                        <div style="font-size: 12px; color: #7f8c8d;">${item.description}</div>
                    </div>
                    <label class="perm-toggle" style="position: relative; display: inline-block; width: 52px; height: 28px; flex-shrink: 0; margin-left: 15px;">
                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="togglePermission(${userId}, '${item.key}'); updatePermToggleVisual(this);" style="opacity: 0; width: 0; height: 0;">
                        <span class="perm-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${checked ? '#27ae60' : '#ccc'}; transition: 0.3s; border-radius: 28px;">
                            <span style="position: absolute; content: ''; height: 22px; width: 22px; left: ${checked ? '27px' : '3px'}; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></span>
                        </span>
                    </label>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    grid.textContent = html;
}

/** Update toggle visual after change */
function updatePermToggleVisual(checkbox) {
    const slider = checkbox.nextElementSibling;
    const knob = slider.querySelector('span');
    if(checkbox.checked) {
        slider.style.backgroundColor = '#27ae60';
        knob.style.left = '27px';
    } else {
        slider.style.backgroundColor = '#ccc';
        knob.style.left = '3px';
    }
}

/** Grant all permissions to a user */
function grantAllPermissions(userId) {
    setUserPermissions(userId, Object.keys(PERMISSIONS));
    loadUserPermissionGrid();
    if(typeof showAlert === 'function') showAlert('All permissions granted', 'success');
}

/** Revoke all permissions from a user */
function revokeAllPermissions(userId) {
    setUserPermissions(userId, []);
    loadUserPermissionGrid();
    if(typeof showAlert === 'function') showAlert('All permissions revoked', 'warning');
}

/** Reset user to role defaults */
function resetToDefaults(userId) {
    const user = users.find(u => u.id === userId);
    if(user && DEFAULT_PERMISSIONS[user.role]) {
        setUserPermissions(userId, [...DEFAULT_PERMISSIONS[user.role]]);
    }
    loadUserPermissionGrid();
    if(typeof showAlert === 'function') showAlert('Permissions reset to role defaults', 'info');
}

/** Get icon for category */
function getCategoryIcon(category) {
    const icons = {
        'Scheduling': '📅',
        'Crew Management': '👥',
        'Staff Management': '🧑‍⚕️',
        'Requests': '📋',
        'Operations': '🚨',
        'Analysis': '📊',
        'Other': '📝',
        'Administration': '⚙️'
    };
    return icons[category] || '📌';
}

// Initialize permissions on load
if(typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        loadPermissions();
    });
}
