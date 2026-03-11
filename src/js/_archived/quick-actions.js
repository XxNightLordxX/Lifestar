/**
 * Quick Actions Panel Module
 * Provides quick access to common Boss dashboard tasks
 */


const QuickActions = (function() {
    'use strict';

    /**
     * Update the Quick Actions panel with current data
     */
    function updateQuickActions() {
        updatePendingTimeoffBadge();
    }

    /**
     * Update the pending time-off requests badge
     */
    function updatePendingTimeoffBadge() {
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
            Logger.error('[QuickActions] Error updating timeoff badge:', e);
        }
    }

    /**
     * Initialize the Quick Actions panel
     */
    function init() {
        updateQuickActions();
        
        // Update badges every 30 seconds
        setInterval(updateQuickActions, 30000);
    }

    // Public API
    return {
        update: updateQuickActions,
        updatePendingTimeoffBadge: updatePendingTimeoffBadge,
        init: init
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', QuickActions.init);
} else {
    QuickActions.init();
}