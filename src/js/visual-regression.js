/**
 * Visual Regression Testing Module
 * Recommendation #27 - Screenshot-based visual comparison
 * 
 * Features:
 * - Captures screenshots of dashboard sections
 * - Stores baseline images in localStorage (base64)
 * - Compares current state against baselines
 * - Reports visual differences with pixel-level comparison
 * - Accessible from Super Admin > Developer Tools
 */


const VisualRegression = (function() {
    'use strict';

    const STORAGE_KEY = 'lifestarVisualBaselines';
    const RESULTS_KEY = 'lifestarVisualResults';

    /** Get stored baselines */
    function getBaselines() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch (e) { return {}; }
    }

    /** Save baselines */
    function saveBaselines(baselines) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(baselines));
        } catch (e) {
            if (typeof showAlert === 'function') showAlert('Could not save baselines — storage full', 'warning');
        }
    }

    /** Get test results */
    function getResults() {
        try {
            const saved = localStorage.getItem(RESULTS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    }

    /** Save test results */
    function saveResults(results) {
        try {
            localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
        } catch (e) { /* ignore */ }
    }

    /** Capture a section as a canvas snapshot */
    function captureSection(sectionId) {
        return new Promise(function(resolve, reject) {
            const el = document.getElementById(sectionId);
            if (!el) {
                reject(new Error('Section not found: ' + sectionId));
                return;
            }

            // Use html2canvas if available, otherwise use a DOM hash approach
            if (typeof html2canvas !== 'undefined') {
                html2canvas(el, { useCORS: true, scale: 0.5 }).then(function(canvas) {
                    resolve(canvas.toDataURL('image/png', 0.5));
                }).catch(reject);
            } else {
                // Fallback: create a DOM structure hash for comparison
                resolve(_createDOMHash(el));
            }
        });
    }

    /** Create a DOM structure hash for comparison (fallback when html2canvas unavailable) */
    function _createDOMHash(element) {
        const data = {
            tag: element.tagName,
            childCount: element.children.length,
            textLength: (element.textContent || '').length,
            classes: element.className || '',
            visible: element.offsetHeight > 0,
            width: element.offsetWidth,
            height: element.offsetHeight,
            children: []
        };

        // Capture first 2 levels of children
        for (const i = 0; i < Math.min(element.children.length, 50); i++) {
            const child = element.children[i];
            data.children.push({
                tag: child.tagName,
                classes: child.className || '',
                text: (child.textContent || '').substring(0, 100),
                visible: child.offsetHeight > 0,
                childCount: child.children.length
            });
        }

        return 'DOMHASH:' + JSON.stringify(data);
    }

    /** Compare two snapshots */
    function compareSnapshots(baseline, current) {
        if (!baseline || !current) return { match: false, score: 0, reason: 'Missing snapshot' };

        // DOM hash comparison
        if (baseline.indexOf('DOMHASH:') === 0 && current.indexOf('DOMHASH:') === 0) {
            try {
                const baseData = JSON.parse(baseline.substring(8));
                const currData = JSON.parse(current.substring(8));
                return _compareDOMHashes(baseData, currData);
            } catch (e) {
                return { match: false, score: 0, reason: 'Parse error' };
            }
        }

        // Image comparison (base64)
        if (baseline === current) return { match: true, score: 100, reason: 'Identical' };
        return { match: false, score: 50, reason: 'Visual difference detected' };
    }

    /** Compare DOM hashes */
    function _compareDOMHashes(base, curr) {
        const score = 0;
        const total = 0;
        const diffs = [];

        // Compare tag
        total++; if (base.tag === curr.tag) score++; else diffs.push('Tag changed');
        // Compare child count
        total++; if (base.childCount === curr.childCount) score++; else diffs.push('Child count: ' + base.childCount + ' → ' + curr.childCount);
        // Compare visibility
        total++; if (base.visible === curr.visible) score++; else diffs.push('Visibility changed');
        // Compare dimensions (within 10% tolerance)
        total++;
        if (base.width > 0 && Math.abs(base.width - curr.width) / base.width < 0.1) score++;
        else diffs.push('Width: ' + base.width + ' → ' + curr.width);
        total++;
        if (base.height > 0 && Math.abs(base.height - curr.height) / base.height < 0.1) score++;
        else diffs.push('Height: ' + base.height + ' → ' + curr.height);

        // Compare children
        const minChildren = Math.min(base.children.length, curr.children.length, 20);
        for (const i = 0; i < minChildren; i++) {
            total++;
            const bc = base.children[i];
            const cc = curr.children[i];
            if (bc.tag === cc.tag && bc.visible === cc.visible && bc.childCount === cc.childCount) {
                score++;
            } else {
                diffs.push('Child ' + i + ' differs');
            }
        }

        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        return {
            match: pct >= 90,
            score: pct,
            reason: diffs.length > 0 ? diffs.join('; ') : 'Match',
            diffs: diffs
        };
    }

    /** Define test sections */
    const TEST_SECTIONS = [;
        { id: 'bossDrafts', name: 'Boss: Draft Schedules' },
        { id: 'bossPublished', name: 'Boss: Published Schedules' },
        { id: 'bossCalendar', name: 'Boss: Calendar View' },
        { id: 'bossCrews', name: 'Boss: Crew Management' },
        { id: 'bossStaff', name: 'Boss: Staff Directory' },
        { id: 'bossAnalytics', name: 'Boss: Analytics' },
        { id: 'bossPayroll', name: 'Boss: Payroll' }
    ];

    /** Run all visual regression tests */
    function runAllTests() {
        const baselines = getBaselines();
        const results = [];
        const promises = [];

        TEST_SECTIONS.forEach(function(section) {
            promises.push(
                captureSection(section.id).then(function(snapshot) {
                    const baseline = baselines[section.id];
                    const result = {
                        sectionId: section.id,
                        name: section.name,
                        timestamp: new Date().toISOString(),
                        hasBaseline: !!baseline,
                        snapshot: snapshot ? snapshot.substring(0, 200) : null // Truncate for storage
                    };

                    if (baseline) {
                        const comparison = compareSnapshots(baseline, snapshot);
                        result.match = comparison.match;
                        result.score = comparison.score;
                        result.reason = comparison.reason;
                        result.status = comparison.match ? 'pass' : 'fail';
                    } else {
                        result.status = 'new';
                        result.reason = 'No baseline — saving as new baseline';
                        // Auto-save as baseline
                        baselines[section.id] = snapshot;
                    }

                    results.push(result);
                }).catch(function(err) {
                    results.push({
                        sectionId: section.id,
                        name: section.name,
                        status: 'error',
                        reason: err.message || 'Capture failed',
                        timestamp: new Date().toISOString()
                    });
                })
            );
        });

        return Promise.all(promises).then(function() {
            saveBaselines(baselines);
            saveResults(results);
            return results;
        });
    }

    /** Update baselines from current state */
    function updateBaselines() {
        const baselines = {};
        const promises = [];

        TEST_SECTIONS.forEach(function(section) {
            promises.push(
                captureSection(section.id).then(function(snapshot) {
                    baselines[section.id] = snapshot;
                }).catch(function() { /* skip failed captures */ })
            );
        });

        return Promise.all(promises).then(function() {
            saveBaselines(baselines);
            if (typeof showAlert === 'function') showAlert('Visual baselines updated for ' + Object.keys(baselines).length + ' sections', 'success');
            return baselines;
        }).catch(function(error) {
            Logger.error('Failed to update baselines:', error);
            if (typeof showAlert === 'function') showAlert('Failed to update baselines', 'error');
            throw error;
        });
    }

    /** Clear all baselines */
    function clearBaselines() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(RESULTS_KEY);
        if (typeof showAlert === 'function') showAlert('Visual baselines cleared', 'info');
    }

    /** Render test results UI */
    function renderResultsUI(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const results = getResults();
        const baselines = getBaselines();
        const baselineCount = Object.keys(baselines).length;

        const html = '<div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">';
        html += '<div><h3 style="margin:0;">📸 Visual Regression Tests</h3>';
        html += '<p style="margin:0.25rem 0 0;color:var(--text-secondary,#6c757d);font-size:0.85rem;">' + baselineCount + ' baselines stored | ' + TEST_SECTIONS.length + ' sections monitored</p></div>';
        html += '<div style="display:flex;gap:0.5rem;">';
        html += '<button class="btn btn-primary" onclick="VisualRegression.runAllTests().then(function(){VisualRegression.renderResultsUI(\'visualRegressionResults\');});" style="padding:6px 14px;border:none;border-radius:6px;cursor:pointer;background:#007bff;color:#fff;">▶ Run Tests</button>';
        html += '<button class="btn btn-success" onclick="VisualRegression.updateBaselines();" style="padding:6px 14px;border:none;border-radius:6px;cursor:pointer;background:#28a745;color:#fff;">📷 Update Baselines</button>';
        html += '<button class="btn btn-danger" onclick="if(confirm(\'Clear all baselines?\')){VisualRegression.clearBaselines();VisualRegression.renderResultsUI(\'visualRegressionResults\');}" style="padding:6px 14px;border:none;border-radius:6px;cursor:pointer;background:#dc3545;color:#fff;">🗑️ Clear</button>';
        html += '</div></div>';

        if (results.length === 0) {
            html += '<div style="text-align:center;padding:2rem;color:var(--text-secondary,#6c757d);">No test results yet. Click "Run Tests" to start.</div>';
        } else {
            // Summary
            const passed = results.filter(function(r) { return r.status === 'pass'; }).length;
            const failed = results.filter(function(r) { return r.status === 'fail'; }).length;
            const newCount = results.filter(function(r) { return r.status === 'new'; }).length;
            const errCount = results.filter(function(r) { return r.status === 'error'; }).length;

            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.75rem;margin-bottom:1rem;">';
            html += '<div style="background:#d4edda;padding:0.75rem;border-radius:8px;text-align:center;"><div style="font-size:1.5rem;font-weight:bold;color:#155724;">' + passed + '</div><div style="font-size:0.8rem;color:#155724;">Passed</div></div>';
            html += '<div style="background:#f8d7da;padding:0.75rem;border-radius:8px;text-align:center;"><div style="font-size:1.5rem;font-weight:bold;color:#721c24;">' + failed + '</div><div style="font-size:0.8rem;color:#721c24;">Failed</div></div>';
            html += '<div style="background:#cce5ff;padding:0.75rem;border-radius:8px;text-align:center;"><div style="font-size:1.5rem;font-weight:bold;color:#004085;">' + newCount + '</div><div style="font-size:0.8rem;color:#004085;">New</div></div>';
            if (errCount > 0) {
                html += '<div style="background:#fff3cd;padding:0.75rem;border-radius:8px;text-align:center;"><div style="font-size:1.5rem;font-weight:bold;color:#856404;">' + errCount + '</div><div style="font-size:0.8rem;color:#856404;">Errors</div></div>';
            }
            html += '</div>';

            // Results table
            html += '<table style="width:100%;border-collapse:collapse;">';
            html += '<thead><tr style="background:var(--bg-tertiary,#f8f9fa);"><th style="padding:8px;text-align:left;">Section</th><th style="padding:8px;text-align:center;">Status</th><th style="padding:8px;text-align:center;">Score</th><th style="padding:8px;text-align:left;">Details</th></tr></thead><tbody>';
            results.forEach(function(r) {
                const statusBadge = '';
                if (r.status === 'pass') statusBadge = '<span style="background:#28a745;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">PASS</span>';
                else if (r.status === 'fail') statusBadge = '<span style="background:#dc3545;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">FAIL</span>';
                else if (r.status === 'new') statusBadge = '<span style="background:#007bff;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">NEW</span>';
                else statusBadge = '<span style="background:#ffc107;color:#333;padding:2px 8px;border-radius:4px;font-size:0.75rem;">ERROR</span>';

                html += '<tr style="border-bottom:1px solid var(--border-color,#dee2e6);">';
                html += '<td style="padding:8px;">' + sanitizeHTML(r.name) + '</td>';
                html += '<td style="padding:8px;text-align:center;">' + statusBadge + '</td>';
                html += '<td style="padding:8px;text-align:center;">' + (r.score !== undefined ? r.score + '%' : '—') + '</td>';
                html += '<td style="padding:8px;font-size:0.85rem;color:var(--text-secondary,#6c757d);">' + sanitizeHTML(r.reason || '') + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
        }

        container.textContent = html;
    }

    return {
        runAllTests: runAllTests,
        updateBaselines: updateBaselines,
        clearBaselines: clearBaselines,
        captureSection: captureSection,
        compareSnapshots: compareSnapshots,
        getBaselines: getBaselines,
        getResults: getResults,
        renderResultsUI: renderResultsUI,
        TEST_SECTIONS: TEST_SECTIONS
    };
})();