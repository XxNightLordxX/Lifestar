
// Lifestar Ambulance Scheduling System - Main JavaScript
// Version 2.0.0 - Revamped with Sidebar Navigation

// ========================================
// GLOBAL VARIABLES
// ========================================

let currentUser = null;
let schedules = [];
let users = [];
let systemLogs = [];
let editingUserId = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
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

        // Load data FIRST before checking session
        loadData();

        // Check for existing session
        const savedUser = localStorage.getItem('lifestarCurrentUser');
        if(savedUser) {
            currentUser = safeJSONParse(savedUser, null);
            if(currentUser) {
                showDashboard();
            }
        }
    } catch (error) {
        Logger.error('[initializeSystem] Error:', error.message || error);
    }
}

/** @function setupEventListeners */
function setupEventListeners() {
    try {
        // Login form - with null checks to prevent crashes
        const loginForm = document.getElementById('loginForm');
        if(loginForm) loginForm.addEventListener('submit', handleLogin);

        const firstLoginForm = document.getElementById('firstLoginForm');
        if(firstLoginForm) firstLoginForm.addEventListener('submit', handleFirstLogin);

        const createScheduleForm = document.getElementById('createScheduleForm');
        if(createScheduleForm) createScheduleForm.addEventListener('submit', handleCreateSchedule);

        const addUserForm = document.getElementById('addUserForm');
        if(addUserForm) addUserForm.addEventListener('submit', handleAddUser);
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

/** @function generateCSRFToken */
function generateCSRFToken(sessionId) {
    return csrfProtection.generateToken(sessionId);
}

/** @function validateCSRFToken */
function validateCSRFToken(token, sessionId) {
    return csrfProtection.validateToken(token, sessionId);
}

/** @function handleLogin */
async function handleLogin(e) {
    try {
        e.preventDefault();
        const username = (document.getElementById('username') || {value: ''}).value.trim();
        const password = (document.getElementById('password') || {value: ''}).value;

        if(!username || !password) {
            showAlert('Please enter both username and password', 'warning', 'loginAlert');
            return;
        }

        // Find user by username
        const user = users.find(u => u.username === username);

        if(user) {
            // Check password - supports both hashed and plain text (migration)
            let passwordMatch = false;
            if(typeof PasswordHasher !== 'undefined' && PasswordHasher.isHashed(user.password)) {
                passwordMatch = await PasswordHasher.verifyPassword(password, user.password);
            } else {
                // Legacy plain text comparison + auto-migrate to hashed
                passwordMatch = (user.password === password);
                if(passwordMatch && typeof PasswordHasher !== 'undefined') {
                    // Auto-migrate: hash the password for future logins
                    try {
                        user.password = await PasswordHasher.hashPassword(password);
                        saveData();
                        Logger.info('[handleLogin] Password migrated to hash for:', username);
                    } catch (hashErr) {
                        Logger.warn('[handleLogin] Could not migrate password:', hashErr);
                    }
                }
            }

            if(passwordMatch) {
                currentUser = user;
                localStorage.setItem('lifestarCurrentUser', JSON.stringify(user));
                addSystemLog('User logged in: ' + user.username);
                showDashboard();
            } else {
                showAlert('Invalid username or password', 'danger', 'loginAlert');
            }
        } else {
            showAlert('Invalid username or password', 'danger', 'loginAlert');
        }
    } catch (error) {
        Logger.error('[handleLogin] Error:', error.message || error);
        showAlert('Login error. Please try again.', 'danger', 'loginAlert');
    }
}

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
        if(currentUser.role === 'super') {
            const dashboard = document.getElementById('superDashboard');
            dashboard.classList.add('active');
            dashboard.style.display = 'flex';
            document.getElementById('superUserName').textContent = currentUser.fullName || currentUser.username;
            loadSuperAdminDashboard();
        } else if(currentUser.role === 'boss') {
            const dashboard = document.getElementById('bossDashboard');
            dashboard.classList.add('active');
            dashboard.style.display = 'flex';
            document.getElementById('bossUserName').textContent = currentUser.fullName || currentUser.username;
            loadBossDashboard();
        } else if(currentUser.role === USER_ROLES.PARAMEDIC) {
            const dashboard = document.getElementById('paramedicDashboard');
            dashboard.classList.add('active');
            dashboard.style.display = 'flex';
            document.getElementById('paramedicUserName').textContent = currentUser.fullName || currentUser.username;
            loadParamedicDashboard();
        } else if(currentUser.role === USER_ROLES.EMT) {
            const dashboard = document.getElementById('emtDashboard');
            dashboard.classList.add('active');
            dashboard.style.display = 'flex';
            document.getElementById('emtUserName').textContent = currentUser.fullName || currentUser.username;
            loadEmtDashboard();
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
        document.getElementById('totalUsersCount').textContent = users.length;
        document.getElementById('totalSchedulesCount').textContent = schedules.length;
        document.getElementById('lastSystemUpdate').textContent = new Date().toLocaleString();
    } catch (error) {
        Logger.error('[updateOverviewStats] Error:', error.message || error);
    }
}

/** @function loadUsersTable */
function loadUsersTable() {
    try {
        const tbody = document.getElementById('usersTableBody');
        tbody.textContent = '';

        users.forEach(user => {
            const locName = '—';
            if (user.locationId && typeof MultiLocation !== 'undefined') {
                const loc = MultiLocation.getLocationById(user.locationId);
                if (loc) locName = loc.code;
            }
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sanitizeHTML(user.username)}</td>
                <td>${sanitizeHTML(user.fullName || 'N/A')}</td>
                <td><span class="badge badge-${sanitizeHTML(user.role)}">${sanitizeHTML(user.role.toUpperCase())}</span></td>
                <td>${sanitizeHTML(user.phone || 'N/A')}</td>
                <td>${sanitizeHTML(locName)}</td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="editUser(${parseInt(user.id)})">Edit</button>
                    ${user.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${parseInt(user.id)})">Delete</button>` : ''}
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadUsersTable] Error:', error.message || error);
    }
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
            (document.getElementById('newUserPassword') || {value: ''}).value = user.password;
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
            showModal('addUserModal');
        }
    } catch (error) {
        Logger.error('[editUser] Error:', error.message || error);
    }
}

/** @function deleteUser */
function deleteUser(userId) {
    if(confirm('Are you sure you want to delete this user?')) {
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
        const draftCount = (schedules || []).filter(s => s.status === 'draft').length;
        const publishedCount = (schedules || []).filter(s => s.status === 'published').length;
        const archivedCount = (schedules || []).filter(s => s.status === 'archived').length;

        document.getElementById('draftsBadge').textContent = draftCount;
        document.getElementById('publishedBadge').textContent = publishedCount;
        document.getElementById('archivedBadge').textContent = archivedCount;
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
        card.className = `schedule-item ${schedule.status}`;
        card.innerHTML = `
            <div class="schedule-header">
                <div class="schedule-title">${sanitizeHTML(schedule.name)}</div>
                <div class="schedule-status ${sanitizeHTML(schedule.status)}">${sanitizeHTML(schedule.status)}</div>
            </div>
            <div class="schedule-info">
                <div class="schedule-info-item">
                    <span class="schedule-info-item-icon">📅</span>
                    ${sanitizeHTML(schedule.month)} ${sanitizeHTML(String(schedule.year))}
                </div>
                <div class="schedule-info-item">
                    <span class="schedule-info-item-icon">👥</span>
                    ${parseInt(schedule.crews?.length) || 0} crews
                </div>
                <div class="schedule-info-item">
                    <span class="schedule-info-item-icon">🕐</span>
                    ${parseInt(schedule.totalHours) || 0} hours
                </div>
            </div>
            <div class="schedule-actions">
                <button class="btn btn-sm btn-primary" onclick="viewSchedule(${parseInt(schedule.id)})">View</button>
                <button class="btn btn-sm btn-warning" onclick="editSchedule(${parseInt(schedule.id)})">Edit</button>
                ${schedule.status === 'draft' ? `<button class="btn btn-sm btn-success" onclick="publishSchedule(${parseInt(schedule.id)})">Publish</button>` : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${parseInt(schedule.id)})">Delete</button>
            </div>
        `;
        return card;
    } catch (error) {
        Logger.error('[createScheduleCard] Error:', error.message || error);
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

/** @function viewSchedule */
function viewSchedule(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if(schedule) {
        openScheduleEditor(scheduleId);
    }
}

/** @function editSchedule */
function editSchedule(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if(schedule) {
        openScheduleEditor(scheduleId);
    }
}

/** @function publishSchedule */
function publishSchedule(scheduleId) {
    if(confirm('Are you sure you want to publish this schedule? Once published, it cannot be edited.')) {
        const schedule = schedules.find(s => s.id === scheduleId);
        if(schedule) {
            schedule.status = 'published';
            schedule.publishedAt = new Date().toISOString();
            saveData();
            loadDraftSchedules();
            updateSidebarBadges();
            showAlert('Schedule published successfully', 'success');
            addSystemLog('Schedule published: ' + schedule.name);
        }
    }
}

/** @function deleteSchedule */
function deleteSchedule(scheduleId) {
    if(confirm('Are you sure you want to delete this schedule?')) {
        const scheduleIndex = schedules.findIndex(s => s.id === scheduleId);
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
        const container = document.getElementById('toastContainer');
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
function confirmResetSystem() {
    try {
        if(confirm('Are you ABSOLUTELY SURE you want to reset the entire system?')) {
            if(confirm('This will delete ALL data including users, schedules, and logs. This action cannot be undone!')) {
                localStorage.clear();
                showAlert('System reset. Please refresh the page.', 'warning');
                setTimeout(() => {
                    location.reload();
                }, 2000);
            }
        }
    } catch (error) {
        Logger.error('[confirmResetSystem] Error:', error.message || error);
    }
}

/** @function sendAiMessage */
function sendAiMessage() {
    try {
        const input = document.getElementById('aiInput');
        const message = input.value.trim();

        if(!message) return;

        const chatContainer = document.getElementById('aiChatContainer');

        // Add user message
        const userMessage = document.createElement('div');
        userMessage.style.padding = '10px';
        userMessage.style.background = '#e3f2fd';
        userMessage.style.borderRadius = '8px';
        userMessage.style.marginBottom = '10px';
        userMessage.style.marginLeft = '40px';
        userMessage.textContent = 'You: ' + message;
        chatContainer.appendChild(userMessage);

        // Add AI response (basic mode)
        const aiMessage = document.createElement('div');
        aiMessage.style.padding = '10px';
        aiMessage.style.background = '#f5f5f5';
        aiMessage.style.borderRadius = '8px';
        aiMessage.style.marginBottom = '10px';
        aiMessage.style.marginRight = '40px';
        aiMessage.textContent = 'AI: ' + generateBasicAIResponse(message);
        chatContainer.appendChild(aiMessage);

        // Clear input
        input.value = '';

        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        Logger.error('[sendAiMessage] Error:', error.message || error);
    }
}

/** @function generateBasicAIResponse */
function generateBasicAIResponse(message) {
    const lowerMessage = message.toLowerCase();

    if(lowerMessage.includes('schedule')) {
        return 'You currently have ' + schedules.length + ' schedule(s) in the system. ' +
               (schedules || []).filter(s => s.status === 'draft').length + ' draft(s) and ' +
               (schedules || []).filter(s => s.status === 'published').length + ' published.';
    }

    if(lowerMessage.includes('user')) {
        return 'There are ' + users.length + ' user(s) in the system.';
    }

    if(lowerMessage.includes('help')) {
        return 'I can help you with scheduling, user management, and system operations. Try asking about schedules, users, or how to perform specific tasks.';
    }

    return 'I understand you\'re asking about "' + message + '". For advanced AI capabilities, please configure a Groq API key in the API Keys section.';
}

// ========================================
// SAMPLE DATA LOADING
// ========================================

/** @function loadSampleData */
function loadSampleData() {
    // Check if data already exists
    if(users.length === 0) {
        // Create default users
        users = [
            { id: 1, username: 'super', password: 'super123', fullName: 'Super Administrator', role: 'super', phone: '555-0001', hoursWorked: 0, bonusHours: 0, createdAt: new Date().toISOString() },
            { id: 2, username: 'boss', password: 'boss123', fullName: 'Station Manager', role: 'boss', phone: '555-0002', hoursWorked: 0, bonusHours: 0, createdAt: new Date().toISOString() },
            { id: 3, username: 'paramedic1', password: '***REMOVED***', fullName: 'Sarah Medic', role: USER_ROLES.PARAMEDIC, phone: '555-0003', hoursWorked: 0, bonusHours: 0, createdAt: new Date().toISOString() },
            { id: 4, username: 'paramedic2'password: '***REMOVED***'3', fullName: 'Mike Medic', role: USER_ROLES.PARAMEDIC, phone: '555-0004', hoursWorked: 0, bonusHours: 0, createdAt: new Date().toISOString() },
            { id: 5, usernapassword: '***REMOVED***'*': 'emt123', fullName: 'Tom EMT', role: USER_ROLES.EMT, phone: '555-0005', hoursWorked: 0, bonusHours: 0, createdAt: new Date().toISOString() },
            { id: 6, usernapassword: '***REMOVED***'*': 'emt123', fullName: 'Lisa EMT', role: USER_ROLES.EMT, phone: '555-0006', hoursWorked: 0, bonusHours: 0, createdAt: new Date().toISOString() }
        ];

        saveData();
    }

    // Create sample schedules if none exist
    if(schedules.length === 0) {
        // Create a draft schedule
        schedules.push({
            id: Date.now(),
            name: 'January 2025 - Draft',
            month: 'January',
            year: '2025',
            description: 'Draft schedule for January 2025 - still being finalized',
            status: 'draft',
            crews: [],
            totalHours: 0,
            createdAt: new Date().toISOString(),
            createdBy: 2
        });

        // Create a published schedule
        schedules.push({
            id: Date.now() + 1,
            name: 'December 2024 - Published',
            month: 'December',
            year: '2024',
            description: 'Final schedule for December 2024 - all shifts assigned',
            status: 'published',
            crews: [
                { id: 1, rig: '3F16', paramedic: 'Sarah Medic', emt: 'Tom EMT', shiftType: '24-Hour', date: '2024-12-01' },
                { id: 2, rig: '3F17', paramedic: 'Mike Medic', emt: 'Lisa EMT', shiftType: '24-Hour', date: '2024-12-01' },
                { id: 3, rig: '3F18', paramedic: 'Sarah Medic', emt: 'Lisa EMT', shiftType: 'Day', date: '2024-12-02' },
                { id: 4, rig: '3F23', paramedic: 'Mike Medic', emt: 'Tom EMT', shiftType: 'Night', date: '2024-12-02' }
            ],
            totalHours: 720,
            publishedAt: new Date().toISOString(),
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

        // Populate schedule select if empty
        if(scheduleSelect.options.length === 1) {
            const publishedSchedules = (schedules || []).filter(s => s.status === 'published');
            publishedSchedules.forEach(schedule => {
                const option = document.createElement('option');
                option.value = schedule.id;
                option.textContent = schedule.name;
                scheduleSelect.appendChild(option);
            });
        }

        // Get selected schedule
        const scheduleId = scheduleSelect.value;
        selectedScheduleForCalendar = schedules.find(s => String(s.id) === String(scheduleId));

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
        staffGrid.textContent = '';

        const staff = users.filter(u => u.role === USER_ROLES.PARAMEDIC || u.role === USER_ROLES.EMT);

        if(staff.length === 0) {
            staffGrid.innerHTML = '<p class="text-muted">No staff members found.</p>';
            return;
        }

        staff.forEach(member => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header" style="background: ${member.role === USER_ROLES.PARAMEDIC ? 'var(--lifestar-red)' : 'var(--lifestar-light-blue)'};">
                    <h2>${sanitizeHTML(member.fullName || member.username)}</h2>
                </div>
                <div class="card-body">
                    <p><strong>Role:</strong> <span class="badge badge-${sanitizeHTML(member.role)}">${sanitizeHTML(member.role.toUpperCase())}</span></p>
                    <p><strong>Phone:</strong> ${sanitizeHTML(member.phone || 'N/A')}</p>
                    <p><strong>Hours Worked:</strong> ${parseInt(member.hoursWorked) || 0}</p>
                    <p><strong>Bonus Hours:</strong> ${parseInt(member.bonusHours) || 0}</p>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-sm btn-primary" onclick="viewStaffSchedule(${parseInt(member.id)})">View Schedule</button>
                        <button class="btn btn-sm btn-info" onclick="viewStaffDetails(${parseInt(member.id)})">Details</button>
                    </div>
                </div>
            `;
            staffGrid.appendChild(card);
        });
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
            const name = card.querySelector('.card-header h2').textContent.toLowerCase();
            const role = card.querySelector('.badge').textContent.toLowerCase();

            const matchesSearch = name.includes(searchTerm);
            const matchesRole = roleFilter === '' || role.includes(roleFilter.toLowerCase());

            card.style.display = matchesSearch && matchesRole ? 'block' : 'none';
        });
    } catch (error) {
        Logger.error('[filterStaff] Error:', error.message || error);
    }
}

/** @function viewStaffSchedule */
function viewStaffSchedule(staffId) {
    const staff = users.find(u => u.id === staffId);
    if(staff) {
        showAlert(`Viewing schedule for ${staff.fullName || staff.username}`, 'info');
        // In a full implementation, this would show the staff member's schedule
    }
}

/** @function viewStaffDetails */
function viewStaffDetails(staffId) {
    try {
        const staff = users.find(u => u.id === staffId);
        if(staff) {
            const details = `
                <strong>${sanitizeHTML(staff.fullName || staff.username)}</strong><br>
                Role: ${sanitizeHTML(staff.role.toUpperCase())}<br>
                Phone: ${sanitizeHTML(staff.phone || 'N/A')}<br>
                Hours Worked: ${parseInt(staff.hoursWorked) || 0}<br>
                Bonus Hours: ${parseInt(staff.bonusHours) || 0}
            `;
            document.getElementById('alertModalTitle').textContent = 'Staff Details';
            document.getElementById('alertModalMessage').textContent = details;
            showModal('alertModal');
        }
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

        timeoffRequests.forEach(request => {
            const row = document.createElement('tr');
            const staff = users.find(u => u.id === request.staffId);
            const statusClass = request.status === 'approved' ? 'badge-success' :
                               request.status === 'rejected' ? 'badge-danger' : 'badge-warning';

            row.innerHTML = `
                <td>${sanitizeHTML(staff ? (staff.fullName || staff.username) : 'Unknown')}</td>
                <td>${sanitizeHTML(request.startDate)} to ${sanitizeHTML(request.endDate)}</td>
                <td>${sanitizeHTML(request.reason)}</td>
                <td><span class="badge ${statusClass}">${sanitizeHTML(request.status.toUpperCase())}</span></td>
                <td>
                    ${request.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="approveTimeoff(${parseInt(request.id)})">Approve</button>
                        <button class="btn btn-sm btn-danger" onclick="rejectTimeoff(${parseInt(request.id)})">Reject</button>
                    ` : '-'}
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadTimeoffRequests] Error:', error.message || error);
    }
}

/** @function approveTimeoff */
function approveTimeoff(requestId) {
    if(confirm('Are you sure you want to approve this time-off request?')) {
        const request = timeoffRequests.find(r => r.id === requestId);
        if(request) {
            request.status = 'approved';
            request.approvedBy = currentUser.id;
            request.approvedAt = new Date().toISOString();
            saveTimeoffRequests();
            loadTimeoffRequests();
            showAlert('Time-off request approved', 'success');
            addSystemLog('Time-off request approved for staff ID: ' + request.staffId);
        }
    }
}

/** @function rejectTimeoff */
function rejectTimeoff(requestId) {
    const reason = prompt('Please enter a reason for rejection:');
    if(reason) {
        const request = timeoffRequests.find(r => r.id === requestId);
        if(request) {
            request.status = 'rejected';
            request.rejectedBy = currentUser.id;
            request.rejectedAt = new Date().toISOString();
            request.rejectionReason = reason;
            saveTimeoffRequests();
            loadTimeoffRequests();
            showAlert('Time-off request rejected', 'warning');
            addSystemLog('Time-off request rejected for staff ID: ' + request.staffId);
        }
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

        // Get all published schedules and find user's shifts
        const publishedSchedules = (schedules || []).filter(s => s.status === 'published');
        let myShifts = [];

        publishedSchedules.forEach(schedule => {
            if(schedule.crews) {
                schedule.crews.forEach(crew => {
                    if(crew.paramedic === (currentUser.fullName || currentUser.username) ||
                        crew.emt === (currentUser.fullName || currentUser.username)) {
                        myShifts.push({
                            scheduleName: schedule.name,
                            date: crew.date,
                            shiftType: crew.shiftType,
                            rig: crew.rig,
                            partner: crew.paramedic === (currentUser.fullName || currentUser.username) ? crew.emt : crew.paramedic,
                            type: crew.type || crew.shiftType || 'Shift'
                        });
                    }
                });
            }
        });

        // Show/hide empty message
        document.getElementById('noMyScheduleMessage').style.display = myShifts.length > 0 ? 'none' : 'block';

        // Sort shifts by date
        myShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Render shifts
        myShifts.forEach(shift => {
            const shiftCard = document.createElement('div');
            shiftCard.className = 'schedule-item';
            shiftCard.innerHTML = `
                <div class="schedule-header">
                    <div class="schedule-title">${shift.scheduleName}</div>
                    <div class="schedule-status published">${shift.type}</div>
                </div>
                <div class="schedule-info">
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">📅</span>
                        ${shift.date}
                    </div>
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">🕐</span>
                        ${shift.shiftType}
                    </div>
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">🚑</span>
                        ${shift.rig}
                    </div>
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">👥</span>
                        Partner: ${shift.partner}
                    </div>
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

        // Get all published schedules and find user's shifts
        const publishedSchedules = (schedules || []).filter(s => s.status === 'published');
        let myShifts = [];

        publishedSchedules.forEach(schedule => {
            if(schedule.crews) {
                schedule.crews.forEach(crew => {
                    if(crew.paramedic === (currentUser.fullName || currentUser.username) ||
                        crew.emt === (currentUser.fullName || currentUser.username)) {
                        myShifts.push({
                            scheduleName: schedule.name,
                            date: crew.date,
                            shiftType: crew.shiftType,
                            rig: crew.rig,
                            partner: crew.paramedic === (currentUser.fullName || currentUser.username) ? crew.emt : crew.paramedic,
                            type: crew.type || crew.shiftType || 'Shift'
                        });
                    }
                });
            }
        });

        // Show/hide empty message
        document.getElementById('emtNoMyScheduleMessage').style.display = myShifts.length > 0 ? 'none' : 'block';

        // Sort shifts by date
        myShifts.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Render shifts
        myShifts.forEach(shift => {
            const shiftCard = document.createElement('div');
            shiftCard.className = 'schedule-item';
            shiftCard.innerHTML = `
                <div class="schedule-header">
                    <div class="schedule-title">${shift.scheduleName}</div>
                    <div class="schedule-status published">${shift.type}</div>
                </div>
                <div class="schedule-info">
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">📅</span>
                        ${shift.date}
                    </div>
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">🕐</span>
                        ${shift.shiftType}
                    </div>
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">🚑</span>
                        ${shift.rig}
                    </div>
                    <div class="schedule-info-item">
                        <span class="schedule-info-item-icon">👥</span>
                        Partner: ${shift.partner}
                    </div>
                </div>
            `;
            scheduleList.appendChild(shiftCard);
        });
    } catch (error) {
        Logger.error('[loadEmtMySchedule] Error:', error.message || error);
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

        const startDate = (document.getElementById(startDateId) || {value: ''}).value;
        const endDate = (document.getElementById(endDateId) || {value: ''}).value;
        const reason = (document.getElementById(reasonId) || {value: ''}).value;

        // Validate dates
        if(new Date(startDate) > new Date(endDate)) {
            showAlert('End date must be after start date', 'danger');
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

        // Add to requests
        timeoffRequests.push(request);
        saveTimeoffRequests();

        // Clear form
        (document.getElementById(startDateId) || {value: ''}).value = '';
        (document.getElementById(endDateId) || {value: ''}).value = '';
        (document.getElementById(reasonId) || {value: ''}).value = '';

        showAlert('Time-off request submitted successfully', 'success');
        addSystemLog('Time-off request submitted by: ' + currentUser.username);
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

        // Populate dropdowns
        if(typeof showCreateCrewModal === 'function') {
            const paramedicSelect = document.getElementById('crewParamedic');
            const emtSelect = document.getElementById('crewEMT');
            const paramedics = users.filter(u => u.role === USER_ROLES.PARAMEDIC);
            const emts = users.filter(u => u.role === USER_ROLES.EMT);

            // Use safe HTML generation to prevent XSS
            paramedicSelect.textContent = safeCreateOptions(
                paramedics.map(p => ({...p, fullName: p.fullName || p.username})),
                'id',
                'fullName',
                crew.paramedicId,
                'Select Paramedic'
            );
            emtSelect.textContent = safeCreateOptions(
                emts.map(e => ({...e, fullName: e.fullName || e.username})),
                'id',
                'fullName',
                crew.emtId,
                'Select EMT'
            );
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
