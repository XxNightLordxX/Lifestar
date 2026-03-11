/**
 * Authentication Routes
 * Secure authentication endpoints with rate limiting and input validation
 * 
 * POST /api/auth/login — Login with username/password
 * POST /api/auth/logout — Logout (clear cookie)
 * GET  /api/auth/me — Get current user info
 * POST /api/auth/refresh — Refresh authentication token
 * 
 * @module routes/auth
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, addLog } = require('../db/database');
const { generateToken, authenticate, setTokenCookie, clearTokenCookie } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const router = express.Router();

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    // Validation rules
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
    
    // Rate limiting
    LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    LOGIN_MAX_ATTEMPTS: 5,
    
    // Security
    BCRYPT_ROUNDS: 10,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 15 * 60 * 1000 // 15 minutes
};

// ============================================
// RATE LIMITING
// ============================================

// Strict rate limiter for login attempts
const loginLimiter = rateLimit({
    windowMs: CONSTANTS.LOGIN_WINDOW_MS,
    max: CONSTANTS.LOGIN_MAX_ATTEMPTS,
    message: { 
        error: 'Too many login attempts', 
        message: 'Please try again later',
        retryAfter: CONSTANTS.LOGIN_WINDOW_MS / 1000
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Use normalized IP + username as key to prevent distributed attacks
    keyGenerator: (req) => {
        const username = req.body?.username || 'unknown';
        return `${ipKeyGenerator(req)}:${username}`;
    }
});

// General rate limiter for other auth endpoints
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: { error: 'Too many requests', retryAfter: 60 }
});

// ============================================
// INPUT VALIDATION
// ============================================

/**
 * Validate username input
 * @param {string} username - Username to validate
 * @returns {Object} Validation result
 */
function validateUsername(username) {
    const errors = [];
    
    if (!username || typeof username !== 'string') {
        errors.push('Username is required');
        return { valid: false, errors, value: '' };
    }
    
    const trimmed = username.trim();
    
    if (trimmed.length < CONSTANTS.USERNAME_MIN_LENGTH) {
        errors.push(`Username must be at least ${CONSTANTS.USERNAME_MIN_LENGTH} characters`);
    }
    
    if (trimmed.length > CONSTANTS.USERNAME_MAX_LENGTH) {
        errors.push(`Username must be at most ${CONSTANTS.USERNAME_MAX_LENGTH} characters`);
    }
    
    // Only allow alphanumeric and underscore
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        errors.push('Username can only contain letters, numbers, and underscores');
    }
    
    // Check for SQL injection patterns
    const sqlPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)|(--)|(\/\*)|(\*\/)|(\bOR\b\s+\d+\s*=\s*\d+)/i;
    if (sqlPatterns.test(trimmed)) {
        errors.push('Invalid username format');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: trimmed
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
        return { valid: false, errors, value: '' };
    }
    
    if (password.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
        errors.push(`Password must be at least ${CONSTANTS.PASSWORD_MIN_LENGTH} characters`);
    }
    
    if (password.length > CONSTANTS.PASSWORD_MAX_LENGTH) {
        errors.push(`Password must be at most ${CONSTANTS.PASSWORD_MAX_LENGTH} characters`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: password
    };
}

/**
 * Sanitize string for logging (remove sensitive data)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeForLog(str) {
    if (typeof str !== 'string') return '[REDACTED]';
    // Only show first 2 and last 2 characters
    if (str.length <= 4) return '****';
    return str.substring(0, 2) + '****' + str.substring(str.length - 2);
}

// ============================================
// LOGIN ATTEMPT TRACKING
// ============================================

const loginAttempts = new Map();

/**
 * Check if account is locked
 * @param {string} username - Username to check
 * @returns {Object} Lock status
 */
function checkAccountLock(username) {
    const attempts = loginAttempts.get(username);
    if (!attempts) return { locked: false, attempts: 0 };
    
    if (attempts.count >= CONSTANTS.MAX_LOGIN_ATTEMPTS) {
        const timeSinceLock = Date.now() - attempts.lastAttempt;
        if (timeSinceLock < CONSTANTS.LOCKOUT_DURATION_MS) {
            return {
                locked: true,
                remainingTime: CONSTANTS.LOCKOUT_DURATION_MS - timeSinceLock
            };
        }
        // Lock expired, reset
        loginAttempts.delete(username);
    }
    
    return { locked: false, attempts: attempts.count };
}

/**
 * Record failed login attempt
 * @param {string} username - Username that failed
 */
function recordFailedAttempt(username) {
    const current = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
    loginAttempts.set(username, {
        count: current.count + 1,
        lastAttempt: Date.now()
    });
}

/**
 * Clear login attempts for user
 * @param {string} username - Username to clear
 */
function clearLoginAttempts(username) {
    loginAttempts.delete(username);
}

// ============================================
// ROUTES
// ============================================

/**
 * @route POST /api/auth/login
 * @description Authenticate user and return token
 * @access Public
 */
router.post('/login', loginLimiter, async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { username, password } = req.body;
        
        // Input validation
        const usernameResult = validateUsername(username);
        if (!usernameResult.valid) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: usernameResult.errors 
            });
        }
        
        const passwordResult = validatePassword(password);
        if (!passwordResult.valid) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: passwordResult.errors 
            });
        }
        
        // Check account lock
        const lockStatus = checkAccountLock(usernameResult.value);
        if (lockStatus.locked) {
            const remainingMinutes = Math.ceil(lockStatus.remainingTime / 60000);
            return res.status(429).json({ 
                error: 'Account temporarily locked',
                message: `Too many failed attempts. Try again in ${remainingMinutes} minutes.`,
                retryAfter: Math.ceil(lockStatus.remainingTime / 1000)
            });
        }
        
        // Database lookup
        const db = getDb();
        const user = db.prepare(`
            SELECT * FROM users 
            WHERE username = ? AND active = 1
        `).get(usernameResult.value);
        
        // Always use the same response time to prevent timing attacks
        const minResponseTime = 100;
        
        if (!user) {
            recordFailedAttempt(usernameResult.value);
            
            // Delay to prevent timing attacks
            await new Promise(resolve => setTimeout(resolve, minResponseTime - (Date.now() - startTime)));
            
            return res.status(401).json({ 
                error: 'Invalid credentials',
                message: 'Username or password is incorrect'
            });
        }
        
        // Password verification
        const validPassword = await bcrypt.compare(passwordResult.value, user.password);
        
        if (!validPassword) {
            recordFailedAttempt(usernameResult.value);
            addLog(`Failed login attempt for user: ${usernameResult.value}`, null, usernameResult.value);
            
            // Delay to prevent timing attacks
            await new Promise(resolve => setTimeout(resolve, minResponseTime - (Date.now() - startTime)));
            
            return res.status(401).json({ 
                error: 'Invalid credentials',
                message: 'Username or password is incorrect',
                attemptsRemaining: CONSTANTS.MAX_LOGIN_ATTEMPTS - (loginAttempts.get(usernameResult.value)?.count || 0)
            });
        }
        
        // Clear failed attempts on successful login
        clearLoginAttempts(usernameResult.value);
        
        // Update last login timestamp
        db.prepare("UPDATE users SET lastLoginAt = datetime('now'), failedLoginAttempts = 0 WHERE id = ?")
            .run(user.id);
        
        // Generate token
        const token = generateToken(user);
        setTokenCookie(res, token);
        
        // Log successful login
        addLog(`User logged in: ${usernameResult.value}`, user.id, usernameResult.value);
        
        // Return user data (without sensitive information)
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                phone: user.phone,
                locationId: user.locationId,
                hoursWorked: user.hoursWorked,
                bonusHours: user.bonusHours
            }
        });
        
    } catch (err) {
        console.error('[auth/login] Error:', err.message);
        
        // Don't expose internal errors
        res.status(500).json({ 
            error: 'Server error',
            message: 'An unexpected error occurred. Please try again.'
        });
    }
});

/**
 * @route POST /api/auth/logout
 * @description Logout user and clear session
 * @access Private
 */
router.post('/logout', authenticate, (req, res) => {
    try {
        if (req.user) {
            addLog(`User logged out: ${req.user.username}`, req.user.id, req.user.username);
        }
        
        clearTokenCookie(res);
        
        res.json({ 
            success: true,
            message: 'Logged out successfully' 
        });
    } catch (err) {
        console.error('[auth/logout] Error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route GET /api/auth/me
 * @description Get current authenticated user
 * @access Private
 */
router.get('/me', authenticate, authLimiter, (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Not authenticated',
                message: 'Please log in to continue'
            });
        }
        
        const db = getDb();
        const user = db.prepare(`
            SELECT 
                id, 
                username, 
                fullName, 
                role, 
                phone, 
                locationId, 
                hoursWorked, 
                bonusHours,
                createdAt,
                updatedAt
            FROM users 
            WHERE id = ? AND active = 1
        `).get(req.user.id);
        
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found',
                message: 'User account may have been deactivated'
            });
        }
        
        res.json({ 
            success: true,
            user 
        });
    } catch (err) {
        console.error('[auth/me] Error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route POST /api/auth/refresh
 * @description Refresh authentication token
 * @access Private
 */
router.post('/refresh', authenticate, authLimiter, (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Not authenticated',
                message: 'Please log in to continue'
            });
        }
        
        const db = getDb();
        const user = db.prepare(`
            SELECT * FROM users WHERE id = ? AND active = 1
        `).get(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const token = generateToken(user);
        setTokenCookie(res, token);
        
        res.json({ 
            success: true,
            message: 'Token refreshed',
            token 
        });
    } catch (err) {
        console.error('[auth/refresh] Error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route POST /api/auth/change-password
 * @description Change user password
 * @access Private
 */
router.post('/change-password', authenticate, authLimiter, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        // Validate inputs
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ 
                error: 'All fields are required' 
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                error: 'New passwords do not match' 
            });
        }
        
        const passwordResult = validatePassword(newPassword);
        if (!passwordResult.valid) {
            return res.status(400).json({ 
                error: 'Password validation failed',
                details: passwordResult.errors 
            });
        }
        
        // Get current user
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Current password is incorrect' 
            });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, CONSTANTS.BCRYPT_ROUNDS);
        
        // Update password
        db.prepare('UPDATE users SET password = ?, updatedAt = ? WHERE id = ?')
            .run(hashedPassword, new Date().toISOString(), user.id);
        
        addLog(`Password changed for user: ${user.username}`, user.id, user.username);
        
        res.json({ 
            success: true,
            message: 'Password changed successfully' 
        });
        
    } catch (err) {
        console.error('[auth/change-password] Error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route GET /api/auth/status
 * @description Check authentication status
 * @access Public
 */
router.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        authenticated: false,
        message: 'Authentication service is running'
    });
});

// Cleanup old login attempts periodically
setInterval(() => {
    const now = Date.now();
    for (const [username, attempts] of loginAttempts.entries()) {
        if (now - attempts.lastAttempt > CONSTANTS.LOCKOUT_DURATION_MS) {
            loginAttempts.delete(username);
        }
    }
}, 60000); // Clean up every minute

module.exports = router;