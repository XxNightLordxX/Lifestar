/**
 * Schedule & Crew Routes
 * Secure schedule and crew management with comprehensive validation
 * 
 * GET    /api/schedules — List schedules (filtered by status, location)
 * POST   /api/schedules — Create schedule (boss/super)
 * PUT    /api/schedules/:id — Update schedule (boss/super)
 * DELETE /api/schedules/:id — Delete schedule (boss/super)
 * GET    /api/schedules/:id/crews — List crews for a schedule
 * POST   /api/schedules/:id/crews — Add crew to schedule
 * PUT    /api/crews/:id — Update crew assignment
 * DELETE /api/crews/:id — Remove crew assignment
 * POST   /api/schedules/:id/duplicate — Duplicate a schedule
 * POST   /api/schedules/batch — Batch operations on schedules
 * 
 * @module routes/schedules
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
    SCHEDULE_NAME_MIN_LENGTH: 1,
    SCHEDULE_NAME_MAX_LENGTH: 100,
    DESCRIPTION_MAX_LENGTH: 500,
    RIG_MAX_LENGTH: 50,
    CREW_NAME_MAX_LENGTH: 100,
    
    // Pagination
    MAX_RESULTS_PER_PAGE: 100,
    DEFAULT_PAGE_SIZE: 20,
    
    // Valid statuses
    VALID_STATUSES: ['draft', 'published', 'archived'],
    
    // Valid shift types — must match database.js VALID_SHIFT_TYPES and frontend usage
    VALID_SHIFT_TYPES: ['Day', 'Night', '24-Hour', '12-Hour', '24hr', '12hr-Day', '12hr-Night'],
    
    // Valid crew types — must match database.js VALID_CREW_TYPES and frontend usage
    VALID_CREW_TYPES: ['ALS', 'BLS', 'CCT', 'CC', 'ST', 'PR'],
    
    // Date validation
    MIN_YEAR: 2020,
    MAX_YEAR: 2100,
    
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
    max: 50, // 50 schedules per hour
    message: { error: 'Too many schedules created', retryAfter: 3600 }
});

const updateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 updates per minute
    message: { error: 'Too many update requests', retryAfter: 60 }
});

const crewLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 crew operations per minute
    message: { error: 'Too many crew operations', retryAfter: 60 }
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
 * Validate schedule name
 * @param {string} name - Schedule name to validate
 * @returns {Object} Validation result
 */
function validateScheduleName(name) {
    const errors = [];
    
    if (!name || typeof name !== 'string') {
        errors.push('Schedule name is required');
        return { valid: false, errors, value: '' };
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length < CONSTANTS.SCHEDULE_NAME_MIN_LENGTH) {
        errors.push('Schedule name cannot be empty');
    }
    
    if (trimmed.length > CONSTANTS.SCHEDULE_NAME_MAX_LENGTH) {
        errors.push(`Schedule name must be at most ${CONSTANTS.SCHEDULE_NAME_MAX_LENGTH} characters`);
    }
    
    // Check for potential XSS patterns
    if (/<script|javascript:|on\w+=/i.test(trimmed)) {
        errors.push('Schedule name contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate schedule ID
 * @param {string} id - Schedule ID to validate
 * @returns {Object} Validation result
 */
function validateScheduleId(id) {
    const errors = [];
    
    if (!id) {
        errors.push('Schedule ID is required');
        return { valid: false, errors, value: null };
    }
    
    const parsed = parseInt(id, 10);
    
    if (isNaN(parsed) || parsed < 1) {
        errors.push('Schedule ID must be a positive integer');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: parsed
    };
}

/**
 * Validate crew ID
 * @param {string} id - Crew ID to validate
 * @returns {Object} Validation result
 */
function validateCrewId(id) {
    return validateScheduleId(id); // Same validation logic
}

/**
 * Validate month (1-12)
 * @param {number|string} month - Month to validate
 * @returns {Object} Validation result
 */
function validateMonth(month) {
    if (month === undefined || month === null || month === '') {
        return { valid: true, errors: [], value: null };
    }
    
    const parsed = parseInt(month, 10);
    const errors = [];
    
    if (isNaN(parsed) || parsed < 1 || parsed > 12) {
        errors.push('Month must be between 1 and 12');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: parsed
    };
}

/**
 * Validate year
 * @param {number|string} year - Year to validate
 * @returns {Object} Validation result
 */
function validateYear(year) {
    if (year === undefined || year === null || year === '') {
        return { valid: true, errors: [], value: null };
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
 * Validate schedule status
 * @param {string} status - Status to validate
 * @returns {Object} Validation result
 */
function validateStatus(status) {
    if (!status) {
        return { valid: true, errors: [], value: 'draft' };
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
 * Validate shift type
 * @param {string} shiftType - Shift type to validate
 * @returns {Object} Validation result
 */
function validateShiftType(shiftType) {
    if (!shiftType) {
        return { valid: true, errors: [], value: 'Day' };
    }
    
    const errors = [];
    const trimmed = shiftType.trim();
    
    if (!CONSTANTS.VALID_SHIFT_TYPES.includes(trimmed)) {
        errors.push(`Shift type must be one of: ${CONSTANTS.VALID_SHIFT_TYPES.join(', ')}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate crew type
 * @param {string} crewType - Crew type to validate
 * @returns {Object} Validation result
 */
function validateCrewType(crewType) {
    if (!crewType) {
        return { valid: true, errors: [], value: null };
    }
    
    const errors = [];
    const trimmed = crewType.trim().toUpperCase();
    
    if (!CONSTANTS.VALID_CREW_TYPES.includes(trimmed)) {
        errors.push(`Crew type must be one of: ${CONSTANTS.VALID_CREW_TYPES.join(', ')}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate date string (YYYY-MM-DD format)
 * @param {string} dateStr - Date string to validate
 * @returns {Object} Validation result
 */
function validateDate(dateStr) {
    if (!dateStr) {
        return { valid: true, errors: [], value: null };
    }
    
    const errors = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (!dateRegex.test(dateStr)) {
        errors.push('Date must be in YYYY-MM-DD format');
        return { valid: false, errors, value: null };
    }
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        errors.push('Invalid date');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: dateStr
    };
}

/**
 * Validate location ID
 * @param {string|number} locationId - Location ID to validate
 * @returns {Object} Validation result
 */
function validateLocationId(locationId) {
    if (locationId === undefined || locationId === null || locationId === '') {
        return { valid: true, errors: [], value: null };
    }
    
    const parsed = parseInt(locationId, 10);
    const errors = [];
    
    if (isNaN(parsed) || parsed < 1) {
        errors.push('Location ID must be a positive integer');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: parsed
    };
}

/**
 * Validate rig identifier
 * @param {string} rig - Rig identifier
 * @returns {Object} Validation result
 */
function validateRig(rig) {
    if (!rig) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const trimmed = sanitizeString(rig, CONSTANTS.RIG_MAX_LENGTH);
    
    // Check for XSS patterns
    if (/<script|javascript:|on\w+=/i.test(trimmed)) {
        errors.push('Rig identifier contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate crew member name
 * @param {string} name - Crew member name
 * @returns {Object} Validation result
 */
function validateCrewName(name) {
    if (!name) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const trimmed = sanitizeString(name, CONSTANTS.CREW_NAME_MAX_LENGTH);
    
    // Check for XSS patterns
    if (/<script|javascript:|on\w+=/i.test(trimmed)) {
        errors.push('Crew member name contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Sanitize schedule object for response
 * @param {Object} schedule - Schedule object
 * @returns {Object} Sanitized schedule object
 */
function sanitizeSchedule(schedule) {
    if (!schedule) return null;
    
    return {
        id: schedule.id,
        name: schedule.name,
        month: schedule.month,
        year: schedule.year,
        description: schedule.description || '',
        status: schedule.status || 'draft',
        locationId: schedule.locationId || null,
        totalHours: schedule.totalHours || 0,
        createdBy: schedule.createdBy,
        publishedAt: schedule.publishedAt || null,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt || null
    };
}

/**
 * Sanitize crew object for response
 * @param {Object} crew - Crew object
 * @returns {Object} Sanitized crew object
 */
function sanitizeCrew(crew) {
    if (!crew) return null;
    
    return {
        id: crew.id,
        scheduleId: crew.scheduleId,
        rig: crew.rig || '',
        paramedic: crew.paramedic || '',
        emt: crew.emt || '',
        shiftType: crew.shiftType || 'Day',
        date: crew.date || '',
        crewType: crew.crewType || '',
        startTime: crew.startTime || null,
        endTime: crew.endTime || null,
        notes: crew.notes || '',
        createdAt: crew.createdAt,
        updatedAt: crew.updatedAt || null
    };
}

// ============================================
// SCHEDULE ROUTES
// ============================================

/**
 * GET /api/schedules
 * List all schedules with filtering and pagination
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const { status, locationId, month, year, page, limit, search } = req.query;
        
        // Build query with filters - track params for both main query and count
        let sql = 'SELECT * FROM schedules WHERE 1=1';
        let countSql = 'SELECT COUNT(*) as total FROM schedules WHERE 1=1';
        const params = [];
        const countParams = [];
        
        // Validate and apply status filter
        if (status) {
            const statusValidation = validateStatus(status);
            if (statusValidation.valid && statusValidation.value) {
                sql += ' AND status = ?';
                countSql += ' AND status = ?';
                params.push(statusValidation.value);
                countParams.push(statusValidation.value);
            }
        }
        
        // Validate and apply location filter
        if (locationId) {
            const locValidation = validateLocationId(locationId);
            if (locValidation.valid && locValidation.value) {
                sql += ' AND locationId = ?';
                countSql += ' AND locationId = ?';
                params.push(locValidation.value);
                countParams.push(locValidation.value);
            }
        }
        
        // Apply month filter
        if (month) {
            const monthValidation = validateMonth(month);
            if (monthValidation.valid && monthValidation.value) {
                sql += ' AND month = ?';
                countSql += ' AND month = ?';
                params.push(monthValidation.value);
                countParams.push(monthValidation.value);
            }
        }
        
        // Apply year filter
        if (year) {
            const yearValidation = validateYear(year);
            if (yearValidation.valid && yearValidation.value) {
                sql += ' AND year = ?';
                countSql += ' AND year = ?';
                params.push(yearValidation.value);
                countParams.push(yearValidation.value);
            }
        }
        
        // Apply search filter
        if (search && typeof search === 'string') {
            const searchSanitized = sanitizeString(search, 100);
            sql += ' AND (name LIKE ? OR description LIKE ?)';
            countSql += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${searchSanitized}%`, `%${searchSanitized}%`);
            countParams.push(`%${searchSanitized}%`, `%${searchSanitized}%`);
        }
        
        // Add pagination
        const pageSize = Math.min(parseInt(limit) || CONSTANTS.DEFAULT_PAGE_SIZE, CONSTANTS.MAX_RESULTS_PER_PAGE);
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const offset = (pageNum - 1) * pageSize;
        
        sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
        params.push(pageSize, offset);
        
        const schedules = db.prepare(sql).all(...params);
        
        // Count uses identical conditions but no limit/offset
        const { total } = db.prepare(countSql).get(...countParams);
        
        // Attach crews to each schedule
        const crewStmt = db.prepare('SELECT * FROM crews WHERE scheduleId = ? ORDER BY date, rig');
        const schedulesWithCrews = schedules.map(s => ({
            ...sanitizeSchedule(s),
            crews: crewStmt.all(s.id).map(sanitizeCrew)
        }));
        
        res.json({
            schedules: schedulesWithCrews,
            pagination: {
                page: pageNum,
                limit: pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (err) {
        console.error('[schedules/list] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve schedules',
            code: 'SCHEDULES_LIST_ERROR'
        });
    }
});

/**
 * GET /api/schedules/:id
 * Get a single schedule by ID
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const db = getDb();
        const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(idValidation.value);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        const crews = db.prepare('SELECT * FROM crews WHERE scheduleId = ? ORDER BY date, rig').all(schedule.id);
        
        res.json({
            schedule: {
                ...sanitizeSchedule(schedule),
                crews: crews.map(sanitizeCrew)
            }
        });
    } catch (err) {
        console.error('[schedules/get] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve schedule',
            code: 'SCHEDULE_GET_ERROR'
        });
    }
});

/**
 * POST /api/schedules
 * Create a new schedule
 */
router.post('/', authenticate, authorize('super', 'boss'), createLimiter, async (req, res) => {
    try {
        const { name, month, year, description, locationId } = req.body;
        
        // Validate inputs
        const nameValidation = validateScheduleName(name);
        const monthValidation = validateMonth(month);
        const yearValidation = validateYear(year);
        const locationValidation = validateLocationId(locationId);
        
        const allErrors = [
            ...nameValidation.errors,
            ...monthValidation.errors,
            ...yearValidation.errors,
            ...locationValidation.errors
        ];
        
        if (allErrors.length > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                details: allErrors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        const sanitizedDescription = sanitizeString(description, CONSTANTS.DESCRIPTION_MAX_LENGTH);
        
        const db = getDb();
        const result = db.prepare(
            'INSERT INTO schedules (name, month, year, description, locationId, status, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
        ).run(
            nameValidation.value,
            monthValidation.value || null,
            yearValidation.value || null,
            sanitizedDescription,
            locationValidation.value,
            'draft',
            req.user.id
        );
        
        await addLog(`Schedule created: ${nameValidation.value}`, req.user.id, req.user.username);
        
        const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);
        
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({
            schedule: {
                ...sanitizeSchedule(schedule),
                crews: []
            },
            message: 'Schedule created successfully'
        });
    } catch (err) {
        console.error('[schedules/create] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to create schedule',
            code: 'SCHEDULE_CREATE_ERROR'
        });
    }
});

/**
 * PUT /api/schedules/:id
 * Update an existing schedule
 */
router.put('/:id', authenticate, authorize('super', 'boss'), updateLimiter, async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const id = idValidation.value;
        const { name, month, year, description, status, locationId, totalHours } = req.body;
        
        const db = getDb();
        const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        // Validate inputs
        const updates = {};
        const errors = [];
        
        if (name !== undefined) {
            const nameValidation = validateScheduleName(name);
            if (!nameValidation.valid) {
                errors.push(...nameValidation.errors);
            } else {
                updates.name = nameValidation.value;
            }
        }
        
        if (month !== undefined) {
            const monthValidation = validateMonth(month);
            if (!monthValidation.valid) {
                errors.push(...monthValidation.errors);
            } else {
                updates.month = monthValidation.value;
            }
        }
        
        if (year !== undefined) {
            const yearValidation = validateYear(year);
            if (!yearValidation.valid) {
                errors.push(...yearValidation.errors);
            } else {
                updates.year = yearValidation.value;
            }
        }
        
        if (description !== undefined) {
            updates.description = sanitizeString(description, CONSTANTS.DESCRIPTION_MAX_LENGTH);
        }
        
        if (status !== undefined) {
            const statusValidation = validateStatus(status);
            if (!statusValidation.valid) {
                errors.push(...statusValidation.errors);
            } else {
                updates.status = statusValidation.value;
                
                // Track when schedule is published
                if (statusValidation.value === 'published' && schedule.status !== 'published') {
                    updates.publishedAt = new Date().toISOString();
                }
            }
        }
        
        if (locationId !== undefined) {
            const locationValidation = validateLocationId(locationId);
            if (!locationValidation.valid) {
                errors.push(...locationValidation.errors);
            } else {
                updates.locationId = locationValidation.value;
            }
        }
        
        if (totalHours !== undefined) {
            const hours = parseFloat(totalHours);
            if (isNaN(hours) || hours < 0) {
                errors.push('Total hours must be a non-negative number');
            } else {
                updates.totalHours = hours;
            }
        }
        
        if (errors.length > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                details: errors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        if (Object.keys(updates).length === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'No valid updates provided',
                code: 'NO_UPDATES'
            });
        }
        
        // Build update query with column whitelist
        const validScheduleCols = new Set(['name', 'description', 'status', 'locationId', 'totalHours', 'publishedAt']);
        const setClauses = Object.keys(updates).filter(k => validScheduleCols.has(k)).map(key => `${key} = ?`);
        setClauses.push("updatedAt = datetime('now')");
        const safeValues = Object.keys(updates).filter(k => validScheduleCols.has(k)).map(k => updates[k]);

        const updateQuery = `UPDATE schedules SET ${setClauses.join(', ')} WHERE id = ?`;
        const updateValues = [...safeValues, id];
        
        db.prepare(updateQuery).run(...updateValues);
        
        await addLog(`Schedule updated: ${updates.name || schedule.name}${status ? ` [${status}]` : ''}`, req.user.id, req.user.username);
        
        const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
        const crews = db.prepare('SELECT * FROM crews WHERE scheduleId = ? ORDER BY date, rig').all(id);
        
        res.json({
            schedule: {
                ...sanitizeSchedule(updated),
                crews: crews.map(sanitizeCrew)
            },
            message: 'Schedule updated successfully'
        });
    } catch (err) {
        console.error('[schedules/update] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to update schedule',
            code: 'SCHEDULE_UPDATE_ERROR'
        });
    }
});

/**
 * DELETE /api/schedules/:id
 * Delete a schedule and all its crews
 */
router.delete('/:id', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const id = idValidation.value;
        const db = getDb();
        const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        // Use transaction for data integrity
        const deleteCrews = db.prepare('DELETE FROM crews WHERE scheduleId = ?');
        const deleteSchedule = db.prepare('DELETE FROM schedules WHERE id = ?');
        
        const transaction = db.transaction(() => {
            deleteCrews.run(id);
            deleteSchedule.run(id);
        });
        
        transaction();
        
        await addLog(`Schedule deleted: ${schedule.name}`, req.user.id, req.user.username);
        
        res.json({
            message: 'Schedule deleted successfully',
            code: 'SCHEDULE_DELETED'
        });
    } catch (err) {
        console.error('[schedules/delete] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to delete schedule',
            code: 'SCHEDULE_DELETE_ERROR'
        });
    }
});

/**
 * POST /api/schedules/:id/duplicate
 * Duplicate a schedule with all its crews
 */
router.post('/:id/duplicate', authenticate, authorize('super', 'boss'), createLimiter, async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const id = idValidation.value;
        const { name } = req.body;
        
        const db = getDb();
        const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        const newName = name ? validateScheduleName(name).value : `${schedule.name} (Copy)`;
        
        // Use transaction for data integrity
        const insertSchedule = db.prepare(`
            INSERT INTO schedules (name, month, year, description, locationId, status, createdBy, createdAt)
            VALUES (?, ?, ?, ?, ?, 'draft', ?, datetime('now'))
        `);
        
        const insertCrew = db.prepare(`
            INSERT INTO crews (scheduleId, rig, paramedic, emt, shiftType, date, crewType)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const crews = db.prepare('SELECT * FROM crews WHERE scheduleId = ?').all(id);
        
        const transaction = db.transaction(() => {
            const result = insertSchedule.run(
                newName,
                schedule.month,
                schedule.year,
                schedule.description,
                schedule.locationId,
                req.user.id
            );
            
            const newScheduleId = result.lastInsertRowid;
            
            for (const crew of crews) {
                insertCrew.run(
                    newScheduleId,
                    crew.rig,
                    crew.paramedic,
                    crew.emt,
                    crew.shiftType,
                    crew.date,
                    crew.crewType
                );
            }
            
            return newScheduleId;
        });
        
        const newScheduleId = transaction();
        
        await addLog(`Schedule duplicated: ${schedule.name} -> ${newName}`, req.user.id, req.user.username);
        
        const newSchedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(newScheduleId);
        const newCrews = db.prepare('SELECT * FROM crews WHERE scheduleId = ?').all(newScheduleId);
        
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({
            schedule: {
                ...sanitizeSchedule(newSchedule),
                crews: newCrews.map(sanitizeCrew)
            },
            message: 'Schedule duplicated successfully'
        });
    } catch (err) {
        console.error('[schedules/duplicate] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to duplicate schedule',
            code: 'SCHEDULE_DUPLICATE_ERROR'
        });
    }
});

// ============================================
// CREW ROUTES
// ============================================

/**
 * GET /api/schedules/:id/crews
 * List all crews for a schedule
 */
router.get('/:id/crews', authenticate, async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const db = getDb();
        const schedule = db.prepare('SELECT id FROM schedules WHERE id = ?').get(idValidation.value);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        const crews = db.prepare('SELECT * FROM crews WHERE scheduleId = ? ORDER BY date, rig').all(idValidation.value);
        
        res.json({
            crews: crews.map(sanitizeCrew),
            total: crews.length
        });
    } catch (err) {
        console.error('[crews/list] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve crews',
            code: 'CREWS_LIST_ERROR'
        });
    }
});

/**
 * POST /api/schedules/:id/crews
 * Add a crew to a schedule
 */
router.post('/:id/crews', authenticate, authorize('super', 'boss'), crewLimiter, async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const { rig, paramedic, emt, shiftType, date, crewType } = req.body;
        
        const db = getDb();
        const schedule = db.prepare('SELECT id FROM schedules WHERE id = ?').get(idValidation.value);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        // Validate inputs
        const rigValidation = validateRig(rig);
        const paramedicValidation = validateCrewName(paramedic);
        const emtValidation = validateCrewName(emt);
        const shiftTypeValidation = validateShiftType(shiftType);
        const dateValidation = validateDate(date);
        const crewTypeValidation = validateCrewType(crewType);
        
        const allErrors = [
            ...rigValidation.errors,
            ...paramedicValidation.errors,
            ...emtValidation.errors,
            ...shiftTypeValidation.errors,
            ...dateValidation.errors,
            ...crewTypeValidation.errors
        ];
        
        if (allErrors.length > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                details: allErrors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        const result = db.prepare(`
            INSERT INTO crews (scheduleId, rig, paramedic, emt, shiftType, date, crewType, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
            idValidation.value,
            rigValidation.value,
            paramedicValidation.value,
            emtValidation.value,
            shiftTypeValidation.value,
            dateValidation.value || '',
            crewTypeValidation.value || ''
        );
        
        const crew = db.prepare('SELECT * FROM crews WHERE id = ?').get(result.lastInsertRowid);
        
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({
            crew: sanitizeCrew(crew),
            message: 'Crew added successfully'
        });
    } catch (err) {
        console.error('[crews/create] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to add crew',
            code: 'CREW_CREATE_ERROR'
        });
    }
});

/**
 * POST /api/schedules/:id/crews/batch
 * Batch add crews to a schedule
 */
router.post('/:id/crews/batch', authenticate, authorize('super', 'boss'), crewLimiter, async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const { crews } = req.body;
        
        if (!Array.isArray(crews) || crews.length === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Crews array is required',
                code: 'INVALID_INPUT'
            });
        }
        
        if (crews.length > 500) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Maximum 500 crews allowed per batch',
                code: 'BATCH_LIMIT_EXCEEDED'
            });
        }
        
        const db = getDb();
        const schedule = db.prepare('SELECT id FROM schedules WHERE id = ?').get(idValidation.value);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        const insertCrew = db.prepare(`
            INSERT INTO crews (scheduleId, rig, paramedic, emt, shiftType, date, crewType, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        
        const insertedCrews = [];
        const errors = [];
        
        const transaction = db.transaction(() => {
            for (let i = 0; i < crews.length; i++) {
                const crew = crews[i];
                
                // Validate each crew
                const rigValidation = validateRig(crew.rig);
                const paramedicValidation = validateCrewName(crew.paramedic);
                const emtValidation = validateCrewName(crew.emt);
                const shiftTypeValidation = validateShiftType(crew.shiftType);
                const dateValidation = validateDate(crew.date);
                const crewTypeValidation = validateCrewType(crew.crewType);
                
                if (rigValidation.valid && paramedicValidation.valid && emtValidation.valid &&
                    shiftTypeValidation.valid && dateValidation.valid && crewTypeValidation.valid) {
                    const result = insertCrew.run(
                        idValidation.value,
                        rigValidation.value,
                        paramedicValidation.value,
                        emtValidation.value,
                        shiftTypeValidation.value,
                        dateValidation.value || '',
                        crewTypeValidation.value || ''
                    );
                    insertedCrews.push(result.lastInsertRowid);
                } else {
                    errors.push({
                        index: i,
                        errors: [
                            ...rigValidation.errors,
                            ...paramedicValidation.errors,
                            ...emtValidation.errors,
                            ...shiftTypeValidation.errors,
                            ...dateValidation.errors,
                            ...crewTypeValidation.errors
                        ]
                    });
                }
            }
        });
        
        transaction();
        
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({
            message: `${insertedCrews.length} crews added successfully`,
            added: insertedCrews.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('[crews/batch] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to batch add crews',
            code: 'CREW_BATCH_ERROR'
        });
    }
});

/**
 * PUT /api/crews/:id
 * Update a crew assignment
 */
router.put('/crews/:id', authenticate, authorize('super', 'boss'), crewLimiter, async (req, res) => {
    try {
        const idValidation = validateCrewId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_CREW_ID'
            });
        }
        
        const id = idValidation.value;
        const { rig, paramedic, emt, shiftType, date, crewType } = req.body;
        
        const db = getDb();
        const crew = db.prepare('SELECT * FROM crews WHERE id = ?').get(id);
        
        if (!crew) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Crew assignment not found',
                code: 'CREW_NOT_FOUND'
            });
        }
        
        const updates = {};
        
        if (rig !== undefined) updates.rig = validateRig(rig).value;
        if (paramedic !== undefined) updates.paramedic = validateCrewName(paramedic).value;
        if (emt !== undefined) updates.emt = validateCrewName(emt).value;
        if (shiftType !== undefined) updates.shiftType = validateShiftType(shiftType).value;
        if (date !== undefined) updates.date = validateDate(date).value || '';
        if (crewType !== undefined) updates.crewType = validateCrewType(crewType).value || '';
        
        if (Object.keys(updates).length === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'No valid updates provided',
                code: 'NO_UPDATES'
            });
        }
        
        const validCrewCols = new Set(['rig', 'paramedic', 'emt', 'shiftType', 'date', 'crewType']);
        const setClauses = Object.keys(updates).filter(k => validCrewCols.has(k)).map(key => `${key} = ?`);
        setClauses.push("updatedAt = datetime('now')");
        const safeValues = Object.keys(updates).filter(k => validCrewCols.has(k)).map(k => updates[k]);

        const updateQuery = `UPDATE crews SET ${setClauses.join(', ')} WHERE id = ?`;
        db.prepare(updateQuery).run(...safeValues, id);
        
        const updated = db.prepare('SELECT * FROM crews WHERE id = ?').get(id);
        
        res.json({
            crew: sanitizeCrew(updated),
            message: 'Crew updated successfully'
        });
    } catch (err) {
        console.error('[crews/update] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to update crew',
            code: 'CREW_UPDATE_ERROR'
        });
    }
});

/**
 * DELETE /api/crews/:id
 * Remove a crew assignment
 */
router.delete('/crews/:id', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const idValidation = validateCrewId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_CREW_ID'
            });
        }
        
        const id = idValidation.value;
        const db = getDb();
        const crew = db.prepare('SELECT * FROM crews WHERE id = ?').get(id);
        
        if (!crew) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Crew assignment not found',
                code: 'CREW_NOT_FOUND'
            });
        }
        
        db.prepare('DELETE FROM crews WHERE id = ?').run(id);
        
        res.json({
            message: 'Crew assignment removed',
            code: 'CREW_DELETED'
        });
    } catch (err) {
        console.error('[crews/delete] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to delete crew',
            code: 'CREW_DELETE_ERROR'
        });
    }
});

/**
 * DELETE /api/schedules/:id/crews
 * Remove all crews from a schedule
 */
router.delete('/:id/crews', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const idValidation = validateScheduleId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_SCHEDULE_ID'
            });
        }
        
        const db = getDb();
        const schedule = db.prepare('SELECT id, name FROM schedules WHERE id = ?').get(idValidation.value);
        
        if (!schedule) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Schedule not found',
                code: 'SCHEDULE_NOT_FOUND'
            });
        }
        
        const result = db.prepare('DELETE FROM crews WHERE scheduleId = ?').run(idValidation.value);
        
        await addLog(`All crews cleared from schedule: ${schedule.name}`, req.user.id, req.user.username);
        
        res.json({
            message: `${result.changes} crew assignments removed`,
            code: 'CREWS_CLEARED'
        });
    } catch (err) {
        console.error('[crews/clear] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to clear crews',
            code: 'CREWS_CLEAR_ERROR'
        });
    }
});

// ============================================
// CREW TEMPLATES ROUTES
// ============================================

/**
 * GET /api/schedules/templates
 * List all crew templates
 */
router.get('/templates', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const templates = db.prepare('SELECT * FROM crew_templates ORDER BY name').all();
        res.json({ templates, total: templates.length });
    } catch (err) {
        console.error('[templates/list] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve crew templates',
            code: 'TEMPLATES_LIST_ERROR'
        });
    }
});

/**
 * POST /api/schedules/templates
 * Create a new crew template (boss/super only)
 */
router.post('/templates', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const { name, rig, paramedic, emt, shiftType, crewType } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Template name is required',
                code: 'VALIDATION_ERROR'
            });
        }

        const shiftValidation = validateShiftType(shiftType);
        const crewValidation = validateCrewType(crewType);

        const db = getDb();
        const result = db.prepare(`
            INSERT INTO crew_templates (name, rig, paramedic, emt, shiftType, crewType, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
            name.trim().substring(0, 100),
            validateRig(rig).value,
            validateCrewName(paramedic).value,
            validateCrewName(emt).value,
            shiftValidation.value || 'Day',
            crewValidation.value || 'ALS'
        );

        const template = db.prepare('SELECT * FROM crew_templates WHERE id = ?').get(result.lastInsertRowid);
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({ template, message: 'Template created successfully' });
    } catch (err) {
        console.error('[templates/create] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to create crew template',
            code: 'TEMPLATE_CREATE_ERROR'
        });
    }
});

/**
 * PUT /api/schedules/templates/:id
 * Update a crew template (boss/super only)
 */
router.put('/templates/:id', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const templateId = parseInt(req.params.id, 10);
        if (isNaN(templateId) || templateId < 1) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Invalid template ID',
                code: 'INVALID_TEMPLATE_ID'
            });
        }

        const db = getDb();
        const template = db.prepare('SELECT * FROM crew_templates WHERE id = ?').get(templateId);
        if (!template) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Template not found',
                code: 'TEMPLATE_NOT_FOUND'
            });
        }

        const { name, rig, paramedic, emt, shiftType, crewType } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = String(name).trim().substring(0, 100);
        if (rig !== undefined) updates.rig = validateRig(rig).value;
        if (paramedic !== undefined) updates.paramedic = validateCrewName(paramedic).value;
        if (emt !== undefined) updates.emt = validateCrewName(emt).value;
        if (shiftType !== undefined) updates.shiftType = validateShiftType(shiftType).value || 'Day';
        if (crewType !== undefined) updates.crewType = validateCrewType(crewType).value || 'ALS';

        if (Object.keys(updates).length === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'No valid updates provided',
                code: 'NO_UPDATES'
            });
        }

        const validTemplateCols = new Set(['name', 'rig', 'paramedic', 'emt', 'shiftType', 'crewType']);
        const setClauses = Object.keys(updates).filter(k => validTemplateCols.has(k)).map(k => `${k} = ?`);
        setClauses.push("updatedAt = datetime('now')");
        const safeValues = Object.keys(updates).filter(k => validTemplateCols.has(k)).map(k => updates[k]);
        db.prepare(`UPDATE crew_templates SET ${setClauses.join(', ')} WHERE id = ?`)
            .run(...safeValues, templateId);

        const updated = db.prepare('SELECT * FROM crew_templates WHERE id = ?').get(templateId);
        res.json({ template: updated, message: 'Template updated successfully' });
    } catch (err) {
        console.error('[templates/update] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to update crew template',
            code: 'TEMPLATE_UPDATE_ERROR'
        });
    }
});

/**
 * DELETE /api/schedules/templates/:id
 * Delete a crew template (super only)
 */
router.delete('/templates/:id', authenticate, authorize('super'), async (req, res) => {
    try {
        const templateId = parseInt(req.params.id, 10);
        if (isNaN(templateId) || templateId < 1) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Invalid template ID',
                code: 'INVALID_TEMPLATE_ID'
            });
        }

        const db = getDb();
        const result = db.prepare('DELETE FROM crew_templates WHERE id = ?').run(templateId);
        if (result.changes === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Template not found',
                code: 'TEMPLATE_NOT_FOUND'
            });
        }

        res.json({ message: 'Template deleted successfully', code: 'TEMPLATE_DELETED' });
    } catch (err) {
        console.error('[templates/delete] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to delete crew template',
            code: 'TEMPLATE_DELETE_ERROR'
        });
    }
});

module.exports = router;
