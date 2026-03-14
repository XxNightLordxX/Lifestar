/**
 * Core Notifications Module for Lifestar Ambulance Scheduling System
 * Consolidates: notification-center.js, notification-service.js
 * 
 * Provides in-app notifications, SMS (Twilio), and Email (SendGrid) support
 */

(function() {
    'use strict';

    // ============================================
    // NOTIFICATION STATE
    // ============================================
    let _notifIdCounter = 0;
    const NotificationState = {
        notifications: [],
        queue: [],
        unreadCount: 0,
        maxNotifications: 100,
        config: {
            twilio: { accountSid: '', authToken: '', fromNumber: '' },
            sendgrid: { apiKey: '', fromEmail: 'noreply@lifestar-ambulance.com', fromName: 'Lifestar Ambulance' }
        }
    };

    // ============================================
    // NOTIFICATION CENTER (In-App)
    // ============================================
    const NotificationCenter = {
        STORAGE_KEY: 'lifestarNotifications',

        /**
         * Initialize notification center
         */
        init() {
            this.load();
            this.injectUI();
            this.updateBadge();
            Logger.debug('✅ NotificationCenter initialized');
        },

        /**
         * Load notifications from storage
         */
        load() {
            try {
                const stored = localStorage.getItem(this.STORAGE_KEY);
                if (stored) {
                    NotificationState.notifications = JSON.parse(stored);
                }
                this.updateUnreadCount();
            } catch (error) {
                Logger.error('[NotificationCenter.load]', error);
                NotificationState.notifications = [];
            }
        },

        /**
         * Save notifications to storage
         */
        save() {
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(NotificationState.notifications));
            } catch (error) {
                Logger.error('[NotificationCenter.save]', error);
            }
        },

        /**
         * Add a new notification
         */
        add(notification) {
            const newNotification = {
                id: Date.now() + (++_notifIdCounter),
                title: notification.title || 'Notification',
                message: notification.message || '',
                type: notification.type || 'info',
                read: false,
                createdAt: new Date().toISOString(),
                action: notification.action || null,
                actionLabel: notification.actionLabel || null
            };

            NotificationState.notifications.unshift(newNotification);

            // Limit to max notifications
            if (NotificationState.notifications.length > NotificationState.maxNotifications) {
                NotificationState.notifications = NotificationState.notifications.slice(0, NotificationState.maxNotifications);
            }

            this.updateUnreadCount();
            this.save();
            this.updateBadge();
            this.render();

            // Show toast
            if (typeof showToast === 'function') {
                showToast(newNotification.message, newNotification.type);
            }

            return newNotification;
        },

        /**
         * Update unread count
         */
        updateUnreadCount() {
            NotificationState.unreadCount = NotificationState.notifications.filter(n => !n.read).length;
        },

        /**
         * Update badge display
         */
        updateBadge() {
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                if (NotificationState.unreadCount > 0) {
                    badge.textContent = NotificationState.unreadCount > 99 ? '99+' : NotificationState.unreadCount;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        },

        /**
         * Mark notification as read
         */
        markAsRead(id) {
            const notification = NotificationState.notifications.find(n => n.id === id);
            if (notification) {
                notification.read = true;
                this.updateUnreadCount();
                this.save();
                this.updateBadge();
                this.render();
            }
        },

        /**
         * Mark all as read
         */
        markAllAsRead() {
            NotificationState.notifications.forEach(n => n.read = true);
            this.updateUnreadCount();
            this.save();
            this.updateBadge();
            this.render();
        },

        /**
         * Delete notification
         */
        delete(id) {
            NotificationState.notifications = NotificationState.notifications.filter(n => n.id !== id);
            this.updateUnreadCount();
            this.save();
            this.updateBadge();
            this.render();
        },

        /**
         * Clear all notifications
         */
        clearAll() {
            if (confirm('Are you sure you want to clear all notifications?')) {
                NotificationState.notifications = [];
                this.updateUnreadCount();
                this.save();
                this.updateBadge();
                this.render();
            }
        },

        /**
         * Inject UI elements
         */
        injectUI() {
            // Inject bell icon if not exists
            if (!document.getElementById('notificationBell')) {
                const header = document.querySelector('.header-right') || document.querySelector('header');
                if (header) {
                    const bellContainer = document.createElement('div');
                    bellContainer.className = 'notification-bell-container';
                    bellContainer.innerHTML = `
                        <button id="notificationBell" class="notification-bell" aria-label="Notifications">
                            <span class="bell-icon">🔔</span>
                            <span id="notificationBadge" class="notification-badge" style="display: none;">0</span>
                        </button>
                    `;
                    header.insertBefore(bellContainer, header.firstChild);
                }
            }

            // Inject notification panel if not exists
            if (!document.getElementById('notificationPanel')) {
                const panel = document.createElement('div');
                panel.id = 'notificationPanel';
                panel.className = 'notification-panel hidden';
                panel.innerHTML = `
                    <div class="notification-header">
                        <h3>Notifications</h3>
                        <div class="notification-actions">
                            <button class="btn btn-sm btn-link" onclick="NotificationCenter.markAllAsRead()">Mark all read</button>
                            <button class="btn btn-sm btn-link" onclick="NotificationCenter.clearAll()">Clear all</button>
                        </div>
                    </div>
                    <div id="notificationList" class="notification-list"></div>
                `;
                document.body.appendChild(panel);

                // Toggle panel on bell click
                const bell = document.getElementById('notificationBell');
                if (bell) {
                    bell.addEventListener('click', (e) => {
                        e.stopPropagation();
                        panel.classList.toggle('hidden');
                    });
                }

                // Close on outside click
                document.addEventListener('click', (e) => {
                    if (!panel.contains(e.target) && !e.target.closest('#notificationBell')) {
                        panel.classList.add('hidden');
                    }
                });
            }

            this.render();
        },

        /**
         * Render notifications list
         */
        render() {
            const list = document.getElementById('notificationList');
            if (!list) return;

            if (NotificationState.notifications.length === 0) {
                list.innerHTML = '<p class="no-notifications">No notifications</p>';
                return;
            }

            list.innerHTML = NotificationState.notifications.map(n => {
                const typeClass = `notification-${n.type}`;
                const readClass = n.read ? 'read' : 'unread';
                const timeAgo = this.formatTimeAgo(new Date(n.createdAt));

                return `
                    <div class="notification-item ${typeClass} ${readClass}" data-id="${n.id}">
                        <div class="notification-content" onclick="NotificationCenter.markAsRead(${n.id})">
                            <strong>${this.escapeHtml(n.title)}</strong>
                            <p>${this.escapeHtml(n.message)}</p>
                            <small>${timeAgo}</small>
                        </div>
                        <button class="notification-delete" onclick="NotificationCenter.delete(${n.id})">×</button>
                    </div>
                `;
            }).join('');
        },

        /**
         * Format time ago
         */
        formatTimeAgo(date) {
            const seconds = Math.floor((new Date() - date) / 1000);
            if (seconds < 60) return 'Just now';
            if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
            if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
            return `${Math.floor(seconds / 86400)}d ago`;
        },

        /**
         * Escape HTML
         */
        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    // ============================================
    // NOTIFICATION SERVICE (SMS & Email)
    // ============================================
    const NotificationService = {
        QUEUE_KEY: 'notificationQueue',

        /**
         * Initialize service
         */
        init() {
            this.loadQueue();
            this.loadConfig();
            Logger.debug('✅ NotificationService initialized');
        },

        /**
         * Load queue from storage
         */
        loadQueue() {
            try {
                const stored = localStorage.getItem(this.QUEUE_KEY);
                NotificationState.queue = stored ? JSON.parse(stored) : [];
            } catch (error) {
                Logger.error('[NotificationService.loadQueue]', error);
                NotificationState.queue = [];
            }
        },

        /**
         * Load API configuration
         */
        loadConfig() {
            NotificationState.config = {
                twilio: {
                    accountSid: localStorage.getItem('twilioAccountSid') || '',
                    authToken: localStorage.getItem('twilioAuthToken') || '',
                    fromNumber: localStorage.getItem('twilioFromNumber') || ''
                },
                sendgrid: {
                    apiKey: localStorage.getItem('sendgridApiKey') || '',
                    fromEmail: localStorage.getItem('sendgridFromEmail') || 'noreply@lifestar-ambulance.com',
                    fromName: 'Lifestar Ambulance'
                }
            };
        },

        /**
         * Save queue to storage
         */
        saveQueue() {
            try {
                localStorage.setItem(this.QUEUE_KEY, JSON.stringify(NotificationState.queue));
            } catch (error) {
                Logger.error('[NotificationService.saveQueue]', error);
            }
        },

        /**
         * Add to queue
         */
        addToQueue(notification) {
            NotificationState.queue.push(notification);
            this.saveQueue();
        },

        /**
         * Check if SMS is configured
         */
        isSMSConfigured() {
            const { twilio } = NotificationState.config;
            return !!(twilio.accountSid && twilio.authToken && twilio.fromNumber);
        },

        /**
         * Check if Email is configured
         */
        isEmailConfigured() {
            return !!NotificationState.config.sendgrid.apiKey;
        },

        /**
         * Send SMS notification
         */
        async sendSMS(to, message, type = 'general') {
            const notification = {
                id: Date.now(),
                channel: 'sms',
                to, message, type,
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            if (!this.isSMSConfigured()) {
                notification.status = 'queued';
                notification.error = 'Twilio API not configured';
                this.addToQueue(notification);
                return { success: false, queued: true, message: 'SMS queued — Twilio not configured' };
            }

            try {
                const { twilio } = NotificationState.config;
                const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
                const body = new URLSearchParams({ To: to, From: twilio.fromNumber, Body: message });

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + btoa(`${twilio.accountSid}:${twilio.authToken}`),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body
                });

                if (response.ok) {
                    notification.status = 'sent';
                    this.addToQueue(notification);
                    return { success: true, message: 'SMS sent successfully' };
                } else {
                    notification.status = 'failed';
                    notification.error = await response.text();
                    this.addToQueue(notification);
                    return { success: false, message: 'SMS failed' };
                }
            } catch (error) {
                notification.status = 'failed';
                notification.error = error.message;
                this.addToQueue(notification);
                return { success: false, message: 'SMS error: ' + error.message };
            }
        },

        /**
         * Send Email notification
         */
        async sendEmail(to, subject, htmlBody, type = 'general') {
            const notification = {
                id: Date.now(),
                channel: 'email',
                to, subject, message: htmlBody, type,
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            if (!this.isEmailConfigured()) {
                notification.status = 'queued';
                notification.error = 'SendGrid API not configured';
                this.addToQueue(notification);
                return { success: false, queued: true, message: 'Email queued — SendGrid not configured' };
            }

            try {
                const { sendgrid } = NotificationState.config;
                const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${sendgrid.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        personalizations: [{ to: [{ email: to }] }],
                        from: { email: sendgrid.fromEmail, name: sendgrid.fromName },
                        subject,
                        content: [{ type: 'text/html', value: htmlBody }]
                    })
                });

                if (response.ok || response.status === 202) {
                    notification.status = 'sent';
                    this.addToQueue(notification);
                    return { success: true, message: 'Email sent successfully' };
                } else {
                    notification.status = 'failed';
                    notification.error = await response.text();
                    this.addToQueue(notification);
                    return { success: false, message: 'Email failed' };
                }
            } catch (error) {
                notification.status = 'failed';
                notification.error = error.message;
                this.addToQueue(notification);
                return { success: false, message: 'Email error: ' + error.message };
            }
        },

        /**
         * Send notification to user (determines best channel)
         */
        async sendToUser(userId, options) {
            const user = window.users?.find(u => u.id === userId);
            if (!user) return { success: false, message: 'User not found' };

            const results = [];

            // Add in-app notification
            if (options.inApp !== false) {
                NotificationCenter.add({
                    title: options.title,
                    message: options.message,
                    type: options.type || 'info'
                });
                results.push({ channel: 'in-app', success: true });
            }

            // Send SMS if phone available and requested
            if (options.sms && user.phone) {
                const result = await this.sendSMS(user.phone, options.message, options.type);
                results.push({ channel: 'sms', ...result });
            }

            // Send email if email available and requested
            if (options.email && user.email) {
                const html = options.htmlBody || `<p>${options.message}</p>`;
                const result = await this.sendEmail(user.email, options.title, html, options.type);
                results.push({ channel: 'email', ...result });
            }

            return { success: true, results };
        },

        /**
         * Get queue status
         */
        getQueueStatus() {
            return {
                total: NotificationState.queue.length,
                pending: NotificationState.queue.filter(n => n.status === 'pending').length,
                queued: NotificationState.queue.filter(n => n.status === 'queued').length,
                sent: NotificationState.queue.filter(n => n.status === 'sent').length,
                failed: NotificationState.queue.filter(n => n.status === 'failed').length
            };
        }
    };

    // ============================================
    // CONVENIENCE FUNCTIONS
    // ============================================

    /**
     * Quick notification helper
     */
    function notify(message, type = 'info', title = null) {
        return NotificationCenter.add({ title: title || type.charAt(0).toUpperCase() + type.slice(1), message, type });
    }

    /**
     * Notify specific user
     */
    function notifyUser(userId, message, options = {}) {
        return NotificationService.sendToUser(userId, { message, ...options });
    }

    // ============================================
    // INITIALIZE
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            NotificationCenter.init();
            NotificationService.init();
        });
    } else {
        NotificationCenter.init();
        NotificationService.init();
    }

    // ============================================
    // EXPOSE TO GLOBAL SCOPE
    // ============================================
    window.NotificationState = NotificationState;
    window.NotificationCenter = NotificationCenter;
    window.NotificationService = NotificationService;
    window.notify = notify;
    window.notifyUser = notifyUser;

    // Backward compatibility aliases
    window.addNotification = (n) => NotificationCenter.add(n);
    window.sendSMS = (to, msg, type) => NotificationService.sendSMS(to, msg, type);
    window.sendEmail = (to, subj, body, type) => NotificationService.sendEmail(to, subj, body, type);

    Logger.debug('✅ Core Notifications Module loaded');

})();