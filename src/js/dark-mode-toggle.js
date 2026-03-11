/**
 * Dark Mode Toggle
 * ================
 * A self-contained, progressively-enhanced dark-mode controller.
 *
 * Design decisions:
 *   - Uses data-theme="dark" on <html> rather than a class so that CSS
 *     custom-property overrides work reliably at the root level.
 *   - Persists preference in localStorage so it survives page refreshes.
 *   - Respects the OS preference (prefers-color-scheme: dark) on first visit.
 *   - Injects a toggle button into the DOM so no HTML changes are needed.
 *   - Fires a custom 'themechange' event so Charts.js and other visuals
 *     can repaint themselves when the theme changes.
 */
'use strict';

const DarkMode = (function () {

    const STORAGE_KEY  = 'lifestar_theme';
    const DARK_VALUE   = 'dark';
    const LIGHT_VALUE  = 'light';

    // ─── CORE ──────────────────────────────────────────────────────────────

    function getSystemPreference() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? DARK_VALUE : LIGHT_VALUE;
    }

    function getSavedPreference() {
        return localStorage.getItem(STORAGE_KEY);
    }

    function getEffectiveTheme() {
        return getSavedPreference() || getSystemPreference();
    }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === DARK_VALUE;
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('dark-mode', theme === DARK_VALUE);

        // Update toggle button icon
        const btn = document.getElementById('darkModeToggle');
        if (btn) {
            btn.textContent = theme === DARK_VALUE ? '☀️' : '🌙';
            btn.title       = theme === DARK_VALUE ? 'Switch to light mode' : 'Switch to dark mode';
            btn.setAttribute('aria-pressed', theme === DARK_VALUE ? 'true' : 'false');
        }

        // Save preference
        localStorage.setItem(STORAGE_KEY, theme);

        // Notify other modules (charts, etc.)
        window.dispatchEvent(new CustomEvent('themechange', {
            detail: { theme, isDark: theme === DARK_VALUE }
        }));
    }

    function toggle() {
        applyTheme(isDark() ? LIGHT_VALUE : DARK_VALUE);
    }

    // ─── BUTTON INJECTION ─────────────────────────────────────────────────

    function injectToggleButton() {
        if (document.getElementById('darkModeToggle')) return; // already injected

        const btn = document.createElement('button');
        btn.id    = 'darkModeToggle';
        btn.setAttribute('aria-label', 'Toggle dark mode');
        btn.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
        btn.addEventListener('click', toggle);

        // Insert into the document body — CSS positions it top-right
        document.body.appendChild(btn);

        // Set correct initial icon
        applyTheme(getEffectiveTheme());
    }

    // ─── SYSTEM PREFERENCE LISTENER ───────────────────────────────────────

    function watchSystemPreference() {
        if (!window.matchMedia) return;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            // Only follow the OS if the user hasn't manually chosen a theme
            if (!getSavedPreference()) {
                applyTheme(e.matches ? DARK_VALUE : LIGHT_VALUE);
            }
        });
    }

    // ─── CHART.JS RE-THEME HOOK ────────────────────────────────────────────

    /**
     * When Chart.js charts are rendered, they need explicit dark-mode colour
     * overrides.  We listen for 'themechange' and update Chart.js defaults
     * so the next render picks up the correct palette.
     */
    function hookCharts() {
        window.addEventListener('themechange', ({ detail: { isDark: dark } }) => {
            if (typeof Chart === 'undefined') return;

            const gridColor  = dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';
            const tickColor  = dark ? '#94a3b8' : '#475569';
            const legendColor= dark ? '#f1f5f9' : '#1e293b';

            Chart.defaults.color = legendColor;
            if (Chart.defaults.plugins?.legend?.labels) {
                Chart.defaults.plugins.legend.labels.color = legendColor;
            }
            if (Chart.defaults.scales?.x) {
                Chart.defaults.scales.x.grid.color  = gridColor;
                Chart.defaults.scales.x.ticks.color = tickColor;
            }
            if (Chart.defaults.scales?.y) {
                Chart.defaults.scales.y.grid.color  = gridColor;
                Chart.defaults.scales.y.ticks.color = tickColor;
            }

            // Re-render all registered chart instances
            Object.values(Chart.instances || {}).forEach(c => c.update());
        });
    }

    // ─── INIT ──────────────────────────────────────────────────────────────

    function init() {
        // Apply theme ASAP (before DOM fully renders) to prevent flash
        applyTheme(getEffectiveTheme());

        // Then inject the button and wire up listeners once the DOM exists
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                injectToggleButton();
                watchSystemPreference();
                hookCharts();
            });
        } else {
            injectToggleButton();
            watchSystemPreference();
            hookCharts();
        }
    }

    // ─── PUBLIC API ────────────────────────────────────────────────────────

    return {
        init,
        toggle,
        isDark,
        setTheme: applyTheme,
        get theme() { return getEffectiveTheme(); }
    };

})();

// Auto-init
DarkMode.init();
window.DarkMode = DarkMode;
