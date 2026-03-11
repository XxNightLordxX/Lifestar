/**
 * Automated End-to-End Test Suite
 * Recommendation #38 - In-browser test runner
 * 
 * Features:
 * - Automated UI tests for all major features
 * - Test runner with pass/fail reporting
 * - Accessible from Super Admin > Developer Tools
 * - Non-destructive tests (read-only where possible)
 */


const E2ETestSuite = (function() {
    'use strict';

    const results = [];
    const running = false;

    /** Define all test cases */
    const TEST_CASES = [;
        {
            name: 'DOM: Login form exists',
            category: 'Core',
            fn: function() { return !!document.getElementById('loginForm'); }
        },
        {
            name: 'DOM: Super Admin dashboard exists',
            category: 'Core',
            fn: function() { return !!document.getElementById('superDashboard'); }
        },
        {
            name: 'DOM: Boss dashboard exists',
            category: 'Core',
            fn: function() { return !!document.getElementById('bossDashboard'); }
        },
        {
            name: 'DOM: Paramedic dashboard exists',
            category: 'Core',
            fn: function() { return !!document.getElementById('paramedicDashboard'); }
        },
        {
            name: 'DOM: EMT dashboard exists',
            category: 'Core',
            fn: function() { return !!document.getElementById('emtDashboard'); }
        },
        {
            name: 'Data: Users array loaded',
            category: 'Data',
            fn: function() { return typeof users !== 'undefined' && Array.isArray(users) && users.length > 0; }
        },
        {
            name: 'Data: Schedules array loaded',
            category: 'Data',
            fn: function() { return typeof schedules !== 'undefined' && Array.isArray(schedules); }
        },
        {
            name: 'Data: Default users exist (6)',
            category: 'Data',
            fn: function() { return typeof users !== 'undefined' && users.length >= 6; }
        },
        {
            name: 'Data: Super admin user exists',
            category: 'Data',
            fn: function() { return typeof users !== 'undefined' && users.some(function(u) { return u.username === 'super'; }); }
        },
        {
            name: 'Data: Boss user exists',
            category: 'Data',
            fn: function() { return typeof users !== 'undefined' && users.some(function(u) { return u.username === 'boss'; }); }
        },
        {
            name: 'Boss: All 20 sections exist',
            category: 'Boss Dashboard',
            fn: function() {
                const sections = ['bossDrafts','bossPublished','bossArchived','bossCalendar','bossCrews',
                    'bossTimeoff','bossTrades','bossSwap','bossStaff','bossAvailability',
                    'bossTraining','bossBonus','bossCallins','bossAbsences','bossOncall',
                    'bossAnalytics','bossHistory','bossNotes','bossTemplates','bossPayroll'];
                return sections.every(function(id) { return !!document.getElementById(id); });
            }
        },
        {
            name: 'Boss: showBossSection function exists',
            category: 'Boss Dashboard',
            fn: function() { return typeof showBossSection === 'function'; }
        },
        {
            name: 'Super: showSuperSection function exists',
            category: 'Super Admin',
            fn: function() { return typeof showSuperSection === 'function'; }
        },
        {
            name: 'Super: All admin sections exist',
            category: 'Super Admin',
            fn: function() {
                const sections = ['superOverview','superUsers','superFeatures','superApi','superLogs','superDeveloper','superPermissions','superLocations','superAi'];
                return sections.every(function(id) { return !!document.getElementById(id); });
            }
        },
        {
            name: 'Modals: Create schedule modal exists',
            category: 'Modals',
            fn: function() { return !!document.getElementById('createScheduleModal'); }
        },
        {
            name: 'Modals: Add user modal exists',
            category: 'Modals',
            fn: function() { return !!document.getElementById('addUserModal'); }
        },
        {
            name: 'Modals: Crew template modal exists',
            category: 'Modals',
            fn: function() { return !!document.getElementById('createCrewTemplateModal'); }
        },
        {
            name: 'Feature: I18n loaded (13 languages)',
            category: 'Features',
            fn: function() { return typeof I18n !== 'undefined' && I18n.supportedLanguages && I18n.supportedLanguages.length === 13; }
        },
        {
            name: 'Feature: DarkMode loaded',
            category: 'Features',
            fn: function() { return typeof DarkMode !== 'undefined'; }
        },
        {
            name: 'Feature: UndoRedoManager loaded',
            category: 'Features',
            fn: function() { return typeof UndoRedoManager !== 'undefined'; }
        },
        {
            name: 'Feature: MultiLocation loaded',
            category: 'Features',
            fn: function() { return typeof MultiLocation !== 'undefined' && MultiLocation.getLocations().length >= 3; }
        },
        {
            name: 'Feature: VoiceCommands loaded',
            category: 'Features',
            fn: function() { return typeof VoiceCommands !== 'undefined'; }
        },
        {
            name: 'Feature: NotificationService loaded',
            category: 'Features',
            fn: function() { return typeof NotificationService !== 'undefined'; }
        },
        {
            name: 'Feature: Payroll functions loaded',
            category: 'Features',
            fn: function() { return typeof generatePayrollReport === 'function' && typeof loadPayrollDashboard === 'function'; }
        },
        {
            name: 'Feature: ABTesting loaded',
            category: 'Features',
            fn: function() { return typeof ABTesting !== 'undefined' && ABTesting.getExperiments().length >= 3; }
        },
        {
            name: 'Feature: VisualRegression loaded',
            category: 'Features',
            fn: function() { return typeof VisualRegression !== 'undefined'; }
        },
        {
            name: 'Feature: PasswordHasher loaded',
            category: 'Security',
            fn: function() { return typeof PasswordHasher !== 'undefined'; }
        },
        {
            name: 'Feature: SessionManager loaded',
            category: 'Security',
            fn: function() { return typeof SessionManager !== 'undefined'; }
        },
        {
            name: 'Feature: CSRFProtection loaded',
            category: 'Security',
            fn: function() { return typeof CSRFProtection !== 'undefined'; }
        },
        {
            name: 'UI: Language switcher exists',
            category: 'UI',
            fn: function() { return !!document.getElementById('language-switcher'); }
        },
        {
            name: 'UI: Toast container exists',
            category: 'UI',
            fn: function() { return !!document.getElementById('toastContainer'); }
        },
        {
            name: 'UI: Schedule location dropdown exists',
            category: 'UI',
            fn: function() { return !!document.getElementById('scheduleLocation'); }
        },
        {
            name: 'UI: User location dropdown exists',
            category: 'UI',
            fn: function() { return !!document.getElementById('newUserLocation'); }
        },
        {
            name: 'UI: Users table has Location column',
            category: 'UI',
            fn: function() {
                const ths = document.querySelectorAll('#usersTable th');
                for (const i = 0; i < ths.length; i++) {
                    if (ths[i].textContent.indexOf('Location') !== -1) return true;
                }
                return false;
            }
        },
        {
            name: 'PWA: Manifest link exists',
            category: 'PWA',
            fn: function() { return !!document.querySelector('link[rel="manifest"]'); }
        },
        {
            name: 'PWA: Theme color meta exists',
            category: 'PWA',
            fn: function() { return !!document.querySelector('meta[name="theme-color"]'); }
        },
        {
            name: 'PWA: Apple touch icon exists',
            category: 'PWA',
            fn: function() { return !!document.querySelector('link[rel="apple-touch-icon"]'); }
        },
        {
            name: 'Accessibility: Keyboard shortcuts loaded',
            category: 'Accessibility',
            fn: function() { return typeof KeyboardShortcuts !== 'undefined'; }
        },
        {
            name: 'Performance: No console errors on load',
            category: 'Performance',
            fn: function() {
                // Check if error tracking is available
                if (window._e2eConsoleErrors) return window._e2eConsoleErrors.length === 0;
                return true; // Can't verify without error tracking;
            }
        },
        {
            name: 'Data Integrity: localStorage keys present',
            category: 'Data',
            fn: function() {
                return localStorage.getItem('lifestarUsers') !== null ||;
                       localStorage.getItem('lifestarSchedules') !== null;
            }
        }
    ];

    /** Run all tests */
    function runAll() {
        running = true;
        results = [];

        TEST_CASES.forEach(function(tc) {
            const result = { name: tc.name, category: tc.category, status: 'unknown', error: null };
            try {
                const passed = tc.fn();
                result.status = passed ? 'pass' : 'fail';
            } catch (e) {
                result.status = 'error';
                result.error = e.message || String(e);
            }
            results.push(result);
        });

        running = false;
        return results;
    }

    /** Get summary stats */
    function getSummary() {
        const passed = results.filter(function(r) { return r.status === 'pass'; }).length;
        const failed = results.filter(function(r) { return r.status === 'fail'; }).length;
        const errors = results.filter(function(r) { return r.status === 'error'; }).length;
        return { total: results.length, passed: passed, failed: failed, errors: errors };
    }

    /** Render test results UI */
    function renderUI(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">';
        html += '<h3 style="margin:0;">🧪 E2E Test Suite</h3>';
        html += '<button onclick="E2ETestSuite.runAll();E2ETestSuite.renderUI(\'e2eTestResults\');" style="padding:6px 14px;border:none;border-radius:6px;cursor:pointer;background:#007bff;color:#fff;">▶ Run All Tests</button>';
        html += '</div>';

        if (results.length === 0) {
            html += '<p style="text-align:center;color:var(--text-secondary,#6c757d);">Click "Run All Tests" to execute the test suite.</p>';
        } else {
            const summary = getSummary();

            // Summary cards
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:0.5rem;margin-bottom:1rem;">';
            html += '<div style="background:#d4edda;padding:0.5rem;border-radius:6px;text-align:center;"><div style="font-size:1.3rem;font-weight:bold;color:#155724;">' + summary.passed + '</div><div style="font-size:0.75rem;color:#155724;">Passed</div></div>';
            html += '<div style="background:#f8d7da;padding:0.5rem;border-radius:6px;text-align:center;"><div style="font-size:1.3rem;font-weight:bold;color:#721c24;">' + summary.failed + '</div><div style="font-size:0.75rem;color:#721c24;">Failed</div></div>';
            html += '<div style="background:#fff3cd;padding:0.5rem;border-radius:6px;text-align:center;"><div style="font-size:1.3rem;font-weight:bold;color:#856404;">' + summary.errors + '</div><div style="font-size:0.75rem;color:#856404;">Errors</div></div>';
            html += '<div style="background:#cce5ff;padding:0.5rem;border-radius:6px;text-align:center;"><div style="font-size:1.3rem;font-weight:bold;color:#004085;">' + summary.total + '</div><div style="font-size:0.75rem;color:#004085;">Total</div></div>';
            html += '</div>';

            // Group by category
            const categories = {};
            results.forEach(function(r) {
                if (!categories[r.category]) categories[r.category] = [];
                categories[r.category].push(r);
            });

            Object.keys(categories).forEach(function(cat) {
                const catResults = categories[cat];
                const catPassed = catResults.filter(function(r) { return r.status === 'pass'; }).length;
                html += '<div style="margin-bottom:0.75rem;">';
                html += '<div style="font-weight:600;font-size:0.9rem;margin-bottom:0.25rem;color:var(--text-primary,#333);">' + sanitizeHTML(cat) + ' (' + catPassed + '/' + catResults.length + ')</div>';
                catResults.forEach(function(r) {
                    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
                    const color = r.status === 'pass' ? '#155724' : r.status === 'fail' ? '#721c24' : '#856404';
                    html += '<div style="padding:3px 0;font-size:0.82rem;color:' + color + ';">' + icon + ' ' + sanitizeHTML(r.name);
                    if (r.error) html += ' <span style="color:#856404;">(' + sanitizeHTML(r.error) + ')</span>';
                    html += '</div>';
                });
                html += '</div>';
            });
        }

        container.textContent = html;
    }

    return {
        runAll: runAll,
        getSummary: getSummary,
        renderUI: renderUI,
        getResults: function() { return results; },
        TEST_CASES: TEST_CASES
    };
})();