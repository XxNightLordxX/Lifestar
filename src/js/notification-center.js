/**
 * In-App Notification Center
 * Bell icon with notification count, mark as read/unread, notification history with filters
 */

(function() {
    'use strict';

    const NotificationCenter = {
        notifications: [],
        unreadCount: 0,
        maxNotifications: 100,
        
        /**
         * Initialize notification center
         */
        init: function() {
            this.loadNotifications();
            this.injectBellIcon();
            this.injectNotificationPanel();
            this.updateBadge();
        },
        
        /**
         * Load notifications from localStorage
         */
        loadNotifications: function() {
            try {
                const stored = localStorage.getItem('lifestarNotifications');
                if (stored) {
                    this.notifications = JSON.parse(stored);
                }
                this.updateUnreadCount();
            } catch (error) {
                Logger.error('[NotificationCenter] Error loading notifications:', error);
                this.notifications = [];
            }
        },
        
        /**
         * Save notifications to localStorage
         */
        saveNotifications: function() {
            try {
                localStorage.setItem('lifestarNotifications', JSON.stringify(this.notifications));
            } catch (error) {
                Logger.error('[NotificationCenter] Error saving notifications:', error);
            }
        },
        
        /**
         * Add a new notification
         */
        addNotification: function(notification) {
            const newNotification = {
                id: Date.now(),
                title: notification.title || 'Notification',
                message: notification.message || '',
                type: notification.type || 'info', // info, success, warning, error
                read: false,
                createdAt: new Date().toISOString(),
                action: notification.action || null,
                actionLabel: notification.actionLabel || null
            };
            
            this.notifications.unshift(newNotification);
            
            // Keep only max notifications
            if (this.notifications.length > this.maxNotifications) {
                this.notifications = this.notifications.slice(0, this.maxNotifications);
            }
            
            this.updateUnreadCount();
            this.saveNotifications();
            this.updateBadge();
            this.renderNotifications();
            
            // Show toast for new notification
            if(typeof showToast === 'function') {
                showToast(newNotification.message, newNotification.type);
            }
        },
        
        /**
         * Update unread count
         */
        updateUnreadCount: function() {
            this.unreadCount = this.notifications.filter(n => !n.read).length;
        },
        
        /**
         * Update badge count
         */
        updateBadge: function() {
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                if (this.unreadCount > 0) {
                    badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        },
        
        /**
         * Mark notification as read
         */
        markAsRead: function(notificationId) {
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification) {
                notification.read = true;
                this.updateUnreadCount();
                this.saveNotifications();
                this.updateBadge();
                this.renderNotifications();
            }
        },
        
        /**
         * Mark all notifications as read
         */
        markAllAsRead: function() {
            this.notifications.forEach(n => n.read = true);
            this.updateUnreadCount();
            this.saveNotifications();
            this.updateBadge();
            this.renderNotifications();
        },
        
        /**
         * Delete notification
         */
        deleteNotification: function(notificationId) {
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateUnreadCount();
            this.saveNotifications();
            this.updateBadge();
            this.renderNotifications();
        },
        
        /**
         * Clear all notifications
         */
        clearAll: function() {
            if (confirm('Are you sure you want to clear all notifications?')) {
                this.notifications = [];
                this.updateUnreadCount();
                this.saveNotifications();
                this.updateBadge();
                this.renderNotifications();
            }
        },
        
        /**
         * Inject bell icon into header
         */
        injectBellIcon: function() {
            // Check if already injected
            if (document.getElementById('notificationBell')) return;
            
            const header = document.querySelector('.header-right') || document.querySelector('.main-content .header');
            if (!header) return;
            
            const bellContainer = document.createElement('div');
            bellContainer.id = 'notificationBell';
            bellContainer.style.cssText = 'position: relative; cursor: pointer; margin-left: 15px;';
            bellContainer.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <div id="notificationBadge" style="display: none; position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; display: flex; align-items: center; justify-content: center; font-weight: bold;"></div>
            `;
            
            bellContainer.addEventListener('click', () => this.togglePanel());
            header.appendChild(bellContainer);
        },
        
        /**
         * Inject notification panel
         */
        injectNotificationPanel: function() {
            // Check if already injected
            if (document.getElementById('notificationPanel')) return;
            
            const panel = document.createElement('div');
            panel.id = 'notificationPanel';
            panel.style.cssText = `
                position: fixed;
                top: 60px;
                right: 20px;
                width: 400px;
                max-height: 500px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10000;
                display: none;
                flex-direction: column;
            `;
            
            panel.innerHTML = `
                <div style="padding: 15px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 16px;">Notifications</h3>
                    <div>
                        <button id="markAllReadBtn" style="background: none; border: none; color: #6366f1; cursor: pointer; font-size: 14px; margin-right: 10px;">Mark all read</button>
                        <button id="clearAllBtn" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px;">Clear all</button>
                    </div>
                </div>
                <div style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                    <select id="notificationFilter" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                        <option value="all">All Notifications</option>
                        <option value="unread">Unread Only</option>
                        <option value="info">Info</option>
                        <option value="success">Success</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                    </select>
                </div>
                <div id="notificationList" style="flex: 1; overflow-y: auto; padding: 10px;"></div>
            `;
            
            document.body.appendChild(panel);
            
            // Event listeners
            document.getElementById('markAllReadBtn').addEventListener('click', () => this.markAllAsRead());
            document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAll());
            document.getElementById('notificationFilter').addEventListener('change', () => this.renderNotifications());
            
            // Close panel when clicking outside
            document.addEventListener('click', (e) => {
                const bell = document.getElementById('notificationBell');
                const panel = document.getElementById('notificationPanel');
                if (bell && panel && !bell.contains(e.target) && !panel.contains(e.target)) {
                    panel.style.display = 'none';
                }
            });
        },
        
        /**
         * Toggle notification panel
         */
        togglePanel: function() {
            const panel = document.getElementById('notificationPanel');
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
                if (panel.style.display === 'flex') {
                    this.renderNotifications();
                }
            }
        },
        
        /**
         * Render notifications
         */
        renderNotifications: function() {
            const list = document.getElementById('notificationList');
            if (!list) return;
            
            const filter = document.getElementById('notificationFilter');
            const filterValue = filter ? filter.value : 'all';
            
            let filtered = this.notifications;
            
            if (filterValue === 'unread') {
                filtered = this.notifications.filter(n => !n.read);
            } else if (filterValue !== 'all') {
                filtered = this.notifications.filter(n => n.type === filterValue);
            }
            
            if (filtered.length === 0) {
                list.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #9ca3af;">
                        <div style="font-size: 48px; margin-bottom: 10px;">🔔</div>
                        <p>No notifications</p>
                    </div>
                `;
                return;
            }
            
            list.textContent = filtered.map(notification => {
                const typeColors = {
                    info: '#3b82f6',
                    success: '#10b981',
                    warning: '#f59e0b',
                    error: '#ef4444'
                };
                
                const typeIcons = {
                    info: 'ℹ️',
                    success: '✅',
                    warning: '⚠️',
                    error: '❌'
                };
                
                const date = new Date(notification.createdAt);
                const timeAgo = this.getTimeAgo(date);
                
                return `;
                    <div class="notification-item" style="padding: 12px; border-radius: 6px; margin-bottom: 8px; background: ${notification.read ? '#f9fafb' : '#eff6ff'}; border-left: 4px solid ${typeColors[notification.type]}; cursor: pointer;" data-id="${notification.id}">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <span style="font-size: 16px;">${typeIcons[notification.type]}</span>
                                    <strong style="font-size: 14px; color: ${notification.read ? '#6b7280' : '#1f2937'};">${sanitizeHTML(notification.title)}</strong>
                                </div>
                                <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">${sanitizeHTML(notification.message)}</p>
                                <span style="font-size: 11px; color: #9ca3af;">${timeAgo}</span>
                            </div>
                            <button class="delete-notification-btn" style="background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px;" data-id="${notification.id}">×</button>
                        </div>
                        ${notification.action ? `
                            <button class="notification-action-btn" style="margin-top: 8px; padding: 6px 12px; background: ${typeColors[notification.type]}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;" data-action="${notification.action}">${notification.actionLabel}</button>
                        ` : ''}
                    </div>
                `;
            }).join('');
            
            // Add click handlers
            list.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('delete-notification-btn')) {
                        e.stopPropagation();
                        this.deleteNotification(parseInt(item.dataset.id));
                    } else if (e.target.classList.contains('notification-action-btn')) {
                        e.stopPropagation();
                        const action = e.target.dataset.action;
                        this.markAsRead(parseInt(item.dataset.id));
                        // Safe action executor - replaces eval
                        this.executeAction(action);
                    } else {
                        this.markAsRead(parseInt(item.dataset.id));
                    }
                });
            });
        },
        
        /**
         * Safe action executor - replaces eval() for security
         */
        executeAction: function(actionStr) {
            const match = actionStr.match(/^(\w+)\(([^)]*)\)$/);
            if (!match) {
                Logger.warn('[NotificationCenter] Invalid action format:', actionStr);
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
                Logger.warn('[NotificationCenter] Function not found:', funcName);
            }
        },
        
        /**
         * Get time ago string
         */
        getTimeAgo: function(date) {
            const seconds = Math.floor((new Date() - date) / 1000);
            
            const intervals = {
                year: 31536000,
                month: 2592000,
                week: 604800,
                day: 86400,
                hour: 3600,
                minute: 60
            };
            
            for (const [unit, secondsInUnit] of Object.entries(intervals)) {
                const interval = Math.floor(seconds / secondsInUnit);
                if (interval >= 1) {
                    return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
                }
            }
            
            return 'Just now';
        }
    };

    // Make available globally
    window.NotificationCenter = NotificationCenter;
    
    Logger.debug('Notification Center module loaded');
})();