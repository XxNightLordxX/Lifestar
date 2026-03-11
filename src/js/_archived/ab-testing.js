/**
 * A/B Testing Framework
 * Recommendation #34 - Client-side experiment management
 * 
 * Features:
 * - Define experiments with variants
 * - Assign users to variants consistently (hash-based)
 * - Track impressions and conversions
 * - View experiment results in Super Admin
 */


const ABTesting = (function() {
    'use strict';

    const STORAGE_KEY = 'lifestarABExperiments';
    const ASSIGNMENTS_KEY = 'lifestarABAssignments';
    const EVENTS_KEY = 'lifestarABEvents';

    // Predefined experiments
    const DEFAULT_EXPERIMENTS = [
        {
            id: 'sidebar_layout',
            name: 'Sidebar Navigation Layout',
            description: 'Test compact vs expanded sidebar navigation',
            variants: [
                { id: 'control', name: 'Default Layout', weight: 50 },
                { id: 'compact', name: 'Compact Layout', weight: 50 }
            ],
            active: false,
            createdAt: new Date().toISOString()
        },
        {
            id: 'schedule_card_style',
            name: 'Schedule Card Design',
            description: 'Test different schedule card visual styles',
            variants: [
                { id: 'control', name: 'Current Design', weight: 50 },
                { id: 'modern', name: 'Modern Cards', weight: 50 }
            ],
            active: false,
            createdAt: new Date().toISOString()
        },
        {
            id: 'dashboard_stats',
            name: 'Dashboard Stats Position',
            description: 'Test stats at top vs inline with content',
            variants: [
                { id: 'top', name: 'Stats at Top', weight: 50 },
                { id: 'inline', name: 'Inline Stats', weight: 50 }
            ],
            active: false,
            createdAt: new Date().toISOString()
        }
    ];

    /** Get experiments */
    function getExperiments() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_EXPERIMENTS));
            return DEFAULT_EXPERIMENTS.slice();
        } catch (e) { return DEFAULT_EXPERIMENTS.slice(); }
    }

    /** Save experiments */
    function saveExperiments(experiments) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(experiments));
    }

    /** Get user assignments */
    function getAssignments() {
        try {
            const saved = localStorage.getItem(ASSIGNMENTS_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch (e) { return {}; }
    }

    /** Save assignments */
    function saveAssignments(assignments) {
        localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
    }

    /** Get events */
    function getEvents() {
        try {
            const saved = localStorage.getItem(EVENTS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    }

    /** Save events */
    function saveEvents(events) {
        // Keep last 500 events
        if (events.length > 500) events = events.slice(-500);
        localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    }

    /** Simple hash function for consistent assignment */
    function simpleHash(str) {
        const hash = 0;
        for (const i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer;
        }
        return Math.abs(hash);
    }

    /** Assign a user to a variant */
    function getVariant(experimentId, userId) {
        const experiments = getExperiments();
        const experiment = null;
        for (const i = 0; i < experiments.length; i++) {
            if (experiments[i].id === experimentId) { experiment = experiments[i]; break; }
        }
        if (!experiment || !experiment.active) return null;

        // Check existing assignment
        const assignments = getAssignments();
        const key = experimentId + ':' + (userId || 'anonymous');
        if (assignments[key]) return assignments[key];

        // Assign based on hash
        const hash = simpleHash(key);
        const totalWeight = 0;
        for (const j = 0; j < experiment.variants.length; j++) {
            totalWeight += experiment.variants[j].weight;
        }
        const bucket = hash % totalWeight;
        const cumulative = 0;
        const assignedVariant = experiment.variants[0].id;

        for (const k = 0; k < experiment.variants.length; k++) {
            cumulative += experiment.variants[k].weight;
            if (bucket < cumulative) {
                assignedVariant = experiment.variants[k].id;
                break;
            }
        }

        // Save assignment
        assignments[key] = assignedVariant;
        saveAssignments(assignments);

        // Track impression
        trackEvent(experimentId, assignedVariant, 'impression');

        return assignedVariant;
    }

    /** Track an event */
    function trackEvent(experimentId, variantId, eventType, metadata) {
        const events = getEvents();
        events.push({
            experimentId: experimentId,
            variantId: variantId,
            eventType: eventType || 'impression',
            metadata: metadata || null,
            timestamp: new Date().toISOString()
        });
        saveEvents(events);
    }

    /** Track a conversion */
    function trackConversion(experimentId, userId, metadata) {
        const assignments = getAssignments();
        const key = experimentId + ':' + (userId || 'anonymous');
        const variant = assignments[key];
        if (variant) {
            trackEvent(experimentId, variant, 'conversion', metadata);
        }
    }

    /** Create a new experiment */
    function createExperiment(data) {
        const experiments = getExperiments();
        const newExp = {
            id: data.id || 'exp_' + Date.now(),
            name: data.name || 'Untitled Experiment',
            description: data.description || '',
            variants: data.variants || [
                { id: 'control', name: 'Control', weight: 50 },
                { id: 'variant_a', name: 'Variant A', weight: 50 }
            ],
            active: false,
            createdAt: new Date().toISOString()
        };

        // Check for duplicate ID
        for (const i = 0; i < experiments.length; i++) {
            if (experiments[i].id === newExp.id) {
                if (typeof showAlert === 'function') showAlert('Experiment ID already exists', 'warning');
                return null;
            }
        }

        experiments.push(newExp);
        saveExperiments(experiments);
        return newExp;
    }

    /** Toggle experiment active state */
    function toggleExperiment(experimentId) {
        const experiments = getExperiments();
        for (const i = 0; i < experiments.length; i++) {
            if (experiments[i].id === experimentId) {
                experiments[i].active = !experiments[i].active;
                saveExperiments(experiments);
                return experiments[i].active;
            }
        }
        return false;
    }

    /** Delete an experiment */
    function deleteExperiment(experimentId) {
        const experiments = getExperiments();
        experiments = experiments.filter(function(e) { return e.id !== experimentId; });
        saveExperiments(experiments);
    }

    /** Get experiment statistics */
    function getExperimentStats(experimentId) {
        const events = getEvents();
        const expEvents = events.filter(function(e) { return e.experimentId === experimentId; });

        const stats = {};
        expEvents.forEach(function(e) {
            if (!stats[e.variantId]) {
                stats[e.variantId] = { impressions: 0, conversions: 0 };
            }
            if (e.eventType === 'impression') stats[e.variantId].impressions++;
            if (e.eventType === 'conversion') stats[e.variantId].conversions++;
        });

        // Calculate conversion rates
        Object.keys(stats).forEach(function(v) {
            stats[v].conversionRate = stats[v].impressions > 0
                ? Math.round((stats[v].conversions / stats[v].impressions) * 10000) / 100
                : 0;
        });

        return stats;
    }

    /** Render A/B Testing UI */
    function renderUI(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const experiments = getExperiments();

        const html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">';
        html += '<h3 style="margin:0;">🧪 A/B Testing Framework</h3>';
        html += '<button onclick="ABTesting.showCreateModal()" style="padding:6px 14px;border:none;border-radius:6px;cursor:pointer;background:#007bff;color:#fff;">+ New Experiment</button>';
        html += '</div>';

        if (experiments.length === 0) {
            html += '<p style="text-align:center;color:var(--text-secondary,#6c757d);">No experiments defined.</p>';
        } else {
            experiments.forEach(function(exp) {
                const stats = getExperimentStats(exp.id);
                const statusColor = exp.active ? '#28a745' : '#6c757d';
                const statusText = exp.active ? 'Active' : 'Inactive';

                html += '<div style="background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#dee2e6);border-radius:10px;padding:1rem;margin-bottom:1rem;">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">';
                html += '<div><strong>' + sanitizeHTML(exp.name) + '</strong>';
                html += '<span style="background:' + statusColor + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:8px;">' + statusText + '</span></div>';
                html += '<div style="display:flex;gap:0.5rem;">';
                html += '<button onclick="ABTesting.toggleExperiment(\'' + exp.id + '\');ABTesting.renderUI(\'abTestingResults\');" style="padding:4px 10px;border:1px solid var(--border-color,#ccc);border-radius:4px;cursor:pointer;background:var(--bg-tertiary,#f8f9fa);font-size:0.8rem;">' + (exp.active ? '⏸ Pause' : '▶ Start') + '</button>';
                html += '<button onclick="if(confirm(\'Delete this experiment?\')){ABTesting.deleteExperiment(\'' + exp.id + '\');ABTesting.renderUI(\'abTestingResults\');}" style="padding:4px 10px;border:1px solid #dc3545;border-radius:4px;cursor:pointer;background:#fff;color:#dc3545;font-size:0.8rem;">🗑️</button>';
                html += '</div></div>';
                html += '<p style="margin:0.25rem 0;font-size:0.85rem;color:var(--text-secondary,#6c757d);">' + sanitizeHTML(exp.description) + '</p>';

                // Variants with stats
                html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.5rem;margin-top:0.75rem;">';
                exp.variants.forEach(function(v) {
                    const vStats = stats[v.id] || { impressions: 0, conversions: 0, conversionRate: 0 };
                    html += '<div style="background:var(--bg-tertiary,#f8f9fa);padding:0.5rem;border-radius:6px;text-align:center;">';
                    html += '<div style="font-weight:600;font-size:0.85rem;">' + sanitizeHTML(v.name) + '</div>';
                    html += '<div style="font-size:0.75rem;color:var(--text-secondary,#6c757d);">Weight: ' + v.weight + '%</div>';
                    html += '<div style="font-size:0.75rem;margin-top:4px;">👁 ' + vStats.impressions + ' | ✅ ' + vStats.conversions + ' | ' + vStats.conversionRate + '%</div>';
                    html += '</div>';
                });
                html += '</div></div>';
            });
        }

        container.textContent = html;
    }

    /** Show create experiment modal */
    function showCreateModal() {
        const existing = document.getElementById('abCreateModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'abCreateModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = '<div style="background:var(--bg-secondary,#fff);color:var(--text-primary,#333);border-radius:12px;padding:1.5rem;max-width:450px;width:90%;">' +
            '<h3 style="margin:0 0 1rem;">New Experiment</h3>' +
            '<div style="margin-bottom:0.75rem;"><label style="display:block;font-size:0.85rem;margin-bottom:4px;">Name</label><input id="abExpName" type="text" style="width:100%;padding:6px 10px;border:1px solid var(--border-color,#ccc);border-radius:6px;box-sizing:border-box;" placeholder="e.g. Button Color Test"></div>' +
            '<div style="margin-bottom:0.75rem;"><label style="display:block;font-size:0.85rem;margin-bottom:4px;">Description</label><input id="abExpDesc" type="text" style="width:100%;padding:6px 10px;border:1px solid var(--border-color,#ccc);border-radius:6px;box-sizing:border-box;" placeholder="What are you testing?"></div>' +
            '<div style="margin-bottom:0.75rem;"><label style="display:block;font-size:0.85rem;margin-bottom:4px;">Variant A Name</label><input id="abVarA" type="text" value="Control" style="width:100%;padding:6px 10px;border:1px solid var(--border-color,#ccc);border-radius:6px;box-sizing:border-box;"></div>' +
            '<div style="margin-bottom:1rem;"><label style="display:block;font-size:0.85rem;margin-bottom:4px;">Variant B Name</label><input id="abVarB" type="text" value="Variant B" style="width:100%;padding:6px 10px;border:1px solid var(--border-color,#ccc);border-radius:6px;box-sizing:border-box;"></div>' +
            '<div style="display:flex;gap:0.5rem;justify-content:flex-end;">' +
            '<button onclick="document.getElementById(\'abCreateModal\').remove();" style="padding:6px 14px;border:1px solid var(--border-color,#ccc);border-radius:6px;cursor:pointer;background:var(--bg-tertiary,#f8f9fa);">Cancel</button>' +
            '<button onclick="ABTesting.handleCreate();" style="padding:6px 14px;border:none;border-radius:6px;cursor:pointer;background:#007bff;color:#fff;">Create</button>' +
            '</div></div>';
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    /** Handle create experiment form */
    function handleCreate() {
        const name = (document.getElementById('abExpName') || {}).value || '';
        const desc = (document.getElementById('abExpDesc') || {}).value || '';
        const varA = (document.getElementById('abVarA') || {}).value || 'Control';
        const varB = (document.getElementById('abVarB') || {}).value || 'Variant B';

        if (!name.trim()) {
            if (typeof showAlert === 'function') showAlert('Experiment name is required', 'warning');
            return;
        }

        createExperiment({
            name: name.trim(),
            description: desc.trim(),
            variants: [
                { id: 'control', name: varA.trim(), weight: 50 },
                { id: 'variant_b', name: varB.trim(), weight: 50 }
            ]
        });

        const modal = document.getElementById('abCreateModal');
        if (modal) modal.remove();
        if (typeof showAlert === 'function') showAlert('Experiment created', 'success');
        renderUI('abTestingResults');
    }

    return {
        getExperiments: getExperiments,
        getVariant: getVariant,
        trackEvent: trackEvent,
        trackConversion: trackConversion,
        createExperiment: createExperiment,
        toggleExperiment: toggleExperiment,
        deleteExperiment: deleteExperiment,
        getExperimentStats: getExperimentStats,
        renderUI: renderUI,
        showCreateModal: showCreateModal,
        handleCreate: handleCreate
    };
})();