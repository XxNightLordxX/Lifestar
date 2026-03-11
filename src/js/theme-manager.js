/**
 * Theme Manager Module
 *
 * Handles light/dark mode switching for the Lifestar application.
 *
 * The implementation is CSS-variable-based: the light mode values already live
 * in :root in styles.bundle.min.css, so dark mode just overrides those
 * variables on a data-theme="dark" attribute on <html>. No element-level
 * style changes are needed, which means the theme switch is instant and
 * doesn't require any re-rendering of existing components.
 *
 * User preference is persisted to localStorage under 'lifestarTheme' and
 * also respects the system prefers-color-scheme media query on first visit.
 *
 * @module theme-manager
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'lifestarTheme';
    const THEMES = { LIGHT: 'light', DARK: 'dark' };

    // ============================================
    // CSS INJECTION
    // ============================================
    // Dark-mode variable overrides injected once into <head>. All colors
    // reference the same CSS custom properties used by the existing stylesheet,
    // so every component (login page, dashboards, modals, tables) inherits the
    // dark theme automatically.

    function injectDarkModeCSS() {
        if (document.getElementById('lifestar-dark-mode-styles')) return;

        const style = document.createElement('style');
        style.id = 'lifestar-dark-mode-styles';
        style.textContent = `
            /* =====================================================
               DARK MODE — overrides :root variables when
               <html data-theme="dark"> is set.
               ===================================================== */
            [data-theme="dark"] {
                /* Surfaces */
                --lifestar-gray:    #1a1a2e;
                --bg-primary:       #16213e;
                --bg-secondary:     #0f3460;
                --bg-card:          #1e2a45;
                --bg-input:         #243352;

                /* Text */
                --dark-text:        #e8eaf6;
                --light-text:       #a0aec0;
                --muted-text:       #718096;

                /* Borders */
                --border-color:     #2d3748;

                /* Brand (kept vivid against dark bg) */
                --lifestar-blue:        #4a90d9;
                --lifestar-light-blue:  #63b3ed;
                --lifestar-red:         #fc5c65;
                --primary-color:        #4a90d9;
                --secondary-color:      #63b3ed;
                --accent-color:         #fc5c65;

                /* Status (slightly desaturated for dark bg) */
                --success-color: #48bb78;
                --warning-color: #f6ad55;
                --danger-color:  #fc5c65;
                --info-color:    #4dc0d9;

                /* Role colours */
                --role-super:     #9f7aea;
                --role-boss:      #4a90d9;
                --role-paramedic: #fc5c65;
                --role-emt:       #63b3ed;
            }

            /* Body background and text */
            [data-theme="dark"] body {
                background-color: var(--lifestar-gray, #1a1a2e);
                color: var(--dark-text, #e8eaf6);
            }

            /* Cards / panels */
            [data-theme="dark"] .dashboard,
            [data-theme="dark"] .card,
            [data-theme="dark"] .schedule-item,
            [data-theme="dark"] .modal-content,
            [data-theme="dark"] .login-box,
            [data-theme="dark"] .sidebar,
            [data-theme="dark"] .nav-sidebar {
                background-color: var(--bg-card, #1e2a45) !important;
                border-color:     var(--border-color, #2d3748) !important;
                color:            var(--dark-text, #e8eaf6) !important;
            }

            /* Tables */
            [data-theme="dark"] table,
            [data-theme="dark"] .table {
                color: var(--dark-text, #e8eaf6);
            }
            [data-theme="dark"] th {
                background-color: #0f3460 !important;
                color: #e8eaf6 !important;
            }
            [data-theme="dark"] td {
                border-color: var(--border-color, #2d3748) !important;
            }
            [data-theme="dark"] tr:nth-child(even) td {
                background-color: rgba(255,255,255,.03) !important;
            }
            [data-theme="dark"] tr:hover td {
                background-color: rgba(74,144,217,.12) !important;
            }

            /* Form controls */
            [data-theme="dark"] input,
            [data-theme="dark"] select,
            [data-theme="dark"] textarea {
                background-color: var(--bg-input, #243352) !important;
                color:            var(--dark-text, #e8eaf6) !important;
                border-color:     var(--border-color, #2d3748) !important;
            }
            [data-theme="dark"] input::placeholder,
            [data-theme="dark"] textarea::placeholder {
                color: var(--muted-text, #718096) !important;
            }
            [data-theme="dark"] input:focus,
            [data-theme="dark"] select:focus,
            [data-theme="dark"] textarea:focus {
                border-color: var(--lifestar-light-blue, #63b3ed) !important;
                outline: none;
                box-shadow: 0 0 0 3px rgba(99, 179, 237, .2) !important;
            }

            /* Buttons — keep primary buttons vivid */
            [data-theme="dark"] .btn-secondary,
            [data-theme="dark"] button[class*="secondary"] {
                background-color: #2d3748 !important;
                color: #e8eaf6 !important;
                border-color: #4a5568 !important;
            }

            /* Nav items */
            [data-theme="dark"] .nav-item {
                color: #a0aec0 !important;
            }
            [data-theme="dark"] .nav-item:hover,
            [data-theme="dark"] .nav-item.active {
                background-color: rgba(74,144,217,.18) !important;
                color: #e8eaf6 !important;
            }

            /* Alert / toast colours */
            [data-theme="dark"] .alert-info {
                background-color: rgba(77,192,217,.15) !important;
                color: #81e6d9 !important;
                border-color: rgba(77,192,217,.3) !important;
            }
            [data-theme="dark"] .alert-warning {
                background-color: rgba(246,173,85,.15) !important;
                color: #fbd38d !important;
                border-color: rgba(246,173,85,.3) !important;
            }
            [data-theme="dark"] .alert-danger,
            [data-theme="dark"] .alert-error {
                background-color: rgba(252,92,101,.15) !important;
                color: #feb2b2 !important;
                border-color: rgba(252,92,101,.3) !important;
            }
            [data-theme="dark"] .alert-success {
                background-color: rgba(72,187,120,.15) !important;
                color: #9ae6b4 !important;
                border-color: rgba(72,187,120,.3) !important;
            }

            /* Modals */
            [data-theme="dark"] .modal-overlay {
                background: rgba(0, 0, 0, .7) !important;
            }

            /* Schedule status badges */
            [data-theme="dark"] .schedule-status.published { background: rgba(72,187,120,.2) !important; color: #9ae6b4 !important; }
            [data-theme="dark"] .schedule-status.draft     { background: rgba(246,173,85,.2) !important; color: #fbd38d !important; }
            [data-theme="dark"] .schedule-status.archived  { background: rgba(160,174,192,.2) !important; color: #a0aec0 !important; }

            /* Scrollbar (Webkit) */
            [data-theme="dark"] ::-webkit-scrollbar       { width: 8px; height: 8px; }
            [data-theme="dark"] ::-webkit-scrollbar-track  { background: #1e2a45; }
            [data-theme="dark"] ::-webkit-scrollbar-thumb  { background: #4a5568; border-radius: 4px; }
            [data-theme="dark"] ::-webkit-scrollbar-thumb:hover { background: #718096; }

            /* Smooth transition when switching themes */
            body, .dashboard, .card, .modal-content, input, select, textarea, table, th, td, .nav-item {
                transition: background-color .2s ease, color .2s ease, border-color .2s ease;
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    // THEME APPLICATION
    // ============================================

    function getPreferredTheme() {
        // 1. Check stored preference
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === THEMES.DARK || stored === THEMES.LIGHT) return stored;

        // 2. Fall back to OS/browser preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEMES.DARK;
        }
        return THEMES.LIGHT;
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        _updateToggleButtons(theme);

        if (typeof Logger !== 'undefined') Logger.debug('[ThemeManager] Applied theme:', theme);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || THEMES.LIGHT;
        applyTheme(current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
    }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === THEMES.DARK;
    }

    function _updateToggleButtons(theme) {
        document.querySelectorAll('.theme-toggle-btn, [data-action="toggle-theme"]').forEach(btn => {
            btn.innerHTML = theme === THEMES.DARK
                ? '<span title="Switch to light mode">☀️</span>'
                : '<span title="Switch to dark mode">🌙</span>';
            btn.setAttribute('title', theme === THEMES.DARK ? 'Switch to light mode' : 'Switch to dark mode');
        });
    }

    // ============================================
    // TOGGLE BUTTON FACTORY
    // ============================================

    /**
     * Create and return a pre-styled toggle button element.
     * Append this to any toolbar or nav area.
     * @returns {HTMLButtonElement}
     */
    function createToggleButton() {
        const btn = document.createElement('button');
        btn.className   = 'theme-toggle-btn';
        btn.setAttribute('data-action', 'toggle-theme');
        btn.setAttribute('aria-label', 'Toggle dark mode');
        btn.style.cssText = [
            'background: none',
            'border: 1px solid rgba(255,255,255,.3)',
            'border-radius: 20px',
            'padding: 4px 10px',
            'cursor: pointer',
            'font-size: 16px',
            'line-height: 1',
            'color: inherit',
            'transition: opacity .15s',
        ].join(';');
        btn.onclick = toggleTheme;

        const current = document.documentElement.getAttribute('data-theme') || THEMES.LIGHT;
        btn.innerHTML   = current === THEMES.DARK ? '☀️' : '🌙';
        btn.title       = current === THEMES.DARK ? 'Switch to light mode' : 'Switch to dark mode';

        return btn;
    }

    /**
     * Inject a toggle button into an existing element.
     * @param {string} containerId  - ID of the container element
     */
    function injectToggleButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (container.querySelector('.theme-toggle-btn')) return; // already injected
        container.appendChild(createToggleButton());
    }

    // ============================================
    // SETTINGS PANEL ROW
    // ============================================

    /**
     * Render a settings row for the theme preference (used inside settings sections).
     * @param {string} containerId  - ID to insert the row into
     */
    function renderSettingsRow(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const current = isDark();
        container.insertAdjacentHTML('beforeend', `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--border-color,#eee);">
                <div>
                    <div style="font-weight:600;font-size:14px;">Dark Mode</div>
                    <div style="font-size:12px;color:#888;margin-top:2px;">Easier on the eyes in low-light environments</div>
                </div>
                <label class="theme-switch" style="position:relative;display:inline-block;width:48px;height:26px;">
                    <input type="checkbox" id="dark_mode_toggle" ${current ? 'checked' : ''}
                           onchange="ThemeManager.applyTheme(this.checked ? 'dark' : 'light')"
                           style="opacity:0;width:0;height:0;">
                    <span style="position:absolute;cursor:pointer;inset:0;background:${current ? '#4a90d9' : '#ccc'};
                                 border-radius:26px;transition:.3s;"></span>
                    <span style="position:absolute;content:'';height:20px;width:20px;left:${current ? '24px' : '4px'};bottom:3px;
                                 background:#fff;border-radius:50%;transition:.3s;"></span>
                </label>
            </div>
        `);

        // Dynamically update the slider appearance
        const toggle = document.getElementById('dark_mode_toggle');
        if (toggle) {
            toggle.addEventListener('change', function() {
                const spans = this.closest('.theme-switch').querySelectorAll('span');
                spans[0].style.background = this.checked ? '#4a90d9' : '#ccc';
                spans[1].style.left       = this.checked ? '24px'    : '4px';
            });
        }
    }

    // ============================================
    // LISTEN FOR SYSTEM THEME CHANGES
    // ============================================

    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            // Only auto-switch if the user hasn't set a preference manually
            if (!localStorage.getItem(STORAGE_KEY)) {
                applyTheme(e.matches ? THEMES.DARK : THEMES.LIGHT);
            }
        });
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
        injectDarkModeCSS();
        applyTheme(getPreferredTheme());

        // Inject toggle button into common header containers when they exist
        setTimeout(function() {
            ['topBarActions', 'headerActions', 'navbarEnd', 'userMenuArea'].forEach(injectToggleButton);
        }, 500);

        if (typeof Logger !== 'undefined') Logger.debug('✅ ThemeManager initialized');
    }

    // Run as early as possible to avoid flash of wrong theme
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.ThemeManager = {
        init,
        applyTheme,
        toggleTheme,
        isDark,
        getPreferredTheme,
        createToggleButton,
        injectToggleButton,
        renderSettingsRow,
        THEMES,
    };

})();
