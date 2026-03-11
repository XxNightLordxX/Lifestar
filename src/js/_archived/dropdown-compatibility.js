/**
 * Dropdown Compatibility Module
 * Ensures dropdowns work correctly across all platforms:
 * - Desktop browsers (Chrome, Firefox, Safari, Edge)
 * - Mobile browsers (iOS Safari, Chrome Mobile)
 * - Web app mode
 * - Browser automation tools
 */

const DropdownCompatibility = {
    /**
     * Initialize all dropdowns on the page with compatibility fixes
     */
    initAllDropdowns() {
        const dropdowns = document.querySelectorAll('select');
        dropdowns.forEach(dropdown => {
            this.setupDropdown(dropdown);
        });
    },

    /**
     * Setup a single dropdown with cross-platform compatibility
     * @param {HTMLSelectElement} dropdown - The select element to setup
     */
    setupDropdown(dropdown) {
        if(!dropdown || dropdown.dataset.compatibilitySetup === 'true') {
            return;
        }

        // Mark as setup to avoid duplicate initialization
        dropdown.dataset.compatibilitySetup = 'true';

        // Store initial value
        dropdown.dataset.selectedValue = dropdown.value;

        // Add multiple event listeners to capture changes from all sources
        dropdown.addEventListener('change', this.handleChange.bind(this));
        dropdown.addEventListener('input', this.handleChange.bind(this));
        dropdown.addEventListener('mouseup', this.handleMouseUp.bind(this));
        dropdown.addEventListener('keyup', this.handleKeyUp.bind(this));
        dropdown.addEventListener('blur', this.handleBlur.bind(this));
        dropdown.addEventListener('click', this.handleClick.bind(this));

        // Detect iOS Safari for special handling
        if(this.isIOSSafari()) {
            this.setupIOSFixes(dropdown);
        }

        // Detect Android for special handling
        if(this.isAndroid()) {
            this.setupAndroidFixes(dropdown);
        }
    },

    /**
     * Handle change event from user interaction
     */
    handleChange(e) {
        const dropdown = e.target;
        dropdown.dataset.selectedValue = dropdown.value;
        this.triggerCustomEvent(dropdown, 'valueChanged');
    },

    /**
     * Handle mouseup event (for browser automation compatibility)
     */
    handleMouseUp(e) {
        const dropdown = e.target;
        dropdown.dataset.selectedValue = dropdown.value;

        // Small delay to ensure value is set
        setTimeout(() => {
            dropdown.dataset.selectedValue = dropdown.value;
        }, 50);
    },

    /**
     * Handle keyup event (keyboard navigation)
     */
    handleKeyUp(e) {
        const dropdown = e.target;
        dropdown.dataset.selectedValue = dropdown.value;

        // Check if Enter key was pressed
        if(e.key === 'Enter') {
            this.triggerCustomEvent(dropdown, 'valueChanged');
        }
    },

    /**
     * Handle blur event (when dropdown loses focus)
     */
    handleBlur(e) {
        const dropdown = e.target;
        dropdown.dataset.selectedValue = dropdown.value;
    },

    /**
     * Handle click event
     */
    handleClick(e) {
        const dropdown = e.target;
        // Store current value before dropdown opens
        dropdown.dataset.valueBeforeClick = dropdown.value;
    },

    /**
     * Get the current value from a dropdown with fallbacks
     * @param {HTMLSelectElement|string} dropdown - Element or element ID
     * @returns {string} The selected value
     */
    getValue(dropdown) {
        const element = typeof dropdown === 'string';
            ? document.getElementById(dropdown)
            : dropdown;

        if(!element) return '';

        // Try multiple sources for the value
        let value = element.value;

        if(!value && element.selectedIndex > 0) {
            value = element.options[element.selectedIndex].value;
        }

        if(!value) {
            value = element.dataset.selectedValue || '';
        }

        return value;
    },

    /**
     * Set the value of a dropdown with cross-platform support
     * @param {HTMLSelectElement|string} dropdown - Element or element ID
     * @param {string} value - Value to set
     */
    setValue(dropdown, value) {
        const element = typeof dropdown === 'string';
            ? document.getElementById(dropdown)
            : dropdown;

        if(!element) return;

        element.value = value;
        element.dataset.selectedValue = value;

        // Trigger change event
        this.triggerCustomEvent(element, 'valueChanged');
    },

    /**
     * Trigger a custom event
     */
    triggerCustomEvent(element, eventName) {
        const event = new Event(eventName, { bubbles: true });
        element.dispatchEvent(event);
    },

    /**
     * Check if browser is iOS Safari
     */
    isIOSSafari() {
        const ua = navigator.userAgent;
        return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua);
    },

    /**
     * Check if browser is Android
     */
    isAndroid() {
        return /Android/.test(navigator.userAgent);
    },

    /**
     * Setup iOS-specific fixes
     */
    setupIOSFixes(dropdown) {
        // iOS Safari needs special handling for dropdown appearance
        dropdown.style.webkitAppearance = 'menulist-button';

        // Add touchstart event for better iOS response
        dropdown.addEventListener('touchstart', (e) => {
            dropdown.dataset.touchStarted = 'true';
        });

        dropdown.addEventListener('touchend', (e) => {
            setTimeout(() => {
                dropdown.dataset.selectedValue = dropdown.value;
            }, 100);
        });
    },

    /**
     * Setup Android-specific fixes
     */
    setupAndroidFixes(dropdown) {
        // Android needs larger touch targets
        dropdown.style.minHeight = '44px';

        // Add touch events
        dropdown.addEventListener('touchend', (e) => {
            setTimeout(() => {
                dropdown.dataset.selectedValue = dropdown.value;
            }, 100);
        });
    },

    /**
     * Test a dropdown to ensure it's working correctly
     * @param {HTMLSelectElement|string} dropdown - Element or element ID
     * @returns {Object} Test results
     */
    testDropdown(dropdown) {
        const element = typeof dropdown === 'string';
            ? document.getElementById(dropdown)
            : dropdown;

        const results = {
            elementId: element?.id || 'unknown',
            hasSetup: element?.dataset.compatibilitySetup === 'true',
            hasSelectedValue: !!element?.dataset.selectedValue,
            currentValue: element?.value || '',
            selectedValue: element?.dataset.selectedValue || '',
            selectedIndex: element?.selectedIndex || -1,
            optionCount: element?.options?.length || 0,
            isIOS: this.isIOSSafari(),
            isAndroid: this.isAndroid(),
            eventListeners: [],
            passed: true
        };

        // Check if value matches selectedValue
        if(results.currentValue !== results.selectedValue) {
            results.passed = false;
            results.error = 'Value mismatch';
        }

        return results;
    },

    /**
     * Run diagnostics on all dropdowns
     */
    runDiagnostics() {
        const dropdowns = document.querySelectorAll('select');
        const diagnostics = {
            total: dropdowns.length,
            setup: 0,
            notSetup: 0,
            results: []
        };

        dropdowns.forEach(dropdown => {
            const test = this.testDropdown(dropdown);
            diagnostics.results.push(test);

            if(test.hasSetup) {
                diagnostics.setup++;
            } else {
                diagnostics.notSetup++;
            }
        });

        return diagnostics;
    }
};

// Auto-initialize when DOM is ready
if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        DropdownCompatibility.initAllDropdowns();
    });
} else {
    DropdownCompatibility.initAllDropdowns();
}

// Export for use in other modules
if(typeof module !== 'undefined' && module.exports) {
    module.exports = DropdownCompatibility;
}
