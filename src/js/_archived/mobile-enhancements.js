/**
 * Mobile App Enhancements
 * Pull-to-refresh on mobile, swipe actions on list items, optimize touch targets, mobile-specific shortcuts
 */

(function() {
    'use strict';

    const MobileEnhancements = {
        touchStartY: 0,
        touchEndY: 0,
        isPulling: false,
        pullThreshold: 100,
        
        /**
         * Initialize mobile enhancements
         */
        init: function() {
            this.setupPullToRefresh();
            this.setupSwipeActions();
            this.optimizeTouchTargets();
            this.addMobileShortcuts();
            this.detectMobile();
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
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||;
                           window.innerWidth <= 768;
            
            if (isMobile) {
                document.body.classList.add('mobile-device');
                Logger.debug('[MobileEnhancements] Mobile device detected');
            }
            
            return isMobile;
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
                    // Trigger refresh
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
        },
        
        /**
         * Refresh current section
         */
        refreshCurrentSection: function() {
            // Reload current data based on active section
            const activeSection = document.querySelector('.boss-section:not(.hidden)');
            if (!activeSection) return;
            
            const sectionId = activeSection.id;
            
            // Trigger appropriate refresh function
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
            // Add swipe actions to schedule cards
            const observer = new MutationObserver(() => {
                this.addSwipeToScheduleCards();
                this.addSwipeToTimeoffRequests();
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            
            // Initial setup
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
                        // Swipe detected
                        if (diff < 0) {
                            // Swipe left - show edit action
                            this.showSwipeAction(card, 'edit');
                        } else {
                            // Swipe right - show delete action
                            this.showSwipeAction(card, 'delete');
                        }
                    } else {
                        // Reset position
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
                            // Swipe left - approve
                            this.showSwipeAction(item, 'approve');
                        } else {
                            // Swipe right - deny
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
            
            // Execute action based on element type
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
            // Increase touch target size for buttons
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
                    
                    /* Make touch targets more accessible */
                    button, a, .nav-item, .card {
                        -webkit-tap-highlight-color: rgba(99, 102, 241, 0.3);
                    }
                }
            `;
            document.head.appendChild(style);
        },
        
        /**
         * Add mobile-specific shortcuts
         */
        addMobileShortcuts: function() {
            // Add floating action button for mobile
            if (this.detectMobile()) {
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
                    // Show quick actions menu
                    this.showMobileQuickActions();
                });
                
                fab.addEventListener('touchstart', () => {
                    fab.style.transform = 'scale(0.95)';
                });
                
                fab.addEventListener('touchend', () => {
                    fab.style.transform = 'scale(1)';
                });
                
                document.body.appendChild(fab);
            }
        },
        
        /**
         * Show mobile quick actions menu
         */
        showMobileQuickActions: function() {
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
            
            const actions = [;
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
            
            // Add click handlers
            menu.querySelectorAll('.mobile-action-item').forEach(item => {
                item.addEventListener('click', () => {
                    try {
                        // Safe action executor - replaces eval
                        this.executeAction(item.dataset.action);
                    } catch (error) {
                        Logger.error('[MobileEnhancements] Error executing action:', error);
                    }
                    menu.remove();
                });
            });
            
            // Close menu when clicking outside
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

    // Make available globally
    window.MobileEnhancements = MobileEnhancements;
    
    Logger.debug('Mobile Enhancements module loaded');
})();