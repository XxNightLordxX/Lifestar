// ============================================
// MISSING FUNCTIONS PATCH & SAFETY UTILITIES
// These functions are called throughout the app
// but were not included in the loaded scripts
// ============================================

/**
 * Save only the users array to localStorage
 */
function saveUsers() {
    try {
        localStorage.setItem('lifestarUsers', JSON.stringify(users));
    } catch (error) {
        Logger.error('Error saving users:', error);
    }
}

/**
 * Save only the schedules array to localStorage
 */
function saveSchedules() {
    try {
        localStorage.setItem('lifestarSchedules', JSON.stringify(schedules));
    } catch (error) {
        Logger.error('Error saving schedules:', error);
    }
}

/**
 * Filter the employee list in the schedule editor by role
 */
function filterEmployeeList() {
    try {
        const filter = document.getElementById('staffFilter')?.value || 'all';
        const employees = document.querySelectorAll('.employee-card');

        employees.forEach(card => {
            const role = card.dataset.employeeRole;
            if(filter === 'all') {
                card.style.display = '';
            } else if(filter === role) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    } catch (error) {
        Logger.error('[filterEmployeeList] Error:', error.message || error);
    }
}

/**
 * Edit a crew template (called from boss-features.js)
 * Opens the create crew template modal pre-populated with existing data
 */
function editCrew(crewId) {
    try {
        if(typeof crewTemplates === 'undefined' || !Array.isArray(crewTemplates)) {
            showAlert('Crew templates not loaded', 'error');
            return;
        }
        const crew = crewTemplates.find(function(c) { return c.id === crewId; });
        if(!crew) {
            showAlert('Crew template not found', 'error');
            return;
        }

        // Set editing flag
        window._editingCrewTemplateId = crewId;

        // Reset form first
        const form = document.getElementById('createCrewTemplateForm');
        if(form) form.reset();

        // Populate paramedic and EMT dropdowns (same logic as showCreateCrewTemplateModal)
        const paramedicEl = document.getElementById('templateCrewParamedic');
        const emtEl = document.getElementById('templateCrewEmt');
        if(paramedicEl) {
            paramedicEl.innerHTML = '<option value="">Select Paramedic</option>';
            if(typeof users !== 'undefined') {
                users.filter(function(u) { return u.role === 'paramedic'; }).forEach(function(p) {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.fullName || p.username;
                    paramedicEl.appendChild(opt);
                });
            }
        }
        if(emtEl) {
            emtEl.innerHTML = '<option value="">Select EMT</option>';
            if(typeof users !== 'undefined') {
                users.filter(function(u) { return u.role === 'emt'; }).forEach(function(e) {
                    const opt = document.createElement('option');
                    opt.value = e.id;
                    opt.textContent = e.fullName || e.username;
                    emtEl.appendChild(opt);
                });
            }
        }

        // Populate form fields with existing crew data
        const nameEl = document.getElementById('templateCrewName');
        const typeEl = document.getElementById('templateCrewType');
        const rigEl = document.getElementById('templateCrewRig');

        if(nameEl) nameEl.value = crew.name || '';
        if(typeEl) typeEl.value = crew.type || 'ALS';
        if(rigEl) rigEl.value = crew.rig || '';
        if(paramedicEl) paramedicEl.value = crew.paramedicId || '';
        if(emtEl) emtEl.value = crew.emtId || '';

        // Update modal title and button text
        const modalHeader = document.querySelector('#createCrewTemplateModal .modal-header h2');
        if(modalHeader) modalHeader.textContent = 'Edit Crew Template';
        const submitBtn = document.querySelector('#createCrewTemplateForm .btn-primary');
        if(submitBtn) submitBtn.textContent = 'Save Changes';

        showModal('createCrewTemplateModal');
    } catch (error) {
        Logger.error('[editCrew] Error:', error.message || error);
        showAlert('Error opening crew editor', 'error');
    }
}

/**
 * View swap listing details (called from remaining-features.js)
 */
function viewSwapDetails(listingId) {
    if(typeof swapListings === 'undefined') return;
    const listing = swapListings.find(l => l.id === listingId);
    if(!listing) {
        showAlert('Swap listing not found', 'error');
        return;
    }

    const user = users.find(u => u.id === listing.requesterId);
    const userName = user ? user.fullName : 'Unknown';

    showAlert(
        `Swap Details:\n` +
        `Staff: ${userName}\n` +
        `Date: ${listing.date || 'N/A'}\n` +
        `Shift: ${listing.shiftType || 'N/A'}\n` +
        `Reason: ${listing.reason || 'No reason provided'}`,
        'info'
    );
}

/**
 * Create a notification for a user (called from mechanics-improvements.js)
 */
function createNotification(userId, title, message, type) {
    type = type || 'info';

    // Load existing notifications
    let notifs = [];
    const saved = localStorage.getItem('lifestarNotifications');
    if(saved) {
        try { notifs = JSON.parse(saved); } catch(e) { notifs = []; }
    }

    const notification = {
        id: Date.now() + Math.random(),
        userId: userId,
        title: title,
        message: message,
        type: type,
        read: false,
        createdAt: new Date().toISOString()
    };

    notifs.push(notification);

    try {
        localStorage.setItem('lifestarNotifications', JSON.stringify(notifs));
    } catch (e) {
        Logger.error('Error saving notification:', e);
    }
}

/**
 * View employee details (called from mechanics-improvements.js context menu)
 */
function viewEmployeeDetails(elementOrId) {
    let userId;

    if(typeof elementOrId === 'object' && elementOrId !== null) {
        userId = elementOrId.dataset?.employeeId || elementOrId.dataset?.userId;
    } else {
        userId = elementOrId;
    }

    if(!userId) {
        showAlert('Employee not found', 'error');
        return;
    }

    const user = users.find(u => String(u.id) === String(userId));
    if(!user) {
        showAlert('Employee not found', 'error');
        return;
    }

    showAlert(
        `Employee Details:\n` +
        `Name: ${user.fullName}\n` +
        `Role: ${user.role}\n` +
        `Username: ${user.username}\n` +
        `Status: ${user.status || 'Active'}`,
        'info'
    );
}

/**
 * View employee schedule (called from mechanics-improvements.js context menu)
 */
function viewEmployeeSchedule(elementOrId) {
    let userId;

    if(typeof elementOrId === 'object' && elementOrId !== null) {
        userId = elementOrId.dataset?.employeeId || elementOrId.dataset?.userId;
    } else {
        userId = elementOrId;
    }

    if(!userId) {
        showAlert('Employee not found', 'error');
        return;
    }

    // Try to use the existing viewStaffSchedule function
    if(typeof viewStaffSchedule === 'function') {
        viewStaffSchedule(userId);
    } else {
        const user = users.find(u => String(u.id) === String(userId));
        const name = user ? user.fullName : 'Unknown';

        // Count shifts for this employee
        let shiftCount = 0;
        let totalHours = 0;
        schedules.forEach(s => {
            if(s.crews) {
                s.crews.forEach(c => {
                    if(String(c.paramedicId) === String(userId) || String(c.emtId) === String(userId)) {
                        shiftCount++;
                        totalHours += (c.hours || 12);
                    }
                });
            }
        });

        showAlert(
            `Schedule for ${name}:\n` +
            `Total Shifts: ${shiftCount}\n` +
            `Total Hours: ${totalHours}`,
            'info'
        );
    }
}

/**
 * Navigate calendar to today's date
 */
function goToToday() {
    try {
        if (typeof loadCalendar === 'function') {
            // Reset to current month/year and reload
            const now = new Date();
            if (typeof window.calendarMonth !== 'undefined') window.calendarMonth = now.getMonth();
            if (typeof window.calendarYear !== 'undefined') window.calendarYear = now.getFullYear();
            loadCalendar();
        }
    } catch (error) {
        Logger.error('[goToToday] Error:', error.message || error);
    }
}

/**
 * Show modal for recording a new emergency call-in
 */
function showNewCallinModal() {
    try {
        if (typeof showRecordCallinModal === 'function') {
            showRecordCallinModal();
        } else if (typeof showModal === 'function') {
            showModal('New Emergency Call-in', `
                <form onsubmit="event.preventDefault(); recordCallin();">
                    <div class="form-group">
                        <label>Employee</label>
                        <select class="form-select" id="callinEmployee" required>
                            <option value="">Select Employee</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" class="form-input" id="callinDate" value="${new Date().toISOString().split('T')[0]}" required>
                    </div>
                    <div class="form-group">
                        <label>Reason</label>
                        <textarea class="form-input" id="callinReason" rows="3" placeholder="Reason for call-in..." required></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px;">Record Call-in</button>
                </form>
            `);
        }
    } catch (error) {
        Logger.error('[showNewCallinModal] Error:', error.message || error);
    }
}
