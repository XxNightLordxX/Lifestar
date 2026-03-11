/**
 * Core Accessibility Module for Lifestar Ambulance Scheduling System
 * Consolidates: accessibility-enhancements.js, accessibility-improvements.js, modal-focus-manager.js
 * WCAG 2.1 AA Compliant
 */

(function() {
    'use strict';

    // ============================================
    // MODAL FOCUS MANAGER
    // ============================================
    class ModalFocusManager {
        constructor() {
            this.activeModal = null;
            this.previousFocus = null;
            this.focusableSelectors = [
                'a[href]',
                'button:not([disabled])',
                'input:not([disabled])',
                'select:not([disabled])',
                'textarea:not([disabled])',
                '[tabindex]:not([tabindex="-1"])',
                '[contenteditable]'
            ].join(', ');
            this.boundHandleKeydown = this.handleKeydown.bind(this);
        }

        /**
         * Open a modal with proper focus management
         */
        openModal(modal) {
            if (!modal) return;

            // Store previous focus
            this.previousFocus = document.activeElement;
            this.activeModal = modal;

            // Show modal
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');

            // Set focus to first focusable element or close button
            const focusableElements = this.getFocusableElements(modal);
            if (focusableElements.length > 0) {
                const closeBtn = modal.querySelector('.close-btn, [data-dismiss="modal"]');
                if (closeBtn) {
                    closeBtn.focus();
                } else {
                    focusableElements[0].focus();
                }
            }

            // Add focus trap
            document.addEventListener('keydown', this.boundHandleKeydown);

            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        }

        /**
         * Close a modal with proper focus restoration
         */
        closeModal(modal) {
            if (!modal) return;

            // Hide modal
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');

            // Remove focus trap
            document.removeEventListener('keydown', this.boundHandleKeydown);

            // Restore previous focus
            if (this.previousFocus && this.previousFocus.focus) {
                this.previousFocus.focus();
            }

            this.activeModal = null;
            this.previousFocus = null;

            // Restore body scroll
            document.body.style.overflow = '';
        }

        /**
         * Handle keydown for focus trap and escape
         */
        handleKeydown(e) {
            if (!this.activeModal) return;

            // Handle Escape key
            if (e.key === 'Escape') {
                const closeBtn = this.activeModal.querySelector('.close-btn, [data-dismiss="modal"]');
                if (closeBtn) closeBtn.click();
                return;
            }

            // Handle Tab key for focus trap
            if (e.key === 'Tab') {
                const focusableElements = this.getFocusableElements(this.activeModal);
                if (focusableElements.length === 0) return;

                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }

        /**
         * Get all focusable elements within a container
         */
        getFocusableElements(container) {
            return Array.from(container.querySelectorAll(this.focusableSelectors))
                .filter(el => {
                    return el.offsetParent !== null &&
                           !el.hasAttribute('disabled') &&
                           el.tabIndex >= 0;
                });
        }
    }

    // ============================================
    // ACCESSIBILITY STATE
    // ============================================
    const AccessibilityState = {
        initialized: false,
        liveRegion: null,
        liveRegionAssertive: null
    };

    // ============================================
    // ACCESSIBILITY MANAGER
    // ============================================
    const AccessibilityManager = {
        /**
         * Initialize all accessibility enhancements
         */
        init() {
            if (AccessibilityState.initialized) return;

            Logger.debug('♿ Initializing Accessibility Manager');

            this.createLiveRegions();
            this.addARIALabels();
            this.addRoles();
            this.enhanceKeyboardNavigation();
            this.addSkipLinks();
            this.enhanceFocusIndicators();
            this.enhanceForms();
            this.enhanceModals();
            this.enhanceTables();
            this.enhanceButtons();
            this.addAnnouncements();

            AccessibilityState.initialized = true;
            Logger.debug('✅ Accessibility Manager initialized');
        },

        // ----------------------------------------
        // LIVE REGIONS
        // ----------------------------------------
        createLiveRegions() {
            // Create polite live region
            if (!document.getElementById('a11y-live-region')) {
                const politeRegion = document.createElement('div');
                politeRegion.id = 'a11y-live-region';
                politeRegion.setAttribute('role', 'status');
                politeRegion.setAttribute('aria-live', 'polite');
                politeRegion.setAttribute('aria-atomic', 'true');
                politeRegion.className = 'sr-only';
                politeRegion.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
                document.body.appendChild(politeRegion);
                AccessibilityState.liveRegion = politeRegion;
            }

            // Create assertive live region
            if (!document.getElementById('a11y-live-region-assertive')) {
                const assertiveRegion = document.createElement('div');
                assertiveRegion.id = 'a11y-live-region-assertive';
                assertiveRegion.setAttribute('role', 'alert');
                assertiveRegion.setAttribute('aria-live', 'assertive');
                assertiveRegion.setAttribute('aria-atomic', 'true');
                assertiveRegion.className = 'sr-only';
                assertiveRegion.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
                document.body.appendChild(assertiveRegion);
                AccessibilityState.liveRegionAssertive = assertiveRegion;
            }
        },

        /**
         * Announce message to screen readers
         */
        announce(message, assertive = false) {
            const region = assertive ? 
                AccessibilityState.liveRegionAssertive : 
                AccessibilityState.liveRegion;

            if (region) {
                region.textContent = '';
                setTimeout(() => {
                    region.textContent = message;
                }, 100);
            }
        },

        // ----------------------------------------
        // ARIA LABELS
        // ----------------------------------------
        addARIALabels() {
            // Navigation items
            document.querySelectorAll('.nav-item').forEach(item => {
                if (!item.getAttribute('aria-label')) {
                    const text = item.querySelector('.nav-item-text');
                    if (text) {
                        item.setAttribute('aria-label', text.textContent.trim());
                        item.setAttribute('role', 'button');
                        item.setAttribute('tabindex', '0');
                    }
                }
            });

            // Form inputs without labels
            document.querySelectorAll('input, select, textarea').forEach(input => {
                const id = input.id;
                const existingLabel = document.querySelector(`label[for="${id}"]`);

                if (!existingLabel && !input.getAttribute('aria-label')) {
                    const placeholder = input.placeholder || input.name || id || 'Input field';
                    input.setAttribute('aria-label', placeholder);
                }

                if (input.hasAttribute('required')) {
                    input.setAttribute('aria-required', 'true');
                }
            });

            // Dashboard sections
            document.querySelectorAll('.dashboard-section').forEach(section => {
                const heading = section.querySelector('h2, h3');
                if (heading && !section.getAttribute('aria-label')) {
                    section.setAttribute('aria-label', heading.textContent.trim());
                }
            });

            // Buttons without labels
            document.querySelectorAll('button:not([aria-label])').forEach(button => {
                const text = button.textContent.trim();
                if (text) {
                    button.setAttribute('aria-label', text);
                } else {
                    const icon = button.querySelector('i, .icon');
                    if (icon) {
                        button.setAttribute('aria-label', icon.className || 'Action button');
                    }
                }
            });

            // Menu toggles
            document.querySelectorAll('.mobile-menu-toggle').forEach(toggle => {
                toggle.setAttribute('aria-label', 'Toggle navigation menu');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-controls', 'mobile-menu');
            });

            // Alerts
            document.querySelectorAll('.alert').forEach(alert => {
                alert.setAttribute('role', 'alert');
                alert.setAttribute('aria-live', 'polite');
            });

            // Badges
            document.querySelectorAll('.nav-item-badge').forEach(badge => {
                badge.setAttribute('aria-label', `${badge.textContent} items`);
            });

            // Dropdowns
            document.querySelectorAll('select:not([aria-label])').forEach(dropdown => {
                const label = document.querySelector(`label[for="${dropdown.id}"]`);
                if (label) {
                    dropdown.setAttribute('aria-label', label.textContent);
                }
            });

            Logger.debug('✓ ARIA labels added');
        },

        // ----------------------------------------
        // ROLES
        // ----------------------------------------
        addRoles() {
            // Main content areas
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.setAttribute('role', 'main');
            }

            // Navigation
            document.querySelectorAll('.sidebar').forEach(sidebar => {
                sidebar.setAttribute('role', 'navigation');
                sidebar.setAttribute('aria-label', 'Main navigation');
            });

            document.querySelectorAll('.sidebar-nav').forEach(nav => {
                nav.setAttribute('role', 'navigation');
            });

            // Forms
            document.querySelectorAll('form').forEach((form, index) => {
                form.setAttribute('role', 'form');
                if (!form.getAttribute('aria-label')) {
                    const heading = form.querySelector('h1, h2, h3, legend');
                    form.setAttribute('aria-label', heading ? heading.textContent.trim() : `Form ${index + 1}`);
                }
            });

            // Tables
            document.querySelectorAll('table').forEach(table => {
                table.setAttribute('role', 'table');
                const caption = table.querySelector('caption');
                if (!caption) {
                    const headers = table.querySelectorAll('th');
                    if (headers.length > 0) {
                        const captionText = Array.from(headers).map(h => h.textContent).join(', ');
                        table.setAttribute('aria-label', captionText);
                    }
                }
            });

            // Grids
            document.querySelectorAll('.permissions-grid, .data-grid, .staff-grid').forEach(grid => {
                grid.setAttribute('role', 'grid');
            });

            // Tabs
            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.setAttribute('role', 'tab');
                tab.setAttribute('tabindex', '0');
            });

            // Tab panels
            document.querySelectorAll('[data-tab-panel]').forEach(panel => {
                panel.setAttribute('role', 'tabpanel');
            });

            // Menus
            document.querySelectorAll('.dropdown, .dropdown-menu').forEach(menu => {
                menu.setAttribute('role', 'menu');
            });

            // Menu items
            document.querySelectorAll('.dropdown-item').forEach(item => {
                item.setAttribute('role', 'menuitem');
            });

            // Progress bars
            document.querySelectorAll('.progress-bar, .progress').forEach(progress => {
                progress.setAttribute('role', 'progressbar');
                progress.setAttribute('aria-valuemin', '0');
                progress.setAttribute('aria-valuemax', '100');
                const value = progress.getAttribute('data-value') || progress.style.width || '0';
                progress.setAttribute('aria-valuenow', value.replace('%', ''));
            });

            // Dialogs/Modals
            document.querySelectorAll('.modal').forEach(modal => {
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                const heading = modal.querySelector('h2, h3, .modal-title');
                if (heading) {
                    const id = heading.id || `modal-title-${Math.random().toString(36).substr(2, 9)}`;
                    heading.id = id;
                    modal.setAttribute('aria-labelledby', id);
                }
            });

            // Lists
            document.querySelectorAll('ul, ol').forEach(list => {
                list.setAttribute('role', 'list');
            });

            document.querySelectorAll('li').forEach(item => {
                item.setAttribute('role', 'listitem');
            });

            Logger.debug('✓ ARIA roles added');
        },

        // ----------------------------------------
        // KEYBOARD NAVIGATION
        // ----------------------------------------
        enhanceKeyboardNavigation() {
            // Make nav items keyboard accessible
            document.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        item.click();
                    }
                });
            });

            // Make cards keyboard accessible
            document.querySelectorAll('.card[onclick], .crew-card[onclick]').forEach(card => {
                if (!card.hasAttribute('tabindex')) {
                    card.setAttribute('tabindex', '0');
                    card.setAttribute('role', 'button');
                    card.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            card.click();
                        }
                    });
                }
            });

            // Tab navigation
            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        tab.click();
                    }
                });
            });

            // Dropdown keyboard navigation
            document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
                toggle.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown' || e.key === 'Enter') {
                        e.preventDefault();
                        const dropdown = toggle.closest('.dropdown');
                        if (dropdown) dropdown.classList.add('open');
                    }
                });
            });

            Logger.debug('✓ Keyboard navigation enhanced');
        },

        // ----------------------------------------
        // SKIP LINKS
        // ----------------------------------------
        addSkipLinks() {
            if (document.getElementById('skip-to-main')) return;

            const skipLink = document.createElement('a');
            skipLink.id = 'skip-to-main';
            skipLink.href = '#main-content';
            skipLink.className = 'skip-link';
            skipLink.textContent = 'Skip to main content';
            skipLink.style.cssText = `
                position: absolute;
                top: -40px;
                left: 0;
                background: #1a73e8;
                color: white;
                padding: 8px 16px;
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

            Logger.debug('✓ Skip links added');
        },

        // ----------------------------------------
        // FOCUS INDICATORS
        // ----------------------------------------
        enhanceFocusIndicators() {
            // Add visible focus styles
            const style = document.createElement('style');
            style.id = 'a11y-focus-styles';
            style.textContent = `
                *:focus {
                    outline: 2px solid #1a73e8 !important;
                    outline-offset: 2px !important;
                }
                .sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border: 0;
                }
                .skip-link:focus {
                    top: 0 !important;
                }
            `;
            document.head.appendChild(style);

            Logger.debug('✓ Focus indicators enhanced');
        },

        // ----------------------------------------
        // FORMS
        // ----------------------------------------
        enhanceForms() {
            // Add error associations
            document.querySelectorAll('.form-error, .error-message').forEach(error => {
                const input = error.previousElementSibling;
                if (input && (input.tagName === 'INPUT' || input.tagName === 'SELECT' || input.tagName === 'TEXTAREA')) {
                    const errorId = `error-${input.id || Math.random().toString(36).substr(2, 9)}`;
                    error.id = errorId;
                    input.setAttribute('aria-describedby', errorId);
                    input.setAttribute('aria-invalid', 'true');
                }
            });

            // Add fieldset legends where missing
            document.querySelectorAll('fieldset').forEach(fieldset => {
                if (!fieldset.querySelector('legend')) {
                    const legend = document.createElement('legend');
                    legend.className = 'sr-only';
                    legend.textContent = 'Form group';
                    fieldset.insertBefore(legend, fieldset.firstChild);
                }
            });

            Logger.debug('✓ Forms enhanced');
        },

        // ----------------------------------------
        // MODALS
        // ----------------------------------------
        enhanceModals() {
            document.querySelectorAll('.modal').forEach(modal => {
                // Ensure close button is accessible
                const closeBtn = modal.querySelector('.close, .close-btn, [data-dismiss="modal"]');
                if (closeBtn && !closeBtn.getAttribute('aria-label')) {
                    closeBtn.setAttribute('aria-label', 'Close dialog');
                    closeBtn.setAttribute('tabindex', '0');
                }
            });

            Logger.debug('✓ Modals enhanced');
        },

        // ----------------------------------------
        // TABLES
        // ----------------------------------------
        enhanceTables() {
            document.querySelectorAll('table').forEach(table => {
                // Add scope to headers
                table.querySelectorAll('th').forEach(th => {
                    if (!th.getAttribute('scope')) {
                        th.setAttribute('scope', th.closest('thead') ? 'col' : 'row');
                    }
                });

                // Ensure table has caption
                if (!table.querySelector('caption')) {
                    const caption = document.createElement('caption');
                    caption.className = 'sr-only';
                    caption.textContent = 'Data table';
                    table.insertBefore(caption, table.firstChild);
                }
            });

            Logger.debug('✓ Tables enhanced');
        },

        // ----------------------------------------
        // BUTTONS
        // ----------------------------------------
        enhanceButtons() {
            // Icon-only buttons
            document.querySelectorAll('button').forEach(button => {
                const text = button.textContent.trim();
                const hasIcon = button.querySelector('i, .icon, svg');

                if (!text && hasIcon) {
                    const iconClass = hasIcon.className || '';
                    let label = 'Action';

                    // Try to infer label from icon class
                    if (iconClass.includes('edit')) label = 'Edit';
                    else if (iconClass.includes('delete') || iconClass.includes('trash')) label = 'Delete';
                    else if (iconClass.includes('add') || iconClass.includes('plus')) label = 'Add';
                    else if (iconClass.includes('close') || iconClass.includes('times')) label = 'Close';
                    else if (iconClass.includes('save')) label = 'Save';
                    else if (iconClass.includes('search')) label = 'Search';
                    else if (iconClass.includes('settings')) label = 'Settings';

                    button.setAttribute('aria-label', button.getAttribute('title') || label);
                }
            });

            Logger.debug('✓ Buttons enhanced');
        },

        // ----------------------------------------
        // ANNOUNCEMENTS
        // ----------------------------------------
        addAnnouncements() {
            // Listen for dynamic content changes
            if (typeof MutationObserver !== 'undefined') {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                // Check for alerts
                                if (node.classList && node.classList.contains('alert')) {
                                    this.announce(node.textContent);
                                }
                                // Check for toasts
                                if (node.classList && node.classList.contains('toast')) {
                                    this.announce(node.textContent);
                                }
                            }
                        });
                    });
                });

                observer.observe(document.body, { childList: true, subtree: true });
            }
        },

        // ----------------------------------------
        // UTILITY METHODS
        // ----------------------------------------
        /**
         * Check if element is visible
         */
        isVisible(element) {
            return element.offsetParent !== null &&
                   !element.hidden &&
                   getComputedStyle(element).visibility !== 'hidden';
        },

        /**
         * Get focusable elements in container
         */
        getFocusableElements(container) {
            const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
            return Array.from(container.querySelectorAll(selector)).filter(el => this.isVisible(el));
        },

        /**
         * Trap focus in container
         */
        trapFocus(container) {
            const focusableElements = this.getFocusableElements(container);
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            const handleKeydown = (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey && document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    } else if (!e.shiftKey && document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            };

            container.addEventListener('keydown', handleKeydown);
            return () => container.removeEventListener('keydown', handleKeydown);
        }
    };

    // ============================================
    // COLOR CONTRAST MANAGER
    // ============================================
    const ColorContrastManager = {
        /**
         * Check if colors meet WCAG contrast requirements
         */
        checkContrast(foreground, background, level = 'AA') {
            const fg = this.parseColor(foreground);
            const bg = this.parseColor(background);
            const ratio = this.getContrastRatio(fg, bg);

            const requirements = {
                'AA': { normal: 4.5, large: 3 },
                'AAA': { normal: 7, large: 4.5 }
            };

            const req = requirements[level] || requirements['AA'];
            return {
                ratio: ratio.toFixed(2),
                passes: ratio >= req.normal,
                passesLarge: ratio >= req.large
            };
        },

        parseColor(color) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            return { r, g, b };
        },

        getLuminance({ r, g, b }) {
            const [rs, gs, bs] = [r, g, b].map(c => {
                c = c / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        },

        getContrastRatio(fg, bg) {
            const l1 = this.getLuminance(fg);
            const l2 = this.getLuminance(bg);
            const lighter = Math.max(l1, l2);
            const darker = Math.min(l1, l2);
            return (lighter + 0.05) / (darker + 0.05);
        }
    };

    // ============================================
    // EXPOSE TO GLOBAL SCOPE
    // ============================================
    window.ModalFocusManager = new ModalFocusManager();
    window.AccessibilityManager = AccessibilityManager;
    window.ColorContrastManager = ColorContrastManager;

    // Backward compatibility aliases
    window.AccessibilityEnhancer = AccessibilityManager;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AccessibilityManager.init());
    } else {
        AccessibilityManager.init();
    }

    Logger.debug('✅ Core Accessibility Module loaded');

})();