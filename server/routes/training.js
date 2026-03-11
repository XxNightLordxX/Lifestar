/**
 * Training Records Routes
 * Track certifications, CEUs, and required training for all staff
 *
 * GET    /api/training            — list records (own for staff; all for boss+)
 * GET    /api/training/expiring   — records expiring in N days (boss+)
 * POST   /api/training            — add record (boss+ adds for anyone; staff adds their own)
 * PUT    /api/training/:id        — update (boss+)
 * DELETE /api/training/:id        — delete (boss+)
 *
 * @module routes/training
 */
'use strict';

const express = require('express');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config');

const router = express.Router();
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

/** GET /api/training */
router.get('/', authenticate, (req, res) => {
    try {
        const db = getDb();
        const isAdmin = ['super', 'boss'].includes(req.user.role);
        const userId  = isAdmin ? (req.query.userId ? parseInt(req.query.userId) : null) : req.user.id;

        let query = `
            SELECT t.*, u.fullName, u.role AS userRole
            FROM training_records t
            JOIN users u ON u.id = t.userId
            WHERE 1=1
        `;
        const params = [];

        if (userId) { query += ' AND t.userId = ?'; params.push(userId); }

        if (req.query.expiresBefore) {
            query += ' AND t.expiresAt <= ?';
            params.push(req.query.expiresBefore);
        }

        query += ' ORDER BY t.expiresAt ASC, t.completedAt DESC';

        res.json({ records: db.prepare(query).all(...params) });
    } catch (err) {
        console.error('[training/list]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to retrieve training records' });
    }
});

/** GET /api/training/expiring?days=30 — records expiring within N days */
router.get('/expiring', authenticate, authorize('super', 'boss'), (req, res) => {
    try {
        const db = getDb();
        const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + days);

        const records = db.prepare(`
            SELECT t.*, u.fullName, u.role AS userRole, u.phone
            FROM training_records t
            JOIN users u ON u.id = t.userId
            WHERE t.expiresAt IS NOT NULL AND t.expiresAt <= ? AND t.expiresAt >= date('now')
            ORDER BY t.expiresAt ASC
        `).all(cutoff.toISOString().split('T')[0]);

        res.json({ records, daysAhead: days, cutoffDate: cutoff.toISOString().split('T')[0] });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to retrieve expiring records' });
    }
});

/** POST /api/training */
router.post('/', authenticate, writeLimiter, (req, res) => {
    try {
        const { courseTitle, completedAt, expiresAt, certificationNumber, hours, notes, userId: targetUserId } = req.body;
        const isAdmin = ['super', 'boss'].includes(req.user.role);

        if (!courseTitle || courseTitle.trim().length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Course title is required' });
        }
        if (!completedAt || !/^\d{4}-\d{2}-\d{2}$/.test(completedAt)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Valid completedAt date (YYYY-MM-DD) required' });
        }

        const assignedUserId = (isAdmin && targetUserId) ? parseInt(targetUserId) : req.user.id;

        const db = getDb();
        const result = db.prepare(`
            INSERT INTO training_records (userId, courseTitle, completedAt, expiresAt, certificationNumber, hours, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            assignedUserId,
            courseTitle.trim().substring(0, 200),
            completedAt,
            (expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) ? expiresAt : null,
            (certificationNumber || '').substring(0, 100),
            parseFloat(hours) || 0,
            (notes || '').substring(0, 1000)
        );

        const record = db.prepare('SELECT * FROM training_records WHERE id = ?').get(result.lastInsertRowid);
        addLog(`Training record added: ${courseTitle}`, req.user.id, req.user.username);
        res.status(HTTP_STATUS.CREATED).json({ record, message: 'Training record added' });
    } catch (err) {
        console.error('[training/create]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to add training record' });
    }
});

/** PUT /api/training/:id */
router.put('/:id', authenticate, authorize('super', 'boss'), writeLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const record = db.prepare('SELECT * FROM training_records WHERE id = ?').get(id);
        if (!record) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Record not found' });

        const allowed = ['courseTitle', 'completedAt', 'expiresAt', 'certificationNumber', 'hours', 'notes'];
        const updates = {};
        for (const k of allowed) {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        }

        if (Object.keys(updates).length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No fields to update' });
        }

        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE training_records SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), id);

        res.json({ record: db.prepare('SELECT * FROM training_records WHERE id = ?').get(id), message: 'Record updated' });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to update record' });
    }
});

/** DELETE /api/training/:id */
router.delete('/:id', authenticate, authorize('super', 'boss'), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const record = db.prepare('SELECT * FROM training_records WHERE id = ?').get(id);
        if (!record) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Record not found' });

        db.prepare('DELETE FROM training_records WHERE id = ?').run(id);
        addLog(`Training record deleted: #${id}`, req.user.id, req.user.username);
        res.json({ message: 'Record deleted' });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to delete record' });
    }
});

module.exports = router;
