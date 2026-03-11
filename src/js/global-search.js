/**
 * Global Search & Filter Improvements
 * Global search bar (Ctrl+K), search across schedules, staff, requests
 * Advanced filters with date ranges, status, location
 * Save filter presets
 */

(function() {
    'use strict';

    const GlobalSearch = {
        searchResults: [],
        filterPresets: [],
        
        /**
         * Initialize global search
         */
        init: function() {
            this.loadPresets();
            this.injectSearchBar();
            this.setupKeyboardShortcut();
        },
        
        /**
         * Load filter presets from localStorage
         */
        loadPresets: function() {
            try {
                const stored = localStorage.getItem('lifestarFilterPresets');
                if (stored) {
                    this.filterPresets = JSON.parse(stored);
                }
            } catch (error) {
                Logger.error('[GlobalSearch] Error loading presets:', error);
            }
        },
        
        /**
         * Save filter presets to localStorage
         */
        savePresets: function() {
            try {
                localStorage.setItem('lifestarFilterPresets', JSON.stringify(this.filterPresets));
            } catch (error) {
                Logger.error('[GlobalSearch] Error saving presets:', error);
            }
        },
        
        /**
         * Inject search bar into header
         */
        injectSearchBar: function() {
            // Check if already injected
            if (document.getElementById('globalSearchBar')) return;
            
            const header = document.querySelector('.header-right') || document.querySelector('.main-content .header');
            if (!header) return;
            
            const searchContainer = document.createElement('div');
            searchContainer.id = 'globalSearchBar';
            searchContainer.style.cssText = 'position: relative; margin-right: 15px;';
            searchContainer.innerHTML = `
                <div style="position: relative;">
                    <input type="text" id="globalSearchInput" 
                           placeholder="Search... (Ctrl+K)"; 
                           style="padding: 8px 35px 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; width: 250px; font-size: 14px;";
                           autocomplete="off">;
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                         style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none;">;
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                </div>
                <div id="searchResultsPanel" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 10000; display: none; max-height: 400px; overflow-y: auto; margin-top: 5px;"></div>
            `;
            
            header.insertBefore(searchContainer, header.firstChild);
            
            // Event listeners
            const searchInput = document.getElementById('globalSearchInput');
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim()) {
                    this.showResults();
                }
            });
            
            // Close results when clicking outside
            document.addEventListener('click', (e) => {
                const searchBar = document.getElementById('globalSearchBar');
                const resultsPanel = document.getElementById('searchResultsPanel');
                if (searchBar && resultsPanel && !searchBar.contains(e.target)) {
                    resultsPanel.style.display = 'none';
                }
            });
        },
        
        /**
         * Setup keyboard shortcut (Ctrl+K)
         */
        setupKeyboardShortcut: function() {
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    e.preventDefault();
                    const searchInput = document.getElementById('globalSearchInput');
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select();
                    }
                }
                
                // Close search panel on Escape
                if (e.key === 'Escape') {
                    const resultsPanel = document.getElementById('searchResultsPanel');
                    if (resultsPanel) {
                        resultsPanel.style.display = 'none';
                    }
                }
            });
        },
        
        /**
         * Handle search input
         */
        handleSearch: function(query) {
            if (!query.trim()) {
                this.hideResults();
                return;
            }
            
            this.searchResults = this.performSearch(query);
            this.renderResults();
            this.showResults();
        },
        
        /**
         * Perform search across all data
         */
        performSearch: function(query) {
            const results = [];
            
            // Return empty for empty query
            if (!query || !query.trim()) {
                return results;
            }
            
            const lowerQuery = query.toLowerCase();
            
            // Search schedules
            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            schedules.forEach(schedule => {
                if (schedule.name.toLowerCase().includes(lowerQuery) ||
                    schedule.status.toLowerCase().includes(lowerQuery) ||
                    schedule.location?.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        type: 'schedule',
                        icon: '📅',
                        title: schedule.name,
                        subtitle: `${schedule.status} • ${schedule.startDate} to ${schedule.endDate}`,
                        action: `showBossSection('${schedule.status}'); showScheduleDetails('${schedule.id}')`
                    });
                }
            });
            
            // Search staff
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            users.forEach(user => {
                if (user.name?.toLowerCase().includes(lowerQuery) ||
                    user.username?.toLowerCase().includes(lowerQuery) ||
                    user.email?.toLowerCase().includes(lowerQuery) ||
                    user.role?.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        type: 'staff',
                        icon: '👤',
                        title: user.name || user.username,
                        subtitle: `${user.role} • ${user.email || 'No email'}`,
                        action: `showBossSection('staff'); viewStaffDetails('${user.id}')`
                    });
                }
            });
            
            // Search time-off requests
            const timeoff = JSON.parse(localStorage.getItem('lifestarTimeoff') || '[]');
            timeoff.forEach(request => {
                const user = users.find(u => u.id === request.userId);
                const userName = user ? user.name : 'Unknown';
                if (userName.toLowerCase().includes(lowerQuery) ||
                    request.status?.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        type: 'timeoff',
                        icon: '🏖️',
                        title: `${userName}'s Time Off`,
                        subtitle: `${request.startDate} to ${request.endDate} • ${request.status}`,
                        action: `showBossSection('timeoff')`
                    });
                }
            });
            
            // Search crew templates
            const crews = JSON.parse(localStorage.getItem('lifestarCrews') || '[]');
            crews.forEach(crew => {
                if (crew.name?.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        type: 'crew',
                        icon: '🚑',
                        title: crew.name,
                        subtitle: `${crew.shiftType} • ${crew.date}`,
                        action: `showBossSection('crews')`
                    });
                }
            });
            
            return results.slice(0, 20); // Limit to 20 results;
        },
        
        /**
         * Render search results
         */
        renderResults: function() {
            const panel = document.getElementById('searchResultsPanel');
            if (!panel) return;
            
            if (this.searchResults.length === 0) {
                panel.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #9ca3af;">
                        <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
                        <p>No results found</p>
                    </div>
                `;
                return;
            }
            
            panel.innerHTML = `
                <div style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                    ${this.searchResults.length} results
                </div>
                ${this.searchResults.map((result, index) => `
                    <div class="search-result-item" style="padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; gap: 12px; ${index === 0 ? 'background: #f9fafb;' : ''}" data-action="${result.action}">
                        <div style="font-size: 20px;">${result.icon}</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 500; color: #1f2937; font-size: 14px;">${sanitizeHTML(result.title)}</div>
                            <div style="color: #6b7280; font-size: 12px;">${sanitizeHTML(result.subtitle)}</div>
                        </div>
                    </div>
                `).join('')}
            `;
            
            // Add click handlers
            panel.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const action = item.dataset.action;
                    try {
                        // Safe action executor - replaces eval
                        this.executeAction(action);
                    } catch (error) {
                        Logger.error('[GlobalSearch] Error executing action:', error);
                    }
                    this.hideResults();
                });
            });
        },
        
        /**
         * Safe action executor - replaces eval() for security
         */
        executeAction: function(actionStr) {
            // Parse action string like "functionName('arg')" or "functionName('arg1', 'arg2')"
            const match = actionStr.match(/^(\w+)\(([^)]*)\)$/);
            if (!match) {
                Logger.warn('[GlobalSearch] Invalid action format:', actionStr);
                return;
            }
            
            const funcName = match[1];
            const argsStr = match[2];
            
            // Parse arguments
            const args = argsStr ? argsStr.split(',').map(arg => {
                arg = arg.trim();
                // Remove quotes from string arguments
                if ((arg.startsWith("'") && arg.endsWith("'")) || 
                    (arg.startsWith('"') && arg.endsWith('"'))) {
                    return arg.slice(1, -1);
                }
                return arg;
            }) : [];
            
            // Execute the function safely
            const func = window[funcName];
            if (typeof func === 'function') {
                func(...args);
            } else {
                Logger.warn('[GlobalSearch] Function not found:', funcName);
            }
        },

        /**
         * Show results panel
         */
        showResults: function() {
            const panel = document.getElementById('searchResultsPanel');
            if (panel) {
                panel.style.display = 'block';
            }
        },
        
        /**
         * Hide results panel
         */
        hideResults: function() {
            const panel = document.getElementById('searchResultsPanel');
            if (panel) {
                panel.style.display = 'none';
            }
        },
        
        /**
         * Save filter preset
         */
        savePreset: function(name, filters) {
            const preset = {
                id: Date.now(),
                name: name,
                filters: filters,
                createdAt: new Date().toISOString()
            };
            
            this.filterPresets.push(preset);
            this.savePresets();
            
            if(typeof showToast === 'function') {
                showToast(`Filter preset "${name}" saved`, 'success');
            }
        },
        
        /**
         * Load filter preset
         */
        loadPreset: function(presetId) {
            const preset = this.filterPresets.find(p => p.id === presetId);
            if (preset) {
                return preset.filters;
            }
            return null;
        },
        
        /**
         * Delete filter preset
         */
        deletePreset: function(presetId) {
            this.filterPresets = this.filterPresets.filter(p => p.id !== presetId);
            this.savePresets();
            
            if(typeof showToast === 'function') {
                showToast('Filter preset deleted', 'info');
            }
        },
        
        /**
         * Get all presets
         */
        getPresets: function() {
            return this.filterPresets;
        }
    };

    // Make available globally
    window.GlobalSearch = GlobalSearch;
    
    Logger.debug('Global Search module loaded');
})();