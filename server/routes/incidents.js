/**
 * Incident Reports Routes
 *
 * Full CRUD for incident reports with role-based access:
 *   - Paramedics / EMTs: create reports, view their own
 *   - Boss: view all reports, update status
 *   - Super: full access including delete
 *
 * POST   /api/incidents           — Create report (any authenticated user)
 * GET    /api/incidents           — List reports (boss/super see all; others see own)
 * GET    /api/incidents/:id       — Get single report
 * PATCH  /api/incidents/:id       — Update report (super/boss, or owner if still open)
 * PATCH  /api/incidents/:id/status — Update status only (boss/super)
 * DELETE /api/incidents/:id       — Delete report (super only)
 *
 * @module routes/incidents
 */

'use strict';

const express = require('express');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize, requireMinRole } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { INCIDENTS, HTTP_STATUS, RATE_LIMIT } = require('../config');

const router = express.Router();

// ============================================
// RATE LIMITING
// ============================================

const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    message: { error: 'Too many incident reports created', retryAfter: 3600 }
});

const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests', retryAfter: 60 }
});

// ============================================
// ENSURE TABLE EXISTS
// ============================================
// The incidents table is created here if it wasn't in the initial migration,
// so the route works even on databases created before this feature was added.

function ensureIncidentsTable() {
    try {
        const db = getDb();
        db.exec(`
            CREATE TABLE IF NOT EXISTS incident_reports (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT    NOT NULL,
                type        TEXT    NOT NULL CHECK(type IN ('patient-care','vehicle','workplace','equipment','other')),
                priority    TEXT    NOT NULL DEFAULT 'medium'
                                    CHECK(priority IN ('low','medium','high','critical')),
                status      TEXT    NOT NULL DEFAULT 'open'
                                    CHECK(status IN ('open','under-review','resolved','closed')),
                description TEXT    NOT NULL,
                location    TEXT    DEFAULT '',
                involvedStaff TEXT  DEFAULT '[]',
                reportedBy  INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
                assignedTo  INTEGER REFERENCES users(id) ON DELETE SET NULL,
                resolvedAt  TEXT,
                createdAt   TEXT    DEFAULT (datetime('now')),
                updatedAt   TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_incidents_reportedBy ON incident_reports(reportedBy);
            CREATE INDEX IF NOT EXISTS idx_incidents_status     ON incident_reports(status);
            CREATE INDEX IF NOT EXISTS idx_incidents_priority   ON incident_reports(priority);
            CREATE INDEX IF NOT EXISTS idx_incidents_createdAt  ON incident_reports(createdAt);
        `);
    } catch (err) {
        console.error('[incidents] Failed to ensure table:', err.message);
    }
}

ensureIncidentsTable();

// ============================================
// INPUT VALIDATION
// ============================================

function validateReport(body, isUpdate = false) {
    const errors = [];

    if (!isUpdate || body.title !== undefined) {
        if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
            errors.push('Title is required');
        } else if (body.title.trim().length > INCIDENTS.MAX_TITLE) {
            errors.push(`Title must be under ${INCIDENTS.MAX_TITLE} characters`);
        }
    }

    if (!isUpdate || body.type !== undefined) {
        if (!INCIDENTS.VALID_TYPES.includes(body.type)) {
            errors.push(`Type must be one of: ${INCIDENTS.VALID_TYPES.join(', ')}`);
        }
    }

    if (body.priority !== undefined && !INCIDENTS.VALID_PRIORITIES.includes(body.priority)) {
        errors.push(`Priority must be one of: ${INCIDENTS.VALID_PRIORITIES.join(', ')}`);
    }

    if (body.status !== undefined && !INCIDENTS.VALID_STATUSES.includes(body.status)) {
        errors.push(`Status must be one of: ${INCIDENTS.VALID_STATUSES.join(', ')}`);
    }

    if (!isUpdate || body.description !== undefined) {
        if (!body.description || typeof body.description !== 'string' || !body.description.trim()) {
            errors.push('Description is required');
        } else if (body.description.trim().length > INCIDENTS.MAX_DESCRIPTION) {
            errors.push(`Description must be under ${INCIDENTS.MAX_DESCRIPTION} characters`);
        }
    }

    return errors;
}

function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '');
}

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/incidents
 * Create a new incident report.
 */
router.post('/', authenticate, createLimiter, async (req, res) => {
    try {
        const errors = validateReport(req.body, false);
        if (errors.length) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Validation failed', details: errors });
        }

        const db = getDb();

        // Validate assignedTo user exists if provided
        if (req.body.assignedTo) {
            const assignee = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(req.body.assignedTo);
            if (!assignee) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Assigned user not found' });
            }
        }

        const stmt = db.prepare(`
            INSERT INTO incident_reports
                (title, type, priority, description, location, involvedStaff, reportedBy, assignedTo, createdAt, updatedAt)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const result = stmt.run(
            sanitizeString(req.body.title),
            req.body.type,
            req.body.priority || 'medium',
            sanitizeString(req.body.description),
            sanitizeString(req.body.location || ''),
            JSON.stringify(Array.isArray(req.body.involvedStaff) ? req.body.involvedStaff : []),
            req.user.id,
            req.body.assignedTo || null
        );

        const created = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(result.lastInsertRowid);

        addLog(`Incident report created: "${created.title}" (#${created.id})`, req.user.id, req.user.username);

        return res.status(HTTP_STATUS.CREATED).json({ success: true, incident: _format(created) });
    } catch (err) {
        console.error('[incidents/create]', err.message);
        return res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Server error' });
    }
});

/**
 * GET /api/incidents
 * Boss/Super see all reports; others see only their own.
 * Supports filtering by status, type, priority, and pagination.
 */
router.get('/', authenticate, readLimiter, (req, res) => {
    try {
        const db   = getDb();
        const role = req.user.role;
        const isManager = role === 'super' || role === 'boss';

        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        // Build dynamic WHERE clauses
        const where  = [];
        const params = [];

        if (!isManager) {
            where.push('i.reportedBy = ?');
            params.push(req.user.id);
        }
        if (req.query.status && INCIDENTS.VALID_STATUSES.includes(req.query.status)) {
            where.push('i.status = ?');
            params.push(req.query.status);
        }
        if (req.query.type && INCIDENTS.VALID_TYPES.includes(req.query.type)) {
            where.push('i.type = ?');
            params.push(req.query.type);
        }
        if (req.query.priority && INCIDENTS.VALID_PRIORITIES.includes(req.query.priority)) {
            where.push('i.priority = ?');
            params.push(req.query.priority);
        }

        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

        const rows = db.prepare(`
            SELECT
                i.*,
                u.fullName  AS reporterName,
                u.username  AS reporterUsername,
                a.fullName  AS assigneeName
            FROM incident_reports i
            LEFT JOIN users u ON u.id = i.reportedBy
            LEFT JOIN users a ON a.id = i.assignedTo
            ${whereSQL}
            ORDER BY
                CASE i.priority
                    WHEN 'critical' THEN 1
                    WHEN 'high'     THEN 2
                    WHEN 'medium'   THEN 3
                    WHEN 'low'      THEN 4
                END,
                i.createdAt DESC
            LIMIT ? OFFSET ?
        `).all([...params, limit, offset]);

        const totalRow = db.prepare(`
            SELECT COUNT(*) AS total FROM incident_reports i ${whereSQL}
        `).get(params);

        return res.json({
            success: true,
            incidents: rows.map(_format),
            pagination: {
                page,
                limit,
                total: totalRow.total,
                pages: Math.ceil(totalRow.total / limit)
            }
        });
    } catch (err) {
        console.error('[incidents/list]', err.message);
        return res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Server error' });
    }
});

/**
 * GET /api/incidents/:id
 * Get a single report. Owner or manager only.
 */
router.get('/:id', authenticate, readLimiter, (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid ID' });

        const incident = db.prepare(`
            SELECT i.*, u.fullName AS reporterName, a.fullName AS assigneeName
            FROM incident_reports i
            LEFT JOIN users u ON u.id = i.reportedBy
            LEFT JOIN users a ON a.id = i.assignedTo
            WHERE i.id = ?
        `).get(id);

        if (!incident) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Report not found' });

        const isManager = req.user.role === 'super' || req.user.role === 'boss';
        if (!isManager && incident.reportedBy !== req.user.id) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Access denied' });
        }

        return res.json({ success: true, incident: _format(incident) });
    } catch (err) {
        console.error('[incidents/get]', err.message);
        return res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/incidents/:id
 * Update a report. Owner can edit while status is 'open'; managers can edit anytime.
 */
router.patch('/:id', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid ID' });

        const incident = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(id);
        if (!incident) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Report not found' });

        const isManager = req.user.role === 'super' || req.user.role === 'boss';
        const isOwner   = incident.reportedBy === req.user.id;

        if (!isManager && !isOwner) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Access denied' });
        }
        if (!isManager && isOwner && incident.status !== 'open') {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Cannot edit a report that is no longer open' });
        }

        const errors = validateReport(req.body, true);
        if (errors.length) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Validation failed', details: errors });
        }

        const fields = [];
        const values = [];

        const allowed = ['title', 'type', 'priority', 'description', 'location', 'status', 'assignedTo'];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(key === 'title' || key === 'description' || key === 'location'
                    ? sanitizeString(req.body[key])
                    : req.body[key]);
            }
        }

        if (req.body.involvedStaff !== undefined) {
            fields.push('involvedStaff = ?');
            values.push(JSON.stringify(Array.isArray(req.body.involvedStaff) ? req.body.involvedStaff : []));
        }

        // Auto-set resolvedAt when status moves to resolved/closed
        if (req.body.status === 'resolved' || req.body.status === 'closed') {
            if (!incident.resolvedAt) {
                fields.push("resolvedAt = datetime('now')");
            }
        }

        if (!fields.length) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No fields to update' });
        }

        fields.push("updatedAt = datetime('now')");
        values.push(id);

        db.prepare(`UPDATE incident_reports SET ${fields.join(', ')} WHERE id = ?`).run(values);

        const updated = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(id);
        addLog(`Incident #${id} updated by ${req.user.username}`, req.user.id, req.user.username);

        return res.json({ success: true, incident: _format(updated) });
    } catch (err) {
        console.error('[incidents/update]', err.message);
        return res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/incidents/:id/status
 * Update status only (boss/super).
 */
router.patch('/:id/status', authenticate, requireMinRole('boss'), (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid ID' });

        if (!INCIDENTS.VALID_STATUSES.includes(req.body.status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                error: `Status must be one of: ${INCIDENTS.VALID_STATUSES.join(', ')}`
            });
        }

        const incident = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(id);
        if (!incident) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Report not found' });

        const shouldSetResolved = (req.body.status === 'resolved' || req.body.status === 'closed') && !incident.resolvedAt;

        if (shouldSetResolved) {
            db.prepare(`
                UPDATE incident_reports
                SET status = ?, resolvedAt = datetime('now'), updatedAt = datetime('now')
                WHERE id = ?
            `).run(req.body.status, id);
        } else {
            db.prepare(`
                UPDATE incident_reports
                SET status = ?, updatedAt = datetime('now')
                WHERE id = ?
            `).run(req.body.status, id);
        }

        addLog(`Incident #${id} status → ${req.body.status} by ${req.user.username}`, req.user.id, req.user.username);

        return res.json({ success: true, message: `Status updated to ${req.body.status}` });
    } catch (err) {
        console.error('[incidents/status]', err.message);
        return res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/incidents/:id
 * Hard delete (super admin only).
 */
router.delete('/:id', authenticate, authorize('super'), (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid ID' });

        const incident = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(id);
        if (!incident) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Report not found' });

        db.prepare('DELETE FROM incident_reports WHERE id = ?').run(id);
        addLog(`Incident #${id} deleted by ${req.user.username}`, req.user.id, req.user.username);

        return res.json({ success: true, message: 'Report deleted' });
    } catch (err) {
        console.error('[incidents/delete]', err.message);
        return res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Server error' });
    }
});

// ============================================
// STATS ENDPOINT
// ============================================

/**
 * GET /api/incidents/stats
 * Summary counts by status and priority (boss/super).
 */
router.get('/stats/summary', authenticate, requireMinRole('boss'), (req, res) => {
    try {
        const db = getDb();

        const byStatus = db.prepare(`
            SELECT status, COUNT(*) as count FROM incident_reports GROUP BY status
        `).all();

        const byPriority = db.prepare(`
            SELECT priority, COUNT(*) as count FROM incident_reports GROUP BY priority
        `).all();

        const byType = db.prepare(`
            SELECT type, COUNT(*) as count FROM incident_reports GROUP BY type
        `).all();

        const recent = db.prepare(`
            SELECT i.*, u.fullName AS reporterName
            FROM incident_reports i
            LEFT JOIN users u ON u.id = i.reportedBy
            WHERE i.status IN ('open','under-review')
            ORDER BY
                CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
                i.createdAt DESC
            LIMIT 5
        `).all();

        return res.json({
            success: true,
            stats: { byStatus, byPriority, byType },
            recentOpen: recent.map(_format)
        });
    } catch (err) {
        console.error('[incidents/stats]', err.message);
        return res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Server error' });
    }
});

// ============================================
// INTERNAL HELPERS
// ============================================

function _format(row) {
    if (!row) return null;
    return {
        id:            row.id,
        title:         row.title,
        type:          row.type,
        priority:      row.priority,
        status:        row.status,
        description:   row.description,
        location:      row.location,
        involvedStaff: (() => { try { return JSON.parse(row.involvedStaff || '[]'); } catch (e) { return []; } })(),
        reportedBy:    row.reportedBy,
        reporterName:  row.reporterName || null,
        reporterUsername: row.reporterUsername || null,
        assignedTo:    row.assignedTo,
        assigneeName:  row.assigneeName || null,
        resolvedAt:    row.resolvedAt,
        createdAt:     row.createdAt,
        updatedAt:     row.updatedAt,
    };
}

module.exports = router;
