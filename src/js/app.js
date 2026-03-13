
// Lifestar Ambulance Scheduling System - Main JavaScript
// Version 2.0.0 - Revamped with Sidebar Navigation

// ========================================
// GLOBAL VARIABLES
// ========================================

let currentUser = null;
let schedules = [];
let users = [];
let systemLogs = [];
let notifications = [];
let editingUserId = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    // Load real data FROM STORAGE FIRST — must happen before loadSampleData
    // so sample users/schedules only fill gaps and never overwrite real data
    try { loadData(); } catch(e) { Logger.error('loadData error:', e); }

    try { loadFeatureStates(); } catch(e) { Logger.error('loadFeatureStates error:', e); }
    try { loadSampleData(); } catch(e) { Logger.error('loadSampleData error:', e); }
    try { initializeSystem(); } catch(e) { Logger.error('initializeSystem error:', e); }
    try { setupEventListeners(); } catch(e) { Logger.error('setupEventListeners error:', e); }

    // Initialize dropdown compatibility
    try { initializeDropdowns(); } catch(e) { Logger.error('initializeDropdowns error:', e); }

    // Auto-archive past schedules
    try { autoArchivePastSchedules(); } catch(e) { Logger.error('autoArchivePastSchedules error:', e); }

    // Register service worker for offline support
    if('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => Logger.info('[App] Service worker registered'))
            .catch(e => Logger.warn('[App] Service worker registration failed:', e.message));
    }
});

/** @function initializeSystem */
function initializeSystem() {
    try {
        // First, hide all dashboards explicitly
        hideAllDashboards();

        // Hide first login page
        document.getElementById('firstLoginPage').classList.add('hidden');
        document.getElementById('firstLoginPage').style.display = 'none';

        // Show only login page initially
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('loginPage').style.display = 'flex';

        // Data was already loaded before this function runs (see DOMContentLoaded order)

        // Check for existing session — re-fetch from users array to get fresh data.
        // IMPORTANT: In server mode the users array may be empty at this point because
        // ServerBridge.init() runs concurrently and hasn't fetched from the API yet.
        // We guard against that: if users is empty AND there is a saved session, we
        // trust the session and leave it for server-bridge.js to validate via /auth/me.
        // Only clear the session when we can positively confirm the user no longer exists
        // (i.e. the users array is non-empty and the user is not in it).
        const savedUser = localStorage.getItem('lifestarCurrentUser');
        if(savedUser) {
            const sessionUser = safeJSONParse(savedUser, null);
            if(sessionUser && sessionUser.id) {
                if (users.length > 0) {
                    // Users loaded — validate against the array
                    const freshUser = users.find(u => String(u.id) === String(sessionUser.id));
                    if(freshUser && freshUser.active !== false) {
                        currentUser = freshUser;
                        // Update stored session with fresh data
                        localStorage.setItem('lifestarCurrentUser', JSON.stringify(freshUser));
                        showDashboard();
                    } else {
                        // User deactivated or not found — clear session
                        localStorage.removeItem('lifestarCurrentUser');
                    }
                } else {
                    // Users array empty — could be server mode where bridge hasn't
                    // loaded yet. Trust the saved session; bridge will validate it via
                    // /auth/me and either show the dashboard or leave it on login page.
                    currentUser = sessionUser;
                    // Do NOT call showDashboard() here — let bridge handle it after
                    // it verifies the JWT and loads data.
                }
            }
        }
    } catch (error) {
        Logger.error('[initializeSystem] Error:', error.message || error);
    }
}

/** @function setupEventListeners */
function setupEventListeners() {
    try {
        // Login form - use indirection (e => window.handleLogin(e)) so that
        // server-bridge.js can patch window.handleLogin after DOMContentLoaded
        // and the form will always call the CURRENT version, not the one that
        // was in scope when this listener was registered.
        const loginForm = document.getElementById('loginForm');
        if(loginForm) loginForm.addEventListener('submit', e => window.handleLogin(e));

        const firstLoginForm = document.getElementById('firstLoginForm');
        if(firstLoginForm) firstLoginForm.addEventListener('submit', e => window.handleFirstLogin(e));

        const createScheduleForm = document.getElementById('createScheduleForm');
        if(createScheduleForm) createScheduleForm.addEventListener('submit', e => window.handleCreateSchedule(e));

        const addUserForm = document.getElementById('addUserForm');
        if(addUserForm) addUserForm.addEventListener('submit', e => window.handleAddUser(e));
    } catch (error) {
        Logger.error('[setupEventListeners] Error:', error.message || error);
    }
}

/** @function loadData */
function loadData() {
    try {
        // Load users
        const savedUsers = localStorage.getItem('lifestarUsers');
        if(savedUsers) {
            users = safeJSONParse(savedUsers, users || []);
        }

        // Load schedules
        const savedSchedules = localStorage.getItem('lifestarSchedules');
        if(savedSchedules) {
            schedules = safeJSONParse(savedSchedules, schedules || []) || [];
        }

        // Load system logs
        const savedLogs = localStorage.getItem('lifestarLogs');
        if(savedLogs) {
            systemLogs = safeJSONParse(savedLogs, systemLogs || []);
        }
    } catch (error) {
        Logger.error('[loadData] Error:', error.message || error);
    }
}

/** @function saveData - Debounced localStorage write */
let _saveTimeout = null;
function saveData(immediate) {
    if(immediate) {
        _doSave();
        return;
    }
    // Debounce: batch rapid saves into one write
    if(_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(_doSave, 100);
}

function _doSave() {
    try {
        const data = {
            users: JSON.stringify(users),
            schedules: JSON.stringify(schedules),
            logs: JSON.stringify(systemLogs)
        };
        localStorage.setItem('lifestarUsers', data.users);
        localStorage.setItem('lifestarSchedules', data.schedules);
        localStorage.setItem('lifestarLogs', data.logs);
    } catch (error) {
        Logger.error('[saveData] Error:', error.message || error);
        if(error.name === 'QuotaExceededError') {
            // Trim old logs to free space
            if(systemLogs.length > 50) {
                systemLogs = systemLogs.slice(-50);
                try {
                    localStorage.setItem('lifestarLogs', JSON.stringify(systemLogs));
                } catch (e) { /* ignore */ }
            }
        }
    }
}

// ========================================
// LOGIN SYSTEM
// ========================================

// Expose patchable functions on window immediately after they are declared.
// This is required because setupEventListeners() uses the pattern
// `e => window.handleLogin(e)` so that server-bridge.js can replace these
// functions at runtime (after DOMContentLoaded) and the form listeners will
// always call the CURRENT version.  Without this block, window.handleXxx
// would be undefined until the function declaration is hoisted — which JS
// hoists to the same scope, but we assign explicitly here for clarity.
(function exposeGlobals() {
    // Assigned below after the functions are declared (hoisting means they
    // are actually available now, but we reassign after each definition for
    // clarity and so the bridge knows exactly which symbol to patch).
})();

/** @function generateCSRFToken */
function generateCSRFToken(sessionId) {
    if (typeof csrfProtection !== 'undefined' && csrfProtection.generateToken) {
        return csrfProtection.generateToken(sessionId);
    }
    return '';
}

/** @function validateCSRFToken */
function validateCSRFToken(token, sessionId) {
    if (typeof csrfProtection !== 'undefined' && csrfProtection.validateToken) {
        return csrfProtection.validateToken(token, sessionId);
    }
    return true;
}

/** @function handleLogin */
async function handleLogin(e) {
    try {
        e.preventDefault();
        const username = (document.getElementById('username') || {value: ''}).value.trim().toLowerCase();
        const password = (document.getElementById('password') || {value: ''}).value;

        if(!username || !password) {
            showAlert('Please enter both username and password', 'warning', 'loginAlert');
            return;
        }

        // If server bridge is available and active, delegate to server API directly.
        // This avoids a race where localStorage has users without passwords (synced from
        // the server) and local comparison always fails (undefined !== 'super123').
        if (typeof ServerBridge !== 'undefined' && ServerBridge.isServerMode) {
            try {
                const r = await ServerBridge.fetch('POST', '/auth/login', { username, password });
                if (r.ok && r.data && r.data.user) {
                    currentUser = {
                        id:          r.data.user.id,
                        username:    r.data.user.username,
                        fullName:    r.data.user.fullName,
                        role:        r.data.user.role,
                        phone:       r.data.user.phone || '',
                        hoursWorked: r.data.user.hoursWorked || 0,
                        bonusHours:  r.data.user.bonusHours  || 0,
                        locationId:  r.data.user.locationId  || null,
                        active:      true
                    };
                    localStorage.setItem('lifestarCurrentUser', JSON.stringify(currentUser));
                    if (typeof ServerBridge.refreshData === 'function') await ServerBridge.refreshData();
                    addSystemLog('User logged in: ' + username);
                    setLoginLoading && setLoginLoading(false);
                    showDashboard();
                } else {
                    setLoginLoading && setLoginLoading(false);
                    const msg = (r.data && (r.data.message || r.data.error)) || 'Invalid username or password';
                    showAlert(msg, 'danger', 'loginAlert');
                }
                return;
            } catch (serverErr) {
                Logger.warn('[handleLogin] Server login failed, falling back to local:', serverErr.message);
                // Fall through to local auth below
            }
        }

        // ── Local authentication (localStorage / offline mode) ──

        // Find user by username (case-insensitive)
        const user = users.find(u => (u.username || '').toLowerCase() === username);

        if(!user) {
            setLoginLoading && setLoginLoading(false);
            showAlert('Invalid username or password', 'danger', 'loginAlert');
            return;
        }

        // Reject deactivated accounts
        if(user.active === false) {
            setLoginLoading && setLoginLoading(false);
            showAlert('This account has been deactivated. Please contact your administrator.', 'danger', 'loginAlert');
            return;
        }

        // If user has no password field (e.g. synced from server), cannot do local auth
        if (!user.password) {
            setLoginLoading && setLoginLoading(false);
            showAlert('Cannot verify credentials offline. Please ensure the server is running.', 'danger', 'loginAlert');
            return;
        }

        // Check password - supports both hashed and plain text (migration)
        let passwordMatch = false;
        if(typeof PasswordHasher !== 'undefined' && PasswordHasher.isHashed(user.password)) {
            passwordMatch = await PasswordHasher.verifyPassword(password, user.password);
        } else {
            // Legacy plain text comparison + auto-migrate to hashed
            passwordMatch = (user.password === password);
            if(passwordMatch && typeof PasswordHasher !== 'undefined') {
                try {
                    user.password = await PasswordHasher.hashPassword(password);
                    saveData();
                    Logger.info('[handleLogin] Password migrated to hash for:', username);
                } catch (hashErr) {
                    Logger.warn('[handleLogin] Could not hash password, keeping plain text:', hashErr.message);
                    // Don't fail login — just keep plain text
                    passwordMatch = true;
                }
            }
        }

        if(passwordMatch) {
            currentUser = user;
            // Store fresh user object (may have migrated password)
            localStorage.setItem('lifestarCurrentUser', JSON.stringify(user));
            addSystemLog('User logged in: ' + user.username);
            setLoginLoading && setLoginLoading(false);
            showDashboard();
        } else {
            setLoginLoading && setLoginLoading(false);
            showAlert('Invalid username or password', 'danger', 'loginAlert');
        }
    } catch (error) {
        setLoginLoading && setLoginLoading(false);
        Logger.error('[handleLogin] Error:', error.message || error);
        showAlert('Login error. Please try again.', 'danger', 'loginAlert');
    }
}
// Make patchable by server-bridge.js
window.handleLogin = handleLogin;

/** @function handleFirstLogin */
async function handleFirstLogin(e) {
    try {
        e.preventDefault();
        const newUsername = (document.getElementById('newUsername') || {value: ''}).value.trim();
        const newPassword = (document.getElementById('newPassword') || {value: ''}).value;
        const confirmPassword = (document.getElementById('confirmPassword') || {value: ''}).value;
        const fullName = (document.getElementById('fullName') || {value: ''}).value.trim();
        const role = (document.getElementById('roleSelection') || {value: ''}).value;
        const phoneNumber = (document.getElementById('phoneNumber') || {value: ''}).value.trim();

        // Validation
        if(!newUsername || !newPassword || !fullName || !role) {
            showAlert('Please fill in all required fields', 'warning', 'firstLoginAlert');
            return;
        }

        if(newPassword.length < 6) {
            showAlert('Password must be at least 6 characters', 'warning', 'firstLoginAlert');
            return;
        }

        if(newPassword !== confirmPassword) {
            showAlert('Passwords do not match', 'danger', 'firstLoginAlert');
            return;
        }

        if(users.some(u => u.username === newUsername)) {
            showAlert('Username already exists', 'danger', 'firstLoginAlert');
            return;
        }

        // Hash password
        let hashedPassword = newPassword;
        if(typeof PasswordHasher !== 'undefined') {
            try {
                hashedPassword = await PasswordHasher.hashPassword(newPassword);
            } catch (hashErr) {
                Logger.warn('[handleFirstLogin] Could not hash password:', hashErr);
            }
        }

        const newUser = {
            id: Date.now(),
            username: newUsername,
            password: hashedPassword,
            fullName: fullName,
            role: role,
            phone: phoneNumber,
            hoursWorked: 0,
            bonusHours: 0,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveData();

        currentUser = newUser;
        localStorage.setItem('lifestarCurrentUser', JSON.stringify(newUser));
        addSystemLog('New user created: ' + newUser.username);

        showDashboard();
    } catch (error) {
        Logger.error('[handleFirstLogin] Error:', error.message || error);
    }
}
// Make patchable by server-bridge.js
window.handleFirstLogin = handleFirstLogin;

/** @function logout */
async function logout() {
    try {
        // Call server API logout if in server mode (clears httpOnly cookie)
        if (typeof ServerBridge !== 'undefined' && ServerBridge.isServerMode) {
            await ServerBridge.fetch('POST', '/auth/logout');
        }
        addSystemLog('User logged out: ' + (currentUser ? currentUser.username : 'Unknown'));
        currentUser = null;
        localStorage.removeItem('lifestarCurrentUser');

        // Clear login form fields
        const usernameField = document.getElementById('username');
        const passwordField = document.getElementById('password');
        if(usernameField) usernameField.value = '';
        if(passwordField) passwordField.value = '';

        // Clear any login alerts
        const loginAlert = document.getElementById('loginAlert');
        if(loginAlert) {
            loginAlert.className = 'alert';
            loginAlert.textContent = '';
        }

        showLoginPage();
    } catch (error) {
        Logger.error('[logout] Error:', error.message || error);
    }
}
// Make patchable by server-bridge.js
window.handleLogout = logout;

/** @function showLoginPage */
function showLoginPage() {
    try {
        // Hide all dashboards
        hideAllDashboards();

        // Hide first login page
        document.getElementById('firstLoginPage').classList.add('hidden');

        // Show login page
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('loginPage').style.display = 'flex';
    } catch (error) {
        Logger.error('[showLoginPage] Error:', error.message || error);
    }
}

/** @function showFirstLoginPage */
function showFirstLoginPage() {
    try {
        // Hide all dashboards
        hideAllDashboards();

        // Hide login page
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('loginPage').style.display = 'none';

        // Show first login page
        document.getElementById('firstLoginPage').classList.remove('hidden');
        document.getElementById('firstLoginPage').style.display = 'flex';
    } catch (error) {
        Logger.error('[showFirstLoginPage] Error:', error.message || error);
    }
}

/** @function hideAllDashboards */
function hideAllDashboards() {
    try {
        document.querySelectorAll('.dashboard').forEach(d => {
            d.classList.remove('active');
            d.style.display = 'none';
        });
    } catch (error) {
        Logger.error('[hideAllDashboards] Error:', error.message || error);
    }
}

/** @function showDashboard */
function showDashboard() {
    try {
        // Hide login pages
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('firstLoginPage').classList.add('hidden');
        document.getElementById('firstLoginPage').style.display = 'none';

        // Hide all dashboards first
        hideAllDashboards();

        // Show appropriate dashboard
        if(!currentUser || !currentUser.role) {
            Logger.error('[showDashboard] No currentUser or role set');
            return;
        }

        const roleMap = {
            'super':     { dashId: 'superDashboard',     nameId: 'superUserName',     loader: loadSuperAdminDashboard },
            'boss':      { dashId: 'bossDashboard',      nameId: 'bossUserName',      loader: loadBossDashboard },
            'paramedic': { dashId: 'paramedicDashboard',  nameId: 'paramedicUserName',  loader: loadParamedicDashboard },
            'emt':       { dashId: 'emtDashboard',        nameId: 'emtUserName',        loader: loadEmtDashboard }
        };

        const cfg = roleMap[currentUser.role];
        if(cfg) {
            const dashboard = document.getElementById(cfg.dashId);
            if(dashboard) {
                dashboard.classList.add('active');
                dashboard.style.display = 'flex';
            }
            const nameEl = document.getElementById(cfg.nameId);
            if(nameEl) nameEl.textContent = currentUser.fullName || currentUser.username;
            if(typeof cfg.loader === 'function') cfg.loader();
        }
        
        // Initialize notification center
        if(typeof NotificationCenter !== 'undefined') {
            setTimeout(() => NotificationCenter.init(), 500);
        }
        
        // Initialize global search
        if(typeof GlobalSearch !== 'undefined') {
            setTimeout(() => GlobalSearch.init(), 500);
        }
        
        // Initialize mobile enhancements
        if(typeof MobileEnhancements !== 'undefined') {
            setTimeout(() => MobileEnhancements.init(), 500);
        }
        
        // Create sample notifications for the user
        if(typeof createSampleNotifications === 'function') {
            createSampleNotifications();
        }
    } catch (error) {
        Logger.error('[showDashboard] Error:', error.message || error);
    }
}

// ========================================
// SUPER ADMIN DASHBOARD FUNCTIONS
// ========================================

/** @function loadSuperAdminDashboard */
function loadSuperAdminDashboard() {
    showSuperSection('overview');
    updateOverviewStats();
    loadUsersTable();
    // Initialize boss features for super admin
    if(typeof initSuperAdminBossFeatures === 'function') initSuperAdminBossFeatures();
    if(typeof loadPermissions === 'function') loadPermissions();
    loadFeatureToggles();
}

/** @function showSuperSection */
function showSuperSection(section) {
    try {
        // Hide all sections
        document.querySelectorAll('.super-section').forEach(s => s.classList.add('hidden'));

        // Remove active class from all nav items
        document.querySelectorAll('#superDashboard .nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Show selected section
        const sectionElement = document.getElementById('super' + section.charAt(0).toUpperCase() + section.slice(1));
        if(sectionElement) {
            sectionElement.classList.remove('hidden');
        }

        // Add active class to clicked nav item (safe event access)
        try {
            const evt = window.event;
            if(evt && evt.currentTarget && evt.currentTarget.classList) {
                evt.currentTarget.classList.add('active');
            } else {
                document.querySelectorAll('#superDashboard .nav-item').forEach(item => {
                    if(item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + section + "'")) {
                        item.classList.add('active');
                    }
                });
            }
        } catch (navError) {
            document.querySelectorAll('#superDashboard .nav-item').forEach(item => {
                if(item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + section + "'")) {
                    item.classList.add('active');
                }
            });
        }

        // Load section-specific data
        if(section === 'overview') {
            updateOverviewStats();
        } else if(section === 'users') {
            loadUsersTable();
        } else if(section === 'features') {
            loadFeatureToggles();
        } else if(section === 'logs') {
            displaySystemLogs();
        } else if(section === 'permissions') {
            if(typeof loadPermissionsManager === 'function') loadPermissionsManager();
        } else if(typeof handleSuperBossSection === 'function') {
            // Handle boss sections accessible by super admin
            handleSuperBossSection(section);
        }
    } catch (error) {
        Logger.error('[showSuperSection] Error:', error.message || error);
    }
}

/** @function updateOverviewStats */
function updateOverviewStats() {
    try {
        const activeUsers   = users.filter(u => u.active !== false).length;
        const draftCount    = schedules.filter(s => s.status === 'draft').length;
        const pubCount      = schedules.filter(s => s.status === 'published').length;
        const paramedics    = users.filter(u => u.role === 'paramedic' && u.active !== false).length;
        const emts          = users.filter(u => u.role === 'emt' && u.active !== false).length;
        const totalCrew     = schedules.reduce((n, s) => n + (s.crews || []).length, 0);

        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        set('totalUsersCount',     activeUsers);
        set('totalSchedulesCount', schedules.length);
        set('lastSystemUpdate',    new Date().toLocaleString());

        // Extended stats — safe-set (elements may not exist on all layouts)
        set('draftSchedulesCount',     draftCount);
        set('publishedSchedulesCount', pubCount);
        set('paramedicCount',          paramedics);
        set('emtCount',                emts);
        set('totalCrewAssignments',    totalCrew);

        // Render quick-stats cards if container exists
        const statsContainer = document.getElementById('overviewQuickStats');
        if(statsContainer) {
            statsContainer.innerHTML =
                _statCard('👤', activeUsers,   'Active Users',      '#3498db') +
                _statCard('📋', draftCount,    'Drafts',            '#f39c12') +
                _statCard('✅', pubCount,      'Published',         '#27ae60') +
                _statCard('🚑', paramedics,    'Paramedics',        '#e74c3c') +
                _statCard('🏥', emts,          'EMTs',              '#9b59b6') +
                _statCard('👥', totalCrew,     'Crew Assignments',  '#1abc9c');
        }

        // Render pending actions widget
        renderPendingActions();
    } catch (error) {
        Logger.error('[updateOverviewStats] Error:', error.message || error);
    }
}

/** @function renderPendingActions - Renders pending action items for the overview dashboard */
function renderPendingActions() {
    try {
        const container = document.getElementById('pendingActionsList');
        if (!container) return;

        // Gather counts from local storage / in-memory data
        let pendingTimeoff = 0, openSwaps = 0, openCallins = 0, expiringTraining = 0;
        try {
            const tr = localStorage.getItem('lifestarTimeoffRequests');
            if (tr) pendingTimeoff = (JSON.parse(tr) || []).filter(r => r.status === 'pending').length;
        } catch (_) {}
        try {
            const sw = localStorage.getItem('lifestarSwapListings');
            if (sw) openSwaps = (JSON.parse(sw) || []).filter(r => r.status === 'open' || r.status === 'pending').length;
        } catch (_) {}
        try {
            const ci = localStorage.getItem('lifestarCallins');
            if (ci) openCallins = (JSON.parse(ci) || []).filter(r => r.status === 'open' || r.status === 'pending').length;
        } catch (_) {}
        try {
            const tg = localStorage.getItem('lifestarTrainingRecords');
            if (tg) {
                const now = new Date();
                const thirtyDays = 30 * 24 * 60 * 60 * 1000;
                expiringTraining = (JSON.parse(tg) || []).filter(r => {
                    if (!r.expiryDate) return false;
                    const exp = new Date(r.expiryDate);
                    return exp - now < thirtyDays && exp > now;
                }).length;
            }
        } catch (_) {}

        const items = [
            { icon: '🏖️', count: pendingTimeoff, label: 'Pending Time Off', section: 's_timeoff', color: '#f39c12' },
            { icon: '🔀', count: openSwaps, label: 'Open Swaps', section: 's_swap', color: '#3498db' },
            { icon: '🚨', count: openCallins, label: 'Open Call-ins', section: 's_callins', color: '#e74c3c' },
            { icon: '🎓', count: expiringTraining, label: 'Expiring Certs (30d)', section: 's_training', color: '#9b59b6' }
        ];

        container.innerHTML = items.map(function(item) {
            var urgencyBg = item.count > 0 ? 'rgba(' + (item.color === '#e74c3c' ? '231,76,60' : item.color === '#f39c12' ? '243,156,18' : item.color === '#3498db' ? '52,152,219' : '155,89,182') + ',.1)' : '#f8f9fa';
            return '<div onclick="showSuperSection(\'' + item.section + '\')" style="cursor:pointer;background:' + urgencyBg + ';border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:12px;min-width:180px;flex:1;border:1px solid ' + (item.count > 0 ? item.color + '33' : '#eee') + ';transition:transform .15s,box-shadow .15s;" onmouseenter="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 4px 12px rgba(0,0,0,.12)\'" onmouseleave="this.style.transform=\'none\';this.style.boxShadow=\'none\'">' +
                '<div style="font-size:1.8rem;line-height:1">' + item.icon + '</div>' +
                '<div>' +
                '<div style="font-size:1.5rem;font-weight:700;color:' + item.color + ';line-height:1">' + item.count + '</div>' +
                '<div style="font-size:.78rem;color:#666;margin-top:2px">' + item.label + '</div>' +
                '</div></div>';
        }).join('');
    } catch (e) {
        Logger.error('[renderPendingActions]', e);
    }
}

function _statCard(icon, value, label, color) {
    return '<div style="background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 2px 8px rgba(0,0,0,.08);display:flex;align-items:center;gap:14px;min-width:150px;flex:1;">' +
        '<div style="font-size:2rem;line-height:1">' + icon + '</div>' +
        '<div>' +
        '<div style="font-size:1.6rem;font-weight:700;color:' + color + ';line-height:1">' + value + '</div>' +
        '<div style="font-size:.8rem;color:#888;margin-top:2px">' + label + '</div>' +
        '</div></div>';
}

/** @function loadUsersTable */
function loadUsersTable() {
    try {
        const tbody = document.getElementById('usersTableBody');
        if(!tbody) return;
        tbody.textContent = '';

        // Sort: super > boss > paramedic > emt, then alphabetically
        const roleOrder = { super: 0, boss: 1, paramedic: 2, emt: 3 };
        const sorted = [...users].sort((a, b) => {
            const rd = (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9);
            return rd !== 0 ? rd : (a.fullName || a.username).localeCompare(b.fullName || b.username);
        });

        sorted.forEach(user => {
            let locName = '—';
            if (user.locationId && typeof MultiLocation !== 'undefined') {
                const loc = MultiLocation.getLocationById(user.locationId);
                if (loc) locName = loc.code;
            }

            // Count shift assignments for this user
            let shiftCount = 0;
            schedules.forEach(s => {
                (s.crews || []).forEach(c => {
                    if(String(c.paramedicId) === String(user.id) || String(c.emtId) === String(user.id)) shiftCount++;
                });
            });

            const isActive = user.active !== false;
            const statusBadge = isActive
                ? '<span style="background:#d4edda;color:#155724;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600">Active</span>'
                : '<span style="background:#f8d7da;color:#721c24;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600">Inactive</span>';

            const roleColors = { super: '#6f42c1', boss: '#fd7e14', paramedic: '#0d6efd', emt: '#20c997' };
            const roleColor  = roleColors[user.role] || '#6c757d';

            const row = document.createElement('tr');
            row.style.opacity = isActive ? '1' : '0.6';
            row.innerHTML =
                '<td><strong>' + sanitizeHTML(user.username) + '</strong></td>' +
                '<td>' + sanitizeHTML(user.fullName || 'N/A') + '</td>' +
                '<td><span style="background:' + roleColor + ';color:#fff;padding:2px 10px;border-radius:10px;font-size:.75rem;font-weight:600">' + sanitizeHTML(user.role.toUpperCase()) + '</span></td>' +
                '<td>' + sanitizeHTML(user.phone || 'N/A') + '</td>' +
                '<td>' + sanitizeHTML(locName) + '</td>' +
                '<td>' + shiftCount + ' shift' + (shiftCount !== 1 ? 's' : '') + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '<td style="white-space:nowrap">' +
                    '<button class="btn btn-sm btn-warning" onclick="editUser(' + parseInt(user.id) + ')" title="Edit user">✏️</button> ' +
                    (user.id !== currentUser.id ? '<button class="btn btn-sm btn-danger" onclick="deleteUser(' + parseInt(user.id) + ')" title="Delete user">🗑</button>' : '') +
                '</td>';
            tbody.appendChild(row);
        });

        // Update count badge
        const countEl = document.getElementById('usersTableCount');
        if(countEl) countEl.textContent = users.length + ' users';
    } catch (error) {
        Logger.error('[loadUsersTable] Error:', error.message || error);
    }
}

/** @function filterUsersTable — live search + role filter for users table */
function filterUsersTable(query) {
    try {
        const q    = (query || '').toLowerCase().trim();
        const role = (document.getElementById('usersRoleFilter') || {value: ''}).value;
        const rows = document.querySelectorAll('#usersTableBody tr');
        let visible = 0;
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const rowRole = (row.querySelector('td:nth-child(3)') || {textContent:''}).textContent.toLowerCase();
            const matchQ    = !q    || text.includes(q);
            const matchRole = !role || rowRole.includes(role);
            row.style.display = (matchQ && matchRole) ? '' : 'none';
            if(matchQ && matchRole) visible++;
        });
        const countEl = document.getElementById('usersTableCount');
        if(countEl) countEl.textContent = visible + ' of ' + users.length + ' users';
    } catch(e) { Logger.error('[filterUsersTable]', e); }
}

/**
 * Get user form data from DOM
 * @returns {Object} Form data object
 */
function getUserFormData() {
    return {
        username: (document.getElementById('newUserUsername') || {value: ''}).value.trim(),
        password: (document.getElementById('newUserPassword') || {value: ''}).value,
        fullName: (document.getElementById('newUserFullName') || {value: ''}).value.trim(),
        role: (document.getElementById('newUserRole') || {value: ''}).value,
        phone: (document.getElementById('newUserPhone') || {value: ''}).value.trim(),
        locationId: (document.getElementById('newUserLocation') || {value: ''}).value
    };
}

/**
 * Validate user form data
 * @param {Object} data - Form data
 * @param {boolean} isNewUser - Whether this is a new user
 * @returns {boolean} True if valid
 */
function validateUserData(data, isNewUser) {
    if (!data.username || !data.fullName || !data.role) {
        showAlert('Please fill in all required fields', 'warning');
        return false;
    }
    
    if (isNewUser && !data.password) {
        showAlert('Password is required for new users', 'warning');
        return false;
    }
    
    if (isNewUser && users.some(u => u.username === data.username)) {
        showAlert('Username already exists', 'danger');
        return false;
    }
    
    return true;
}

/**
 * Hash password using PasswordHasher
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashUserPassword(password) {
    if (password && typeof PasswordHasher !== 'undefined') {
        try {
            return await PasswordHasher.hashPassword(password);
        } catch (hashErr) {
            Logger.warn('[hashUserPassword] Could not hash password:', hashErr);
        }
    }
    return password;
}

/**
 * Update existing user
 * @param {string} userId - User ID to update
 * @param {Object} data - Form data
 * @param {string} hashedPassword - Hashed password
 */
function updateExistingUser(userId, data, hashedPassword) {
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return false;
    
    users[userIndex].username = data.username;
    if (data.password) {
        users[userIndex].password = hashedPassword;
    }
    users[userIndex].fullName = data.fullName;
    users[userIndex].role = data.role;
    users[userIndex].phone = data.phone;
    users[userIndex].locationId = data.locationId ? parseInt(data.locationId) : null;
    
    return true;
}

/**
 * Create new user object
 * @param {Object} data - Form data
 * @param {string} hashedPassword - Hashed password
 * @returns {Object} New user object
 */
function createNewUser(data, hashedPassword) {
    return {
        id: Date.now(),
        username: data.username,
        password: hashedPassword,
        fullName: data.fullName,
        role: data.role,
        phone: data.phone,
        locationId: data.locationId ? parseInt(data.locationId) : null,
        hoursWorked: 0,
        bonusHours: 0,
        createdAt: new Date().toISOString()
    };
}

/**
 * Finalize user save operation
 * @param {string} username - Username for logging
 * @param {boolean} isEdit - Whether this was an edit
 */
function finalizeUserSave(username, isEdit) {
    saveData();
    loadUsersTable();
    closeModal('addUserModal');
    showAlert(isEdit ? 'User updated successfully' : 'User added successfully', 'success');
    addSystemLog((isEdit ? 'User updated: ' : 'User added: ') + username);
}

/** @function handleAddUser */
async function handleAddUser(e) {
    try {
        e.preventDefault();
        
        const data = getUserFormData();
        const isEdit = !!editingUserId;
        
        if (!validateUserData(data, !isEdit)) return;
        
        const hashedPassword = await hashUserPassword(data.password);
        
        if (isEdit) {
            if (updateExistingUser(editingUserId, data, hashedPassword)) {
                finalizeUserSave(data.username, true);
            }
            editingUserId = null;
        } else {
            const newUser = createNewUser(data, hashedPassword);
            users.push(newUser);
            finalizeUserSave(newUser.username, false);
        }
        
        document.getElementById('addUserForm').reset();
    } catch (error) {
        Logger.error('[handleAddUser] Error:', error.message || error);
    }
}
// Make patchable by server-bridge.js
window.handleAddUser = handleAddUser;

/** @function populateLocationDropdowns - Fills location selects from MultiLocation */
function populateLocationDropdowns() {
    try {
        if (typeof MultiLocation === 'undefined') return;
        const locations = MultiLocation.getActiveLocations();
        // Populate user location dropdown
        const userLocSelect = document.getElementById('newUserLocation');
        if (userLocSelect) {
            const currentVal = userLocSelect.value;
            userLocSelect.innerHTML = '<option value="">No Location</option>';
            locations.forEach(function(loc) {
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.textContent = loc.name + ' (' + loc.code + ')';
                if (String(loc.id) === currentVal) opt.selected = true;
                userLocSelect.appendChild(opt);
            });
        }
        // Populate schedule location dropdown
        const schedLocSelect = document.getElementById('scheduleLocation');
        if (schedLocSelect) {
            const currentSchedVal = schedLocSelect.value;
            schedLocSelect.innerHTML = '<option value="">All Locations</option>';
            locations.forEach(function(loc) {
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.textContent = loc.name + ' (' + loc.code + ')';
                if (String(loc.id) === currentSchedVal) opt.selected = true;
                schedLocSelect.appendChild(opt);
            });
        }
    } catch (e) {
        // MultiLocation not loaded yet, ignore
    }
}

/** @function showAddUserModal */
function showAddUserModal() {
    editingUserId = null;
    document.getElementById('addUserForm').reset();
    // Reset modal title and button for Add mode
    const modalTitle = document.querySelector('#addUserModal .modal-header h2, #addUserModal .modal-header h3');
    if(modalTitle) modalTitle.textContent = 'Add New User';
    const submitBtn = document.querySelector('#addUserModal button[type="submit"]');
    if(submitBtn) submitBtn.textContent = 'Add User';
    populateLocationDropdowns();
    showModal('addUserModal');
}

/** @function editUser */
function editUser(userId) {
    try {
        const user = users.find(u => u.id === userId);
        if(user) {
            editingUserId = userId;
            (document.getElementById('newUserUsername') || {value: ''}).value = user.username;
            // SECURITY: Never populate hashed password - leave blank; only update if new value entered
            (document.getElementById('newUserPassword') || {value: ''}).value = '';
            (document.getElementById('newUserFullName') || {value: ''}).value = user.fullName;
            (document.getElementById('newUserRole') || {value: ''}).value = user.role;
            (document.getElementById('newUserPhone') || {value: ''}).value = user.phone;
            // Populate and set location dropdown
            populateLocationDropdowns();
            const locSelect = document.getElementById('newUserLocation');
            if (locSelect && user.locationId) locSelect.value = String(user.locationId);
            // Update modal title and button for Edit mode
            const modalTitle = document.querySelector('#addUserModal .modal-header h2, #addUserModal .modal-header h3');
            if(modalTitle) modalTitle.textContent = 'Edit User';
            const submitBtn = document.querySelector('#addUserModal button[type="submit"]');
            if(submitBtn) submitBtn.textContent = 'Save Changes';
            // Show password hint
            const pwField = document.getElementById('newUserPassword');
            if(pwField) pwField.placeholder = 'Leave blank to keep current password';
            showModal('addUserModal');
        }
    } catch (error) {
        Logger.error('[editUser] Error:', error.message || error);
    }
}

/** @function deleteUser */
function deleteUser(userId) {
    const userToDelete = users.find(u => u.id === userId);
    if (!userToDelete) return;

    // Count active schedule assignments for this user
    let assignmentCount = 0;
    (schedules || []).forEach(s => {
        (s.crews || []).forEach(c => {
            if (String(c.paramedicId) === String(userId) || String(c.emtId) === String(userId)) {
                assignmentCount++;
            }
        });
    });

    const warningMsg = assignmentCount > 0
        ? `This user has ${assignmentCount} shift assignment(s) in existing schedules.\nThose shifts will show "Unassigned".\n\nAre you sure you want to delete "${userToDelete.fullName || userToDelete.username}"?`
        : `Are you sure you want to delete "${userToDelete.fullName || userToDelete.username}"?`;

    if(confirm(warningMsg)) {
        const userIndex = users.findIndex(u => u.id === userId);
        if(userIndex > -1) {
            const username = users[userIndex].username;
            users.splice(userIndex, 1);
            saveData();
            loadUsersTable();
            showAlert('User deleted successfully', 'success');
            addSystemLog('User deleted: ' + username);
        }
    }
}

// Global feature states
let featureStates = {
    keyboardShortcuts: false,
    undoRedo: false,
    autoSave: false,
    rigAssignment: true,
    overtimeAlerts: false,
    certificationAlerts: false,
    smsNotifications: false,
    emailNotifications: false,
    contextMenu: true,
    multiSelect: true,
    globalSearch: true,
    quickActions: true,
    tooltips: true,
    dataValidation: true,
    bulkOperations: true
};

/** @function loadFeatureStates */
function loadFeatureStates() {
    try {
        const saved = localStorage.getItem('lifestarFeatureStates');
        if(saved) {
            featureStates = safeJSONParse(saved, featureStates);
        }
    } catch (error) {
        Logger.error('[loadFeatureStates] Error:', error.message || error);
    }
}

/** @function saveFeatureStates */
function saveFeatureStates() {
    localStorage.setItem('lifestarFeatureStates', JSON.stringify(featureStates));
}

/**
 * Feature definitions for the feature toggles
 * Organized by category for easy management
 */
const FEATURE_DEFINITIONS = [
    // Mechanics Improvements
    { id: 'keyboardShortcuts', name: 'Keyboard Shortcuts', description: 'Enable Ctrl+Z, Ctrl+Y, Ctrl+S, etc.', category: 'Mechanics' },
    { id: 'undoRedo', name: 'Undo/Redo', description: 'Allow undoing and redoing actions', category: 'Mechanics' },
    { id: 'autoSave', name: 'Auto Save', description: 'Automatically save changes every 30 seconds', category: 'Mechanics' },
    { id: 'contextMenu', name: 'Right-Click Context Menu', description: 'Enable context menu on items', category: 'Mechanics' },
    { id: 'multiSelect', name: 'Multi-Select Mode', description: 'Select multiple items at once', category: 'Mechanics' },
    { id: 'globalSearch', name: 'Global Search', description: 'Search across all data with Ctrl+F', category: 'Mechanics' },
    { id: 'quickActions', name: 'Quick Actions Panel', description: 'Quick access to common actions', category: 'Mechanics' },
    { id: 'tooltips', name: 'Tooltips', description: 'Show helpful tooltips', category: 'Mechanics' },
    { id: 'dataValidation', name: 'Data Validation', description: 'Validate data before saving', category: 'Mechanics' },
    { id: 'bulkOperations', name: 'Bulk Operations', description: 'Perform operations on multiple items', category: 'Mechanics' },
    // Core Features
    { id: 'rigAssignment', name: 'Rig Assignment', description: 'Assign rigs to crews', category: 'Core' },
    { id: 'overtimeAlerts', name: 'Overtime Alerts', description: 'Alert when hours exceed 160/month', category: 'Alerts' },
    { id: 'certificationAlerts', name: 'Certification Alerts', description: 'Alert on expiring certifications', category: 'Alerts' },
    // Notifications
    { id: 'smsNotifications', name: 'SMS Notifications', description: 'Send SMS notifications (requires API key)', category: 'Notifications' },
    { id: 'emailNotifications', name: 'Email Notifications', description: 'Send email notifications (requires API key)', category: 'Notifications' },
    { id: 'inAppNotifications', name: 'In-App Notifications', description: 'Show notifications within app', category: 'Notifications' },
    // Advanced Features
    { id: 'aiAssistant', name: 'AI Assistant', description: 'Enable AI assistant functionality', category: 'Advanced' },
    { id: 'advancedAI', name: 'Advanced AI (Groq)', description: 'Use Groq API for advanced AI', category: 'Advanced' },
    { id: 'analytics', name: 'Analytics Dashboard', description: 'Show analytics and statistics', category: 'Advanced' },
    { id: 'performanceMetrics', name: 'Performance Metrics', description: 'Track staff performance', category: 'Advanced' },
    // Workflow Features
    { id: 'shiftTrading', name: 'Shift Trading', description: 'Allow staff to trade shifts', category: 'Workflow' },
    { id: 'timeOffRequests', name: 'Time-Off Requests', description: 'Allow time-off request submissions', category: 'Workflow' },
    { id: 'incidentReporting', name: 'Incident Reporting', description: 'Enable incident report submissions', category: 'Workflow' },
    { id: 'onCallRotation', name: 'On-Call Rotation', description: 'Manage on-call schedules', category: 'Workflow' },
    // Training & Development
    { id: 'trainingModule', name: 'Training Module', description: 'Track certifications and training', category: 'Training' },
    { id: 'bonusHours', name: 'Bonus Hours', description: 'Award bonus hours to staff', category: 'Training' },
    { id: 'supervisorNotes', name: 'Supervisor Notes', description: 'Add notes to staff records', category: 'Training' }
];

/**
 * Group features by category
 * @param {Array} features - Array of feature objects
 * @returns {Object} Features grouped by category
 */
function groupFeaturesByCategory(features) {
    return features.reduce((categories, feature) => {
        if (!categories[feature.category]) {
            categories[feature.category] = [];
        }
        categories[feature.category].push(feature);
        return categories;
    }, {});
}

/**
 * Create a feature toggle card element
 * @param {Object} feature - Feature object
 * @returns {HTMLElement} Card element
 */
function createFeatureCard(feature) {
    const card = document.createElement('div');
    card.className = `card feature-toggle-card ${featureStates[feature.id] ? 'active' : ''}`;
    card.innerHTML = `
        <div class="card-body">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3>${feature.name}</h3>
                <label class="switch">
                    <input type="checkbox" id="feature-${feature.id}"
                           ${featureStates[feature.id] ? 'checked' : ''}
                           onchange="toggleFeature('${feature.id}')">
                    <span class="slider"></span>
                </label>
            </div>
            <p class="text-muted">${feature.description}</p>
        </div>
    `;
    return card;
}

/**
 * Render features for a category
 * @param {HTMLElement} container - Container element
 * @param {string} category - Category name
 * @param {Array} features - Array of features in this category
 */
function renderFeatureCategory(container, category, features) {
    const categoryHeader = document.createElement('h3');
    categoryHeader.textContent = category;
    categoryHeader.style.marginTop = '20px';
    categoryHeader.style.color = 'var(--lifestar-red)';
    container.appendChild(categoryHeader);

    const categoryGrid = document.createElement('div');
    categoryGrid.className = 'grid-3';

    features.forEach(feature => {
        categoryGrid.appendChild(createFeatureCard(feature));
    });

    container.appendChild(categoryGrid);
}

/** @function loadFeatureToggles */
function loadFeatureToggles() {
    try {
        const container = document.getElementById('featureToggles');
        container.textContent = '';

        const categories = groupFeaturesByCategory(FEATURE_DEFINITIONS);

        Object.keys(categories).forEach(category => {
            renderFeatureCategory(container, category, categories[category]);
        });
    } catch (error) {
        Logger.error('[loadFeatureToggles] Error:', error.message || error);
    }
}

/** @function toggleFeature */
function toggleFeature(featureId) {
    try {
        const checkbox = document.getElementById('feature-' + featureId);
        const isEnabled = checkbox.checked;

        featureStates[featureId] = isEnabled;
        saveFeatureStates();

        // Enable/disable feature functionality
        switch(featureId) {
            case 'keyboardShortcuts':
                if(isEnabled) enableKeyboardShortcuts();
                else disableKeyboardShortcuts();
                break;
            case 'undoRedo':
                // Toggle already handled by checking featureStates in undo/redo functions
                break;
            case 'autoSave':
                if(isEnabled) enableAutoSave();
                else disableAutoSave();
                break;
            case 'overtimeAlerts':
                if(isEnabled) checkOvertimeAlerts();
                break;
            case 'certificationAlerts':
                if(isEnabled) checkCertificationAlerts();
                break;
            case 'contextMenu':
                // Context menu always available when enabled
                break;
            case 'multiSelect':
                if(!isEnabled) {
                    multiSelectMode = false;
                    deselectAll();
                }
                break;
            case 'globalSearch':
                // Global search available when enabled
                break;
            case 'quickActions':
                const panel = document.getElementById('quickActionsPanel');
                if(panel) {
                    if(isEnabled) panel.classList.remove('hidden');
                    else panel.classList.add('hidden');
                }
                break;
        }

        // Update card styling
        const card = checkbox.closest('.feature-toggle-card');
        if(isEnabled) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }

        addSystemLog(`Feature ${featureId} ${isEnabled ? 'enabled' : 'disabled'}`);
        showAlert(`Feature ${isEnabled ? 'enabled' : 'disabled'}`, 'info');
    } catch (error) {
        Logger.error('[toggleFeature] Error:', error.message || error);
    }
}

// ========================================
// BOSS DASHBOARD FUNCTIONS
// ========================================

/** @function loadBossDashboard */
function loadBossDashboard() {
    showBossSection('drafts');
    loadDraftSchedules();
    updateSidebarBadges();
}

/**
 * Section loader mappings for Boss dashboard
 * Maps section names to their loader functions
 */
const BOSS_SECTION_LOADERS = {
    drafts: () => typeof loadDraftSchedules === 'function' && loadDraftSchedules(),
    published: () => typeof loadPublishedSchedules === 'function' && loadPublishedSchedules(),
    archived: () => typeof loadArchivedSchedules === 'function' && loadArchivedSchedules(),
    calendar: () => typeof loadCalendar === 'function' && loadCalendar(),
    staff: () => typeof loadStaffDirectory === 'function' && loadStaffDirectory(),
    timeoff: () => typeof loadTimeoffRequests === 'function' && loadTimeoffRequests(),
    crews: () => typeof loadCrewTemplates === 'function' && loadCrewTemplates(),
    trades: () => typeof loadShiftTrades === 'function' && loadShiftTrades(),
    swap: () => typeof loadSwapListings === 'function' && loadSwapListings(),
    availability: () => typeof loadAvailability === 'function' && loadAvailability(),
    training: () => typeof loadTrainingRecords === 'function' && loadTrainingRecords(),
    bonus: () => typeof loadBonusHours === 'function' && loadBonusHours(),
    callins: () => typeof loadEmergencyCallins === 'function' && loadEmergencyCallins(),
    incidents: () => typeof IncidentReports !== 'undefined' && typeof IncidentReports.loadIncidents === 'function' && IncidentReports.loadIncidents(),
    absences: () => typeof loadAbsences === 'function' && loadAbsences(),
    oncall: () => typeof loadOncallRotations === 'function' && loadOncallRotations(),
    analytics: () => typeof generateAnalyticsReport === 'function' && generateAnalyticsReport(),
    history: () => typeof loadShiftHistory === 'function' && loadShiftHistory(),
    reports: () => typeof ExportReports !== 'undefined' && ExportReports.loadReportsSection?.(),
    dataVisualization: () => typeof DataVisualization !== 'undefined' && DataVisualization.loadDataVisualizationSection?.(),
    payroll: () => typeof loadPayrollDashboard === 'function' && loadPayrollDashboard(),
    notes: () => typeof loadSupervisorNotes === 'function' && loadSupervisorNotes(),
    templates: () => typeof loadScheduleTemplates === 'function' && loadScheduleTemplates()
};

/**
 * Hide all boss sections and remove active class from nav items
 */
function hideAllBossSections() {
    document.querySelectorAll('.boss-section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('#bossDashboard .nav-item').forEach(item => {
        item.classList.remove('active');
    });
}

/**
 * Show a specific boss section element
 * @param {string} section - Section name
 */
function showBossSectionElement(section) {
    const sectionElement = document.getElementById('boss' + section.charAt(0).toUpperCase() + section.slice(1));
    if (sectionElement) {
        sectionElement.classList.remove('hidden');
    }
}

/**
 * Set active nav item for a section
 * @param {string} section - Section name
 */
function setActiveBossNavItem(section) {
    try {
        const evt = window.event;
        if (evt?.currentTarget?.classList) {
            evt.currentTarget.classList.add('active');
            return;
        }
    } catch (e) { /* fallthrough */ }
    
    // Fallback: find nav item by section name
    document.querySelectorAll('#bossDashboard .nav-item').forEach(item => {
        const onclick = item.getAttribute('onclick');
        if (onclick && onclick.includes("'" + section + "'")) {
            item.classList.add('active');
        }
    });
}

/**
 * Load data for a boss section
 * @param {string} section - Section name
 */
function loadBossSectionData(section) {
    if (typeof schedules === 'undefined' || schedules === null) schedules = [];
    
    const loader = BOSS_SECTION_LOADERS[section];
    if (loader) {
        try {
            loader();
        } catch (sectionError) {
            Logger.error('[showBossSection] Error loading section data:', sectionError.message);
        }
    }
}

/** @function showBossSection */
function showBossSection(section) {
    try {
        if (!document.getElementById('bossDashboard')) return;
        if (!schedules) schedules = [];

        hideAllBossSections();
        showBossSectionElement(section);
        setActiveBossNavItem(section);
        loadBossSectionData(section);
        
    } catch (error) {
        Logger.error('[showBossSection] Error:', error.message || error);
    }
}

/** @function loadDraftSchedules */
function loadDraftSchedules() {
    try {
        const draftList = document.getElementById('draftSchedulesList');
        if (!draftList) return;
        draftList.textContent = '';

        const draftSchedules = (schedules || []).filter(s => s.status === 'draft');

        // Show/hide empty message
        document.getElementById('noDraftsMessage').style.display = draftSchedules.length > 0 ? 'none' : 'block';

        // Render draft schedules
        draftSchedules.forEach(schedule => {
            draftList.appendChild(createScheduleCard(schedule));
        });
    } catch (error) {
        Logger.error('[loadDraftSchedules] Error:', error.message || error);
    }
}

/** @function loadPublishedSchedules */
function loadPublishedSchedules() {
    try {
        const publishedList = document.getElementById('publishedSchedulesList');
        if (!publishedList) return;
        publishedList.textContent = '';

        const publishedSchedules = (schedules || []).filter(s => s.status === 'published');

        // Show/hide empty message
        document.getElementById('noPublishedMessage').style.display = publishedSchedules.length > 0 ? 'none' : 'block';

        // Render published schedules
        publishedSchedules.forEach(schedule => {
            publishedList.appendChild(createScheduleCard(schedule));
        });
    } catch (error) {
        Logger.error('[loadPublishedSchedules] Error:', error.message || error);
    }
}

/** @function refreshPublishedSchedules */
function refreshPublishedSchedules() {
    loadPublishedSchedules();
    showAlert('Published schedules refreshed', 'success');
}

// ========================================
// Archived Schedules Functions
// ========================================

/** @function loadArchivedSchedules */
function loadArchivedSchedules() {
    try {
        const archivedList = document.getElementById('archivedSchedulesList');
        if (!archivedList) return;
        archivedList.textContent = '';

        // Get archived schedules using TimeValidationArchive
        const archivedSchedules = TimeValidationArchive.getArchivedSchedules(schedules || []);

        // Show/hide empty message
        document.getElementById('noArchivedMessage').style.display = archivedSchedules.length > 0 ? 'none' : 'block';

        // Render archived schedules
        archivedSchedules.forEach(schedule => {
            archivedList.appendChild(createScheduleCard(schedule));
        });
    } catch (error) {
        Logger.error('[loadArchivedSchedules] Error:', error.message || error);
    }
}

/** @function autoArchivePastSchedules */
function autoArchivePastSchedules() {
    // Archive past schedules using TimeValidationArchive
    const result = TimeValidationArchive.archivePastSchedules(schedules);

    if(result.archived.length > 0) {
        saveData();
        updateSidebarBadges();

        // Log the archiving
        result.archived.forEach(schedule => {
            addSystemLog(`Schedule automatically archived: ${schedule.name} (${schedule.month} ${schedule.year})`);
        });

        Logger.info(`Auto-archived ${result.archived.length} schedules`);
    }
}

/** @function restoreArchivedSchedule */
function restoreArchivedSchedule() {
    try {
        const selectedCards = document.querySelectorAll('#archivedSchedulesList .schedule-item.selected');

        if(selectedCards.length === 0) {
            showAlert('Please select a schedule to restore', 'error');
            return;
        }

        if(selectedCards.length > 1) {
            showAlert('Please select only one schedule to restore', 'error');
            return;
        }

        const scheduleId = parseInt(selectedCards[0].dataset.scheduleId);
        const schedule = schedules.find(s => s.id === scheduleId);

        if(schedule) {
            // Validate that it can be restored (should be in future or current month)
            const validation = TimeValidationArchive.validateScheduleCreation(schedule.month, schedule.year);

            if(!validation.valid) {
                showAlert('Cannot restore past schedules. Only current and future months can be restored.', 'error');
                return;
            }

            schedule.status = 'draft';
            delete schedule.archivedAt;
            delete schedule.archivedFromStatus;

            saveData();
            loadArchivedSchedules();
            updateSidebarBadges();

            showAlert('Schedule restored successfully', 'success');
            addSystemLog(`Schedule restored: ${schedule.name}`);
        }
    } catch (error) {
        Logger.error('[restoreArchivedSchedule] Error:', error.message || error);
    }
}

// ========================================
// Initialize Dropdown Compatibility
// ========================================

/** @function initializeDropdowns */
function initializeDropdowns() {
    try {
        // Initialize all dropdowns with cross-platform compatibility
        DropdownCompatibility.initAllDropdowns();

        // Initialize schedule creation dropdowns specifically
        const monthDropdown = document.getElementById('scheduleMonth');
        const yearDropdown = document.getElementById('scheduleYear');

        if(monthDropdown) {
            // Load available months (current and future only)
            const availableMonths = TimeValidationArchive.getAvailableMonths(12);
            monthDropdown.innerHTML = '<option value="">Select Month</option>';

            availableMonths.forEach(month => {
                const option = document.createElement('option');
                option.value = month.month;
                option.textContent = month.displayName;
                monthDropdown.appendChild(option);
            });

            DropdownCompatibility.setupDropdown(monthDropdown);
        }

        if(yearDropdown) {
            // Load current and future years
            const currentYear = new Date().getFullYear();
            yearDropdown.innerHTML = '<option value="">Select Year</option>';

            for(let i = 0; i <= 3; i++) {
                const year = currentYear + i;
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearDropdown.appendChild(option);
            }

            DropdownCompatibility.setupDropdown(yearDropdown);
        }
    } catch (error) {
        Logger.error('[initializeDropdowns] Error:', error.message || error);
    }
}

/** @function updateSidebarBadges */
function updateSidebarBadges() {
    try {
        const draftCount     = (schedules || []).filter(s => s.status === 'draft').length;
        const publishedCount = (schedules || []).filter(s => s.status === 'published').length;
        const archivedCount  = (schedules || []).filter(s => s.status === 'archived').length;

        // Pending requests
        let pendingTO = 0, pendingTrades = 0;
        try {
            const tr = localStorage.getItem('lifestarTimeoffRequests');
            if(tr) pendingTO = (JSON.parse(tr) || []).filter(r => r.status === 'pending').length;
        } catch(_) {}
        try {
            const td = localStorage.getItem('lifestarShiftTrades');
            if(td) pendingTrades = (JSON.parse(td) || []).filter(r => r.status === 'pending').length;
        } catch(_) {}

        // Helper: safe set text + show/hide badge
        const setBadge = (id, count) => {
            const el = document.getElementById(id);
            if(!el) return;
            el.textContent = count;
            el.style.display = count > 0 ? 'inline-flex' : 'none';
        };

        setBadge('draftsBadge',    draftCount);
        setBadge('publishedBadge', publishedCount);
        setBadge('archivedBadge',  archivedCount);
        setBadge('timeoffBadge',   pendingTO);
        setBadge('tradesBadge',    pendingTrades);

        // Update page title to show pending items
        const pending = pendingTO + pendingTrades;
        document.title = pending > 0
            ? '(' + pending + ') Lifestar Scheduling'
            : 'Lifestar Scheduling';
    } catch (error) {
        Logger.error('[updateSidebarBadges] Error:', error.message || error);
    }
}

/** @function loadSchedules */
function loadSchedules() {
    // This function is kept for backward compatibility
    loadDraftSchedules();
    updateSidebarBadges();
}

/** @function createScheduleCard */
function createScheduleCard(schedule) {
    try {
        const card = document.createElement('div');
        card.className = 'schedule-item ' + schedule.status;
        card.dataset.scheduleId = schedule.id;

        // Calculate coverage progress for draft schedules
        const crewCount = (schedule.crews || []).length;
        const totalHours = parseInt(schedule.totalHours) || 0;
        const statusLabels = { draft: '✏️ Draft', published: '✅ Published', archived: '📦 Archived' };
        const statusLabel = statusLabels[schedule.status] || schedule.status;

        // Build unique staff set for this schedule
        const staffIds = new Set();
        (schedule.crews || []).forEach(c => {
            if(c.paramedicId) staffIds.add(c.paramedicId);
            if(c.emtId) staffIds.add(c.emtId);
        });

        // Coverage progress bar for drafts (target: 30 crews = full month approx)
        let progressHtml = '';
        if(schedule.status === 'draft') {
            const target = 30;
            const pct = Math.min(100, Math.round((crewCount / target) * 100));
            const barColor = pct < 30 ? '#e74c3c' : pct < 70 ? '#f39c12' : '#27ae60';
            progressHtml = '<div style="margin-top:8px;">' +
                '<div style="display:flex;justify-content:space-between;font-size:.75rem;color:#888;margin-bottom:3px;">' +
                '<span>Coverage Progress</span><span>' + pct + '%</span></div>' +
                '<div style="background:#f0f0f0;border-radius:4px;height:6px;overflow:hidden;">' +
                '<div style="width:' + pct + '%;background:' + barColor + ';height:100%;border-radius:4px;transition:width .3s"></div>' +
                '</div></div>';
        }

        const publishedInfo = schedule.publishedAt
            ? '<div class="schedule-info-item"><span class="schedule-info-item-icon">🚀</span>Published ' + new Date(schedule.publishedAt).toLocaleDateString() + '</div>'
            : '';

        card.innerHTML =
            '<div class="schedule-header">' +
                '<div class="schedule-title">' + sanitizeHTML(schedule.name) + '</div>' +
                '<div class="schedule-status ' + sanitizeHTML(schedule.status) + '">' + statusLabel + '</div>' +
            '</div>' +
            '<div class="schedule-info">' +
                '<div class="schedule-info-item"><span class="schedule-info-item-icon">📅</span>' + sanitizeHTML(schedule.month) + ' ' + sanitizeHTML(String(schedule.year)) + '</div>' +
                '<div class="schedule-info-item"><span class="schedule-info-item-icon">👥</span>' + crewCount + ' crew' + (crewCount !== 1 ? 's' : '') + ' &nbsp;·&nbsp; ' + staffIds.size + ' staff</div>' +
                '<div class="schedule-info-item"><span class="schedule-info-item-icon">🕐</span>' + totalHours + ' total hours</div>' +
                publishedInfo +
            '</div>' +
            progressHtml +
            '<div class="schedule-actions" style="margin-top:10px;">' +
                '<button class="btn btn-sm btn-primary" onclick="viewSchedule(' + parseInt(schedule.id) + ')">👁 View</button>' +
                (schedule.status === 'draft' ? '<button class="btn btn-sm btn-warning" onclick="editSchedule(' + parseInt(schedule.id) + ')">✏️ Edit</button>' : '') +
                (schedule.status === 'draft' ? '<button class="btn btn-sm btn-success" onclick="publishSchedule(' + parseInt(schedule.id) + ')">🚀 Publish</button>' : '') +
                (schedule.status === 'published' ? '<button class="btn btn-sm btn-secondary" onclick="archiveSchedule(' + parseInt(schedule.id) + ')">📦 Archive</button>' : '') +
                '<button class="btn btn-sm btn-info" onclick="duplicateSchedule(' + parseInt(schedule.id) + ')" title="Copy to another month">📋 Copy</button>' +
                '<button class="btn btn-sm btn-danger" onclick="deleteSchedule(' + parseInt(schedule.id) + ')">🗑 Delete</button>' +
            '</div>';
        return card;
    } catch (error) {
        Logger.error('[createScheduleCard] Error:', error.message || error);
    }
}

/** @function archiveSchedule */
function archiveSchedule(scheduleId) {
    if(confirm('Archive this published schedule? It will no longer be visible to staff.')) {
        const schedule = schedules.find(s => String(s.id) === String(scheduleId));
        if(schedule) {
            schedule.status = 'archived';
            schedule.archivedAt = new Date().toISOString();
            saveData();
            loadDraftSchedules();
            loadPublishedSchedules();
            if(typeof loadArchivedSchedules === 'function') loadArchivedSchedules();
            updateSidebarBadges();
            showAlert('Schedule archived successfully.', 'success');
            addSystemLog('Schedule archived: ' + schedule.name);
        }
    }
}

/** @function showCreateScheduleModal */
function showCreateScheduleModal() {
    // Re-initialize dropdowns each time modal opens to ensure dynamic months
    initializeDropdowns();
    populateLocationDropdowns();
    showModal('createScheduleModal');
}

/** @function handleCreateSchedule */
function handleCreateSchedule(e) {
    try {
        e.preventDefault();

        // Get values using DropdownCompatibility for cross-platform support
        const name = (document.getElementById('scheduleName') || {value: ''}).value;
        const month = DropdownCompatibility.getValue('scheduleMonth');
        const year = DropdownCompatibility.getValue('scheduleYear');
        const description = (document.getElementById('scheduleDescription') || {value: ''}).value;
        const locationVal = (document.getElementById('scheduleLocation') || {value: ''}).value;

        // Validate using TimeValidationArchive
        const validation = TimeValidationArchive.validateScheduleCreation(month, year);

        if(!validation.valid) {
            showAlert(validation.message, 'error');
            return;
        }

        const newSchedule = {
            id: Date.now(),
            name: name,
            month: month,
            year: year,
            description: description,
            locationId: locationVal ? parseInt(locationVal) : null,
            status: 'draft',
            crews: [],
            totalHours: 0,
            createdAt: new Date().toISOString(),
            createdBy: currentUser.id
        };

        schedules.push(newSchedule);
        saveData();
        loadDraftSchedules();
        updateSidebarBadges();
        closeModal('createScheduleModal');
        showAlert('Draft schedule created successfully', 'success');
        addSystemLog('Draft schedule created: ' + newSchedule.name);

        // Reset form
        document.getElementById('createScheduleForm').reset();
    } catch (error) {
        Logger.error('[handleCreateSchedule] Error:', error.message || error);
    }
}
// Make patchable by server-bridge.js
window.handleCreateSchedule = handleCreateSchedule;

/** @function publishSchedule */
function publishSchedule(scheduleId) {
    if(confirm('Are you sure you want to publish this schedule?\n\nPublished schedules become visible to staff and are locked from structural changes.')) {
        const schedule = schedules.find(s => s.id === scheduleId);
        if(schedule) {
            schedule.status = 'published';
            schedule.publishedAt = new Date().toISOString();
            saveData();
            loadDraftSchedules();
            loadPublishedSchedules();
            updateSidebarBadges();
            showAlert('Schedule published successfully! Staff can now view their shifts.', 'success');
            addSystemLog('Schedule published: ' + schedule.name);
        }
    }
}

/** @function viewSchedule */
function viewSchedule(scheduleId) {
    const schedule = schedules.find(s => String(s.id) === String(scheduleId));
    if(schedule) {
        if(schedule.status === 'published') {
            // Open in read-only view mode for published schedules
            openScheduleEditor(scheduleId, true);
        } else {
            openScheduleEditor(scheduleId, false);
        }
    }
}

/** @function editSchedule */
function editSchedule(scheduleId) {
    const schedule = schedules.find(s => String(s.id) === String(scheduleId));
    if(schedule) {
        if(schedule.status === 'published') {
            showAlert('Published schedules are locked. Archive and restore as draft to make changes.', 'warning');
            return;
        }
        openScheduleEditor(scheduleId, false);
    }
}

/** @function deleteSchedule */
function deleteSchedule(scheduleId) {
    if(confirm('Are you sure you want to delete this schedule?')) {
        const scheduleIndex = schedules.findIndex(s => String(s.id) === String(scheduleId));
        if(scheduleIndex > -1) {
            const scheduleName = schedules[scheduleIndex].name;
            schedules.splice(scheduleIndex, 1);
            saveData();
            loadDraftSchedules();
            loadPublishedSchedules();
            updateSidebarBadges();
            showAlert('Schedule deleted successfully', 'success');
            addSystemLog('Schedule deleted: ' + scheduleName);
        }
    }
}

// ========================================
// MOBILE MENU FUNCTIONS
// ========================================

/** @function toggleMobileMenu */
function toggleMobileMenu() {
    try {
        // Find the active dashboard and its sidebar
        const activeDashboard = document.querySelector('.dashboard[style*="display: block"], .dashboard:not([style*="display: none"])');
        if(!activeDashboard) {
            Logger.error('No active dashboard found');
            return;
        }

        // Find sidebar and overlay within the active dashboard
        const sidebar = activeDashboard.querySelector('.sidebar');
        const overlay = activeDashboard.querySelector('.mobile-overlay');

        if(!sidebar || !overlay) {
            Logger.error('Sidebar or overlay not found in active dashboard');
            return;
        }

        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');

        // Prevent body scroll when menu is open
        if(sidebar.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    } catch (error) {
        Logger.error('[toggleMobileMenu] Error:', error.message || error);
    }
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const activeDashboard = document.querySelector('.dashboard[style*="display: block"], .dashboard:not([style*="display: none"])');
    if(!activeDashboard) return;

    const sidebar = activeDashboard.querySelector('.sidebar');
    const overlay = activeDashboard.querySelector('.mobile-overlay');
    const menuToggle = activeDashboard.querySelector('.mobile-menu-toggle');

    if(sidebar && sidebar.classList.contains('active')) {
        if(!sidebar.contains(event.target) &&
            !menuToggle.contains(event.target) &&
            !overlay.contains(event.target)) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Alias for compatibility
/** @function openModal */
function openModal(modalId) { showModal(modalId); }

/** @function showModal */
function showModal(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if(modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.classList.add('active');
            // Populate any staff dropdowns in this modal
            populateModalStaffDropdowns(modal);
            // Focus first focusable element
            const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if(focusable) focusable.focus();
        } else {
            Logger.warn('Modal not found: ' + modalId);
        }
    } catch (error) {
        Logger.error('[showModal] Error:', error.message || error);
    }
}

/** @function populateModalStaffDropdowns - Auto-populate staff selects in any modal */
function populateModalStaffDropdowns(modal) {
    try {
        if(!modal) return;
        const selects = modal.querySelectorAll('select');
        const paramedics = users.filter(u => u.role === 'paramedic');
        const emts = users.filter(u => u.role === 'emt');
        const allStaff = [...paramedics, ...emts];

        selects.forEach(select => {
            const id = (select.id || '').toLowerCase();
            const label = select.previousElementSibling ? (select.previousElementSibling.textContent || '').toLowerCase() : '';

            // Detect if this is a staff selection dropdown
            let staffToAdd = null;
            if(id.includes('paramedic') || label.includes('paramedic')) {
                staffToAdd = paramedics;
            } else if(id.includes('emt') || label.includes('emt')) {
                staffToAdd = emts;
            } else if(id.includes('employee') || id.includes('staff') || id.includes('primary') || id.includes('backup') ||
                       label.includes('employee') || label.includes('staff') || label.includes('assign')) {
                staffToAdd = allStaff;
            }

            if(staffToAdd && staffToAdd.length > 0) {
                // Only populate if the select has 0 or 1 options (just placeholder)
                if(select.options.length <= 1) {
                    const currentVal = select.value;
                    const placeholder = select.options[0] ? select.options[0].textContent : 'Select';
                    select.innerHTML = '<option value="">' + placeholder + '</option>';
                    staffToAdd.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = (s.fullName || s.username) + ' (' + s.role.toUpperCase() + ')';
                        select.appendChild(opt);
                    });
                    if(currentVal) select.value = currentVal;
                }
            }
        });
    } catch (e) {
        Logger.error('[populateModalStaffDropdowns]', e);
    }
}

/** @function closeModal */
function closeModal(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if(modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
    } catch (error) {
        Logger.error('[closeModal] Error:', error.message || error);
    }
}

/** @function showAlert */
function showAlert(message, type, alertId) {
    try {
        type = type || 'info';

        if(alertId) {
            // Inline alert mode (for login alerts etc.)
            const alertElement = document.getElementById(alertId);
            if(alertElement) {
                alertElement.className = 'alert alert-' + type + ' active';
                alertElement.textContent = message;
                setTimeout(function() {
                    alertElement.classList.remove('active');
                }, 5000);
            }
            return;
        }

        // Toast notification mode
        const icons = { success: '✅', error: '❌', danger: '❌', warning: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;padding:15px 25px;border-radius:8px;color:#fff;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:400px;animation:slideIn 0.3s ease;';

        // Set background color based on type
        const bgColors = { success: '#28a745', error: '#dc3545', danger: '#dc3545', warning: '#ffc107', info: '#17a2b8' };
        toast.style.backgroundColor = bgColors[type] || bgColors.info;
        if(type === 'warning') toast.style.color = '#333';

        toast.textContent = (icons[type] || 'ℹ️') + ' ' + message;

        // Create container if needed
        let container = document.getElementById('toastContainer');
        if(!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:10px;';
            document.body.appendChild(container);
        }

        container.appendChild(toast);

        // Auto-dismiss
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(function() {
                if(toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 4000);
    } catch (error) {
        Logger.error('[showAlert] Error:', error.message || error);
    }
}

/** @function addSystemLog */
function addSystemLog(message) {
    const log = {
        id: Date.now(),
        message: message,
        timestamp: new Date().toISOString(),
        user: currentUser ? currentUser.username : 'System'
    };
    systemLogs.unshift(log);

    // Keep only last 100 logs
    if(systemLogs.length > 100) {
        systemLogs = systemLogs.slice(0, 100);
    }

    saveData();
    displaySystemLogs();
}

/** @function displaySystemLogs */
function displaySystemLogs() {
    try {
        const logsContainer = document.getElementById('systemLogs');
        if(logsContainer) {
            logsContainer.textContent = '';
            systemLogs.forEach(log => {
                const logEntry = document.createElement('div');
                logEntry.style.padding = '10px';
                logEntry.style.borderBottom = '1px solid var(--border-color)';
                logEntry.innerHTML = `
                    <strong>${sanitizeHTML(new Date(log.timestamp).toLocaleString())}</strong> -
                    <span style="color: var(--lifestar-blue);">${sanitizeHTML(log.user)}</span>:
                    ${sanitizeHTML(log.message)}
                `;
                logsContainer.appendChild(logEntry);
            });
        }
    } catch (error) {
        Logger.error('[displaySystemLogs] Error:', error.message || error);
    }
}

/** @function clearLogs */
function clearLogs() {
    if(confirm('Are you sure you want to clear all system logs?')) {
        systemLogs = [];
        saveData();
        displaySystemLogs();
        showAlert('System logs cleared', 'success');
    }
}

/** @function saveApiKeys */
function saveApiKeys() {
    try {
        const groqKey = (document.getElementById('groqApiKey') || {value: ''}).value;
        const twilioKey = (document.getElementById('twilioApiKey') || {value: ''}).value;
        const sendGridKey = (document.getElementById('sendGridApiKey') || {value: ''}).value;

        localStorage.setItem('lifestarGroqApiKey', groqKey);
        localStorage.setItem('lifestarTwilioApiKey', twilioKey);
        localStorage.setItem('lifestarSendGridApiKey', sendGridKey);

        showAlert('API keys saved successfully', 'success');
        addSystemLog('API keys updated');
    } catch (error) {
        Logger.error('[saveApiKeys] Error:', error.message || error);
    }
}

/** @function exportAllData */
function exportAllData() {
    const data = {
        users: users,
        schedules: schedules,
        logs: systemLogs,
        exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'lifestar_export_' + new Date().toISOString().split('T')[0] + '.json';
    link.click();

    URL.revokeObjectURL(url);
    showAlert('Data exported successfully', 'success');
    addSystemLog('Data exported');
}

/** @function confirmResetSystem */
async function confirmResetSystem() {
    try {
        if(!confirm('⚠️ RESET SYSTEM: This will delete ALL schedules, staff, logs, and custom data.\n\nThe default super admin and boss accounts will be preserved.\n\nAre you absolutely sure?')) return;
        if(!confirm('FINAL CONFIRMATION: This action cannot be undone. Proceed with system reset?')) return;

        // If in server mode, use the API reset (preserves default accounts on server)
        if(typeof ServerBridge !== 'undefined' && ServerBridge.isServerMode) {
            showAlert('Resetting system…', 'warning');
            try {
                const r = await ServerBridge.fetch('POST', '/admin/reset');
                if(r.ok) {
                    // Clear all local storage too
                    const keysToKeep = ['lifestar_theme'];
                    const preserved = {};
                    keysToKeep.forEach(k => { const v = localStorage.getItem(k); if(v) preserved[k] = v; });
                    localStorage.clear();
                    keysToKeep.forEach(k => { if(preserved[k]) localStorage.setItem(k, preserved[k]); });
                    showAlert('System reset complete. Reloading…', 'success');
                    setTimeout(() => location.reload(), 1500);
                    return;
                }
            } catch(_) {}
        }

        // localStorage-only fallback: clear everything EXCEPT preserve the default accounts
        const keysToKeep = ['lifestar_theme'];
        const preserved = {};
        keysToKeep.forEach(k => { const v = localStorage.getItem(k); if(v) preserved[k] = v; });
        localStorage.clear();
        keysToKeep.forEach(k => { if(preserved[k]) localStorage.setItem(k, preserved[k]); });

        // Re-seed default users immediately so login works right away
        const defaultUsers = [
            { id: 1, username: 'super', password: 'super123', fullName: 'Super Administrator', role: 'super', phone: '555-0001', hoursWorked: 0, bonusHours: 0, active: true, createdAt: new Date().toISOString() },
            { id: 2, username: 'boss',  password: 'boss123',  fullName: 'Station Manager',     role: 'boss',  phone: '555-0002', hoursWorked: 0, bonusHours: 0, active: true, createdAt: new Date().toISOString() },
        ];
        localStorage.setItem('lifestarUsers', JSON.stringify(defaultUsers));

        showAlert('System reset complete. Default accounts (super/boss) preserved. Reloading…', 'success');
        setTimeout(() => location.reload(), 1800);
    } catch (error) {
        Logger.error('[confirmResetSystem] Error:', error.message || error);
        showAlert('Reset failed. Please try again.', 'danger');
    }
}

// ========================================
// AI ASSISTANT — Anthropic-powered
// ========================================
let _aiChatHistory = [];

/** @function sendAiMessage */
async function sendAiMessage() {
    try {
        const input = document.getElementById('aiInput');
        const message = input.value.trim();
        if(!message) return;

        const chatContainer = document.getElementById('aiChatContainer');

        // Render user bubble
        const userBubble = document.createElement('div');
        userBubble.style.cssText = 'padding:10px 14px;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border-radius:14px 14px 4px 14px;margin-bottom:10px;margin-left:30px;max-width:85%;align-self:flex-end;box-shadow:0 2px 6px rgba(0,0,0,.15);font-size:.9rem;';
        userBubble.textContent = message;
        chatContainer.appendChild(userBubble);
        input.value = '';
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Typing indicator
        const typingEl = document.createElement('div');
        typingEl.style.cssText = 'padding:10px 14px;background:#f0f0f0;border-radius:14px 14px 14px 4px;margin-bottom:10px;margin-right:30px;max-width:85%;color:#888;font-style:italic;font-size:.85rem;';
        typingEl.textContent = '⏳ Lifestar AI is thinking…';
        chatContainer.appendChild(typingEl);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Build context summary for AI
        const ctxDrafts    = schedules.filter(s => s.status === 'draft').length;
        const ctxPublished = schedules.filter(s => s.status === 'published').length;
        const ctxStaff     = users.filter(u => u.role === 'paramedic' || u.role === 'emt').length;
        const systemPrompt = 'You are Lifestar AI, the built-in scheduling assistant for Lifestar Ambulance Service. ' +
            'You have access to the following live system data: ' +
            ctxStaff + ' staff members (paramedics + EMTs), ' +
            ctxDrafts + ' draft schedule(s), ' +
            ctxPublished + ' published schedule(s), ' +
            users.length + ' total users. ' +
            'The current date is ' + new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '. ' +
            'You help managers and staff with scheduling questions, coverage analysis, policy guidance, and workflow tips. ' +
            'Keep answers concise, practical, and friendly. Use bullet points for lists.';

        _aiChatHistory.push({ role: 'user', content: message });
        // Keep last 10 turns to avoid token bloat
        if(_aiChatHistory.length > 20) _aiChatHistory = _aiChatHistory.slice(-20);

        let aiText = '';
        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 600,
                    system: systemPrompt,
                    messages: _aiChatHistory
                })
            });
            if(resp.ok) {
                const data = await resp.json();
                aiText = (data.content || []).map(b => b.text || '').join('');
                _aiChatHistory.push({ role: 'assistant', content: aiText });
            } else {
                aiText = generateBasicAIResponse(message);
            }
        } catch(_) {
            aiText = generateBasicAIResponse(message);
        }

        // Replace typing indicator with response
        typingEl.style.cssText = 'padding:10px 14px;background:#f0f4ff;border:1px solid #d0d9ff;border-radius:14px 14px 14px 4px;margin-bottom:10px;margin-right:30px;max-width:85%;font-size:.9rem;line-height:1.5;white-space:pre-wrap;';
        typingEl.textContent = aiText;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        Logger.error('[sendAiMessage] Error:', error.message || error);
    }
}

/** @function generateBasicAIResponse — fallback when API unavailable */
function generateBasicAIResponse(message) {
    const m = message.toLowerCase();
    const drafts    = schedules.filter(s => s.status === 'draft').length;
    const published = schedules.filter(s => s.status === 'published').length;
    const staff     = users.filter(u => u.role === 'paramedic' || u.role === 'emt').length;

    if(m.includes('schedule') || m.includes('shift'))
        return 'You have ' + schedules.length + ' schedule(s): ' + drafts + ' draft and ' + published + ' published. Use the Drafts tab to create or edit schedules.';
    if(m.includes('staff') || m.includes('user') || m.includes('crew'))
        return 'There are ' + users.length + ' user(s) in the system including ' + staff + ' field staff (paramedics + EMTs).';
    if(m.includes('coverage') || m.includes('gap'))
        return 'Check the draft schedules and use the Coverage Gap Scanner to identify days without assigned crews.';
    if(m.includes('publish'))
        return 'To publish a schedule: open Drafts, assign crews for all needed days, then click "🚀 Publish". Staff can then see their shifts in My Schedule.';
    if(m.includes('help') || m.includes('what can'))
        return 'I can help with:\n• Understanding coverage gaps\n• Publishing workflows\n• Staff shift questions\n• System navigation tips\n\nTry asking: "How many staff do I have?" or "What schedules are published?"';
    return 'I\'m here to help with scheduling. Try asking about coverage, staff, or how to use a feature. For the best AI experience, I\'m powered by Claude — no API key needed!';
}

// ========================================
// SAMPLE DATA LOADING
// ========================================

/** @function loadSampleData */
function loadSampleData() {
    const now = new Date();
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const thisYear  = String(now.getFullYear());
    const thisMonth = MONTHS[now.getMonth()];
    const lastMonthIdx  = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const lastMonth     = MONTHS[lastMonthIdx];
    const lastMonthYear = now.getMonth() === 0 ? String(now.getFullYear() - 1) : thisYear;

    // Check if data already exists — also re-seed if existing users lack passwords
    // (happens when server-bridge syncs users without password fields to localStorage)
    const needsReseed = users.length === 0 || users.every(u => !u.password);
    if(needsReseed) {
        // Create default users — active:true is required for session restore
        users = [
            { id: 1, username: 'super',      password: 'super123',     fullName: 'Super Administrator', role: 'super',              phone: '555-0001', hoursWorked: 0,  bonusHours: 0, active: true, createdAt: now.toISOString() },
            { id: 2, username: 'boss',       password: 'boss123',      fullName: 'Station Manager',     role: 'boss',               phone: '555-0002', hoursWorked: 0,  bonusHours: 0, active: true, createdAt: now.toISOString() },
            { id: 3, username: 'paramedic1', password: 'paramedic123', fullName: 'Sarah Medic',         role: USER_ROLES.PARAMEDIC, phone: '555-0003', hoursWorked: 96, bonusHours: 4, active: true, createdAt: now.toISOString() },
            { id: 4, username: 'paramedic2', password: 'paramedic123', fullName: 'Mike Medic',          role: USER_ROLES.PARAMEDIC, phone: '555-0004', hoursWorked: 84, bonusHours: 0, active: true, createdAt: now.toISOString() },
            { id: 5, username: 'emt1',       password: 'emt123',       fullName: 'Tom EMT',             role: USER_ROLES.EMT,       phone: '555-0005', hoursWorked: 72, bonusHours: 0, active: true, createdAt: now.toISOString() },
            { id: 6, username: 'emt2',       password: 'emt123',       fullName: 'Lisa EMT',            role: USER_ROLES.EMT,       phone: '555-0006', hoursWorked: 60, bonusHours: 2, active: true, createdAt: now.toISOString() }
        ];
        saveData();
    }

    // Create sample schedules if none exist — crews use IDs so loadMySchedule works correctly
    if(schedules.length === 0) {
        const pad = n => String(n).padStart(2,'0');
        const yr = parseInt(lastMonthYear);
        const mo = lastMonthIdx + 1;
        const d1 = yr + '-' + pad(mo) + '-01';
        const d2 = yr + '-' + pad(mo) + '-02';
        const d3 = yr + '-' + pad(mo) + '-03';

        // Draft schedule for current month
        schedules.push({
            id: Date.now(),
            name: thisMonth + ' ' + thisYear + ' — Draft',
            month: thisMonth,
            year: thisYear,
            description: 'Draft schedule for ' + thisMonth + ' ' + thisYear + ' — assignments in progress',
            status: 'draft',
            crews: [],
            totalHours: 0,
            createdAt: now.toISOString(),
            createdBy: 2
        });

        // Published schedule for last month — paramedicId/emtId enable My Schedule tab
        schedules.push({
            id: Date.now() + 1,
            name: lastMonth + ' ' + lastMonthYear + ' — Published',
            month: lastMonth,
            year: lastMonthYear,
            description: 'Final schedule for ' + lastMonth + ' ' + lastMonthYear + ' — all shifts assigned',
            status: 'published',
            crews: [
                { id: 101, rig: '3F16', paramedicId: 3, paramedic: 'Sarah Medic', emtId: 5, emt: 'Tom EMT',  shiftType: '24-Hour', type: 'ALS', hours: 24, date: d1 },
                { id: 102, rig: '3F17', paramedicId: 4, paramedic: 'Mike Medic',  emtId: 6, emt: 'Lisa EMT', shiftType: '24-Hour', type: 'ALS', hours: 24, date: d1 },
                { id: 103, rig: '3F16', paramedicId: 3, paramedic: 'Sarah Medic', emtId: 6, emt: 'Lisa EMT', shiftType: 'Day',     type: 'ALS', hours: 12, date: d2 },
                { id: 104, rig: '3F17', paramedicId: 4, paramedic: 'Mike Medic',  emtId: 5, emt: 'Tom EMT',  shiftType: 'Night',   type: 'BLS', hours: 12, date: d2 },
                { id: 105, rig: '3F16', paramedicId: 3, paramedic: 'Sarah Medic', emtId: 5, emt: 'Tom EMT',  shiftType: '24-Hour', type: 'ALS', hours: 24, date: d3 }
            ],
            totalHours: 96,
            publishedAt: now.toISOString(),
            createdBy: 2
        });

        saveData();
    }
}
// ========================================
// CALENDAR VIEW FUNCTIONS
// ========================================

let currentCalendarDate = new Date();
let selectedScheduleForCalendar = null;

/** @function loadCalendar */
function loadCalendar() {
    try {
        const scheduleSelect = document.getElementById('calendarScheduleSelect');
        if (!scheduleSelect) return;

        // Always rebuild the schedule options list (schedules may have changed)
        const previousValue = scheduleSelect.value;
        const publishedSchedules = (schedules || []).filter(s => s.status === 'published');

        scheduleSelect.innerHTML = '<option value="">-- Select Schedule --</option>';
        publishedSchedules.forEach(schedule => {
            const option = document.createElement('option');
            option.value = schedule.id;
            option.textContent = schedule.name;
            scheduleSelect.appendChild(option);
        });

        // Restore previous selection if still valid
        if (previousValue && publishedSchedules.find(s => String(s.id) === previousValue)) {
            scheduleSelect.value = previousValue;
        } else if (publishedSchedules.length > 0) {
            scheduleSelect.value = publishedSchedules[0].id;
        }

        // Get selected schedule
        const scheduleId = scheduleSelect.value;
        selectedScheduleForCalendar = schedules.find(s => String(s.id) === String(scheduleId)) || null;

        generateCalendar();
    } catch (error) {
        Logger.error('[loadCalendar] Error:', error.message || error);
    }
}

/** Calendar constants */
const CALENDAR_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
const CALENDAR_DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Update the calendar period label
 * @param {HTMLElement} periodLabel - Period label element
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 */
function updateCalendarPeriodLabel(periodLabel, year, month) {
    if (periodLabel) {
        periodLabel.textContent = `${CALENDAR_MONTH_NAMES[month]} ${year}`;
    }
}

/**
 * Add day headers to calendar grid
 * @param {HTMLElement} grid - Calendar grid element
 */
function addCalendarDayHeaders(grid) {
    CALENDAR_DAY_HEADERS.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        grid.appendChild(header);
    });
}

/**
 * Add empty cells before the first day of month
 * @param {HTMLElement} grid - Calendar grid element
 * @param {number} firstDay - Index of first day (0-6)
 */
function addCalendarEmptyCells(grid, firstDay) {
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day';
        emptyCell.style.background = 'transparent';
        grid.appendChild(emptyCell);
    }
}

/**
 * Create a calendar day cell
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {number} day - Day of month
 * @returns {HTMLElement} Day cell element
 */
function createCalendarDayCell(year, month, day) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';

    const dayOfWeek = new Date(year, month, day).getDay();
    const today = new Date();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
        dayCell.classList.add('weekend');
    }

    if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
        dayCell.classList.add('today');
    }

    const dayNumber = document.createElement('div');
    dayNumber.className = 'calendar-day-number';
    dayNumber.textContent = day;
    dayCell.appendChild(dayNumber);

    return dayCell;
}

/**
 * Add crew elements to a calendar day cell
 * @param {HTMLElement} dayCell - Day cell element
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {number} day - Day of month
 */
function addCrewsToCalendarDay(dayCell, year, month, day) {
    if (!selectedScheduleForCalendar || !selectedScheduleForCalendar.crews) return;

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayCrews = selectedScheduleForCalendar.crews.filter(c => c.date === dateStr);

    dayCrews.forEach(crew => {
        const crewDiv = document.createElement('div');
        crewDiv.className = `calendar-day-crew ${crew.type === 'ALS' ? 'als' : 'bls'}`;
        crewDiv.textContent = `${crew.rig}: ${crew.paramedic} & ${crew.emt}`;
        crewDiv.title = `${crew.rig} - ${crew.shiftType}`;
        dayCell.appendChild(crewDiv);
    });
}

/** @function generateCalendar */
function generateCalendar() {
    try {
        const grid = document.getElementById('calendarGrid');
        const periodLabel = document.getElementById('calendarPeriodLabel');
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        updateCalendarPeriodLabel(periodLabel, year, month);
        grid.textContent = '';
        addCalendarDayHeaders(grid);

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        addCalendarEmptyCells(grid, firstDay);

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = createCalendarDayCell(year, month, day);
            addCrewsToCalendarDay(dayCell, year, month, day);
            grid.appendChild(dayCell);
        }
    } catch (error) {
        Logger.error('[generateCalendar] Error:', error.message || error);
    }
}

/** @function changeCalendarMonth */
function changeCalendarMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    generateCalendar();
}

// Calendar initialization is handled within loadBossDashboard function
// and generateCalendar is called when the calendar section is shown

// ========================================
// STAFF DIRECTORY FUNCTIONS
// ========================================

/** @function loadStaffDirectory */
function loadStaffDirectory() {
    try {
        const staffGrid = document.getElementById('staffGrid');
        if(!staffGrid) return;
        staffGrid.textContent = '';

        const staff = users.filter(u =>
            (u.role === USER_ROLES.PARAMEDIC || u.role === USER_ROLES.EMT) && u.active !== false
        ).sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));

        if(staff.length === 0) {
            staffGrid.innerHTML = '<p class="text-muted" style="padding:20px">No active staff members found.</p>';
            return;
        }

        staff.forEach(member => {
            // Count upcoming shifts
            const now = new Date();
            let upcoming = 0, total = 0;
            schedules.forEach(s => {
                (s.crews || []).forEach(c => {
                    if(String(c.paramedicId) === String(member.id) || String(c.emtId) === String(member.id)) {
                        total++;
                        if(new Date(c.date) >= now) upcoming++;
                    }
                });
            });

            const isParamedic = member.role === USER_ROLES.PARAMEDIC;
            const roleColor = isParamedic ? '#e74c3c' : '#2980b9';
            const roleEmoji = isParamedic ? '🚑' : '🏥';
            const hours = parseInt(member.hoursWorked) || 0;
            const bonus = parseInt(member.bonusHours) || 0;

            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.staffName = (member.fullName || '').toLowerCase();
            card.dataset.staffRole = member.role;
            card.style.cssText = 'border-top:4px solid ' + roleColor + ';transition:box-shadow .2s;cursor:default;';
            card.innerHTML =
                '<div style="padding:16px 18px;">' +
                  '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
                    '<div>' +
                      '<div style="font-size:1.05rem;font-weight:700;color:#2c3e50">' + roleEmoji + ' ' + sanitizeHTML(member.fullName || member.username) + '</div>' +
                      '<div style="font-size:.8rem;color:#888;margin-top:2px">@' + sanitizeHTML(member.username) + '</div>' +
                    '</div>' +
                    '<span style="background:' + roleColor + ';color:#fff;padding:3px 10px;border-radius:12px;font-size:.75rem;font-weight:600">' + member.role.toUpperCase() + '</span>' +
                  '</div>' +
                  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.85rem;color:#555;margin-bottom:12px;">' +
                    '<div>📞 ' + sanitizeHTML(member.phone || 'No phone') + '</div>' +
                    '<div>⏱ ' + hours + 'h worked</div>' +
                    '<div>📅 ' + upcoming + ' upcoming shift' + (upcoming !== 1 ? 's' : '') + '</div>' +
                    '<div>⭐ ' + bonus + 'h bonus</div>' +
                  '</div>' +
                  '<div style="display:flex;gap:8px;">' +
                    '<button class="btn btn-sm btn-primary" onclick="viewStaffSchedule(' + parseInt(member.id) + ')" style="flex:1">📅 Schedule</button>' +
                    '<button class="btn btn-sm btn-info" onclick="viewStaffDetails(' + parseInt(member.id) + ')" style="flex:1">👤 Details</button>' +
                  '</div>' +
                '</div>';
            staffGrid.appendChild(card);
        });

        // Update count
        const countEl = document.getElementById('staffCount');
        if(countEl) countEl.textContent = staff.length + ' staff';
    } catch (error) {
        Logger.error('[loadStaffDirectory] Error:', error.message || error);
    }
}

/** @function filterStaff */
function filterStaff() {
    try {
        const searchTerm = (document.getElementById('staffSearch') || {value: ''}).value.toLowerCase();
        const roleFilter = (document.getElementById('staffRoleFilter') || {value: ''}).value;

        const staffCards = document.querySelectorAll('#staffGrid .card');

        staffCards.forEach(card => {
            const nameEl = card.querySelector('.card-header h2') || card.querySelector('h2') || card.querySelector('h3');
            const roleEl = card.querySelector('.badge') || card.querySelector('[data-role]');
            const name = (nameEl ? nameEl.textContent : card.textContent).toLowerCase();
            const role = (roleEl ? roleEl.textContent : '').toLowerCase();

            const matchesSearch = name.includes(searchTerm);
            const matchesRole = roleFilter === '' || role.includes(roleFilter.toLowerCase());

            card.style.display = matchesSearch && matchesRole ? 'block' : 'none';
        });
    } catch (error) {
        Logger.error('[filterStaff] Error:', error.message || error);
    }
}

/** @function viewStaffSchedule — shows a modal with all shifts for a staff member */
function viewStaffSchedule(staffId) {
    try {
        const staff = users.find(u => String(u.id) === String(staffId));
        if(!staff) return;

        const now = new Date();
        const shifts = [];
        schedules.forEach(s => {
            (s.crews || []).forEach(c => {
                const isP = String(c.paramedicId) === String(staffId);
                const isE = String(c.emtId) === String(staffId);
                if(isP || isE) {
                    shifts.push({
                        scheduleName: s.name,
                        date: c.date,
                        rig: c.rig,
                        shiftType: c.shiftType,
                        type: c.type || 'ALS',
                        hours: c.hours || 12,
                        partner: isP ? (c.emt || 'TBD') : (c.paramedic || 'TBD'),
                        partnerRole: isP ? 'EMT' : 'Paramedic',
                        past: new Date(c.date) < now
                    });
                }
            });
        });
        shifts.sort((a, b) => new Date(b.date) - new Date(a.date));

        const upcoming = shifts.filter(s => !s.past);
        const past     = shifts.filter(s =>  s.past);

        let html = '<div style="max-height:60vh;overflow-y:auto;padding-right:4px;">';
        html += '<div style="font-size:.85rem;color:#555;margin-bottom:12px;">';
        html += '<strong>' + sanitizeHTML(staff.fullName || staff.username) + '</strong> &nbsp;·&nbsp; ' + staff.role.toUpperCase();
        html += ' &nbsp;·&nbsp; ' + upcoming.length + ' upcoming, ' + past.length + ' past</div>';

        if(shifts.length === 0) {
            html += '<p style="color:#888;text-align:center;padding:20px">No shifts found for this staff member.</p>';
        } else {
            const renderShift = (s) =>
                '<div style="border:1px solid ' + (s.past ? '#eee' : '#dce9ff') + ';border-radius:8px;padding:10px 12px;margin-bottom:8px;opacity:' + (s.past ? '.6' : '1') + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                '<strong style="font-size:.9rem">' + sanitizeHTML(s.date) + '</strong>' +
                '<span style="font-size:.75rem;background:' + (s.past ? '#f0f0f0' : '#e3f2fd') + ';padding:2px 8px;border-radius:8px">' + sanitizeHTML(s.shiftType) + '</span>' +
                '</div>' +
                '<div style="font-size:.82rem;color:#555">🚑 Rig ' + sanitizeHTML(s.rig || '?') + ' &nbsp;·&nbsp; ' + sanitizeHTML(s.type) + ' &nbsp;·&nbsp; ' + s.hours + 'h</div>' +
                '<div style="font-size:.82rem;color:#555">👥 ' + sanitizeHTML(s.partnerRole) + ': ' + sanitizeHTML(s.partner) + '</div>' +
                '</div>';

            if(upcoming.length) {
                html += '<div style="font-weight:700;color:#2c3e50;margin-bottom:6px">📅 Upcoming (' + upcoming.length + ')</div>';
                upcoming.forEach(s => { html += renderShift(s); });
            }
            if(past.length) {
                html += '<div style="font-weight:700;color:#888;margin:10px 0 6px">🕐 Past (' + past.length + ')</div>';
                past.slice(0, 5).forEach(s => { html += renderShift(s); });
                if(past.length > 5) html += '<p style="color:#aaa;font-size:.8rem;text-align:center">+ ' + (past.length - 5) + ' more past shifts</p>';
            }
        }
        html += '</div>';

        const titleEl = document.getElementById('alertModalTitle');
        const msgEl   = document.getElementById('alertModalMessage');
        if(titleEl) titleEl.textContent = 'Schedule: ' + (staff.fullName || staff.username);
        if(msgEl)   msgEl.innerHTML = html;
        showModal('alertModal');
    } catch(error) {
        Logger.error('[viewStaffSchedule] Error:', error);
    }
}

/** @function viewStaffDetails — upgraded modal with full staff profile */
function viewStaffDetails(staffId) {
    try {
        const staff = users.find(u => String(u.id) === String(staffId));
        if(!staff) return;

        // Count total shifts
        let totalShifts = 0, totalH = 0;
        schedules.forEach(s => {
            (s.crews || []).forEach(c => {
                if(String(c.paramedicId) === String(staffId) || String(c.emtId) === String(staffId)) {
                    totalShifts++;
                    totalH += parseInt(c.hours) || 12;
                }
            });
        });

        const isParamedic = staff.role === 'paramedic';
        const roleColor = isParamedic ? '#e74c3c' : '#2980b9';

        const html =
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:.9rem;">' +
            '<div><span style="color:#888">Full Name</span><br><strong>' + sanitizeHTML(staff.fullName || 'N/A') + '</strong></div>' +
            '<div><span style="color:#888">Username</span><br><strong>@' + sanitizeHTML(staff.username) + '</strong></div>' +
            '<div><span style="color:#888">Role</span><br><span style="background:' + roleColor + ';color:#fff;padding:2px 10px;border-radius:10px;font-size:.8rem">' + staff.role.toUpperCase() + '</span></div>' +
            '<div><span style="color:#888">Phone</span><br><strong>' + sanitizeHTML(staff.phone || 'N/A') + '</strong></div>' +
            '<div><span style="color:#888">Hours Worked</span><br><strong>' + (parseInt(staff.hoursWorked) || 0) + 'h</strong></div>' +
            '<div><span style="color:#888">Bonus Hours</span><br><strong>' + (parseInt(staff.bonusHours) || 0) + 'h</strong></div>' +
            '<div><span style="color:#888">Total Shifts</span><br><strong>' + totalShifts + '</strong></div>' +
            '<div><span style="color:#888">Scheduled Hours</span><br><strong>' + totalH + 'h</strong></div>' +
            '</div>' +
            '<div style="margin-top:14px;display:flex;gap:8px;">' +
            '<button class="btn btn-sm btn-primary" onclick="closeModal(&quot;alertModal&quot;);viewStaffSchedule(' + parseInt(staffId) + ')">📅 View Schedule</button>' +
            '</div>';

        const titleEl = document.getElementById('alertModalTitle');
        const msgEl   = document.getElementById('alertModalMessage');
        if(titleEl) titleEl.textContent = 'Staff Profile';
        if(msgEl)   msgEl.innerHTML = html;
        showModal('alertModal');
    } catch (error) {
        Logger.error('[viewStaffDetails] Error:', error.message || error);
    }
}

// ========================================
// TIME-OFF REQUEST FUNCTIONS
// ========================================

let timeoffRequests = [];

/** @function loadTimeoffRequests */
function loadTimeoffRequests() {
    try {
        const tbody = document.getElementById('timeoffTableBody');
        tbody.textContent = '';

        // Load from localStorage
        const savedRequests = localStorage.getItem('lifestarTimeoffRequests');
        if(savedRequests) {
            timeoffRequests = safeJSONParse(savedRequests, []);
        }

        if(timeoffRequests.length === 0) {
            document.getElementById('noTimeoffMessage').style.display = 'block';
            document.getElementById('timeoffTable').style.display = 'none';
            return;
        }

        document.getElementById('noTimeoffMessage').style.display = 'none';
        document.getElementById('timeoffTable').style.display = 'table';

        // Sort: pending first, then by date descending
        const sorted = [...timeoffRequests].sort((a, b) => {
            if(a.status === 'pending' && b.status !== 'pending') return -1;
            if(b.status === 'pending' && a.status !== 'pending') return 1;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        sorted.forEach(request => {
            const row = document.createElement('tr');
            const staff = users.find(u => String(u.id) === String(request.staffId));
            const statusColors = { approved: '#28a745', rejected: '#dc3545', pending: '#ffc107' };
            const statusColor  = statusColors[request.status] || '#6c757d';
            const statusTextC  = request.status === 'pending' ? '#333' : '#fff';

            // Calculate duration
            const daysDiff = request.startDate && request.endDate
                ? Math.ceil((new Date(request.endDate) - new Date(request.startDate)) / 86400000) + 1
                : 1;

            row.innerHTML =
                '<td><strong>' + sanitizeHTML(staff ? (staff.fullName || staff.username) : 'Unknown') + '</strong>' +
                '<br><small style="color:#888">' + sanitizeHTML(staff ? staff.role.toUpperCase() : '') + '</small></td>' +
                '<td>' + sanitizeHTML(request.startDate) + '<br><small style="color:#888">to ' + sanitizeHTML(request.endDate) + ' (' + daysDiff + 'd)</small></td>' +
                '<td style="max-width:200px;word-wrap:break-word">' + sanitizeHTML(request.reason || 'No reason given') + '</td>' +
                '<td><span style="background:' + statusColor + ';color:' + statusTextC + ';padding:3px 10px;border-radius:10px;font-size:.8rem;font-weight:600">' + request.status.toUpperCase() + '</span>' +
                (request.rejectionReason ? '<br><small style="color:#888">' + sanitizeHTML(request.rejectionReason) + '</small>' : '') + '</td>' +
                '<td style="white-space:nowrap">' +
                (request.status === 'pending'
                    ? '<button class="btn btn-sm btn-success" onclick="approveTimeoff(' + parseInt(request.id) + ')" title="Approve">✅</button> ' +
                      '<button class="btn btn-sm btn-danger" onclick="rejectTimeoff(' + parseInt(request.id) + ')" title="Reject">❌</button>'
                    : '<span style="color:#aaa;font-size:.85rem">' + (request.approvedAt || request.rejectedAt ? new Date(request.approvedAt || request.rejectedAt).toLocaleDateString() : '—') + '</span>') +
                '</td>';
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadTimeoffRequests] Error:', error.message || error);
    }
}

/** @function approveTimeoff */
function approveTimeoff(requestId) {
    const request = timeoffRequests.find(r => String(r.id) === String(requestId));
    if(!request) return;
    const staff = users.find(u => String(u.id) === String(request.staffId));
    const name  = staff ? (staff.fullName || staff.username) : 'Unknown';
    if(confirm('Approve time-off for ' + name + '\n' + request.startDate + ' → ' + request.endDate + '?')) {
        request.status     = 'approved';
        request.approvedBy = currentUser.id;
        request.approvedAt = new Date().toISOString();
        saveTimeoffRequests();
        loadTimeoffRequests();
        showAlert('✅ Time-off approved for ' + name, 'success');
        addSystemLog('Time-off approved: ' + name + ' (' + request.startDate + ' – ' + request.endDate + ')');
        // Notify via notification system if available
        if(typeof NotificationCenter !== 'undefined') {
            NotificationCenter.add({ type: 'timeoff', message: 'Time-off approved for ' + name, level: 'success' });
        }
    }
}

/** @function rejectTimeoff */
function rejectTimeoff(requestId) {
    const request = timeoffRequests.find(r => String(r.id) === String(requestId));
    if(!request) return;
    const staff = users.find(u => String(u.id) === String(request.staffId));
    const name  = staff ? (staff.fullName || staff.username) : 'Unknown';
    const reason = prompt('Reject time-off for ' + name + '\nEnter reason for rejection (required):');
    if(reason && reason.trim()) {
        request.status          = 'rejected';
        request.rejectedBy      = currentUser.id;
        request.rejectedAt      = new Date().toISOString();
        request.rejectionReason = reason.trim();
        saveTimeoffRequests();
        loadTimeoffRequests();
        showAlert('Time-off rejected for ' + name, 'warning');
        addSystemLog('Time-off rejected: ' + name + ' — ' + reason.trim());
    } else if(reason !== null) {
        showAlert('A rejection reason is required.', 'warning');
    }
}

/** @function saveTimeoffRequests */
function saveTimeoffRequests() {
    localStorage.setItem('lifestarTimeoffRequests', JSON.stringify(timeoffRequests));
}

// Add sample time-off requests
/** @function addSampleTimeoffRequests */
function addSampleTimeoffRequests() {
    if(timeoffRequests.length === 0) {
        const paramedics = users.filter(u => u.role === USER_ROLES.PARAMEDIC);
        if(paramedics.length > 0) {
            timeoffRequests.push({
                id: Date.now(),
                staffId: paramedics[0].id,
                startDate: '2025-01-15',
                endDate: '2025-01-17',
                reason: 'Personal vacation',
                status: 'pending',
                createdAt: new Date().toISOString()
            });

            timeoffRequests.push({
                id: Date.now() + 1,
                staffId: paramedics.length > 1 ? paramedics[1].id : paramedics[0].id,
                startDate: '2025-01-20',
                endDate: '2025-01-21',
                reason: 'Family emergency',
                status: 'approved',
                createdAt: new Date().toISOString(),
                approvedBy: currentUser.id,
                approvedAt: new Date().toISOString()
            });

            saveTimeoffRequests();
        }
    }
}

// ========================================
// PARAMEDIC DASHBOARD FUNCTIONS
// ========================================

/** @function loadParamedicDashboard */
function loadParamedicDashboard() {
    showParamedicSection('myschedule');
    loadMySchedule();
    renderEmployeeStatsHeader('paramedicDashboard');
}

/** @function showParamedicSection */
function showParamedicSection(section) {
    try {
        // Hide all sections
        document.querySelectorAll('.paramedic-section').forEach(s => s.classList.add('hidden'));

        // Remove active class from all nav items
        document.querySelectorAll('#paramedicDashboard .nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Show selected section - use 'paramedic' prefix to match HTML IDs
        const sectionElement = document.getElementById('paramedic' + section.charAt(0).toUpperCase() + section.slice(1));
        if(sectionElement) {
            sectionElement.classList.remove('hidden');
        }

        // Add active class to clicked nav item (safe event access)
        try {
            const evt = window.event;
            if(evt && evt.currentTarget && evt.currentTarget.classList) {
                evt.currentTarget.classList.add('active');
            } else {
                document.querySelectorAll('#paramedicDashboard .nav-item').forEach(item => {
                    if(item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + section + "'")) {
                        item.classList.add('active');
                    }
                });
            }
        } catch (navError) {
            document.querySelectorAll('#paramedicDashboard .nav-item').forEach(item => {
                if(item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + section + "'")) {
                    item.classList.add('active');
                }
            });
        }

        // Load data based on section
        try {
            if(section === 'myschedule') {
                loadMySchedule();
            } else if(section === 'incidents') {
                if(typeof loadIncidentReports === 'function') loadIncidentReports();
            } else if(section === 'performance') {
                if(typeof loadPerformanceRating === 'function') loadPerformanceRating();
            } else if(section === 'notifications') {
                if(typeof loadNotifications === 'function') loadNotifications();
            } else if(section === 'settings') {
                if(typeof loadSettings === 'function') loadSettings();
            } else if(section === 'availability') {
                // Availability section - static form, no special load needed
            } else if(section === 'timeoff') {
                // Time off form - static, no special load needed
            } else if(section === 'trades') {
                // Trades section
            } else if(section === 'crews') {
                // Crews section
            } else if(section === 'training') {
                // Training section
            }
        } catch (sectionError) {
            Logger.error('[showParamedicSection] Error loading section data:', sectionError.message);
        }
    } catch (error) {
        Logger.error('[showParamedicSection] Error:', error.message || error);
    }
}

/** @function loadMySchedule */
function loadMySchedule() {
    try {
        const scheduleList = document.getElementById('myScheduleList');
        scheduleList.textContent = '';

        // Get all published schedules and find user's shifts by ID (not fragile name match)
        const publishedSchedules = (schedules || []).filter(s => s.status === 'published');
        let myShifts = [];

        publishedSchedules.forEach(schedule => {
            if(schedule.crews) {
                schedule.crews.forEach(crew => {
                    const isParamedic = String(crew.paramedicId) === String(currentUser.id);
                    const isEmt = String(crew.emtId) === String(currentUser.id);
                    if(isParamedic || isEmt) {
                        myShifts.push({
                            scheduleName: schedule.name,
                            date: crew.date,
                            shiftType: crew.shiftType,
                            rig: crew.rig,
                            partner: isParamedic ? (crew.emt || 'TBD') : (crew.paramedic || 'TBD'),
                            partnerRole: isParamedic ? 'EMT' : 'Paramedic',
                            type: crew.type || 'ALS',
                            hours: crew.hours || 12
                        });
                    }
                });
            }
        });

        // Show/hide empty message
        const noMsg = document.getElementById('noMyScheduleMessage');
        if (noMsg) noMsg.style.display = myShifts.length > 0 ? 'none' : 'block';

        // Sort shifts by date
        myShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Upcoming next shift banner
        const now = new Date();
        const nextShift = myShifts.find(s => new Date(s.date) >= now);
        if (nextShift) {
            const daysUntil = Math.ceil((new Date(nextShift.date) - now) / 86400000);
            const banner = document.createElement('div');
            banner.style.cssText = 'background:linear-gradient(135deg,var(--lifestar-red),#c0392b);color:#fff;padding:14px 18px;border-radius:10px;margin-bottom:16px;font-weight:600;display:flex;align-items:center;gap:10px;';
            const safeRig = sanitizeHTML ? sanitizeHTML(nextShift.rig || '') : (nextShift.rig || '');
            const safeType = sanitizeHTML ? sanitizeHTML(nextShift.shiftType || '') : (nextShift.shiftType || '');
            const safeDate = sanitizeHTML ? sanitizeHTML(nextShift.date || '') : (nextShift.date || '');
            const countdownLabel = daysUntil === 0 ? '<span style="color:#ffd700">TODAY</span>' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil} days`;
            banner.innerHTML = `<span style="font-size:1.4em">🚑</span> Your next shift: <strong>${safeDate}</strong> — ${safeRig} (${safeType}) &nbsp;·&nbsp; ${countdownLabel}`;
            scheduleList.appendChild(banner);
        }

        // Render shifts
        myShifts.forEach(shift => {
            const shiftCard = document.createElement('div');
            const isPast = new Date(shift.date) < now;
            shiftCard.className = 'schedule-item' + (isPast ? ' opacity-50' : '');
            shiftCard.style.opacity = isPast ? '0.6' : '1';
            shiftCard.innerHTML = `
                <div class="schedule-header">
                    <div class="schedule-title">${sanitizeHTML(shift.scheduleName)}</div>
                    <div class="schedule-status published">${sanitizeHTML(shift.type)}</div>
                </div>
                <div class="schedule-info">
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">📅</span>${sanitizeHTML(shift.date)}</div>
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">⏱️</span>${sanitizeHTML(shift.shiftType)} (${sanitizeHTML(String(shift.hours))}h)</div>
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">🚑</span>Rig ${sanitizeHTML(shift.rig)}</div>
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">👥</span>${sanitizeHTML(shift.partnerRole)}: ${sanitizeHTML(shift.partner)}</div>
                </div>
            `;
            scheduleList.appendChild(shiftCard);
        });
    } catch (error) {
        Logger.error('[loadMySchedule] Error:', error.message || error);
    }
}

// ========================================
// EMT DASHBOARD FUNCTIONS
// ========================================

/** @function loadEmtDashboard */
function loadEmtDashboard() {
    showEmtSection('myschedule');
    loadEmtMySchedule();
    renderEmployeeStatsHeader('emtDashboard');
}

/** @function showEmtSection */
function showEmtSection(section) {
    try {
        // Hide all sections
        document.querySelectorAll('.emt-section').forEach(s => s.classList.add('hidden'));

        // Remove active class from all nav items
        document.querySelectorAll('#emtDashboard .nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Show selected section - use 'emt' prefix to match HTML IDs
        const sectionElement = document.getElementById('emt' + section.charAt(0).toUpperCase() + section.slice(1));
        if(sectionElement) {
            sectionElement.classList.remove('hidden');
        }

        // Add active class to clicked nav item (safe event access)
        try {
            const evt = window.event;
            if(evt && evt.currentTarget && evt.currentTarget.classList) {
                evt.currentTarget.classList.add('active');
            } else {
                document.querySelectorAll('#emtDashboard .nav-item').forEach(item => {
                    if(item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + section + "'")) {
                        item.classList.add('active');
                    }
                });
            }
        } catch (navError) {
            document.querySelectorAll('#emtDashboard .nav-item').forEach(item => {
                if(item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + section + "'")) {
                    item.classList.add('active');
                }
            });
        }

        // Load data based on section
        try {
            if(section === 'myschedule') {
                loadEmtMySchedule();
            } else if(section === 'incidents') {
                if(typeof loadIncidentReports === 'function') loadIncidentReports();
            } else if(section === 'performance') {
                if(typeof loadPerformanceRating === 'function') loadPerformanceRating();
            } else if(section === 'notifications') {
                if(typeof loadNotifications === 'function') loadNotifications();
            } else if(section === 'settings') {
                if(typeof loadSettings === 'function') loadSettings();
            } else if(section === 'availability') {
                // Availability section - static form
            } else if(section === 'timeoff') {
                // Time off form - static
            } else if(section === 'trades') {
                // Trades section
            } else if(section === 'crews') {
                // Crews section
            } else if(section === 'training') {
                // Training section
            }
        } catch (sectionError) {
            Logger.error('[showEmtSection] Error loading section data:', sectionError.message);
        }
    } catch (error) {
        Logger.error('[showEmtSection] Error:', error.message || error);
    }
}

/** @function loadEmtMySchedule */
function loadEmtMySchedule() {
    try {
        const scheduleList = document.getElementById('emtMyScheduleList');
        scheduleList.textContent = '';

        // Match shifts by user ID (not fragile fullName string)
        const publishedSchedules = (schedules || []).filter(s => s.status === 'published');
        let myShifts = [];

        publishedSchedules.forEach(schedule => {
            if(schedule.crews) {
                schedule.crews.forEach(crew => {
                    const isParamedic = String(crew.paramedicId) === String(currentUser.id);
                    const isEmt = String(crew.emtId) === String(currentUser.id);
                    if(isParamedic || isEmt) {
                        myShifts.push({
                            scheduleName: schedule.name,
                            date: crew.date,
                            shiftType: crew.shiftType,
                            rig: crew.rig,
                            partner: isParamedic ? (crew.emt || 'TBD') : (crew.paramedic || 'TBD'),
                            partnerRole: isParamedic ? 'EMT' : 'Paramedic',
                            type: crew.type || 'BLS',
                            hours: crew.hours || 12
                        });
                    }
                });
            }
        });

        const noMsg = document.getElementById('emtNoMyScheduleMessage');
        if (noMsg) noMsg.style.display = myShifts.length > 0 ? 'none' : 'block';

        myShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Upcoming next shift banner
        const now = new Date();
        const nextShift = myShifts.find(s => new Date(s.date) >= now);
        if (nextShift) {
            const daysUntil = Math.ceil((new Date(nextShift.date) - now) / 86400000);
            const banner = document.createElement('div');
            banner.style.cssText = 'background:linear-gradient(135deg,var(--lifestar-light-blue,#3498db),#2980b9);color:#fff;padding:14px 18px;border-radius:10px;margin-bottom:16px;font-weight:600;display:flex;align-items:center;gap:10px;';
            const safeRig = sanitizeHTML ? sanitizeHTML(nextShift.rig || '') : (nextShift.rig || '');
            const safeType = sanitizeHTML ? sanitizeHTML(nextShift.shiftType || '') : (nextShift.shiftType || '');
            const safeDate = sanitizeHTML ? sanitizeHTML(nextShift.date || '') : (nextShift.date || '');
            const countdownLabel = daysUntil === 0 ? '<span style="color:#ffd700">TODAY</span>' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil} days`;
            banner.innerHTML = `<span style="font-size:1.4em">🚑</span> Your next shift: <strong>${safeDate}</strong> — ${safeRig} (${safeType}) &nbsp;·&nbsp; ${countdownLabel}`;
            scheduleList.appendChild(banner);
        }

        myShifts.forEach(shift => {
            const isPast = new Date(shift.date) < now;
            const shiftCard = document.createElement('div');
            shiftCard.className = 'schedule-item';
            shiftCard.style.opacity = isPast ? '0.6' : '1';
            shiftCard.innerHTML = `
                <div class="schedule-header">
                    <div class="schedule-title">${sanitizeHTML(shift.scheduleName)}</div>
                    <div class="schedule-status published">${sanitizeHTML(shift.type)}</div>
                </div>
                <div class="schedule-info">
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">📅</span>${sanitizeHTML(shift.date)}</div>
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">⏱️</span>${sanitizeHTML(shift.shiftType)} (${sanitizeHTML(String(shift.hours))}h)</div>
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">🚑</span>Rig ${sanitizeHTML(shift.rig)}</div>
                    <div class="schedule-info-item"><span class="schedule-info-item-icon">👥</span>${sanitizeHTML(shift.partnerRole)}: ${sanitizeHTML(shift.partner)}</div>
                </div>
            `;
            scheduleList.appendChild(shiftCard);
        });
    } catch (error) {
        Logger.error('[loadEmtMySchedule] Error:', error.message || error);
    }
}

/** @function renderEmployeeStatsHeader - Shows hours summary at top of employee dashboard */
function renderEmployeeStatsHeader(dashboardId) {
    try {
        const dashboard = document.getElementById(dashboardId);
        if (!dashboard || !currentUser) return;

        // Remove existing header if any
        const existing = dashboard.querySelector('.employee-stats-header');
        if (existing) existing.remove();

        // Calculate monthly hours from published schedules
        const now = new Date();
        const currentMonth = now.toLocaleString('en-US', { month: 'long' });
        const currentYear = now.getFullYear();
        let monthlyHours = 0;
        let totalShifts = 0;
        let upcomingShifts = 0;

        (schedules || []).filter(function(s) { return s.status === 'published'; }).forEach(function(schedule) {
            (schedule.crews || []).forEach(function(crew) {
                var isAssigned = String(crew.paramedicId) === String(currentUser.id) || String(crew.emtId) === String(currentUser.id);
                if (!isAssigned) return;
                totalShifts++;
                var crewDate = new Date(crew.date);
                if (crewDate >= now) upcomingShifts++;
                if (crewDate.getMonth() === now.getMonth() && crewDate.getFullYear() === currentYear) {
                    monthlyHours += parseInt(crew.hours) || 12;
                }
            });
        });

        var hoursRemaining = Math.max(0, 160 - monthlyHours);
        var hoursPercent = Math.min(100, Math.round((monthlyHours / 160) * 100));
        var barColor = hoursPercent > 90 ? '#e74c3c' : hoursPercent > 70 ? '#f39c12' : '#27ae60';

        var header = document.createElement('div');
        header.className = 'employee-stats-header';
        header.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;padding:16px 20px;margin-bottom:0;';

        header.innerHTML =
            '<div style="background:#fff;border-radius:10px;padding:12px 16px;box-shadow:0 2px 6px rgba(0,0,0,.06);flex:1;min-width:140px;">' +
            '<div style="font-size:.75rem;color:#888;text-transform:uppercase;letter-spacing:.5px">This Month</div>' +
            '<div style="font-size:1.4rem;font-weight:700;color:' + barColor + '">' + monthlyHours + 'h <span style="font-size:.8rem;color:#aaa;font-weight:400">/ 160h</span></div>' +
            '<div style="background:#f0f0f0;border-radius:3px;height:4px;margin-top:6px;overflow:hidden"><div style="width:' + hoursPercent + '%;background:' + barColor + ';height:100%;border-radius:3px"></div></div>' +
            '</div>' +
            '<div style="background:#fff;border-radius:10px;padding:12px 16px;box-shadow:0 2px 6px rgba(0,0,0,.06);flex:1;min-width:140px;">' +
            '<div style="font-size:.75rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Upcoming Shifts</div>' +
            '<div style="font-size:1.4rem;font-weight:700;color:#3498db">' + upcomingShifts + '</div>' +
            '</div>' +
            '<div style="background:#fff;border-radius:10px;padding:12px 16px;box-shadow:0 2px 6px rgba(0,0,0,.06);flex:1;min-width:140px;">' +
            '<div style="font-size:.75rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Hours Remaining</div>' +
            '<div style="font-size:1.4rem;font-weight:700;color:' + (hoursRemaining < 20 ? '#e74c3c' : '#27ae60') + '">' + hoursRemaining + 'h</div>' +
            '</div>';

        // Insert at the top of main content
        var mainContent = dashboard.querySelector('.main-content');
        if (mainContent && mainContent.firstChild) {
            mainContent.insertBefore(header, mainContent.firstChild);
        }
    } catch (e) {
        Logger.error('[renderEmployeeStatsHeader]', e);
    }
}

// ========================================
// TIME-OFF REQUEST SUBMISSION
// ========================================

// Safe event listener attachment for time-off forms
const requestTimeoffForm = document.getElementById('requestTimeoffForm');
if(requestTimeoffForm) {
    requestTimeoffForm.addEventListener('submit', function(e) {
        e.preventDefault();
        submitTimeoffRequest(USER_ROLES.PARAMEDIC);
    });
}

const emtRequestTimeoffForm = document.getElementById('emtRequestTimeoffForm');
if(emtRequestTimeoffForm) {
    emtRequestTimeoffForm.addEventListener('submit', function(e) {
        e.preventDefault();
        submitTimeoffRequest(USER_ROLES.EMT);
    });
}

/** @function submitTimeoffRequest */
function submitTimeoffRequest(type) {
    try {
        const startDateId = type === USER_ROLES.PARAMEDIC ? 'timeoffStartDate' : 'emtTimeoffStartDate';
        const endDateId = type === USER_ROLES.PARAMEDIC ? 'timeoffEndDate' : 'emtTimeoffEndDate';
        const reasonId = type === USER_ROLES.PARAMEDIC ? 'timeoffReason' : 'emtTimeoffReason';

        const startDate = (document.getElementById(startDateId) || {value: ''}).value.trim();
        const endDate = (document.getElementById(endDateId) || {value: ''}).value.trim();
        const reason = (document.getElementById(reasonId) || {value: ''}).value.trim();

        // Required field validation
        if (!startDate) {
            showAlert('Please select a start date', 'warning');
            return;
        }
        if (!endDate) {
            showAlert('Please select an end date', 'warning');
            return;
        }
        if (!reason) {
            showAlert('Please provide a reason for your time-off request', 'warning');
            return;
        }

        // Logic validation
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start < today) {
            showAlert('Start date cannot be in the past', 'warning');
            return;
        }
        if (end < start) {
            showAlert('End date must be on or after start date', 'danger');
            return;
        }

        // Check for duplicate pending request
        const existing = timeoffRequests.find(r =>
            String(r.staffId) === String(currentUser.id) &&
            r.status === 'pending' &&
            r.startDate === startDate
        );
        if (existing) {
            showAlert('You already have a pending request for this date', 'warning');
            return;
        }

        // Create request
        const request = {
            id: Date.now(),
            staffId: currentUser.id,
            startDate: startDate,
            endDate: endDate,
            reason: reason,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        timeoffRequests.push(request);
        saveTimeoffRequests();

        // Clear form
        (document.getElementById(startDateId) || {value: ''}).value = '';
        (document.getElementById(endDateId) || {value: ''}).value = '';
        (document.getElementById(reasonId) || {value: ''}).value = '';

        showAlert('Time-off request submitted! Your manager will review it shortly.', 'success');
        addSystemLog('Time-off request submitted by: ' + currentUser.username + ' (' + startDate + ' to ' + endDate + ')');
    } catch (error) {
        Logger.error('[submitTimeoffRequest] Error:', error.message || error);
    }
}

// Initialize sample data
addSampleTimeoffRequests();

// ========================================
// HELPER FUNCTIONS FOR REMAINING FEATURES
// ========================================

/** @function showSubmitIncidentModal */
function showSubmitIncidentModal() {
    showModal('submitIncidentModal');
}

/** @function markAllNotificationsRead */
function markAllNotificationsRead() {
    try {
        notifications.forEach(n => n.read = true);
        localStorage.setItem('lifestarNotifications', JSON.stringify(notifications));
        loadNotifications();
        showAlert('All notifications marked as read', 'success');
    } catch (error) {
        Logger.error('[markAllNotificationsRead] Error:', error.message || error);
    }
}

// Add incident form submission - with null check
const submitIncidentForm = document.getElementById('submitIncidentForm');
if(submitIncidentForm) {
    submitIncidentForm.addEventListener('submit', function(e) {
        e.preventDefault();
        submitIncidentReport(USER_ROLES.PARAMEDIC);
    });
}

// Add sample notifications
/** @function createSampleNotifications */
function createSampleNotifications() {
    try {
        const saved = localStorage.getItem('lifestarNotifications');
        if(saved) {
            notifications = safeJSONParse(saved, []);
        }

        if(notifications.length === 0 && currentUser) {
            notifications.push({
                id: Date.now(),
                userId: currentUser.id,
                title: 'Welcome to Lifestar!',
                message: 'Welcome to the Lifestar scheduling system. You can view your schedule, request time off, and more.',
                read: false,
                createdAt: new Date().toISOString()
            });

            notifications.push({
                id: Date.now() + 1,
                userId: currentUser.id,
                title: 'Schedule Published',
                message: 'December 2024 schedule has been published. Check your schedule for details.',
                read: false,
                createdAt: new Date().toISOString()
            });

            localStorage.setItem('lifestarNotifications', JSON.stringify(notifications));
        }
    } catch (error) {
        Logger.error('[createSampleNotifications] Error:', error.message || error);
    }
}

// Sample notifications are now created within showDashboard function

/** @function loadAvailability */
function loadAvailability() {
    try {
        // Call the new staff availability calendar
        if (typeof loadAvailabilityCalendar === 'function') {
            loadAvailabilityCalendar();
        }
    } catch (error) {
        Logger.error('[loadAvailability] Error:', error.message || error);
    }
}

// ============================================================
// MOBILE SHIFT CREATION FUNCTIONS
// ============================================================

/** @function showMobileAddShift */
function showMobileAddShift() {
    // Open the create crew modal with today's date
    const today = new Date().toISOString().split('T')[0];
    if(typeof showCreateCrewModal === 'function') {
        showCreateCrewModal(today);
    } else {
        showModal('createCrewModal');
    }
}

// Touch-friendly crew card actions
/** @function showCrewActions */
function showCrewActions(crewId) {
    try {
        const crew = currentEditingSchedule?.crews?.find(c => String(c.id) === String(crewId));
        if(!crew) return;

        const actions = [
            { label: '✏️ Edit Shift', action: () => editCrewShift(crewId) },
            { label: '🔄 Swap Staff', action: () => swapCrewStaff(crewId) },
            { label: '🗑️ Delete Shift', action: () => { if(confirm('Delete this shift?')) deleteCrew(crewId); } }
        ];

        // Create mobile action sheet
        const overlay = document.createElement('div');
        overlay.className = 'mobile-action-overlay';
        overlay.onclick = () => overlay.remove();

        const sheet = document.createElement('div');
        sheet.className = 'mobile-action-sheet';
        sheet.innerHTML = `
            <div class="action-sheet-header">
                <h3>${crew.rig} - ${crew.shiftType}</h3>
                <p>${crew.paramedic || 'No Paramedic'} / ${crew.emt || 'No EMT'}</p>
            </div>
            <div class="action-sheet-actions">
                ${actions.map(a => `<button class="action-sheet-btn" onclick="event.stopPropagation()">${a.label}</button>`).join('')}
                <button class="action-sheet-btn action-sheet-cancel">Cancel</button>
            </div>
        `;

        overlay.appendChild(sheet);
        document.body.appendChild(overlay);

        // Bind actions
        const buttons = sheet.querySelectorAll('.action-sheet-btn');
        actions.forEach((a, i) => {
            buttons[i].onclick = (e) => {
                e.stopPropagation();
                overlay.remove();
                a.action();
            };
        });
        buttons[buttons.length - 1].onclick = () => overlay.remove();
    } catch (error) {
        Logger.error('[showCrewActions] Error:', error.message || error);
    }
}

/** @function editCrewShift */
function editCrewShift(crewId) {
    try {
        const crew = currentEditingSchedule?.crews?.find(c => String(c.id) === String(crewId));
        if(!crew) return;

        // Pre-fill the create crew modal for editing
        (document.getElementById('crewDate') || {value: ''}).value = crew.date;
        (document.getElementById('crewRig') || {value: ''}).value = crew.rig;
        (document.getElementById('crewShiftType') || {value: ''}).value = crew.shiftType;
        (document.getElementById('crewType') || {value: ''}).value = crew.type;
        (document.getElementById('crewParamedic') || {value: ''}).value = crew.paramedicId || '';
        (document.getElementById('crewEMT') || {value: ''}).value = crew.emtId || '';

        // Mark as editing
        document.getElementById('crewModalTitle').textContent = 'Edit Shift';
        document.getElementById('createCrewForm').dataset.editingId = crewId;

        showModal('createCrewModal');
    } catch (error) {
        Logger.error('[editCrewShift] Error:', error.message || error);
    }
}

/** @function swapCrewStaff */
function swapCrewStaff(crewId) {
    try {
        const crew = currentEditingSchedule?.crews?.find(c => String(c.id) === String(crewId));
        if(!crew) return;

        // Open modal pre-filled but allow changing staff
        (document.getElementById('crewDate') || {value: ''}).value = crew.date;
        (document.getElementById('crewRig') || {value: ''}).value = crew.rig;
        (document.getElementById('crewShiftType') || {value: ''}).value = crew.shiftType;
        (document.getElementById('crewType') || {value: ''}).value = crew.type;

        document.getElementById('crewModalTitle').textContent = 'Swap Staff';
        document.getElementById('createCrewForm').dataset.editingId = crewId;

        // Populate dropdowns safely using DOM construction
        if(typeof showCreateCrewModal === 'function') {
            const paramedicSelect = document.getElementById('crewParamedic');
            const emtSelect = document.getElementById('crewEMT');
            const paramedics = users.filter(u => u.role === USER_ROLES.PARAMEDIC);
            const emts = users.filter(u => u.role === USER_ROLES.EMT);

            if (paramedicSelect) {
                paramedicSelect.innerHTML = '';
                const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Select Paramedic';
                paramedicSelect.appendChild(ph);
                paramedics.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.fullName || p.username;
                    if (String(p.id) === String(crew.paramedicId)) opt.selected = true;
                    paramedicSelect.appendChild(opt);
                });
            }
            if (emtSelect) {
                emtSelect.innerHTML = '';
                const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Select EMT';
                emtSelect.appendChild(ph);
                emts.forEach(e => {
                    const opt = document.createElement('option');
                    opt.value = e.id;
                    opt.textContent = e.fullName || e.username;
                    if (String(e.id) === String(crew.emtId)) opt.selected = true;
                    emtSelect.appendChild(opt);
                });
            }
        }

        showModal('createCrewModal');
    } catch (error) {
        Logger.error('[swapCrewStaff] Error:', error.message || error);
    }
}

// Super Dashboard - highest level access
/** @function showSuperDashboard */
function showSuperDashboard() {
    try {
        showDashboard('super');
        const dashboard = document.getElementById('dashboardContent');
        dashboard.innerHTML = `
            <div class="super-dashboard">
                <h2>👑 Super Admin Dashboard</h2>
                <p>Full system access and oversight</p>

                <div class="dashboard-stats">
                    <div class="stat-card">
                        <h3>Total Users</h3>
                        <p id="superTotalUsers">0</p>
                    </div>
                    <div class="stat-card">
                        <h3>Active Schedules</h3>
                        <p id="superActiveSchedules">0</p>
                    </div>
                    <div class="stat-card">
                        <h3>Total Crews</h3>
                        <p id="superTotalCrews">0</p>
                    </div>
                    <div class="stat-card">
                        <h3>System Status</h3>
                        <p id="superSystemStatus">✓ Online</p>
                    </div>
                </div>

                <div class="admin-actions">
                    <button onclick="showCreateUserModal()">+ Add User</button>
                    <button onclick="viewAllUsers()">View All Users</button>
                    <button onclick="showSystemLogs()">System Logs</button>
                    <button onclick="showAuditTrail()">Audit Trail</button>
                </div>

                <div class="super-controls">
                    <h3>System Controls</h3>
                    <button onclick="backupAllData()">Backup Data</button>
                    <button onclick="exportAllReports()">Export Reports</button>
                    <button onclick="systemMaintenance()">Maintenance Mode</button>
                </div>
            </div>
        `;
        updateSuperStats();
    } catch (error) {
        Logger.error('[showSuperDashboard] Error:', error.message || error);
    }
}

// safeJSONParse is defined in helper-functions.js

// saveCrew and deleteCrew are defined in drag-drop-scheduler.js (the schedule editor versions)

// Update super dashboard stats
/** @function updateSuperStats */
function updateSuperStats() {
    try {
        const users = safeJSONParse(localStorage.getItem('users'), []);
        const schedules = safeJSONParse(localStorage.getItem('schedules'), []);
        const crews = safeJSONParse(localStorage.getItem('crews'), []);

        const totalUsers = document.getElementById('superTotalUsers');
        const activeSchedules = document.getElementById('superActiveSchedules');
        const totalCrews = document.getElementById('superTotalCrews');

        if(totalUsers) totalUsers.textContent = users.length;
        if(activeSchedules) activeSchedules.textContent = schedules.length;
        if(totalCrews) totalCrews.textContent = crews.length;
    } catch (error) {
        Logger.error('[updateSuperStats] Error:', error.message || error);
    }
}
