/**
 * Session Timeout Manager
 * Auto-logs out idle users after 30 minutes with 5-minute warning
 */
const SessionManager = {
    timeout: 30 * 60 * 1000,        // 30 minutes
    warningTime: 25 * 60 * 1000,    // Warning at 25 minutes (5 min before timeout)
    checkInterval: 60 * 1000,        // Check every 60 seconds
    lastActivity: Date.now(),
    timer: null,
    warningShown: false,
    warningToast: null,

    /**
     * Initialize session timeout tracking
     */
    init() {
        // Track user activity
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(event => {
            document.addEventListener(event, () => this.resetTimer(), { passive: true });
        });

        // Start checking
        this.timer = setInterval(() => this.checkTimeout(), this.checkInterval);
        this.lastActivity = Date.now();
        Logger.debug('✅ Session Timeout Manager initialized (30 min idle timeout)');
    },

    /**
     * Reset the activity timer
     */
    resetTimer() {
        this.lastActivity = Date.now();
        if(this.warningShown) {
            this.warningShown = false;
            // Remove warning toast if it exists
            const warningEl = document.getElementById('sessionWarningToast');
            if(warningEl) warningEl.remove();
        }
    },

    /**
     * Check if session has timed out
     */
    checkTimeout() {
        // Only check if user is logged in
        if(typeof currentUser === 'undefined' || !currentUser) return;

        const elapsed = Date.now() - this.lastActivity;

        if(elapsed >= this.timeout) {
            // Session expired - logout
            this.handleTimeout();
        } else if(elapsed >= this.warningTime && !this.warningShown) {
            // Show warning
            this.showWarning();
        }
    },

    /**
     * Show timeout warning
     */
    showWarning() {
        this.warningShown = true;
        const remainingMin = Math.ceil((this.timeout - (Date.now() - this.lastActivity)) / 60000);

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
            if(toast.parentNode) toast.remove();
        }, 10000);
    },

    /**
     * Handle session timeout - logout user
     */
    handleTimeout() {
        if(typeof currentUser === 'undefined' || !currentUser) return;

        const username = currentUser ? currentUser.username : 'unknown';
        Logger.debug('[SessionManager] Session timed out for:', username);

        if(typeof addSystemLog === 'function') {
            addSystemLog('Session timed out for: ' + username);
        }

        // Show timeout message
        if(typeof showAlert === 'function') {
            showAlert('Your session has expired due to inactivity. Please log in again.', 'warning', 'loginAlert');
        }

        // Logout
        if(typeof logout === 'function') {
            logout();
        }
    },

    /**
     * Destroy session manager
     */
    destroy() {
        if(this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Delay init to ensure app is loaded
    setTimeout(() => SessionManager.init(), 2000);
});
