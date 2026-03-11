/**
 * Modal Focus Management System
 * Implements proper focus trapping and management for modals
 * Compliant with WCAG 2.1 AA requirements
 */

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
    }

    /**
     * Open a modal with proper focus management
     * @param {HTMLElement} modal - Modal element
     */
    openModal(modal) {
        if(!modal) return;

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
        if(focusableElements.length > 0) {
            // Prefer close button first
            const closeBtn = modal.querySelector('.close-btn, [data-dismiss="modal"]');
            if(closeBtn) {
                closeBtn.focus();
            } else {
                focusableElements[0].focus();
            }
        }

        // Add focus trap
        this.addFocusTrap(modal);

        // Add escape key handler
        this.addEscapeHandler(modal);

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close a modal with proper focus restoration
     * @param {HTMLElement} modal - Modal element
     */
    closeModal(modal) {
        if(!modal) return;

        // Hide modal
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');

        // Remove focus trap
        this.removeFocusTrap(modal);

        // Restore previous focus
        if(this.previousFocus && this.previousFocus.focus) {
            this.previousFocus.focus();
        }

        this.activeModal = null;
        this.previousFocus = null;

        // Restore body scroll
        document.body.style.overflow = '';
    }

    /**
     * Get all focusable elements within a container
     * @param {HTMLElement} container - Container element
     * @returns {Array} Array of focusable elements
     */
    getFocusableElements(container) {
        return Array.from(container.querySelectorAll(this.focusableSelectors));
            .filter(el => {
                return el.offsetParent !== null && // visible;
                       !el.hasAttribute('disabled') &&
                       el.tabIndex >= 0;
            });
    }

    /**
     * Add focus trap to modal
     * @param {HTMLElement} modal - Modal element
     */
    addFocusTrap(modal) {
        modal._focusTrapHandler = (e) => {
            if(e.key !== 'Tab') return;

            const focusableElements = this.getFocusableElements(modal);
            if(focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if(e.shiftKey) {
                // Shift+Tab: if on first element, go to last
                if(document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                // Tab: if on last element, go to first
                if(document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };

        modal.addEventListener('keydown', modal._focusTrapHandler);
    }

    /**
     * Remove focus trap from modal
     * @param {HTMLElement} modal - Modal element
     */
    removeFocusTrap(modal) {
        if(modal._focusTrapHandler) {
            modal.removeEventListener('keydown', modal._focusTrapHandler);
            delete modal._focusTrapHandler;
        }
    }

    /**
     * Add escape key handler
     * @param {HTMLElement} modal - Modal element
     */
    addEscapeHandler(modal) {
        modal._escapeHandler = (e) => {
            if(e.key === 'Escape') {
                this.closeModal(modal);
            }
        };

        document.addEventListener('keydown', modal._escapeHandler);
    }

    /**
     * Announce modal to screen readers
     * @param {string} message - Message to announce
     */
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
        announcement.textContent = message;
        document.body.appendChild(announcement);

        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 3000);
    }
}

// Export singleton
const modalFocusManager = new ModalFocusManager();
