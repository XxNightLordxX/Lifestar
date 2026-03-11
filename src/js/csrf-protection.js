/**
 * CSRF Protection Utility
 * Generates and validates CSRF tokens (browser-compatible)
 */
class CSRFProtection {
    constructor() {
        this.tokens = new Map();
        this.tokenExpiry = 3600; // 1 hour
    }

    /**
     * Generate a new CSRF token (browser-compatible)
     * @param {string} sessionId - User session ID
     * @returns {string} CSRF token
     */
    generateToken(sessionId) {
        // Browser-compatible random token generation
        const array = new Uint8Array(32);
        if(window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(array);
        } else {
            // Fallback for older browsers
            for(const i = 0; i < 32; i++) {
                array[i] = Math.floor(Math.random() * 256);
            }
        }
        const token = Array.from(array, function(b) { return b.toString(16).padStart(2, '0'); }).join('');

        this.tokens.set(token, {
            sessionId: sessionId,
            expires: Date.now() + (this.tokenExpiry * 1000)
        });
        return token;
    }

    /**
     * Validate a CSRF token
     * @param {string} token - CSRF token to validate
     * @param {string} sessionId - User session ID
     * @returns {boolean} True if token is valid
     */
    validateToken(token, sessionId) {
        const stored = this.tokens.get(token);
        if(!stored) return false;
        if(stored.sessionId !== sessionId) return false;
        if(stored.expires < Date.now()) {
            this.tokens.delete(token);
            return false;
        }
        return true;
    }

    /**
     * Clean up expired tokens
     */
    cleanupExpiredTokens() {
        const now = Date.now();
        for(const entry of this.tokens.entries()) {
            if(entry[1].expires < now) {
                this.tokens.delete(entry[0]);
            }
        }
    }
}

// Export singleton instance
const csrfProtection = new CSRFProtection();
// Run cleanup every 5 minutes
setInterval(function() { csrfProtection.cleanupExpiredTokens(); }, 300000);
