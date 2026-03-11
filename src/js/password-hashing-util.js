/**
 * Password Hashing Utility (SHA-256) - Browser Compatible
 * Uses Web Crypto API for secure password hashing
 */
const PasswordHasher = {
    /**
     * Generate a random salt
     * @returns {string} Hex-encoded salt
     */
    generateSalt() {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
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
            if(!salt) salt = this.generateSalt();
            const encoder = new TextEncoder();
            const data = encoder.encode(salt + password);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return salt + ':' + hashHex;
        } catch (e) {
            // Fallback for environments without Web Crypto
            Logger.warn('[PasswordHasher] Web Crypto not available, using basic hash');
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
            if(!storedHash || !storedHash.includes(':')) {
                // Plain text comparison (legacy/migration support)
                return password === storedHash;
            }
            const salt = storedHash.split(':')[0];
            const newHash = await this.hashPassword(password, salt);
            return newHash === storedHash;
        } catch (e) {
            Logger.error('[PasswordHasher] Verify error:', e);
            return false;
        }
    },

    /**
     * Check if a password is already hashed
     * @param {string} password - Password to check
     * @returns {boolean} True if already hashed (salt:hash format)
     */
    isHashed(password) {
        if(!password) return false;
        const parts = password.split(':');
        return parts.length === 2 && parts[0].length === 32 && parts[1].length === 64;
    },

    /**
     * Fallback hash for environments without Web Crypto
     */
    _fallbackHash(password, salt) {
        if(!salt) salt = this.generateSalt();
        let hash = 0;
        const str = salt + password;
        for(let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer;
        }
        const hashHex = Math.abs(hash).toString(16).padStart(64, '0');
        return salt + ':' + hashHex;
    }
};

Logger.debug('✅ Password Hashing Utility loaded (Web Crypto API)');
