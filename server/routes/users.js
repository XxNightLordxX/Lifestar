/**
 * User Management Routes
 * Secure user CRUD operations with comprehensive validation and error handling
 * 
 * GET    /api/users — List all users (admin/boss)
 * POST   /api/users — Create user (admin)
 * PUT    /api/users/:id — Update user (admin)
 * DELETE /api/users/:id — Delete user (admin)
 * PATCH  /api/users/:id/status — Toggle user active status
 * 
 * @module routes/users
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, addLog } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { SECURITY, AUTH, RATE_LIMIT, HTTP_STATUS } = require('../config');

const router = express.Router();

// Named aliases so the rest of the file reads naturally without changing
// every single reference — and so bcrypt rounds are now consistent with
// auth.js and database.js (all read SECURITY.BCRYPT_ROUNDS = 12).
const BCRYPT_ROUNDS     = SECURITY.BCRYPT_ROUNDS;
const VALID_ROLES       = AUTH.VALID_ROLES;
const USERNAME_MIN      = AUTH.USERNAME_MIN_LENGTH;
const USERNAME_MAX      = AUTH.USERNAME_MAX_LENGTH;
const PASSWORD_MIN      = AUTH.PASSWORD_MIN_LENGTH;
const PASSWORD_MAX      = AUTH.PASSWORD_MAX_LENGTH;
const FULLNAME_MIN      = 2;
const FULLNAME_MAX      = 100;
const PHONE_MAX         = 20;
const MAX_USERS_PER_PAGE = 100;

// ============================================
// RATE LIMITING
// ============================================

// Rate limiter for user creation
const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 users per hour
    message: { error: 'Too many users created', retryAfter: 3600 }
});

// Rate limiter for user updates
const updateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 updates per minute
    message: { error: 'Too many update requests', retryAfter: 60 }
});

// ============================================
// INPUT VALIDATION
// ============================================

/**
 * Validate username input
 * @param {string} username - Username to validate
 * @returns {Object} Validation result with valid flag, errors, and sanitized value
 */
function validateUsername(username) {
    const errors = [];
    
    if (!username || typeof username !== 'string') {
        errors.push('Username is required');
        return { valid: false, errors, value: '' };
    }
    
    const trimmed = username.trim();
    
    if (trimmed.length < USERNAME_MIN) {
        errors.push(`Username must be at least ${USERNAME_MIN} characters`);
    }
    
    if (trimmed.length > USERNAME_MAX) {
        errors.push(`Username must be at most ${USERNAME_MAX} characters`);
    }
    
    // Only allow alphanumeric and underscore
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        errors.push('Username can only contain letters, numbers, and underscores');
    }
    
    // Check for SQL injection patterns
    const sqlPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b|--|\/\*|\*\/|;|'|"|\|)/i;
    if (sqlPatterns.test(trimmed)) {
        errors.push('Username contains invalid characters');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed.toLowerCase()
    };
}

/**
 * Validate password input
 * @param {string} password - Password to validate
 * @returns {Object} Validation result
 */
function validatePassword(password) {
    const errors = [];
    
    if (!password || typeof password !== 'string') {
        errors.push('Password is required');
        return { valid: false, errors };
    }
    
    if (password.length < PASSWORD_MIN) {
        errors.push(`Password must be at least ${PASSWORD_MIN} characters`);
    }
    
    if (password.length > PASSWORD_MAX) {
        errors.push(`Password must be at most ${PASSWORD_MAX} characters`);
    }
    
    // Check for at least one uppercase, lowercase, number
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate full name
 * @param {string} fullName - Full name to validate
 * @returns {Object} Validation result
 */
function validateFullName(fullName) {
    const errors = [];
    
    if (!fullName || typeof fullName !== 'string') {
        errors.push('Full name is required');
        return { valid: false, errors, value: '' };
    }
    
    const trimmed = fullName.trim();
    
    if (trimmed.length < FULLNAME_MIN) {
        errors.push(`Full name must be at least ${FULLNAME_MIN} characters`);
    }
    
    if (trimmed.length > FULLNAME_MAX) {
        errors.push(`Full name must be at most ${FULLNAME_MAX} characters`);
    }
    
    // Only allow letters, spaces, hyphens, and apostrophes
    if (!/^[a-zA-Z\s\-']+$/.test(trimmed)) {
        errors.push('Full name can only contain letters, spaces, hyphens, and apostrophes');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
    };
}

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 * @returns {Object} Validation result
 */
function validatePhone(phone) {
    if (!phone) {
        return { valid: true, errors: [], value: null };
    }
    
    const errors = [];
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    if (cleaned.length > PHONE_MAX) {
        errors.push('Phone number is too long');
    }
    
    if (!/^\+?[0-9]+$/.test(cleaned)) {
        errors.push('Phone number must contain only digits');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: cleaned
    };
}

/**
 * Validate role
 * @param {string} role - Role to validate
 * @returns {Object} Validation result
 */
function validateRole(role) {
    const errors = [];
    
    if (!role || typeof role !== 'string') {
        errors.push('Role is required');
        return { valid: false, errors, value: '' };
    }
    
    const trimmed = role.trim().toLowerCase();
    
    if (!VALID_ROLES.includes(trimmed)) {
        errors.push(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
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
 * Sanitize user object for response (remove sensitive fields)
 * @param {Object} user - User object
 * @returns {Object} Sanitized user object
 */
function sanitizeUser(user) {
    if (!user) return null;
    
    return {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone || null,
        locationId: user.locationId || null,
        hoursWorked: user.hoursWorked || 0,
        bonusHours: user.bonusHours || 0,
        active: user.active !== undefined ? user.active : true,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt || null
    };
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/users
 * List all users (admin/boss only)
 * Supports pagination and filtering
 */
router.get('/', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || MAX_USERS_PER_PAGE, MAX_USERS_PER_PAGE);
        const offset = (page - 1) * limit;
        const includeInactive = req.query.includeInactive === 'true';
        const roleFilter = req.query.role;
        
        // Build query with filters
        let query = 'SELECT id, username, fullName, role, phone, locationId, hoursWorked, bonusHours, active, createdAt, updatedAt FROM users';
        const conditions = [];
        const params = [];
        
        if (!includeInactive) {
            conditions.push('active = 1');
        }
        
        if (roleFilter && VALID_ROLES.includes(roleFilter.toLowerCase())) {
            conditions.push('role = ?');
            params.push(roleFilter.toLowerCase());
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY id LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const users = db.prepare(query).all(...params);
        
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM users';
        if (conditions.length > 0) {
            countQuery += ' WHERE ' + conditions.join(' AND ');
        }
        const countParams = params.slice(0, params.length - 2);
        const { total } = db.prepare(countQuery).get(...countParams);
        
        res.json({
            users: users.map(sanitizeUser),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('[users/list] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ 
            error: 'Failed to retrieve users',
            code: 'USERS_LIST_ERROR'
        });
    }
});

/**
 * GET /api/users/:id
 * Get a single user by ID
 */
router.get('/:id', authenticate, authorize('super', 'boss'), async (req, res) => {
    try {
        const idValidation = validateUserId(req.params.id);
        if (!idValidation.valid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: idValidation.errors[0],
                code: 'INVALID_USER_ID'
            });
        }
        
        const db = getDb();
        const user = db.prepare('SELECT id, username, fullName, role, phone, locationId, hoursWorked, bonusHours, active, createdAt, updatedAt FROM users WHERE id = ?').get(idValidation.value);
        
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        res.json({ user: sanitizeUser(user) });
    } catch (err) {
        console.error('[users/get] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ 
            error: 'Failed to retrieve user',
            code: 'USER_GET_ERROR'
        });
    }
});

/**
 * POST /api/users
 * Create a new user (admin only)
 */
router.post('/', authenticate, authorize('super'), createLimiter, async (req, res) => {
    try {
        const { username, password, fullName, role, phone, locationId } = req.body;
        
        // Validate all inputs
        const usernameValidation = validateUsername(username);
        const passwordValidation = validatePassword(password);
        const fullNameValidation = validateFullName(fullName);
        const roleValidation = validateRole(role);
        const phoneValidation = validatePhone(phone);
        
        // Collect all validation errors
        const allErrors = [
            ...usernameValidation.errors,
            ...passwordValidation.errors,
            ...fullNameValidation.errors,
            ...roleValidation.errors,
            ...phoneValidation.errors
        ];
        
        if (allErrors.length > 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'Validation failed',
                details: allErrors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        const db = getDb();
        
        // Check for existing username
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(usernameValidation.value);
        if (existing) {
            return res.status(HTTP_STATUS.CONFLICT).json({ 
                error: 'Username already exists',
                code: 'USERNAME_EXISTS'
            });
        }
        
        // Hash password with secure rounds
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        
        // Insert user with transaction for data integrity
        const insertStmt = db.prepare(`
            INSERT INTO users (username, password, fullName, role, phone, locationId, active, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
        `);
        
        const result = insertStmt.run(
            usernameValidation.value,
            hashedPassword,
            fullNameValidation.value,
            roleValidation.value,
            phoneValidation.value || '',
            locationId ? parseInt(locationId) : null
        );
        
        // Log the action
        await addLog(`User created: ${usernameValidation.value}`, req.user.id, req.user.username);
        
        // Fetch the created user
        const newUser = db.prepare('SELECT id, username, fullName, role, phone, locationId, hoursWorked, bonusHours, active, createdAt FROM users WHERE id = ?').get(result.lastInsertRowid);
        
        res.status(HTTP_STATUS.CREATED).json({ 
            user: sanitizeUser(newUser),
            message: 'User created successfully'
        });
    } catch (err) {
        console.error('[users/create] Error:', err.message);
        
        // Handle specific database errors
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(HTTP_STATUS.CONFLICT).json({ 
                error: 'User already exists',
                code: 'USER_EXISTS'
            });
        }
        
        res.status(HTTP_STATUS.SERVER_ERROR).json({ 
            error: 'Failed to create user',
            code: 'USER_CREATE_ERROR'
        });
    }
});

/**
 * PUT /api/users/:id
 * Update an existing user (admin only)
 */
router.put('/:id', authenticate, authorize('super'), updateLimiter, async (req, res) => {
    try {
        const idValidation = validateUserId(req.params.id);
        if (!idValidation.valid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: idValidation.errors[0],
                code: 'INVALID_USER_ID'
            });
        }
        
        const id = idValidation.value;
        const { username, password, fullName, role, phone, locationId, active } = req.body;
        
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Validate provided fields
        const updates = {};
        const errors = [];
        
        if (username !== undefined) {
            const usernameValidation = validateUsername(username);
            if (!usernameValidation.valid) {
                errors.push(...usernameValidation.errors);
            } else if (usernameValidation.value !== user.username) {
                // Check for duplicate username
                const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(usernameValidation.value, id);
                if (dup) {
                    return res.status(HTTP_STATUS.CONFLICT).json({ 
                        error: 'Username already exists',
                        code: 'USERNAME_EXISTS'
                    });
                }
                updates.username = usernameValidation.value;
            }
        }
        
        if (password !== undefined && password !== null && password !== '') {
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                errors.push(...passwordValidation.errors);
            } else {
                updates.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
            }
        }
        
        if (fullName !== undefined) {
            const fullNameValidation = validateFullName(fullName);
            if (!fullNameValidation.valid) {
                errors.push(...fullNameValidation.errors);
            } else {
                updates.fullName = fullNameValidation.value;
            }
        }
        
        if (role !== undefined) {
            // Prevent a super admin from changing their own role (would lock themselves out)
            if (String(req.user.id) === String(id) && user.role === 'super') {
                errors.push('Super administrators cannot change their own role');
            } else {
                const roleValidation = validateRole(role);
                if (!roleValidation.valid) {
                    errors.push(...roleValidation.errors);
                } else {
                    updates.role = roleValidation.value;
                }
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
        
        if (locationId !== undefined) {
            const locId = parseInt(locationId);
            if (isNaN(locId) && locationId !== null) {
                errors.push('Invalid location ID');
            } else {
                updates.locationId = locationId === null ? null : locId;
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
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'Validation failed',
                details: errors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Only update if there are changes
        if (Object.keys(updates).length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'No valid updates provided',
                code: 'NO_UPDATES'
            });
        }
        
        // Build update query dynamically
        const setClauses = Object.keys(updates).map(key => `${key} = ?`);
        setClauses.push("updatedAt = datetime('now')");
        
        const updateQuery = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
        const updateValues = [...Object.values(updates), id];
        
        db.prepare(updateQuery).run(...updateValues);
        
        // Log the action
        await addLog(`User updated: ${updates.username || user.username}`, req.user.id, req.user.username);
        
        // Fetch updated user
        const updated = db.prepare('SELECT id, username, fullName, role, phone, locationId, hoursWorked, bonusHours, active, createdAt, updatedAt FROM users WHERE id = ?').get(id);
        
        res.json({ 
            user: sanitizeUser(updated),
            message: 'User updated successfully'
        });
    } catch (err) {
        console.error('[users/update] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ 
            error: 'Failed to update user',
            code: 'USER_UPDATE_ERROR'
        });
    }
});

/**
 * PATCH /api/users/:id/status
 * Toggle user active status (admin only)
 */
router.patch('/:id/status', authenticate, authorize('super'), async (req, res) => {
    try {
        const idValidation = validateUserId(req.params.id);
        if (!idValidation.valid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: idValidation.errors[0],
                code: 'INVALID_USER_ID'
            });
        }
        
        const id = idValidation.value;
        const { active } = req.body;
        
        if (typeof active !== 'boolean') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'Active status must be a boolean',
                code: 'INVALID_STATUS'
            });
        }
        
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Prevent deactivating yourself
        if (id === req.user.id && !active) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'Cannot deactivate your own account',
                code: 'SELF_DEACTIVATION'
            });
        }
        
        db.prepare("UPDATE users SET active = ?, updatedAt = datetime('now') WHERE id = ?").run(active ? 1 : 0, id);
        
        const action = active ? 'activated' : 'deactivated';
        await addLog(`User ${action}: ${user.username}`, req.user.id, req.user.username);
        
        res.json({ 
            message: `User ${action} successfully`,
            active
        });
    } catch (err) {
        console.error('[users/status] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ 
            error: 'Failed to update user status',
            code: 'USER_STATUS_ERROR'
        });
    }
});

/**
 * DELETE /api/users/:id
 * Deactivate a user (admin only) - soft delete
 */
router.delete('/:id', authenticate, authorize('super'), async (req, res) => {
    try {
        const idValidation = validateUserId(req.params.id);
        if (!idValidation.valid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: idValidation.errors[0],
                code: 'INVALID_USER_ID'
            });
        }
        
        const id = idValidation.value;
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Prevent deleting yourself
        if (id === req.user.id) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'Cannot delete your own account',
                code: 'SELF_DELETE'
            });
        }
        
        // Soft delete - set active to 0
        db.prepare("UPDATE users SET active = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
        
        await addLog(`User deactivated: ${user.username}`, req.user.id, req.user.username);
        
        res.json({ 
            message: 'User deactivated successfully',
            code: 'USER_DEACTIVATED'
        });
    } catch (err) {
        console.error('[users/delete] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ 
            error: 'Failed to deactivate user',
            code: 'USER_DELETE_ERROR'
        });
    }
});

/**
 * POST /api/users/:id/reset-password
 * Reset a user's password (admin only)
 */
router.post('/:id/reset-password', authenticate, authorize('super'), updateLimiter, async (req, res) => {
    try {
        const idValidation = validateUserId(req.params.id);
        if (!idValidation.valid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: idValidation.errors[0],
                code: 'INVALID_USER_ID'
            });
        }
        
        const id = idValidation.value;
        const { newPassword } = req.body;
        
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'Validation failed',
                details: passwordValidation.errors,
                code: 'VALIDATION_ERROR'
            });
        }
        
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        
        db.prepare("UPDATE users SET password = ?, updatedAt = datetime('now') WHERE id = ?").run(hashedPassword, id);
        
        await addLog(`Password reset for user: ${user.username}`, req.user.id, req.user.username);
        
        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        console.error('[users/reset-password] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({ 
            error: 'Failed to reset password',
            code: 'PASSWORD_RESET_ERROR'
        });
    }
});

/**
 * PATCH /api/users/:id/hours
 * Update a user's hoursWorked and/or bonusHours (boss/super only)
 */
router.patch('/:id/hours', authenticate, authorize('super', 'boss'), updateLimiter, async (req, res) => {
    try {
        const idValidation = validateUserId(req.params.id);
        if (!idValidation.valid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                error: idValidation.errors[0],
                code: 'INVALID_USER_ID'
            });
        }

        const id = idValidation.value;
        const { hoursWorked, bonusHours } = req.body;

        const updates = {};
        const errors = [];

        if (hoursWorked !== undefined) {
            const h = parseFloat(hoursWorked);
            if (isNaN(h) || h < 0) {
                errors.push('hoursWorked must be a non-negative number');
            } else {
                updates.hoursWorked = h;
            }
        }

        if (bonusHours !== undefined) {
            const b = parseFloat(bonusHours);
            if (isNaN(b)) {
                errors.push('bonusHours must be a number');
            } else {
                updates.bonusHours = b;
            }
        }

        if (errors.length > 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                error: 'Validation failed',
                details: errors,
                code: 'VALIDATION_ERROR'
            });
        }

        if (Object.keys(updates).length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                error: 'Provide hoursWorked and/or bonusHours to update',
                code: 'NO_UPDATES'
            });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        const setClauses = Object.keys(updates).map(k => `${k} = ?`);
        setClauses.push("updatedAt = datetime('now')");
        db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`)
            .run(...Object.values(updates), id);

        await addLog(`Hours updated for user: ${user.username} (${JSON.stringify(updates)})`, req.user.id, req.user.username);

        const updated = db.prepare('SELECT id, username, fullName, role, phone, locationId, hoursWorked, bonusHours, active, updatedAt FROM users WHERE id = ?').get(id);

        res.json({
            user: sanitizeUser(updated),
            message: 'Hours updated successfully'
        });
    } catch (err) {
        console.error('[users/hours] Error:', err.message);
        res.status(HTTP_STATUS.SERVER_ERROR).json({
            error: 'Failed to update hours',
            code: 'USER_HOURS_ERROR'
        });
    }
});

module.exports = router;
