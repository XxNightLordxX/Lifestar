/**
 * Core Features Module for Lifestar Ambulance Scheduling System
 * Consolidates: boss-features.js, remaining-features.js
 * 
 * Includes: Crew Management, Shift Trades, Swap Marketplace, Training,
 * Bonus Hours, Emergency Call-ins, On-Call Rotation, Analytics
 */

(function() {
    'use strict';

    // ============================================
    // FEATURE STATE
    // ============================================
    const FeatureState = {
        crewTemplates: [],
        shiftTrades: [],
        swapListings: [],
        trainingRecords: [],
        bonusHours: [],
        emergencyCallins: [],
        absences: [],
        oncallRotations: [],
        supervisorNotes: [],
        scheduleTemplates: [],
        incidentReports: [],
        notifications: [],
        userSettings: {},
        performanceData: {}
    };

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    const FeatureUtils = {
        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        sanitize(input) {
            if (typeof input !== 'string') return String(input || '');
            return input.replace(/[<>&"']/g, c => ({
                '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
            }[c]));
        },

        safeJSON(jsonString, defaultValue = null) {
            try {
                return JSON.parse(jsonString);
            } catch (e) {
                return defaultValue;
            }
        },

        generateId() {
            return Date.now() + Math.random().toString(36).substr(2, 9);
        }
    };

    // ============================================
    // CREW MANAGER
    // ============================================
    const CrewManager = {
        STORAGE_KEY: 'lifestarCrewTemplates',

        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) FeatureState.crewTemplates = FeatureUtils.safeJSON(saved, []);
                this.render();
            } catch (error) {
                Logger.error('[CrewManager.load]', error);
            }
        },

        save() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(FeatureState.crewTemplates));
        },

        create(data) {
            const template = {
                id: FeatureUtils.generateId(),
                name: data.name,
                paramedicId: data.paramedicId,
                emtId: data.emtId,
                station: data.station || 'Main',
                createdAt: new Date().toISOString()
            };
            FeatureState.crewTemplates.push(template);
            this.save();
            this.render();
            return template;
        },

        update(id, data) {
            const index = FeatureState.crewTemplates.findIndex(t => t.id === id);
            if (index !== -1) {
                FeatureState.crewTemplates[index] = { ...FeatureState.crewTemplates[index], ...data };
                this.save();
                this.render();
            }
        },

        delete(id) {
            FeatureState.crewTemplates = FeatureState.crewTemplates.filter(t => t.id !== id);
            this.save();
            this.render();
        },

        render() {
            const grid = document.getElementById('crewTemplatesGrid');
            if (!grid) return;

            grid.innerHTML = '';

            if (FeatureState.crewTemplates.length === 0) {
                const noMsg = document.getElementById('noCrewTemplatesMessage');
                if (noMsg) noMsg.style.display = 'block';
                grid.style.display = 'none';
                return;
            }

            const noMsg = document.getElementById('noCrewTemplatesMessage');
            if (noMsg) noMsg.style.display = 'none';
            grid.style.display = 'grid';

            FeatureState.crewTemplates.forEach(template => {
                const paramedic = window.users?.find(u => u.id === template.paramedicId);
                const emt = window.users?.find(u => u.id === template.emtId);

                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div class="card-header">
                        <h3>${FeatureUtils.escapeHtml(template.name)}</h3>
                    </div>
                    <div class="card-body">
                        <p><strong>Paramedic:</strong> ${paramedic ? FeatureUtils.escapeHtml(paramedic.fullName || paramedic.username) : 'Unassigned'}</p>
                        <p><strong>EMT:</strong> ${emt ? FeatureUtils.escapeHtml(emt.fullName || emt.username) : 'Unassigned'}</p>
                        <p><strong>Station:</strong> ${FeatureUtils.escapeHtml(template.station)}</p>
                        <div class="card-actions">
                            <button class="btn btn-sm btn-warning" onclick="CrewManager.edit('${template.id}')">Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="CrewManager.delete('${template.id}')">Delete</button>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        },

        edit(id) {
            const template = FeatureState.crewTemplates.find(t => t.id === id);
            if (template) {
                window._editingCrewTemplateId = id;
                // Populate modal with template data
                const form = document.getElementById('createCrewTemplateForm');
                if (form) {
                    form.querySelector('[name="name"]').value = template.name;
                    form.querySelector('[name="station"]').value = template.station;
                    showModal('createCrewTemplateModal');
                }
            }
        }
    };

    // ============================================
    // SHIFT TRADE MANAGER
    // ============================================
    const ShiftTradeManager = {
        STORAGE_KEY: 'lifestarShiftTrades',

        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) FeatureState.shiftTrades = FeatureUtils.safeJSON(saved, []);
                this.render();
            } catch (error) {
                Logger.error('[ShiftTradeManager.load]', error);
            }
        },

        save() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(FeatureState.shiftTrades));
        },

        create(data) {
            const trade = {
                id: FeatureUtils.generateId(),
                requesterId: data.requesterId,
                recipientId: data.recipientId,
                date: data.date,
                shiftType: data.shiftType,
                reason: data.reason,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            FeatureState.shiftTrades.push(trade);
            this.save();
            this.render();
            return trade;
        },

        approve(id) {
            const trade = FeatureState.shiftTrades.find(t => t.id === id);
            if (trade) {
                trade.status = 'approved';
                trade.approvedAt = new Date().toISOString();
                this.save();
                this.render();
                window.showAlert?.('Trade approved successfully', 'success');
            }
        },

        deny(id) {
            const trade = FeatureState.shiftTrades.find(t => t.id === id);
            if (trade) {
                trade.status = 'denied';
                this.save();
                this.render();
                window.showAlert?.('Trade denied', 'warning');
            }
        },

        render() {
            const tbody = document.getElementById('shiftTradesTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';

            FeatureState.shiftTrades.forEach(trade => {
                const requester = window.users?.find(u => u.id === trade.requesterId);
                const recipient = window.users?.find(u => u.id === trade.recipientId);

                const statusClass = {
                    'pending': 'badge-warning',
                    'approved': 'badge-success',
                    'denied': 'badge-danger'
                }[trade.status] || 'badge-secondary';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${FeatureUtils.escapeHtml(requester?.fullName || requester?.username || 'Unknown')}</td>
                    <td>${FeatureUtils.escapeHtml(recipient?.fullName || recipient?.username || 'Unknown')}</td>
                    <td>${FeatureUtils.escapeHtml(trade.date)}</td>
                    <td>${FeatureUtils.escapeHtml(trade.shiftType)}</td>
                    <td><span class="badge ${statusClass}">${trade.status}</span></td>
                    <td>
                        ${trade.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="ShiftTradeManager.approve('${trade.id}')">Approve</button>
                            <button class="btn btn-sm btn-danger" onclick="ShiftTradeManager.deny('${trade.id}')">Deny</button>
                        ` : ''}
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    };

    // ============================================
    // SWAP MARKETPLACE
    // ============================================
    const SwapMarketplace = {
        STORAGE_KEY: 'lifestarSwapListings',

        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) FeatureState.swapListings = FeatureUtils.safeJSON(saved, []);
                this.render();
            } catch (error) {
                Logger.error('[SwapMarketplace.load]', error);
            }
        },

        save() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(FeatureState.swapListings));
        },

        create(data) {
            const listing = {
                id: FeatureUtils.generateId(),
                requesterId: data.requesterId,
                date: data.date,
                shiftType: data.shiftType,
                swapType: data.swapType,
                reason: data.reason,
                urgent: data.urgent || false,
                createdAt: new Date().toISOString()
            };
            FeatureState.swapListings.push(listing);
            this.save();
            this.render();
            return listing;
        },

        accept(id) {
            const listing = FeatureState.swapListings.find(l => l.id === id);
            if (listing && confirm(`Accept swap from ${listing.requesterId}?`)) {
                // Create shift trade
                ShiftTradeManager.create({
                    requesterId: listing.requesterId,
                    recipientId: window.currentUser?.id,
                    date: listing.date,
                    shiftType: listing.shiftType
                });

                // Remove listing
                FeatureState.swapListings = FeatureState.swapListings.filter(l => l.id !== id);
                this.save();
                this.render();
                window.showAlert?.('Swap accepted and trade created', 'success');
            }
        },

        render() {
            const grid = document.getElementById('swapMarketplaceGrid');
            if (!grid) return;

            grid.innerHTML = '';

            if (FeatureState.swapListings.length === 0) {
                const noMsg = document.getElementById('noSwapListingsMessage');
                if (noMsg) noMsg.style.display = 'block';
                grid.style.display = 'none';
                return;
            }

            const noMsg = document.getElementById('noSwapListingsMessage');
            if (noMsg) noMsg.style.display = 'none';
            grid.style.display = 'grid';

            FeatureState.swapListings.forEach(listing => {
                const requester = window.users?.find(u => u.id === listing.requesterId);
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div class="card-header" style="background: ${listing.urgent ? 'var(--danger-color)' : 'var(--lifestar-blue)'};">
                        <h2>${listing.urgent ? '🚨 URGENT' : '📅'} ${FeatureUtils.escapeHtml(listing.date)}</h2>
                    </div>
                    <div class="card-body">
                        <p><strong>Staff:</strong> ${FeatureUtils.escapeHtml(requester?.fullName || requester?.username || 'Unknown')}</p>
                        <p><strong>Shift:</strong> ${FeatureUtils.escapeHtml(listing.shiftType)}</p>
                        <p><strong>Type:</strong> ${FeatureUtils.escapeHtml(listing.swapType)}</p>
                        <p><strong>Reason:</strong> ${FeatureUtils.escapeHtml(listing.reason)}</p>
                        <div style="margin-top: 15px;">
                            <button class="btn btn-sm btn-primary" onclick="SwapMarketplace.accept('${listing.id}')">Accept</button>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }
    };

    // ============================================
    // TRAINING MANAGER
    // ============================================
    const TrainingManager = {
        STORAGE_KEY: 'lifestarTrainingRecords',

        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) FeatureState.trainingRecords = FeatureUtils.safeJSON(saved, []);
                this.render();
            } catch (error) {
                Logger.error('[TrainingManager.load]', error);
            }
        },

        save() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(FeatureState.trainingRecords));
        },

        create(data) {
            const record = {
                id: FeatureUtils.generateId(),
                name: data.name,
                type: data.type,
                staffId: data.staffId,
                date: data.date,
                status: 'scheduled',
                createdAt: new Date().toISOString()
            };
            FeatureState.trainingRecords.push(record);
            this.save();
            this.render();
            return record;
        },

        delete(id) {
            if (confirm('Delete this training record?')) {
                FeatureState.trainingRecords = FeatureState.trainingRecords.filter(t => t.id !== id);
                this.save();
                this.render();
                window.showAlert?.('Training deleted', 'success');
            }
        },

        render() {
            const tbody = document.getElementById('trainingTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';

            if (FeatureState.trainingRecords.length === 0) {
                const noMsg = document.getElementById('noTrainingMessage');
                const table = document.getElementById('trainingTable');
                if (noMsg) noMsg.style.display = 'block';
                if (table) table.style.display = 'none';
                return;
            }

            const noMsg = document.getElementById('noTrainingMessage');
            const table = document.getElementById('trainingTable');
            if (noMsg) noMsg.style.display = 'none';
            if (table) table.style.display = 'table';

            FeatureState.trainingRecords.forEach(record => {
                const staff = window.users?.find(u => u.id === record.staffId);
                const statusClass = {
                    'completed': 'badge-success',
                    'scheduled': 'badge-warning',
                    'cancelled': 'badge-danger'
                }[record.status] || 'badge-secondary';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${FeatureUtils.escapeHtml(record.name)}</td>
                    <td>${FeatureUtils.escapeHtml(record.type)}</td>
                    <td>${FeatureUtils.escapeHtml(staff?.fullName || staff?.username || 'Unknown')}</td>
                    <td>${FeatureUtils.escapeHtml(record.date)}</td>
                    <td><span class="badge ${statusClass}">${record.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="TrainingManager.delete('${record.id}')">Delete</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    };

    // ============================================
    // BONUS HOURS MANAGER
    // ============================================
    const BonusHoursManager = {
        STORAGE_KEY: 'lifestarBonusHours',

        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) FeatureState.bonusHours = FeatureUtils.safeJSON(saved, []);
                this.render();
            } catch (error) {
                Logger.error('[BonusHoursManager.load]', error);
            }
        },

        save() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(FeatureState.bonusHours));
        },

        add(data) {
            const bonus = {
                id: FeatureUtils.generateId(),
                staffId: data.staffId,
                hours: data.hours,
                reason: data.reason,
                date: data.date,
                createdAt: new Date().toISOString()
            };
            FeatureState.bonusHours.push(bonus);
            this.save();
            this.render();
            return bonus;
        },

        render() {
            const tbody = document.getElementById('bonusHoursTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';

            FeatureState.bonusHours.forEach(bonus => {
                const staff = window.users?.find(u => u.id === bonus.staffId);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${FeatureUtils.escapeHtml(staff?.fullName || staff?.username || 'Unknown')}</td>
                    <td>${bonus.hours}</td>
                    <td>${FeatureUtils.escapeHtml(bonus.reason)}</td>
                    <td>${FeatureUtils.escapeHtml(bonus.date)}</td>
                `;
                tbody.appendChild(row);
            });
        }
    };

    // ============================================
    // EMERGENCY CALL-IN MANAGER
    // ============================================
    const EmergencyCallinManager = {
        STORAGE_KEY: 'lifestarEmergencyCallins',

        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) FeatureState.emergencyCallins = FeatureUtils.safeJSON(saved, []);
                this.render();
            } catch (error) {
                Logger.error('[EmergencyCallinManager.load]', error);
            }
        },

        save() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(FeatureState.emergencyCallins));
        },

        create(data) {
            const callin = {
                id: FeatureUtils.generateId(),
                staffId: data.staffId,
                date: data.date,
                time: data.time,
                reason: data.reason,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            FeatureState.emergencyCallins.push(callin);
            this.save();
            this.render();
            return callin;
        },

        render() {
            const tbody = document.getElementById('emergencyCallinsTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';

            FeatureState.emergencyCallins.forEach(callin => {
                const staff = window.users?.find(u => u.id === callin.staffId);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${FeatureUtils.escapeHtml(staff?.fullName || staff?.username || 'Unknown')}</td>
                    <td>${FeatureUtils.escapeHtml(callin.date)}</td>
                    <td>${FeatureUtils.escapeHtml(callin.time)}</td>
                    <td>${FeatureUtils.escapeHtml(callin.reason)}</td>
                    <td><span class="badge badge-${callin.status === 'resolved' ? 'success' : 'warning'}">${callin.status}</span></td>
                `;
                tbody.appendChild(row);
            });
        }
    };

    // ============================================
    // ON-CALL ROTATION MANAGER
    // ============================================
    const OncallRotationManager = {
        STORAGE_KEY: 'lifestarOncallRotations',

        load() {
            try {
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (saved) FeatureState.oncallRotations = FeatureUtils.safeJSON(saved, []);
                this.render();
            } catch (error) {
                Logger.error('[OncallRotationManager.load]', error);
            }
        },

        save() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(FeatureState.oncallRotations));
        },

        create(data) {
            const rotation = {
                id: FeatureUtils.generateId(),
                staffId: data.staffId,
                startDate: data.startDate,
                endDate: data.endDate,
                type: data.type,
                createdAt: new Date().toISOString()
            };
            FeatureState.oncallRotations.push(rotation);
            this.save();
            this.render();
            return rotation;
        },

        render() {
            const tbody = document.getElementById('oncallRotationTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';

            FeatureState.oncallRotations.forEach(rotation => {
                const staff = window.users?.find(u => u.id === rotation.staffId);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${FeatureUtils.escapeHtml(staff?.fullName || staff?.username || 'Unknown')}</td>
                    <td>${FeatureUtils.escapeHtml(rotation.startDate)}</td>
                    <td>${FeatureUtils.escapeHtml(rotation.endDate)}</td>
                    <td>${FeatureUtils.escapeHtml(rotation.type)}</td>
                `;
                tbody.appendChild(row);
            });
        }
    };

    // ============================================
    // ANALYTICS MANAGER
    // ============================================
    const AnalyticsManager = {
        getShiftStats() {
            const stats = {
                totalShifts: 0,
                filledShifts: 0,
                openShifts: 0,
                trades: FeatureState.shiftTrades.length,
                pendingTrades: FeatureState.shiftTrades.filter(t => t.status === 'pending').length
            };

            // Calculate from schedules if available
            if (window.schedules) {
                window.schedules.forEach(schedule => {
                    stats.totalShifts += schedule.shifts?.length || 0;
                    stats.filledShifts += schedule.shifts?.filter(s => s.staffId).length || 0;
                });
                stats.openShifts = stats.totalShifts - stats.filledShifts;
            }

            return stats;
        },

        getTrainingStats() {
            return {
                total: FeatureState.trainingRecords.length,
                completed: FeatureState.trainingRecords.filter(t => t.status === 'completed').length,
                scheduled: FeatureState.trainingRecords.filter(t => t.status === 'scheduled').length
            };
        },

        renderDashboard() {
            const stats = this.getShiftStats();
            const trainingStats = this.getTrainingStats();

            // Update dashboard elements if they exist
            const totalShiftsEl = document.getElementById('statTotalShifts');
            if (totalShiftsEl) totalShiftsEl.textContent = stats.totalShifts;

            const openShiftsEl = document.getElementById('statOpenShifts');
            if (openShiftsEl) openShiftsEl.textContent = stats.openShifts;

            const pendingTradesEl = document.getElementById('statPendingTrades');
            if (pendingTradesEl) pendingTradesEl.textContent = stats.pendingTrades;

            const trainingEl = document.getElementById('statTraining');
            if (trainingEl) trainingEl.textContent = trainingStats.scheduled;
        }
    };

    // ============================================
    // INITIALIZE ALL FEATURES
    // ============================================
    function initializeFeatures() {
        Logger.debug('🔄 Initializing Core Features');

        CrewManager.load();
        ShiftTradeManager.load();
        SwapMarketplace.load();
        TrainingManager.load();
        BonusHoursManager.load();
        EmergencyCallinManager.load();
        OncallRotationManager.load();

        Logger.debug('✅ Core Features initialized');
    }

    // ============================================
    // EXPOSE TO GLOBAL SCOPE
    // ============================================
    window.FeatureState = FeatureState;
    window.CrewManager = CrewManager;
    window.ShiftTradeManager = ShiftTradeManager;
    window.SwapMarketplace = SwapMarketplace;
    window.TrainingManager = TrainingManager;
    window.BonusHoursManager = BonusHoursManager;
    window.EmergencyCallinManager = EmergencyCallinManager;
    window.OncallRotationManager = OncallRotationManager;
    window.AnalyticsManager = AnalyticsManager;
    window.initializeFeatures = initializeFeatures;

    // Backward compatibility aliases (use getters to track reassignment)
    Object.defineProperty(window, 'crewTemplates', { get: () => FeatureState.crewTemplates, configurable: true });
    Object.defineProperty(window, 'shiftTrades', { get: () => FeatureState.shiftTrades, configurable: true });
    Object.defineProperty(window, 'swapListings', { get: () => FeatureState.swapListings, configurable: true });
    Object.defineProperty(window, 'trainingRecords', { get: () => FeatureState.trainingRecords, configurable: true });
    Object.defineProperty(window, 'bonusHours', { get: () => FeatureState.bonusHours, configurable: true });
    Object.defineProperty(window, 'emergencyCallins', { get: () => FeatureState.emergencyCallins, configurable: true });
    Object.defineProperty(window, 'absences', { get: () => FeatureState.absences, configurable: true });
    Object.defineProperty(window, 'oncallRotations', { get: () => FeatureState.oncallRotations, configurable: true });

    // Legacy function aliases
    window.loadCrewTemplates = () => CrewManager.load();
    window.loadShiftTrades = () => ShiftTradeManager.load();
    window.loadSwapListings = () => SwapMarketplace.load();
    window.loadTrainingRecords = () => TrainingManager.load();
    window.loadBonusHours = () => BonusHoursManager.load();
    window.loadEmergencyCallins = () => EmergencyCallinManager.load();
    window.loadOncallRotations = () => OncallRotationManager.load();
    window.initializeBossFeatures = initializeFeatures;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFeatures);
    } else {
        initializeFeatures();
    }

    Logger.debug('✅ Core Features Module loaded');

})();