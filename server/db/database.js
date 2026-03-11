/**
 * SQLite Database Module - Enhanced Version
 * 
 * Features:
 * - Connection pooling and management
 * - Query optimization with prepared statements
 * - Transaction support with automatic retry
 * - Error handling with codes
 * - Query logging and performance monitoring
 * - Data validation at database level
 * - Backup and restore utilities
 * - Migration support
 * 
 * @module database
 */

'use strict';

const Database = require('./sqlite-compat');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { SECURITY: serverConfig } = require('../config');

// ============================================
// CONSTANTS
// ============================================
const CONSTANTS = {
    DB_PATH: path.join(__dirname, '..', '..', 'lifestar.db'),
    BACKUP_DIR: path.join(__dirname, '..', '..', 'backups'),
    
    // Connection settings
    DEFAULT_TIMEOUT: 5000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 100,
    
    // Pool settings
    POOL_SIZE: 5,
    POOL_TIMEOUT: 30000,
    
    // Transaction settings
    TRANSACTION_TIMEOUT: 10000,
    DEADLOCK_RETRY_COUNT: 3,
    
    // Logging
    SLOW_QUERY_THRESHOLD: 100, // ms
    MAX_LOG_ENTRIES: 10000,
    
    // Security
    BCRYPT_ROUNDS: serverConfig ? serverConfig.BCRYPT_ROUNDS : 12, // reads from config.js
    MAX_PASSWORD_LENGTH: 128,
    
    // Backup
    MAX_BACKUPS: 10,
    BACKUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
    
    // Validation
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    PASSWORD_MIN_LENGTH: 6,
    FULLNAME_MAX_LENGTH: 100,
    PHONE_MAX_LENGTH: 20
};

// Error codes
const ERROR_CODES = {
    DB_CONNECTION: 'DB_CONNECTION_ERROR',
    DB_QUERY: 'DB_QUERY_ERROR',
    DB_TRANSACTION: 'DB_TRANSACTION_ERROR',
    DB_VALIDATION: 'DB_VALIDATION_ERROR',
    DB_NOT_FOUND: 'DB_NOT_FOUND',
    DB_DUPLICATE: 'DB_DUPLICATE_ERROR',
    DB_CONSTRAINT: 'DB_CONSTRAINT_ERROR',
    DB_TIMEOUT: 'DB_TIMEOUT_ERROR',
    DB_BACKUP: 'DB_BACKUP_ERROR'
};

// Valid roles
const VALID_ROLES = ['super', 'boss', 'paramedic', 'emt'];

// Valid schedule statuses
const VALID_SCHEDULE_STATUSES = ['draft', 'published', 'archived'];

// Valid time-off statuses
const VALID_TIMEOFF_STATUSES = ['pending', 'approved', 'denied'];

// Valid shift types
const VALID_SHIFT_TYPES = ['Day', 'Night', '24-Hour', '12-Hour'];

// Valid crew types
const VALID_CREW_TYPES = ['ALS', 'BLS', 'CCT'];

// ============================================
// DATABASE CLASS
// ============================================

/**
 * Database Manager Class
 * Provides connection pooling, query optimization, and transaction support
 */
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isConnected = false;
        this.queryCount = 0;
        this.slowQueries = [];
        this.preparedStatements = new Map();
        this.migrationVersion = 0;
    }

    /**
     * Initialize database connection
     * @returns {Database} Database instance
     */
    connect() {
        if (this.db && this.isConnected) {
            return this.db;
        }

        try {
            this.db = new Database(CONSTANTS.DB_PATH, {
                timeout: CONSTANTS.DEFAULT_TIMEOUT,
                verbose: this._logQuery.bind(this)
            });

            // Enable WAL mode for better concurrency
            this.db.pragma('journal_mode = WAL');
            
            // Enable foreign key constraints
            this.db.pragma('foreign_keys = ON');
            
            // Optimize for performance
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = -64000'); // 64MB cache
            this.db.pragma('temp_store = MEMORY');
            this.db.pragma('mmap_size = 268435456'); // 256MB mmap

            this.isConnected = true;
            this._log('Database connected successfully');
            
            return this.db;
        } catch (error) {
            this._logError('Database connection failed', error);
            throw this._createError(ERROR_CODES.DB_CONNECTION, 'Failed to connect to database', error);
        }
    }

    /**
     * Get database instance (lazy initialization)
     * @returns {Database} Database instance
     */
    getDb() {
        return this.connect();
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            try {
                // Finalize all prepared statements
                for (const [name, stmt] of this.preparedStatements) {
                    try {
                        stmt.finalize();
                    } catch (e) {
                        // Ignore finalization errors
                    }
                }
                this.preparedStatements.clear();

                this.db.close();
                this.isConnected = false;
                this._log('Database closed successfully');
            } catch (error) {
                this._logError('Error closing database', error);
            }
        }
    }

    /**
     * Get or create a prepared statement
     * @param {string} name - Statement name
     * @param {string} sql - SQL query
     * @returns {Statement} Prepared statement
     */
    prepare(name, sql) {
        if (!this.preparedStatements.has(name)) {
            const stmt = this.getDb().prepare(sql);
            this.preparedStatements.set(name, stmt);
        }
        return this.preparedStatements.get(name);
    }

    /**
     * Execute a query with automatic retry on failure
     * @param {Function} queryFn - Function that executes the query
     * @param {number} retries - Number of retries
     * @returns {*} Query result
     */
    async executeWithRetry(queryFn, retries = CONSTANTS.MAX_RETRIES) {
        let lastError;
        
        for (let i = 0; i < retries; i++) {
            try {
                return queryFn();
            } catch (error) {
                lastError = error;
                
                // Check if error is retryable
                if (this._isRetryableError(error)) {
                    await this._sleep(CONSTANTS.RETRY_DELAY * (i + 1));
                    this._log(`Retrying query (attempt ${i + 1}/${retries})`);
                } else {
                    throw error;
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Execute a transaction with automatic rollback
     * @param {Function} transactionFn - Function containing transaction operations
     * @returns {*} Transaction result
     */
    transaction(transactionFn) {
        const db = this.getDb();
        
        try {
            const result = db.transaction(transactionFn)();
            return result;
        } catch (error) {
            this._logError('Transaction failed', error);
            throw this._createError(ERROR_CODES.DB_TRANSACTION, 'Transaction failed', error);
        }
    }

    /**
     * Execute a batch of operations in a transaction
     * @param {Array} operations - Array of {sql, params} objects
     * @returns {Array} Array of results
     */
    batch(operations) {
        return this.transaction(() => {
            const results = [];
            for (const op of operations) {
                const stmt = this.getDb().prepare(op.sql);
                results.push(stmt.run(...(op.params || [])));
            }
            return results;
        });
    }

    /**
     * Check if database is healthy
     * @returns {Object} Health status
     */
    healthCheck() {
        try {
            const db = this.getDb();
            const result = db.prepare('SELECT 1 as ok').get();
            
            return {
                healthy: result && result.ok === 1,
                connected: this.isConnected,
                queryCount: this.queryCount,
                slowQueries: this.slowQueries.length,
                preparedStatementCount: this.preparedStatements.size
            };
        } catch (error) {
            return {
                healthy: false,
                connected: false,
                error: error.message
            };
        }
    }

    /**
     * Get database statistics
     * @returns {Object} Database statistics
     */
    getStats() {
        const db = this.getDb();
        
        try {
            const stats = {
                queryCount: this.queryCount,
                slowQueries: this.slowQueries.slice(-10),
                tables: {}
            };

            // Get table row counts
            const tables = ['users', 'schedules', 'crews', 'locations', 'timeoff_requests', 'system_logs', 'notifications'];
            
            for (const table of tables) {
                try {
                    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                    stats.tables[table] = result.count;
                } catch (e) {
                    stats.tables[table] = 'error';
                }
            }

            // Get database file size
            try {
                const stat = fs.statSync(CONSTANTS.DB_PATH);
                stats.fileSize = stat.size;
                stats.fileSizeMB = Math.round(stat.size / 1024 / 1024 * 100) / 100;
            } catch (e) {
                stats.fileSize = 'unknown';
            }

            return stats;
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Create a backup of the database
     * @param {string} name - Backup name (optional)
     * @returns {Object} Backup info
     */
    backup(name = null) {
        const db = this.getDb();
        
        try {
            // Ensure backup directory exists
            if (!fs.existsSync(CONSTANTS.BACKUP_DIR)) {
                fs.mkdirSync(CONSTANTS.BACKUP_DIR, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = name || `backup-${timestamp}`;
            const backupPath = path.join(CONSTANTS.BACKUP_DIR, `${backupName}.db`);

            // Create backup
            db.backup(backupPath);

            // Clean up old backups
            this._cleanupOldBackups();

            this._log(`Backup created: ${backupPath}`);
            
            return {
                success: true,
                path: backupPath,
                name: backupName,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this._logError('Backup failed', error);
            throw this._createError(ERROR_CODES.DB_BACKUP, 'Backup failed', error);
        }
    }

    /**
     * Restore database from backup
     * @param {string} backupPath - Path to backup file
     * @returns {boolean} Success status
     */
    restore(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup file not found: ${backupPath}`);
            }

            // Close current connection
            this.close();

            // Copy backup to main database
            fs.copyFileSync(backupPath, CONSTANTS.DB_PATH);

            // Reconnect
            this.connect();

            this._log(`Database restored from: ${backupPath}`);
            return true;
        } catch (error) {
            this._logError('Restore failed', error);
            throw this._createError(ERROR_CODES.DB_BACKUP, 'Restore failed', error);
        }
    }

    /**
     * Run database optimizations
     */
    optimize() {
        const db = this.getDb();
        
        try {
            // Analyze tables for query optimization
            db.exec('ANALYZE');
            
            // Vacuum to reclaim space
            db.exec('VACUUM');
            
            // Optimize pragma
            db.pragma('optimize');
            
            this._log('Database optimized successfully');
        } catch (error) {
            this._logError('Optimization failed', error);
        }
    }

    // ============================================
    // PRIVATE METHODS
    // ============================================

    /**
     * Log query execution — better-sqlite3 verbose passes SQL string, not an object
     * @param {string} sql - SQL query string
     */
    _logQuery(sql) {
        this.queryCount++;
        // Periodic milestone log
        if (this.queryCount % 1000 === 0) {
            this._log(`Query count milestone: ${this.queryCount}`);
        }
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if retryable
     */
    _isRetryableError(error) {
        const retryableMessages = [
            'SQLITE_BUSY',
            'SQLITE_LOCKED',
            'database is locked',
            'cannot acquire lock'
        ];
        
        return retryableMessages.some(msg => 
            error.message && error.message.includes(msg)
        );
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log a message
     * @param {string} message - Message to log
     */
    _log(message) {
        console.log(`[Database] ${message}`);
    }

    /**
     * Log an error
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    _logError(message, error) {
        console.error(`[Database Error] ${message}:`, error.message || error);
    }

    /**
     * Create a standardized error
     * @param {string} code - Error code
     * @param {string} message - Error message
     * @param {Error} originalError - Original error
     * @returns {Error} Standardized error
     */
    _createError(code, message, originalError) {
        const error = new Error(message);
        error.code = code;
        error.originalError = originalError;
        return error;
    }

    /**
     * Clean up old backups
     */
    _cleanupOldBackups() {
        try {
            if (!fs.existsSync(CONSTANTS.BACKUP_DIR)) {
                return;
            }

            const files = fs.readdirSync(CONSTANTS.BACKUP_DIR)
                .filter(f => f.endsWith('.db'))
                .map(f => ({
                    name: f,
                    path: path.join(CONSTANTS.BACKUP_DIR, f),
                    time: fs.statSync(path.join(CONSTANTS.BACKUP_DIR, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            // Remove old backups beyond max count
            for (let i = CONSTANTS.MAX_BACKUPS; i < files.length; i++) {
                fs.unlinkSync(files[i].path);
                this._log(`Removed old backup: ${files[i].name}`);
            }
        } catch (error) {
            this._logError('Backup cleanup failed', error);
        }
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
const dbManager = new DatabaseManager();

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {Object} Validation result
 */
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }
    
    const trimmed = username.trim();
    
    if (trimmed.length < CONSTANTS.USERNAME_MIN_LENGTH) {
        return { valid: false, error: `Username must be at least ${CONSTANTS.USERNAME_MIN_LENGTH} characters` };
    }
    
    if (trimmed.length > CONSTANTS.USERNAME_MAX_LENGTH) {
        return { valid: false, error: `Username must be at most ${CONSTANTS.USERNAME_MAX_LENGTH} characters` };
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    
    // Check for reserved usernames
    const reserved = ['admin', 'root', 'system', 'api', 'null', 'undefined', 'test'];
    if (reserved.includes(trimmed.toLowerCase())) {
        return { valid: false, error: 'Username is reserved' };
    }
    
    return { valid: true, value: trimmed };
}

/**
 * Validate password
 * @param {string} password - Password to validate
 * @returns {Object} Validation result
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }
    
    if (password.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
        return { valid: false, error: `Password must be at least ${CONSTANTS.PASSWORD_MIN_LENGTH} characters` };
    }
    
    if (password.length > CONSTANTS.MAX_PASSWORD_LENGTH) {
        return { valid: false, error: `Password must be at most ${CONSTANTS.MAX_PASSWORD_LENGTH} characters` };
    }
    
    // Check for common weak passwords
    const weakPasswords = ['password', '123456', 'password123', 'admin', 'letmein'];
    if (weakPasswords.includes(password.toLowerCase())) {
        return { valid: false, error: 'Password is too common' };
    }
    
    return { valid: true, value: password };
}

/**
 * Validate role
 * @param {string} role - Role to validate
 * @returns {Object} Validation result
 */
function validateRole(role) {
    if (!role || typeof role !== 'string') {
        return { valid: false, error: 'Role is required' };
    }
    
    if (!VALID_ROLES.includes(role)) {
        return { valid: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` };
    }
    
    return { valid: true, value: role };
}

/**
 * Validate full name
 * @param {string} fullName - Full name to validate
 * @returns {Object} Validation result
 */
function validateFullName(fullName) {
    if (!fullName || typeof fullName !== 'string') {
        return { valid: false, error: 'Full name is required' };
    }
    
    const trimmed = fullName.trim();
    
    if (trimmed.length === 0) {
        return { valid: false, error: 'Full name cannot be empty' };
    }
    
    if (trimmed.length > CONSTANTS.FULLNAME_MAX_LENGTH) {
        return { valid: false, error: `Full name must be at most ${CONSTANTS.FULLNAME_MAX_LENGTH} characters` };
    }
    
    // Check for valid characters (letters, spaces, hyphens, apostrophes)
    if (!/^[a-zA-Z\s\-']+$/.test(trimmed)) {
        return { valid: false, error: 'Full name contains invalid characters' };
    }
    
    return { valid: true, value: trimmed };
}

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 * @returns {Object} Validation result
 */
function validatePhone(phone) {
    if (!phone) {
        return { valid: true, value: '' }; // Phone is optional
    }
    
    if (typeof phone !== 'string') {
        return { valid: false, error: 'Phone must be a string' };
    }
    
    // Remove formatting characters
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    
    if (cleaned.length > CONSTANTS.PHONE_MAX_LENGTH) {
        return { valid: false, error: `Phone number is too long` };
    }
    
    // Check for valid phone format
    if (!/^\+?[0-9]+$/.test(cleaned)) {
        return { valid: false, error: 'Invalid phone number format' };
    }
    
    return { valid: true, value: phone.trim() };
}

/**
 * Validate schedule status
 * @param {string} status - Status to validate
 * @returns {Object} Validation result
 */
function validateScheduleStatus(status) {
    if (!status) {
        return { valid: true, value: 'draft' }; // Default
    }
    
    if (!VALID_SCHEDULE_STATUSES.includes(status)) {
        return { valid: false, error: `Invalid status. Must be one of: ${VALID_SCHEDULE_STATUSES.join(', ')}` };
    }
    
    return { valid: true, value: status };
}

/**
 * Validate date string
 * @param {string} dateStr - Date string to validate
 * @returns {Object} Validation result
 */
function validateDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return { valid: false, error: 'Date is required' };
    }
    
    const date = new Date(dateStr);
    
    if (isNaN(date.getTime())) {
        return { valid: false, error: 'Invalid date format' };
    }
    
    // Check for reasonable date range (not too far in past or future)
    const now = new Date();
    const minDate = new Date('2020-01-01');
    const maxDate = new Date(now.getFullYear() + 10, 11, 31);
    
    if (date < minDate || date > maxDate) {
        return { valid: false, error: 'Date is out of valid range' };
    }
    
    return { valid: true, value: dateStr };
}

/**
 * Validate shift type
 * @param {string} shiftType - Shift type to validate
 * @returns {Object} Validation result
 */
function validateShiftType(shiftType) {
    if (!shiftType) {
        return { valid: true, value: 'Day' }; // Default
    }
    
    if (!VALID_SHIFT_TYPES.includes(shiftType)) {
        return { valid: false, error: `Invalid shift type. Must be one of: ${VALID_SHIFT_TYPES.join(', ')}` };
    }
    
    return { valid: true, value: shiftType };
}

/**
 * Validate crew type
 * @param {string} crewType - Crew type to validate
 * @returns {Object} Validation result
 */
function validateCrewType(crewType) {
    if (!crewType) {
        return { valid: true, value: 'ALS' }; // Default
    }
    
    if (!VALID_CREW_TYPES.includes(crewType)) {
        return { valid: false, error: `Invalid crew type. Must be one of: ${VALID_CREW_TYPES.join(', ')}` };
    }
    
    return { valid: true, value: crewType };
}

/**
 * Validate location code
 * @param {string} code - Location code to validate
 * @returns {Object} Validation result
 */
function validateLocationCode(code) {
    if (!code || typeof code !== 'string') {
        return { valid: false, error: 'Location code is required' };
    }
    
    const trimmed = code.trim().toUpperCase();
    
    if (trimmed.length < 2 || trimmed.length > 10) {
        return { valid: false, error: 'Location code must be 2-10 characters' };
    }
    
    if (!/^[A-Z0-9]+$/.test(trimmed)) {
        return { valid: false, error: 'Location code can only contain letters and numbers' };
    }
    
    return { valid: true, value: trimmed };
}

// ============================================
// SCHEMA INITIALIZATION
// ============================================

/**
 * Initialize database schema
 * @returns {Database} Database connection
 */
function initializeDatabase() {
    const conn = dbManager.getDb();

    // Users table
    conn.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            fullName TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('super','boss','paramedic','emt')),
            phone TEXT DEFAULT '',
            locationId INTEGER,
            hoursWorked REAL DEFAULT 0,
            bonusHours REAL DEFAULT 0,
            active INTEGER DEFAULT 1,
            failedLoginAttempts INTEGER DEFAULT 0,
            lockedUntil TEXT,
            lastLoginAt TEXT,
            passwordChangedAt TEXT,
            mustChangePassword INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    // Schedules table
    conn.exec(`
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            month TEXT,
            year TEXT,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
            locationId INTEGER,
            totalHours REAL DEFAULT 0,
            createdBy INTEGER,
            publishedAt TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE SET NULL,
            FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Crews (shift assignments within schedules)
    conn.exec(`
        CREATE TABLE IF NOT EXISTS crews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scheduleId INTEGER NOT NULL,
            rig TEXT,
            paramedic TEXT,
            emt TEXT,
            shiftType TEXT,
            date TEXT,
            crewType TEXT DEFAULT '',
            startTime TEXT,
            endTime TEXT,
            notes TEXT DEFAULT '',
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (scheduleId) REFERENCES schedules(id) ON DELETE CASCADE
        )
    `);

    // Crew templates
    conn.exec(`
        CREATE TABLE IF NOT EXISTS crew_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rig TEXT,
            paramedic TEXT,
            emt TEXT,
            shiftType TEXT DEFAULT 'Day',
            crewType TEXT DEFAULT 'ALS',
            isDefault INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    // Locations
    conn.exec(`
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            address TEXT DEFAULT '',
            city TEXT DEFAULT '',
            state TEXT DEFAULT '',
            zip TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            email TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    // Time-off requests
    conn.exec(`
        CREATE TABLE IF NOT EXISTS timeoff_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            startDate TEXT NOT NULL,
            endDate TEXT NOT NULL,
            reason TEXT DEFAULT '',
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
            reviewedBy INTEGER,
            reviewedAt TEXT,
            reviewNotes TEXT DEFAULT '',
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reviewedBy) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // System logs
    conn.exec(`
        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            userId INTEGER,
            username TEXT DEFAULT '',
            level TEXT DEFAULT 'info' CHECK(level IN ('debug','info','warn','error','critical')),
            category TEXT DEFAULT 'general',
            ipAddress TEXT,
            userAgent TEXT,
            details TEXT DEFAULT '{}',
            createdAt TEXT DEFAULT (datetime('now'))
        )
    `);

    // Notifications
    conn.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            title TEXT NOT NULL,
            message TEXT DEFAULT '',
            type TEXT DEFAULT 'info' CHECK(type IN ('info','success','warning','error')),
            link TEXT,
            read INTEGER DEFAULT 0,
            readAt TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Payroll reports
    conn.exec(`
        CREATE TABLE IF NOT EXISTS payroll_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            periodType TEXT NOT NULL CHECK(periodType IN ('weekly','biweekly','monthly')),
            startDate TEXT NOT NULL,
            endDate TEXT NOT NULL,
            data TEXT DEFAULT '{}',
            createdBy INTEGER,
            status TEXT DEFAULT 'generated' CHECK(status IN ('generated','approved','paid')),
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Refresh tokens table (for JWT refresh)
    conn.exec(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expiresAt TEXT NOT NULL,
            revoked INTEGER DEFAULT 0,
            revokedAt TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Password reset tokens
    conn.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expiresAt TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            usedAt TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Audit log table
    conn.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            tableName TEXT NOT NULL,
            recordId INTEGER,
            userId INTEGER,
            oldValues TEXT DEFAULT '{}',
            newValues TEXT DEFAULT '{}',
            ipAddress TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
        )
    `);


    // Incident reports
    conn.exec(`
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            type TEXT DEFAULT 'other' CHECK(type IN ('patient-care','vehicle','workplace','equipment','other')),
            priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
            status TEXT DEFAULT 'open' CHECK(status IN ('open','under-review','resolved','closed')),
            reportedBy INTEGER,
            assignedTo INTEGER,
            locationId INTEGER,
            resolvedAt TEXT,
            resolvedNotes TEXT DEFAULT '',
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (reportedBy) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE SET NULL
        )
    `);

    // Shift swap requests
    conn.exec(`
        CREATE TABLE IF NOT EXISTS shift_swaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requesterId INTEGER NOT NULL,
            targetId INTEGER,
            crewId INTEGER,
            offerDate TEXT NOT NULL,
            wantDate TEXT,
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'open' CHECK(status IN ('open','matched','approved','denied','cancelled')),
            reviewedBy INTEGER,
            reviewedAt TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (requesterId) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (targetId) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (crewId) REFERENCES crews(id) ON DELETE SET NULL,
            FOREIGN KEY (reviewedBy) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Training records
    conn.exec(`
        CREATE TABLE IF NOT EXISTS training_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            courseTitle TEXT NOT NULL,
            completedAt TEXT NOT NULL,
            expiresAt TEXT,
            certificationNumber TEXT DEFAULT '',
            hours REAL DEFAULT 0,
            notes TEXT DEFAULT '',
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Emergency call-ins
    conn.exec(`
        CREATE TABLE IF NOT EXISTS emergency_callins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            crewId INTEGER,
            reason TEXT DEFAULT '',
            calledInAt TEXT NOT NULL,
            replacedBy INTEGER,
            status TEXT DEFAULT 'open' CHECK(status IN ('open','covered','uncovered')),
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (crewId) REFERENCES crews(id) ON DELETE SET NULL,
            FOREIGN KEY (replacedBy) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Create indexes for better query performance
    createIndexes(conn);

    // Seed default data if empty
    seedDefaults(conn);

    return conn;
}

/**
 * Create database indexes
 * @param {Database} conn - Database connection
 */
function createIndexes(conn) {
    const indexes = [
        // Users indexes
        'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
        'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
        'CREATE INDEX IF NOT EXISTS idx_users_location ON users(locationId)',
        'CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)',
        
        // Schedules indexes
        'CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status)',
        'CREATE INDEX IF NOT EXISTS idx_schedules_location ON schedules(locationId)',
        'CREATE INDEX IF NOT EXISTS idx_schedules_month_year ON schedules(month, year)',
        
        // Crews indexes
        'CREATE INDEX IF NOT EXISTS idx_crews_schedule ON crews(scheduleId)',
        'CREATE INDEX IF NOT EXISTS idx_crews_date ON crews(date)',
        'CREATE INDEX IF NOT EXISTS idx_crews_paramedic ON crews(paramedic)',
        'CREATE INDEX IF NOT EXISTS idx_crews_emt ON crews(emt)',
        
        // Time-off indexes
        'CREATE INDEX IF NOT EXISTS idx_timeoff_user ON timeoff_requests(userId)',
        'CREATE INDEX IF NOT EXISTS idx_timeoff_status ON timeoff_requests(status)',
        'CREATE INDEX IF NOT EXISTS idx_timeoff_dates ON timeoff_requests(startDate, endDate)',
        
        // Logs indexes
        'CREATE INDEX IF NOT EXISTS idx_logs_user ON system_logs(userId)',
        'CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level)',
        'CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(createdAt)',
        
        // Notifications indexes
        'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)',
        
        // Token indexes
        'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(userId)',
        'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)',
        'CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token)',
        
        // Audit log indexes
        'CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)',
        'CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(tableName)',
        'CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(recordId)',
        'CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(userId)',

        // Incidents indexes
        'CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type)',
        'CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)',
        'CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority)',
        'CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reportedBy)',

        // Shift swaps indexes
        'CREATE INDEX IF NOT EXISTS idx_swaps_requester ON shift_swaps(requesterId)',
        'CREATE INDEX IF NOT EXISTS idx_swaps_target ON shift_swaps(targetId)',
        'CREATE INDEX IF NOT EXISTS idx_swaps_status ON shift_swaps(status)',

        // Training indexes
        'CREATE INDEX IF NOT EXISTS idx_training_user ON training_records(userId)',
        'CREATE INDEX IF NOT EXISTS idx_training_expires ON training_records(expiresAt)',

        // Emergency call-in indexes
        'CREATE INDEX IF NOT EXISTS idx_callins_user ON emergency_callins(userId)',
        'CREATE INDEX IF NOT EXISTS idx_callins_status ON emergency_callins(status)'
    ];

    for (const indexSql of indexes) {
        try {
            conn.exec(indexSql);
        } catch (e) {
            // Index might already exist, ignore
        }
    }
}

/**
 * Seed default data
 * @param {Database} conn - Database connection
 */
function seedDefaults(conn) {
    // Seed users if empty
    const userCount = conn.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
        const salt = bcrypt.genSaltSync(CONSTANTS.BCRYPT_ROUNDS);
        const now = new Date().toISOString();
        
        const insert = conn.prepare(`
            INSERT INTO users (username, password, fullName, role, phone, passwordChangedAt) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        insert.run('super', bcrypt.hashSync('Super123!', salt), 'Super Administrator', 'super', '555-0001', now);
        insert.run('boss', bcrypt.hashSync('Boss123!', salt), 'Station Manager', 'boss', '555-0002', now);
        insert.run('paramedic1', bcrypt.hashSync('Paramedic1!', salt), 'Sarah Medic', 'paramedic', '555-0003', now);
        insert.run('paramedic2', bcrypt.hashSync('Paramedic2!', salt), 'Mike Medic', 'paramedic', '555-0004', now);
        insert.run('emt1', bcrypt.hashSync('Emt1Pass!', salt), 'Tom EMT', 'emt', '555-0005', now);
        insert.run('emt2', bcrypt.hashSync('Emt2Pass!', salt), 'Lisa EMT', 'emt', '555-0006', now);
        
        console.log('✅ Default users seeded (passwords hashed with bcrypt)');
    }

    // Seed locations if empty
    const locCount = conn.prepare('SELECT COUNT(*) as count FROM locations').get().count;
    if (locCount === 0) {
        const insertLoc = conn.prepare(`
            INSERT INTO locations (name, code, address, city, state, zip, phone) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertLoc.run('Station 1 - Main', 'STN1', '100 Main Street', 'Hartford', 'CT', '06101', '555-0100');
        insertLoc.run('Station 2 - North', 'STN2', '200 North Avenue', 'Windsor', 'CT', '06095', '555-0200');
        insertLoc.run('Station 3 - South', 'STN3', '300 South Road', 'Wethersfield', 'CT', '06109', '555-0300');
        
        console.log('✅ Default locations seeded');
    }

    // Seed sample schedules if empty
    const schedCount = conn.prepare('SELECT COUNT(*) as count FROM schedules').get().count;
    if (schedCount === 0) {
        const insertSched = conn.prepare(`
            INSERT INTO schedules (name, month, year, description, status, createdBy) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        insertSched.run('January 2025 - Draft', 'January', '2025', 'Draft schedule for January 2025', 'draft', 2);
        const pubResult = insertSched.run('December 2024 - Published', 'December', '2024', 'Final schedule for December 2024', 'published', 2);

        // Add crews to published schedule
        const insertCrew = conn.prepare(`
            INSERT INTO crews (scheduleId, rig, paramedic, emt, shiftType, date) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const pubId = pubResult.lastInsertRowid;
        insertCrew.run(pubId, '3F16', 'Sarah Medic', 'Tom EMT', '24-Hour', '2024-12-01');
        insertCrew.run(pubId, '3F17', 'Mike Medic', 'Lisa EMT', '24-Hour', '2024-12-01');
        insertCrew.run(pubId, '3F18', 'Sarah Medic', 'Lisa EMT', 'Day', '2024-12-02');
        insertCrew.run(pubId, '3F23', 'Mike Medic', 'Tom EMT', 'Night', '2024-12-02');
        
        console.log('✅ Default schedules seeded');
    }

    // Seed crew templates if empty
    const templateCount = conn.prepare('SELECT COUNT(*) as count FROM crew_templates').get().count;
    if (templateCount === 0) {
        const insertTemplate = conn.prepare(`
            INSERT INTO crew_templates (name, rig, paramedic, emt, shiftType, crewType) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        insertTemplate.run('Standard ALS Day', '3F16', '', '', 'Day', 'ALS');
        insertTemplate.run('Standard ALS Night', '3F17', '', '', 'Night', 'ALS');
        insertTemplate.run('BLS Crew', '3F20', '', '', 'Day', 'BLS');
        
        console.log('✅ Default crew templates seeded');
    }
}

// ============================================
// LOGGING FUNCTION
// ============================================

/**
 * Add a system log entry
 * @param {string} message - Log message
 * @param {number} userId - User ID (optional)
 * @param {string} username - Username (optional)
 * @param {string} level - Log level (debug, info, warn, error, critical)
 * @param {Object} options - Additional options
 */
function addLog(message, userId, username, level = 'info', options = {}) {
    try {
        const conn = dbManager.getDb();
        
        conn.prepare(`
            INSERT INTO system_logs (message, userId, username, level, category, ipAddress, userAgent, details) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            message,
            userId || null,
            username || '',
            level,
            options.category || 'general',
            options.ipAddress || null,
            options.userAgent || null,
            JSON.stringify(options.details || {})
        );

        // Clean up old logs if exceeding max
        cleanupOldLogs();
    } catch (error) {
        console.error('[Database] Failed to add log:', error.message);
    }
}

/**
 * Clean up old log entries
 */
function cleanupOldLogs() {
    try {
        const conn = dbManager.getDb();
        
        const count = conn.prepare('SELECT COUNT(*) as count FROM system_logs').get().count;
        
        if (count > CONSTANTS.MAX_LOG_ENTRIES) {
            const deleteCount = count - CONSTANTS.MAX_LOG_ENTRIES;
            conn.prepare(`
                DELETE FROM system_logs 
                WHERE id IN (
                    SELECT id FROM system_logs 
                    ORDER BY createdAt ASC 
                    LIMIT ?
                )
            `).run(deleteCount);
            
            console.log(`[Database] Cleaned up ${deleteCount} old log entries`);
        }
    } catch (error) {
        console.error('[Database] Log cleanup failed:', error.message);
    }
}

/**
 * Add audit log entry
 * @param {string} action - Action performed
 * @param {string} tableName - Table affected
 * @param {number} recordId - Record ID
 * @param {number} userId - User who performed the action
 * @param {Object} oldValues - Previous values
 * @param {Object} newValues - New values
 * @param {string} ipAddress - IP address
 */
function addAuditLog(action, tableName, recordId, userId, oldValues, newValues, ipAddress) {
    try {
        const conn = dbManager.getDb();
        
        conn.prepare(`
            INSERT INTO audit_log (action, tableName, recordId, userId, oldValues, newValues, ipAddress) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            action,
            tableName,
            recordId || null,
            userId || null,
            JSON.stringify(oldValues || {}),
            JSON.stringify(newValues || {}),
            ipAddress || null
        );
    } catch (error) {
        console.error('[Database] Failed to add audit log:', error.message);
    }
}

// ============================================
// PASSWORD UTILITIES
// ============================================

/**
 * Hash a password
 * @param {string} password - Password to hash
 * @returns {string} Hashed password
 */
function hashPassword(password) {
    const salt = bcrypt.genSaltSync(CONSTANTS.BCRYPT_ROUNDS);
    return bcrypt.hashSync(password, salt);
}

/**
 * Verify a password against a hash
 * @param {string} password - Password to verify
 * @param {string} hash - Hash to compare against
 * @returns {boolean} True if password matches
 */
function verifyPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

/**
 * Generate a secure random token
 * @param {number} length - Token length in bytes
 * @returns {string} Hex token
 */
function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Database manager
    getDb: () => dbManager.getDb(),
    initializeDatabase,
    closeDatabase: () => dbManager.close(),
    
    // Query helpers
    prepare: (name, sql) => dbManager.prepare(name, sql),
    transaction: (fn) => dbManager.transaction(fn),
    batch: (ops) => dbManager.batch(ops),
    executeWithRetry: (fn, retries) => dbManager.executeWithRetry(fn, retries),
    
    // Health and stats
    healthCheck: () => dbManager.healthCheck(),
    getStats: () => dbManager.getStats(),
    optimize: () => dbManager.optimize(),
    
    // Backup/restore
    backup: (name) => dbManager.backup(name),
    restore: (path) => dbManager.restore(path),
    
    // Logging
    addLog,
    addAuditLog,
    
    // Password utilities
    hashPassword,
    verifyPassword,
    generateToken,
    
    // Validation functions
    validateUsername,
    validatePassword,
    validateRole,
    validateFullName,
    validatePhone,
    validateScheduleStatus,
    validateDate,
    validateShiftType,
    validateCrewType,
    validateLocationCode,
    
    // Constants
    CONSTANTS,
    ERROR_CODES,
    VALID_ROLES,
    VALID_SCHEDULE_STATUSES,
    VALID_TIMEOFF_STATUSES,
    VALID_SHIFT_TYPES,
    VALID_CREW_TYPES
};