/**
 * Core UI Module - Consolidated UI functions
 * Central module for all shared UI components and interactions
 * @module core-ui
 * @version 2.0.0
 */

'use strict';

// ========================================
// MODAL MANAGEMENT (Consolidated)
// ========================================

const ModalManager = (function() {
    const openModals = new Set();
    let initialized = false;

    function init() {
        if (initialized) return;
        initialized = true;

        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && openModals.size > 0) {
                const lastModal = Array.from(openModals).pop();
                close(lastModal);
            }
        });

        // Close modal on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                close(e.target.id);
            }
        });

        // Initialize close buttons
        document.querySelectorAll('.modal .close, .modal [data-dismiss="modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) close(modal.id);
            });
        });
    }

    function show(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            Logger.warn(`[Modal] Not found: ${modalId}`);
            return false;
        }

        // Initialize on first use
        init();

        // Show modal
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        
        // Track open modals
        openModals.add(modalId);

        // Focus management for accessibility
        const focusable = modal.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) {
            setTimeout(() => focusable.focus(), 100);
        }

        // Trap focus within modal
        trapFocus(modal);

        // Dispatch event
        modal.dispatchEvent(new CustomEvent('modal:show', { detail: { modalId } }));

        return true;
    }

    function close(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return false;

        modal.classList.add('hidden');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');

        openModals.delete(modalId);

        // Dispatch event
        modal.dispatchEvent(new CustomEvent('modal:close', { detail: { modalId } }));

        return true;
    }

    function closeAll() {
        openModals.forEach(modalId => close(modalId));
    }

    function isOpen(modalId) {
        return openModals.has(modalId);
    }

    function trapFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        modal.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;

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

    return {
        show,
        close,
        closeAll,
        isOpen,
        init
    };
})();

// ========================================
// ALERT/NOTIFICATION SYSTEM (Consolidated)
// ========================================

const AlertManager = (function() {
    let container = null;
    const alertQueue = [];
    const MAX_VISIBLE = 3;
    const DEFAULT_DURATION = 5000;

    const TYPES = {
        success: { icon: '✓', class: 'alert-success' },
        info: { icon: 'ℹ', class: 'alert-info' },
        warning: { icon: '⚠', class: 'alert-warning' },
        danger: { icon: '✗', class: 'alert-danger' },
        error: { icon: '✗', class: 'alert-danger' }
    };

    function ensureContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'alert-container';
            container.className = 'alert-container';
            container.setAttribute('role', 'alert');
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        return container;
    }

    function show(message, type = 'info', options = {}) {
        const {
            duration = DEFAULT_DURATION,
            dismissible = true,
            id = null,
            icon = null
        } = options;

        const container = ensureContainer();
        const typeConfig = TYPES[type] || TYPES.info;

        // Create alert element
        const alert = document.createElement('div');
        alert.className = `alert ${typeConfig.class}`;
        if (id) alert.id = id;
        
        const escapedMessage = typeof sanitizeHTML === 'function' ? sanitizeHTML(message) : message.replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
        alert.innerHTML = `
            <span class="alert-icon" aria-hidden="true">${icon || typeConfig.icon}</span>
            <span class="alert-message">${escapedMessage}</span>
            ${dismissible ? '<button class="alert-close" aria-label="Close">×</button>' : ''}
        `;

        // Close button handler
        const closeBtn = alert.querySelector('.alert-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => dismiss(alert));
        }

        // Add to container
        container.appendChild(alert);

        // Animate in
        requestAnimationFrame(() => {
            alert.classList.add('show');
        });

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => dismiss(alert), duration);
        }

        // Limit visible alerts
        while (container.children.length > MAX_VISIBLE) {
            dismiss(container.firstChild);
        }

        return alert;
    }

    function dismiss(alert) {
        if (!alert || !alert.parentNode) return;

        alert.classList.remove('show');
        alert.classList.add('hiding');

        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 300);
    }

    function clearAll() {
        if (container) {
            container.innerHTML = '';
        }
    }

    // Convenience methods
    const success = (msg, opts = {}) => show(msg, 'success', opts);
    const info = (msg, opts = {}) => show(msg, 'info', opts);
    const warning = (msg, opts = {}) => show(msg, 'warning', opts);
    const error = (msg, opts = {}) => show(msg, 'error', opts);
    const danger = (msg, opts = {}) => show(msg, 'danger', opts);

    return {
        show,
        dismiss,
        clearAll,
        success,
        info,
        warning,
        error,
        danger
    };
})();

// ========================================
// TOAST NOTIFICATIONS
// ========================================

const ToastManager = (function() {
    let container = null;
    const DEFAULT_DURATION = 3000;

    function ensureContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            container.setAttribute('role', 'status');
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        return container;
    }

    function show(message, type = 'info', duration = DEFAULT_DURATION) {
        const container = ensureContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close">×</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => dismiss(toast));

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        if (duration > 0) {
            setTimeout(() => dismiss(toast), duration);
        }

        return toast;
    }

    function dismiss(toast) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }

    return { show, dismiss };
})();

// ========================================
// CONFIRMATION DIALOG
// ========================================

const ConfirmDialog = (function() {
    function show(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirm',
                message = 'Are you sure?',
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                type = 'warning',
                confirmClass = 'btn-primary'
            } = options;

            const dialogId = `confirm-${Date.now()}`;
            const dialog = document.createElement('div');
            dialog.id = dialogId;
            dialog.className = 'modal confirm-dialog';
            dialog.setAttribute('role', 'alertdialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', `${dialogId}-title`);
            dialog.setAttribute('aria-describedby', `${dialogId}-message`);

            dialog.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="${dialogId}-title">${title}</h3>
                    </div>
                    <div class="modal-body">
                        <p id="${dialogId}-message">${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
                        <button class="btn ${confirmClass}" data-action="confirm">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            const closeModal = (result) => {
                ModalManager.close(dialogId);
                setTimeout(() => dialog.remove(), 300);
                resolve(result);
            };

            dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => closeModal(true));
            dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(false));

            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    closeModal(false);
                }
            };
            document.addEventListener('keydown', handleEscape);

            ModalManager.show(dialogId);
        });
    }

    return { show };
})();

// ========================================
// LOADING STATE MANAGEMENT
// ========================================

const LoadingManager = (function() {
    const loadingStates = new Map();
    let globalOverlay = null;

    function showGlobal(message = 'Loading...') {
        if (!globalOverlay) {
            globalOverlay = document.createElement('div');
            globalOverlay.id = 'global-loading';
            globalOverlay.className = 'loading-overlay';
            globalOverlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-message">${message}</div>
            `;
        } else {
            globalOverlay.querySelector('.loading-message').textContent = message;
        }

        document.body.appendChild(globalOverlay);
        document.body.classList.add('loading');

        return globalOverlay;
    }

    function hideGlobal() {
        if (globalOverlay && globalOverlay.parentNode) {
            globalOverlay.remove();
            document.body.classList.remove('loading');
        }
    }

    function show(elementId, message = null) {
        const element = document.getElementById(elementId);
        if (!element) return null;

        // Store original content
        loadingStates.set(elementId, {
            originalHTML: element.innerHTML,
            originalDisabled: element.disabled
        });

        // Show loading state
        element.disabled = true;
        element.classList.add('loading');
        
        if (message) {
            element.innerHTML = `<span class="loading-spinner-small"></span> ${message}`;
        }

        return element;
    }

    function hide(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const state = loadingStates.get(elementId);
        if (state) {
            element.innerHTML = state.originalHTML;
            element.disabled = state.originalDisabled;
            element.classList.remove('loading');
            loadingStates.delete(elementId);
        }
    }

    function isLoading(elementId) {
        return loadingStates.has(elementId);
    }

    return {
        showGlobal,
        hideGlobal,
        show,
        hide,
        isLoading
    };
})();

// ========================================
// DROPDOWN MANAGEMENT
// ========================================

const DropdownManager = (function() {
    const openDropdowns = new Set();

    function init() {
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                closeAll();
            }
        });

        // Initialize dropdown toggles
        document.querySelectorAll('[data-dropdown]').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggle(toggle.dataset.dropdown);
            });
        });
    }

    function toggle(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        if (openDropdowns.has(dropdownId)) {
            close(dropdownId);
        } else {
            open(dropdownId);
        }
    }

    function open(dropdownId) {
        closeAll();
        
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        dropdown.classList.add('open');
        dropdown.setAttribute('aria-expanded', 'true');
        openDropdowns.add(dropdownId);
    }

    function close(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        dropdown.classList.remove('open');
        dropdown.setAttribute('aria-expanded', 'false');
        openDropdowns.delete(dropdownId);
    }

    function closeAll() {
        openDropdowns.forEach(id => close(id));
    }

    return { init, toggle, open, close, closeAll };
})();

// ========================================
// TAB MANAGEMENT
// ========================================

const TabManager = (function() {
    function init(container = document) {
        container.querySelectorAll('.tab-container').forEach(tabContainer => {
            const tabs = tabContainer.querySelectorAll('.tab-button');
            const panels = tabContainer.querySelectorAll('.tab-panel');

            tabs.forEach((tab, index) => {
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-selected', index === 0);
                tab.setAttribute('tabindex', index === 0 ? '0' : '-1');

                if (!tab.id) {
                    tab.id = `tab-${StringUtils.randomId()}`;
                }

                const panel = panels[index];
                if (panel) {
                    panel.setAttribute('role', 'tabpanel');
                    panel.setAttribute('aria-labelledby', tab.id);
                    panel.setAttribute('tabindex', '0');
                    panel.classList.toggle('active', index === 0);
                }

                tab.addEventListener('click', () => selectTab(tabContainer, tab));
                tab.addEventListener('keydown', handleKeyNavigation);
            });
        });
    }

    function selectTab(container, selectedTab) {
        const tabs = container.querySelectorAll('.tab-button');
        const panels = container.querySelectorAll('.tab-panel');

        tabs.forEach((tab, index) => {
            const isSelected = tab === selectedTab;
            tab.classList.toggle('active', isSelected);
            tab.setAttribute('aria-selected', isSelected);
            tab.setAttribute('tabindex', isSelected ? '0' : '-1');

            if (panels[index]) {
                panels[index].classList.toggle('active', isSelected);
            }
        });
    }

    function handleKeyNavigation(e) {
        const tabs = Array.from(e.target.closest('.tab-list').querySelectorAll('.tab-button'));
        const currentIndex = tabs.indexOf(e.target);

        let newIndex;
        switch (e.key) {
            case 'ArrowLeft':
                newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                break;
            case 'ArrowRight':
                newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'Home':
                newIndex = 0;
                break;
            case 'End':
                newIndex = tabs.length - 1;
                break;
            default:
                return;
        }

        e.preventDefault();
        tabs[newIndex].focus();
        selectTab(e.target.closest('.tab-container'), tabs[newIndex]);
    }

    return { init, selectTab };
})();

// ========================================
// TABLE UTILITIES
// ========================================

const TableUtils = {
    /**
     * Sort table by column
     */
    sort(table, columnIndex, type = 'string', desc = false) {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        rows.sort((a, b) => {
            let aVal = a.cells[columnIndex]?.textContent.trim() || '';
            let bVal = b.cells[columnIndex]?.textContent.trim() || '';

            if (type === 'number') {
                aVal = parseFloat(aVal) || 0;
                bVal = parseFloat(bVal) || 0;
            } else if (type === 'date') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }

            if (aVal < bVal) return desc ? 1 : -1;
            if (aVal > bVal) return desc ? -1 : 1;
            return 0;
        });

        rows.forEach(row => tbody.appendChild(row));
    },

    /**
     * Filter table rows
     */
    filter(table, searchTerm, columns = null) {
        const tbody = table.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        const term = searchTerm.toLowerCase();

        rows.forEach(row => {
            let match = false;
            const cells = columns 
                ? columns.map(i => row.cells[i]).filter(Boolean)
                : row.cells;

            cells.forEach(cell => {
                if (cell.textContent.toLowerCase().includes(term)) {
                    match = true;
                }
            });

            row.style.display = match ? '' : 'none';
        });
    },

    /**
     * Paginate table
     */
    paginate(table, page, perPage = 10) {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const start = (page - 1) * perPage;
        const end = start + perPage;

        rows.forEach((row, index) => {
            row.style.display = (index >= start && index < end) ? '' : 'none';
        });

        return {
            currentPage: page,
            totalPages: Math.ceil(rows.length / perPage),
            totalRows: rows.length
        };
    }
};

// NOTE: showModal, closeModal, openModal, showAlert are defined in app.js with richer
// implementations (staff dropdown population, inline alertId mode). Those load after
// this file and take precedence. ModalManager / AlertManager are still available
// directly for any code that needs the full manager API.
function showLoading(elementId, message = null) {
    return LoadingManager.show(elementId, message);
}

function hideLoading(elementId) {
    return LoadingManager.hide(elementId);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ModalManager,
        AlertManager,
        ToastManager,
        ConfirmDialog,
        LoadingManager,
        DropdownManager,
        TabManager,
        TableUtils,
        showModal,
        closeModal,
        openModal,
        showAlert,
        showLoading,
        hideLoading
    };
}