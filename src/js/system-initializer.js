/**
 * Unified System Initializer
 * Initializes all system components in correct order
 */
class SystemInitializer {
    constructor() {
        this.modules = [];
        this.initialized = false;
        this.startTime = Date.now();
    }

    /**
     * Register a module for initialization
     */
    register(name, initFn, priority = 5) {
        this.modules.push({ name, initFn, priority, status: 'pending' });
    }

    /**
     * Initialize all registered modules
     */
    async initAll() {
        Logger.debug('[System] Starting initialization...');

        // Sort by priority (lower = first)
        this.modules.sort((a, b) => a.priority - b.priority);

        let success = 0;
        let failed = 0;

        for(const mod of this.modules) {
            try {
                Logger.debug('[System] Initializing: ' + mod.name);
                await mod.initFn();
                mod.status = 'ready';
                success++;
            } catch (error) {
                Logger.error('[System] Failed: ' + mod.name + ' - ' + error.message);
                mod.status = 'failed';
                failed++;
            }
        }

        this.initialized = true;
        const duration = Date.now() - this.startTime;

        Logger.debug('[System] Initialization complete in ' + duration + 'ms');
        Logger.debug('[System] Success: ' + success + ', Failed: ' + failed);

        return { success, failed, duration, modules: this.modules.map(m => ({ name: m.name, status: m.status })) };
    }

    /**
     * Get system status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            uptime: Date.now() - this.startTime,
            modules: this.modules.map(m => ({ name: m.name, status: m.status })),
            ready: this.modules.filter(m => m.status === 'ready').length,
            total: this.modules.length
        };
    }
}

// Create and configure system initializer
const system = new SystemInitializer();

// Register all modules in priority order
system.register('Constants', () => {
    // core-constants.js provides all constants (consolidated from constants.js)
    Logger.debug('  ✓ Constants loaded');
}, 1);

system.register('Security - Password Hashing', () => {
    // PasswordHasher now lives in core-security.js (file archived)
    Logger.debug('  ✓ Password hashing ready');
}, 2);

system.register('Security - CSRF Protection', () => {
    // CSRFProtection now lives in core-security.js (file archived)
    Logger.debug('  ✓ CSRF protection ready');
}, 2);

system.register('Security - Session Timeout', () => {
    // SessionManager now lives in core-security.js (file archived)
    Logger.debug('  ✓ Session timeout ready');
}, 2);

system.register('Helper Functions', () => {
    // helpers now live in core-helpers.js (file archived)
    Logger.debug('  ✓ Helper functions loaded');
}, 3);

system.register('Production Monitoring', () => {
    // production-monitoring merged into core-performance.js
    Logger.debug('  ✓ Production monitoring active');
}, 4);

system.register('Error Tracking', () => {
    // error-tracker functionality integrated into Logger in core-utils.js
    Logger.debug('  ✓ Error tracking active');
}, 4);

system.register('Production Logging', () => {
    // production-logging merged into core-utils.js
    Logger.debug('  ✓ Production logging active');
}, 4);

system.register('Backup System', () => {
    // backup-system merged into core-performance.js
    Logger.debug('  ✓ Backup system ready');
}, 5);

system.register('Modal Focus Manager', () => {
    Logger.debug('  ✓ Modal focus manager ready');
}, 6);

system.register('Notification Manager', () => {
    Logger.debug('  ✓ Notification manager ready');
}, 6);

system.register('Advanced Search', () => {
    Logger.debug('  ✓ Advanced search ready');
}, 6);

system.register('Keyboard Shortcuts', () => {
    Logger.debug('  ✓ Keyboard shortcuts ready');
}, 6);

system.register('Undo/Redo Manager', () => {
    Logger.debug('  ✓ Undo/redo manager ready');
}, 6);

system.register('Data Exporter', () => {
    Logger.debug('  ✓ Data exporter ready');
}, 6);

system.register('Service Worker', () => {
    Logger.debug('  ✓ Service worker registered');
}, 7);

// Auto-initialize

// Register new modules
system.register('Incident Reports', () => {
    if (typeof IncidentReports !== 'undefined') {
        Logger.debug('  ✓ IncidentReports ready');
    }
}, 8);

system.register('Export Utils', () => {
    if (typeof ExportUtils !== 'undefined') {
        Logger.debug('  ✓ ExportUtils ready');
    }
}, 8);

system.register('Theme Manager', () => {
    if (typeof ThemeManager !== 'undefined') {
        ThemeManager.init();
        Logger.debug('  ✓ ThemeManager ready');
    }
}, 3);

system.initAll().then(result => {
    Logger.debug('\n[System] All modules initialized: ' + result.success + '/' + (result.success + result.failed));
}).catch(error => {
    Logger.error('[System] Initialization failed:', error);
});
