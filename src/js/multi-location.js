/**
 * Multi-Location Support Module
 * Recommendation #25 - Adds support for multiple station locations
 * 
 * Features:
 * - Location CRUD (create, read, update, delete)
 * - Location assignment for users, schedules, crews
 * - Location filter on Boss dashboard
 * - Location management UI in Super Admin
 */


const MultiLocation = (function() {
    'use strict';

    const STORAGE_KEY = 'lifestarLocations';
    const ACTIVE_LOCATION_KEY = 'lifestarActiveLocation';

    // Default locations
    const DEFAULT_LOCATIONS = [
        { id: 1, name: 'Station 1 - Main', code: 'STN1', address: '100 Main Street', city: 'Hartford', state: 'CT', zip: '06101', phone: '555-0100', active: true, createdAt: new Date().toISOString() },
        { id: 2, name: 'Station 2 - North', code: 'STN2', address: '200 North Avenue', city: 'Windsor', state: 'CT', zip: '06095', phone: '555-0200', active: true, createdAt: new Date().toISOString() },
        { id: 3, name: 'Station 3 - South', code: 'STN3', address: '300 South Road', city: 'Wethersfield', state: 'CT', zip: '06109', phone: '555-0300', active: true, createdAt: new Date().toISOString() }
    ];

    /** Load locations from localStorage */
    function getLocations() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return safeJSONParse(saved, DEFAULT_LOCATIONS);
        }
        // Initialize with defaults
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LOCATIONS));
        return [...DEFAULT_LOCATIONS];
    }

    /** Save locations to localStorage */
    function saveLocations(locations) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
    }

    /** Get active locations only */
    function getActiveLocations() {
        return getLocations().filter(function(l) { return l.active; });
    }

    /** Get location by ID */
    function getLocationById(id) {
        return getLocations().find(function(l) { return l.id === parseInt(id); });
    }

    /** Get currently selected location filter (null = all) */
    function getActiveLocationFilter() {
        const saved = localStorage.getItem(ACTIVE_LOCATION_KEY);
        return saved ? parseInt(saved) : null;
    }

    /** Set active location filter */
    function setActiveLocationFilter(locationId) {
        if (locationId === null || locationId === 'all') {
            localStorage.removeItem(ACTIVE_LOCATION_KEY);
        } else {
            localStorage.setItem(ACTIVE_LOCATION_KEY, String(locationId));
        }
    }

    /** Add a new location */
    function addLocation(locationData) {
        const locations = getLocations();
        const newLocation = {
            id: Date.now(),
            name: (locationData.name || '').trim(),
            code: (locationData.code || '').trim().toUpperCase(),
            address: (locationData.address || '').trim(),
            city: (locationData.city || '').trim(),
            state: (locationData.state || '').trim(),
            zip: (locationData.zip || '').trim(),
            phone: (locationData.phone || '').trim(),
            active: true,
            createdAt: new Date().toISOString()
        };

        if (!newLocation.name || !newLocation.code) {
            if (typeof showAlert === 'function') showAlert('Location name and code are required', 'warning');
            return null;
        }

        // Check for duplicate code
        if (locations.some(function(l) { return l.code === newLocation.code; })) {
            if (typeof showAlert === 'function') showAlert('Location code already exists', 'danger');
            return null;
        }

        locations.push(newLocation);
        saveLocations(locations);
        if (typeof addSystemLog === 'function') addSystemLog('Location added: ' + newLocation.name);
        return newLocation;
    }

    /** Update an existing location */
    function updateLocation(id, updates) {
        const locations = getLocations();
        const idx = locations.findIndex(function(l) { return l.id === parseInt(id); });
        if (idx === -1) return false;

        // Check for duplicate code if code changed
        if (updates.code && updates.code !== locations[idx].code) {
            if (locations.some(function(l) { return l.code === updates.code && l.id !== parseInt(id); })) {
                if (typeof showAlert === 'function') showAlert('Location code already exists', 'danger');
                return false;
            }
        }

        Object.keys(updates).forEach(function(key) {
            if (key !== 'id' && key !== 'createdAt') {
                locations[idx][key] = updates[key];
            }
        });

        locations[idx].updatedAt = new Date().toISOString();
        saveLocations(locations);
        if (typeof addSystemLog === 'function') addSystemLog('Location updated: ' + locations[idx].name);
        return true;
    }

    /** Delete a location (soft delete - marks inactive) */
    function deleteLocation(id) {
        const locations = getLocations();
        const idx = locations.findIndex(function(l) { return l.id === parseInt(id); });
        if (idx === -1) return false;

        const name = locations[idx].name;
        locations[idx].active = false;
        locations[idx].deletedAt = new Date().toISOString();
        saveLocations(locations);
        if (typeof addSystemLog === 'function') addSystemLog('Location deactivated: ' + name);
        return true;
    }

    /** Reactivate a location */
    function reactivateLocation(id) {
        const locations = getLocations();
        const idx = locations.findIndex(function(l) { return l.id === parseInt(id); });
        if (idx === -1) return false;

        locations[idx].active = true;
        delete locations[idx].deletedAt;
        saveLocations(locations);
        if (typeof addSystemLog === 'function') addSystemLog('Location reactivated: ' + locations[idx].name);
        return true;
    }

    /** Assign a user to a location */
    function assignUserToLocation(userId, locationId) {
        if (typeof users === 'undefined' || !Array.isArray(users)) return false;
        const user = users.find(function(u) { return u.id === parseInt(userId); });
        if (!user) return false;

        user.locationId = locationId ? parseInt(locationId) : null;
        if (typeof saveData === 'function') saveData();
        return true;
    }

    /** Get users at a specific location */
    function getUsersByLocation(locationId) {
        if (typeof users === 'undefined' || !Array.isArray(users)) return [];
        if (!locationId || locationId === 'all') return users;
        return users.filter(function(u) { return u.locationId === parseInt(locationId); });
    }

    /** Get schedules for a specific location */
    function getSchedulesByLocation(locationId) {
        if (typeof schedules === 'undefined' || !Array.isArray(schedules)) return [];
        if (!locationId || locationId === 'all') return schedules || [];
        return (schedules || []).filter(function(s) { return s.locationId === parseInt(locationId); });
    }

    /** Build location selector dropdown HTML */
    function buildLocationSelector(selectedId, elementId, includeAll) {
        const locations = getActiveLocations();
        const html = '<select id="' + (elementId || 'locationSelect') + '" class="form-control location-selector">';
        if (includeAll !== false) {
            html += '<option value="all"' + (!selectedId || selectedId === 'all' ? ' selected' : '') + '>All Locations</option>';
        }
        locations.forEach(function(loc) {
            html += '<option value="' + loc.id + '"' + (parseInt(selectedId) === loc.id ? ' selected' : '') + '>' + sanitizeHTML(loc.name) + ' (' + sanitizeHTML(loc.code) + ')</option>';
        });
        html += '</select>';
        return html;
    }

    /** Render the Location Management UI (Super Admin) */
    function loadLocationManager() {
        const container = document.getElementById('superLocations');
        if (!container) return;

        const locations = getLocations();
        const activeCount = locations.filter(function(l) { return l.active; }).length;
        const inactiveCount = locations.filter(function(l) { return !l.active; }).length;

        const html = '<div class="section-header"><h2>📍 Location Management</h2>';
        html += '<button class="btn btn-primary" onclick="MultiLocation.showAddLocationModal()">+ Add Location</button></div>';

        // Stats
        html += '<div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem;">';
        html += '<div class="stat-card" style="background:var(--bg-secondary,#f8f9fa);padding:1rem;border-radius:8px;text-align:center;">';
        html += '<div style="font-size:2rem;font-weight:bold;color:var(--lifestar-red,#dc3545);">' + activeCount + '</div>';
        html += '<div style="color:var(--text-secondary,#6c757d);">Active Stations</div></div>';
        html += '<div class="stat-card" style="background:var(--bg-secondary,#f8f9fa);padding:1rem;border-radius:8px;text-align:center;">';
        html += '<div style="font-size:2rem;font-weight:bold;color:var(--text-secondary,#6c757d);">' + inactiveCount + '</div>';
        html += '<div style="color:var(--text-secondary,#6c757d);">Inactive Stations</div></div>';
        html += '<div class="stat-card" style="background:var(--bg-secondary,#f8f9fa);padding:1rem;border-radius:8px;text-align:center;">';
        html += '<div style="font-size:2rem;font-weight:bold;color:var(--lifestar-blue,#007bff);">' + locations.length + '</div>';
        html += '<div style="color:var(--text-secondary,#6c757d);">Total Stations</div></div>';
        html += '</div>';

        // Location cards
        html += '<div class="location-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">';
        locations.forEach(function(loc) {
            const statusColor = loc.active ? '#28a745' : '#dc3545';
            const statusText = loc.active ? 'Active' : 'Inactive';
            html += '<div class="location-card" style="background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#dee2e6);border-radius:12px;padding:1.25rem;position:relative;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">';
            html += '<div><h3 style="margin:0;font-size:1.1rem;">' + sanitizeHTML(loc.name) + '</h3>';
            html += '<span style="font-size:0.85rem;color:var(--text-secondary,#6c757d);font-weight:600;">' + sanitizeHTML(loc.code) + '</span></div>';
            html += '<span style="background:' + statusColor + ';color:#fff;padding:2px 10px;border-radius:12px;font-size:0.75rem;">' + statusText + '</span></div>';
            html += '<div style="font-size:0.9rem;color:var(--text-secondary,#6c757d);margin-bottom:0.5rem;">';
            html += '📍 ' + sanitizeHTML(loc.address || 'No address') + '<br>';
            html += sanitizeHTML((loc.city || '') + (loc.state ? ', ' + loc.state : '') + ' ' + (loc.zip || ''));
            html += '</div>';
            if (loc.phone) {
                html += '<div style="font-size:0.9rem;color:var(--text-secondary,#6c757d);margin-bottom:0.75rem;">📞 ' + sanitizeHTML(loc.phone) + '</div>';
            }

            // Staff count at this location
            const staffCount = 0;
            if (typeof users !== 'undefined' && Array.isArray(users)) {
                staffCount = users.filter(function(u) { return u.locationId === loc.id && (u.role === 'paramedic' || u.role === 'emt'); }).length;
            }
            html += '<div style="font-size:0.85rem;color:var(--text-secondary,#6c757d);margin-bottom:0.75rem;">👥 ' + staffCount + ' staff assigned</div>';

            // Action buttons
            html += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">';
            html += '<button class="btn btn-sm" style="background:var(--lifestar-blue,#007bff);color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;" onclick="MultiLocation.showEditLocationModal(' + loc.id + ')">✏️ Edit</button>';
            if (loc.active) {
                html += '<button class="btn btn-sm" style="background:#dc3545;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;" onclick="MultiLocation.confirmDeactivate(' + loc.id + ')">🗑️ Deactivate</button>';
            } else {
                html += '<button class="btn btn-sm" style="background:#28a745;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;" onclick="MultiLocation.handleReactivate(' + loc.id + ')">♻️ Reactivate</button>';
            }
            html += '<button class="btn btn-sm" style="background:var(--bg-tertiary,#e9ecef);color:var(--text-primary,#333);border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;" onclick="MultiLocation.showAssignStaffModal(' + loc.id + ')">👥 Assign Staff</button>';
            html += '</div></div>';
        });
        html += '</div>';

        container.textContent = html;
    }

    /** Show Add Location Modal */
    function showAddLocationModal() {
        const modal = document.getElementById('locationModal');
        if (!modal) {
            _createLocationModal();
            modal = document.getElementById('locationModal');
        }
        const form = document.getElementById('locationForm');
        if (form) form.reset();
        const title = modal.querySelector('.modal-header h3');
        if (title) title.textContent = 'Add New Location';
        const submitBtn = modal.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Add Location';
        modal.dataset.editId = '';
        if (typeof showModal === 'function') {
            showModal('locationModal');
        } else {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
    }

    /** Show Edit Location Modal */
    function showEditLocationModal(id) {
        const loc = getLocationById(id);
        if (!loc) return;

        const modal = document.getElementById('locationModal');
        if (!modal) {
            _createLocationModal();
            modal = document.getElementById('locationModal');
        }

        document.getElementById('locName').value = loc.name || '';
        document.getElementById('locCode').value = loc.code || '';
        document.getElementById('locAddress').value = loc.address || '';
        document.getElementById('locCity').value = loc.city || '';
        document.getElementById('locState').value = loc.state || '';
        document.getElementById('locZip').value = loc.zip || '';
        document.getElementById('locPhone').value = loc.phone || '';

        const title = modal.querySelector('.modal-header h3');
        if (title) title.textContent = 'Edit Location';
        const submitBtn = modal.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Save Changes';
        modal.dataset.editId = String(id);

        if (typeof showModal === 'function') {
            showModal('locationModal');
        } else {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
    }

    /** Handle location form submit */
    function handleLocationSubmit(e) {
        e.preventDefault();
        const modal = document.getElementById('locationModal');
        const editId = modal ? modal.dataset.editId : '';

        const data = {
            name: (document.getElementById('locName') || {}).value || '',
            code: (document.getElementById('locCode') || {}).value || '',
            address: (document.getElementById('locAddress') || {}).value || '',
            city: (document.getElementById('locCity') || {}).value || '',
            state: (document.getElementById('locState') || {}).value || '',
            zip: (document.getElementById('locZip') || {}).value || '',
            phone: (document.getElementById('locPhone') || {}).value || ''
        };

        if (editId) {
            const success = updateLocation(parseInt(editId), data);
            if (success) {
                if (typeof showAlert === 'function') showAlert('Location updated successfully', 'success');
                if (typeof closeModal === 'function') closeModal('locationModal');
                loadLocationManager();
            }
        } else {
            const newLoc = addLocation(data);
            if (newLoc) {
                if (typeof showAlert === 'function') showAlert('Location added successfully', 'success');
                if (typeof closeModal === 'function') closeModal('locationModal');
                loadLocationManager();
            }
        }
    }

    /** Confirm deactivation */
    function confirmDeactivate(id) {
        const loc = getLocationById(id);
        if (!loc) return;
        if (confirm('Are you sure you want to deactivate "' + loc.name + '"? Staff assigned here will need to be reassigned.')) {
            deleteLocation(id);
            if (typeof showAlert === 'function') showAlert('Location deactivated', 'success');
            loadLocationManager();
        }
    }

    /** Handle reactivation */
    function handleReactivate(id) {
        reactivateLocation(id);
        if (typeof showAlert === 'function') showAlert('Location reactivated', 'success');
        loadLocationManager();
    }

    /** Show Assign Staff Modal */
    function showAssignStaffModal(locationId) {
        const loc = getLocationById(locationId);
        if (!loc) return;

        const modal = document.getElementById('assignStaffLocationModal');
        if (!modal) {
            _createAssignStaffModal();
            modal = document.getElementById('assignStaffLocationModal');
        }

        const title = modal.querySelector('.modal-header h3');
        if (title) title.textContent = 'Assign Staff to ' + loc.name;
        modal.dataset.locationId = String(locationId);

        // Build staff list with checkboxes
        const staffList = modal.querySelector('.staff-assign-list');
        if (staffList && typeof users !== 'undefined' && Array.isArray(users)) {
            const html = '';
            const staffUsers = users.filter(function(u) { return u.role === 'paramedic' || u.role === 'emt'; });
            if (staffUsers.length === 0) {
                html = '<p style="color:var(--text-secondary,#6c757d);text-align:center;">No staff members found</p>';
            } else {
                staffUsers.forEach(function(u) {
                    const isAssigned = u.locationId === locationId;
                    const currentLoc = u.locationId ? getLocationById(u.locationId) : null;
                    const currentLocName = currentLoc ? currentLoc.name : 'Unassigned';
                    html += '<label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;border:1px solid var(--border-color,#dee2e6);border-radius:8px;margin-bottom:0.5rem;cursor:pointer;background:' + (isAssigned ? 'rgba(40,167,69,0.1)' : 'var(--bg-secondary,#fff)') + ';">';
                    html += '<input type="checkbox" value="' + u.id + '" ' + (isAssigned ? 'checked' : '') + ' style="width:18px;height:18px;">';
                    html += '<div style="flex:1;"><div style="font-weight:600;">' + sanitizeHTML(u.fullName) + '</div>';
                    html += '<div style="font-size:0.8rem;color:var(--text-secondary,#6c757d);">' + sanitizeHTML(u.role) + ' • Currently: ' + sanitizeHTML(currentLocName) + '</div>';
                    html += '</div></label>';
                });
            }
            staffList.textContent = html;
        }

        if (typeof showModal === 'function') {
            showModal('assignStaffLocationModal');
        } else {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
    }

    /** Handle staff assignment save */
    function handleAssignStaff() {
        const modal = document.getElementById('assignStaffLocationModal');
        if (!modal) return;
        const locationId = parseInt(modal.dataset.locationId);
        const checkboxes = modal.querySelectorAll('.staff-assign-list input[type="checkbox"]');

        checkboxes.forEach(function(cb) {
            const userId = parseInt(cb.value);
            if (cb.checked) {
                assignUserToLocation(userId, locationId);
            } else {
                // If was assigned here but now unchecked, unassign
                const user = (typeof users !== 'undefined' && Array.isArray(users)) ? users.find(function(u) { return u.id === userId; }) : null;
                if (user && user.locationId === locationId) {
                    assignUserToLocation(userId, null);
                }
            }
        });

        if (typeof closeModal === 'function') closeModal('assignStaffLocationModal');
        if (typeof showAlert === 'function') showAlert('Staff assignments updated', 'success');
        loadLocationManager();
    }

    /** Inject location filter into Boss dashboard header */
    function injectLocationFilter() {
        const bossHeader = document.querySelector('#bossDashboard .sidebar-header');
        if (!bossHeader || document.getElementById('bossLocationFilter')) return;

        const activeFilter = getActiveLocationFilter();
        const filterDiv = document.createElement('div');
        filterDiv.id = 'bossLocationFilter';
        filterDiv.style.cssText = 'padding:0.5rem 1rem;border-top:1px solid var(--border-color,rgba(255,255,255,0.1));';
        filterDiv.innerHTML = '<label style="font-size:0.75rem;color:var(--text-secondary,rgba(255,255,255,0.7));display:block;margin-bottom:4px;">📍 Location Filter</label>' +
            buildLocationSelector(activeFilter, 'bossLocationSelect', true);
        bossHeader.appendChild(filterDiv);

        const select = document.getElementById('bossLocationSelect');
        if (select) {
            select.style.cssText = 'width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border-color,rgba(255,255,255,0.2));background:var(--bg-tertiary,rgba(255,255,255,0.1));color:var(--text-primary,#fff);font-size:0.85rem;';
            select.addEventListener('change', function() {
                const val = this.value;
                setActiveLocationFilter(val === 'all' ? null : parseInt(val));
                // Trigger refresh of current section
                if (typeof showAlert === 'function') showAlert('Filtered to: ' + (val === 'all' ? 'All Locations' : this.options[this.selectedIndex].text), 'info');
            });
        }
    }

    /** Create the location add/edit modal */
    function _createLocationModal() {
        if (document.getElementById('locationModal')) return;
        const modal = document.createElement('div');
        modal.id = 'locationModal';
        modal.className = 'modal hidden';
        modal.innerHTML = '<div class="modal-content" style="max-width:500px;">' +
            '<div class="modal-header"><h3>Add New Location</h3>' +
            '<button class="modal-close" onclick="closeModal(\'locationModal\')">&times;</button></div>' +
            '<div class="modal-body">' +
            '<form id="locationForm" onsubmit="MultiLocation.handleLocationSubmit(event)">' +
            '<div class="form-group"><label>Location Name *</label><input type="text" id="locName" class="form-control" required placeholder="e.g. Station 4 - East"></div>' +
            '<div class="form-group"><label>Code *</label><input type="text" id="locCode" class="form-control" required placeholder="e.g. STN4" maxlength="10" style="text-transform:uppercase;"></div>' +
            '<div class="form-group"><label>Address</label><input type="text" id="locAddress" class="form-control" placeholder="Street address"></div>' +
            '<div style="display:grid;grid-template-columns:1fr 80px 100px;gap:0.5rem;">' +
            '<div class="form-group"><label>City</label><input type="text" id="locCity" class="form-control" placeholder="City"></div>' +
            '<div class="form-group"><label>State</label><input type="text" id="locState" class="form-control" placeholder="ST" maxlength="2"></div>' +
            '<div class="form-group"><label>ZIP</label><input type="text" id="locZip" class="form-control" placeholder="ZIP"></div></div>' +
            '<div class="form-group"><label>Phone</label><input type="text" id="locPhone" class="form-control" placeholder="555-0000"></div>' +
            '<div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">' +
            '<button type="button" class="btn btn-secondary" onclick="closeModal(\'locationModal\')">Cancel</button>' +
            '<button type="submit" class="btn btn-primary">Add Location</button></div>' +
            '</form></div></div>';
        document.body.appendChild(modal);
    }

    /** Create the assign staff modal */
    function _createAssignStaffModal() {
        if (document.getElementById('assignStaffLocationModal')) return;
        const modal = document.createElement('div');
        modal.id = 'assignStaffLocationModal';
        modal.className = 'modal hidden';
        modal.innerHTML = '<div class="modal-content" style="max-width:500px;">' +
            '<div class="modal-header"><h3>Assign Staff</h3>' +
            '<button class="modal-close" onclick="closeModal(\'assignStaffLocationModal\')">&times;</button></div>' +
            '<div class="modal-body">' +
            '<div class="staff-assign-list" style="max-height:400px;overflow-y:auto;"></div>' +
            '<div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">' +
            '<button type="button" class="btn btn-secondary" onclick="closeModal(\'assignStaffLocationModal\')">Cancel</button>' +
            '<button type="button" class="btn btn-primary" onclick="MultiLocation.handleAssignStaff()">Save Assignments</button></div>' +
            '</div></div>';
        document.body.appendChild(modal);
    }

    /** Initialize - inject location filter into Boss dashboard */
    function init() {
        // Ensure default locations exist
        getLocations();

        // Inject location filter after a short delay to ensure DOM is ready
        setTimeout(function() {
            injectLocationFilter();
        }, 500);
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

    // Public API
    return {
        getLocations: getLocations,
        getActiveLocations: getActiveLocations,
        getLocationById: getLocationById,
        getActiveLocationFilter: getActiveLocationFilter,
        setActiveLocationFilter: setActiveLocationFilter,
        addLocation: addLocation,
        updateLocation: updateLocation,
        deleteLocation: deleteLocation,
        reactivateLocation: reactivateLocation,
        assignUserToLocation: assignUserToLocation,
        getUsersByLocation: getUsersByLocation,
        getSchedulesByLocation: getSchedulesByLocation,
        buildLocationSelector: buildLocationSelector,
        loadLocationManager: loadLocationManager,
        showAddLocationModal: showAddLocationModal,
        showEditLocationModal: showEditLocationModal,
        handleLocationSubmit: handleLocationSubmit,
        confirmDeactivate: confirmDeactivate,
        handleReactivate: handleReactivate,
        showAssignStaffModal: showAssignStaffModal,
        handleAssignStaff: handleAssignStaff,
        injectLocationFilter: injectLocationFilter,
        init: init
    };
})();