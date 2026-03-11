/**
 * Location Management Routes
 * Secure location management with comprehensive validation
 * 
 * GET    /api/locations — List all locations
 * GET    /api/locations/:id — Get a single location
 * POST   /api/locations — Create location (super)
 * PUT    /api/locations/:id — Update location (super)
 * DELETE /api/locations/:id — Deactivate location (super)
 * POST   /api/locations/batch — Batch create locations (super)
 * 
 * @module routes/locations
 */

const express = require('express');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // Validation rules
    NAME_MIN_LENGTH: 1,
    NAME_MAX_LENGTH: 100,
    CODE_MIN_LENGTH: 2,
    CODE_MAX_LENGTH: 10,
    ADDRESS_MAX_LENGTH: 200,
    CITY_MAX_LENGTH: 100,
    STATE_MAX_LENGTH: 50,
    ZIP_MAX_LENGTH: 20,
    PHONE_MAX_LENGTH: 20,
    
    // Pagination
    MAX_RESULTS_PER_PAGE: 100,
    DEFAULT_PAGE_SIZE: 50,
    
    // Valid state codes (US states)
    VALID_STATES: [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
        'DC', 'PR', 'VI', 'GU', 'AS', 'MP'
    ],
    
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
    max: 30, // 30 locations per hour
    message: { error: 'Too many locations created', retryAfter: 3600 }
});

const updateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 updates per minute
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
 * Validate location name
 * @param {string} name - Location name
 * @returns {Object} Validation result
 */
function validateName(name) {
    const errors = [];
    
    if (!name || typeof name !== 'string') {
        errors.push('Location name is required');
        return { valid: false, errors, value: '' };
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length < CONSTANTS.NAME_MIN_LENGTH) {
        errors.push('Location name cannot be empty');
    }
    
    if (trimmed.length > CONSTANTS.NAME_MAX_LENGTH) {
        errors.push(`Location name must be at most ${CONSTANTS.NAME_MAX_LENGTH} characters`);
    }
    
    // Check for XSS patterns
    if (/<script|javascript:|on\w+=/i.test(trimmed)) {
        errors.push('Location name contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate location code
 * @param {string} code - Location code
 * @returns {Object} Validation result
 */
function validateCode(code) {
    const errors = [];
    
    if (!code || typeof code !== 'string') {
        errors.push('Location code is required');
        return { valid: false, errors, value: '' };
    }
    
    const trimmed = code.trim().toUpperCase();
    
    if (trimmed.length < CONSTANTS.CODE_MIN_LENGTH) {
        errors.push(`Location code must be at least ${CONSTANTS.CODE_MIN_LENGTH} characters`);
    }
    
    if (trimmed.length > CONSTANTS.CODE_MAX_LENGTH) {
        errors.push(`Location code must be at most ${CONSTANTS.CODE_MAX_LENGTH} characters`);
    }
    
    // Only allow alphanumeric
    if (!/^[A-Z0-9]+$/.test(trimmed)) {
        errors.push('Location code can only contain letters and numbers');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate location ID
 * @param {string} id - Location ID
 * @returns {Object} Validation result
 */
function validateLocationId(id) {
    const errors = [];
    
    if (!id) {
        errors.push('Location ID is required');
        return { valid: false, errors, value: null };
    }
    
    const parsed = parseInt(id, 10);
    
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
 * Validate address
 * @param {string} address - Address
 * @returns {Object} Validation result
 */
function validateAddress(address) {
    if (!address) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const trimmed = sanitizeString(address, CONSTANTS.ADDRESS_MAX_LENGTH);
    
    // Check for XSS patterns
    if (/<script|javascript:|on\w+=/i.test(trimmed)) {
        errors.push('Address contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate city
 * @param {string} city - City name
 * @returns {Object} Validation result
 */
function validateCity(city) {
    if (!city) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const trimmed = sanitizeString(city, CONSTANTS.CITY_MAX_LENGTH);
    
    // Check for XSS patterns
    if (/<script|javascript:|on\w+=/i.test(trimmed)) {
        errors.push('City name contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate state
 * @param {string} state - State code
 * @returns {Object} Validation result
 */
function validateState(state) {
    if (!state) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const trimmed = state.trim().toUpperCase();
    
    if (!CONSTANTS.VALID_STATES.includes(trimmed)) {
        errors.push('Invalid state code');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate ZIP code
 * @param {string} zip - ZIP code
 * @returns {Object} Validation result
 */
function validateZip(zip) {
    if (!zip) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const trimmed = zip.trim().replace(/[\s\-]/g, '');
    
    if (!/^\d{5}(\d{4})?$/.test(trimmed)) {
        errors.push('ZIP code must be 5 or 9 digits');
    }
    
    if (trimmed.length > CONSTANTS.ZIP_MAX_LENGTH) {
        errors.push('ZIP code is too long');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate phone number
 * @param {string} phone - Phone number
 * @returns {Object} Validation result
 */
function validatePhone(phone) {
    if (!phone) {
        return { valid: true, errors: [], value: '' };
    }
    
    const errors = [];
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    
    if (!/^\+?[0-9]{10,15}$/.test(cleaned)) {
        errors.push('Phone number must be 10-15 digits');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: cleaned
    };
}

/**
 * Sanitize location object for response
 * @param {Object} location - Location object
 * @returns {Object} Sanitized location object
 */
function sanitizeLocation(location) {
    if (!location) return null;
    
    return {
        id: location.id,
        name: location.name,
        code: location.code,
        address: location.address || '',
        city: location.city || '',
        state: location.state || '',
        zip: location.zip || '',
        phone: location.phone || '',
        active: location.active !== undefined ? location.active : true,
        createdAt: location.createdAt,
        updatedAt: location.updatedAt || null
    };
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/locations
 * List all locations with filtering and pagination
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const { active, page, limit, search } = req.query;
        
        // Build query
        let sql = 'SELECT * FROM locations WHERE 1=1';
        const params = [];
        
        // Active filter
        if (active !== undefined) {
            const activeValue = active === 'true' || active === '1' ? 1 : 0;
            sql += ' AND active = ?';
            params.push(activeValue);
        }
        
        // Search filter
        if (search && typeof search === 'string') {
            const searchSanitized = sanitizeString(search, 50);
            sql += ' AND (name LIKE ? OR code LIKE ? OR city LIKE ?)';
            params.push(`%${searchSanitized}%`, `%${searchSanitized}%`, `%${searchSanitized}%`);
        }
        
        // Add pagination
        const pageSize = Math.min(parseInt(limit) || CONSTANTS.DEFAULT_PAGE_SIZE, CONSTANTS.MAX_RESULTS_PER_PAGE);
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const offset = (pageNum - 1) * pageSize;
        
        sql += ' ORDER BY name LIMIT ? OFFSET ?';
        params.push(pageSize, offset);
        
        const locations = db.prepare(sql).all(...params);
        
        // Get total count
        let countSql = 'SELECT COUNT(*) as total FROM locations WHERE 1=1';
        const countParams = params.slice(0, params.length - 2);
        const { total } = db.prepare(countSql).get(...countParams);
        
        res.json({
            locations: locations.map(sanitizeLocation),
            pagination: {
                page: pageNum,
                limit: pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (err) {
        console.error('[locations/list] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve locations',
            code: 'LOCATIONS_LIST_ERROR'
        });
    }
});

/**
 * GET /api/locations/:id
 * Get a single location by ID
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const idValidation = validateLocationId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_LOCATION_ID'
            });
        }
        
        const db = getDb();
        const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(idValidation.value);
        
        if (!location) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Location not found',
                code: 'LOCATION_NOT_FOUND'
            });
        }
        
        res.json({ location: sanitizeLocation(location) });
    } catch (err) {
        console.error('[locations/get] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to retrieve location',
            code: 'LOCATION_GET_ERROR'
        });
    }
});

/**
 * POST /api/locations
 * Create a new location (admin only)
 */
router.post('/', authenticate, authorize('super'), createLimiter, async (req, res) => {
    try {
        const { name, code, address, city, state, zip, phone } = req.body;
        
        // Validate all inputs
        const nameValidation = validateName(name);
        const codeValidation = validateCode(code);
        const addressValidation = validateAddress(address);
        const cityValidation = validateCity(city);
        const stateValidation = validateState(state);
        const zipValidation = validateZip(zip);
        const phoneValidation = validatePhone(phone);
        
        const allErrors = [
            ...nameValidation.errors,
            ...codeValidation.errors,
            ...addressValidation.errors,
            ...cityValidation.errors,
            ...stateValidation.errors,
            ...zipValidation.errors,
            ...phoneValidation.errors
        ];
        
        if (allErrors.length > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                details: allErrors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        const db = getDb();
        
        // Check for duplicate code
        const existing = db.prepare('SELECT id FROM locations WHERE code = ?').get(codeValidation.value);
        if (existing) {
            return res.status(CONSTANTS.HTTP_STATUS.CONFLICT).json({
                error: 'Location code already exists',
                code: 'CODE_EXISTS'
            });
        }
        
        const result = db.prepare(
            'INSERT INTO locations (name, code, address, city, state, zip, phone, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime(\'now\'))'
        ).run(
            nameValidation.value,
            codeValidation.value,
            addressValidation.value,
            cityValidation.value,
            stateValidation.value,
            zipValidation.value,
            phoneValidation.value
        );
        
        await addLog(`Location created: ${nameValidation.value} (${codeValidation.value})`, req.user.id, req.user.username);
        
        const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(result.lastInsertRowid);
        
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({
            location: sanitizeLocation(location),
            message: 'Location created successfully'
        });
    } catch (err) {
        console.error('[locations/create] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to create location',
            code: 'LOCATION_CREATE_ERROR'
        });
    }
});

/**
 * PUT /api/locations/:id
 * Update an existing location (admin only)
 */
router.put('/:id', authenticate, authorize('super'), updateLimiter, async (req, res) => {
    try {
        const idValidation = validateLocationId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_LOCATION_ID'
            });
        }
        
        const id = idValidation.value;
        const { name, code, address, city, state, zip, phone, active } = req.body;
        
        const db = getDb();
        const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
        
        if (!location) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Location not found',
                code: 'LOCATION_NOT_FOUND'
            });
        }
        
        // Validate inputs
        const updates = {};
        const errors = [];
        
        if (name !== undefined) {
            const nameValidation = validateName(name);
            if (!nameValidation.valid) {
                errors.push(...nameValidation.errors);
            } else {
                updates.name = nameValidation.value;
            }
        }
        
        if (code !== undefined) {
            const codeValidation = validateCode(code);
            if (!codeValidation.valid) {
                errors.push(...codeValidation.errors);
            } else if (codeValidation.value !== location.code) {
                // Check for duplicate code
                const dup = db.prepare('SELECT id FROM locations WHERE code = ? AND id != ?').get(codeValidation.value, id);
                if (dup) {
                    return res.status(CONSTANTS.HTTP_STATUS.CONFLICT).json({
                        error: 'Location code already exists',
                        code: 'CODE_EXISTS'
                    });
                }
                updates.code = codeValidation.value;
            }
        }
        
        if (address !== undefined) {
            const addressValidation = validateAddress(address);
            if (!addressValidation.valid) {
                errors.push(...addressValidation.errors);
            } else {
                updates.address = addressValidation.value;
            }
        }
        
        if (city !== undefined) {
            const cityValidation = validateCity(city);
            if (!cityValidation.valid) {
                errors.push(...cityValidation.errors);
            } else {
                updates.city = cityValidation.value;
            }
        }
        
        if (state !== undefined) {
            const stateValidation = validateState(state);
            if (!stateValidation.valid) {
                errors.push(...stateValidation.errors);
            } else {
                updates.state = stateValidation.value;
            }
        }
        
        if (zip !== undefined) {
            const zipValidation = validateZip(zip);
            if (!zipValidation.valid) {
                errors.push(...zipValidation.errors);
            } else {
                updates.zip = zipValidation.value;
            }
        }
        
        if (phone !== undefined) {
            const phoneValidation = validatePhone(phone);
            if (!phoneValidation.valid) {
                errors.push(...phoneValidation.errors);
            } else {
                updates.phone = phoneValidation.value;
            }
        }
        
        if (active !== undefined) {
            if (typeof active !== 'boolean' && active !== 0 && active !== 1) {
                errors.push('Active must be a boolean');
            } else {
                updates.active = active ? 1 : 0;
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
        
        // Build update query
        const setClauses = Object.keys(updates).map(key => `${key} = ?`);
        setClauses.push("updatedAt = datetime('now')");
        
        const updateQuery = `UPDATE locations SET ${setClauses.join(', ')} WHERE id = ?`;
        db.prepare(updateQuery).run(...Object.values(updates), id);
        
        await addLog(`Location updated: ${updates.name || location.name}`, req.user.id, req.user.username);
        
        const updated = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
        
        res.json({
            location: sanitizeLocation(updated),
            message: 'Location updated successfully'
        });
    } catch (err) {
        console.error('[locations/update] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to update location',
            code: 'LOCATION_UPDATE_ERROR'
        });
    }
});

/**
 * DELETE /api/locations/:id
 * Deactivate a location (admin only) - soft delete
 */
router.delete('/:id', authenticate, authorize('super'), async (req, res) => {
    try {
        const idValidation = validateLocationId(req.params.id);
        if (!idValidation.valid) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_LOCATION_ID'
            });
        }
        
        const id = idValidation.value;
        const db = getDb();
        const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
        
        if (!location) {
            return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
                error: 'Location not found',
                code: 'LOCATION_NOT_FOUND'
            });
        }
        
        // Check if location has users assigned
        const { userCount } = db.prepare('SELECT COUNT(*) as userCount FROM users WHERE locationId = ?').get(id);
        
        if (userCount > 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: `Cannot deactivate location with ${userCount} assigned users`,
                code: 'LOCATION_HAS_USERS'
            });
        }
        
        // Soft delete
        db.prepare("UPDATE locations SET active = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
        
        await addLog(`Location deactivated: ${location.name}`, req.user.id, req.user.username);
        
        res.json({
            message: 'Location deactivated successfully',
            code: 'LOCATION_DEACTIVATED'
        });
    } catch (err) {
        console.error('[locations/delete] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to deactivate location',
            code: 'LOCATION_DELETE_ERROR'
        });
    }
});

/**
 * POST /api/locations/batch
 * Batch create locations (admin only)
 */
router.post('/batch', authenticate, authorize('super'), createLimiter, async (req, res) => {
    try {
        const { locations } = req.body;
        
        if (!Array.isArray(locations) || locations.length === 0) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Locations array is required',
                code: 'INVALID_INPUT'
            });
        }
        
        if (locations.length > 50) {
            return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
                error: 'Maximum 50 locations allowed per batch',
                code: 'BATCH_LIMIT_EXCEEDED'
            });
        }
        
        const db = getDb();
        const insertStmt = db.prepare(
            'INSERT INTO locations (name, code, address, city, state, zip, phone, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime(\'now\'))'
        );
        
        const inserted = [];
        const errors = [];
        
        const transaction = db.transaction(() => {
            for (let i = 0; i < locations.length; i++) {
                const loc = locations[i];
                
                const nameValidation = validateName(loc.name);
                const codeValidation = validateCode(loc.code);
                const addressValidation = validateAddress(loc.address);
                const cityValidation = validateCity(loc.city);
                const stateValidation = validateState(loc.state);
                const zipValidation = validateZip(loc.zip);
                const phoneValidation = validatePhone(loc.phone);
                
                const allErrors = [
                    ...nameValidation.errors,
                    ...codeValidation.errors,
                    ...addressValidation.errors,
                    ...cityValidation.errors,
                    ...stateValidation.errors,
                    ...zipValidation.errors,
                    ...phoneValidation.errors
                ];
                
                if (allErrors.length > 0) {
                    errors.push({ index: i, errors: allErrors });
                    continue;
                }
                
                // Check for duplicate code
                const existing = db.prepare('SELECT id FROM locations WHERE code = ?').get(codeValidation.value);
                if (existing) {
                    errors.push({ index: i, errors: [`Code ${codeValidation.value} already exists`] });
                    continue;
                }
                
                try {
                    const result = insertStmt.run(
                        nameValidation.value,
                        codeValidation.value,
                        addressValidation.value,
                        cityValidation.value,
                        stateValidation.value,
                        zipValidation.value,
                        phoneValidation.value
                    );
                    inserted.push(result.lastInsertRowid);
                } catch (err) {
                    errors.push({ index: i, errors: ['Database error'] });
                }
            }
        });
        
        transaction();
        
        await addLog(`Batch created ${inserted.length} locations`, req.user.id, req.user.username);
        
        res.status(CONSTANTS.HTTP_STATUS.CREATED).json({
            message: `${inserted.length} locations created successfully`,
            created: inserted.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('[locations/batch] Error:', err.message);
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to batch create locations',
            code: 'LOCATION_BATCH_ERROR'
        });
    }
});

module.exports = router;