/**
 * Super Admin Patch - Overrides showSuperSection and showModal
 * to support boss features and staff dropdown population
 * Loaded AFTER the main bundle to override functions
 */

// ========================================
// OVERRIDE: showSuperSection with boss section support
// ========================================
(function() {
    // Save reference to original if needed
    const _origShowSuperSection = typeof showSuperSection === 'function' ? showSuperSection : null;

    window.showSuperSection = function(section) {
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

            // Add active class to clicked nav item
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
                if(typeof updateOverviewStats === 'function') updateOverviewStats();
            } else if(section === 'users') {
                if(typeof loadUsersTable === 'function') loadUsersTable();
            } else if(section === 'features') {
                if(typeof loadFeatureToggles === 'function') loadFeatureToggles();
            } else if(section === 'logs') {
                if(typeof displaySystemLogs === 'function') displaySystemLogs();
            } else if(section === 'permissions') {
                if(typeof loadPermissionsManager === 'function') loadPermissionsManager();
                if(typeof AdvancedPermissions !== 'undefined' && typeof AdvancedPermissions.loadAdvancedPermissionsManager === 'function') AdvancedPermissions.loadAdvancedPermissionsManager();
            } else if(section === 'locations') {
                if(typeof MultiLocation !== 'undefined' && typeof MultiLocation.loadLocationManager === 'function') MultiLocation.loadLocationManager();
            } else if(section === 'developer') {
                if(typeof E2ETestSuite !== 'undefined' && typeof E2ETestSuite.renderUI === 'function') E2ETestSuite.renderUI('e2eTestResults');
                if(typeof ABTesting !== 'undefined' && typeof ABTesting.renderUI === 'function') ABTesting.renderUI('abTestingResults');
                if(typeof VisualRegression !== 'undefined' && typeof VisualRegression.renderResultsUI === 'function') VisualRegression.renderResultsUI('visualRegressionResults');
            } else if(typeof handleSuperBossSection === 'function') {
                handleSuperBossSection(section);
            }
        } catch (error) {
            Logger.error('[showSuperSection] Error:', error.message || error);
        }
    };
})();

// ========================================
// OVERRIDE: showModal with staff dropdown population
// ========================================
(function() {
    const _origShowModal = typeof showModal === 'function' ? showModal : null;

    window.showModal = function(modalId) {
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
    };

    window.populateModalStaffDropdowns = function(modal) {
        try {
            if(!modal) return;
            const selects = modal.querySelectorAll('select');
            const paramedics = users.filter(function(u) { return u.role === 'paramedic'; });
            const emts = users.filter(function(u) { return u.role === 'emt'; });
            const allStaff = paramedics.concat(emts);

            selects.forEach(function(select) {
                const id = (select.id || '').toLowerCase();
                const label = select.previousElementSibling ? (select.previousElementSibling.textContent || '').toLowerCase() : '';

                const staffToAdd = null;
                if(id.includes('paramedic') || label.includes('paramedic')) {
                    staffToAdd = paramedics;
                } else if(id.includes('emt') || label.includes('emt')) {
                    staffToAdd = emts;
                } else if(id.includes('employee') || id.includes('staff') || id.includes('primary') || id.includes('backup') ||
                           label.includes('employee') || label.includes('staff') || label.includes('assign')) {
                    staffToAdd = allStaff;
                }

                if(staffToAdd && staffToAdd.length > 0 && select.options.length <= 1) {
                    const currentVal = select.value;
                    const placeholder = select.options[0] ? select.options[0].textContent : 'Select';
                    select.innerHTML = '<option value="">' + placeholder + '</option>';
                    staffToAdd.forEach(function(s) {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = (s.fullName || s.username) + ' (' + s.role.toUpperCase() + ')';
                        select.appendChild(opt);
                    });
                    if(currentVal) select.value = currentVal;
                }
            });
        } catch (e) {
            Logger.error('[populateModalStaffDropdowns]', e);
        }
    };
})();

// ========================================
// OVERRIDE: loadSuperAdminDashboard to init boss features
// ========================================
(function() {
    const _origLoadSuperAdmin = typeof loadSuperAdminDashboard === 'function' ? loadSuperAdminDashboard : null;

    window.loadSuperAdminDashboard = function() {
        // Call original
        if(_origLoadSuperAdmin) _origLoadSuperAdmin();
        // Initialize boss features for super admin
        if(typeof initSuperAdminBossFeatures === 'function') initSuperAdminBossFeatures();
        if(typeof loadPermissions === 'function') loadPermissions();
    };
})();
