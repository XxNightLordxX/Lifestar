// ============================================
// Drag and Drop Scheduler System
// ============================================

let currentEditingSchedule = null;
let draggedEmployee = null;
let draggedCrew = null;

// ============================================
// SCHEDULE EDITOR INITIALIZATION
// ============================================

/** @function openScheduleEditor */
function openScheduleEditor(scheduleId) {
    try {
        currentEditingSchedule = schedules.find(s => String(s.id) === String(scheduleId));
        if(!currentEditingSchedule) {
            alert('Schedule not found!');
            return;
        }

        // Hide all sections, show schedule editor
        hideAllSections();
        document.getElementById('scheduleEditor').classList.remove('hidden');

        // Initialize the editor
        initializeScheduleEditor();
    } catch (error) {
        Logger.error('[openScheduleEditor] Error:', error.message || error);
    }
}

/** @function initializeScheduleEditor */
function initializeScheduleEditor() {
    try {
        // Set header info
        const nameEl = document.getElementById('editorScheduleName');
        if (nameEl) nameEl.textContent = currentEditingSchedule.name;
        const statusEl = document.getElementById('editorScheduleStatus');
        if (statusEl) statusEl.textContent =
            currentEditingSchedule.status === 'draft' ? 'Draft' : 'Published';

        // Load employees
        loadEmployeesForEditor();

        // Generate calendar grid
        generateEditorCalendar();

        // Initialize shift templates dropdown
        initializeShiftTemplates();
    } catch (error) {
        Logger.error('[initializeScheduleEditor] Error:', error.message || error);
    }
}

/** @function hideAllSections */
function hideAllSections() {
    try {
        // Hide all boss sections
        document.querySelectorAll('.boss-section').forEach(section => {
            section.classList.add('hidden');
        });

        // Hide other dashboards
        document.querySelectorAll('.dashboard').forEach(dashboard => {
            dashboard.classList.add('hidden');
        });
    } catch (error) {
        Logger.error('[hideAllSections] Error:', error.message || error);
    }
}

/** @function loadEmployeesForEditor */
function loadEmployeesForEditor() {
    try {
        const container = document.getElementById('employeeList');
        if (!container) return;
        container.textContent = '';

        const employees = users.filter(u => u.role === 'paramedic' || u.role === 'emt');

        employees.forEach(employee => {
            const employeeCard = createEmployeeCard(employee);
            container.appendChild(employeeCard);
        });
    } catch (error) {
        Logger.error('[loadEmployeesForEditor] Error:', error.message || error);
    }
}

/** @function createEmployeeCard */
function createEmployeeCard(employee) {
    try {
        const card = document.createElement('div');
        card.className = `employee-card ${employee.role}`;
        card.draggable = true;
        card.dataset.employeeId = employee.id;
        card.dataset.employeeName = employee.fullName;
        card.dataset.employeeRole = employee.role;

        card.innerHTML = `
            <div class="employee-info">
                <strong>${sanitizeHTML(employee.fullName)}</strong>
                <span class="employee-role">${sanitizeHTML(employee.role) === 'paramedic' ? 'Paramedic' : 'EMT'}</span>
            </div>
            <div class="employee-hours">
                ${parseInt(employee.hoursWorked) || 0} hrs
            </div>
        `;

        // Drag events
        card.addEventListener('dragstart', handleEmployeeDragStart);
        card.addEventListener('dragend', handleEmployeeDragEnd);

        return card;
    } catch (error) {
        Logger.error('[createEmployeeCard] Error:', error.message || error);
    }
}

// ============================================
// DRAG AND DROP HANDLERS
// ============================================

/** @function handleEmployeeDragStart */
function handleEmployeeDragStart(e) {
    draggedEmployee = {
        id: e.target.dataset.employeeId,
        name: e.target.dataset.employeeName,
        role: e.target.dataset.employeeRole
    };
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', 'employee');
}

/** @function handleEmployeeDragEnd */
function handleEmployeeDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedEmployee = null;
}

/** @function handleDragOver */
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

/** @function handleDragEnter */
function handleDragEnter(e) {
    e.preventDefault();
    const dayCell = e.target.closest('.calendar-day');
    if(dayCell) {
        dayCell.classList.add('drag-over');
    }
}

/** @function handleDragLeave */
function handleDragLeave(e) {
    const dayCell = e.target.closest('.calendar-day');
    if(dayCell && !dayCell.contains(e.relatedTarget)) {
        dayCell.classList.remove('drag-over');
    }
}

/** @function handleDrop */
function handleDrop(e) {
    e.preventDefault();
    const dayCell = e.target.closest('.calendar-day');
    if(!dayCell || !draggedEmployee) return;

    dayCell.classList.remove('drag-over');

    // Add employee to this day
    addEmployeeToDay(dayCell, draggedEmployee);
}

// ============================================
// EMPLOYEE ASSIGNMENT TO DAYS
// ============================================

/** @function addEmployeeToDay */
function addEmployeeToDay(dayCell, employee) {
    const date = dayCell.dataset.date;

    // Check if employee is already assigned to a crew on this day
    const existingCrew = currentEditingSchedule.crews?.find(
        c => c.date === date && (String(c.paramedicId) === String(employee.id) || String(c.emtId) === String(employee.id))
    );

    if(existingCrew) {
        showAlert(`${employee.name} is already assigned to a crew on this day!`, 'warning');
        return;
    }

    // Check time-off requests
    const _timeOffList = (typeof timeoffRequests !== 'undefined' ? timeoffRequests : (typeof timeOffRequests !== 'undefined' ? timeOffRequests : []));
    const timeOffRequest = _timeOffList.find(t =>
        String(t.staffId) === String(employee.id) &&
        t.status === 'approved' &&
        date >= t.startDate && date <= t.endDate
    );

    if(timeOffRequest) {
        showAlert(`${employee.name} has approved time off on this day!`, 'warning');
        return;
    }

    // Check absences
    const _absenceList = (typeof absences !== 'undefined' ? absences : (typeof window.absences !== 'undefined' ? window.absences : []));
    const absence = _absenceList.find(a =>
        String(a.staffId) === String(employee.id) &&
        a.date === date &&
        (a.type === 'full-absence' || a.type === 'partial-coverage')
    );

    if(absence) {
        showAlert(`${employee.name} has an absence on this day!`, 'warning');
        return;
    }

    // Add to day's pending employees
    addPendingEmployeeToDay(dayCell, employee);
}

/** @function addPendingEmployeeToDay */
function addPendingEmployeeToDay(dayCell, employee) {
    try {
        let pendingContainer = dayCell.querySelector('.pending-employees');
        if(!pendingContainer) {
            pendingContainer = document.createElement('div');
            pendingContainer.className = 'pending-employees';
            dayCell.appendChild(pendingContainer);
        }

        const empBadge = document.createElement('div');
        empBadge.className = `employee-badge ${employee.role}`;
        empBadge.innerHTML = `
            ${sanitizeHTML(employee.name)}
            <button class="remove-badge" onclick="removePendingEmployee(this, '${sanitizeHTML(employee.id)}')">&times;</button>
        `;
        pendingContainer.appendChild(empBadge);
    } catch (error) {
        Logger.error('[addPendingEmployeeToDay] Error:', error.message || error);
    }
}

/** @function removePendingEmployee */
function removePendingEmployee(button, employeeId) {
    try {
        const badge = button.closest('.employee-badge');
        badge.remove();

        // Check if pending container is empty
        const dayCell = badge ? badge.closest('.calendar-day') : null;
        const pendingContainer = dayCell ? dayCell.querySelector('.pending-employees') : document.querySelector('.pending-employees');
        if(pendingContainer && pendingContainer.children.length === 0) {
            pendingContainer.remove();
        }
    } catch (error) {
        Logger.error('[removePendingEmployee] Error:', error.message || error);
    }
}

// ============================================
// CALENDAR GENERATION
// ============================================

/** @function generateEditorCalendar */
function generateEditorCalendar() {
    try {
        const grid = document.getElementById('editorCalendarGrid');
        if (!grid) return;
        const monthYear = document.getElementById('editorMonthYear');

        // Use the schedule's actual month/year fields, not the name string
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];

        // Primary: use schedule.month + schedule.year fields
        let month, year;
        if (currentEditingSchedule.month && currentEditingSchedule.year) {
            month = monthNames.findIndex(m => m === currentEditingSchedule.month);
            year = parseInt(currentEditingSchedule.year);
            if (month === -1) {
                // month might be a number string like "3"
                month = parseInt(currentEditingSchedule.month) - 1;
            }
        } else {
            // Fallback: try parsing from name
            month = monthNames.findIndex(m => (currentEditingSchedule.name || '').includes(m));
            const yearMatch = (currentEditingSchedule.name || '').match(/\d{4}/);
            year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
            if (month === -1) month = new Date().getMonth();
        }

        // Safety clamp
        if (isNaN(year) || year < 2020 || year > 2035) year = new Date().getFullYear();
        if (isNaN(month) || month < 0 || month > 11) month = new Date().getMonth();

        // Update month/year display
        if (monthYear) monthYear.textContent = `${monthNames[month]} ${year}`;

        // Clear grid
        grid.textContent = '';

        // Add day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'calendar-day-header';
            header.textContent = day;
            grid.appendChild(header);
        });

        // Get first day of month and total days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Add empty cells for days before first day of month
        for(let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            grid.appendChild(emptyCell);
        }

        // Add days
        for(let day = 1; day <= daysInMonth; day++) {
            const dayCell = createDayCell(year, month, day);
            grid.appendChild(dayCell);
        }
    } catch (error) {
        Logger.error('[generateEditorCalendar] Error:', error.message || error);
    }
}

/** @function createDayCell */
function createDayCell(year, month, day) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.dataset.date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Check if weekend
    const dayOfWeek = new Date(year, month, day).getDay();
    if(dayOfWeek === 0 || dayOfWeek === 6) {
        dayCell.classList.add('weekend');
    }

    // Day number
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayCell.appendChild(dayNumber);

    // Add existing crews for this day
    const dateStr = dayCell.dataset.date;
    const dayCrews = currentEditingSchedule.crews?.filter(c => c.date === dateStr) || [];

    dayCrews.forEach(crew => {
        const crewDiv = createCrewDiv(crew);
        dayCell.appendChild(crewDiv);
    });

    // Add drop zone
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dayCell.appendChild(dropZone);

    // Drop events
    dayCell.addEventListener('dragover', handleDragOver);
    dayCell.addEventListener('dragenter', handleDragEnter);
    dayCell.addEventListener('dragleave', handleDragLeave);
    dayCell.addEventListener('drop', handleDrop);

    // Double click to create crew
    dayCell.addEventListener('dblclick', () => showCreateCrewModal(dateStr));

    // Mobile: single tap to add shift (since no drag & drop on touch)
    dayCell.addEventListener('click', function(e) {
        if(window.innerWidth <= 768 && !e.target.closest('.crew-card') && !e.target.closest('.pending-employee')) {
            e.preventDefault();
            showCreateCrewModal(dateStr);
        }
    });

    return dayCell;
}

/** @function createCrewDiv */
function createCrewDiv(crew) {
    try {
        const crewDiv = document.createElement('div');
        const typeClass = (crew.type || 'ALS').toLowerCase().replace(/[^a-z]/g, '');
        crewDiv.className = 'crew-card ' + typeClass;
        crewDiv.draggable = true;
        crewDiv.dataset.crewId = crew.id;

        const paramedicName = crew.paramedic || 'Unassigned';
        const emtName       = crew.emt       || 'Unassigned';
        const isFullyStaffed = paramedicName !== 'Unassigned' && emtName !== 'Unassigned';
        const hours = crew.hours ? crew.hours + 'h' : '';

        // Overtime indicator: flag if staff member exceeds 72h in this schedule
        let overtimeWarning = '';
        if(currentEditingSchedule && isFullyStaffed) {
            const pHours = (currentEditingSchedule.crews || [])
                .filter(c => String(c.paramedicId) === String(crew.paramedicId))
                .reduce((n, c) => n + (parseInt(c.hours) || 12), 0);
            if(pHours > 72) overtimeWarning = ' <span title="Overtime warning" style="color:#e74c3c">⚠️</span>';
        }

        crewDiv.innerHTML =
            '<div class="crew-header" style="display:flex;justify-content:space-between;align-items:center;">' +
                '<strong class="crew-rig" style="font-size:.9rem">🚑 ' + sanitizeHTML(crew.rig || '?') + '</strong>' +
                '<span style="display:flex;align-items:center;gap:4px;">' +
                    '<span class="crew-type-badge" style="font-size:.7rem;padding:1px 6px;border-radius:8px">' + sanitizeHTML(crew.type || 'ALS') + '</span>' +
                    (hours ? '<span style="font-size:.7rem;color:#888">' + hours + '</span>' : '') +
                '</span>' +
            '</div>' +
            '<div class="crew-info" style="font-size:.8rem;margin:4px 0;">' +
                '<div style="color:' + (paramedicName === 'Unassigned' ? '#e74c3c' : '#2c3e50') + '">👨‍⚕️ ' + sanitizeHTML(paramedicName) + overtimeWarning + '</div>' +
                '<div style="color:' + (emtName === 'Unassigned' ? '#e74c3c' : '#2c3e50') + '">🏥 ' + sanitizeHTML(emtName) + '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">' +
                '<span style="font-size:.75rem;color:#888">⏰ ' + sanitizeHTML(crew.shiftType || '') + '</span>' +
                (!isFullyStaffed ? '<span style="font-size:.7rem;color:#e74c3c;font-weight:600">⚠ Incomplete</span>' : '') +
            '</div>' +
            '<button class="delete-crew" onclick="event.stopPropagation(); deleteCrew(&quot;' + sanitizeHTML(String(crew.id)) + '&quot;)" title="Delete shift" style="position:absolute;top:4px;right:4px;background:none;border:none;color:#aaa;cursor:pointer;font-size:1rem;line-height:1;padding:2px 4px;">&times;</button>';

        crewDiv.style.position = 'relative';

        // Crew drag events (for moving crews between days - desktop)
        crewDiv.addEventListener('dragstart', handleCrewDragStart);
        crewDiv.addEventListener('dragend', handleCrewDragEnd);

        // Mobile: tap to show action sheet
        crewDiv.addEventListener('click', function(e) {
            if(window.innerWidth <= 768) {
                e.stopPropagation();
                if(typeof showCrewActions === 'function') {
                    showCrewActions(crew.id);
                }
            }
        });

        return crewDiv;
    } catch (error) {
        Logger.error('[createCrewDiv] Error:', error.message || error);
    }
}

/** @function handleCrewDragStart */
function handleCrewDragStart(e) {
    if (!currentEditingSchedule || !currentEditingSchedule.crews) return;
    const crewId = e.target.dataset.crewId;
    draggedCrew = currentEditingSchedule.crews.find(c => String(c.id) === String(crewId));
    e.target.classList.add('dragging-crew');
    e.dataTransfer.setData('text/plain', 'crew');
}

/** @function handleCrewDragEnd */
function handleCrewDragEnd(e) {
    e.target.classList.remove('dragging-crew');
    draggedCrew = null;
}

/** @function deleteCrew */
function deleteCrew(crewId) {
    if(!confirm('Remove this crew shift? This cannot be undone.')) return;

    const crewIndex = currentEditingSchedule.crews.findIndex(c => String(c.id) === String(crewId));
    if(crewIndex > -1) {
        currentEditingSchedule.crews.splice(crewIndex, 1);
        saveSchedules();
        generateEditorCalendar();
        updateScheduleStats();
    }
}

// ============================================
// CREW CREATION MODAL
// ============================================

/** @function showCreateCrewModal */
function showCreateCrewModal(dateStr) {
    try {
        if(!currentEditingSchedule) {
            showAlert('Please open a schedule first before adding shifts.', 'error');
            return;
        }

        // Reset form and editing state
        const form = document.getElementById('createCrewForm');
        if(form) {
            form.reset();
            delete form.dataset.editingId;
        }

        const titleEl = document.getElementById('crewModalTitle');
        if(titleEl) titleEl.textContent = 'Add Shift to Schedule';

        // Set date
        const dateInput = document.getElementById('crewDate');
        if(dateInput) dateInput.value = dateStr || '';

        // Populate rig dropdown
        const rigSelect = document.getElementById('crewRig');
        if(rigSelect) {
            rigSelect.innerHTML = `
                <option value="">Select Rig</option>
                <option value="3F16">3F16 (ALS)</option>
                <option value="3F17">3F17 (ALS)</option>
                <option value="3F18">3F18 (ALS)</option>
                <option value="3F23">3F23 (BLS)</option>
                <option value="3F24">3F24 (BLS)</option>
            `;

            // Auto-update crew type based on rig
            rigSelect.onchange = function() {
                const crewTypeInput = document.getElementById('crewType');
                if(crewTypeInput) {
                    crewTypeInput.value = this.value.startsWith('3F1') ? 'ALS' : 'BLS';
                }
            };
        }

        // Populate shift type dropdown
        const shiftSelect = document.getElementById('crewShiftType');
        if(shiftSelect) {
            shiftSelect.innerHTML = `
                <option value="">Select Shift</option>
                <option value="0730-0730 (24hr)">0730-0730 (24hr)</option>
                <option value="0730-1930 (Day)">0730-1930 (Day)</option>
                <option value="1930-0730 (Night)">1930-0730 (Night)</option>
            `;
        }

        // Clear crew type
        const crewTypeInput = document.getElementById('crewType');
        if(crewTypeInput) crewTypeInput.value = '';

        // Populate employee dropdowns using safe DOM construction (not innerHTML/textContent with HTML strings)
        const paramedicSelect = document.getElementById('crewParamedic');
        const emtSelect = document.getElementById('crewEMT');

        const paramedics = users.filter(u => u.role === 'paramedic');
        const emts = users.filter(u => u.role === 'emt');

        // Helper: check if staff member is available on dateStr
        const isOnTimeOff = (staffId) => {
            const tol = typeof timeoffRequests !== 'undefined' ? timeoffRequests : [];
            return tol.some(t =>
                String(t.staffId) === String(staffId) &&
                t.status === 'approved' && dateStr >= t.startDate && dateStr <= t.endDate
            );
        };
        const isAlreadyAssigned = (staffId) => {
            return (currentEditingSchedule.crews || []).some(c =>
                c.date === dateStr &&
                (String(c.paramedicId) === String(staffId) || String(c.emtId) === String(staffId))
            );
        };
        const getScheduledHours = (staffId) => {
            return (currentEditingSchedule.crews || [])
                .filter(c => String(c.paramedicId) === String(staffId) || String(c.emtId) === String(staffId))
                .reduce((n, c) => n + (parseInt(c.hours) || 12), 0);
        };

        const buildStaffOpts = (select, staffList, placeholder) => {
            if(!select) return;
            select.innerHTML = '';
            const ph = document.createElement('option');
            ph.value = '';
            ph.textContent = placeholder;
            select.appendChild(ph);
            staffList.forEach(s => {
                const opt   = document.createElement('option');
                const hrs   = getScheduledHours(s.id);
                const toOff = isOnTimeOff(s.id);
                const busy  = isAlreadyAssigned(s.id);
                opt.value = s.id;
                let label = (s.fullName || s.username);
                if(toOff)        { label += ' 🚫 (Time Off)';   opt.disabled = true; opt.style.color = '#ccc'; }
                else if(busy)    { label += ' ⚠️ (Busy)';       opt.style.color = '#e67e22'; }
                else if(hrs > 60){ label += ' ⚠️ OT (' + hrs + 'h)'; opt.style.color = '#e74c3c'; }
                else             { label += ' ✅ (' + hrs + 'h in sched)'; }
                opt.textContent = label;
                select.appendChild(opt);
            });
        };

        buildStaffOpts(paramedicSelect, paramedics, 'Select Paramedic');
        buildStaffOpts(emtSelect, emts, 'Select EMT');

        showModal('createCrewModal');
    } catch (error) {
        Logger.error('[showCreateCrewModal] Error:', error.message || error);
    }
}

/** @function saveCrew */
function saveCrew() {
    try {
        const form = document.getElementById('createCrewForm');
        const editingId = form?.dataset?.editingId;

        const date = document.getElementById('crewDate').value;
        const rig = document.getElementById('crewRig').value;
        const shiftType = document.getElementById('crewShiftType').value;
        const paramedicId = document.getElementById('crewParamedic').value;
        const emtId = document.getElementById('crewEMT').value;
        const crewType = document.getElementById('crewType').value;

        if(!date || !rig || !shiftType) {
            showAlert('Please fill in Date, Rig, and Shift Type!', 'error');
            return;
        }

        if(!paramedicId && !emtId) {
            showAlert('Please assign at least one crew member!', 'error');
            return;
        }

        if(!currentEditingSchedule) {
            showAlert('No schedule is currently being edited. Please open a schedule first.', 'error');
            return;
        }

        const paramedic = paramedicId ? users.find(u => String(u.id) === String(paramedicId)) : null;
        const emt = emtId ? users.find(u => String(u.id) === String(emtId)) : null;

        // If editing, remove old crew first
        if(editingId) {
            const oldIndex = currentEditingSchedule.crews?.findIndex(c => String(c.id) === String(editingId));
            if(oldIndex > -1) {
                currentEditingSchedule.crews.splice(oldIndex, 1);
            }
        } else {
            // Check for conflicts only when creating new
            const existingCrew = currentEditingSchedule.crews?.find(
                c => c.date === date && c.rig === rig
            );

            if(existingCrew) {
                showAlert('This rig is already assigned for this day! Edit the existing shift instead.', 'error');
                return;
            }

            // Cross-schedule conflict detection: Check if paramedic/EMT is already assigned
            const conflict = checkCrossScheduleConflict(date, shiftType, paramedicId, emtId, currentEditingSchedule.id);
            if(conflict) {
                showAlert(conflict.message, 'error');
                return;
            }

            // Shift overlap detection: Check for overlapping shifts in other schedules
            const overlap = checkShiftOverlapCrossSchedule(date, shiftType, paramedicId, emtId, currentEditingSchedule.id);
            if(overlap && overlap.length > 0) {
                const overlapMsg = overlap.map(o => `- ${o.message}`).join('\n');
                showAlert(`Warning: Shift overlaps detected:\n${overlapMsg}\n\nConsider adjusting shift times or dates.`, 'warning');
            }

            // Rest period enforcement: Check minimum hours between shifts
            const restIssue = checkRestPeriodViolation(date, shiftType, paramedicId, emtId, currentEditingSchedule.id);
            if(restIssue && restIssue.length > 0) {
                const restMsg = restIssue.map(r => `- ${r.message}`).join('\n');
                showAlert(`Warning: Insufficient rest period detected:\n${restMsg}\n\nMinimum 8 hours required between shifts.`, 'warning');
            }

            // Maximum hours validation: Check if adding this shift would exceed max hours
            const hoursViolation = checkMaxHoursViolation(date, shiftType, paramedicId, emtId, currentEditingSchedule.id, editingId);
            if(hoursViolation && hoursViolation.length > 0) {
                const hoursMsg = hoursViolation.map(h => `- ${h.message}`).join('\n');
                showAlert(`Cannot add shift: Maximum hours violation:\n${hoursMsg}\n\nContact administrator to adjust schedule.`, 'error');
                return;
            }
        }

        // Create crew object
        const crew = {
            id: editingId || Date.now().toString(),
            date: date,
            rig: rig,
            shiftType: shiftType,
            type: crewType || (rig.startsWith('3F1') ? 'ALS' : 'BLS'),
            paramedicId: paramedicId,
            paramedic: paramedic ? paramedic.fullName : 'Unassigned',
            emtId: emtId,
            emt: emt ? emt.fullName : 'Unassigned',
            hours: shiftType.includes('24hr') ? 24 : 12
        };

        // Add to schedule
        if(!currentEditingSchedule.crews) {
            currentEditingSchedule.crews = [];
        }
        currentEditingSchedule.crews.push(crew);

        // Update employee hours
        if(paramedicId) updateEmployeeHours(paramedicId);
        if(emtId) updateEmployeeHours(emtId);

        // Save and refresh
        saveSchedules();
        saveUsers();
        generateEditorCalendar();
        updateScheduleStats();

        // Reset editing state
        if(form) delete form.dataset.editingId;
        const titleEl = document.getElementById('crewModalTitle');
        if(titleEl) titleEl.textContent = 'Add Shift to Schedule';

        closeModal('createCrewModal');
        showAlert(editingId ? 'Shift updated successfully!' : 'Shift added successfully!', 'success');
    } catch (error) {
        Logger.error('[saveCrew] Error:', error.message || error);
    }
}

/** @function updateEmployeeHours - Recalculates total hours from ALL schedules (not additive) */
function updateEmployeeHours(userId) {
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return;

    // Recalculate hours from scratch across all non-archived schedules
    let total = 0;
    (schedules || []).forEach(s => {
        if (s.status === 'archived') return;
        (s.crews || []).forEach(c => {
            if (String(c.paramedicId) === String(userId) || String(c.emtId) === String(userId)) {
                total += c.hours || (c.shiftType && c.shiftType.includes('24hr') ? 24 : 12);
            }
        });
    });

    user.hoursWorked = total;

    // Overtime warning
    if (total > 160 && featureStates && featureStates.overtimeAlerts) {
        showAlert(`⚠️ ${sanitizeHTML(user.fullName || user.username)} has ${total} hours this period (exceeds 160h limit)`, 'warning');
    }
}

/**
 * Calculate total hours worked across all schedules for a user
 * @param {string} userId - User ID to check
 * @returns {number} Total hours worked
 */
function calculateTotalHoursCrossSchedule(userId) {
    let totalHours = 0;

    if (!schedules || !Array.isArray(schedules)) {
        return totalHours;
    }

    for (const schedule of schedules) {
        if (schedule.status === 'archived') {
            continue;
        }

        if (!schedule.crews || !Array.isArray(schedule.crews)) {
            continue;
        }

        for (const crew of schedule.crews) {
            if (String(crew.paramedicId) === String(userId) || String(crew.emtId) === String(userId)) {
                totalHours += crew.hours || 12;
            }
        }
    }

    return totalHours;
}

// ============================================
// CROSS-SCHEDULE CONFLICT DETECTION
// ============================================

/**
 * Check if paramedic or EMT is already assigned to a shift on the same date in any other schedule
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} shiftType - Shift type (Day, Night, etc.)
 * @param {string} paramedicId - Paramedic ID to check
 * @param {string} emtId - EMT ID to check
 * @param {string} excludeScheduleId - Schedule ID to exclude from check (current schedule)
 * @returns {Object|null} Conflict object with message or null if no conflict
 */
function checkCrossScheduleConflict(date, shiftType, paramedicId, emtId, excludeScheduleId) {
    if (!schedules || !Array.isArray(schedules)) {
        return null;
    }

    for (const schedule of schedules) {
        // Skip current schedule and inactive schedules
        if (String(schedule.id) === String(excludeScheduleId) || schedule.status === 'archived') {
            continue;
        }

        if (!schedule.crews || !Array.isArray(schedule.crews)) {
            continue;
        }

        for (const crew of schedule.crews) {
            if (crew.date !== date) {
                continue;
            }

            // Check for same shift type overlap
            if (crew.shiftType === shiftType) {
                if (String(crew.paramedicId) === String(paramedicId) && paramedicId) {
                    const scheduleName = schedule.name || 'Unnamed Schedule';
                    return {
                        message: `Conflict: ${sanitizeHTML(crew.paramedic)} is already assigned to ${sanitizeHTML(scheduleName)} on ${date} (${shiftType} shift)`
                    };
                }
                if (String(crew.emtId) === String(emtId) && emtId) {
                    const scheduleName = schedule.name || 'Unnamed Schedule';
                    return {
                        message: `Conflict: ${sanitizeHTML(crew.emt)} is already assigned to ${sanitizeHTML(scheduleName)} on ${date} (${shiftType} shift)`
                    };
                }
            }
        }
    }

    return null;
}

/**
 * Check for time-overlapping shifts across all schedules (even if different shift types)
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} shiftType - Shift type (Day, Night, etc.)
 * @param {string} paramedicId - Paramedic ID to check
 * @param {string} emtId - EMT ID to check
 * @param {string} excludeScheduleId - Schedule ID to exclude from check
 * @returns {Array} Array of overlap objects with messages
 */
function checkShiftOverlapCrossSchedule(date, shiftType, paramedicId, emtId, excludeScheduleId) {
    const overlaps = [];

    if (!schedules || !Array.isArray(schedules)) {
        return overlaps;
    }

    // Get time range for the new shift
    const shiftTimes = parseShiftTime(shiftType);
    if (!shiftTimes) {
        return overlaps;
    }

    for (const schedule of schedules) {
        // Skip current schedule and inactive schedules
        if (String(schedule.id) === String(excludeScheduleId) || schedule.status === 'archived') {
            continue;
        }

        if (!schedule.crews || !Array.isArray(schedule.crews)) {
            continue;
        }

        for (const crew of schedule.crews) {
            // Check same date only
            if (crew.date !== date) {
                continue;
            }

            const existingShiftTimes = parseShiftTime(crew.shiftType);
            if (!existingShiftTimes) {
                continue;
            }

            // Check if shifts overlap in time
            const timesOverlap = doTimeRangesOverlap(shiftTimes, existingShiftTimes);

            if (timesOverlap) {
                const scheduleName = schedule.name || 'Unnamed Schedule';

                // Check paramedic overlap
                if (String(crew.paramedicId) === String(paramedicId) && paramedicId && crew.paramedic) {
                    overlaps.push({
                        message: `${sanitizeHTML(crew.paramedic)} has overlapping shift in ${sanitizeHTML(scheduleName)} (${crew.shiftType})`
                    });
                }

                // Check EMT overlap
                if (String(crew.emtId) === String(emtId) && emtId && crew.emt) {
                    overlaps.push({
                        message: `${sanitizeHTML(crew.emt)} has overlapping shift in ${sanitizeHTML(scheduleName)} (${crew.shiftType})`
                    });
                }
            }
        }
    }

    return overlaps;
}

/**
 * Parse shift time string to get start and end hours (24-hour format)
 * @param {string} shiftType - Shift type string (e.g., "0730-1930 (Day)")
 * @returns {Object|null} Object with startHour and endHour, or null
 */
function parseShiftTime(shiftType) {
    if (!shiftType || typeof shiftType !== 'string') {
        return null;
    }

    // Match pattern like "0730-1930" or "07:30-19:30"
    const match = shiftType.match(/(\d{2,4})[-:](\d{2,4})/);
    if (!match) {
        return null;
    }

    let start = parseInt(match[1].replace(':', ''));
    let end = parseInt(match[2].replace(':', ''));

    if (isNaN(start) || isNaN(end)) {
        return null;
    }

    // Normalize to 4-digit format (e.g., 730 -> 0730)
    if (start < 100) start *= 100;
    if (end < 100) end *= 100;

    return { startHour: start, endHour: end };
}

/**
 * Check if two time ranges overlap
 * @param {Object} range1 - First range with startHour and endHour
 * @param {Object} range2 - Second range with startHour and endHour
 * @returns {boolean} True if ranges overlap
 */
function doTimeRangesOverlap(range1, range2) {
    if (!range1 || !range2) {
        return false;
    }

    const s1 = range1.startHour;
    const e1 = range1.endHour;
    const s2 = range2.startHour;
    const e2 = range2.endHour;

    // Handle overnight shifts (e.g., 1900-0700)
    if (e1 < s1) {
        // Range1 is overnight
        if (e2 < s2) {
            // Both overnight - they overlap
            return true;
        }
        // Range1 overnight, Range2 normal - overlap if Range2 starts after s1 or ends before e1
        return s2 >= s1 || e2 <= e1;
    }

    if (e2 < s2) {
        // Range2 is overnight, Range1 normal
        return s1 >= s2 || s1 <= e2;
    }

    // Both normal ranges - check standard overlap
    return s1 < e2 && e1 > s2;
}

// ============================================
// REST PERIOD ENFORCEMENT
// ============================================

/**
 * Check if employee has sufficient rest period between shifts (8 hours minimum)
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} shiftType - Shift type (Day, Night, etc.)
 * @param {string} paramedicId - Paramedic ID to check
 * @param {string} emtId - EMT ID to check
 * @param {string} excludeScheduleId - Schedule ID to exclude from check
 * @returns {Array} Array of violation objects with messages
 */
function checkRestPeriodViolation(date, shiftType, paramedicId, emtId, excludeScheduleId) {
    const violations = [];
    const MIN_REST_HOURS = 8;

    if (!schedules || !Array.isArray(schedules)) {
        return violations;
    }

    // Get time range for the new shift
    const shiftTimes = parseShiftTime(shiftType);
    if (!shiftTimes) {
        return violations;
    }

    // Parse the target date
    const targetDate = new Date(date);

    // Check all schedules for previous/next shifts
    for (const schedule of schedules) {
        if (String(schedule.id) === String(excludeScheduleId) || schedule.status === 'archived') {
            continue;
        }

        if (!schedule.crews || !Array.isArray(schedule.crews)) {
            continue;
        }

        for (const crew of schedule.crews) {
            // Check shifts within 2 days before and after (to catch night shifts)
            const crewDate = new Date(crew.date);
            const dayDiff = Math.abs((crewDate - targetDate) / (1000 * 60 * 60 * 24));

            if (dayDiff > 2) {
                continue;
            }

            const existingShiftTimes = parseShiftTime(crew.shiftType);
            if (!existingShiftTimes) {
                continue;
            }

            // Calculate rest hours between shifts
            const restHours = calculateRestHours(shiftTimes, existingShiftTimes, dayDiff);

            if (restHours < MIN_REST_HOURS) {
                const scheduleName = schedule.name || 'Unnamed Schedule';

                // Check paramedic
                if (String(crew.paramedicId) === String(paramedicId) && paramedicId && crew.paramedic) {
                    const shiftDirection = crewDate < targetDate ? 'Previous' : 'Following';
                    violations.push({
                        message: `${sanitizeHTML(crew.paramedic)}: ${shiftDirection} shift in ${sanitizeHTML(scheduleName)} on ${crew.date} (${crew.shiftType}) provides only ${restHours.toFixed(1)}h rest (min 8h)`
                    });
                }

                // Check EMT
                if (String(crew.emtId) === String(emtId) && emtId && crew.emt) {
                    const shiftDirection = crewDate < targetDate ? 'Previous' : 'Following';
                    violations.push({
                        message: `${sanitizeHTML(crew.emt)}: ${shiftDirection} shift in ${sanitizeHTML(scheduleName)} on ${crew.date} (${crew.shiftType}) provides only ${restHours.toFixed(1)}h rest (min 8h)`
                    });
                }
            }
        }
    }

    return violations;
}

/**
 * Calculate rest hours between two shifts
 * @param {Object} shift1 - First shift with startHour and endHour
 * @param {Object} shift2 - Second shift with startHour and endHour
 * @param {number} dayDiff - Day difference between shifts (0 = same day)
 * @returns {number} Rest hours between shifts
 */
function calculateRestHours(shift1, shift2, dayDiff) {
    if (!shift1 || !shift2) {
        return 24;
    }

    const s1 = shift1.startHour;
    const e1 = shift1.endHour;
    const s2 = shift2.startHour;
    const e2 = shift2.endHour;

    let restHours = 0;

    // Convert to decimal hours for calculation
    const toHours = (time) => Math.floor(time / 100) + (time % 100) / 60;

    if (dayDiff === 0) {
        // Same day - calculate rest between shifts
        if (e1 < s1 && e2 < s2) {
            // Both overnight - special case
            restHours = (toHours(s1) - toHours(e1) + 24) + (toHours(s2) - toHours(e2) + 24);
        } else if (e1 < s1) {
            // Shift1 overnight, shift2 normal
            restHours = toHours(s2) + (24 - toHours(e1));
        } else if (e2 < s2) {
            // Shift2 overnight, shift1 normal
            restHours = toHours(s1) + (24 - toHours(e2));
        } else {
            // Both normal - rest is between them
            if (e1 < s2) {
                restHours = toHours(s2) - toHours(e1);
            } else if (e2 < s1) {
                restHours = toHours(s1) - toHours(e2);
            }
        }
    } else if (dayDiff === 1) {
        // Adjacent days
        if (e1 < s1) {
            // Shift1 overnight, shift2 normal next day
            restHours = toHours(s2) + (24 - toHours(e1));
        } else if (e2 < s2) {
            // Shift2 overnight next day
            restHours = toHours(s2) + (24 - toHours(e1));
        } else {
            // Both normal
            restHours = (24 - toHours(e1)) + toHours(s2);
        }
    } else {
        // More than 1 day apart - assume sufficient rest
        restHours = 48;
    }

    return Math.abs(restHours);
}

// ============================================
// MAXIMUM HOURS VALIDATION
// ============================================

/**
 * Check if adding this shift would exceed maximum hours for employees
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} shiftType - Shift type
 * @param {string} paramedicId - Paramedic ID to check
 * @param {string} emtId - EMT ID to check
 * @param {string} excludeScheduleId - Schedule ID to exclude from check
 * @param {string} editingId - Crew ID being edited (null if new)
 * @returns {Array} Array of violation objects with messages
 */
function checkMaxHoursViolation(date, shiftType, paramedicId, emtId, excludeScheduleId, editingId) {
    const violations = [];
    const MAX_MONTHLY_HOURS = 160;

    if (!schedules || !Array.isArray(schedules)) {
        return violations;
    }

    // Calculate hours for this shift (default 12, or extract from shift type)
    const shiftHours = extractShiftHours(shiftType);

    // Check paramedic
    if (paramedicId) {
        const paramedicHours = calculateTotalHoursCrossSchedule(paramedicId);

        // If editing, subtract the hours of the crew being edited
        let hoursToSubtract = 0;
        if (editingId) {
            const currentCrew = findCrewById(excludeScheduleId, editingId);
            if (currentCrew && String(currentCrew.paramedicId) === String(paramedicId)) {
                hoursToSubtract = currentCrew.hours || extractShiftHours(currentCrew.shiftType);
            }
        }

        const projectedHours = paramedicHours - hoursToSubtract + shiftHours;

        if (projectedHours > MAX_MONTHLY_HOURS) {
            const paramedic = users.find(u => String(u.id) === String(paramedicId));
            const name = paramedic ? (paramedic.fullName || paramedic.username) : 'Unknown';
            violations.push({
                message: `${sanitizeHTML(name)} would exceed ${MAX_MONTHLY_HOURS} hours this month (${projectedHours} total, current: ${paramedicHours - hoursToSubtract})`
            });
        }
    }

    // Check EMT
    if (emtId) {
        const emtHours = calculateTotalHoursCrossSchedule(emtId);

        let hoursToSubtract = 0;
        if (editingId) {
            const currentCrew = findCrewById(excludeScheduleId, editingId);
            if (currentCrew && String(currentCrew.emtId) === String(emtId)) {
                hoursToSubtract = currentCrew.hours || extractShiftHours(currentCrew.shiftType);
            }
        }

        const projectedHours = emtHours - hoursToSubtract + shiftHours;

        if (projectedHours > MAX_MONTHLY_HOURS) {
            const emt = users.find(u => String(u.id) === String(emtId));
            const name = emt ? (emt.fullName || emt.username) : 'Unknown';
            violations.push({
                message: `${sanitizeHTML(name)} would exceed ${MAX_MONTHLY_HOURS} hours this month (${projectedHours} total, current: ${emtHours - hoursToSubtract})`
            });
        }
    }

    return violations;
}

/**
 * Extract hours from shift type string
 * @param {string} shiftType - Shift type string
 * @returns {number} Hours for the shift
 */
function extractShiftHours(shiftType) {
    if (!shiftType) {
        return 12;
    }

    const lowerShift = shiftType.toLowerCase();

    if (lowerShift.includes('24') || lowerShift.includes('24-hour')) {
        return 24;
    } else if (lowerShift.includes('12') || lowerShift.includes('12-hour')) {
        return 12;
    } else if (lowerShift.includes('night')) {
        return 12;
    } else if (lowerShift.includes('day')) {
        return 12;
    }

    return 12;
}

/**
 * Find a crew by ID within a schedule
 * @param {string} scheduleId - Schedule ID
 * @param {string} crewId - Crew ID
 * @returns {Object|null} Crew object or null
 */
function findCrewById(scheduleId, crewId) {
    const schedule = schedules.find(s => String(s.id) === String(scheduleId));
    if (!schedule || !schedule.crews) {
        return null;
    }
    return schedule.crews.find(c => String(c.id) === String(crewId));
}

// ============================================
// SCHEDULE STATISTICS
// ============================================

/** @function updateScheduleStats */
function updateScheduleStats() {
    try {
        const crews = currentEditingSchedule ? (currentEditingSchedule.crews || []) : [];
        const totalShifts = crews.length;
        const totalHours  = crews.reduce((sum, c) => sum + (parseInt(c.hours) || 12), 0);
        const alsCrews    = crews.filter(c => c.type === 'ALS').length;
        const blsCrews    = crews.filter(c => c.type === 'BLS').length;
        const incomplete  = crews.filter(c => !c.paramedicId || !c.emtId).length;

        // Unique staff + days
        const staffSet = new Set();
        crews.forEach(c => { if(c.paramedicId) staffSet.add(c.paramedicId); if(c.emtId) staffSet.add(c.emtId); });
        const dates      = [...new Set(crews.map(c => c.date))].sort();
        const daysCovered = dates.length;

        // Coverage: how many days of the schedule month have ≥1 crew
        let daysInMonth = 30;
        if(currentEditingSchedule && currentEditingSchedule.month && currentEditingSchedule.year) {
            const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const mIdx = MONTHS.indexOf(currentEditingSchedule.month);
            if(mIdx >= 0) daysInMonth = new Date(parseInt(currentEditingSchedule.year), mIdx + 1, 0).getDate();
        }
        const covPct = daysInMonth > 0 ? Math.round((daysCovered / daysInMonth) * 100) : 0;

        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        set('statTotalShifts',  totalShifts);
        set('statTotalHours',   totalHours);
        set('statALSCrews',     alsCrews);
        set('statBLSCrews',     blsCrews);
        set('statDaysCovered',  daysCovered + '/' + daysInMonth + ' (' + covPct + '%)');
        set('statStaffCount',   staffSet.size);

        // Incomplete warning badge
        const warnEl = document.getElementById('statIncompleteWarning');
        if(warnEl) {
            warnEl.textContent = incomplete > 0 ? '⚠️ ' + incomplete + ' incomplete' : '✅ All staffed';
            warnEl.style.color = incomplete > 0 ? '#e74c3c' : '#27ae60';
        }

        // Progress bar
        const bar = document.getElementById('scheduleCoverageBar');
        if(bar) {
            const barColor = covPct < 50 ? '#e74c3c' : covPct < 80 ? '#f39c12' : '#27ae60';
            bar.style.width = covPct + '%';
            bar.style.background = barColor;
        }

        // Also update totalHours on the schedule object itself
        if(currentEditingSchedule) currentEditingSchedule.totalHours = totalHours;
    } catch (error) {
        Logger.error('[updateScheduleStats] Error:', error.message || error);
    }
}

// ============================================
// SAVE & PUBLISH
// ============================================

/** @function saveScheduleChanges */
function saveScheduleChanges() {
    saveSchedules();
    alert('Schedule saved successfully!');
    closeScheduleEditor();
}

/** @function publishScheduleFromEditor */
function publishScheduleFromEditor() {
    if(!confirm('Are you sure you want to publish this schedule? This will make it visible to all staff.')) return;

    currentEditingSchedule.status = 'published';
    currentEditingSchedule.publishedAt = new Date().toISOString();

    saveSchedules();
    showAlert('Schedule published successfully!', 'success');
    closeScheduleEditor();

    // Refresh draft schedules list
    loadDraftSchedules();
    loadPublishedSchedules();
    updateSidebarBadges();
}

/** @function closeScheduleEditor */
function closeScheduleEditor() {
    try {
        document.getElementById('scheduleEditor').classList.add('hidden');
        document.getElementById('bossDrafts').classList.remove('hidden');
        currentEditingSchedule = null;
    } catch (error) {
        Logger.error('[closeScheduleEditor] Error:', error.message || error);
    }
}

// ============================================
// SHIFT TEMPLATES
// ============================================

/** @function initializeShiftTemplates */
function initializeShiftTemplates() {
    try {
        const templateSelect = document.getElementById('shiftTemplate');
        templateSelect.innerHTML = `
            <option value="">Quick Add Template</option>
            <option value="day-crew">Day Crew (ALS)</option>
            <option value="night-crew">Night Crew (ALS)</option>
            <option value="24hr-crew">24hr Crew (ALS)</option>
            <option value="bls-day">BLS Day Crew</option>
            <option value="bls-night">BLS Night Crew</option>
        `;
    } catch (error) {
        Logger.error('[initializeShiftTemplates] Error:', error.message || error);
    }
}

/**
 * Shift template configurations
 */
const SHIFT_TEMPLATES = {
    'day-crew': { rig: '3F16', shiftType: '0730-1930 (Day)', type: 'ALS', hours: 12, needsParamedic: true },
    'night-crew': { rig: '3F17', shiftType: '1930-0730 (Night)', type: 'ALS', hours: 12, needsParamedic: true },
    '24hr-crew': { rig: '3F18', shiftType: '0730-0730 (24hr)', type: 'ALS', hours: 24, needsParamedic: true },
    'bls-day': { rig: '3F23', shiftType: '0730-1930 (Day)', type: 'BLS', hours: 12, needsParamedic: false },
    'bls-night': { rig: '3F24', shiftType: '1930-0730 (Night)', type: 'BLS', hours: 12, needsParamedic: false }
};

/**
 * Get available staff for a shift template
 * @param {string} date - Date string
 * @param {boolean} needsParamedic - Whether paramedic is needed
 * @returns {Object} Object with availableParamedic and availableEMT
 */
function getAvailableStaffForTemplate(date, needsParamedic) {
    const availableParamedic = needsParamedic ? users.find(u =>
        u.role === 'paramedic' &&
        !isEmployeeAssignedOnDate(u.id, date)
    ) : null;
    
    const availableEMT = users.find(u =>
        u.role === 'emt' &&
        !isEmployeeAssignedOnDate(u.id, date)
    );
    
    return { availableParamedic, availableEMT };
}

/**
 * Create crew from template configuration
 * @param {string} templateKey - Template key
 * @param {string} date - Date string
 * @param {Object} paramedic - Paramedic user object
 * @param {Object} emt - EMT user object
 * @returns {Object} Crew object
 */
function createCrewFromTemplate(templateKey, date, paramedic, emt) {
    const template = SHIFT_TEMPLATES[templateKey];
    if (!template) return null;
    
    return {
        id: Date.now().toString(),
        date: date,
        rig: template.rig,
        shiftType: template.shiftType,
        type: template.type,
        paramedicId: paramedic ? paramedic.id : '',
        paramedic: paramedic ? paramedic.fullName : '',
        emtId: emt ? emt.id : '',
        emt: emt ? emt.fullName : '',
        hours: template.hours
    };
}

/**
 * Add crew to current schedule
 * @param {Object} crew - Crew object to add
 */
function addCrewToSchedule(crew) {
    if (!crew) return;
    
    if (!currentEditingSchedule.crews) {
        currentEditingSchedule.crews = [];
    }
    currentEditingSchedule.crews.push(crew);
    
    if (crew.paramedicId) updateEmployeeHours(crew.paramedicId);
    if (crew.emtId) updateEmployeeHours(crew.emtId);
    
    saveSchedules();
    saveUsers();
    generateEditorCalendar();
    updateScheduleStats();
}

/** @function applyShiftTemplate */
function applyShiftTemplate() {
    try {
        const template = document.getElementById('shiftTemplate').value;
        const date = document.getElementById('templateDate').value;

        if (!template || !date) {
            alert('Please select a template and date!');
            return;
        }
        
        const templateConfig = SHIFT_TEMPLATES[template];
        if (!templateConfig) {
            alert('Invalid template selected!');
            return;
        }

        const { availableParamedic, availableEMT } = getAvailableStaffForTemplate(date, templateConfig.needsParamedic);

        if (templateConfig.needsParamedic && !availableParamedic) {
            alert('No available paramedic for this template!');
            return;
        }
        
        if (!availableEMT) {
            alert('No available EMT for this template!');
            return;
        }

        const crew = createCrewFromTemplate(template, date, availableParamedic, availableEMT);
        addCrewToSchedule(crew);
        
    } catch (error) {
        Logger.error('[applyShiftTemplate] Error:', error.message || error);
    }
}

/** @function isEmployeeAssignedOnDate */
function isEmployeeAssignedOnDate(employeeId, date) {
    return currentEditingSchedule.crews?.some(
        c => c.date === date && (String(c.paramedicId) === String(employeeId) || String(c.emtId) === String(employeeId))
    );
}

/**
 * Check if employee is assigned to any schedule on a specific date (cross-schedule check)
 * @param {string} employeeId - Employee ID to check
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} excludeScheduleId - Schedule ID to exclude from check
 * @returns {boolean} True if employee is assigned in any other schedule
 */
function isEmployeeAssignedCrossSchedule(employeeId, date, excludeScheduleId) {
    if (!schedules || !Array.isArray(schedules)) {
        return false;
    }

    for (const schedule of schedules) {
        if (String(schedule.id) === String(excludeScheduleId) || schedule.status === 'archived') {
            continue;
        }

        if (!schedule.crews || !Array.isArray(schedule.crews)) {
            continue;
        }

        const isAssigned = schedule.crews.some(
            c => c.date === date && (String(c.paramedicId) === String(employeeId) || String(c.emtId) === String(employeeId))
        );

        if (isAssigned) {
            return true;
        }
    }

    return false;
}

// ============================================
// DUPLICATE SCHEDULE
// ============================================

/** @function duplicateSchedule */
function duplicateSchedule() {
    try {
        const targetMonth = document.getElementById('duplicateMonth').value;
        const targetYear = document.getElementById('duplicateYear').value;

        if(!targetMonth || !targetYear) {
            alert('Please select target month and year!');
            return;
        }

        const newScheduleName = `${targetMonth} ${targetYear}`;
        const existingSchedule = schedules.find(s => s.name === newScheduleName);

        if(existingSchedule) {
            alert('A schedule for this month already exists!');
            return;
        }

        // Create duplicate schedule
        const duplicateSchedule = safeJSONParse(JSON.stringify(currentEditingSchedule), null);
        duplicateSchedule.id = Date.now().toString();
        duplicateSchedule.name = newScheduleName;
        duplicateSchedule.status = 'draft';
        duplicateSchedule.createdAt = new Date().toISOString();
        duplicateSchedule.publishedAt = null;

        // Map dates to new month
        const monthMap = {
            'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
            'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
        };

        const oldMonthIndex = monthMap[currentEditingSchedule.name.split(' ')[0]];
        const newMonthIndex = monthMap[targetMonth];
        const oldYear = parseInt(currentEditingSchedule.name.split(' ')[1]);
        const newYear = parseInt(targetYear);

        if(duplicateSchedule.crews) {
            duplicateSchedule.crews.forEach(crew => {
                const oldDate = new Date(crew.date);
                const day = oldDate.getDate();
                const dayOfWeek = oldDate.getDay();

                // Find the same day of week in the target month
                const newDate = new Date(newYear, newMonthIndex, 1);
                while(newDate.getDay() !== dayOfWeek) {
                    newDate.setDate(newDate.getDate() + 1);
                }
                newDate.setDate(day);

                crew.date = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;
            });
        }

        schedules.push(duplicateSchedule);
        saveSchedules();

        showAlert(`Schedule duplicated to ${newScheduleName}!`, 'warning');
        closeModal('duplicateModal');
    } catch (error) {
        Logger.error('[duplicateSchedule] Error:', error.message || error);
    }
}

// ============================================
// EXPORT SCHEDULE
// ============================================

/** @function exportSchedule */
function exportSchedule() {
    if(!currentEditingSchedule.crews) {
        alert('No crews to export!');
        return;
    }

    let csv = 'Date,Rig,Shift Type,Type,Paramedic,EMT,Hours\n';

    currentEditingSchedule.crews.sort((a, b) => a.date.localeCompare(b.date)).forEach(crew => {
        csv += `${crew.date},${sanitizeHTML(crew.rig)},${crew.shiftType},${crew.type},${sanitizeHTML(crew.paramedic)},${sanitizeHTML(crew.emt)},${crew.hours}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentEditingSchedule.name.replace(/\s+/g, '_')}_Schedule.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}
