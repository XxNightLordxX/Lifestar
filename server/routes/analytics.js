/**
 * Analytics Routes
 * Dashboard statistics, trends, and reporting data
 *
 * GET /api/analytics/overview    — top-level KPIs (boss+)
 * GET /api/analytics/schedules   — schedule coverage metrics (boss+)
 * GET /api/analytics/staff       — staff hours and utilization (boss+)
 * GET /api/analytics/incidents   — incident breakdown (boss+)
 * GET /api/analytics/timeoff     — time-off request trends (boss+)
 *
 * @module routes/analytics
 */
'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config');

const router = express.Router();
const analyticsLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

router.use(authenticate, authorize('super', 'boss'), analyticsLimiter);

// ─── OVERVIEW KPIs ───────────────────────────────────────────────────────────

router.get('/overview', (req, res) => {
    try {
        const db = getDb();

        const totalUsers      = db.prepare("SELECT COUNT(*) AS c FROM users WHERE active = 1").get().c;
        const totalSchedules  = db.prepare("SELECT COUNT(*) AS c FROM schedules").get().c;
        const publishedScheds = db.prepare("SELECT COUNT(*) AS c FROM schedules WHERE status = 'published'").get().c;
        const pendingTimeoff  = db.prepare("SELECT COUNT(*) AS c FROM timeoff_requests WHERE status = 'pending'").get().c;
        const openIncidents   = db.prepare("SELECT COUNT(*) AS c FROM incidents WHERE status NOT IN ('resolved','closed')").get().c;
        const criticalIncidents = db.prepare("SELECT COUNT(*) AS c FROM incidents WHERE priority = 'critical' AND status NOT IN ('resolved','closed')").get().c;
        const openSwaps       = db.prepare("SELECT COUNT(*) AS c FROM shift_swaps WHERE status = 'open'").get().c;
        const totalCrews      = db.prepare("SELECT COUNT(*) AS c FROM crews").get().c;
        const avgHours        = db.prepare("SELECT AVG(hoursWorked) AS avg FROM users WHERE active = 1").get().avg || 0;

        // Users by role
        const usersByRole = db.prepare(
            "SELECT role, COUNT(*) AS count FROM users WHERE active = 1 GROUP BY role"
        ).all();

        // Recent activity — last 7 days of logs
        const recentLogs = db.prepare(`
            SELECT message, username, level, createdAt
            FROM system_logs
            ORDER BY createdAt DESC
            LIMIT 10
        `).all();

        res.json({
            kpis: {
                totalUsers, totalSchedules, publishedSchedules: publishedScheds,
                pendingTimeoff, openIncidents, criticalIncidents,
                openSwaps, totalCrews, avgHoursWorked: Math.round(avgHours * 10) / 10
            },
            usersByRole,
            recentLogs
        });
    } catch (err) {
        console.error('[analytics/overview]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to load analytics' });
    }
});

// ─── SCHEDULE COVERAGE ───────────────────────────────────────────────────────

router.get('/schedules', (req, res) => {
    try {
        const db = getDb();

        const byStatus = db.prepare(
            "SELECT status, COUNT(*) AS count FROM schedules GROUP BY status"
        ).all();

        const byMonth = db.prepare(`
            SELECT month, year, COUNT(*) AS scheduleCount,
                   SUM(totalHours) AS totalHours
            FROM schedules
            GROUP BY year, month
            ORDER BY year DESC, month DESC
            LIMIT 12
        `).all();

        const crewsByShiftType = db.prepare(
            "SELECT shiftType, COUNT(*) AS count FROM crews GROUP BY shiftType ORDER BY count DESC"
        ).all();

        const crewsByCrewType = db.prepare(
            "SELECT crewType, COUNT(*) AS count FROM crews WHERE crewType != '' GROUP BY crewType ORDER BY count DESC"
        ).all();

        res.json({ byStatus, byMonth, crewsByShiftType, crewsByCrewType });
    } catch (err) {
        console.error('[analytics/schedules]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to load schedule analytics' });
    }
});

// ─── STAFF UTILIZATION ────────────────────────────────────────────────────────

router.get('/staff', (req, res) => {
    try {
        const db = getDb();

        const staffHours = db.prepare(`
            SELECT id, username, fullName, role, hoursWorked, bonusHours,
                   (hoursWorked + bonusHours) AS totalHours
            FROM users
            WHERE active = 1
            ORDER BY totalHours DESC
            LIMIT 50
        `).all();

        const hoursByRole = db.prepare(`
            SELECT role,
                   COUNT(*) AS staffCount,
                   SUM(hoursWorked) AS totalHours,
                   AVG(hoursWorked) AS avgHours
            FROM users WHERE active = 1
            GROUP BY role
        `).all();

        res.json({ staffHours, hoursByRole });
    } catch (err) {
        console.error('[analytics/staff]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to load staff analytics' });
    }
});

// ─── INCIDENT ANALYTICS ───────────────────────────────────────────────────────

router.get('/incidents', (req, res) => {
    try {
        const db = getDb();

        const byType     = db.prepare("SELECT type,     COUNT(*) AS count FROM incidents GROUP BY type").all();
        const byPriority = db.prepare("SELECT priority, COUNT(*) AS count FROM incidents GROUP BY priority ORDER BY count DESC").all();
        const byStatus   = db.prepare("SELECT status,   COUNT(*) AS count FROM incidents GROUP BY status").all();

        const recentCritical = db.prepare(`
            SELECT i.*, u.fullName AS reporterName
            FROM incidents i
            LEFT JOIN users u ON u.id = i.reportedBy
            WHERE i.priority = 'critical'
            ORDER BY i.createdAt DESC
            LIMIT 5
        `).all();

        res.json({ byType, byPriority, byStatus, recentCritical });
    } catch (err) {
        console.error('[analytics/incidents]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to load incident analytics' });
    }
});

// ─── TIME-OFF ANALYTICS ────────────────────────────────────────────────────────

router.get('/timeoff', (req, res) => {
    try {
        const db = getDb();

        const byStatus = db.prepare(
            "SELECT status, COUNT(*) AS count FROM timeoff_requests GROUP BY status"
        ).all();

        const byUser = db.prepare(`
            SELECT u.fullName, u.role, COUNT(t.id) AS requests,
                   SUM(CASE WHEN t.status = 'approved' THEN 1 ELSE 0 END) AS approved
            FROM timeoff_requests t
            JOIN users u ON u.id = t.userId
            GROUP BY t.userId
            ORDER BY requests DESC
            LIMIT 20
        `).all();

        const pending = db.prepare(`
            SELECT t.*, u.fullName, u.role
            FROM timeoff_requests t
            JOIN users u ON u.id = t.userId
            WHERE t.status = 'pending'
            ORDER BY t.createdAt ASC
        `).all();

        res.json({ byStatus, byUser, pending });
    } catch (err) {
        console.error('[analytics/timeoff]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to load time-off analytics' });
    }
});

module.exports = router;
