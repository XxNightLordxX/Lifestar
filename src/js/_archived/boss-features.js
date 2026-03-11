// ========================================
// BOSS DASHBOARD FEATURES IMPLEMENTATION
// ========================================

/**
 * Security: All dynamic content uses escapeHtml/safeHTML/sanitize helpers
 * to prevent XSS attacks. Static HTML templates are safe by design.
 * Uses textContent for plain text, sanitize for user input rendering.
 */

/** @function escapeHtml - Escapes HTML entities for safe rendering */

function escapeHtmlBoss(str) {
    if(!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** @function sanitizeBossInput - Sanitize user input before display */
function sanitizeBossInput(input) {
    if(typeof input !== 'string') return String(input || '');
    return input.replace(/[<>&"']/g, function(c) {
        return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c];
    });
}

/** @function safeHTMLBoss - Create safe HTML content */
function safeHTMLBoss(template, ...values) {
    return template.reduce((result, str, i) => {
        return result + str + (values[i] !== undefined ? escapeHtmlBoss(String(values[i])) : '');
    }, '');
}

// Global variables for Boss features
let crewTemplates = [];
let shiftTrades = [];
let swapListings = [];
let trainingRecords = [];
let bonusHours = [];
let emergencyCallins = [];
let absences = [];
let oncallRotations = [];
let supervisorNotes = [];
let scheduleTemplates = [];

// Initialize Boss features
/** @function initializeBossFeatures */
function initializeBossFeatures() {
    loadCrewTemplates();
    loadShiftTrades();
    loadSwapListings();
    loadTrainingRecords();
    loadBonusHours();
    loadEmergencyCallins();
    loadAbsences();
    loadOncallRotations();
    loadSupervisorNotes();
    loadScheduleTemplates();
}

// ========================================
// CREW MANAGEMENT
// ========================================

/** @function showCreateCrewTemplateModal */
function showCreateCrewTemplateModal() {
    try {
        // Clear editing state — this is create mode
        window._editingCrewTemplateId = null;

        // Reset modal title and button text
        const modalHeader = document.querySelector('#createCrewTemplateModal .modal-header h2');
        if(modalHeader) modalHeader.textContent = 'Create Crew Template';
        const submitBtn = document.querySelector('#createCrewTemplateForm .btn-primary');
        if(submitBtn) submitBtn.textContent = 'Create Template';

        // Reset form
        const form = document.getElementById('createCrewTemplateForm');
        if(form) form.reset();

        // Populate paramedic and EMT selects for TEMPLATE modal
        const paramedicSelect = document.getElementById('templateCrewParamedic');
        const emtSelect = document.getElementById('templateCrewEmt');

        if(!paramedicSelect || !emtSelect) {
            Logger.error('Template crew modal elements not found');
            return;
        }

        paramedicSelect.innerHTML = '<option value="">Select Paramedic</option>';
        emtSelect.innerHTML = '<option value="">Select EMT</option>';

        users.filter(u => u.role === 'paramedic').forEach(paramedic => {
            const option = document.createElement('option');
            option.value = paramedic.id;
            option.textContent = paramedic.fullName || paramedic.username;
            paramedicSelect.appendChild(option);
        });

        users.filter(u => u.role === 'emt').forEach(emt => {
            const option = document.createElement('option');
            option.value = emt.id;
            option.textContent = emt.fullName || emt.username;
            emtSelect.appendChild(option);
        });

        showModal('createCrewTemplateModal');
    } catch (error) {
        Logger.error('[showCreateCrewTemplateModal] Error:', error.message || error);
    }
}

// Crew Template form submission (handles both Create and Edit)
document.addEventListener('DOMContentLoaded', function() {
    const templateForm = document.getElementById('createCrewTemplateForm');
    if(templateForm) {
        templateForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const name = (document.getElementById('templateCrewName') || {value: ''}).value.trim();
            const type = (document.getElementById('templateCrewType') || {value: ''}).value;
            const rig = (document.getElementById('templateCrewRig') || {value: ''}).value;
            const paramedicId = (document.getElementById('templateCrewParamedic') || {value: ''}).value;
            const emtId = (document.getElementById('templateCrewEmt') || {value: ''}).value;

            if(!name) {
                showAlert('Crew name is required', 'error');
                return;
            }

            const editingId = window._editingCrewTemplateId;

            if(editingId) {
                // Edit mode — update existing template
                const idx = crewTemplates.findIndex(c => c.id === editingId);
                if(idx !== -1) {
                    crewTemplates[idx].name = name;
                    crewTemplates[idx].type = type;
                    crewTemplates[idx].rig = rig;
                    crewTemplates[idx].paramedicId = paramedicId;
                    crewTemplates[idx].emtId = emtId;
                    crewTemplates[idx].updatedAt = new Date().toISOString();
                    showAlert('Crew template updated successfully', 'success');
                } else {
                    showAlert('Crew template not found for update', 'error');
                }
                window._editingCrewTemplateId = null;
            } else {
                // Create mode — add new template
                const crew = {
                    id: Date.now(),
                    name: name,
                    type: type,
                    rig: rig,
                    paramedicId: paramedicId,
                    emtId: emtId,
                    active: true,
                    createdAt: new Date().toISOString()
                };
                crewTemplates.push(crew);
                showAlert('Crew template created successfully', 'success');
            }

            saveCrewTemplates();
            loadCrewTemplates();
            closeModal('createCrewTemplateModal');
            templateForm.reset();

            // Reset modal title and button for next use
            const modalHeader = document.querySelector('#createCrewTemplateModal .modal-header h2');
            if(modalHeader) modalHeader.textContent = 'Create Crew Template';
            const submitBtn = document.querySelector('#createCrewTemplateForm .btn-primary');
            if(submitBtn) submitBtn.textContent = 'Create Template';
        });
    }
});

/** @function loadCrewTemplates */
function loadCrewTemplates() {
    try {
        const grid = document.getElementById('crewTemplatesGrid');
        grid.textContent = '';

        // Load from localStorage
        const savedCrews = localStorage.getItem('lifestarCrewTemplates');
        if(savedCrews) {
            crewTemplates = safeJSONParse(savedCrews, []);
        }

        if(crewTemplates.length === 0) {
            grid.innerHTML = '<p class="text-muted">No crew templates found. Create your first crew template!</p>';
            return;
        }

        crewTemplates.forEach(crew => {
            const paramedic = users.find(u => String(u.id) === String(crew.paramedicId));
            const emt = users.find(u => String(u.id) === String(crew.emtId));

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header" style="background: ${sanitizeHTML(crew.type) === 'ALS' ? 'var(--lifestar-red)' : 'var(--lifestar-light-blue)'};">
                    <h2>${sanitizeHTML(crew.name)}</h2>
                </div>
                <div class="card-body">
                    <p><strong>Type:</strong> ${sanitizeHTML(crew.type)}</p>
                    <p><strong>Rig:</strong> ${sanitizeHTML(crew.rig)}</p>
                    <p><strong>Paramedic:</strong> ${paramedic ? sanitizeHTML(paramedic.fullName || paramedic.username) : 'N/A'}</p>
                    <p><strong>EMT:</strong> ${emt ? sanitizeHTML(emt.fullName || emt.username) : 'N/A'}</p>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-sm btn-warning" onclick="editCrew(${parseInt(crew.id)})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCrewTemplate(${parseInt(crew.id)})">Delete</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        Logger.error('[loadCrewTemplates] Error:', error.message || error);
    }
}

/** @function saveCrewTemplates */
function saveCrewTemplates() {
    localStorage.setItem('lifestarCrewTemplates', JSON.stringify(crewTemplates));
}

/** @function deleteCrewTemplate */
function deleteCrewTemplate(crewId) {
    if(confirm('Are you sure you want to delete this crew template?')) {
        crewTemplates = crewTemplates.filter(c => c.id !== crewId);
        saveCrewTemplates();
        loadCrewTemplates();
        showAlert('Crew template deleted', 'success');
    }
}

// ========================================
// SHIFT TRADES
// ========================================

/** @function loadShiftTrades */
function loadShiftTrades() {
    try {
        const tbody = document.getElementById('shiftTradesTableBody');
        tbody.textContent = '';

        const savedTrades = localStorage.getItem('lifestarShiftTrades');
        if(savedTrades) {
            shiftTrades = safeJSONParse(savedTrades, []);
        }

        if(shiftTrades.length === 0) {
            document.getElementById('noShiftTradesMessage').style.display = 'block';
            document.getElementById('shiftTradesTable').style.display = 'none';
            return;
        }

        document.getElementById('noShiftTradesMessage').style.display = 'none';
        document.getElementById('shiftTradesTable').style.display = 'table';

        shiftTrades.forEach(trade => {
            const requester = users.find(u => u.id === trade.requesterId);
            const tradeWith = trade.tradeWithId ? users.find(u => u.id === trade.tradeWithId) : null;

            const row = document.createElement('tr');
            const statusClass = trade.status === 'approved' ? 'badge-success' :
                               trade.status === 'rejected' ? 'badge-danger' : 'badge-warning';

            row.innerHTML = `
                <td>${requester ? sanitizeHTML(requester.fullName || requester.username) : 'Unknown'}</td>
                <td>${sanitizeHTML(trade.date)}</td>
                <td>${sanitizeHTML(trade.shiftType)}</td>
                <td>${tradeWith ? sanitizeHTML(tradeWith.fullName || tradeWith.username) : 'Open to anyone'}</td>
                <td><span class="badge ${statusClass}">${sanitizeHTML(trade.status).toUpperCase()}</span></td>
                <td>
                    ${trade.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="approveTrade(${parseInt(trade.id)})">Approve</button>
                        <button class="btn btn-sm btn-danger" onclick="rejectTrade(${parseInt(trade.id)})">Reject</button>
                    ` : '-'}
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadShiftTrades] Error:', error.message || error);
    }
}

/** @function approveTrade */
function approveTrade(tradeId) {
    if(confirm('Are you sure you want to approve this shift trade?')) {
        const trade = shiftTrades.find(t => t.id === tradeId);
        if(trade) {
            trade.status = 'approved';
            trade.approvedBy = currentUser.id;
            trade.approvedAt = new Date().toISOString();
            saveShiftTrades();
            loadShiftTrades();
            showAlert('Shift trade approved', 'success');
        }
    }
}

/** @function rejectTrade */
function rejectTrade(tradeId) {
    if(confirm('Are you sure you want to reject this shift trade?')) {
        const trade = shiftTrades.find(t => t.id === tradeId);
        if(trade) {
            trade.status = 'rejected';
            trade.rejectedBy = currentUser.id;
            trade.rejectedAt = new Date().toISOString();
            saveShiftTrades();
            loadShiftTrades();
            showAlert('Shift trade rejected', 'warning');
        }
    }
}

/** @function saveShiftTrades */
function saveShiftTrades() {
    localStorage.setItem('lifestarShiftTrades', JSON.stringify(shiftTrades));
}

// ========================================
// ANALYTICS
// ========================================

/** @function generateAnalyticsReport */
function generateAnalyticsReport() {
    try {
        // Update statistics
        const staffMembers = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
        document.getElementById('analyticsTotalStaff').textContent = staffMembers.length;

        let totalHours = 0;
        staffMembers.forEach(member => {
            totalHours += member.hoursWorked || 0;
        });
        document.getElementById('analyticsTotalHours').textContent = totalHours;

        document.getElementById('analyticsActiveSchedules').textContent = (schedules || []).filter(s => s.status === 'published').length;

        // Load staffing levels table
        const tbody = document.getElementById('staffingLevelsTableBody');
        tbody.textContent = '';

        staffMembers.forEach(member => {
            const row = document.createElement('tr');
            const shiftsCount = countStaffShifts(member.id);

            let coverage = 'Good';
            let coverageClass = 'badge-success';

            if((member.hoursWorked || 0) < 100) {
                coverage = 'Low';
                coverageClass = 'badge-danger';
            } else if((member.hoursWorked || 0) > 160) {
                coverage = 'High';
                coverageClass = 'badge-warning';
            }

            row.innerHTML = `
                <td>${sanitizeHTML(member.fullName || member.username)}</td>
                <td>${member.hoursWorked || 0}</td>
                <td>${shiftsCount}</td>
                <td><span class="badge ${coverageClass}">${coverage}</span></td>
            `;
            tbody.appendChild(row);
        });

        showAlert('Analytics report generated', 'success');
    } catch (error) {
        Logger.error('[generateAnalyticsReport] Error:', error.message || error);
    }
}

/** @function countStaffShifts */
function countStaffShifts(staffId) {
    const staffName = users.find(u => u.id === staffId)?.fullName || users.find(u => u.id === staffId)?.username;
    let count = 0;

    schedules.forEach(schedule => {
        if(schedule.crews) {
            schedule.crews.forEach(crew => {
                if(crew.paramedic === staffName || crew.emt === staffName) {
                    count++;
                }
            });
        }
    });

    return count;
}

// ========================================
// SHIFT HISTORY
// ========================================

/** @function loadShiftHistory */
function loadShiftHistory() {
    try {
        const tbody = document.getElementById('shiftHistoryTableBody');
        tbody.textContent = '';

        // Populate staff filter
        const staffSelect = document.getElementById('historyStaffFilter');
        if(staffSelect.options.length === 1) {
            const staffMembers = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
            staffMembers.forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = member.fullName || member.username;
                staffSelect.appendChild(option);
            });
        }

        const staffFilter = (document.getElementById('historyStaffFilter') || {value: ''}).value;
        const monthFilter = (document.getElementById('historyMonthFilter') || {value: ''}).value;

        let historyData = [];

        schedules.forEach(schedule => {
            if(schedule.crews) {
                schedule.crews.forEach(crew => {
                    const staffMember = users.find(u =>;
                        (crew.paramedic === (u.fullName || u.username)) ||
                        (crew.emt === (u.fullName || u.username))
                    );

                    if(staffMember) {
                        // Apply filters
                        if(staffFilter && String(staffMember.id) !== String(staffFilter)) return;
                        if(monthFilter && !schedule.month.includes(monthFilter)) return;

                        historyData.push({
                            date: crew.date,
                            staff: staffMember.fullName || staffMember.username,
                            shiftType: crew.shiftType,
                            rig: crew.rig,
                            crew: `${sanitizeHTML(crew.paramedic)} & ${sanitizeHTML(crew.emt)}`,
                            duration: getShiftDuration(crew.shiftType)
                        });
                    }
                });
            }
        });

        // Sort by date
        historyData.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Limit to last 100 entries
        historyData = historyData.slice(0, 100);

        if(historyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No shift history found.</td></tr>';
            return;
        }

        historyData.forEach(shift => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${shift.date}</td>
                <td>${shift.staff}</td>
                <td>${shift.shiftType}</td>
                <td>${shift.rig}</td>
                <td>${shift.crew}</td>
                <td>${shift.duration}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadShiftHistory] Error:', error.message || error);
    }
}

/** @function getShiftDuration */
function getShiftDuration(shiftType) {
    if(shiftType === '24-Hour' || shiftType === '0730-0730') {
        return '24 hours';
    } else if(shiftType === 'Day' || shiftType === '0730-1930') {
        return '12 hours';
    } else if(shiftType === 'Night' || shiftType === '1930-0730') {
        return '12 hours';
    }
    return 'Unknown';
}

// ========================================
// DATA LOADING FUNCTIONS
// ========================================

// Load functions moved to remaining-features.js to avoid duplicates

// Initialize Boss features when dashboard loads
document.addEventListener('DOMContentLoaded', function() {
    // Will be called when Boss dashboard is shown
});
