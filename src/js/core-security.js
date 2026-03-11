/**
 * Core Security Module - Consolidated from multiple security files
 * Provides CSRF protection, password hashing, session management
 * @module core-security
 * @version 1.0.0
 * 
 * Consolidated from:
 * - csrf-protection.js
 * - password-hashing-util.js
 * - session-timeout.js
 * - sanitize-helper.js (security portions)
 */

'use strict';

// ========================================
// SECURITY STATE
// ========================================

const SecurityState = {
    csrfTokens: new Map(),
    csrfTokenExpiry: 3600, // 1 hour
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    sessionWarningTime: 25 * 60 * 1000, // Warning at 25 minutes
    sessionCheckInterval: 60 * 1000, // Check every 60 seconds
    lastActivity: Date.now(),
    sessionTimer: null,
    warningShown: false,
    initialized: false
};

// ========================================
// CSRF PROTECTION
// ========================================

const CSRFProtection = {
    /**
     * Generate a new CSRF token (browser-compatible)
     * @param {string} sessionId - User session ID
     * @returns {string} CSRF token
     */
    generateToken(sessionId = 'default') {
        const array = new Uint8Array(32);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(array);
        } else {
            // Fallback for older browsers
            for (let i = 0; i < 32; i++) {
                array[i] = Math.floor(Math.random() * 256);
            }
        }
        const token = Array.from(array, function(b) { 
            return b.toString(16).padStart(2, '0'); 
        }).join('');

        SecurityState.csrfTokens.set(token, {
            sessionId: sessionId,
            expires: Date.now() + (SecurityState.csrfTokenExpiry * 1000)
        });
        return token;
    },

    /**
     * Validate a CSRF token
     * @param {string} token - CSRF token to validate
     * @param {string} sessionId - User session ID
     * @returns {boolean} True if token is valid
     */
    validateToken(token, sessionId = 'default') {
        if (!token) return false;
        
        const stored = SecurityState.csrfTokens.get(token);
        if (!stored) return false;
        if (stored.sessionId !== sessionId) return false;
        if (stored.expires < Date.now()) {
            SecurityState.csrfTokens.delete(token);
            return false;
        }
        return true;
    },

    /**
     * Clean up expired tokens
     */
    cleanupExpiredTokens() {
        const now = Date.now();
        for (const [token, data] of SecurityState.csrfTokens.entries()) {
            if (data.expires < now) {
                SecurityState.csrfTokens.delete(token);
            }
        }
    },

    /**
     * Get token count for monitoring
     */
    getTokenCount() {
        return SecurityState.csrfTokens.size;
    }
};

// ========================================
// PASSWORD HASHING
// ========================================

const PasswordHasher = {
    /**
     * Generate a random salt
     * @returns {string} Hex-encoded salt
     */
    generateSalt() {
        const array = new Uint8Array(16);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(array);
        } else {
            for (let i = 0; i < 16; i++) {
                array[i] = Math.floor(Math.random() * 256);
            }
        }
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Hash a password with SHA-256 + salt
     * @param {string} password - Plain text password
     * @param {string} [salt] - Optional salt (generated if not provided)
     * @returns {Promise<string>} salt:hash format
     */
    async hashPassword(password, salt) {
        try {
            if (!salt) salt = this.generateSalt();
            
            // Check for Web Crypto API
            if (window.crypto && window.crypto.subtle) {
                const encoder = new TextEncoder();
                const data = encoder.encode(salt + password);
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return salt + ':' + hashHex;
            } else {
                // Fallback for environments without Web Crypto
                return this._fallbackHash(password, salt);
            }
        } catch (e) {
            if (typeof Logger !== 'undefined') {
                Logger.warn('[PasswordHasher] Web Crypto not available, using fallback hash');
            }
            return this._fallbackHash(password, salt);
        }
    },

    /**
     * Verify a password against a stored hash
     * @param {string} password - Plain text password
     * @param {string} storedHash - Stored hash in salt:hash format
     * @returns {Promise<boolean>} True if password matches
     */
    async verifyPassword(password, storedHash) {
        try {
            if (!storedHash || !storedHash.includes(':')) {
                // Plain text comparison (legacy/migration support)
                return password === storedHash;
            }
            const salt = storedHash.split(':')[0];
            const newHash = await this.hashPassword(password, salt);
            return newHash === storedHash;
        } catch (e) {
            if (typeof Logger !== 'undefined') {
                Logger.error('[PasswordHasher] Verify error:', e);
            }
            return false;
        }
    },

    /**
     * Check if a password is already hashed
     * @param {string} password - Password to check
     * @returns {boolean} True if already hashed (salt:hash format)
     */
    isHashed(password) {
        if (!password) return false;
        const parts = password.split(':');
        return parts.length === 2 && parts[0].length === 32 && parts[1].length === 64;
    },

    /**
     * Fallback hash for environments without Web Crypto
     * @private
     */
    _fallbackHash(password, salt) {
        if (!salt) salt = this.generateSalt();
        let hash = 0;
        const str = salt + password;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        const hashHex = Math.abs(hash).toString(16).padStart(64, '0');
        return salt + ':' + hashHex;
    }
};

// ========================================
// SESSION MANAGER
// ========================================

const SessionManager = {
    /**
     * Initialize session timeout tracking
     */
    init() {
        if (SecurityState.initialized) return;
        
        // Track user activity
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(event => {
            document.addEventListener(event, () => this.resetTimer(), { passive: true });
        });

        // Start checking
        SecurityState.sessionTimer = setInterval(() => this.checkTimeout(), SecurityState.sessionCheckInterval);
        SecurityState.lastActivity = Date.now();
        SecurityState.initialized = true;
        
        if (typeof Logger !== 'undefined') {
            Logger.debug('✅ Session Timeout Manager initialized (30 min idle timeout)');
        }
    },

    /**
     * Reset the activity timer
     */
    resetTimer() {
        SecurityState.lastActivity = Date.now();
        if (SecurityState.warningShown) {
            SecurityState.warningShown = false;
            // Remove warning toast if it exists
            const warningEl = document.getElementById('sessionWarningToast');
            if (warningEl) warningEl.remove();
        }
    },

    /**
     * Check if session has timed out
     */
    checkTimeout() {
        // Only check if user is logged in
        if (typeof currentUser === 'undefined' || !currentUser) return;

        const elapsed = Date.now() - SecurityState.lastActivity;

        if (elapsed >= SecurityState.sessionTimeout) {
            // Session expired - logout
            this.handleTimeout();
        } else if (elapsed >= SecurityState.sessionWarningTime && !SecurityState.warningShown) {
            // Show warning
            this.showWarning();
        }
    },

    /**
     * Show timeout warning
     */
    showWarning() {
        SecurityState.warningShown = true;
        const remainingMin = Math.ceil((SecurityState.sessionTimeout - (Date.now() - SecurityState.lastActivity)) / 60000);

        // Create warning toast
        const toast = document.createElement('div');
        toast.id = 'sessionWarningToast';
        toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#ffc107;color:#333;padding:16px 24px;border-radius:8px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:bold;max-width:350px;';
        toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:24px;">⏰</span>
                <div>
                    <div>Session Expiring Soon</div>
                    <div style="font-weight:normal;font-size:13px;margin-top:4px;">
                        You'll be logged out in ~${remainingMin} min due to inactivity.
                        Move your mouse or press a key to stay logged in.
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(toast);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 10000);
    },

    /**
     * Handle session timeout - logout user
     */
    handleTimeout() {
        if (typeof currentUser === 'undefined' || !currentUser) return;

        const username = currentUser ? currentUser.username : 'unknown';
        
        if (typeof Logger !== 'undefined') {
            Logger.debug('[SessionManager] Session timed out for:', username);
        }

        if (typeof addSystemLog === 'function') {
            addSystemLog('Session timed out for: ' + username);
        }

        // Show timeout message
        if (typeof showAlert === 'function') {
            showAlert('Your session has expired due to inactivity. Please log in again.', 'warning', 'loginAlert');
        }

        // Logout
        if (typeof logout === 'function') {
            logout();
        }
    },

    /**
     * Get remaining session time in milliseconds
     */
    getRemainingTime() {
        return Math.max(0, SecurityState.sessionTimeout - (Date.now() - SecurityState.lastActivity));
    },

    /**
     * Get session info
     */
    getSessionInfo() {
        return {
            lastActivity: SecurityState.lastActivity,
            remainingMs: this.getRemainingTime(),
            remainingMin: Math.ceil(this.getRemainingTime() / 60000),
            isWarning: SecurityState.warningShown,
            isActive: this.getRemainingTime() > 0
        };
    },

    /**
     * Destroy session manager
     */
    destroy() {
        if (SecurityState.sessionTimer) {
            clearInterval(SecurityState.sessionTimer);
            SecurityState.sessionTimer = null;
        }
        SecurityState.initialized = false;
    }
};

// ========================================
// INPUT SANITIZATION
// ========================================

const InputSanitizer = {
    /**
     * Escape HTML entities in a string
     * @param {string} str - String to escape
     * @returns {string} Escaped string safe for HTML
     */
    escapeHTML(str) {
        if (str === null || str === undefined) {
            return '';
        }
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Sanitize user input to prevent XSS
     * @param {string} input - User input to sanitize
     * @returns {string} Sanitized string
     */
    sanitize(input) {
        if (input === null || input === undefined) {
            return '';
        }
        return this.escapeHTML(String(input));
    },

    /**
     * Safely set innerHTML with escaped content
     * @param {HTMLElement} element - Element to set content on
     * @param {string} content - Content to set (will be escaped)
     */
    safeSetInnerHTML(element, content) {
        if (!element) return;
        element.textContent = this.sanitize(content);
    },

    /**
     * Safely create option elements from data
     * @param {Array} items - Array of items
     * @param {string} valueKey - Key for value attribute
     * @param {string} textKey - Key for display text
     * @param {string} selectedValue - Currently selected value
     * @param {string} placeholder - Default placeholder text
     * @returns {string} Safe HTML string for options
     */
    safeCreateOptions(items, valueKey, textKey, selectedValue, placeholder = 'Select') {
        let options = `<option value="">${this.escapeHTML(placeholder)}</option>`;

        for (const item of items) {
            const value = this.escapeHTML(String(item[valueKey] || ''));
            const text = this.escapeHTML(String(item[textKey] || item.username || ''));
            const selected = String(value) === String(selectedValue) ? 'selected' : '';
            options += `<option value="${value}" ${selected}>${text}</option>`;
        }

        return options;
    },

    /**
     * Safely render user data in HTML
     * @param {Object} user - User object
     * @returns {Object} Escaped user object
     */
    safeRenderUser(user) {
        if (!user) return {};
        return {
            id: this.escapeHTML(String(user.id || '')),
            fullName: this.escapeHTML(user.fullName || user.username || ''),
            username: this.escapeHTML(user.username || ''),
            role: this.escapeHTML(user.role || '')
        };
    },

    /**
     * Validate and sanitize email
     */
    sanitizeEmail(email) {
        if (!email) return '';
        return email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '');
    },

    /**
     * Validate and sanitize phone
     */
    sanitizePhone(phone) {
        if (!phone) return '';
        return phone.replace(/[^0-9+\-() ]/g, '');
    },

    /**
     * Sanitize for SQL (basic - should use parameterized queries on server)
     */
    sanitizeSQL(str) {
        if (!str) return '';
        return str.replace(/[';\\--]/g, '');
    },

    /**
     * Sanitize object recursively
     */
    sanitizeObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return typeof obj === 'string' ? this.sanitize(obj) : obj;
        }

        const sanitized = Array.isArray(obj) ? [] : {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                sanitized[key] = this.sanitizeObject(obj[key]);
            }
        }

        return sanitized;
    }
};

// ========================================
// SECURITY VALIDATOR
// ========================================

const SecurityValidator = {
    /**
     * Validate email
     */
    isEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    /**
     * Validate phone number
     */
    isPhone(phone) {
        return /^[\d\-+()]{10,}$/.test(phone);
    },

    /**
     * Validate string length
     */
    isLength(str, min, max) {
        if (!str) return false;
        return str.length >= min && str.length <= max;
    },

    /**
     * Validate required fields
     */
    required(value) {
        return value !== null && value !== undefined && value !== '';
    },

    /**
     * Check for potential XSS patterns
     */
    hasXSSPatterns(str) {
        if (!str) return false;
        const xssPatterns = [
            /<script\b/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /data:/i,
            /vbscript:/i,
            /<iframe/i,
            /<object/i,
            /<embed/i
        ];
        return xssPatterns.some(pattern => pattern.test(str));
    },

    /**
     * Check for SQL injection patterns
     */
    hasSQLInjectionPatterns(str) {
        if (!str) return false;
        const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/i,
            /(--|\#|\/\*|\*\/)/,
            /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
            /\bwaitfor\b/i,
            /\bbenchmark\b/i
        ];
        return sqlPatterns.some(pattern => pattern.test(str));
    },

    /**
     * Validate input is safe
     */
    isSafe(str) {
        return !this.hasXSSPatterns(str) && !this.hasSQLInjectionPatterns(str);
    }
};

// ========================================
// QUICK ACTIONS (Consolidated from quick-actions.js)
// ========================================

const QuickActions = {
    /**
     * Update the Quick Actions panel with current data
     */
    update() {
        this.updatePendingTimeoffBadge();
    },

    /**
     * Update the pending time-off requests badge
     */
    updatePendingTimeoffBadge() {
        const badge = document.getElementById('quickActionTimeoffBadge');
        if (!badge) return;

        try {
            const timeoffRequests = JSON.parse(localStorage.getItem('lifestarTimeoffRequests') || '[]');
            const pendingCount = timeoffRequests.filter(function(req) {
                return req.status === 'pending';
            }).length;

            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {
            if (typeof Logger !== 'undefined') {
                Logger.error('[QuickActions] Error updating timeoff badge:', e);
            }
        }
    },

    /**
     * Initialize the Quick Actions panel
     */
    init() {
        this.update();
        // Update badges every 30 seconds
        setInterval(() => this.update(), 30000);
    }
};

// ========================================
// INITIALIZATION
// ========================================

// Run CSRF cleanup every 5 minutes
setInterval(() => CSRFProtection.cleanupExpiredTokens(), 300000);

// Auto-initialize session manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => SessionManager.init(), 2000);
    });
} else {
    setTimeout(() => SessionManager.init(), 2000);
}

// Auto-initialize quick actions
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', QuickActions.init);
} else {
    QuickActions.init();
}

// ========================================
// GLOBAL EXPORTS
// ========================================

// Make available globally
window.CSRFProtection = CSRFProtection;
window.PasswordHasher = PasswordHasher;
window.SessionManager = SessionManager;
window.InputSanitizer = InputSanitizer;
window.SecurityValidator = SecurityValidator;
window.QuickActions = QuickActions;

// Backward compatibility aliases
window.csrfProtection = CSRFProtection;
window.SanitizeHelper = InputSanitizer;
window.Validator = SecurityValidator;
window.escapeHTML = InputSanitizer.escapeHTML;
window.sanitizeInput = InputSanitizer.sanitize;
window.safeSetInnerHTML = InputSanitizer.safeSetInnerHTML;
window.safeCreateOptions = InputSanitizer.safeCreateOptions;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CSRFProtection,
        PasswordHasher,
        SessionManager,
        InputSanitizer,
        SecurityValidator,
        QuickActions
    };
}