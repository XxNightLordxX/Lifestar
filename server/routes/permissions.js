/**
 * Permissions API Routes
 *
 * GET  /api/permissions/definitions        — all permission definitions
 * GET  /api/permissions/roles              — role default permissions
 * GET  /api/permissions/user/:id           — permissions for a specific user
 * PUT  /api/permissions/user/:id           — set permissions for a user (replaces all)
 * POST /api/permissions/user/:id/grant     — grant a single permission to a user
 * POST /api/permissions/user/:id/revoke    — revoke a single permission from a user
 * POST /api/permissions/user/:id/reset     — reset user to role defaults
 * GET  /api/permissions/role/:role         — role-level overrides
 * PUT  /api/permissions/role/:role         — set role-level overrides
 *
 * Only super admins may read or modify permissions.
 *
 * @module routes/permissions
 */

'use strict';

const express   = require('express');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { HTTP_STATUS } = require('../config');

const router = express.Router();

// All permission endpoints require super admin
router.use(authenticate, authorize('super'));

// ─── PERMISSION DEFINITIONS ───────────────────────────────────────────────────
// These are the canonical permission keys and their metadata. They are the
// same structure used by core-permissions.js in the frontend so the two sides
// stay in sync.
const PERMISSION_DEFINITIONS = {
    // ── Scheduling ────────────────────────────────────────────────────────
    'schedule.create':         { label: 'Create Schedules',        category: 'Scheduling',        description: 'Create new draft schedules' },
    'schedule.edit':           { label: 'Edit Schedules',          category: 'Scheduling',        description: 'Edit existing schedules' },
    'schedule.delete':         { label: 'Delete Schedules',        category: 'Scheduling',        description: 'Delete schedules permanently' },
    'schedule.publish':        { label: 'Publish Schedules',       category: 'Scheduling',        description: 'Publish draft schedules for staff to view' },
    'schedule.archive':        { label: 'Archive Schedules',       category: 'Scheduling',        description: 'Archive past schedules' },
    'schedule.export':         { label: 'Export Schedules',        category: 'Scheduling',        description: 'Export schedule data to PDF/CSV' },
    'schedule.duplicate':      { label: 'Duplicate Schedules',     category: 'Scheduling',        description: 'Copy an existing schedule as a new draft' },
    'schedule.view_drafts':    { label: 'View Draft Schedules',    category: 'Scheduling',        description: 'See unpublished draft schedules' },
    'schedule.view_published': { label: 'View Published Schedules',category: 'Scheduling',        description: 'View published (live) schedules' },
    'schedule.view_archived':  { label: 'View Archived Schedules', category: 'Scheduling',        description: 'Access historical archived schedules' },
    'schedule.calendar':       { label: 'Calendar View',           category: 'Scheduling',        description: 'Access the calendar view' },
    'schedule.templates':      { label: 'Schedule Templates',      category: 'Scheduling',        description: 'Create and manage schedule templates' },
    'schedule.bulk_edit':      { label: 'Bulk Edit Shifts',        category: 'Scheduling',        description: 'Edit multiple shifts at once' },
    'schedule.health_scan':    { label: 'Schedule Health Scan',    category: 'Scheduling',        description: 'Run coverage gap & health analysis' },

    // ── Crew Management ───────────────────────────────────────────────────
    'crew.manage':             { label: 'Manage Crew Assignments', category: 'Crew Management',   description: 'Create and edit crew assignments' },
    'crew.delete':             { label: 'Delete Crew Assignments', category: 'Crew Management',   description: 'Remove crew assignments from a schedule' },
    'crew.swap_staff':         { label: 'Swap Crew Members',       category: 'Crew Management',   description: 'Swap staff between crews on a schedule' },
    'crew.drag_drop':          { label: 'Drag-and-Drop Scheduling',category: 'Crew Management',   description: 'Use drag-and-drop to rearrange crew assignments' },
    'crew.templates':          { label: 'Crew Templates',          category: 'Crew Management',   description: 'Save and reuse crew templates' },

    // ── Staff Management ──────────────────────────────────────────────────
    'staff.view':              { label: 'View Staff Directory',    category: 'Staff Management',  description: 'See the list of all staff members' },
    'staff.view_details':      { label: 'View Staff Details',      category: 'Staff Management',  description: 'View detailed staff profile info' },
    'staff.view_schedule':     { label: 'View Staff Schedules',    category: 'Staff Management',  description: 'See individual staff member schedules' },
    'staff.manage_availability':{ label: 'Manage Availability',   category: 'Staff Management',  description: 'View and manage staff availability blocks' },
    'staff.manage_training':   { label: 'Manage Training Records', category: 'Staff Management',  description: 'Track certifications and training hours' },
    'staff.manage_bonus':      { label: 'Manage Bonus Hours',      category: 'Staff Management',  description: 'Grant and adjust bonus hour allocations' },
    'staff.view_hours':        { label: 'View Hours Worked',       category: 'Staff Management',  description: 'See hours-worked totals for all staff' },
    'staff.export':            { label: 'Export Staff Data',       category: 'Staff Management',  description: 'Export staff roster to CSV/PDF' },

    // ── Time-Off & Requests ───────────────────────────────────────────────
    'requests.timeoff':        { label: 'Approve Time-Off Requests',category: 'Requests',         description: 'Approve or deny submitted time-off requests' },
    'requests.trades':         { label: 'Approve Shift Trades',    category: 'Requests',          description: 'Approve or deny shift trade requests' },
    'requests.swap':           { label: 'Swap Marketplace',        category: 'Requests',          description: 'Access the shift-swap marketplace' },
    'requests.timeoff_own':    { label: 'Submit Time-Off',         category: 'Requests',          description: 'Submit personal time-off requests' },
    'requests.trade_own':      { label: 'Submit Shift Trades',     category: 'Requests',          description: 'Submit personal shift trade requests' },
    'requests.view_all':       { label: 'View All Requests',       category: 'Requests',          description: 'See all pending and historical requests' },

    // ── Operations ────────────────────────────────────────────────────────
    'ops.callins':             { label: 'Emergency Call-ins',      category: 'Operations',        description: 'Manage emergency call-in reports' },
    'ops.absences':            { label: 'Manage Absences',         category: 'Operations',        description: 'Track and manage staff absences' },
    'ops.oncall':              { label: 'On-Call Rotation',        category: 'Operations',        description: 'Manage the on-call rotation list' },
    'ops.incidents':           { label: 'Incident Reports',        category: 'Operations',        description: 'View, create, and manage incident reports' },
    'ops.incidents_resolve':   { label: 'Resolve Incidents',       category: 'Operations',        description: 'Mark incidents as resolved or closed' },
    'ops.coverage_alerts':     { label: 'Coverage Gap Alerts',     category: 'Operations',        description: 'Receive alerts for uncovered shifts' },

    // ── Analysis ─────────────────────────────────────────────────────────
    'analysis.analytics':      { label: 'Analytics Dashboard',     category: 'Analysis',          description: 'Access the full analytics dashboard' },
    'analysis.history':        { label: 'Shift History',           category: 'Analysis',          description: 'View historical shift records' },
    'analysis.reports':        { label: 'Generate Reports',        category: 'Analysis',          description: 'Create and download custom reports' },
    'analysis.payroll':        { label: 'Payroll Reports',         category: 'Analysis',          description: 'Generate payroll summary reports' },
    'analysis.export':         { label: 'Export Analytics',        category: 'Analysis',          description: 'Export analytics data to CSV/PDF' },

    // ── Administration ────────────────────────────────────────────────────
    'admin.users':             { label: 'User Management',         category: 'Administration',    description: 'Add, edit, deactivate, and delete users' },
    'admin.users_create':      { label: 'Create Users',            category: 'Administration',    description: 'Create new user accounts' },
    'admin.users_delete':      { label: 'Delete Users',            category: 'Administration',    description: 'Permanently delete user accounts' },
    'admin.users_password':    { label: 'Reset User Passwords',    category: 'Administration',    description: 'Reset any user\'s password' },
    'admin.features':          { label: 'Feature Toggles',         category: 'Administration',    description: 'Enable or disable system feature flags' },
    'admin.api_keys':          { label: 'API Key Management',      category: 'Administration',    description: 'Create and revoke API keys' },
    'admin.logs':              { label: 'System Logs',             category: 'Administration',    description: 'View system activity and audit logs' },
    'admin.developer':         { label: 'Developer Tools',         category: 'Administration',    description: 'Access the developer/debug panel' },
    'admin.permissions':       { label: 'Permission Management',   category: 'Administration',    description: 'Grant or revoke permissions for any user or role' },
    'admin.ai':                { label: 'AI Assistant',            category: 'Administration',    description: 'Use and configure the AI assistant' },
    'admin.settings':          { label: 'System Settings',         category: 'Administration',    description: 'Modify global system configuration' },
    'admin.backup':            { label: 'Backup & Restore',        category: 'Administration',    description: 'Create database backups and restore from them' },
    'admin.reset':             { label: 'System Reset',            category: 'Administration',    description: 'Reset the system data (danger!)' },
    'admin.locations':         { label: 'Location Management',     category: 'Administration',    description: 'Add, edit, and remove station locations' },
    'admin.payroll_approve':   { label: 'Approve Payroll',         category: 'Administration',    description: 'Approve generated payroll reports' },

    // ── Personal / Other ─────────────────────────────────────────────────
    'other.notes':             { label: 'Supervisor Notes',        category: 'Other',             description: 'Create and read supervisor shift notes' },
    'other.notifications':     { label: 'Notification Settings',   category: 'Other',             description: 'Configure personal notification preferences' },
    'other.dark_mode':         { label: 'Theme & Dark Mode',       category: 'Other',             description: 'Switch between light and dark themes' },
    'other.profile':           { label: 'Edit Own Profile',        category: 'Other',             description: 'Update personal contact information' },
    'other.change_password':   { label: 'Change Own Password',     category: 'Other',             description: 'Change own account password' },
};

// Role default permissions — what each role gets before any overrides are applied
const ROLE_PERMISSIONS = {
    super: Object.keys(PERMISSION_DEFINITIONS),

    boss: [
        'schedule.create','schedule.edit','schedule.delete','schedule.publish',
        'schedule.archive','schedule.export','schedule.duplicate','schedule.view_drafts',
        'schedule.view_published','schedule.view_archived','schedule.calendar',
        'schedule.templates','schedule.bulk_edit','schedule.health_scan',
        'crew.manage','crew.delete','crew.swap_staff','crew.drag_drop','crew.templates',
        'staff.view','staff.view_details','staff.view_schedule','staff.manage_availability',
        'staff.manage_training','staff.manage_bonus','staff.view_hours','staff.export',
        'requests.timeoff','requests.trades','requests.swap','requests.view_all',
        'requests.timeoff_own','requests.trade_own',
        'ops.callins','ops.absences','ops.oncall','ops.incidents','ops.incidents_resolve',
        'ops.coverage_alerts',
        'analysis.analytics','analysis.history','analysis.reports','analysis.payroll',
        'analysis.export',
        'other.notes','other.notifications','other.dark_mode','other.profile',
        'other.change_password',
    ],

    paramedic: [
        'schedule.view_published','schedule.calendar',
        'staff.view',
        'requests.swap','requests.timeoff_own','requests.trade_own',
        'analysis.history',
        'other.dark_mode','other.profile','other.change_password','other.notifications',
    ],

    emt: [
        'schedule.view_published','schedule.calendar',
        'staff.view',
        'requests.swap','requests.timeoff_own','requests.trade_own',
        'analysis.history',
        'other.dark_mode','other.profile','other.change_password','other.notifications',
    ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getEffectiveUserPermissions(db, userId, userRole) {
    // Start with role defaults
    const base = new Set(ROLE_PERMISSIONS[userRole] || []);

    // Apply per-user overrides from the DB
    const rows = db.prepare(
        `SELECT permissionKey, granted FROM user_permissions WHERE userId = ?`
    ).all(userId);

    for (const row of rows) {
        if (row.granted) {
            base.add(row.permissionKey);
        } else {
            base.delete(row.permissionKey);
        }
    }

    return [...base];
}

function getRoleOverridePermissions(db, role) {
    const rows = db.prepare(
        `SELECT permissionKey, granted FROM user_permissions WHERE role = ? AND userId IS NULL`
    ).all(role);
    return rows;
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/** GET /api/permissions/definitions */
router.get('/definitions', (req, res) => {
    res.json({ success: true, definitions: PERMISSION_DEFINITIONS, roles: ROLE_PERMISSIONS });
});

/** GET /api/permissions/user/:id */
router.get('/user/:id', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const effective = getEffectiveUserPermissions(db, userId, user.role);
    const overrides = db.prepare(
        `SELECT permissionKey, granted FROM user_permissions WHERE userId = ?`
    ).all(userId);

    res.json({
        success: true,
        userId,
        username: user.username,
        role: user.role,
        roleDefaults: ROLE_PERMISSIONS[user.role] || [],
        overrides,
        effective,
    });
});

/** PUT /api/permissions/user/:id  — set the full list for a user */
router.put('/user/:id', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

    const { permissions } = req.body; // expected: string[]
    if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be an array' });

    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Build diff against role defaults
    const defaults = new Set(ROLE_PERMISSIONS[user.role] || []);
    const desired  = new Set(permissions.filter(k => PERMISSION_DEFINITIONS[k]));

    const grant  = [...desired].filter(k => !defaults.has(k));
    const revoke = [...defaults].filter(k => !desired.has(k));

    db.transaction(() => {
        // Clear existing per-user overrides
        db.prepare('DELETE FROM user_permissions WHERE userId = ?').run(userId);

        const insert = db.prepare(
            `INSERT INTO user_permissions (userId, permissionKey, granted, grantedBy) VALUES (?, ?, ?, ?)`
        );
        for (const k of grant)  insert.run(userId, k, 1, req.user.id);
        for (const k of revoke) insert.run(userId, k, 0, req.user.id);
    })();

    addLog(`Permissions updated for user ${user.username} by ${req.user.username}`, req.user.id, req.user.username);
    res.json({ success: true, effective: [...desired] });
});

/** POST /api/permissions/user/:id/grant */
router.post('/user/:id/grant', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { permission } = req.body;
    if (isNaN(userId) || !permission) return res.status(400).json({ error: 'userId and permission required' });
    if (!PERMISSION_DEFINITIONS[permission]) return res.status(400).json({ error: `Unknown permission: ${permission}` });

    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Upsert: delete old row then insert
    db.prepare('DELETE FROM user_permissions WHERE userId = ? AND permissionKey = ?').run(userId, permission);
    db.prepare('INSERT INTO user_permissions (userId, permissionKey, granted, grantedBy) VALUES (?, ?, 1, ?)').run(userId, permission, req.user.id);

    res.json({ success: true, granted: permission });
});

/** POST /api/permissions/user/:id/revoke */
router.post('/user/:id/revoke', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { permission } = req.body;
    if (isNaN(userId) || !permission) return res.status(400).json({ error: 'userId and permission required' });

    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare('DELETE FROM user_permissions WHERE userId = ? AND permissionKey = ?').run(userId, permission);
    db.prepare('INSERT INTO user_permissions (userId, permissionKey, granted, grantedBy) VALUES (?, ?, 0, ?)').run(userId, permission, req.user.id);

    res.json({ success: true, revoked: permission });
});

/** POST /api/permissions/user/:id/reset — reset to role defaults */
router.post('/user/:id/reset', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

    const db = getDb();
    db.prepare('DELETE FROM user_permissions WHERE userId = ?').run(userId);

    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    addLog(`Permissions reset to role defaults for user ${user?.username}`, req.user.id, req.user.username);
    res.json({ success: true, effective: ROLE_PERMISSIONS[user?.role] || [] });
});

/** GET /api/permissions/role/:role — get role default permissions */
router.get('/role/:role', (req, res) => {
    const role = req.params.role;
    if (!ROLE_PERMISSIONS[role]) return res.status(404).json({ error: 'Unknown role' });
    res.json({ success: true, role, permissions: ROLE_PERMISSIONS[role] });
});

/** GET /api/permissions/all-users — permissions summary for all users */
router.get('/all-users', (req, res) => {
    const db = getDb();
    const users = db.prepare('SELECT id, username, role, fullName FROM users WHERE active = 1 ORDER BY role, fullName').all();

    const result = users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        fullName: u.fullName,
        hasOverrides: db.prepare('SELECT COUNT(*) as c FROM user_permissions WHERE userId = ?').get(u.id).c > 0,
        effective: getEffectiveUserPermissions(db, u.id, u.role),
    }));

    res.json({ success: true, users: result, definitions: PERMISSION_DEFINITIONS, roleDefaults: ROLE_PERMISSIONS });
});

module.exports = router;
module.exports.PERMISSION_DEFINITIONS = PERMISSION_DEFINITIONS;
module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
