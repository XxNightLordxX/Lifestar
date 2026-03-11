// ============================================
// MECHANICS IMPROVEMENTS IMPLEMENTATION
// ============================================

// ============================================
// UNDO/REDO SYSTEM
// ============================================

let undoStack = [];
let redoStack = [];
const MAX_STACK_SIZE = 50;

/** @function undo */
function undo() {
    if(undoStack.length === 0) {
        showAlert('Nothing to undo', 'info');
        return;
    }

    const action = undoStack.pop();
    redoStack.push(action);

    performUndo(action);
    showAlert('Undo successful', 'success');
    addSystemLog(`Undo performed: ${action.action}`);
}

/** @function redo */
function redo() {
    if(redoStack.length === 0) {
        showAlert('Nothing to redo', 'info');
        return;
    }

    const action = redoStack.pop();
    undoStack.push(action);

    performRedo(action);
    showAlert('Redo successful', 'success');
    addSystemLog(`Redo performed: ${action.action}`);
}

/** @function performUndo */
function performUndo(action) {
    switch(action.action) {
        case 'createSchedule':
            undoCreateSchedule(action.data);
            break;
        case 'deleteSchedule':
            undoDeleteSchedule(action.data);
            break;
        case 'createCrew':
            undoCreateCrew(action.data);
            break;
        case 'deleteCrew':
            undoDeleteCrew(action.data);
            break;
        case 'updateUser':
            undoUpdateUser(action.data);
            break;
        case 'deleteUser':
            undoDeleteUser(action.data);
            break;
        default:
            // Unknown undo action - silently ignore
    }
}

/** @function performRedo */
function performRedo(action) {
    switch(action.action) {
        case 'createSchedule':
            redoCreateSchedule(action.data);
            break;
        case 'deleteSchedule':
            redoDeleteSchedule(action.data);
            break;
        case 'createCrew':
            redoCreateCrew(action.data);
            break;
        case 'deleteCrew':
            redoDeleteCrew(action.data);
            break;
        case 'updateUser':
            redoUpdateUser(action.data);
            break;
        case 'deleteUser':
            redoDeleteUser(action.data);
            break;
        default:
            // Unknown redo action - silently ignore
    }
}

// Undo/Redo implementations
/** @function undoCreateSchedule */
function undoCreateSchedule(data) {
    const index = schedules.findIndex(s => s.id === data.id);
    if(index > -1) {
        schedules.splice(index, 1);
        saveSchedules();
        loadDraftSchedules();
        updateSidebarBadges();
    }
}

/** @function undoDeleteSchedule */
function undoDeleteSchedule(data) {
    schedules.push(data.schedule);
    saveSchedules();
    loadDraftSchedules();
    updateSidebarBadges();
}

/** @function undoCreateCrew */
function undoCreateCrew(data) {
    if(currentEditingSchedule && currentEditingSchedule.crews) {
        const index = currentEditingSchedule.crews.findIndex(c => c.id === data.id);
        if(index > -1) {
            currentEditingSchedule.crews.splice(index, 1);
            saveSchedules();
            generateEditorCalendar();
            updateScheduleStats();
        }
    }
}

/** @function undoDeleteCrew */
function undoDeleteCrew(data) {
    if(currentEditingSchedule) {
        if(!currentEditingSchedule.crews) {
            currentEditingSchedule.crews = [];
        }
        currentEditingSchedule.crews.push(data.crew);
        saveSchedules();
        generateEditorCalendar();
        updateScheduleStats();
    }
}

/** @function undoUpdateUser */
function undoUpdateUser(data) {
    const user = users.find(u => u.id === data.id);
    if(user) {
        Object.assign(user, data.oldData);
        saveUsers();
        loadUsersTable();
    }
}

/** @function undoDeleteUser */
function undoDeleteUser(data) {
    users.push(data.user);
    saveUsers();
    loadUsersTable();
}

/** @function redoCreateSchedule */
function redoCreateSchedule(data) {
    schedules.push(data.schedule);
    saveSchedules();
    loadDraftSchedules();
    updateSidebarBadges();
}

/** @function redoDeleteSchedule */
function redoDeleteSchedule(data) {
    const index = schedules.findIndex(s => s.id === data.id);
    if(index > -1) {
        schedules.splice(index, 1);
        saveSchedules();
        loadDraftSchedules();
        updateSidebarBadges();
    }
}

/** @function redoCreateCrew */
function redoCreateCrew(data) {
    if(currentEditingSchedule) {
        if(!currentEditingSchedule.crews) {
            currentEditingSchedule.crews = [];
        }
        currentEditingSchedule.crews.push(data.crew);
        saveSchedules();
        generateEditorCalendar();
        updateScheduleStats();
    }
}

/** @function redoDeleteCrew */
function redoDeleteCrew(data) {
    if(currentEditingSchedule && currentEditingSchedule.crews) {
        const index = currentEditingSchedule.crews.findIndex(c => c.id === data.id);
        if(index > -1) {
            currentEditingSchedule.crews.splice(index, 1);
            saveSchedules();
            generateEditorCalendar();
            updateScheduleStats();
        }
    }
}

/** @function redoUpdateUser */
function redoUpdateUser(data) {
    const user = users.find(u => u.id === data.id);
    if(user) {
        Object.assign(user, data.newData);
        saveUsers();
        loadUsersTable();
    }
}

/** @function redoDeleteUser */
function redoDeleteUser(data) {
    const index = users.findIndex(u => u.id === data.user.id);
    if(index > -1) {
        users.splice(index, 1);
        saveUsers();
        loadUsersTable();
    }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

let keyboardShortcutsEnabled = false;

/** @function enableKeyboardShortcuts */
function enableKeyboardShortcuts() {
    keyboardShortcutsEnabled = true;
    document.addEventListener('keydown', handleKeyboardShortcuts);
    addSystemLog('Keyboard shortcuts enabled');
}

/** @function disableKeyboardShortcuts */
function disableKeyboardShortcuts() {
    keyboardShortcutsEnabled = false;
    document.removeEventListener('keydown', handleKeyboardShortcuts);
    addSystemLog('Keyboard shortcuts disabled');
}

/** @function handleKeyboardShortcuts */
function handleKeyboardShortcuts(e) {
    // Check if typing in input field
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }

    // Ctrl+Z - Undo
    if(e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if(featureStates.undoRedo) {
            undo();
        }
    }

    // Ctrl+Y or Ctrl+Shift+Z - Redo
    if((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        if(featureStates.undoRedo) {
            redo();
        }
    }

    // Ctrl+S - Save
    if(e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if(currentEditingSchedule) {
            saveScheduleChanges();
        } else {
            saveData();
            showAlert('Changes saved', 'success');
        }
    }

    // Ctrl+N - New schedule
    if(e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if(currentUser && (currentUser.role === 'boss' || currentUser.role === 'super')) {
            showCreateScheduleModal();
        }
    }

    // Ctrl+F - Search
    if(e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        showGlobalSearch();
    }

    // Escape - Close modal
    if(e.key === 'Escape') {
        closeAllModals();
    }

    // F5 - Refresh (prevent default reload)
    if(e.key === 'F5') {
        e.preventDefault();
        refreshCurrentView();
    }
}

/** @function refreshCurrentView */
function refreshCurrentView() {
    if(currentUser) {
        switch(currentUser.role) {
            case 'boss':
                loadBossDashboard();
                break;
            case 'paramedic':
                loadParamedicDashboard();
                break;
            case 'emt':
                loadEmtDashboard();
                break;
            case 'super':
                loadSuperAdminDashboard();
                break;
        }
    }
    showAlert('View refreshed', 'info');
}

// ============================================
// AUTO SAVE
// ============================================

let autoSaveInterval = null;
let autoSaveEnabled = false;

/** @function enableAutoSave */
function enableAutoSave(interval = 30000) { // Default 30 seconds
    autoSaveEnabled = true;
    autoSaveInterval = setInterval(() => {
        autoSaveData();
    }, interval);
    addSystemLog(`Auto save enabled (${interval/1000}s interval)`);
}

/** @function disableAutoSave */
function disableAutoSave() {
    autoSaveEnabled = false;
    if(autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    addSystemLog('Auto save disabled');
}

/** @function autoSaveData */
function autoSaveData() {
    if(autoSaveEnabled) {
        saveData();
        // Don't show alert for auto-save to avoid annoyance
        // Auto-saved silently
    }
}

// ============================================
// OVERTIME ALERTS
// ============================================

/** @function checkOvertimeAlerts */
function checkOvertimeAlerts() {
    if(!featureStates.overtimeAlerts) return;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    users.forEach(user => {
        if(user.role !== 'super' && user.role !== 'boss') {
            // Calculate hours across ALL schedules for the current month
            let monthHours = 0;

            schedules.forEach(schedule => {
                if(schedule.crews) {
                    schedule.crews.forEach(crew => {
                        const crewDate = new Date(crew.date);
                        if(crewDate.getMonth() === currentMonth && crewDate.getFullYear() === currentYear) {
                            if(String(crew.paramedicId) === String(user.id) || String(crew.emtId) === String(user.id)) {
                                monthHours += (crew.hours || 12);
                            }
                        }
                    });
                }
            });

            // Check for overtime (160 hours threshold per month)
            if(monthHours > 160) {
                const overtimeHours = monthHours - 160;
                createNotification(user.id, 'Overtime Alert',
                    'You have worked ' + overtimeHours + ' overtime hours this month across all schedules!', 'warning');
                addSystemLog('Overtime alert for ' + user.username + ': ' + overtimeHours + ' hours');
            }
        }
    });
}

// ============================================
// CERTIFICATION ALERTS
// ============================================

/** @function checkCertificationAlerts */
function checkCertificationAlerts() {
    if(!featureStates.certificationAlerts) return;

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    if(trainingRecords) {
        trainingRecords.forEach(record => {
            if(record.expiryDate) {
                const expiryDate = new Date(record.expiryDate);

                // Check if expiring within 30 days
                if(expiryDate <= thirtyDaysFromNow) {
                    const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

                    record.assignedStaff.forEach(staffId => {
                        const user = users.find(u => String(u.id) === String(staffId));
                        if(user) {
                            createNotification(staffId, 'Certification Expiring',
                                `${record.name} expires in ${daysUntilExpiry} days!`, 'warning');
                        }
                    });

                    addSystemLog(`Certification expiring: ${record.name} in ${daysUntilExpiry} days`);
                }
            }
        });
    }
}

// ============================================
// RIGHT-CLICK CONTEXT MENU
// ============================================

let contextMenuTarget = null;

// ============================================
// MULTI-SELECT FUNCTIONALITY
// ============================================

let selectedItems = [];
let multiSelectMode = false;

/** @function deselectAll */
function deselectAll() {
    try {
        selectedItems = [];
        document.querySelectorAll('.selected').forEach(el => {
            el.classList.remove('selected');
        });
        updateSelectionUI();
    } catch (error) {
        Logger.error('[deselectAll] Error:', error.message || error);
    }
}

// ============================================
// GLOBAL SEARCH
// ============================================

/** @function showGlobalSearch */
function showGlobalSearch() {
    try {
        showModal('globalSearchModal');
        const searchInput = document.getElementById('globalSearchInput');
        if(searchInput) searchInput.focus();
    } catch (error) {
        Logger.error('[showGlobalSearch] Error:', error.message || error);
    }
}

/** @function performGlobalSearch */
function performGlobalSearch(query) {
    if(!query || query.length < 2) return;

    query = query.toLowerCase();
    const results = [];

    // Search users
    users.forEach(user => {
        if(user.fullName.toLowerCase().includes(query) ||
            user.username.toLowerCase().includes(query) ||
            user.phone?.includes(query)) {
            results.push({
                type: 'User',
                name: user.fullName,
                role: user.role,
                id: user.id
            });
        }
    });

    // Search schedules
    schedules.forEach(schedule => {
        if(schedule.name.toLowerCase().includes(query) ||
            schedule.description?.toLowerCase().includes(query)) {
            results.push({
                type: 'Schedule',
                name: schedule.name,
                status: schedule.status,
                id: schedule.id
            });
        }
    });

    // Search time-off requests
    timeOffRequests?.forEach(request => {
        const user = users.find(u => String(u.id) === String(request.staffId));
        if(user && user.fullName.toLowerCase().includes(query)) {
            results.push({
                type: 'Time-Off Request',
                name: `${sanitizeHTML(user.fullName)} - ${request.startDate} to ${request.endDate}`,
                status: request.status,
                id: request.id
            });
        }
    });

    displaySearchResults(results);
}

/** @function displaySearchResults */
function displaySearchResults(results) {
    try {
        const container = document.getElementById('searchResultsContainer');
        container.textContent = '';

        if(results.length === 0) {
            container.innerHTML = '<p class="text-muted">No results found</p>';
            return;
        }

        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="result-type">${result.type}</div>
                <div class="result-name">${result.name}</div>
                <div class="result-meta">${result.role || result.status || ''}</div>
            `;
            item.onclick = () => handleSearchResultClick(result);
            container.appendChild(item);
        });
    } catch (error) {
        Logger.error('[displaySearchResults] Error:', error.message || error);
    }
}

/** @function handleSearchResultClick */
function handleSearchResultClick(result) {
    closeModal('globalSearchModal');

    switch(result.type) {
        case 'User':
            viewEmployeeDetails(result.id);
            break;
        case 'Schedule':
            openScheduleEditor(result.id);
            break;
        case 'Time-Off Request':
            if(currentUser.role === 'boss' || currentUser.role === 'super') {
                showBossSection('timeoff');
            }
            break;
    }
}

// ============================================
// QUICK ACTIONS PANEL
// ============================================

/** @function performQuickAction */
function performQuickAction(action) {
    try {
        switch(action) {
            case 'createSchedule':
                showCreateScheduleModal();
                break;
            case 'viewMySchedule':
                if(currentUser.role === 'paramedic' || currentUser.role === 'emt') {
                    showParamedicSection('schedule');
                }
                break;
            case 'requestTimeOff':
                showModal('submitTimeOffModal');
                break;
            case 'viewStaff':
                if(currentUser.role === 'boss' || currentUser.role === 'super') {
                    showBossSection('staff');
                }
                break;
            case 'viewNotifications':
                if(currentUser.role !== 'super') {
                    document.getElementById('notificationCenter').classList.remove('hidden');
                }
                break;
            case 'openAI':
                document.getElementById('aiAssistantPanel').classList.remove('hidden');
                break;
            default:

        }
    } catch (error) {
        Logger.error('[performQuickAction] Error:', error.message || error);
    }
}

// ============================================
// TOOL TIPS AND HELP
// ============================================

let activeTooltip = null;

// ============================================
// BULK OPERATIONS
// ============================================

// ============================================
// DATA VALIDATION
// ============================================

// ============================================
// PERFORMANCE OPTIMIZATIONS
// ============================================

// debounce() removed - use PerformanceOptimizer.debounce() instead

// throttle() removed - use PerformanceOptimizer.throttle() instead

// lazyLoadList() removed - never called, use PerformanceOptimizer.lazyLoad() instead

// ============================================
// ACCESSIBILITY IMPROVEMENTS
// ============================================

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize feature states from storage
    loadFeatureStates();

    // Initialize mechanics based on feature toggles
    if(featureStates.keyboardShortcuts) {
        enableKeyboardShortcuts();
    }

    if(featureStates.autoSave) {
        enableAutoSave();
    }

    // Add event listeners for mechanics
    document.addEventListener('click', (e) => {
        // Handle context menu clicks
        if(e.target.closest('.context-menu')) {
            return;
        }
    });

    // Initialize keyboard shortcuts for modals
    document.addEventListener('keydown', (e) => {
        if(e.key === 'Escape') {
            closeAllModals();
        }
    });

    // Mechanics improvements initialized
});

// closeAllModals is defined in bug-fixes.js (more complete version)
