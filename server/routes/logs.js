/**
 * System Logs & Notifications Routes
 * Secure logging and notification management with comprehensive validation
 * 
 * GET /api/logs — List system logs (admin)
 * GET /api/logs/export — Export logs (admin)
 * GET /api/notifications — List notifications for current user
 * PUT /api/notifications/:id/read — Mark notification as read
 * PUT /api/notifications/read-all — Mark all notifications as read
 * DELETE /api/notifications/:id — Delete a notification
 * 
 * @module routes/logs
 */

const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // Pagination
    MAX_LOGS_PER_REQUEST: 500,
    DEFAULT_LOG_LIMIT: 100,
    MAX_NOTIFICATIONS: 100,
    
    // Export limits
    MAX_EXPORT_ROWS: 10000,
    
    // Valid log types
    VALID_LOG_TYPES: ['info', 'warning', 'error', 'audit', 'security'],
    
    // HTTP Status codes
    HTTP_STATUS: {
        OK: 200,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        TOO_MANY_REQUESTS: 429,
        SERVER_ERROR: 500
    }
};

// ============================================
// RATE LIMITING
// ============================================

const logsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: { error: 'Too many requests', retryAfter: 60 }
});

const exportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 exports per hour
    message: { error: 'Too many export requests', retryAfter: 3600 }
});

// ============================================
// INPUT VALIDATION
// ============================================

/**
 * Sanitize string input
 * @param {string} input - Input string
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeString(input, maxLength = 1000) {
    if (!input || typeof input !== 'string') return '';
    return input.trim().substring(0, maxLength);
}

/**
 * Validate pagination limit
 * @param {string} limit - Limit value
 * @param {number} max - Maximum allowed value
 * @param {number} defaultVal - Default value
 * @returns {number} Validated limit
 */
function validateLimit(limit, max = CONSTANTS.MAX_LOGS_PER_REQUEST, defaultVal = CONSTANTS.DEFAULT_LOG_LIMIT) {
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed < 1) return defaultVal;
    return Math.min(parsed, max);
}

/**
 * Validate notification ID
 * @param {string} id - Notification ID
 * @returns {Object} Validation result
 */
function validateNotificationId(id) {
    const errors = [];
    
    if (!id) {
        errors.push('Notification ID is required');
        return { valid: false, errors, value: null };
    }
    
    const parsed = parseInt(id, 10);
    
    if (isNaN(parsed) || parsed < 1) {
        errors.push('Notification ID must be a positive integer');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: parsed
    };
}

/**
 * Validate date filter
 * @param {string} dateStr - Date string
 * @param {string} fieldName - Field name
 * @returns {Object} Validation result
 */
function validateDateFilter(dateStr, fieldName = 'Date') {
    if (!dateStr) {
        return { valid: true, errors: [], value: null };
    }
    
    const errors = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (!dateRegex.test(dateStr)) {
        errors.push(`${fieldName} must be in YYYY-MM-DD format`);
        return { valid: false, errors, value: null };
    }
    
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) {
        errors.push(`Invalid ${fieldName.toLowerCase()}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: dateStr
    };
}

/**
 * Validate log type
 * @param {string} type - Log type
 * @returns {Object} Validation result
 */
function validateLogType(type) {
    if (!type) {
        return { valid: true, errors: [], value: null };
    }
    
    const errors = [];
    const trimmed = type.trim().toLowerCase();
    
    if (!CONSTANTS.VALID_LOG_TYPES.includes(trimmed)) {
        errors.push(`Log type must be one of: ${CONSTANTS.VALID_LOG_TYPES.join(', ')}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate user ID filter
 * @param {string} userId - User ID
 * @returns {Object} Validation result
 */
function validateUserIdFilter(userId) {
    if (!userId) {
        return { valid: true, errors: [], value: null };
    }
    
    const errors = [];
    const parsed = parseInt(userId, 10);
    
    if (isNaN(parsed) || parsed < 1) {
        errors.push('User ID must be a positive integer');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: parsed
    };
}

/**
 * Sanitize log object for response
 * @param {Object} log - Log object
 * @returns {Object} Sanitized log object
 */
function sanitizeLog(log) {
    if (!log) return null;
    
    return {
        id: log.id,
        message: log.message || '',
        type: log.type || 'info',
        userId: log.userId || null,
        username: log.username || null,
        ipAddress: log.ipAddress || null,
        userAgent: log.userAgent || null,
        createdAt: log.createdAt
    };
}

/**
 * Sanitize notification object for response
 * @param {Object} notification - Notification object
 * @returns {Object} Sanitized notification object
 */
function sanitizeNotification(notification) {
    if (!notification) return null;
    
    return {
        id: notification.id,
        userId: notification.userId,
        title: notification.title || '',
        message: notification.message || '',
        type: notification.type || 'info',
        read: notification.read === 1 || notification.read === true,
        link: notification.link || null,
        createdAt: notification.createdAt
    };
}

// ============================================
// LOGS ROUTES
// ============================================

/**
 * GET /api/logs
 * List system logs with filtering and pagination (admin only)
 */
router.get('/', authenticate, authorize('super'), logsLimiter, async (req, res) => {
    try {
        const db = getDb();
        const { limit, offset, type, userId, startDate, endDate, search } = req.query;
        
        // Validate pagination
        const validLimit = validateLimit(limit, CONSTANTS.MAX_LOGS_PER_REQUEST, CONSTANTS.DEFAULT_LOG_LIMIT);
        const validOffset = Math.max(parseInt(offset) || 0, 0);
        
        // Build query
        let sql = 'SELECT * FROM system_logs WHERE 1=1';
        const params = [];
        
        // Type filter
        if (type) {
            const typeValidation = validateLogType(type);
            if (typeValidation.valid && typeValidation.value) {
                sql += ' AND type = ?';
                params.push(typeValidation.value);
            }
        }
        
        // User filter
        if (userId) {
            const userIdValidation = validateUserIdFilter(userId);
            if (userIdValidation.valid && userIdValidation.value) {
                sql += ' AND userId = ?';
                params.push(userIdValidation.value);
            }
        }
        
        // Date range filters
        if (startDate) {
            const startValidation = validateDateFilter(startDate, 'Start date');
            if (startValidation.valid && startValidation.value) {
                sql += ' AND date(createdAt) >= ?';
                params.push(startValidation.value);
            }
        }
        
        if (endDate) {
            const endValidation = validateDateFilter(endDate, 'End date');
            if (endValidation.valid && endValidation.value) {
                sql += ' AND date(createdAt) <= ?';
                params.push(endValidation.value);
            }
        }
        
        // Search in message
        if (search && typeof search === 'string') {
            const searchSanitized = sanitizeString(search, 100);
            sql += ' AND message LIKE ?';
            params.push(`%${searchSanitized}%`);
        }
        
        // Add pagination
        sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
        params.push(validLimit, validOffset);
        
        const logs = db.prepare(sql).all(...params);
        
        // Get total count
        let countSql = 'SELECT COUNT(*) as total FROM system_logs WHERE 1=1';
        const countParams = params.slice(0, params.length - 2);
        const { total } = db.prepare(countSql).get(...countParams);
        
        res.json({
            logs: logs.map(sanitizeLog),
            pagination: {
                limit: validLimit,
                offset: validOffset,
                total,
                hasMore: validOffset + validLimit < total
            }
        });
    } catch (err) {
        console.error('[logs/list] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve logs',
            code: 'LOGS_LIST_ERROR'
        });
    }
});

/**
 * GET /api/logs/export
 * Export logs as JSON or CSV (admin only)
 */
router.get('/export', authenticate, authorize('super'), exportLimiter, async (req, res) => {
    try {
        const db = getDb();
        const { format, type, startDate, endDate } = req.query;
        
        // Build query
        let sql = 'SELECT * FROM system_logs WHERE 1=1';
        const params = [];
        
        // Type filter
        if (type) {
            const typeValidation = validateLogType(type);
            if (typeValidation.valid && typeValidation.value) {
                sql += ' AND type = ?';
                params.push(typeValidation.value);
            }
        }
        
        // Date range filters
        if (startDate) {
            const startValidation = validateDateFilter(startDate, 'Start date');
            if (startValidation.valid && startValidation.value) {
                sql += ' AND date(createdAt) >= ?';
                params.push(startValidation.value);
            }
        }
        
        if (endDate) {
            const endValidation = validateDateFilter(endDate, 'End date');
            if (endValidation.valid && endValidation.value) {
                sql += ' AND date(createdAt) <= ?';
                params.push(endValidation.value);
            }
        }
        
        sql += ' ORDER BY createdAt DESC LIMIT ?';
        params.push(CONSTANTS.MAX_EXPORT_ROWS);
        
        const logs = db.prepare(sql).all(...params);
        
        // Export format
        if (format === 'csv') {
            const header = 'id,message,type,userId,username,ipAddress,createdAt\n';
            const rows = logs.map(log => 
                `"${log.id}","${(log.message || '').replace(/"/g, '""')}","${log.type || ''}","${log.userId || ''}","${log.username || ''}","${log.ipAddress || ''}","${log.createdAt || ''}"`
            ).join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="system_logs.csv"');
            res.send(header + rows);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="system_logs.json"');
            res.json({
                exportedAt: new Date().toISOString(),
                totalRecords: logs.length,
                logs: logs.map(sanitizeLog)
            });
        }
    } catch (err) {
        console.error('[logs/export] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to export logs',
            code: 'LOGS_EXPORT_ERROR'
        });
    }
});

/**
 * GET /api/logs/stats
 * Get log statistics (admin only)
 */
router.get('/stats', authenticate, authorize('super'), async (req, res) => {
    try {
        const db = getDb();
        const { startDate, endDate } = req.query;
        
        // Build base conditions
        let dateCondition = '';
        const params = [];
        
        if (startDate) {
            const startValidation = validateDateFilter(startDate, 'Start date');
            if (startValidation.valid && startValidation.value) {
                dateCondition += ' AND date(createdAt) >= ?';
                params.push(startValidation.value);
            }
        }
        
        if (endDate) {
            const endValidation = validateDateFilter(endDate, 'End date');
            if (endValidation.valid && endValidation.value) {
                dateCondition += ' AND date(createdAt) <= ?';
                params.push(endValidation.value);
            }
        }
        
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN type = 'info' THEN 1 ELSE 0 END) as info,
                SUM(CASE WHEN type = 'warning' THEN 1 ELSE 0 END) as warning,
                SUM(CASE WHEN type = 'error' THEN 1 ELSE 0 END) as error,
                SUM(CASE WHEN type = 'audit' THEN 1 ELSE 0 END) as audit,
                SUM(CASE WHEN type = 'security' THEN 1 ELSE 0 END) as security
            FROM system_logs
            WHERE 1=1 ${dateCondition}
        `).get(...params);
        
        res.json({
            summary: {
                total: stats.total || 0,
                info: stats.info || 0,
                warning: stats.warning || 0,
                error: stats.error || 0,
                audit: stats.audit || 0,
                security: stats.security || 0
            }
        });
    } catch (err) {
        console.error('[logs/stats] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve log statistics',
            code: 'LOGS_STATS_ERROR'
        });
    }
});

// ============================================
// NOTIFICATIONS ROUTES
// ============================================

/**
 * GET /api/logs/notifications
 * List notifications for current user
 */
router.get('/notifications', authenticate, logsLimiter, async (req, res) => {
    try {
        const db = getDb();
        const { limit, unreadOnly } = req.query;
        
        const validLimit = validateLimit(limit, CONSTANTS.MAX_NOTIFICATIONS, 50);
        
        let sql = 'SELECT * FROM notifications WHERE userId = ?';
        const params = [req.user.id];
        
        if (unreadOnly === 'true') {
            sql += ' AND read = 0';
        }
        
        sql += ' ORDER BY createdAt DESC LIMIT ?';
        params.push(validLimit);
        
        const notifications = db.prepare(sql).all(...params);
        
        // Get unread count
        const { unreadCount } = db.prepare('SELECT COUNT(*) as unreadCount FROM notifications WHERE userId = ? AND read = 0').get(req.user.id);
        
        res.json({
            notifications: notifications.map(sanitizeNotification),
            unreadCount: unreadCount || 0
        });
    } catch (err) {
        console.error('[notifications/list] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve notifications',
            code: 'NOTIFICATIONS_LIST_ERROR'
        });
    }
});

/**
 * PUT /api/logs/notifications/:id/read
 * Mark a notification as read
 */
router.put('/notifications/:id/read', authenticate, async (req, res) => {
    try {
        const idValidation = validateNotificationId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_NOTIFICATION_ID'
            });
        }
        
        const db = getDb();
        const result = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?').run(idValidation.value, req.user.id);
        
        if (result.changes === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Notification not found',
                code: 'NOTIFICATION_NOT_FOUND'
            });
        }
        
        res.json({
            message: 'Notification marked as read',
            code: 'NOTIFICATION_READ'
        });
    } catch (err) {
        console.error('[notifications/read] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to mark notification as read',
            code: 'NOTIFICATION_READ_ERROR'
        });
    }
});

/**
 * PUT /api/logs/notifications/read-all
 * Mark all notifications as read for current user
 */
router.put('/notifications/read-all', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare('UPDATE notifications SET read = 1 WHERE userId = ? AND read = 0').run(req.user.id);
        
        res.json({
            message: 'All notifications marked as read',
            updatedCount: result.changes,
            code: 'NOTIFICATIONS_READ_ALL'
        });
    } catch (err) {
        console.error('[notifications/read-all] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to mark all notifications as read',
            code: 'NOTIFICATIONS_READ_ALL_ERROR'
        });
    }
});

/**
 * DELETE /api/logs/notifications/:id
 * Delete a notification
 */
router.delete('/notifications/:id', authenticate, async (req, res) => {
    try {
        const idValidation = validateNotificationId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_NOTIFICATION_ID'
            });
        }
        
        const db = getDb();
        const result = db.prepare('DELETE FROM notifications WHERE id = ? AND userId = ?').run(idValidation.value, req.user.id);
        
        if (result.changes === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Notification not found',
                code: 'NOTIFICATION_NOT_FOUND'
            });
        }
        
        res.json({
            message: 'Notification deleted',
            code: 'NOTIFICATION_DELETED'
        });
    } catch (err) {
        console.error('[notifications/delete] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to delete notification',
            code: 'NOTIFICATION_DELETE_ERROR'
        });
    }
});

/**
 * DELETE /api/logs/notifications/read
 * Delete all read notifications for current user
 */
router.delete('/notifications/read', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare('DELETE FROM notifications WHERE userId = ? AND read = 1').run(req.user.id);
        
        res.json({
            message: 'Read notifications deleted',
            deletedCount: result.changes,
            code: 'NOTIFICATIONS_PURGED'
        });
    } catch (err) {
        console.error('[notifications/purge] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to delete read notifications',
            code: 'NOTIFICATIONS_PURGE_ERROR'
        });
    }
});

module.exports = router;