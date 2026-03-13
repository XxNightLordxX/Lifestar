/**
 * Time-Off Request Routes
 * Secure time-off management with comprehensive validation
 * 
 * GET    /api/timeoff — List requests (filtered by user/status)
 * POST   /api/timeoff — Create request
 * PUT    /api/timeoff/:id — Update request (approve/deny)
 * DELETE /api/timeoff/:id — Cancel/delete request
 * GET    /api/timeoff/stats — Get time-off statistics
 * 
 * @module routes/timeoff
 */

const express = require('express');
const { HTTP_STATUS: CFG_HTTP } = require('../config');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // Validation rules
    REASON_MAX_LENGTH: 500,
    MAX_REQUESTS_PER_MONTH: 10,
    MAX_DAYS_PER_REQUEST: 90,
    
    // Valid statuses
    VALID_STATUSES: ['pending', 'approved', 'denied', 'cancelled'],
    
    // Date validation
    MIN_YEAR: 2020,
    MAX_YEAR: 2100,
    MAX_FUTURE_DAYS: 365, // Can't request more than 1 year in advance
    
    // Pagination
    MAX_RESULTS_PER_PAGE: 100,
    DEFAULT_PAGE_SIZE: 20,
    
    // HTTP Status codes
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        TOO_MANY_REQUESTS: 429,
        SERVER_ERROR: 500
    }
};

// ============================================
// RATE LIMITING
// ============================================

const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 requests per hour
    message: { error: 'Too many time-off requests created', retryAfter: 3600 }
});

const updateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 updates per minute
    message: { error: 'Too many update requests', retryAfter: 60 }
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
 * Validate date string (YYYY-MM-DD format)
 * @param {string} dateStr - Date string to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {Object} Validation result
 */
function validateDate(dateStr, fieldName = 'Date') {
    if (!dateStr || typeof dateStr !== 'string') {
        return { valid: false, errors: [`${fieldName} is required`], value: null };
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
        return { valid: false, errors, value: null };
    }
    
    // Check year bounds
    const year = date.getFullYear();
    if (year < CONSTANTS.MIN_YEAR || year > CONSTANTS.MAX_YEAR) {
        errors.push(`${fieldName} year must be between ${CONSTANTS.MIN_YEAR} and ${CONSTANTS.MAX_YEAR}`);
    }
    
    // Check not too far in the future
    const maxFutureDate = new Date();
    maxFutureDate.setDate(maxFutureDate.getDate() + CONSTANTS.MAX_FUTURE_DAYS);
    if (date > maxFutureDate) {
        errors.push(`${fieldName} cannot be more than ${CONSTANTS.MAX_FUTURE_DAYS} days in the future`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: dateStr,
        dateObject: date
    };
}

/**
 * Validate date range
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @returns {Object} Validation result
 */
function validateDateRange(startDate, endDate) {
    const startValidation = validateDate(startDate, 'Start date');
    const endValidation = validateDate(endDate, 'End date');
    
    const errors = [...startValidation.errors, ...endValidation.errors];
    
    if (startValidation.valid && endValidation.valid) {
        const start = startValidation.dateObject;
        const end = endValidation.dateObject;
        
        if (start > end) {
            errors.push('Start date cannot be after end date');
        }
        
        // Check maximum duration
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        
        if (diffDays > CONSTANTS.MAX_DAYS_PER_REQUEST) {
            errors.push(`Request cannot exceed ${CONSTANTS.MAX_DAYS_PER_REQUEST} days`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        startDate: startValidation.value,
        endDate: endValidation.value,
        startObject: startValidation.dateObject,
        endObject: endValidation.dateObject
    };
}

/**
 * Validate request ID
 * @param {string} id - Request ID to validate
 * @returns {Object} Validation result
 */
function validateRequestId(id) {
    const errors = [];
    
    if (!id) {
        errors.push('Request ID is required');
        return { valid: false, errors, value: null };
    }
    
    const parsed = parseInt(id, 10);
    
    if (isNaN(parsed) || parsed < 1) {
        errors.push('Request ID must be a positive integer');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: parsed
    };
}

/**
 * Validate status
 * @param {string} status - Status to validate
 * @returns {Object} Validation result
 */
function validateStatus(status) {
    if (!status) {
        return { valid: true, errors: [], value: 'pending' };
    }
    
    const errors = [];
    const trimmed = status.trim().toLowerCase();
    
    if (!CONSTANTS.VALID_STATUSES.includes(trimmed)) {
        errors.push(`Status must be one of: ${CONSTANTS.VALID_STATUSES.join(', ')}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate reason text
 * @param {string} reason - Reason text
 * @returns {Object} Validation result
 */
function validateReason(reason) {
    if (!reason) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const sanitized = sanitizeString(reason, CONSTANTS.REASON_MAX_LENGTH);
    
    // Check for XSS patterns
    if (/<script|javascript:|on\w+=/i.test(sanitized)) {
        errors.push('Reason contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: sanitized
    };
}

/**
 * Validate user ID
 * @param {string} id - User ID to validate
 * @returns {Object} Validation result
 */
function validateUserId(id) {
    const errors = [];
    
    if (!id) {
        errors.push('User ID is required');
        return { valid: false, errors, value: null };
    }
    
    const parsed = parseInt(id, 10);
    
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
 * Sanitize time-off request object for response
 * @param {Object} request - Request object
 * @returns {Object} Sanitized request object
 */
function sanitizeTimeOffRequest(request) {
    if (!request) return null;
    
    return {
        id: request.id,
        userId: request.userId,
        username: request.username || null,
        fullName: request.fullName || null,
        startDate: request.startDate,
        endDate: request.endDate,
        reason: request.reason || '',
        status: request.status || 'pending',
        reviewedBy: request.reviewedBy || null,
        reviewerName: request.reviewerName || null,
        reviewNotes: request.reviewNotes || '',
        createdAt: request.createdAt,
        updatedAt: request.updatedAt || null
    };
}

/**
 * Check if user has permission to access/modify request
 * @param {Object} user - Current user
 * @param {Object} request - Time-off request
 * @returns {boolean} True if user has permission
 */
function hasPermission(user, request) {
    // Admin users have full access
    if (user.role === 'super' || user.role === 'boss') {
        return true;
    }
    
    // Regular users can only access their own requests
    return request.userId === user.id;
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/timeoff
 * List time-off requests with filtering and pagination
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const { status, userId, page, limit, startDate, endDate, search } = req.query;
        
        // Build base query with user join
        let sql = `
            SELECT t.*, 
                   u.fullName, u.username,
                   r.fullName as reviewerName
            FROM timeoff_requests t 
            LEFT JOIN users u ON t.userId = u.id 
            LEFT JOIN users r ON t.reviewedBy = r.id
            WHERE 1=1
        `;
        // countSql mirrors the same WHERE conditions but without the JOIN overhead
        let countSql = `SELECT COUNT(*) as total FROM timeoff_requests t WHERE 1=1`;
        const params = [];
        const countParams = [];
        
        // Non-admin users can only see their own requests
        if (req.user.role === 'paramedic' || req.user.role === 'emt') {
            sql += ' AND t.userId = ?';
            countSql += ' AND t.userId = ?';
            params.push(req.user.id);
            countParams.push(req.user.id);
        } else if (userId) {
            const userIdValidation = validateUserId(userId);
            if (userIdValidation.valid) {
                sql += ' AND t.userId = ?';
                countSql += ' AND t.userId = ?';
                params.push(userIdValidation.value);
                countParams.push(userIdValidation.value);
            }
        }
        
        // Status filter — allow all valid statuses including 'pending'
        if (status) {
            const statusValidation = validateStatus(status);
            if (statusValidation.valid && statusValidation.value) {
                sql += ' AND t.status = ?';
                countSql += ' AND t.status = ?';
                params.push(statusValidation.value);
                countParams.push(statusValidation.value);
            }
        }
        
        // Date range filters
        if (startDate) {
            const startDateValidation = validateDate(startDate, 'Start date filter');
            if (startDateValidation.valid) {
                sql += ' AND t.endDate >= ?';
                countSql += ' AND t.endDate >= ?';
                params.push(startDateValidation.value);
                countParams.push(startDateValidation.value);
            }
        }
        
        if (endDate) {
            const endDateValidation = validateDate(endDate, 'End date filter');
            if (endDateValidation.valid) {
                sql += ' AND t.startDate <= ?';
                countSql += ' AND t.startDate <= ?';
                params.push(endDateValidation.value);
                countParams.push(endDateValidation.value);
            }
        }
        
        // Search in reason
        if (search && typeof search === 'string') {
            const searchSanitized = sanitizeString(search, 100);
            sql += ' AND t.reason LIKE ?';
            countSql += ' AND t.reason LIKE ?';
            params.push(`%${searchSanitized}%`);
            countParams.push(`%${searchSanitized}%`);
        }
        
        // Add pagination
        const pageSize = Math.min(parseInt(limit) || CONSTANTS.DEFAULT_PAGE_SIZE, CONSTANTS.MAX_RESULTS_PER_PAGE);
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const offset = (pageNum - 1) * pageSize;
        
        sql += ' ORDER BY t.createdAt DESC LIMIT ? OFFSET ?';
        params.push(pageSize, offset);
        
        const requests = db.prepare(sql).all(...params);
        
        // Count uses the same conditions (no limit/offset)
        const { total } = db.prepare(countSql).get(...countParams);
        
        res.json({
            requests: requests.map(sanitizeTimeOffRequest),
            pagination: {
                page: pageNum,
                limit: pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (err) {
        console.error('[timeoff/list] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve time-off requests',
            code: 'TIMEOFF_LIST_ERROR'
        });
    }
});

/**
 * GET /api/timeoff/stats
 * Get time-off statistics (admin only)
 */
router.get('/stats', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const db = getDb();
        const { year, userId } = req.query;
        
        const yearValidation = validateYear(year);
        const targetYear = yearValidation.valid ? yearValidation.value : new Date().getFullYear();
        
        let sql = `
            SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) as denied,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM timeoff_requests
            WHERE strftime('%Y', startDate) = ?
        `;
        const params = [targetYear.toString()];
        
        if (userId) {
            const userIdValidation = validateUserId(userId);
            if (userIdValidation.valid) {
                sql += ' AND userId = ?';
                params.push(userIdValidation.value);
            }
        }
        
        const stats = db.prepare(sql).get(...params);
        
        // Get monthly breakdown
        const monthlySql = `
            SELECT 
                strftime('%m', startDate) as month,
                COUNT(*) as count,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
            FROM timeoff_requests
            WHERE strftime('%Y', startDate) = ?
            ${userId && validateUserId(userId).valid ? ' AND userId = ?' : ''}
            GROUP BY strftime('%m', startDate)
            ORDER BY month
        `;
        
        const monthly = db.prepare(monthlySql).all(...params);
        
        res.json({
            year: targetYear,
            summary: {
                total: stats.total_requests || 0,
                pending: stats.pending || 0,
                approved: stats.approved || 0,
                denied: stats.denied || 0,
                cancelled: stats.cancelled || 0
            },
            monthly
        });
    } catch (err) {
        console.error('[timeoff/stats] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve time-off statistics',
            code: 'TIMEOFF_STATS_ERROR'
        });
    }
});

/**
 * Validate year helper
 */
function validateYear(year) {
    if (!year) {
        return { valid: false, errors: [], value: null };
    }
    
    const parsed = parseInt(year, 10);
    const errors = [];
    
    if (isNaN(parsed) || parsed < CONSTANTS.MIN_YEAR || parsed > CONSTANTS.MAX_YEAR) {
        errors.push(`Year must be between ${CONSTANTS.MIN_YEAR} and ${CONSTANTS.MAX_YEAR}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: parsed
    };
}

/**
 * GET /api/timeoff/:id
 * Get a single time-off request by ID
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const idValidation = validateRequestId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_REQUEST_ID'
            });
        }
        
        const db = getDb();
        const request = db.prepare(`
            SELECT t.*, 
                   u.fullName, u.username,
                   r.fullName as reviewerName
            FROM timeoff_requests t 
            LEFT JOIN users u ON t.userId = u.id 
            LEFT JOIN users r ON t.reviewedBy = r.id
            WHERE t.id = ?
        `).get(idValidation.value);
        
        if (!request) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Time-off request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        // Check permission
        if (!hasPermission(req.user, request)) {
            return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                error: 'You do not have permission to view this request',
                code: 'ACCESS_DENIED'
            });
        }
        
        res.json({ request: sanitizeTimeOffRequest(request) });
    } catch (err) {
        console.error('[timeoff/get] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve time-off request',
            code: 'TIMEOFF_GET_ERROR'
        });
    }
});

/**
 * POST /api/timeoff
 * Create a new time-off request
 */
router.post('/', authenticate, createLimiter, async (req, res) => {
    try {
        const { startDate, endDate, reason } = req.body;
        
        // Validate date range
        const dateRangeValidation = validateDateRange(startDate, endDate);
        if (!dateRangeValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                details: dateRangeValidation.errors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Validate reason
        const reasonValidation = validateReason(reason);
        if (!reasonValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                details: reasonValidation.errors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        const db = getDb();
        
        // Check for overlapping requests
        const overlapping = db.prepare(`
            SELECT id FROM timeoff_requests 
            WHERE userId = ? 
            AND status != 'denied' 
            AND status != 'cancelled'
            AND (
                (startDate <= ? AND endDate >= ?) OR
                (startDate <= ? AND endDate >= ?) OR
                (startDate >= ? AND endDate <= ?)
            )
        `).get(
            req.user.id,
            dateRangeValidation.startDate, dateRangeValidation.startDate,
            dateRangeValidation.endDate, dateRangeValidation.endDate,
            dateRangeValidation.startDate, dateRangeValidation.endDate
        );
        
        if (overlapping) {
            return res.status(CONSTANTS.HTTP_STATUS.CONFLICT).json({
                error: 'You have an overlapping time-off request',
                code: 'OVERLAPPING_REQUEST'
            });
        }
        
        // Check monthly limit
        const monthStart = new Date(dateRangeValidation.startObject);
        monthStart.setDate(1);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        monthEnd.setDate(0);
        
        const monthRequests = db.prepare(`
            SELECT COUNT(*) as count FROM timeoff_requests 
            WHERE userId = ? 
            AND strftime('%Y-%m', startDate) = strftime('%Y-%m', ?)
        `).get(req.user.id, dateRangeValidation.startDate);
        
        if (monthRequests.count >= CONSTANTS.MAX_REQUESTS_PER_MONTH) {
            return res.status(CONSTANTS.HTTP_STATUS.TOO_MANY_REQUESTS).json({
                error: `Maximum ${CONSTANTS.MAX_REQUESTS_PER_MONTH} time-off requests per month allowed`,
                code: 'MONTHLY_LIMIT_EXCEEDED'
            });
        }
        
        const result = db.prepare(
            'INSERT INTO timeoff_requests (userId, startDate, endDate, reason, status, createdAt) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
        ).run(
            req.user.id,
            dateRangeValidation.startDate,
            dateRangeValidation.endDate,
            reasonValidation.value,
            'pending'
        );
        
        await addLog(`Time-off requested: ${dateRangeValidation.startDate} to ${dateRangeValidation.endDate}`, req.user.id, req.user.username);
        
        const request = db.prepare('SELECT * FROM timeoff_requests WHERE id = ?').get(result.lastInsertRowid);
        
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({
            request: sanitizeTimeOffRequest(request),
            message: 'Time-off request submitted successfully'
        });
    } catch (err) {
        console.error('[timeoff/create] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to create time-off request',
            code: 'TIMEOFF_CREATE_ERROR'
        });
    }
});

/**
 * PUT /api/timeoff/:id
 * Update a time-off request (approve/deny for admins, or cancel for owners)
 */
router.put('/:id', authenticate, updateLimiter, async (req, res) => {
    try {
        const idValidation = validateRequestId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_REQUEST_ID'
            });
        }
        
        const id = idValidation.value;
        const { status, startDate, endDate, reason, reviewNotes } = req.body;
        
        const db = getDb();
        const request = db.prepare('SELECT * FROM timeoff_requests WHERE id = ?').get(id);
        
        if (!request) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Time-off request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        const isAdmin = req.user.role === 'super' || req.user.role === 'boss';
        const isOwner = request.userId === req.user.id;
        
        // Handle status changes (admin only for approve/deny)
        if (status) {
            const statusValidation = validateStatus(status);
            if (!statusValidation.valid) {
                return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                    error: 'Validation failed',
                    details: statusValidation.errors,
                    code: 'VALIDATION_ERROR'
                });
            }
            
            // Admins can approve/deny, users can only cancel their own pending requests
            if (statusValidation.value === 'approved' || statusValidation.value === 'denied') {
                if (!isAdmin) {
                    return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                        error: 'You do not have permission to approve/deny requests',
                        code: 'ACCESS_DENIED'
                    });
                }
            } else if (statusValidation.value === 'cancelled') {
                if (!isOwner) {
                    return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                        error: 'You can only cancel your own requests',
                        code: 'ACCESS_DENIED'
                    });
                }
                if (request.status !== 'pending') {
                    return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                        error: 'Can only cancel pending requests',
                        code: 'INVALID_STATUS_CHANGE'
                    });
                }
            }
            
            const safeReviewNotes = (typeof reviewNotes === 'string') ? reviewNotes.trim().substring(0, 500) : '';
            db.prepare(`
                UPDATE timeoff_requests
                SET status = ?, reviewedBy = ?, reviewNotes = ?, reviewedAt = datetime('now'), updatedAt = datetime('now')
                WHERE id = ?
            `).run(statusValidation.value, isAdmin ? req.user.id : null, safeReviewNotes, id);
            
            await addLog(`Time-off ${statusValidation.value}: request #${id}`, req.user.id, req.user.username);
        }
        
        // Handle date/reason updates (owner only, pending status only)
        if (isOwner && request.status === 'pending') {
            const updates = {};
            const errors = [];
            
            if (startDate !== undefined || endDate !== undefined) {
                const newStart = startDate !== undefined ? startDate : request.startDate;
                const newEnd = endDate !== undefined ? endDate : request.endDate;
                
                const dateRangeValidation = validateDateRange(newStart, newEnd);
                if (!dateRangeValidation.valid) {
                    errors.push(...dateRangeValidation.errors);
                } else {
                    updates.startDate = dateRangeValidation.startDate;
                    updates.endDate = dateRangeValidation.endDate;
                }
            }
            
            if (reason !== undefined) {
                const reasonValidation = validateReason(reason);
                if (!reasonValidation.valid) {
                    errors.push(...reasonValidation.errors);
                } else {
                    updates.reason = reasonValidation.value;
                }
            }
            
            if (errors.length > 0) {
                return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                    error: 'Validation failed',
                    details: errors,
                    code: 'VALIDATION_ERROR'
                });
            }
            
            if (Object.keys(updates).length > 0) {
                const validColumns = new Set(['startDate', 'endDate', 'reason']);
                const setClauses = Object.keys(updates).filter(k => validColumns.has(k)).map(key => `${key} = ?`);
                setClauses.push("updatedAt = datetime('now')");
                const safeValues = Object.keys(updates).filter(k => validColumns.has(k)).map(k => updates[k]);

                db.prepare(`UPDATE timeoff_requests SET ${setClauses.join(', ')} WHERE id = ?`)
                    .run(...safeValues, id);
            }
        }
        
        const updated = db.prepare(`
            SELECT t.*, 
                   u.fullName, u.username,
                   r.fullName as reviewerName
            FROM timeoff_requests t 
            LEFT JOIN users u ON t.userId = u.id 
            LEFT JOIN users r ON t.reviewedBy = r.id
            WHERE t.id = ?
        `).get(id);
        
        res.json({
            request: sanitizeTimeOffRequest(updated),
            message: 'Time-off request updated successfully'
        });
    } catch (err) {
        console.error('[timeoff/update] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to update time-off request',
            code: 'TIMEOFF_UPDATE_ERROR'
        });
    }
});

/**
 * DELETE /api/timeoff/:id
 * Delete a time-off request (owner only, pending status only)
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const idValidation = validateRequestId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_REQUEST_ID'
            });
        }
        
        const id = idValidation.value;
        const db = getDb();
        const request = db.prepare('SELECT * FROM timeoff_requests WHERE id = ?').get(id);
        
        if (!request) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Time-off request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        // Only owner can delete their own pending requests
        if (request.userId !== req.user.id) {
            return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
                error: 'You can only delete your own requests',
                code: 'ACCESS_DENIED'
            });
        }
        
        if (request.status !== 'pending') {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Can only delete pending requests',
                code: 'INVALID_STATUS'
            });
        }
        
        db.prepare('DELETE FROM timeoff_requests WHERE id = ?').run(id);
        
        await addLog(`Time-off request deleted: #${id}`, req.user.id, req.user.username);
        
        res.json({
            message: 'Time-off request deleted successfully',
            code: 'REQUEST_DELETED'
        });
    } catch (err) {
        console.error('[timeoff/delete] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to delete time-off request',
            code: 'TIMEOFF_DELETE_ERROR'
        });
    }
});

module.exports = router;