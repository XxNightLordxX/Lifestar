/**
 * Emergency Call-In Routes
 * Track who calls in sick and manage replacement coverage
 *
 * GET    /api/callins          — list call-ins (boss+: all; others: own)
 * POST   /api/callins          — report a call-in (any authenticated user)
 * PATCH  /api/callins/:id      — update status / assign replacement (boss+)
 * DELETE /api/callins/:id      — delete (boss+)
 *
 * @module routes/callins
 */
'use strict';

const express = require('express');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config');

const router = express.Router();
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });

/** GET /api/callins */
router.get('/', authenticate, (req, res) => {
    try {
        const db = getDb();
        const isAdmin = ['super', 'boss'].includes(req.user.role);

        const conditions = isAdmin ? [] : ['c.userId = ?'];
        const params = isAdmin ? [] : [req.user.id];

        if (req.query.status) { conditions.push('c.status = ?'); params.push(req.query.status); }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const rows = db.prepare(`
            SELECT c.*,
                   u.fullName AS userName,
                   r.fullName AS replacedByName
            FROM emergency_callins c
            LEFT JOIN users u ON u.id = c.userId
            LEFT JOIN users r ON r.id = c.replacedBy
            ${where}
            ORDER BY c.calledInAt DESC
            LIMIT 200
        `).all(...params);

        res.json({ callins: rows });
    } catch (err) {
        console.error('[callins/list]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to retrieve call-ins' });
    }
});

/** POST /api/callins */
router.post('/', authenticate, writeLimiter, (req, res) => {
    try {
        const { reason, crewId, calledInAt } = req.body;
        const ts = calledInAt || new Date().toISOString();

        const db = getDb();
        const result = db.prepare(`
            INSERT INTO emergency_callins (userId, crewId, reason, calledInAt)
            VALUES (?, ?, ?, ?)
        `).run(
            req.user.id,
            crewId ? parseInt(crewId) : null,
            (reason || '').substring(0, 500),
            ts
        );

        const callIn = db.prepare('SELECT * FROM emergency_callins WHERE id = ?').get(result.lastInsertRowid);
        addLog(`Call-in reported by ${req.user.username}`, req.user.id, req.user.username, 'warn', { category: 'callin' });

        res.status(HTTP_STATUS.CREATED).json({ callIn, message: 'Call-in recorded' });
    } catch (err) {
        console.error('[callins/create]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to record call-in' });
    }
});

/** PATCH /api/callins/:id — update coverage status */
router.patch('/:id', authenticate, authorize('super', 'boss'), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const callIn = db.prepare('SELECT * FROM emergency_callins WHERE id = ?').get(id);
        if (!callIn) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Call-in not found' });

        const VALID_STATUSES = ['open', 'covered', 'uncovered'];
        const { status, replacedBy } = req.body;

        const updates = {};
        if (status && VALID_STATUSES.includes(status)) updates.status = status;
        if (replacedBy !== undefined) updates.replacedBy = replacedBy ? parseInt(replacedBy) : null;

        if (Object.keys(updates).length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Provide status and/or replacedBy' });
        }

        const validColumns = new Set(['status', 'replacedBy']);
        const setClauses = Object.keys(updates).filter(k => validColumns.has(k)).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE emergency_callins SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), id);

        addLog(`Call-in #${id} updated to ${status}`, req.user.id, req.user.username);
        res.json({ message: 'Call-in updated', callIn: db.prepare('SELECT * FROM emergency_callins WHERE id = ?').get(id) });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to update call-in' });
    }
});

/** DELETE /api/callins/:id */
router.delete('/:id', authenticate, authorize('super', 'boss'), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        if (!db.prepare('SELECT id FROM emergency_callins WHERE id = ?').get(id)) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Call-in not found' });
        }

        db.prepare('DELETE FROM emergency_callins WHERE id = ?').run(id);
        res.json({ message: 'Call-in deleted' });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to delete call-in' });
    }
});

module.exports = router;
