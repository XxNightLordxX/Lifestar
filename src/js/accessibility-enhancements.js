/**
 * Accessibility Enhancements for Lifestar Ambulance Scheduling System
 * This file adds comprehensive ARIA labels, roles, and accessibility features
 */

(function() {
    'use strict';

    const AccessibilityEnhancer = {
        init: function() {
            this.addAriaLabels();
            this.addRoles();
            this.addKeyboardNavigation();
            this.addFocusManagement();
            this.addAltTags();
            this.addScreenReaderSupport();
            this.addLiveRegions();
            this.enhanceForms();
            this.enhanceButtons();
            this.enhanceModals();
            this.enhanceNavigation();
            Logger.debug('✅ Accessibility Enhancements Applied');
        },

        // Add ARIA labels to all interactive elements
        addAriaLabels: function() {
            // Navigation items
            document.querySelectorAll('.nav-item').forEach((item, index) => {
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
                
                // Add required indication
                if (input.hasAttribute('required')) {
                    input.setAttribute('aria-required', 'true');
                }
            });

            // Dashboard sections
            document.querySelectorAll('.dashboard-section').forEach((section, index) => {
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
                    // Check for icon buttons
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
        },

        // Add ARIA roles to elements
        addRoles: function() {
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
                    modal.setAttribute('aria-labelledby', heading.id || `modal-title-${Math.random().toString(36).substr(2, 9)}`);
                    heading.id = modal.getAttribute('aria-labelledby');
                }
            });

            // Lists
            document.querySelectorAll('ul, ol').forEach(list => {
                list.setAttribute('role', 'list');
            });

            document.querySelectorAll('li').forEach(item => {
                item.setAttribute('role', 'listitem');
            });
        },

        // Add keyboard navigation support
        addKeyboardNavigation: function() {
            // Make nav items keyboard accessible
            document.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        item.click();
                    }
                });
            });

            // Add focus trap to modals
            document.querySelectorAll('.modal').forEach(modal => {
                this.addFocusTrap(modal);
            });

            // Add escape key handler for closing modals
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    // Close any open modals
                    if (typeof closeModal === 'function') {
                        closeModal();
                    }
                    // Close any open dropdowns
                    document.querySelectorAll('.dropdown.open').forEach(dropdown => {
                        dropdown.classList.remove('open');
                    });
                }
            });

            // Add tab index to interactive elements
            document.querySelectorAll('.clickable, .selectable, [onclick]').forEach(el => {
                if (!el.hasAttribute('tabindex')) {
                    el.setAttribute('tabindex', '0');
                }
            });

            // Add focus-visible class for better focus styles
            document.body.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    document.body.classList.add('keyboard-navigation');
                }
            });

            document.body.addEventListener('mousedown', () => {
                document.body.classList.remove('keyboard-navigation');
            });
        },

        // Add focus management
        addFocusManagement: function() {
            // Store last focused element before modal opens
            window.lastFocusedElement = null;

            // Override showModal if it exists
            const originalShowModal = window.showModal;
            if (typeof originalShowModal === 'function') {
                window.showModal = function(modalId) {
                    window.lastFocusedElement = document.activeElement;
                    const result = originalShowModal(modalId);
                    const modal = document.getElementById(modalId);
                    if (modal) {
                        const firstFocusable = modal.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
                        if (firstFocusable) {
                            setTimeout(() => firstFocusable.focus(), 100);
                        }
                    }
                    return result;
                };
            }

            // Add focus indicators
            const style = document.createElement('style');
            style.textContent = `
                .keyboard-navigation *:focus {
                    outline: 3px solid #dc3545 !important;
                    outline-offset: 2px !important;
                }
                .focus-visible:focus {
                    outline: 3px solid #dc3545 !important;
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
            `;
            document.head.appendChild(style);
        },

        // Add alt tags to images
        addAltTags: function() {
            document.querySelectorAll('img:not([alt])').forEach(img => {
                const src = img.src || '';
                const filename = src.split('/').pop().split('.')[0];
                img.alt = filename.replace(/[-_]/g, ' ') || 'Image';
            });

            // Add aria-hidden to decorative images
            document.querySelectorAll('.logo img, .sidebar-logo img').forEach(img => {
                if (!img.alt || img.alt.toLowerCase().includes('logo')) {
                    img.setAttribute('role', 'presentation');
                }
            });
        },

        // Add screen reader support
        addScreenReaderSupport: function() {
            // Add visually hidden text for screen readers
            const srOnlyStyle = document.createElement('style');
            srOnlyStyle.textContent = `
                .sr-only {
                    position: absolute !important;
                    width: 1px !important;
                    height: 1px !important;
                    padding: 0 !important;
                    margin: -1px !important;
                    overflow: hidden !important;
                    clip: rect(0, 0, 0, 0) !important;
                    white-space: nowrap !important;
                    border: 0 !important;
                }
                .sr-only-focusable:focus,
                .sr-only-focusable:active {
                    position: static !important;
                    width: auto !important;
                    height: auto !important;
                    overflow: visible !important;
                    clip: auto !important;
                    white-space: normal !important;
                }
            `;
            document.head.appendChild(srOnlyStyle);

            // Add screen reader announcements for dynamic content
            const announcer = document.createElement('div');
            announcer.id = 'sr-announcer';
            announcer.className = 'sr-only';
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            document.body.appendChild(announcer);

            // Create announce function
            window.announceForScreenReader = function(message) {
                const announcer = document.getElementById('sr-announcer');
                if (announcer) {
                    announcer.textContent = '';
                    setTimeout(() => {
                        announcer.textContent = message;
                    }, 100);
                }
            };

            // Hook into showAlert to announce messages
            const originalShowAlert = window.showAlert;
            if (typeof originalShowAlert === 'function') {
                window.showAlert = function(message, type, alertId) {
                    if (window.announceForScreenReader) {
                        window.announceForScreenReader(`${type || 'Info'}: ${message}`);
                    }
                    return originalShowAlert(message, type, alertId);
                };
            }
        },

        // Add ARIA live regions for dynamic content
        addLiveRegions: function() {
            // Add live region to main content area
            const mainContent = document.querySelector('#main-content, .main-content, main');
            if (mainContent) {
                mainContent.setAttribute('aria-live', 'polite');
            }

            // Add live regions to dynamic containers
            document.querySelectorAll('[data-dynamic], .dynamic-content, .ajax-content').forEach(container => {
                container.setAttribute('aria-live', 'polite');
                container.setAttribute('aria-busy', 'false');
            });

            // Add live region for notifications
            const notificationArea = document.querySelector('.notification-center, #notificationCenter');
            if (notificationArea) {
                notificationArea.setAttribute('aria-live', 'polite');
            }
        },

        // Enhance form accessibility
        enhanceForms: function() {
            document.querySelectorAll('form').forEach(form => {
                // Add form novalidate to allow custom validation messages
                form.setAttribute('novalidate', '');

                // Add aria-describedby to inputs with error messages
                form.querySelectorAll('input, select, textarea').forEach(input => {
                    const errorId = `${input.id}-error`;
                    const errorElement = document.getElementById(errorId);
                    if (errorElement) {
                        input.setAttribute('aria-describedby', errorId);
                        errorElement.setAttribute('role', 'alert');
                    }
                });

                // Add form validation feedback
                form.addEventListener('invalid', (e) => {
                    const input = e.target;
                    input.setAttribute('aria-invalid', 'true');
                    input.classList.add('input-error');
                    
                    // Create or update error message
                    let errorEl = document.getElementById(`${input.id}-error`);
                    if (!errorEl) {
                        errorEl = document.createElement('div');
                        errorEl.id = `${input.id}-error`;
                        errorEl.className = 'error-message';
                        errorEl.setAttribute('role', 'alert');
                        input.parentNode.appendChild(errorEl);
                    }
                    errorEl.textContent = input.validationMessage;
                }, true);

                form.addEventListener('input', (e) => {
                    const input = e.target;
                    if (input.validity.valid) {
                        input.removeAttribute('aria-invalid');
                        input.classList.remove('input-error');
                        const errorEl = document.getElementById(`${input.id}-error`);
                        if (errorEl) errorEl.textContent = '';
                    }
                });
            });

            // Add fieldset and legend to grouped inputs
            document.querySelectorAll('.form-group').forEach((group, index) => {
                if (group.querySelectorAll('input, select').length > 1) {
                    if (!group.querySelector('fieldset')) {
                        const fieldset = document.createElement('fieldset');
                        const legend = document.createElement('legend');
                        const label = group.querySelector('label');
                        if (label) {
                            legend.textContent = label.textContent;
                            label.style.display = 'none';
                        }
                        fieldset.appendChild(legend);
                        while (group.firstChild) {
                            fieldset.appendChild(group.firstChild);
                        }
                        group.appendChild(fieldset);
                    }
                }
            });
        },

        // Enhance button accessibility
        enhanceButtons: function() {
            document.querySelectorAll('button').forEach(button => {
                // Add type if not specified
                if (!button.hasAttribute('type')) {
                    button.setAttribute('type', 'button');
                }

                // Add disabled state indication
                if (button.disabled) {
                    button.setAttribute('aria-disabled', 'true');
                }

                // Add loading state support
                const originalButtonContent = new WeakMap();
                window.setButtonLoading = function(button, isLoading) {
                    if (isLoading) {
                        originalButtonContent.set(button, button.innerHTML);
                        button.disabled = true;
                        button.setAttribute('aria-busy', 'true');
                        button.innerHTML = '<span class="sr-only">Loading...</span>⏳';
                    } else {
                        button.disabled = false;
                        button.removeAttribute('aria-busy');
                        const original = originalButtonContent.get(button);
                        if (original) button.textContent = original;
                    }
                };
            });
        },

        // Enhance modal accessibility
        enhanceModals: function() {
            document.querySelectorAll('.modal').forEach(modal => {
                // Ensure modals have proper accessibility attributes
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-hidden', 'true');

                // Add close button with label
                const closeBtn = modal.querySelector('.modal-close, .close');
                if (closeBtn) {
                    closeBtn.setAttribute('aria-label', 'Close dialog');
                    closeBtn.setAttribute('type', 'button');
                }
            });
        },

        // Enhance navigation accessibility
        enhanceNavigation: function() {
            // Add landmark regions
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.setAttribute('aria-label', 'Main navigation');
            }

            const header = document.querySelector('.header, header');
            if (header) {
                header.setAttribute('role', 'banner');
            }

            const footer = document.querySelector('.footer, footer');
            if (footer) {
                footer.setAttribute('role', 'contentinfo');
            }

            // Indicate current page in navigation
            document.querySelectorAll('.nav-item').forEach(item => {
                if (item.classList.contains('active')) {
                    item.setAttribute('aria-current', 'page');
                } else {
                    item.removeAttribute('aria-current');
                }
            });

            // Observe navigation changes
            const observer = new MutationObserver(() => {
                document.querySelectorAll('.nav-item').forEach(item => {
                    if (item.classList.contains('active')) {
                        item.setAttribute('aria-current', 'page');
                    } else {
                        item.removeAttribute('aria-current');
                    }
                });
            });

            document.querySelectorAll('.sidebar-nav').forEach(nav => {
                observer.observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
            });
        },

        // Focus trap implementation
        addFocusTrap: function(element) {
            const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
            
            element.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;

                const focusableElements = element.querySelectorAll(focusableSelector);
                const firstFocusable = focusableElements[0];
                const lastFocusable = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        lastFocusable.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        firstFocusable.focus();
                        e.preventDefault();
                    }
                }
            });
        }
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AccessibilityEnhancer.init());
    } else {
        AccessibilityEnhancer.init();
    }

    // Re-run after dynamic content loads
    window.addEventListener('load', () => AccessibilityEnhancer.init());

    // Export for module use
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AccessibilityEnhancer;
    }
})();