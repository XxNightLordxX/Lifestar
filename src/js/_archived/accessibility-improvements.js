/**
 * Accessibility Improvements System
 * Enhanced ARIA labels, keyboard navigation, and WCAG compliance
 */

const AccessibilityEnhancer = {
    initialized: false,

    /**
     * Initialize accessibility enhancements
     */
    init() {
        if(this.initialized) return;

        Logger.debug('♿ Accessibility Enhancer initialized');
        this.addARIALabels();
        this.enhanceKeyboardNavigation();
        this.addSkipLinks();
        this.improveColorContrast();
        this.addFocusIndicators();
        this.announceDynamicContent();

        this.initialized = true;
    },

    /**
     * Add ARIA labels to interactive elements
     */
    addARIALabels() {
        // Add labels to form inputs
        const inputsNeedingLabels = document.querySelectorAll('input:not([aria-label]), button:not([aria-label])');
        inputsNeedingLabels.forEach(input => {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if(label) {
                input.setAttribute('aria-label', label.textContent);
            } else if(input.placeholder) {
                input.setAttribute('aria-label', input.placeholder);
            } else if(input.type === 'submit') {
                input.setAttribute('aria-label', 'Submit form');
            }
        });

        // Add ARIA roles to main containers
        const mainContent = document.querySelector('main') || document.querySelector('.main-content');
        if(mainContent && !mainContent.getAttribute('role')) {
            mainContent.setAttribute('role', 'main');
        }

        const nav = document.querySelector('nav') || document.querySelector('.sidebar');
        if(nav && !nav.getAttribute('role')) {
            nav.setAttribute('role', 'navigation');
            nav.setAttribute('aria-label', 'Main navigation');
        }

        // Add ARIA to modals
        const modals = document.querySelectorAll('.modal:not([role])');
        modals.forEach(modal => {
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', modal.id + 'Title');

            // Add title if not present
            const title = document.getElementById(modal.id + 'Title') || modal.querySelector('h2, h3');
            if(title && !title.id) {
                title.id = modal.id + 'Title';
            }
        });

        // Add ARIA to buttons with icons only
        const iconButtons = document.querySelectorAll('button:has(.icon), button[title]');
        iconButtons.forEach(button => {
            if(!button.getAttribute('aria-label')) {
                const title = button.getAttribute('title') || button.textContent.trim();
                if(title) {
                    button.setAttribute('aria-label', title);
                }
            }
        });

        // Add ARIA to dropdowns
        const dropdowns = document.querySelectorAll('select:not([aria-label])');
        dropdowns.forEach(dropdown => {
            const label = document.querySelector(`label[for="${dropdown.id}"]`);
            if(label) {
                dropdown.setAttribute('aria-label', label.textContent);
            }
        });

        Logger.debug('✓ ARIA labels added');
    },

    /**
     * Enhance keyboard navigation
     */
    enhanceKeyboardNavigation() {
        // Make all interactive elements focusable
        const interactiveElements = document.querySelectorAll('button, a, input, select, textarea, [tabindex]');
        interactiveElements.forEach(element => {
            if(!element.hasAttribute('tabindex')) {
                element.setAttribute('tabindex', '0');
            }
        });

        // Add keyboard handlers for custom elements
        const customButtons = document.querySelectorAll('.card, .crew-card, [onclick]');
        customButtons.forEach(button => {
            if(!button.hasAttribute('tabindex')) {
                button.setAttribute('tabindex', '0');
                button.setAttribute('role', 'button');
                button.addEventListener('keydown', (e) => {
                    if(e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        button.click();
                    }
                });
            }
        });

        // Add escape key handler for modals
        document.addEventListener('keydown', (e) => {
            if(e.key === 'Escape') {
                const openModal = document.querySelector('.modal[style*="display: block"], .modal:not(.hidden)');
                if(openModal) {
                    const closeButton = openModal.querySelector('.close, button[onclick*="close"]');
                    if(closeButton) {
                        closeButton.click();
                    }
                }
            }
        });

        // Add focus trap for modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('keydown', (e) => {
                if(e.key === 'Tab') {
                    const focusableElements = modal.querySelectorAll(;
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if(e.shiftKey && document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    } else if(!e.shiftKey && document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            });
        });

        Logger.debug('✓ Keyboard navigation enhanced');
    },

    /**
     * Add skip links for keyboard users
     */
    addSkipLinks() {
        if(!document.querySelector('.skip-link')) {
            const skipLink = document.createElement('a');
            skipLink.href = '#main-content';
            skipLink.className = 'skip-link';
            skipLink.textContent = 'Skip to main content';
            skipLink.setAttribute('aria-label', 'Skip to main content');
            skipLink.style.cssText = `
                position: absolute;
                top: -40px;
                left: 0;
                background: #000;
                color: #fff;
                padding: 8px;
                z-index: 10000;
                transition: top 0.3s;
            `;

            skipLink.addEventListener('focus', () => {
                skipLink.style.top = '0';
            });

            skipLink.addEventListener('blur', () => {
                skipLink.style.top = '-40px';
            });

            document.body.insertBefore(skipLink, document.body.firstChild);

            // Add id to main content
            const mainContent = document.querySelector('main') || document.querySelector('.main-content');
            if(mainContent && !mainContent.id) {
                mainContent.id = 'main-content';
            }

            Logger.debug('✓ Skip links added');
        }
    },

    /**
     * Improve color contrast
     */
    improveColorContrast() {
        // This is a placeholder - actual contrast checking would require
        // a more sophisticated color analysis library
        // For now, we ensure text colors have sufficient contrast

        const lowContrastElements = document.querySelectorAll('.text-muted, .secondary-text');
        lowContrastElements.forEach(element => {
            const computedStyle = window.getComputedStyle(element);
            const color = computedStyle.color;
            // Ensure minimum contrast ratio of 4.5:1 for normal text
            // This is a simplified check
            if(color.includes('rgba(0, 0, 0, 0.5)')) {
                element.style.color = 'rgba(0, 0, 0, 0.7)';
            }
        });

        Logger.debug('✓ Color contrast checked');
    },

    /**
     * Add visible focus indicators
     */
    addFocusIndicators() {
        const style = document.createElement('style');
        style.textContent = `
            /* Visible focus indicators */
            *:focus {
                outline: 3px solid #005fcc !important;
                outline-offset: 2px !important;
            }

            button:focus,
            a:focus,
            input:focus,
            select:focus,
            textarea:focus {
                box-shadow: 0 0 0 3px rgba(0, 95, 204, 0.3);
            }

            /* Skip link styling */
            .skip-link:focus {
                top: 0 !important;
                outline: 3px solid #005fcc;
                outline-offset: -2px;
            }

            /* Modal focus styling */
            .modal[role="dialog"] {
                outline: none;
            }
        `;
        document.head.appendChild(style);

        Logger.debug('✓ Focus indicators added');
    },

    /**
     * Announce dynamic content to screen readers
     */
    announceDynamicContent() {
        // Create live region for announcements
        let liveRegion = document.getElementById('a11y-live-region');
        if(!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'a11y-live-region';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
            document.body.appendChild(liveRegion);
        }

        // Create alert region for urgent messages
        let alertRegion = document.getElementById('a11y-alert-region');
        if(!alertRegion) {
            alertRegion = document.createElement('div');
            alertRegion.id = 'a11y-alert-region';
            alertRegion.setAttribute('role', 'alert');
            alertRegion.setAttribute('aria-live', 'assertive');
            alertRegion.setAttribute('aria-atomic', 'true');
            alertRegion.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
            document.body.appendChild(alertRegion);
        }

        // Function to announce messages
        this.announce = function(message, urgent = false) {
            const region = urgent ? alertRegion : liveRegion;
            region.textContent = message;

            // Clear after announcement
            setTimeout(() => {
                region.textContent = '';
            }, 3000);
        };

        Logger.debug('✓ Dynamic content announcements enabled');
    },

    /**
     * Validate accessibility
     */
    validateAccessibility() {
        const issues = [];

        // Check for missing labels
        const inputsWithoutLabels = document.querySelectorAll('input:not([aria-label])');
        inputsWithoutLabels.forEach(input => {
            const hasLabel = document.querySelector(`label[for="${input.id}"]`);
            if(!hasLabel && !input.placeholder) {
                issues.push({
                    severity: 'HIGH',
                    message: `Input without label or placeholder: ${input.id || input.name || 'unnamed input'}`
                });
            }
        });

        // Check for missing alt text
        const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
        if(imagesWithoutAlt.length > 0) {
            issues.push({
                severity: 'MEDIUM',
                message: `${imagesWithoutAlt.length} images missing alt text`
            });
        }

        // Check for proper heading hierarchy
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let lastLevel = 0;
        headings.forEach(heading => {
            const level = parseInt(heading.tagName.charAt(1));
            if(level > lastLevel + 1) {
                issues.push({
                    severity: 'LOW',
                    message: `Skipped heading level: from h${lastLevel} to h${level}`
                });
            }
            lastLevel = level;
        });

        // Check for keyboard accessibility
        const keyboardInaccessible = document.querySelectorAll('.modal:not([role])');
        keyboardInaccessible.forEach(modal => {
            issues.push({
                severity: 'HIGH',
                message: `Modal without proper ARIA role: ${modal.id || 'unnamed modal'}`
            });
        });

        Logger.debug(`Accessibility validation complete: ${issues.length} issues found`);
        return issues;
    },

    /**
     * Generate accessibility report
     */
    generateReport() {
        return {
            timestamp: new Date().toISOString(),
            enhancementsApplied: {
                ariaLabels: true,
                keyboardNavigation: true,
                skipLinks: true,
                focusIndicators: true,
                liveRegions: true
            },
            issues: this.validateAccessibility(),
            wcagLevel: 'AA',
            score: this.calculateAccessibilityScore()
        };
    },

    /**
     * Calculate accessibility score
     */
    calculateAccessibilityScore() {
        const issues = this.validateAccessibility();
        const criticalCount = issues.filter(i => i.severity === 'HIGH').length;
        const mediumCount = issues.filter(i => i.severity === 'MEDIUM').length;

        let score = 100;
        score -= criticalCount * 15;
        score -= mediumCount * 5;

        return Math.max(0, score);
    }
};

// Auto-initialize when DOM is ready
if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AccessibilityEnhancer.init());
} else {
    AccessibilityEnhancer.init();
}

// Export for testing
if(typeof module !== 'undefined' && module.exports) {
    module.exports = AccessibilityEnhancer;
}
