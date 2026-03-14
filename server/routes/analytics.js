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
        const openIncidents   = db.prepare("SELECT COUNT(*) AS c FROM incident_reports WHERE status NOT IN ('resolved','closed')").get().c;
        const criticalIncidents = db.prepare("SELECT COUNT(*) AS c FROM incident_reports WHERE priority = 'critical' AND status NOT IN ('resolved','closed')").get().c;
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

        const byType     = db.prepare("SELECT type,     COUNT(*) AS count FROM incident_reports GROUP BY type").all();
        const byPriority = db.prepare("SELECT priority, COUNT(*) AS count FROM incident_reports GROUP BY priority ORDER BY count DESC").all();
        const byStatus   = db.prepare("SELECT status,   COUNT(*) AS count FROM incident_reports GROUP BY status").all();

        const recentCritical = db.prepare(`
            SELECT i.*, u.fullName AS reporterName
            FROM incident_reports i
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

// ─── OVERTIME & COMPLIANCE ANALYTICS ────────────────────────────────────────

router.get('/overtime', (req, res) => {
    try {
        const db = getDb();

        // Staff approaching or exceeding 160-hour monthly cap
        const MONTHLY_CAP = 160;
        const APPROACHING_THRESHOLD = MONTHLY_CAP * 0.85;
        const overtimeStaff = db.prepare(`
            SELECT id, username, fullName, role, hoursWorked, bonusHours,
                   (hoursWorked + bonusHours) AS totalHours,
                   CASE
                       WHEN (hoursWorked + bonusHours) >= ? THEN 'exceeded'
                       WHEN (hoursWorked + bonusHours) >= ? THEN 'approaching'
                       ELSE 'normal'
                   END AS overtimeStatus
            FROM users
            WHERE active = 1
            ORDER BY totalHours DESC
        `).all(MONTHLY_CAP, APPROACHING_THRESHOLD);

        const exceededCount = overtimeStaff.filter(s => s.overtimeStatus === 'exceeded').length;
        const approachingCount = overtimeStaff.filter(s => s.overtimeStatus === 'approaching').length;

        res.json({
            monthlyCap: MONTHLY_CAP,
            exceeded: exceededCount,
            approaching: approachingCount,
            normal: overtimeStaff.length - exceededCount - approachingCount,
            staff: overtimeStaff
        });
    } catch (err) {
        console.error('[analytics/overtime]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to load overtime analytics' });
    }
});

// ─── SCHEDULE HEALTH CHECK ───────────────────────────────────────────────────

router.get('/schedule-health', (req, res) => {
    try {
        const db = getDb();
        const scheduleId = req.query.scheduleId ? parseInt(req.query.scheduleId) : null;

        const issues = [];

        // Get published schedules or a specific one
        const scheduleCondition = scheduleId ? 'AND s.id = ?' : "AND s.status = 'published'";
        const scheduleParams = scheduleId ? [scheduleId] : [];

        const schedules = db.prepare(`
            SELECT s.*,
                   (SELECT COUNT(*) FROM crews WHERE scheduleId = s.id) AS crewCount
            FROM schedules s
            WHERE 1=1 ${scheduleCondition}
            ORDER BY s.year DESC, s.month DESC
            LIMIT 10
        `).all(...scheduleParams);

        for (const schedule of schedules) {
            // Check for schedules with zero crews
            if (schedule.crewCount === 0) {
                issues.push({
                    type: 'empty_schedule',
                    severity: 'high',
                    scheduleId: schedule.id,
                    scheduleName: schedule.name,
                    message: `Schedule "${schedule.name}" has no crew assignments`
                });
            }

            // Check for crews with missing staff assignments
            const emptyCrews = db.prepare(`
                SELECT id, rig, shiftType, date
                FROM crews
                WHERE scheduleId = ?
                  AND (paramedic IS NULL OR paramedic = '')
                  AND (emt IS NULL OR emt = '')
            `).all(schedule.id);

            for (const crew of emptyCrews) {
                issues.push({
                    type: 'unstaffed_crew',
                    severity: 'high',
                    scheduleId: schedule.id,
                    crewId: crew.id,
                    message: `Crew "${crew.rig || crew.shiftType}" on ${crew.date || 'unknown date'} has no staff assigned`
                });
            }

            // Check for staff working more than 24 hours without rest
            const staffDoubled = db.prepare(`
                SELECT paramedic, COUNT(*) AS shiftCount
                FROM crews
                WHERE scheduleId = ? AND paramedic IS NOT NULL AND paramedic != ''
                GROUP BY paramedic, date
                HAVING COUNT(*) > 1
            `).all(schedule.id);

            for (const s of staffDoubled) {
                issues.push({
                    type: 'double_booked',
                    severity: 'critical',
                    scheduleId: schedule.id,
                    staffName: s.paramedic,
                    message: `${s.paramedic} is double-booked with ${s.shiftCount} shifts on the same date`
                });
            }
        }

        // Check for approved time-off conflicts with published schedules
        const timeoffConflicts = db.prepare(`
            SELECT t.id AS timeoffId, t.startDate, t.endDate,
                   u.fullName, u.username,
                   c.id AS crewId, c.date AS shiftDate, s.name AS scheduleName
            FROM timeoff_requests t
            JOIN users u ON u.id = t.userId
            JOIN crews c ON (c.paramedic = u.fullName OR c.emt = u.fullName)
            JOIN schedules s ON s.id = c.scheduleId AND s.status = 'published'
            WHERE t.status = 'approved'
              AND c.date BETWEEN t.startDate AND t.endDate
            LIMIT 20
        `).all();

        for (const conflict of timeoffConflicts) {
            issues.push({
                type: 'timeoff_conflict',
                severity: 'critical',
                message: `${conflict.fullName} is scheduled on ${conflict.shiftDate} in "${conflict.scheduleName}" but has approved time-off (${conflict.startDate} to ${conflict.endDate})`
            });
        }

        // Sort by severity
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        issues.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

        res.json({
            healthy: issues.length === 0,
            issueCount: issues.length,
            critical: issues.filter(i => i.severity === 'critical').length,
            high: issues.filter(i => i.severity === 'high').length,
            issues,
            schedulesChecked: schedules.length
        });
    } catch (err) {
        console.error('[analytics/schedule-health]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to run schedule health check' });
    }
});

// ─── DASHBOARD SUMMARY COUNTS ───────────────────────────────────────────────

router.get('/dashboard-counts', (req, res) => {
    try {
        const db = getDb();

        const counts = {
            pendingTimeoff: 0,
            openSwaps: 0,
            openCallins: 0,
            openIncidents: 0,
            expiringTraining: 0,
            publishedSchedules: 0,
            activeStaff: 0
        };

        try { counts.pendingTimeoff = db.prepare("SELECT COUNT(*) AS c FROM timeoff_requests WHERE status = 'pending'").get().c; } catch(_) {}
        try { counts.openSwaps = db.prepare("SELECT COUNT(*) AS c FROM shift_swaps WHERE status = 'open'").get().c; } catch(_) {}
        try { counts.openCallins = db.prepare("SELECT COUNT(*) AS c FROM emergency_callins WHERE status = 'open'").get().c; } catch(_) {}
        try { counts.openIncidents = db.prepare("SELECT COUNT(*) AS c FROM incident_reports WHERE status NOT IN ('resolved','closed')").get().c; } catch(_) {}
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() + 30);
            counts.expiringTraining = db.prepare("SELECT COUNT(*) AS c FROM training_records WHERE expiresAt IS NOT NULL AND expiresAt <= ? AND expiresAt >= date('now')").get(cutoff.toISOString().split('T')[0]).c;
        } catch(_) {}
        try { counts.publishedSchedules = db.prepare("SELECT COUNT(*) AS c FROM schedules WHERE status = 'published'").get().c; } catch(_) {}
        try { counts.activeStaff = db.prepare("SELECT COUNT(*) AS c FROM users WHERE active = 1 AND role IN ('paramedic','emt')").get().c; } catch(_) {}

        res.json({ success: true, counts });
    } catch (err) {
        console.error('[analytics/dashboard-counts]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to load dashboard counts' });
    }
});

module.exports = router;
