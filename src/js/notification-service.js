/**
 * Notification Service for Lifestar Ambulance Scheduling
 * Handles SMS (Twilio) and Email (SendGrid) notifications
 * Client-side stubs that queue notifications for when API keys are configured
 */

// ========================================
// NOTIFICATION SERVICE
// ========================================

const NotificationService = {
    // Notification queue (persisted to localStorage)
    _queue: [],
    
    /**
     * Initialize the notification service
     */
    init() {
        this._queue = safeJSONParse(localStorage.getItem('notificationQueue')) || [];
        this._loadConfig();
    },
    
    /**
     * Load API configuration from localStorage
     */
    _loadConfig() {
        this.config = {
            twilio: {
                accountSid: localStorage.getItem('twilioAccountSid') || '',
                authToken: localStorage.getItem('twilioAuthToken') || '',
                fromNumber: localStorage.getItem('twilioFromNumber') || ''
            },
            sendgrid: {
                apiKey: localStorage.getItem('sendgridApiKey') || '',
                fromEmail: localStorage.getItem('sendgridFromEmail') || 'noreply@lifestar-ambulance.com',
                fromName: 'Lifestar Ambulance Scheduling'
            }
        };
    },
    
    /**
     * Check if SMS is configured
     */
    isSMSConfigured() {
        return !!(this.config.twilio.accountSid && this.config.twilio.authToken && this.config.twilio.fromNumber);
    },
    
    /**
     * Check if Email is configured
     */
    isEmailConfigured() {
        return !!this.config.sendgrid.apiKey;
    },

    // ========================================
    // SMS NOTIFICATIONS (TWILIO)
    // ========================================
    
    /**
     * Send SMS notification
     * @param {string} to - Phone number
     * @param {string} message - SMS message body
     * @param {string} type - Notification type
     * @returns {Object} Result with status
     */
    async sendSMS(to, message, type = 'general') {
        const notification = {
            id: Date.now(),
            channel: 'sms',
            to: to,
            message: message,
            type: type,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        
        if (!this.isSMSConfigured()) {
            notification.status = 'queued';
            notification.error = 'Twilio API not configured. SMS queued for later delivery.';
            this._addToQueue(notification);
            return { success: false, queued: true, message: 'SMS queued — Twilio API not configured' };
        }
        
        try {
            // Twilio REST API call
            const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilio.accountSid}/Messages.json`;
            const body = new URLSearchParams({
                To: to,
                From: this.config.twilio.fromNumber,
                Body: message
            });
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + btoa(`${this.config.twilio.accountSid}:${this.config.twilio.authToken}`),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body
            });
            
            if (response.ok) {
                notification.status = 'sent';
                this._addToQueue(notification);
                return { success: true, message: 'SMS sent successfully' };
            } else {
                const error = await response.text();
                notification.status = 'failed';
                notification.error = error;
                this._addToQueue(notification);
                return { success: false, message: 'SMS failed: ' + error };
            }
        } catch (error) {
            notification.status = 'failed';
            notification.error = error.message;
            this._addToQueue(notification);
            return { success: false, message: 'SMS error: ' + error.message };
        }
    },

    // ========================================
    // EMAIL NOTIFICATIONS (SENDGRID)
    // ========================================
    
    /**
     * Send Email notification
     * @param {string} to - Email address
     * @param {string} subject - Email subject
     * @param {string} htmlBody - Email HTML body
     * @param {string} type - Notification type
     * @returns {Object} Result with status
     */
    async sendEmail(to, subject, htmlBody, type = 'general') {
        const notification = {
            id: Date.now(),
            channel: 'email',
            to: to,
            subject: subject,
            message: htmlBody,
            type: type,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        
        if (!this.isEmailConfigured()) {
            notification.status = 'queued';
            notification.error = 'SendGrid API not configured. Email queued for later delivery.';
            this._addToQueue(notification);
            return { success: false, queued: true, message: 'Email queued — SendGrid API not configured' };
        }
        
        try {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + this.config.sendgrid.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email: to }] }],
                    from: { email: this.config.sendgrid.fromEmail, name: this.config.sendgrid.fromName },
                    subject: subject,
                    content: [{ type: 'text/html', value: htmlBody }]
                })
            });
            
            if (response.ok || response.status === 202) {
                notification.status = 'sent';
                this._addToQueue(notification);
                return { success: true, message: 'Email sent successfully' };
            } else {
                const error = await response.text();
                notification.status = 'failed';
                notification.error = error;
                this._addToQueue(notification);
                return { success: false, message: 'Email failed: ' + error };
            }
        } catch (error) {
            notification.status = 'failed';
            notification.error = error.message;
            this._addToQueue(notification);
            return { success: false, message: 'Email error: ' + error.message };
        }
    },

    // ========================================
    // NOTIFICATION TEMPLATES
    // ========================================
    
    templates: {
        schedulePublished: {
            sms: (data) => `[Lifestar] Schedule "${data.name}" has been published for ${data.month} ${data.year}. Check the app for your shifts.`,
            email: {
                subject: (data) => `Schedule Published: ${data.name}`,
                body: (data) => `
                    <h2>Schedule Published</h2>
                    <p>The schedule <strong>${data.name}</strong> for ${data.month} ${data.year} has been published.</p>
                    <p>Please log in to the Lifestar Scheduling System to view your assigned shifts.</p>
                    <p>— Lifestar Ambulance Scheduling</p>
                `
            }
        },
        
        shiftAssigned: {
            sms: (data) => `[Lifestar] You've been assigned a ${data.shiftType} shift on ${data.date}. Rig: ${data.rig || 'TBD'}.`,
            email: {
                subject: (data) => `Shift Assignment: ${data.shiftType} on ${data.date}`,
                body: (data) => `
                    <h2>Shift Assignment</h2>
                    <p>You have been assigned the following shift:</p>
                    <ul>
                        <li><strong>Date:</strong> ${data.date}</li>
                        <li><strong>Type:</strong> ${data.shiftType}</li>
                        <li><strong>Rig:</strong> ${data.rig || 'TBD'}</li>
                    </ul>
                    <p>— Lifestar Ambulance Scheduling</p>
                `
            }
        },
        
        timeOffApproved: {
            sms: (data) => `[Lifestar] Your time-off request for ${data.startDate} to ${data.endDate} has been ${data.status}.`,
            email: {
                subject: (data) => `Time Off ${data.status}: ${data.startDate} - ${data.endDate}`,
                body: (data) => `
                    <h2>Time Off Request ${data.status}</h2>
                    <p>Your time-off request has been <strong>${data.status}</strong>:</p>
                    <ul>
                        <li><strong>Start:</strong> ${data.startDate}</li>
                        <li><strong>End:</strong> ${data.endDate}</li>
                        <li><strong>Reason:</strong> ${data.reason || 'N/A'}</li>
                    </ul>
                    <p>— Lifestar Ambulance Scheduling</p>
                `
            }
        },
        
        shiftTrade: {
            sms: (data) => `[Lifestar] ${data.fromEmployee} wants to trade their ${data.shiftType} shift on ${data.date}. Check the app to respond.`,
            email: {
                subject: (data) => `Shift Trade Request: ${data.date}`,
                body: (data) => `
                    <h2>Shift Trade Request</h2>
                    <p><strong>${data.fromEmployee}</strong> is requesting to trade their shift:</p>
                    <ul>
                        <li><strong>Date:</strong> ${data.date}</li>
                        <li><strong>Type:</strong> ${data.shiftType}</li>
                    </ul>
                    <p>Log in to the app to accept or decline.</p>
                    <p>— Lifestar Ambulance Scheduling</p>
                `
            }
        },
        
        emergencyCallin: {
            sms: (data) => `[Lifestar] URGENT: Emergency call-in needed for ${data.date}. ${data.shiftType} shift. Contact supervisor ASAP.`,
            email: {
                subject: (data) => `URGENT: Emergency Call-in ${data.date}`,
                body: (data) => `
                    <h2 style="color: red;">Emergency Call-in</h2>
                    <p>An emergency call-in is needed:</p>
                    <ul>
                        <li><strong>Date:</strong> ${data.date}</li>
                        <li><strong>Shift:</strong> ${data.shiftType}</li>
                        <li><strong>Details:</strong> ${data.details || 'Contact supervisor for details'}</li>
                    </ul>
                    <p>Please respond ASAP.</p>
                    <p>— Lifestar Ambulance Scheduling</p>
                `
            }
        }
    },
    
    /**
     * Send notification using a template
     * @param {string} templateName - Template name
     * @param {Object} data - Template data
     * @param {Object} recipient - {phone, email, name}
     * @param {Array} channels - ['sms', 'email'] or subset
     */
    async sendFromTemplate(templateName, data, recipient, channels = ['sms', 'email']) {
        const template = this.templates[templateName];
        if (!template) {
            Logger.error('[NotificationService] Template not found:', templateName);
            return { success: false, message: 'Template not found' };
        }
        
        const results = [];
        
        if (channels.includes('sms') && recipient.phone && template.sms) {
            const smsResult = await this.sendSMS(recipient.phone, template.sms(data), templateName);
            results.push({ channel: 'sms', ...smsResult });
        }
        
        if (channels.includes('email') && recipient.email && template.email) {
            const emailResult = await this.sendEmail(;
                recipient.email,
                template.email.subject(data),
                template.email.body(data),
                templateName
            );
            results.push({ channel: 'email', ...emailResult });
        }
        
        return results;
    },

    // ========================================
    // NOTIFICATION QUEUE MANAGEMENT
    // ========================================
    
    /**
     * Add notification to queue
     */
    _addToQueue(notification) {
        this._queue.push(notification);
        // Keep last 100 notifications
        if (this._queue.length > 100) {
            this._queue = this._queue.slice(-100);
        }
        localStorage.setItem('notificationQueue', JSON.stringify(this._queue));
    },
    
    /**
     * Get notification history
     */
    getHistory(limit = 50) {
        return this._queue.slice(-limit).reverse();
    },
    
    /**
     * Get pending/queued notifications
     */
    getPending() {
        return this._queue.filter(n => n.status === 'queued' || n.status === 'pending');
    },
    
    /**
     * Retry queued notifications
     */
    async retryQueued() {
        this._loadConfig();
        const queued = this.getPending();
        let retried = 0;
        
        for (const notification of queued) {
            if (notification.channel === 'sms' && this.isSMSConfigured()) {
                await this.sendSMS(notification.to, notification.message, notification.type);
                retried++;
            } else if (notification.channel === 'email' && this.isEmailConfigured()) {
                await this.sendEmail(notification.to, notification.subject, notification.message, notification.type);
                retried++;
            }
        }
        
        return { retried, total: queued.length };
    },
    
    /**
     * Clear notification history
     */
    clearHistory() {
        this._queue = [];
        localStorage.setItem('notificationQueue', JSON.stringify(this._queue));
    },
    
    /**
     * Get notification stats
     */
    getStats() {
        const stats = { total: this._queue.length, sent: 0, queued: 0, failed: 0, sms: 0, email: 0 };
        this._queue.forEach(n => {
            stats[n.status] = (stats[n.status] || 0) + 1;
            stats[n.channel] = (stats[n.channel] || 0) + 1;
        });
        return stats;
    }
};

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    NotificationService.init();
});