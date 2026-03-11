// ========================================
// REMAINING FEATURES IMPLEMENTATION
// ========================================

// Global variables

let incidentReports = [];
let notifications = [];
let userSettings = {};
let performanceData = {};

// ========================================
// BOSS DASHBOARD - REMAINING FEATURES
// ========================================

// Swap Marketplace
function loadSwapListings() {
    try {
        const grid = document.getElementById('swapMarketplaceGrid');
        grid.textContent = '';

        const saved = localStorage.getItem('lifestarSwapListings');
        if(saved) swapListings = safeJSONParse(saved, []);

        if(swapListings.length === 0) {
            document.getElementById('noSwapListingsMessage').style.display = 'block';
            grid.style.display = 'none';
            return;
        }

        document.getElementById('noSwapListingsMessage').style.display = 'none';
        grid.style.display = 'grid';

        swapListings.forEach(listing => {
            const requester = users.find(u => u.id === listing.requesterId);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header" style="background: ${listing.urgent ? 'var(--danger-color)' : 'var(--lifestar-blue)'};">
                    <h2>${listing.urgent ? '🚨 URGENT' : '📅'} ${listing.date}</h2>
                </div>
                <div class="card-body">
                    <p><strong>Staff:</strong> ${requester ? sanitizeHTML(requester.fullName || requester.username) : 'Unknown'}</p>
                    <p><strong>Shift:</strong> ${sanitizeHTML(listing.shiftType)}</p>
                    <p><strong>Type:</strong> ${sanitizeHTML(listing.swapType)}</p>
                    <p><strong>Reason:</strong> ${sanitizeHTML(listing.reason)}</p>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-sm btn-primary" onclick="acceptSwap(${listing.id})">Accept</button>
                        <button class="btn btn-sm btn-warning" onclick="viewSwapDetails(${listing.id})">Details</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        Logger.error('[loadSwapListings] Error:', error.message || error);
    }
}

function acceptSwap(listingId) {
    try {
        const listing = swapListings.find(l => l.id === listingId);
        if(listing && confirm(`Accept swap from ${listing.requesterId}?`)) {
            // Create shift trade request
            const trade = {
                id: Date.now(),
                requesterId: listing.requesterId,
                date: listing.date,
                shiftType: listing.shiftType,
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            shiftTrades.push(trade);
            saveShiftTrades();

            // Remove listing
            swapListings = swapListings.filter(l => l.id !== listingId);
            localStorage.setItem('lifestarSwapListings', JSON.stringify(swapListings));

            loadSwapListings();
            loadShiftTrades();
            showAlert('Swap accepted and trade created', 'success');
        }
    } catch (error) {
        Logger.error('[acceptSwap] Error:', error.message || error);
    }
}

// Training Module
function loadTrainingRecords() {
    try {
        const tbody = document.getElementById('trainingTableBody');
        tbody.textContent = '';

        const saved = localStorage.getItem('lifestarTrainingRecords');
        if(saved) trainingRecords = safeJSONParse(saved, []);

        if(trainingRecords.length === 0) {
            document.getElementById('noTrainingMessage').style.display = 'block';
            document.getElementById('trainingTable').style.display = 'none';
            return;
        }

        document.getElementById('noTrainingMessage').style.display = 'none';
        document.getElementById('trainingTable').style.display = 'table';

        trainingRecords.forEach(record => {
            const staff = users.find(u => u.id === record.staffId);
            const row = document.createElement('tr');

            let statusClass = 'badge-warning';
            if(record.status === 'completed') statusClass = 'badge-success';
            if(record.status === 'cancelled') statusClass = 'badge-danger';

            row.innerHTML = `
                <td>${record.name}</td>
                <td>${record.type}</td>
                <td>${sanitizeHTML(staff ? (staff.fullName || staff.username) : 'Unknown')}</td>
                <td>${record.date}</td>
                <td><span class="badge ${statusClass}">${record.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="editTraining(${record.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTraining(${record.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadTrainingRecords] Error:', error.message || error);
    }
}

function showAddTrainingModal() {
    showModal('addTrainingModal');
}

function editTraining(trainingId) {
    showAlert('Edit training functionality - Training ID: ' + trainingId, 'info');
}

function deleteTraining(trainingId) {
    try {
        if(confirm('Delete this training record?')) {
            trainingRecords = trainingRecords.filter(t => t.id !== trainingId);
            localStorage.setItem('lifestarTrainingRecords', JSON.stringify(trainingRecords));
            loadTrainingRecords();
            showAlert('Training deleted', 'success');
        }
    } catch (error) {
        Logger.error('[deleteTraining] Error:', error.message || error);
    }
}

// Bonus Hours
function loadBonusHours() {
    try {
        const tbody = document.getElementById('bonusHoursTableBody');
        tbody.textContent = '';

        const saved = localStorage.getItem('lifestarBonusHours');
        if(saved) bonusHours = safeJSONParse(saved, []);

        // Show summary
        const summary = document.getElementById('bonusHoursSummary');
        summary.textContent = '';

        const staffMembers = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
        staffMembers.forEach(member => {
            const totalBonus = bonusHours.filter(b => b.staffId === member.id).reduce((sum, b) => sum + (b.hours || 0), 0);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header" style="background: var(--warning-color);">
                    <h2>${sanitizeHTML(member.fullName || member.username)}</h2>
                </div>
                <div class="card-body">
                    <h3>${totalBonus} hours</h3>
                </div>
            `;
            summary.appendChild(card);
        });

        // Show table
        bonusHours.forEach(bonus => {
            const staff = users.find(u => u.id === bonus.staffId);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sanitizeHTML(staff ? (staff.fullName || staff.username) : 'Unknown')}</td>
                <td>${sanitizeHTML(bonus.reason)}</td>
                <td>${bonus.hours}</td>
                <td>${sanitizeHTML(bonus.date)}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteBonus(${parseInt(bonus.id)})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadBonusHours] Error:', error.message || error);
    }
}

function showAwardBonusModal() {
    showModal('awardBonusModal');
}

function deleteBonus(bonusId) {
    try {
        if(confirm('Delete this bonus record?')) {
            bonusHours = bonusHours.filter(b => b.id !== bonusId);
            localStorage.setItem('lifestarBonusHours', JSON.stringify(bonusHours));
            loadBonusHours();
            showAlert('Bonus deleted', 'success');
        }
    } catch (error) {
        Logger.error('[deleteBonus] Error:', error.message || error);
    }
}

// Emergency Call-ins
function loadEmergencyCallins() {
    try {
        const tbody = document.getElementById('callinsTableBody');
        tbody.textContent = '';

        const saved = localStorage.getItem('lifestarEmergencyCallins');
        if(saved) emergencyCallins = safeJSONParse(saved, []);

        emergencyCallins.forEach(callin => {
            const staff = users.find(u => u.id === callin.staffId);
            const replacement = callin.replacementId ? users.find(u => u.id === callin.replacementId) : null;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sanitizeHTML(staff ? (staff.fullName || staff.username) : 'Unknown')}</td>
                <td>${sanitizeHTML(callin.date)}</td>
                <td>${sanitizeHTML(callin.reason)}</td>
                <td>${replacement ? sanitizeHTML(replacement.fullName || replacement.username) : 'Not assigned'}</td>
                <td>${callin.replacementId ? 'Covered' : 'Pending'}</td>
                <td>
                    ${!callin.replacementId ? `<button class="btn btn-sm btn-primary" onclick="assignReplacement(${parseInt(callin.id)})">Assign</button>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deleteCallin(${parseInt(callin.id)})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadEmergencyCallins] Error:', error.message || error);
    }
}

function showRecordCallinModal() {
    showModal('recordCallinModal');
}

function assignReplacement(callinId) {
    const callin = emergencyCallins.find(c => c.id === callinId);
    if(callin) {
        alert('Assign replacement functionality - In full implementation, this would show a staff selector');
    }
}

function deleteCallin(callinId) {
    try {
        if(confirm('Delete this call-in record?')) {
            emergencyCallins = emergencyCallins.filter(c => c.id !== callinId);
            localStorage.setItem('lifestarEmergencyCallins', JSON.stringify(emergencyCallins));
            loadEmergencyCallins();
            showAlert('Call-in deleted', 'success');
        }
    } catch (error) {
        Logger.error('[deleteCallin] Error:', error.message || error);
    }
}

// Absences
function loadAbsences() {
    try {
        const tbody = document.getElementById('absencesTableBody');
        tbody.textContent = '';

        const saved = localStorage.getItem('lifestarAbsences');
        if(saved) absences = safeJSONParse(saved, []);

        absences.forEach(absence => {
            const staff = users.find(u => u.id === absence.staffId);
            const replacement = absence.replacementId ? users.find(u => u.id === absence.replacementId) : null;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sanitizeHTML(staff ? (staff.fullName || staff.username) : 'Unknown')}</td>
                <td>${sanitizeHTML(absence.date)}</td>
                <td>${sanitizeHTML(absence.type)}</td>
                <td>${sanitizeHTML(absence.reason)}</td>
                <td>${replacement ? sanitizeHTML(replacement.fullName || replacement.username) : 'N/A'}</td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="editAbsence(${parseInt(absence.id)})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAbsence(${parseInt(absence.id)})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadAbsences] Error:', error.message || error);
    }
}

function showMarkAbsenceModal() {
    showModal('markAbsenceModal');
}

function editAbsence(absenceId) {
    showAlert('Edit absence functionality', 'info');
}

function deleteAbsence(absenceId) {
    try {
        if(confirm('Delete this absence record?')) {
            absences = absences.filter(a => a.id !== absenceId);
            localStorage.setItem('lifestarAbsences', JSON.stringify(absences));
            loadAbsences();
            showAlert('Absence deleted', 'success');
        }
    } catch (error) {
        Logger.error('[deleteAbsence] Error:', error.message || error);
    }
}

// On-Call Rotation
function loadOncallRotations() {
    try {
        const grid = document.getElementById('oncallRotationsGrid');
        grid.textContent = '';

        const saved = localStorage.getItem('lifestarOncallRotations');
        if(saved) oncallRotations = safeJSONParse(saved, []);

        if(oncallRotations.length === 0) {
            grid.innerHTML = '<p class="text-muted">No on-call rotations configured. Create your first rotation!</p>';
            return;
        }

        oncallRotations.forEach(rotation => {
            const members = rotation.memberIds.map(id => {
                const member = users.find(u => u.id === id);
                return member ? (member.fullName || member.username) : 'Unknown';
            }).join(', ');

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header" style="background: var(--info-color);">
                    <h2>${sanitizeHTML(rotation.name)}</h2>
                </div>
                <div class="card-body">
                    <p><strong>Type:</strong> ${sanitizeHTML(rotation.type)}</p>
                    <p><strong>Period:</strong> ${sanitizeHTML(rotation.period)} ${rotation.type === 'custom' ? 'days' : ''}</p>
                    <p><strong>Members:</strong> ${sanitizeHTML(members)}</p>
                    <p><strong>Current On-Call:</strong> ${sanitizeHTML(getCurrentOncall(rotation))}</p>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-sm btn-warning" onclick="editOncallRotation(${parseInt(rotation.id)})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteOncallRotation(${parseInt(rotation.id)})">Delete</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        Logger.error('[loadOncallRotations] Error:', error.message || error);
    }
}

function getCurrentOncall(rotation) {
    if(!rotation.memberIds || rotation.memberIds.length === 0) return 'N/A';

    const today = new Date();
    const start = new Date(rotation.startDate);
    const daysSinceStart = Math.floor((today - start) / (1000 * 60 * 60 * 24));

    let period = rotation.period;
    if(rotation.type === 'weekly') period = 7;
    if(rotation.type === 'daily') period = 1;

    const currentIndex = Math.floor(daysSinceStart / period) % rotation.memberIds.length;
    const memberId = rotation.memberIds[currentIndex];
    const member = users.find(u => u.id === memberId);

    return member ? (member.fullName || member.username) : 'Unknown';
}

function showCreateOncallRotationModal() {
    showModal('createOncallRotationModal');
}

function editOncallRotation(rotationId) {
    showAlert('Edit rotation functionality', 'info');
}

function deleteOncallRotation(rotationId) {
    try {
        if(confirm('Delete this on-call rotation?')) {
            oncallRotations = oncallRotations.filter(o => o.id !== rotationId);
            localStorage.setItem('lifestarOncallRotations', JSON.stringify(oncallRotations));
            loadOncallRotations();
            showAlert('Rotation deleted', 'success');
        }
    } catch (error) {
        Logger.error('[deleteOncallRotation] Error:', error.message || error);
    }
}

// Supervisor Notes
function loadSupervisorNotes() {
    try {
        const grid = document.getElementById('supervisorNotesGrid');
        grid.textContent = '';

        const saved = localStorage.getItem('lifestarSupervisorNotes');
        if(saved) supervisorNotes = safeJSONParse(saved, []);

        if(supervisorNotes.length === 0) {
            grid.innerHTML = '<p class="text-muted">No supervisor notes found. Add your first note!</p>';
            return;
        }

        supervisorNotes.forEach(note => {
            const staff = note.staffId ? users.find(u => u.id === note.staffId) : null;

            const card = document.createElement('div');
            card.className = 'card';
            card.style.borderLeft = `5px solid ${getPriorityColor(note.priority)}`;
            card.innerHTML = `
                <div class="card-header" style="background: var(--lifestar-gray); color: var(--dark-text);">
                    <h2>${sanitizeHTML(note.category)} - ${sanitizeHTML(note.priority)}</h2>
                </div>
                <div class="card-body">
                    <p><strong>Date:</strong> ${sanitizeHTML(note.date)}</p>
                    ${staff ? `<p><strong>Staff:</strong> ${sanitizeHTML(staff.fullName || staff.username)}</p>` : ''}
                    <p><strong>Note:</strong> ${sanitizeHTML(note.content)}</p>
                    ${note.private ? '<p class="text-muted">🔒 Private Note</p>' : ''}
                    <div style="margin-top: 15px;">
                        <button class="btn btn-sm btn-warning" onclick="editSupervisorNote(${parseInt(note.id)})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteSupervisorNote(${parseInt(note.id)})">Delete</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        Logger.error('[loadSupervisorNotes] Error:', error.message || error);
    }
}

function getPriorityColor(priority) {
    if(priority === 'High') return 'var(--danger-color)';
    if(priority === 'Medium') return 'var(--warning-color)';
    return 'var(--success-color)';
}

function showAddNoteModal() {
    showModal('addNoteModal');
}

function editSupervisorNote(noteId) {
    showAlert('Edit note functionality', 'info');
}

function deleteSupervisorNote(noteId) {
    try {
        if(confirm('Delete this supervisor note?')) {
            supervisorNotes = supervisorNotes.filter(n => n.id !== noteId);
            localStorage.setItem('lifestarSupervisorNotes', JSON.stringify(supervisorNotes));
            loadSupervisorNotes();
            showAlert('Note deleted', 'success');
        }
    } catch (error) {
        Logger.error('[deleteSupervisorNote] Error:', error.message || error);
    }
}

// Schedule Templates
function loadScheduleTemplates() {
    try {
        const grid = document.getElementById('scheduleTemplatesGrid');
        grid.textContent = '';

        const saved = localStorage.getItem('lifestarScheduleTemplates');
        if(saved) scheduleTemplates = safeJSONParse(saved, []);

        if(scheduleTemplates.length === 0) {
            document.getElementById('noTemplatesMessage').style.display = 'block';
            grid.style.display = 'none';
            return;
        }

        document.getElementById('noTemplatesMessage').style.display = 'none';
        grid.style.display = 'grid';

        scheduleTemplates.forEach(template => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header" style="background: var(--lifestar-light-blue);">
                    <h2>${sanitizeHTML(template.name)}</h2>
                </div>
                <div class="card-body">
                    <p><strong>Type:</strong> ${sanitizeHTML(template.type)}</p>
                    <p><strong>Crews:</strong> ${template.includesCrews ? 'Yes' : 'No'}</p>
                    <p><strong>Rigs:</strong> ${template.includesRigs ? 'Yes' : 'No'}</p>
                    <p><strong>Description:</strong> ${sanitizeHTML(template.description || 'N/A')}</p>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-sm btn-success" onclick="applyTemplate(${parseInt(template.id)})">Apply</button>
                        <button class="btn btn-sm btn-warning" onclick="editTemplate(${parseInt(template.id)})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteTemplate(${parseInt(template.id)})">Delete</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        Logger.error('[loadScheduleTemplates] Error:', error.message || error);
    }
}

function showCreateTemplateModal() {
    showModal('createTemplateModal');
}

function applyTemplate(templateId) {
    const template = scheduleTemplates.find(t => t.id === templateId);
    if(template && confirm('Apply this template to create a new schedule?')) {
        const newSchedule = {
            id: Date.now(),
            name: template.name + ' (from template)',
            month: 'January',
            year: '2025',
            description: template.description,
            status: 'draft',
            crews: template.crews || [],
            totalHours: 0,
            createdAt: new Date().toISOString(),
            createdBy: currentUser.id
        };

        schedules.push(newSchedule);
        saveData();
        loadDraftSchedules();
        updateSidebarBadges();
        showAlert('Template applied - new schedule created', 'success');
    }
}

function editTemplate(templateId) {
    showAlert('Edit template functionality', 'info');
}

function deleteTemplate(templateId) {
    try {
        if(confirm('Delete this schedule template?')) {
            scheduleTemplates = scheduleTemplates.filter(t => t.id !== templateId);
            localStorage.setItem('lifestarScheduleTemplates', JSON.stringify(scheduleTemplates));
            loadScheduleTemplates();
            showAlert('Template deleted', 'success');
        }
    } catch (error) {
        Logger.error('[deleteTemplate] Error:', error.message || error);
    }
}

// ========================================
// PARAMEDIC/EMT DASHBOARD FEATURES
// ========================================

// Performance Rating
/**
 * Calculate performance score for a staff member
 * @param {Object} staff - Staff user object
 * @returns {number} Performance score (0-100)
 */
function calculatePerformanceScore(staff) {
    let score = 70; // Base score;
    
    // Bonus for hours worked
    if ((staff.hoursWorked || 0) >= 150) score += 10;
    
    // Bonus for bonus hours
    const userBonusHours = bonusHours.filter(b => b.staffId === staff.id);
        .reduce((sum, b) => sum + (b.hours || 0), 0);
    if (userBonusHours >= 10) score += 10;
    
    // Deduction for negative notes
    const negativeNotes = supervisorNotes.filter(n =>;
        n.staffId === staff.id && n.priority === 'High'
    );
    score -= negativeNotes.length * 5;
    
    return Math.max(0, Math.min(100, score));
}

/**
 * Get performance level info from score
 * @param {number} score - Performance score
 * @returns {Object} Level name and color
 */
function getPerformanceLevel(score) {
    if (score >= 90) return { level: 'Excellent', color: 'var(--success-color)' };
    if (score >= 80) return { level: 'Very Good', color: '#28a745' };
    if (score >= 70) return { level: 'Good', color: 'var(--warning-color)' };
    if (score >= 60) return { level: 'Satisfactory', color: '#ffc107' };
    return { level: 'Needs Improvement', color: 'var(--danger-color)' };
}

/**
 * Generate performance statistics HTML
 * @param {Object} staff - Staff user object
 * @param {number} userBonusHours - Total bonus hours
 * @returns {string} HTML string
 */
function generatePerformanceStatsHTML(staff, userBonusHours) {
    return `;
        <div class="card">
            <div class="card-body">
                <h3>📊 Statistics</h3>
                <p><strong>Hours Worked:</strong> ${staff.hoursWorked || 0}</p>
                <p><strong>Bonus Hours:</strong> ${userBonusHours}</p>
                <p><strong>Scheduled Shifts:</strong> ${countStaffShifts(staff.id)}</p>
            </div>
        </div>
    `;
}

/**
 * Generate performance tips HTML
 * @param {number} score - Performance score
 * @returns {string} HTML string
 */
function generatePerformanceTipsHTML(score) {
    const tips = [];
    if (score < 80) tips.push('💡 Consider taking on more shifts to improve your score');
    if (score < 90) tips.push('💡 Complete additional training for bonus points');
    tips.push('💡 Maintain good attendance record');
    
    return `;
        <div class="card">
            <div class="card-body">
                <h3>💡 Tips to Improve</h3>
                <ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>
            </div>
        </div>
    `;
}

function loadPerformanceRating() {
    try {
        const staff = currentUser;
        const score = calculatePerformanceScore(staff);
        const { level, color } = getPerformanceLevel(score);
        
        const userBonusHours = bonusHours.filter(b => b.staffId === staff.id);
            .reduce((sum, b) => sum + (b.hours || 0), 0);
        
        const container = document.getElementById('performanceContainer') ||; 
            document.querySelector('.paramedic-section.active .card-body') ||
            document.querySelector('.emt-section.active .card-body');
        
        if (!container) return;
        
        container.innerHTML = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h2 style="font-size: 48px; color: ${color};">${score}%</h2>
                <p style="font-size: 24px; color: ${color}; font-weight: 600;">${level}</p>
            </div>
            <div class="grid-2">
                ${generatePerformanceStatsHTML(staff, userBonusHours)}
                ${generatePerformanceTipsHTML(score)}
            </div>
        `;
    } catch (error) {
        Logger.error('[loadPerformanceRating] Error:', error.message || error);
    }
}

// Incident Reports
function loadIncidentReports() {
    try {
        const tableBody = document.getElementById('incidentReportsTableBody');
        if(!tableBody) return;

        tableBody.textContent = '';

        const saved = localStorage.getItem('lifestarIncidentReports');
        if(saved) incidentReports = safeJSONParse(saved, []);

        // Filter for current user's reports
        const myReports = incidentReports.filter(r => r.reporterId === currentUser.id);

        if(myReports.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No incident reports submitted.</td></tr>';
            return;
        }

        myReports.forEach(report => {
            const row = document.createElement('tr');
            const severityClass = report.severity === 'Critical' ? 'badge-danger' :
                                 report.severity === 'High' ? 'badge-warning' : 'badge-info';

            row.innerHTML = `
                <td>${sanitizeHTML(report.date)}</td>
                <td>${sanitizeHTML(report.type)}</td>
                <td><span class="badge ${severityClass}">${sanitizeHTML(report.severity)}</span></td>
                <td>${sanitizeHTML(report.status)}</td>
                <td>${sanitizeHTML(report.description.substring(0, 50))}...</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewIncidentDetails(${parseInt(report.id)})">View</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        Logger.error('[loadIncidentReports] Error:', error.message || error);
    }
}

function submitIncidentReport(type) {
    try {
        const dateId = type === 'paramedic' ? 'incidentDate' : 'emtIncidentDate';
        const typeId = type === 'paramedic' ? 'incidentType' : 'emtIncidentType';
        const severityId = type === 'paramedic' ? 'incidentSeverity' : 'emtIncidentSeverity';
        const descId = type === 'paramedic' ? 'incidentDescription' : 'emtIncidentDescription';

        const report = {
            id: Date.now(),
            reporterId: currentUser.id,
            date: (document.getElementById(dateId) || {value: ''}).value,
            type: (document.getElementById(typeId) || {value: ''}).value,
            severity: (document.getElementById(severityId) || {value: ''}).value,
            description: (document.getElementById(descId) || {value: ''}).value,
            status: 'Submitted',
            createdAt: new Date().toISOString()
        };

        incidentReports.push(report);
        localStorage.setItem('lifestarIncidentReports', JSON.stringify(incidentReports));

        // Clear form
        (document.getElementById(dateId) || {value: ''}).value = '';
        (document.getElementById(typeId) || {value: ''}).value = '';
        (document.getElementById(severityId) || {value: ''}).value = '';
        (document.getElementById(descId) || {value: ''}).value = '';

        showAlert('Incident report submitted successfully', 'success');
        addSystemLog('Incident report submitted by: ' + currentUser.username);
    } catch (error) {
        Logger.error('[submitIncidentReport] Error:', error.message || error);
    }
}

function viewIncidentDetails(reportId) {
    try {
        const report = incidentReports.find(r => r.id === reportId);
        if(report) {
            const details = `;
                <strong>Date:</strong> ${report.date}<br>
                <strong>Type:</strong> ${report.type}<br>
                <strong>Severity:</strong> ${report.severity}<br>
                <strong>Status:</strong> ${report.status}<br>
                <strong>Description:</strong> ${report.description}<br>
                <strong>Submitted:</strong> ${new Date(report.createdAt).toLocaleString()}
            `;
            document.getElementById('alertModalTitle').textContent = 'Incident Report Details';
            document.getElementById('alertModalMessage').textContent = details;
            showModal('alertModal');
        }
    } catch (error) {
        Logger.error('[viewIncidentDetails] Error:', error.message || error);
    }
}

// Notifications
function loadNotifications() {
    try {
        const container = document.getElementById('notificationsContainer');
        if(!container) return;

        const saved = localStorage.getItem('lifestarNotifications');
        if(saved) notifications = safeJSONParse(saved, []);

        // Filter for current user's notifications
        const myNotifications = notifications.filter(n => n.userId === currentUser.id).reverse();

        if(myNotifications.length === 0) {
            container.innerHTML = '<p class="text-muted">No notifications.</p>';
            return;
        }

        container.textContent = '';
        myNotifications.forEach(notification => {
            const notif = document.createElement('div');
            notif.className = 'card';
            notif.style.marginBottom = '10px';
            notif.style.borderLeft = notification.read ? 'none' : '4px solid var(--lifestar-blue)';
            notif.innerHTML = `
                <div class="card-body" style="padding: 15px;">
                    <p><strong>${sanitizeHTML(notification.title)}</strong></p>
                    <p style="color: var(--light-text);">${sanitizeHTML(notification.message)}</p>
                    <small class="text-muted">${new Date(notification.createdAt).toLocaleString()}</small>
                    ${!notification.read ? '<button class="btn btn-sm btn-primary" onclick="markNotificationRead(' + parseInt(notification.id) + ')" style="margin-top: 10px;">Mark as Read</button>' : ''}
                </div>
            `;
            container.appendChild(notif);
        });
    } catch (error) {
        Logger.error('[loadNotifications] Error:', error.message || error);
    }
}

function markNotificationRead(notificationId) {
    try {
        const notification = notifications.find(n => n.id === notificationId);
        if(notification) {
            notification.read = true;
            localStorage.setItem('lifestarNotifications', JSON.stringify(notifications));
            loadNotifications();
        }
    } catch (error) {
        Logger.error('[markNotificationRead] Error:', error.message || error);
    }
}

// Settings
function loadSettings() {
    try {
        const container = document.getElementById('settingsContainer');
        if(!container) return;

        const saved = localStorage.getItem('lifestarUserSettings_' + currentUser.id);
        if(saved) userSettings = safeJSONParse(saved, {});

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>Account Settings</h2>
                </div>
                <div class="card-body">
                    <form id="settingsForm">
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" class="form-input" value="${currentUser.fullName || ''}" id="settingsFullName">
                        </div>
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" class="form-input" value="${currentUser.phone || ''}" id="settingsPhone">
                        </div>
                        <div class="form-group">
                            <label>Email Notifications</label>
                            <select class="form-select" id="settingsEmailNotifications">
                                <option value="true" ${userSettings.emailNotifications !== false ? 'selected' : ''}>Enabled</option>
                                <option value="false" ${userSettings.emailNotifications === false ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>SMS Notifications</label>
                            <select class="form-select" id="settingsSMSNotifications">
                                <option value="true" ${userSettings.smsNotifications !== false ? 'selected' : ''}>Enabled</option>
                                <option value="false" ${userSettings.smsNotifications === false ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">Save Settings</button>
                    </form>
                </div>
            </div>
        `;

        const _el865 = document.getElementById('settingsForm');
        if(_el865) _el865.addEventListener('submit', function(e) {
            e.preventDefault();

            userSettings.fullName = (document.getElementById('settingsFullName') || {value: ''}).value;
            userSettings.phone = (document.getElementById('settingsPhone') || {value: ''}).value;
            userSettings.emailNotifications = (document.getElementById('settingsEmailNotifications') || {value: ''}).value === 'true';
            userSettings.smsNotifications = (document.getElementById('settingsSMSNotifications') || {value: ''}).value === 'true';

            localStorage.setItem('lifestarUserSettings_' + currentUser.id, JSON.stringify(userSettings));

            // Update current user
            currentUser.fullName = userSettings.fullName;
            currentUser.phone = userSettings.phone;
            localStorage.setItem('lifestarCurrentUser', JSON.stringify(currentUser));

            // Update user in users array
            const userIndex = users.findIndex(u => u.id === currentUser.id);
            if(userIndex > -1) {
                users[userIndex].fullName = userSettings.fullName;
                users[userIndex].phone = userSettings.phone;
                saveData();
            }

            showAlert('Settings saved successfully', 'success');
        });
    } catch (error) {
        Logger.error('[loadSettings] Error:', error.message || error);
    }
}

// Create sample data for testing
function createSampleData() {
    try {
        // Sample swap listings
        if(swapListings.length === 0) {
            const paramedics = users.filter(u => u.role === 'paramedic');
            if(paramedics.length > 0) {
                swapListings.push({
                    id: Date.now(),
                    requesterId: paramedics[0].id,
                    date: '2025-01-15',
                    shiftType: 'Day',
                    swapType: 'Open to anyone',
                    reason: 'Personal matter',
                    urgent: false,
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('lifestarSwapListings', JSON.stringify(swapListings));
            }
        }

        // Sample training records
        if(trainingRecords.length === 0) {
            const paramedics = users.filter(u => u.role === 'paramedic');
            if(paramedics.length > 0) {
                trainingRecords.push({
                    id: Date.now(),
                    name: 'CPR Recertification',
                    type: 'Recertification',
                    staffId: paramedics[0].id,
                    date: '2025-01-20',
                    status: 'Scheduled',
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('lifestarTrainingRecords', JSON.stringify(trainingRecords));
            }
        }

        // Sample on-call rotation
        if(oncallRotations.length === 0) {
            const staff = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
            if(staff.length >= 2) {
                oncallRotations.push({
                    id: Date.now(),
                    name: 'Weekend Rotation',
                    type: 'weekly',
                    period: 7,
                    memberIds: staff.slice(0, 2).map(s => s.id),
                    startDate: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('lifestarOncallRotations', JSON.stringify(oncallRotations));
            }
        }

        // Sample supervisor notes
        if(supervisorNotes.length === 0) {
            const paramedics = users.filter(u => u.role === 'paramedic');
            if(paramedics.length > 0) {
                supervisorNotes.push({
                    id: Date.now(),
                    staffId: paramedics[0].id,
                    category: 'Commendation',
                    priority: 'Low',
                    content: 'Excellent performance during emergency call. Professional and efficient.',
                    private: false,
                    date: new Date().toISOString().split('T')[0],
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('lifestarSupervisorNotes', JSON.stringify(supervisorNotes));
            }
        }
    } catch (error) {
        Logger.error('[createSampleData] Error:', error.message || error);
    }
}

// Initialize sample data
createSampleData();
