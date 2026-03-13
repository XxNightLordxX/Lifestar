/**
 * Core Enhancements Module
 * Consolidates: mobile-enhancements.js, dark-mode.js, keyboard-shortcuts.js, 
 * dropdown-compatibility.js, click-helper.js
 * 
 * Version: 2.0.0
 * Total lines consolidated: ~800 lines → optimized
 */

(function() {
    'use strict';

    // ============================================================
    // ENHANCEMENTS STATE
    // ============================================================
    const EnhancementsState = {
        isMobile: false,
        darkModeEnabled: false,
        keyboardShortcutsEnabled: true,
        activeContext: 'global',
        initialized: false
    };

    // ============================================================
    // MOBILE ENHANCEMENTS
    // ============================================================
    const MobileEnhancements = {
        touchStartY: 0,
        touchEndY: 0,
        isPulling: false,
        pullThreshold: 100,

        /**
         * Initialize mobile enhancements
         */
        init: function() {
            this.detectMobile();
            if (EnhancementsState.isMobile) {
                this.setupPullToRefresh();
                this.setupSwipeActions();
                this.optimizeTouchTargets();
                this.addMobileShortcuts();
            }
            Logger.debug('[MobileEnhancements] Initialized');
        },

        /**
         * Safe action executor - replaces eval() for security
         */
        executeAction: function(actionStr) {
            const match = actionStr.match(/^(\w+)\(([^)]*)\)$/);
            if (!match) {
                Logger.warn('[MobileEnhancements] Invalid action format:', actionStr);
                return;
            }
            
            const funcName = match[1];
            const argsStr = match[2];
            
            const args = argsStr ? argsStr.split(',').map(arg => {
                arg = arg.trim();
                if ((arg.startsWith("'") && arg.endsWith("'")) || 
                    (arg.startsWith('"') && arg.endsWith('"'))) {
                    return arg.slice(1, -1);
                }
                return arg;
            }) : [];
            
            const func = window[funcName];
            if (typeof func === 'function') {
                func(...args);
            } else {
                Logger.warn('[MobileEnhancements] Function not found:', funcName);
            }
        },

        /**
         * Detect if device is mobile
         */
        detectMobile: function() {
            EnhancementsState.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                           window.innerWidth <= 768;
            
            if (EnhancementsState.isMobile) {
                document.body.classList.add('mobile-device');
                Logger.debug('[MobileEnhancements] Mobile device detected');
            }
            
            return EnhancementsState.isMobile;
        },

        /**
         * Setup pull-to-refresh functionality
         */
        setupPullToRefresh: function() {
            const mainContent = document.querySelector('.main-content');
            if (!mainContent) return;
            
            let startY = 0;
            let currentY = 0;
            let isDragging = false;
            let pullIndicator = null;
            
            mainContent.addEventListener('touchstart', (e) => {
                if (window.scrollY === 0) {
                    startY = e.touches[0].clientY;
                    isDragging = true;
                }
            }, { passive: true });
            
            mainContent.addEventListener('touchmove', (e) => {
                if (!isDragging || window.scrollY > 0) return;
                
                currentY = e.touches[0].clientY;
                const diff = currentY - startY;
                
                if (diff > 0 && diff < 200) {
                    e.preventDefault();
                    
                    if (!pullIndicator) {
                        pullIndicator = document.createElement('div');
                        pullIndicator.id = 'pullToRefreshIndicator';
                        pullIndicator.style.cssText = `
                            position: fixed;
                            top: -60px;
                            left: 50%;
                            transform: translateX(-50%);
                            background: #6366f1;
                            color: white;
                            padding: 10px 20px;
                            border-radius: 0 0 20px 20px;
                            font-size: 14px;
                            z-index: 10000;
                            transition: top 0.3s ease;
                        `;
                        pullIndicator.textContent = '🔄 Pull to refresh';
                        document.body.appendChild(pullIndicator);
                    }
                    
                    const progress = Math.min(diff / this.pullThreshold, 1);
                    pullIndicator.style.top = `${-60 + (diff * 0.5)}px`;
                    
                    if (progress >= 1) {
                        pullIndicator.textContent = '✋ Release to refresh';
                    } else {
                        pullIndicator.textContent = '🔄 Pull to refresh';
                    }
                }
            }, { passive: false });
            
            mainContent.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                
                const diff = currentY - startY;
                
                if (diff >= this.pullThreshold && pullIndicator) {
                    pullIndicator.textContent = '⏳ Refreshing...';
                    pullIndicator.style.top = '0px';
                    
                    setTimeout(() => {
                        this.refreshCurrentSection();
                        
                        if (pullIndicator) {
                            pullIndicator.style.top = '-60px';
                            setTimeout(() => {
                                pullIndicator.remove();
                                pullIndicator = null;
                            }, 300);
                        }
                    }, 1000);
                } else if (pullIndicator) {
                    pullIndicator.style.top = '-60px';
                    setTimeout(() => {
                        pullIndicator.remove();
                        pullIndicator = null;
                    }, 300);
                }
                
                startY = 0;
                currentY = 0;
            });

            // Cleanup on touch cancel
            document.addEventListener('touchcancel', () => {
                if (pullIndicator) {
                    pullIndicator.remove();
                    pullIndicator = null;
                }
                startY = 0;
                currentY = 0;
            });
        },

        /**
         * Refresh current section
         */
        refreshCurrentSection: function() {
            const activeSection = document.querySelector('.boss-section:not(.hidden)');
            if (!activeSection) return;
            
            const sectionId = activeSection.id;
            
            if (sectionId === 'bossDrafts' && typeof loadDraftSchedules === 'function') {
                loadDraftSchedules();
            } else if (sectionId === 'bossPublished' && typeof loadPublishedSchedules === 'function') {
                loadPublishedSchedules();
            } else if (sectionId === 'bossStaff' && typeof loadStaffDirectory === 'function') {
                loadStaffDirectory();
            } else if (sectionId === 'bossTimeoff' && typeof loadTimeoffRequests === 'function') {
                loadTimeoffRequests();
            } else if (sectionId === 'bossAnalytics' && typeof generateAnalyticsReport === 'function') {
                generateAnalyticsReport();
            }
            
            if (typeof showToast === 'function') {
                showToast('Refreshed successfully', 'success');
            }
        },

        /**
         * Setup swipe actions on list items
         */
        setupSwipeActions: function() {
            const observer = new MutationObserver(() => {
                this.addSwipeToScheduleCards();
                this.addSwipeToTimeoffRequests();
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            
            setTimeout(() => {
                this.addSwipeToScheduleCards();
                this.addSwipeToTimeoffRequests();
            }, 1000);
        },

        /**
         * Add swipe actions to schedule cards
         */
        addSwipeToScheduleCards: function() {
            const cards = document.querySelectorAll('.schedule-card');
            cards.forEach(card => {
                if (card.dataset.swipeSetup) return;
                card.dataset.swipeSetup = 'true';
                
                let startX = 0;
                let currentX = 0;
                let isSwiping = false;
                
                card.addEventListener('touchstart', (e) => {
                    startX = e.touches[0].clientX;
                    isSwiping = true;
                }, { passive: true });
                
                card.addEventListener('touchmove', (e) => {
                    if (!isSwiping) return;
                    currentX = e.touches[0].clientX;
                    const diff = currentX - startX;
                    
                    if (Math.abs(diff) > 10) {
                        card.style.transform = `translateX(${diff}px)`;
                    }
                }, { passive: true });
                
                card.addEventListener('touchend', (e) => {
                    if (!isSwiping) return;
                    isSwiping = false;
                    
                    const diff = currentX - startX;
                    
                    if (Math.abs(diff) > 100) {
                        if (diff < 0) {
                            this.showSwipeAction(card, 'edit');
                        } else {
                            this.showSwipeAction(card, 'delete');
                        }
                    } else {
                        card.style.transform = 'translateX(0)';
                    }
                    
                    startX = 0;
                    currentX = 0;
                });
            });
        },

        /**
         * Add swipe actions to time-off requests
         */
        addSwipeToTimeoffRequests: function() {
            const requests = document.querySelectorAll('.timeoff-request-item');
            requests.forEach(item => {
                if (item.dataset.swipeSetup) return;
                item.dataset.swipeSetup = 'true';
                
                let startX = 0;
                let currentX = 0;
                let isSwiping = false;
                
                item.addEventListener('touchstart', (e) => {
                    startX = e.touches[0].clientX;
                    isSwiping = true;
                }, { passive: true });
                
                item.addEventListener('touchmove', (e) => {
                    if (!isSwiping) return;
                    currentX = e.touches[0].clientX;
                    const diff = currentX - startX;
                    
                    if (Math.abs(diff) > 10) {
                        item.style.transform = `translateX(${diff}px)`;
                    }
                }, { passive: true });
                
                item.addEventListener('touchend', (e) => {
                    if (!isSwiping) return;
                    isSwiping = false;
                    
                    const diff = currentX - startX;
                    
                    if (Math.abs(diff) > 100) {
                        if (diff < 0) {
                            this.showSwipeAction(item, 'approve');
                        } else {
                            this.showSwipeAction(item, 'deny');
                        }
                    } else {
                        item.style.transform = 'translateX(0)';
                    }
                    
                    startX = 0;
                    currentX = 0;
                });
            });
        },

        /**
         * Show swipe action
         */
        showSwipeAction: function(element, action) {
            element.style.transform = 'translateX(0)';
            
            const actions = {
                'edit': { color: '#3b82f6', icon: '✏️', label: 'Edit' },
                'delete': { color: '#ef4444', icon: '🗑️', label: 'Delete' },
                'approve': { color: '#10b981', icon: '✅', label: 'Approve' },
                'deny': { color: '#ef4444', icon: '❌', label: 'Deny' }
            };
            
            const actionData = actions[action];
            if (!actionData) return;
            
            if (typeof showToast === 'function') {
                showToast(`${actionData.icon} ${actionData.label}`, action === 'delete' || action === 'deny' ? 'warning' : 'success');
            }
            
            if (action === 'edit' && element.onclick) {
                element.click();
            } else if (action === 'delete' && element.querySelector('.delete-btn')) {
                element.querySelector('.delete-btn').click();
            } else if (action === 'approve' && element.querySelector('.approve-btn')) {
                element.querySelector('.approve-btn').click();
            } else if (action === 'deny' && element.querySelector('.deny-btn')) {
                element.querySelector('.deny-btn').click();
            }
        },

        /**
         * Optimize touch targets for mobile
         */
        optimizeTouchTargets: function() {
            const style = document.createElement('style');
            style.textContent = `
                @media (max-width: 768px) {
                    .btn {
                        min-height: 44px;
                        min-width: 44px;
                        padding: 10px 16px;
                        font-size: 16px;
                    }
                    
                    .nav-item {
                        min-height: 48px;
                        padding: 12px 16px;
                    }
                    
                    .card {
                        margin-bottom: 12px;
                    }
                    
                    input, select, textarea {
                        min-height: 44px;
                        font-size: 16px;
                    }
                    
                    .schedule-card, .staff-card, .timeoff-request-item {
                        min-height: 80px;
                    }
                    
                    button, a, .nav-item, .card {
                        -webkit-tap-highlight-color: rgba(99, 102, 241, 0.3);
                    }
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * Add mobile-specific shortcuts (FAB)
         */
        addMobileShortcuts: function() {
            const fab = document.createElement('button');
            fab.id = 'mobileFab';
            fab.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                font-size: 24px;
                cursor: pointer;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease;
            `;
            fab.textContent = '+';
            fab.title = 'Quick Actions';
            
            fab.addEventListener('click', () => {
                this.showMobileQuickActions();
            });
            
            fab.addEventListener('touchstart', () => {
                fab.style.transform = 'scale(0.95)';
            });
            
            fab.addEventListener('touchend', () => {
                fab.style.transform = 'scale(1)';
            });
            
            document.body.appendChild(fab);
        },

        /**
         * Show mobile quick actions menu
         */
        showMobileQuickActions: function() {
            const existingMenu = document.getElementById('mobileQuickActionsMenu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }
            
            const menu = document.createElement('div');
            menu.id = 'mobileQuickActionsMenu';
            menu.style.cssText = `
                position: fixed;
                bottom: 90px;
                right: 20px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                z-index: 10000;
                padding: 8px 0;
                min-width: 200px;
            `;
            
            const actions = [
                { icon: '📅', label: 'Create Schedule', action: "showCreateScheduleModal()" },
                { icon: '📆', label: 'View Calendar', action: "showBossSection('calendar')" },
                { icon: '🏖️', label: 'Time Off', action: "showBossSection('timeoff')" },
                { icon: '👥', label: 'Staff', action: "showBossSection('staff')" },
                { icon: '📊', label: 'Analytics', action: "showBossSection('analytics')" }
            ];
            
            menu.innerHTML = actions.map(action => `
                <div class="mobile-action-item" style="padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px;" data-action="${action.action}">
                    <span style="font-size: 20px;">${action.icon}</span>
                    <span style="font-size: 14px; color: #1f2937;">${action.label}</span>
                </div>
            `).join('');
            
            document.body.appendChild(menu);
            
            menu.querySelectorAll('.mobile-action-item').forEach(item => {
                item.addEventListener('click', () => {
                    try {
                        this.executeAction(item.dataset.action);
                    } catch (error) {
                        Logger.error('[MobileEnhancements] Error executing action:', error);
                    }
                    menu.remove();
                });
            });
            
            setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target) && e.target.id !== 'mobileFab') {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 100);
        }
    };

    // ============================================================
    // DARK MODE
    // ============================================================
    const DarkMode = {
        _key: 'lifestarDarkMode',
        _enabled: false,

        /**
         * Initialize dark mode from saved preference
         */
        init: function() {
            this._enabled = localStorage.getItem(this._key) === 'true';
            EnhancementsState.darkModeEnabled = this._enabled;
            
            if (this._enabled) {
                document.documentElement.classList.add('dark-mode');
            }
            
            this._injectToggleButton();
            this._updateToggle();
            this._injectDarkModeStyles();
            Logger.debug('[DarkMode] Initialized');
        },

        /**
         * Toggle dark mode on/off
         */
        toggle: function() {
            this._enabled = !this._enabled;
            EnhancementsState.darkModeEnabled = this._enabled;
            localStorage.setItem(this._key, this._enabled.toString());
            
            if (this._enabled) {
                document.documentElement.classList.add('dark-mode');
            } else {
                document.documentElement.classList.remove('dark-mode');
            }
            
            this._updateToggle();
        },

        /**
         * Check if dark mode is enabled
         */
        isEnabled: function() {
            return this._enabled;
        },

        /**
         * Inject dark mode CSS styles
         */
        _injectDarkModeStyles: function() {
            if (document.getElementById('dark-mode-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'dark-mode-styles';
            style.textContent = `
                .dark-mode {
                    --bg-primary: #1a1a2e;
                    --bg-secondary: #16213e;
                    --bg-card: #0f3460;
                    --text-primary: #eaeaea;
                    --text-secondary: #b8b8b8;
                    --border-color: #2a2a4a;
                }
                
                .dark-mode body,
                .dark-mode .app-container {
                    background-color: var(--bg-primary) !important;
                    color: var(--text-primary) !important;
                }
                
                .dark-mode .sidebar,
                .dark-mode .card,
                .dark-mode .modal-content {
                    background-color: var(--bg-secondary) !important;
                    border-color: var(--border-color) !important;
                }
                
                .dark-mode input,
                .dark-mode select,
                .dark-mode textarea {
                    background-color: var(--bg-card) !important;
                    color: var(--text-primary) !important;
                    border-color: var(--border-color) !important;
                }
                
                .dark-mode .nav-item:hover,
                .dark-mode .nav-item.active {
                    background-color: rgba(99, 102, 241, 0.2) !important;
                }
                
                .dark-mode table {
                    border-color: var(--border-color) !important;
                }
                
                .dark-mode th {
                    background-color: var(--bg-card) !important;
                    color: var(--text-primary) !important;
                }
                
                .dark-mode td {
                    border-color: var(--border-color) !important;
                }
                
                .dark-mode .btn-secondary {
                    background-color: var(--bg-card) !important;
                    color: var(--text-primary) !important;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * Inject toggle button into dashboard headers
         */
        _injectToggleButton: function() {
            const sidebarFooters = document.querySelectorAll('.sidebar-footer');
            sidebarFooters.forEach(footer => {
                if (footer.querySelector('.dark-mode-toggle')) return;
                
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm dark-mode-toggle';
                btn.style.cssText = 'width:100%; margin-bottom:8px; background:#555; color:#fff; border:none; padding:8px; border-radius:4px; cursor:pointer; font-size:13px;';
                btn.textContent = this._enabled ? '☀️ Light Mode' : '🌙 Dark Mode';
                btn.onclick = () => DarkMode.toggle();
                footer.insertBefore(btn, footer.firstChild);
            });
        },

        /**
         * Update all toggle buttons
         */
        _updateToggle: function() {
            document.querySelectorAll('.dark-mode-toggle').forEach(btn => {
                btn.textContent = this._enabled ? '☀️ Light Mode' : '🌙 Dark Mode';
            });
        }
    };

    // ============================================================
    // KEYBOARD SHORTCUTS
    // ============================================================
    const KeyboardShortcuts = {
        shortcuts: new Map(),
        enabled: true,
        activeContext: 'global',

        /**
         * Initialize keyboard shortcuts
         */
        init: function() {
            this.registerDefaults();
            this.setupListener();
            Logger.debug('[KeyboardShortcuts] Initialized');
        },

        /**
         * Register default shortcuts
         */
        registerDefaults: function() {
            // Navigation
            this.register('ctrl+h', 'global', () => this.navigate('dashboard'), 'Go to Dashboard');
            this.register('ctrl+s', 'global', () => this.save(), 'Save current changes');
            this.register('ctrl+shift+s', 'global', () => this.saveAll(), 'Save all changes');
            this.register('ctrl+f', 'global', () => this.openSearch(), 'Open search');
            this.register('ctrl+n', 'global', () => this.createNew(), 'Create new item');
            this.register('escape', 'global', () => this.closeModal(), 'Close modal/dialog');
            this.register('ctrl+z', 'global', () => this.undo(), 'Undo last action');
            this.register('ctrl+shift+z', 'global', () => this.redo(), 'Redo last action');
            this.register('ctrl+p', 'global', () => this.print(), 'Print current view');
            this.register('ctrl+e', 'global', () => this.export(), 'Export data');
            this.register('?', 'global', () => this.showHelp(), 'Show keyboard shortcuts');

            // Schedule shortcuts
            this.register('left', 'schedule', () => this.previousDay(), 'Previous day');
            this.register('right', 'schedule', () => this.nextDay(), 'Next day');
            this.register('up', 'schedule', () => this.previousWeek(), 'Previous week');
            this.register('down', 'schedule', () => this.nextWeek(), 'Next week');
            this.register('t', 'schedule', () => this.goToToday(), 'Go to today');
            this.register('enter', 'schedule', () => this.editSelected(), 'Edit selected shift');
            this.register('delete', 'schedule', () => this.deleteSelected(), 'Delete selected shift');
        },

        /**
         * Register a keyboard shortcut
         */
        register: function(keys, context, handler, description) {
            const id = context + ':' + keys;
            this.shortcuts.set(id, { keys, context, handler, description });
        },

        /**
         * Setup keyboard listener
         */
        setupListener: function() {
            if (typeof document === 'undefined') return;

            document.addEventListener('keydown', (e) => {
                if (!this.enabled) return;

                // Don't trigger in input fields
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                    if (e.key !== 'Escape') return;
                }

                const keys = this.getKeyCombo(e);

                // Check context-specific shortcuts first
                const contextId = this.activeContext + ':' + keys;
                const globalId = 'global:' + keys;

                const shortcut = this.shortcuts.get(contextId) || this.shortcuts.get(globalId);

                if (shortcut) {
                    e.preventDefault();
                    shortcut.handler();
                }
            });
        },

        /**
         * Get key combination string from event
         */
        getKeyCombo: function(e) {
            const parts = [];
            if (e.ctrlKey || e.metaKey) parts.push('ctrl');
            if (e.shiftKey) parts.push('shift');
            if (e.altKey) parts.push('alt');
            parts.push(e.key.toLowerCase());
            return parts.join('+');
        },

        /**
         * Get all shortcuts for display
         */
        getAll: function() {
            const result = [];
            for (const [id, shortcut] of this.shortcuts) {
                result.push({
                    keys: shortcut.keys,
                    context: shortcut.context,
                    description: shortcut.description
                });
            }
            return result;
        },

        /**
         * Show help dialog with all shortcuts
         */
        showHelp: function() {
            if (typeof document === 'undefined') return;

            const shortcuts = this.getAll();
            let html = '<div class="shortcuts-help" style="padding:20px;"><h2 style="margin-bottom:16px;">Keyboard Shortcuts</h2><table style="width:100%;border-collapse:collapse;">';
            html += '<tr style="background:#f3f4f6;"><th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Shortcut</th><th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Action</th><th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Context</th></tr>';

            const esc = (str) => typeof InputSanitizer !== 'undefined' ? InputSanitizer.escapeHTML(str) : String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
            shortcuts.forEach(s => {
                html += `<tr><td style="padding:8px;border-bottom:1px solid #eee;"><kbd style="background:#e5e7eb;padding:2px 6px;border-radius:4px;font-family:monospace;">${esc(s.keys)}</kbd></td>`;
                html += `<td style="padding:8px;border-bottom:1px solid #eee;">${esc(s.description)}</td>`;
                html += `<td style="padding:8px;border-bottom:1px solid #eee;">${esc(s.context)}</td></tr>`;
            });

            html += '</table></div>';

            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
            modal.innerHTML = `<div class="modal-content" style="background:white;border-radius:8px;max-width:600px;max-height:80vh;overflow-y:auto;">${html}</div>`;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
            document.body.appendChild(modal);
        },

        // Action methods
        navigate: function(page) { Logger.debug('Navigate to:', page); },
        save: function() { Logger.debug('Save'); },
        saveAll: function() { Logger.debug('Save all'); },
        openSearch: function() { Logger.debug('Open search'); },
        createNew: function() { Logger.debug('Create new'); },
        closeModal: function() {
            if (typeof document !== 'undefined') {
                const modal = document.querySelector('.modal.active');
                if (modal) modal.remove();
            }
        },
        undo: function() { Logger.debug('Undo'); },
        redo: function() { Logger.debug('Redo'); },
        print: function() { if (typeof window !== 'undefined') window.print(); },
        export: function() { Logger.debug('Export'); },
        previousDay: function() { Logger.debug('Previous day'); },
        nextDay: function() { Logger.debug('Next day'); },
        previousWeek: function() { Logger.debug('Previous week'); },
        nextWeek: function() { Logger.debug('Next week'); },
        goToToday: function() { Logger.debug('Go to today'); },
        editSelected: function() { Logger.debug('Edit selected'); },
        deleteSelected: function() { Logger.debug('Delete selected'); }
    };

    // ============================================================
    // DROPDOWN COMPATIBILITY
    // ============================================================
    const DropdownCompatibility = {
        /**
         * Initialize all dropdowns on the page with compatibility fixes
         */
        initAllDropdowns: function() {
            const dropdowns = document.querySelectorAll('select');
            dropdowns.forEach(dropdown => {
                this.setupDropdown(dropdown);
            });
            Logger.debug('[DropdownCompatibility] Initialized');
        },

        /**
         * Setup a single dropdown with cross-platform compatibility
         */
        setupDropdown: function(dropdown) {
            if (!dropdown || dropdown.dataset.compatibilitySetup === 'true') {
                return;
            }

            dropdown.dataset.compatibilitySetup = 'true';
            dropdown.dataset.selectedValue = dropdown.value;

            dropdown.addEventListener('change', this.handleChange.bind(this));
            dropdown.addEventListener('input', this.handleChange.bind(this));
            dropdown.addEventListener('mouseup', this.handleMouseUp.bind(this));
            dropdown.addEventListener('keyup', this.handleKeyUp.bind(this));
            dropdown.addEventListener('blur', this.handleBlur.bind(this));
            dropdown.addEventListener('click', this.handleClick.bind(this));

            if (this.isIOSSafari()) {
                this.setupIOSFixes(dropdown);
            }

            if (this.isAndroid()) {
                this.setupAndroidFixes(dropdown);
            }
        },

        handleChange: function(e) {
            const dropdown = e.target;
            dropdown.dataset.selectedValue = dropdown.value;
            this.triggerCustomEvent(dropdown, 'valueChanged');
        },

        handleMouseUp: function(e) {
            const dropdown = e.target;
            setTimeout(() => {
                dropdown.dataset.selectedValue = dropdown.value;
            }, 50);
        },

        handleKeyUp: function(e) {
            const dropdown = e.target;
            dropdown.dataset.selectedValue = dropdown.value;

            if (e.key === 'Enter') {
                this.triggerCustomEvent(dropdown, 'valueChanged');
            }
        },

        handleBlur: function(e) {
            const dropdown = e.target;
            dropdown.dataset.selectedValue = dropdown.value;
        },

        handleClick: function(e) {
            const dropdown = e.target;
            dropdown.dataset.valueBeforeClick = dropdown.value;
        },

        /**
         * Get the current value from a dropdown with fallbacks
         */
        getValue: function(dropdown) {
            const element = typeof dropdown === 'string'
                ? document.getElementById(dropdown)
                : dropdown;

            if (!element) return '';

            let value = element.value;

            if (!value && element.selectedIndex > 0) {
                value = element.options[element.selectedIndex].value;
            }

            if (!value) {
                value = element.dataset.selectedValue || '';
            }

            return value;
        },

        /**
         * Set the value of a dropdown with cross-platform support
         */
        setValue: function(dropdown, value) {
            const element = typeof dropdown === 'string'
                ? document.getElementById(dropdown)
                : dropdown;

            if (!element) return;

            element.value = value;
            element.dataset.selectedValue = value;

            this.triggerCustomEvent(element, 'valueChanged');
        },

        triggerCustomEvent: function(element, eventName) {
            const event = new Event(eventName, { bubbles: true });
            element.dispatchEvent(event);
        },

        isIOSSafari: function() {
            const ua = navigator.userAgent;
            return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua);
        },

        isAndroid: function() {
            return /Android/.test(navigator.userAgent);
        },

        setupIOSFixes: function(dropdown) {
            dropdown.style.webkitAppearance = 'menulist-button';

            dropdown.addEventListener('touchstart', (e) => {
                dropdown.dataset.touchStarted = 'true';
            });

            dropdown.addEventListener('touchend', (e) => {
                setTimeout(() => {
                    dropdown.dataset.selectedValue = dropdown.value;
                }, 100);
            });
        },

        setupAndroidFixes: function(dropdown) {
            dropdown.style.minHeight = '44px';

            dropdown.addEventListener('touchend', (e) => {
                setTimeout(() => {
                    dropdown.dataset.selectedValue = dropdown.value;
                }, 100);
            });
        },

        /**
         * Test a dropdown to ensure it's working correctly
         */
        testDropdown: function(dropdown) {
            const element = typeof dropdown === 'string'
                ? document.getElementById(dropdown)
                : dropdown;

            const results = {
                elementId: element?.id || 'unknown',
                hasSetup: element?.dataset.compatibilitySetup === 'true',
                hasSelectedValue: !!element?.dataset.selectedValue,
                currentValue: element?.value || '',
                selectedValue: element?.dataset.selectedValue || '',
                selectedIndex: element?.selectedIndex || -1,
                optionCount: element?.options?.length || 0,
                isIOS: this.isIOSSafari(),
                isAndroid: this.isAndroid(),
                passed: true
            };

            if (results.currentValue !== results.selectedValue) {
                results.passed = false;
                results.error = 'Value mismatch';
            }

            return results;
        },

        /**
         * Run diagnostics on all dropdowns
         */
        runDiagnostics: function() {
            const dropdowns = document.querySelectorAll('select');
            const diagnostics = {
                total: dropdowns.length,
                setup: 0,
                notSetup: 0,
                results: []
            };

            dropdowns.forEach(dropdown => {
                const test = this.testDropdown(dropdown);
                diagnostics.results.push(test);

                if (test.hasSetup) {
                    diagnostics.setup++;
                } else {
                    diagnostics.notSetup++;
                }
            });

            return diagnostics;
        }
    };

    // ============================================================
    // CLICK HELPER
    // ============================================================
    const ClickHelper = {
        /**
         * Test clicking a boss section
         */
        testBossSection: function(sectionName) {
            const items = document.querySelectorAll('#bossDashboard .nav-item');
            for (const item of items) {
                const onclick = item.getAttribute('onclick');
                if (onclick && onclick.includes("'" + sectionName + "'")) {
                    item.click();
                    return true;
                }
            }
            return false;
        },

        /**
         * Click element by selector
         */
        clickBySelector: function(selector) {
            const element = document.querySelector(selector);
            if (element) {
                element.click();
                return true;
            }
            return false;
        },

        /**
         * Click element by ID
         */
        clickById: function(id) {
            const element = document.getElementById(id);
            if (element) {
                element.click();
                return true;
            }
            return false;
        },

        /**
         * Simulate click with coordinates
         */
        clickAt: function(x, y) {
            const event = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            });
            document.elementFromPoint(x, y)?.dispatchEvent(event);
        }
    };

    // ============================================================
    // MAIN INITIALIZATION
    // ============================================================
    const CoreEnhancements = {
        init: function() {
            if (EnhancementsState.initialized) {
                Logger.warn('[CoreEnhancements] Already initialized');
                return;
            }

            MobileEnhancements.init();
            DarkMode.init();
            KeyboardShortcuts.init();
            DropdownCompatibility.initAllDropdowns();

            // Setup mutation observer for new dropdowns
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'SELECT') {
                            DropdownCompatibility.setupDropdown(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('select').forEach(dropdown => {
                                DropdownCompatibility.setupDropdown(dropdown);
                            });
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

            EnhancementsState.initialized = true;
            Logger.debug('✅ Core Enhancements module loaded');
        },

        // Expose sub-modules
        Mobile: MobileEnhancements,
        DarkMode: DarkMode,
        Keyboard: KeyboardShortcuts,
        Dropdown: DropdownCompatibility,
        Click: ClickHelper,

        // Convenience methods
        isMobile: function() {
            return EnhancementsState.isMobile;
        },

        isDarkMode: function() {
            return EnhancementsState.darkModeEnabled;
        },

        toggleDarkMode: function() {
            DarkMode.toggle();
        }
    };

    // Make available globally
    window.CoreEnhancements = CoreEnhancements;
    window.MobileEnhancements = MobileEnhancements;
    window.DarkMode = DarkMode;
    window.KeyboardShortcuts = KeyboardShortcuts;
    window.DropdownCompatibility = DropdownCompatibility;
    window.testBossSection = ClickHelper.testBossSection;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CoreEnhancements.init());
    } else {
        CoreEnhancements.init();
    }

    // Export for module use
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CoreEnhancements;
    }
})();