/**
 * Dark Mode Toggle for Lifestar Ambulance Scheduling
 * Persists user preference to localStorage
 */

const DarkMode = {
    _key: 'lifestarDarkMode',
    _enabled: false,
    
    /**
     * Initialize dark mode from saved preference
     */
    init() {
        this._enabled = localStorage.getItem(this._key) === 'true';
        if (this._enabled) {
            document.documentElement.classList.add('dark-mode');
        }
        this._injectToggleButton();
        this._updateToggle();
    },
    
    /**
     * Toggle dark mode on/off
     */
    toggle() {
        this._enabled = !this._enabled;
        localStorage.setItem(this._key, this._enabled.toString());
        
        if (this._enabled) {
            document.documentElement.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark-mode');
        }
        
        this._updateToggle();
    },
    
    /**
     * Check if dark mode is enabled
     */
    isEnabled() {
        return this._enabled;
    },
    
    /**
     * Inject toggle button into all dashboard headers
     */
    _injectToggleButton() {
        // Add to each sidebar footer (before logout button)
        const sidebarFooters = document.querySelectorAll('.sidebar-footer');
        sidebarFooters.forEach(footer => {
            if (footer.querySelector('.dark-mode-toggle')) return;
            
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm dark-mode-toggle';
            btn.style.cssText = 'width:100%; margin-bottom:8px; background:#555; color:#fff; border:none; padding:8px; border-radius:4px; cursor:pointer; font-size:13px;';
            btn.textContent = this._enabled ? '☀️ Light Mode' : '🌙 Dark Mode';
            btn.onclick = () => DarkMode.toggle();
            footer.insertBefore(btn, footer.firstChild);
        });
    },
    
    /**
     * Update all toggle buttons
     */
    _updateToggle() {
        document.querySelectorAll('.dark-mode-toggle').forEach(btn => {
            btn.textContent = this._enabled ? '☀️ Light Mode' : '🌙 Dark Mode';
        });
    }
};

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    DarkMode.init();
});