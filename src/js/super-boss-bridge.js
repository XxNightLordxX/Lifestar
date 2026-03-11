/**
 * Super Admin ↔ Boss Feature Bridge
 * Allows Super Admin to access all Boss scheduling features
 * Also handles staff selection fixes across the app
 */

// ========================================
// SUPER ADMIN SECTION ROUTING
// ========================================

// Map of super admin boss sections to their data loaders
const SUPER_BOSS_SECTIONS = {
    's_drafts': 'loadSuperDrafts',
    's_published': 'loadSuperPublished',
    's_archived': 'loadSuperArchived',
    's_calendar': 'loadSuperCalendar',
    's_crews': 'loadSuperCrews',
    's_timeoff': 'loadSuperTimeoff',
    's_trades': 'loadSuperTrades',
    's_swap': 'loadSuperSwap',
    's_staff': 'loadSuperStaffDirectory',
    's_availability': 'loadSuperAvailability',
    's_training': 'loadSuperTraining',
    's_bonus': 'loadSuperBonus',
    's_callins': 'loadSuperCallins',
    's_absences': 'loadSuperAbsences',
    's_oncall': 'loadSuperOncall',
    's_analytics': 'loadSuperAnalytics',
    's_history': 'loadSuperHistory',
    's_notes': 'loadSuperNotes',
    's_templates': 'loadSuperTemplates'
};

// ========================================
// SCHEDULE LOADING FUNCTIONS (Super Admin)
// ========================================

/** Helper: render schedule list into a container */
function renderSuperScheduleList(containerId, noMsgId, statusFilter, badgeId) {
    const list = document.getElementById(containerId);
    const noMsg = document.getElementById(noMsgId);
    if(!list) return;

    const filtered = (schedules || []).filter(s => s.status === statusFilter);
    list.textContent = '';

    if(filtered.length === 0) {
        if(noMsg) noMsg.style.display = 'block';
    } else {
        if(noMsg) noMsg.style.display = 'none';
        filtered.forEach(schedule => {
            // Use the existing createScheduleCard from app.js (returns DOM element)
            if(typeof createScheduleCard === 'function') {
                const card = createScheduleCard(schedule);
                if(card) list.appendChild(card);
            }
        });
    }

    // Update badge
    if(badgeId) {
        const badge = document.getElementById(badgeId);
        if(badge) badge.textContent = filtered.length;
    }
}

function loadSuperDrafts() {
    renderSuperScheduleList('superDraftSchedulesList', 'superNoDraftsMessage', 'draft', 'superDraftsBadge');
}

function loadSuperPublished() {
    renderSuperScheduleList('superPublishedSchedulesList', 'superNoPublishedMessage', 'published', 'superPublishedBadge');
}

function loadSuperArchived() {
    renderSuperScheduleList('superArchivedSchedulesList', 'superNoArchivedMessage', 'archived', 'superArchivedBadge');
}

// ========================================
// STAFF DIRECTORY (Super Admin)
// ========================================

function loadSuperStaffDirectory() {
    const staffGrid = document.getElementById('superStaffGrid');
    if(!staffGrid) return;
    staffGrid.textContent = '';

    const staff = users.filter(u => u.role === 'paramedic' || u.role === 'emt');

    if(staff.length === 0) {
        staffGrid.innerHTML = '<p class="text-muted">No staff members found.</p>';
        return;
    }

    staff.forEach(member => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.staffName = (member.fullName || '').toLowerCase();
        card.dataset.staffRole = member.role;
        card.innerHTML = `
            <div class="card-header" style="background: ${member.role === 'paramedic' ? 'var(--lifestar-red)' : 'var(--lifestar-light-blue)'};">
                <h2>${sanitizeHTML(member.fullName || member.username)}</h2>
            </div>
            <div class="card-body">
                <p><strong>Role:</strong> <span class="badge badge-${sanitizeHTML(member.role)}">${sanitizeHTML(member.role.toUpperCase())}</span></p>
                <p><strong>Phone:</strong> ${sanitizeHTML(member.phone || 'N/A')}</p>
                <p><strong>Hours Worked:</strong> ${member.hoursWorked || 0}</p>
                <p><strong>Bonus Hours:</strong> ${member.bonusHours || 0}</p>
                <div style="margin-top: 15px;">
                    <button class="btn btn-sm btn-primary" onclick="viewStaffSchedule(${member.id})">View Schedule</button>
                    <button class="btn btn-sm btn-info" onclick="viewStaffDetails(${member.id})">Details</button>
                </div>
            </div>
        `;
        staffGrid.appendChild(card);
    });
}

function filterStaffSuper() {
    const searchTerm = (document.getElementById('superStaffSearch') || {value: ''}).value.toLowerCase();
    const roleFilter = (document.getElementById('superStaffRoleFilter') || {value: ''}).value;

    const cards = document.querySelectorAll('#superStaffGrid .card');
    cards.forEach(card => {
        const name = (card.dataset.staffName || '').toLowerCase();
        const role = card.dataset.staffRole || '';
        const matchesSearch = !searchTerm || name.includes(searchTerm);
        const matchesRole = !roleFilter || role === roleFilter;
        card.style.display = matchesSearch && matchesRole ? 'block' : 'none';
    });
}

// ========================================
// CREW MANAGEMENT (Super Admin)
// ========================================

function loadSuperCrews() {
    const container = document.getElementById('superCrewTemplatesList');
    const noMsg = document.getElementById('superNoCrewsMessage');
    if(!container) return;

    // Reuse boss crew templates loading
    if(typeof loadCrewTemplates === 'function') {
        loadCrewTemplates();
    }

    // Also populate super admin's crew list
    try {
        const crewTemplates = JSON.parse(localStorage.getItem('lifestarCrewTemplates') || '[]');
        container.textContent = '';

        if(crewTemplates.length === 0) {
            if(noMsg) noMsg.style.display = 'block';
            return;
        }
        if(noMsg) noMsg.style.display = 'none';

        crewTemplates.forEach(crew => {
            container.innerHTML += `
                <div class="card">
                    <div class="card-header" style="background: ${crew.type === 'ALS' ? '#e74c3c' : '#3498db'};">
                        <h2>${crew.rig || 'Unnamed'} (${crew.type || 'BLS'})</h2>
                    </div>
                    <div class="card-body">
                        <p><strong>Paramedic:</strong> ${crew.paramedic || 'Unassigned'}</p>
                        <p><strong>EMT:</strong> ${crew.emt || 'Unassigned'}</p>
                        <p><strong>Shift:</strong> ${crew.shiftType || 'N/A'}</p>
                        <div style="margin-top: 10px;">
                            <button class="btn btn-sm btn-danger" onclick="deleteCrewTemplate('${crew.id}')">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        Logger.error('[loadSuperCrews]', e);
    }
}

// ========================================
// REQUESTS (Super Admin)
// ========================================

function loadSuperTimeoff() {
    const tbody = document.getElementById('superTimeoffTableBody');
    if(!tbody) return;

    try {
        const requests = JSON.parse(localStorage.getItem('lifestarTimeoffRequests') || '[]');
        tbody.textContent = '';

        if(requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No time off requests</td></tr>';
            return;
        }

        requests.forEach(req => {
            const staff = users.find(u => u.id === req.userId);
            tbody.innerHTML += `
                <tr>
                    <td>${sanitizeHTML(staff ? staff.fullName : 'Unknown')}</td>
                    <td>${req.type || 'PTO'}</td>
                    <td>${req.startDate || ''} - ${req.endDate || ''}</td>
                    <td><span class="badge badge-${req.status === 'approved' ? 'success' : req.status === 'denied' ? 'danger' : 'warning'}">${(req.status || 'pending').toUpperCase()}</span></td>
                    <td>
                        ${req.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="approveTimeoff('${req.id}')">Approve</button>
                            <button class="btn btn-sm btn-danger" onclick="denyTimeoff('${req.id}')">Deny</button>
                        ` : '-'}
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No time off requests</td></tr>';
    }
}

function loadSuperTrades() {
    const tbody = document.getElementById('superTradesTableBody');
    if(!tbody) return;

    try {
        const trades = JSON.parse(localStorage.getItem('lifestarShiftTrades') || '[]');
        tbody.textContent = '';

        if(trades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No shift trade requests</td></tr>';
            return;
        }

        trades.forEach(trade => {
            tbody.innerHTML += `
                <tr>
                    <td>${trade.requester || 'Unknown'}</td>
                    <td>${trade.shift || 'N/A'}</td>
                    <td>${trade.tradeWith || 'Open'}</td>
                    <td><span class="badge badge-${trade.status === 'approved' ? 'success' : 'warning'}">${(trade.status || 'pending').toUpperCase()}</span></td>
                    <td>
                        ${trade.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="approveShiftTrade('${trade.id}')">Approve</button>
                            <button class="btn btn-sm btn-danger" onclick="denyShiftTrade('${trade.id}')">Deny</button>
                        ` : '-'}
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No shift trades</td></tr>';
    }
}

function loadSuperSwap() {
    const container = document.getElementById('superSwapList');
    const noMsg = document.getElementById('superNoSwapsMessage');
    if(!container) return;

    try {
        const swaps = JSON.parse(localStorage.getItem('lifestarSwapListings') || '[]');
        container.textContent = '';

        if(swaps.length === 0) {
            if(noMsg) noMsg.style.display = 'block';
            return;
        }
        if(noMsg) noMsg.style.display = 'none';

        swaps.forEach(swap => {
            container.innerHTML += `
                <div class="card">
                    <div class="card-body">
                        <p><strong>Posted by:</strong> ${swap.postedBy || 'Unknown'}</p>
                        <p><strong>Shift:</strong> ${swap.shift || 'N/A'}</p>
                        <p><strong>Date:</strong> ${swap.date || 'N/A'}</p>
                        <p><strong>Status:</strong> ${swap.status || 'Open'}</p>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        if(noMsg) noMsg.style.display = 'block';
    }
}

// ========================================
// MANAGEMENT SECTIONS (Super Admin)
// ========================================

function loadSuperAvailability() {
    const tbody = document.getElementById('superAvailabilityTableBody');
    if(!tbody) return;

    const staff = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
    tbody.textContent = '';

    const availability = JSON.parse(localStorage.getItem('lifestarAvailability') || '{}');

    staff.forEach(member => {
        const avail = availability[member.id] || {};
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        tbody.innerHTML += `
            <tr>
                <td><strong>${sanitizeHTML(member.fullName || member.username)}</strong></td>
                <td><span class="badge badge-${sanitizeHTML(member.role)}">${sanitizeHTML(member.role.toUpperCase())}</span></td>
                ${days.map(d => `<td style="text-align: center;">${avail[d] !== false ? '✅' : '❌'}</td>`).join('')}
            </tr>
        `;
    });

    if(staff.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No staff members</td></tr>';
    }
}

function loadSuperTraining() {
    const tbody = document.getElementById('superTrainingTableBody');
    if(!tbody) return;

    try {
        const training = JSON.parse(localStorage.getItem('lifestarTraining') || '[]');
        tbody.textContent = '';

        if(training.length === 0) {
            // Show staff with default certifications
            const staff = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
            staff.forEach(member => {
                const cert = member.role === 'paramedic' ? 'Paramedic License' : 'EMT Certification';
                tbody.innerHTML += `
                    <tr>
                        <td>${sanitizeHTML(member.fullName || member.username)}</td>
                        <td>${cert}</td>
                        <td>-</td>
                        <td><span class="badge badge-success">ACTIVE</span></td>
                        <td><button class="btn btn-sm btn-info" onclick="editTraining(${member.id})">Edit</button></td>
                    </tr>
                `;
            });
            return;
        }

        training.forEach(record => {
            const staff = users.find(u => u.id === record.userId);
            const isExpired = record.expiryDate && new Date(record.expiryDate) < new Date();
            tbody.innerHTML += `
                <tr>
                    <td>${sanitizeHTML(staff ? staff.fullName : 'Unknown')}</td>
                    <td>${record.certification || 'N/A'}</td>
                    <td>${record.expiryDate || 'N/A'}</td>
                    <td><span class="badge badge-${isExpired ? 'danger' : 'success'}">${isExpired ? 'EXPIRED' : 'ACTIVE'}</span></td>
                    <td><button class="btn btn-sm btn-info" onclick="editTraining(${record.userId})">Edit</button></td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No training records</td></tr>';
    }
}

function loadSuperBonus() {
    const tbody = document.getElementById('superBonusTableBody');
    if(!tbody) return;

    const staff = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
    tbody.textContent = '';

    staff.forEach(member => {
        const regular = member.hoursWorked || 0;
        const bonus = member.bonusHours || 0;
        tbody.innerHTML += `
            <tr>
                <td><strong>${sanitizeHTML(member.fullName || member.username)}</strong></td>
                <td><span class="badge badge-${sanitizeHTML(member.role)}">${sanitizeHTML(member.role.toUpperCase())}</span></td>
                <td>${regular}</td>
                <td>${bonus}</td>
                <td><strong>${regular + bonus}</strong></td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="addBonusHours(${member.id})">+ Add</button>
                    <button class="btn btn-sm btn-warning" onclick="editBonusHours(${member.id})">Edit</button>
                </td>
            </tr>
        `;
    });

    if(staff.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No staff members</td></tr>';
    }
}

function loadSuperCallins() {
    const tbody = document.getElementById('superCallinsTableBody');
    if(!tbody) return;

    try {
        const callins = JSON.parse(localStorage.getItem('lifestarCallins') || '[]');
        tbody.textContent = '';

        if(callins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No emergency call-ins recorded</td></tr>';
            return;
        }

        callins.forEach(callin => {
            tbody.innerHTML += `
                <tr>
                    <td>${callin.dateTime || 'N/A'}</td>
                    <td>${callin.employee || 'Unknown'}</td>
                    <td>${callin.reason || 'N/A'}</td>
                    <td>${callin.replacement || 'Pending'}</td>
                    <td><span class="badge badge-${callin.status === 'resolved' ? 'success' : 'warning'}">${(callin.status || 'open').toUpperCase()}</span></td>
                    <td>
                        ${callin.status !== 'resolved' ? `<button class="btn btn-sm btn-success" onclick="resolveCallin('${callin.id}')">Resolve</button>` : '-'}
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No call-ins</td></tr>';
    }
}

function loadSuperAbsences() {
    const tbody = document.getElementById('superAbsencesTableBody');
    if(!tbody) return;

    try {
        const absences = JSON.parse(localStorage.getItem('lifestarAbsences') || '[]');
        tbody.textContent = '';

        if(absences.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No absences recorded</td></tr>';
            return;
        }

        absences.forEach(absence => {
            tbody.innerHTML += `
                <tr>
                    <td>${absence.employee || 'Unknown'}</td>
                    <td>${absence.date || 'N/A'}</td>
                    <td>${absence.type || 'Unexcused'}</td>
                    <td>${absence.reason || 'N/A'}</td>
                    <td><span class="badge badge-${absence.excused ? 'success' : 'danger'}">${absence.excused ? 'EXCUSED' : 'UNEXCUSED'}</span></td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No absences</td></tr>';
    }
}

function loadSuperOncall() {
    const tbody = document.getElementById('superOncallTableBody');
    if(!tbody) return;

    try {
        const oncall = JSON.parse(localStorage.getItem('lifestarOncall') || '[]');
        tbody.textContent = '';

        if(oncall.length === 0) {
            // Generate default rotation from staff
            const paramedics = users.filter(u => u.role === 'paramedic');
            const emts = users.filter(u => u.role === 'emt');

            for(let i = 0; i < 4; i++) {
                const weekStart = new Date();
                weekStart.setDate(weekStart.getDate() + (i * 7));
                const primary = paramedics[i % paramedics.length];
                const backup = emts[i % emts.length];

                tbody.innerHTML += `
                    <tr>
                        <td>Week of ${weekStart.toLocaleDateString()}</td>
                        <td>${primary ? primary.fullName : 'Unassigned'}</td>
                        <td>${backup ? backup.fullName : 'Unassigned'}</td>
                        <td><span class="badge badge-${i === 0 ? 'success' : 'info'}">${i === 0 ? 'CURRENT' : 'UPCOMING'}</span></td>
                    </tr>
                `;
            }
            return;
        }

        oncall.forEach(entry => {
            tbody.innerHTML += `
                <tr>
                    <td>${entry.week || 'N/A'}</td>
                    <td>${entry.primary || 'Unassigned'}</td>
                    <td>${entry.backup || 'Unassigned'}</td>
                    <td><span class="badge badge-info">${entry.status || 'SCHEDULED'}</span></td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No on-call data</td></tr>';
    }
}

// ========================================
// ANALYSIS (Super Admin)
// ========================================

function loadSuperAnalytics() {
    const staff = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
    const totalHours = staff.reduce((sum, s) => sum + (s.hoursWorked || 0), 0);
    const activeSchedules = (schedules || []).filter(s => s.status === 'published').length;

    const el1 = document.getElementById('superAnalyticsTotalStaff');
    const el2 = document.getElementById('superAnalyticsTotalHours');
    const el3 = document.getElementById('superAnalyticsActiveSchedules');

    if(el1) el1.textContent = staff.length;
    if(el2) el2.textContent = totalHours;
    if(el3) el3.textContent = activeSchedules;
}

function loadSuperHistory() {
    const tbody = document.getElementById('superHistoryTableBody');
    const staffFilter = document.getElementById('superHistoryStaffFilter');
    if(!tbody) return;

    // Populate staff filter dropdown
    if(staffFilter && staffFilter.options.length <= 1) {
        const staff = users.filter(u => u.role === 'paramedic' || u.role === 'emt');
        staff.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.fullName || s.username;
            staffFilter.appendChild(opt);
        });
    }

    tbody.textContent = '';

    // Get all crews from all schedules
    const allCrews = [];
    schedules.forEach(schedule => {
        (schedule.crews || []).forEach(crew => {
            allCrews.push({ ...crew, scheduleName: schedule.name, scheduleStatus: schedule.status });
        });
    });

    if(allCrews.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No shift history available</td></tr>';
        return;
    }

    const filterValue = staffFilter ? staffFilter.value : '';

    allCrews.forEach(crew => {
        if(filterValue) {
            const staff = users.find(u => String(u.id) === String(filterValue));
            if(staff && crew.paramedic !== staff.fullName && crew.emt !== staff.fullName) return;
        }

        tbody.innerHTML += `
            <tr>
                <td>${crew.date || 'N/A'}</td>
                <td>${crew.rig || 'N/A'}</td>
                <td>${crew.paramedic || 'Unassigned'}</td>
                <td>${crew.emt || 'Unassigned'}</td>
                <td>${crew.shiftType || 'N/A'}</td>
                <td>${crew.scheduleName || 'Unknown'}</td>
            </tr>
        `;
    });
}

function loadShiftHistorySuper() {
    loadSuperHistory();
}

// ========================================
// OTHER (Super Admin)
// ========================================

function loadSuperNotes() {
    const container = document.getElementById('superNotesList');
    const noMsg = document.getElementById('superNoNotesMessage');
    if(!container) return;

    try {
        const notes = JSON.parse(localStorage.getItem('lifestarNotes') || '[]');
        container.textContent = '';

        if(notes.length === 0) {
            if(noMsg) noMsg.style.display = 'block';
            return;
        }
        if(noMsg) noMsg.style.display = 'none';

        notes.forEach(note => {
            container.innerHTML += `
                <div class="content-card" style="margin-bottom: 12px;">
                    <div class="card-header">
                        <h2>${note.title || 'Untitled Note'}</h2>
                    </div>
                    <div class="card-body" style="padding: 15px;">
                        <p>${note.content || ''}</p>
                        <small class="text-muted">Created: ${note.createdAt ? new Date(note.createdAt).toLocaleString() : 'N/A'}</small>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        if(noMsg) noMsg.style.display = 'block';
    }
}

function loadSuperTemplates() {
    const container = document.getElementById('superTemplatesList');
    const noMsg = document.getElementById('superNoTemplatesMessage');
    if(!container) return;

    try {
        const templates = JSON.parse(localStorage.getItem('lifestarScheduleTemplates') || '[]');
        container.textContent = '';

        if(templates.length === 0) {
            if(noMsg) noMsg.style.display = 'block';
            return;
        }
        if(noMsg) noMsg.style.display = 'none';

        templates.forEach(template => {
            container.innerHTML += `
                <div class="card">
                    <div class="card-header">
                        <h2>${template.name || 'Unnamed Template'}</h2>
                    </div>
                    <div class="card-body">
                        <p>${template.description || 'No description'}</p>
                        <p><strong>Shifts:</strong> ${(template.shifts || []).length}</p>
                        <div style="margin-top: 10px;">
                            <button class="btn btn-sm btn-primary" onclick="useTemplate('${template.id}')">Use Template</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteTemplate('${template.id}')">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        if(noMsg) noMsg.style.display = 'block';
    }
}

function loadSuperCalendar() {
    // Reuse the boss calendar loading if available
    if(typeof loadCalendar === 'function') {
        loadCalendar();
    }

    // Also populate the super admin calendar container
    const container = document.getElementById('superCalendarGrid');
    if(!container) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    let html = '<div class="calendar-header-row" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 5px;">';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
        html += `<div style="text-align: center; font-weight: bold; padding: 8px; background: #f0f0f0; border-radius: 4px;">${d}</div>`;
    });
    html += '</div>';

    html += '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;">';

    // Empty cells before first day
    for(let i = 0; i < firstDay; i++) {
        html += '<div style="min-height: 80px; background: #fafafa; border-radius: 4px;"></div>';
    }

    // Days of month
    for(let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = day === now.getDate();

        // Find crews scheduled for this day
        const dayCrews = [];
        (schedules || []).filter(s => s.status === 'published').forEach(schedule => {
            (schedule.crews || []).forEach(crew => {
                if(crew.date === dateStr) dayCrews.push(crew);
            });
        });

        html += `<div style="min-height: 80px; padding: 6px; background: ${isToday ? '#ebf5fb' : 'white'}; border: ${isToday ? '2px solid #3498db' : '1px solid #eee'}; border-radius: 4px;">`;
        html += `<div style="font-weight: bold; font-size: 14px; color: ${isToday ? '#3498db' : '#2c3e50'};">${day}</div>`;

        dayCrews.forEach(crew => {
            const color = crew.shiftType === '24-Hour' ? '#e74c3c' : crew.shiftType === 'Day' ? '#f39c12' : '#3498db';
            html += `<div style="font-size: 10px; background: ${color}; color: white; padding: 2px 4px; border-radius: 3px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${crew.rig || ''} ${crew.shiftType || ''}</div>`;
        });

        html += '</div>';
    }

    html += '</div>';
    container.textContent = html;
}

function closeSuperScheduleEditor() {
    showSuperSection('s_drafts');
}

// ========================================
// SUPER ADMIN SECTION HANDLER EXTENSION
// ========================================

/** Extended showSuperSection to handle boss sections */
function handleSuperBossSection(section) {
    const loaderName = SUPER_BOSS_SECTIONS[section];
    if(loaderName && typeof window[loaderName] === 'function') {
        window[loaderName]();
        return true;
    }

    // Special cases
    if(section === 'permissions') {
        if(typeof loadPermissionsManager === 'function') loadPermissionsManager();
        return true;
    }

    return false;
}

// ========================================
// STAFF SELECTION FIX
// ========================================

/**
 * Populate any staff dropdown with actual users from the users array
 * Call this whenever a modal or form with staff selection is shown
 */
function populateStaffDropdowns() {
    const paramedics = users.filter(u => u.role === 'paramedic');
    const emts = users.filter(u => u.role === 'emt');

    // Find all select elements that should contain staff
    const staffSelectors = [
        'crewParamedic', 'crewEmt', 'templateParamedic', 'templateEmt',
        'callinEmployee', 'absenceEmployee', 'oncallPrimary', 'oncallBackup',
        'tradeRequester', 'tradeWith', 'swapEmployee',
        'historyStaffFilter', 'superHistoryStaffFilter'
    ];

    staffSelectors.forEach(id => {
        const select = document.getElementById(id);
        if(!select) return;

        // Determine what type of staff this dropdown needs
        const needsParamedics = id.toLowerCase().includes('paramedic') || id.toLowerCase().includes('primary');
        const needsEmts = id.toLowerCase().includes('emt') || id.toLowerCase().includes('backup');
        const needsAll = !needsParamedics && !needsEmts;

        // Save current value
        const currentVal = select.value;

        // Clear existing options (keep first placeholder option)
        while(select.options.length > 1) {
            select.remove(1);
        }

        // Add staff options
        const staffToAdd = needsAll ? [...paramedics, ...emts] :
                          needsParamedics ? paramedics : emts;

        staffToAdd.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.fullName || s.username} (${s.role.toUpperCase()})`;
            select.appendChild(opt);
        });

        // Restore value if possible
        if(currentVal) select.value = currentVal;
    });
}

/**
 * Enhanced version of showCreateCrewTemplateModal that populates staff
 */
const _originalShowCreateCrewTemplateModal = typeof showCreateCrewTemplateModal === 'function' ? showCreateCrewTemplateModal : null;

// Override to ensure staff dropdowns are populated
if(typeof window !== 'undefined') {
    const _origShowModal = typeof showModal === 'function' ? showModal : null;

    // After any modal is shown, try to populate staff dropdowns
    document.addEventListener('DOMContentLoaded', function() {
        // Watch for modal visibility changes
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if(mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const el = mutation.target;
                    if(el.classList.contains('modal') && el.classList.contains('active')) {
                        // Modal just became visible - populate staff dropdowns
                        setTimeout(populateStaffDropdowns, 100);
                    }
                }
                if(mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const el = mutation.target;
                    if(el.classList.contains('modal') && el.style.display === 'block') {
                        setTimeout(populateStaffDropdowns, 100);
                    }
                }
            });
        });

        // Observe all modals
        document.querySelectorAll('.modal').forEach(modal => {
            observer.observe(modal, { attributes: true });
        });

        // Also observe body for dynamically added modals
        observer.observe(document.body, { childList: true, subtree: false });
    });
}

// ========================================
// INITIALIZE SUPER ADMIN BOSS FEATURES
// ========================================

function initSuperAdminBossFeatures() {
    // Update badges
    const drafts = (schedules || []).filter(s => s.status === 'draft').length;
    const published = (schedules || []).filter(s => s.status === 'published').length;
    const archived = (schedules || []).filter(s => s.status === 'archived').length;

    const db = document.getElementById('superDraftsBadge');
    const pb = document.getElementById('superPublishedBadge');
    const ab = document.getElementById('superArchivedBadge');

    if(db) db.textContent = drafts;
    if(pb) pb.textContent = published;
    if(ab) ab.textContent = archived;
}
