/**
 * Admin Routes
 *
 * POST /api/admin/reset  — Wipe all data but preserve super + boss default accounts
 *
 * @module routes/admin
 */

'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { SECURITY, HTTP_STATUS } = require('../config');

const router = express.Router();

router.use(authenticate, authorize('super'));

/**
 * POST /api/admin/reset
 *
 * Wipes all operational data (schedules, crews, logs, notifications,
 * incidents, time-off requests, swap requests, call-ins, training,
 * payroll, user_permissions) and all non-default users, but re-seeds
 * the default super and boss accounts so the admins can always log in.
 */
router.post('/reset', async (req, res) => {
    try {
        const db = getDb();
        const ROUNDS = SECURITY.BCRYPT_ROUNDS;

        // Pre-compute bcrypt hashes outside the transaction to avoid long DB locks
        const superHash = bcrypt.hashSync('super123', ROUNDS);
        const bossHash  = bcrypt.hashSync('boss123', ROUNDS);

        db.transaction(() => {
            // Wipe operational tables — use DELETE FROM for tables that exist,
            // wrap each in a try so missing tables don't abort the transaction.
            const tablesToWipe = [
                'crews', 'schedules', 'system_logs', 'notifications',
                'incident_reports', 'timeoff_requests', 'shift_swaps',
                'emergency_callins', 'training_records', 'user_permissions',
                'locations', 'payroll_reports', 'audit_log',
                'refresh_tokens', 'password_reset_tokens', 'crew_templates'
            ];
            for (const table of tablesToWipe) {
                try { db.prepare(`DELETE FROM ${table}`).run(); } catch (_) { /* table may not exist */ }
            }

            // Remove all non-super/boss users
            db.prepare(`DELETE FROM users WHERE role NOT IN ('super', 'boss')`).run();

            // Ensure super admin exists and has the correct password
            const superExists = db.prepare(`SELECT id FROM users WHERE username = 'super'`).get();
            if (superExists) {
                db.prepare(`UPDATE users SET password = ?, fullName = 'Super Administrator', phone = '555-0001',
                    active = 1, failedLoginAttempts = 0, lockedUntil = NULL, mustChangePassword = 1 WHERE username = 'super'`)
                    .run(superHash);
            } else {
                db.prepare(`INSERT INTO users (username, password, fullName, role, phone, mustChangePassword) VALUES (?, ?, ?, 'super', '555-0001', 1)`)
                    .run('super', superHash, 'Super Administrator');
            }

            // Ensure boss exists and has the correct password
            const bossExists = db.prepare(`SELECT id FROM users WHERE username = 'boss'`).get();
            if (bossExists) {
                db.prepare(`UPDATE users SET password = ?, fullName = 'Station Manager', phone = '555-0002',
                    active = 1, failedLoginAttempts = 0, lockedUntil = NULL, mustChangePassword = 1 WHERE username = 'boss'`)
                    .run(bossHash);
            } else {
                db.prepare(`INSERT INTO users (username, password, fullName, role, phone, mustChangePassword) VALUES (?, ?, ?, 'boss', '555-0002', 1)`)
                    .run('boss', bossHash, 'Station Manager');
            }
        })();

        addLog('System reset performed — all data wiped, default accounts restored', req.user.id, req.user.username, 'warn', { category: 'admin' });

        res.json({
            success: true,
            message: 'System reset complete. Default accounts (super/boss) have been restored.',
        });
    } catch (err) {
        console.error('[admin/reset] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Reset failed' });
    }
});

module.exports = router;
