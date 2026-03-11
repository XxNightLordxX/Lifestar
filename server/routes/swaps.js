/**
 * Shift Swap Marketplace Routes
 *
 * GET    /api/swaps              — list open/active swaps
 * POST   /api/swaps              — post a swap request
 * GET    /api/swaps/:id          — get single swap
 * POST   /api/swaps/:id/accept   — accept/match a swap (another crew member)
 * PATCH  /api/swaps/:id/approve  — boss approves matched swap
 * PATCH  /api/swaps/:id/deny     — boss denies matched swap
 * DELETE /api/swaps/:id          — cancel own swap (if still open)
 *
 * @module routes/swaps
 */
'use strict';

const express = require('express');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config');

const router = express.Router();
const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });
const updateLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

// ─── HELPERS ────────────────────────────────────────────────────────────────

function validateDateStr(d) {
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

/** GET /api/swaps — list swaps visible to the user */
router.get('/', authenticate, (req, res) => {
    try {
        const db = getDb();
        const isAdmin = ['super', 'boss'].includes(req.user.role);

        const conditions = [];
        const params = [];

        if (!isAdmin) {
            conditions.push('(s.requesterId = ? OR s.targetId = ? OR s.status = \'open\')');
            params.push(req.user.id, req.user.id);
        }

        if (req.query.status) {
            conditions.push('s.status = ?');
            params.push(req.query.status);
        }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const rows = db.prepare(`
            SELECT s.*,
                   r.fullName AS requesterName, r.role AS requesterRole,
                   t.fullName AS targetName
            FROM shift_swaps s
            LEFT JOIN users r ON r.id = s.requesterId
            LEFT JOIN users t ON t.id = s.targetId
            ${where}
            ORDER BY s.createdAt DESC
            LIMIT 200
        `).all(...params);

        res.json({ swaps: rows });
    } catch (err) {
        console.error('[swaps/list]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to retrieve swaps' });
    }
});

/** POST /api/swaps — post a new swap request */
router.post('/', authenticate, createLimiter, (req, res) => {
    try {
        const { offerDate, wantDate, crewId, notes } = req.body;

        if (!validateDateStr(offerDate)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Valid offerDate (YYYY-MM-DD) required' });
        }

        const db = getDb();

        const result = db.prepare(`
            INSERT INTO shift_swaps (requesterId, crewId, offerDate, wantDate, notes)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            crewId ? parseInt(crewId) : null,
            offerDate,
            validateDateStr(wantDate) ? wantDate : null,
            (notes || '').substring(0, 500)
        );

        const swap = db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(result.lastInsertRowid);
        addLog(`Swap posted by ${req.user.username} for ${offerDate}`, req.user.id, req.user.username);

        res.status(HTTP_STATUS.CREATED).json({ swap, message: 'Swap request posted' });
    } catch (err) {
        console.error('[swaps/create]', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to create swap request' });
    }
});

/** GET /api/swaps/:id */
router.get('/:id', authenticate, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const swap = db.prepare(`
            SELECT s.*, r.fullName AS requesterName, t.fullName AS targetName
            FROM shift_swaps s
            LEFT JOIN users r ON r.id = s.requesterId
            LEFT JOIN users t ON t.id = s.targetId
            WHERE s.id = ?
        `).get(id);

        if (!swap) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Swap not found' });
        res.json({ swap });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to retrieve swap' });
    }
});

/** POST /api/swaps/:id/accept — a crew member volunteers to take the shift */
router.post('/:id/accept', authenticate, updateLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const swap = db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(id);

        if (!swap) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Swap not found' });
        if (swap.status !== 'open') return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Swap is no longer open' });
        if (swap.requesterId === req.user.id) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Cannot accept your own swap request' });
        }

        db.prepare(`
            UPDATE shift_swaps SET targetId = ?, status = 'matched', updatedAt = ? WHERE id = ?
        `).run(req.user.id, new Date().toISOString(), id);

        addLog(`Swap #${id} accepted by ${req.user.username}`, req.user.id, req.user.username);
        res.json({ message: 'Swap accepted — pending boss approval' });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to accept swap' });
    }
});

/** PATCH /api/swaps/:id/approve — boss approves */
router.patch('/:id/approve', authenticate, authorize('super', 'boss'), updateLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const swap = db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(id);

        if (!swap) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Swap not found' });
        if (swap.status !== 'matched') {
            return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Swap must be matched before approving' });
        }

        db.prepare(`
            UPDATE shift_swaps SET status = 'approved', reviewedBy = ?, reviewedAt = ?, updatedAt = ? WHERE id = ?
        `).run(req.user.id, new Date().toISOString(), new Date().toISOString(), id);

        addLog(`Swap #${id} approved`, req.user.id, req.user.username);
        res.json({ message: 'Swap approved' });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to approve swap' });
    }
});

/** PATCH /api/swaps/:id/deny — boss denies */
router.patch('/:id/deny', authenticate, authorize('super', 'boss'), updateLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const swap = db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(id);

        if (!swap) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Swap not found' });

        db.prepare(`
            UPDATE shift_swaps SET status = 'denied', reviewedBy = ?, reviewedAt = ?, updatedAt = ? WHERE id = ?
        `).run(req.user.id, new Date().toISOString(), new Date().toISOString(), id);

        addLog(`Swap #${id} denied`, req.user.id, req.user.username);
        res.json({ message: 'Swap denied' });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to deny swap' });
    }
});

/** DELETE /api/swaps/:id — cancel own open swap */
router.delete('/:id', authenticate, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db = getDb();
        const swap = db.prepare('SELECT * FROM shift_swaps WHERE id = ?').get(id);

        if (!swap) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Swap not found' });

        const isAdmin = ['super', 'boss'].includes(req.user.role);
        if (!isAdmin && swap.requesterId !== req.user.id) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Cannot cancel another user\'s swap' });
        }
        if (!['open', 'matched'].includes(swap.status)) {
            return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Cannot cancel a swap that is already approved/denied' });
        }

        db.prepare("UPDATE shift_swaps SET status = 'cancelled', updatedAt = ? WHERE id = ?")
            .run(new Date().toISOString(), id);

        addLog(`Swap #${id} cancelled`, req.user.id, req.user.username);
        res.json({ message: 'Swap cancelled' });
    } catch (err) {
        res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Failed to cancel swap' });
    }
});

module.exports = router;
