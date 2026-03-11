/**
 * Keyboard Shortcuts System
 * Configurable keyboard shortcuts for power users
 */

class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.enabled = true;
        this.activeContext = 'global';
        this.registerDefaults();
    }

    /**
     * Register default shortcuts
     */
    registerDefaults() {
        // Navigation
        this.register('ctrl+h', 'global', () => this.navigate('dashboard'), 'Go to Dashboard');
        this.register('ctrl+s', 'global', () => this.save(), 'Save current changes');
        this.register('ctrl+shift+s', 'global', () => this.saveAll(), 'Save all changes');
        this.register('ctrl+f', 'global', () => this.openSearch(), 'Open search');
        this.register('ctrl+n', 'global', () => this.createNew(), 'Create new item');
        this.register('escape', 'global', () => this.closeModal(), 'Close modal/dialog');
        this.register('ctrl+z', 'global', () => this.undo(), 'Undo last action');
        this.register('ctrl+shift+z', 'global', () => this.redo(), 'Redo last action');
        this.register('ctrl+p', 'global', () => this.print(), 'Print current view');
        this.register('ctrl+e', 'global', () => this.export(), 'Export data');
        this.register('?', 'global', () => this.showHelp(), 'Show keyboard shortcuts');

        // Schedule shortcuts
        this.register('left', 'schedule', () => this.previousDay(), 'Previous day');
        this.register('right', 'schedule', () => this.nextDay(), 'Next day');
        this.register('up', 'schedule', () => this.previousWeek(), 'Previous week');
        this.register('down', 'schedule', () => this.nextWeek(), 'Next week');
        this.register('t', 'schedule', () => this.goToToday(), 'Go to today');
        this.register('enter', 'schedule', () => this.editSelected(), 'Edit selected shift');
        this.register('delete', 'schedule', () => this.deleteSelected(), 'Delete selected shift');
    }

    /**
     * Register a keyboard shortcut
     * @param {string} keys - Key combination (e.g., 'ctrl+s')
     * @param {string} context - Context (global, schedule, etc.)
     * @param {Function} handler - Handler function
     * @param {string} description - Description
     */
    register(keys, context, handler, description) {
        const id = context + ':' + keys;
        this.shortcuts.set(id, { keys, context, handler, description });
    }

    /**
     * Initialize keyboard listener
     */
    init() {
        if(typeof document === 'undefined') return;

        document.addEventListener('keydown', (e) => {
            if(!this.enabled) return;

            // Don't trigger in input fields
            if(['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                if(e.key !== 'Escape') return;
            }

            const keys = this.getKeyCombo(e);

            // Check context-specific shortcuts first
            const contextId = this.activeContext + ':' + keys;
            const globalId = 'global:' + keys;

            const shortcut = this.shortcuts.get(contextId) || this.shortcuts.get(globalId);

            if(shortcut) {
                e.preventDefault();
                shortcut.handler();
            }
        });
    }

    /**
     * Get key combination string from event
     * @param {KeyboardEvent} e - Keyboard event
     * @returns {string} Key combination
     */
    getKeyCombo(e) {
        const parts = [];
        if(e.ctrlKey || e.metaKey) parts.push('ctrl');
        if(e.shiftKey) parts.push('shift');
        if(e.altKey) parts.push('alt');
        parts.push(e.key.toLowerCase());
        return parts.join('+');
    }

    /**
     * Get all shortcuts for display
     * @returns {Array} Shortcuts list
     */
    getAll() {
        const result = [];
        for(const [id, shortcut] of this.shortcuts) {
            result.push({
                keys: shortcut.keys,
                context: shortcut.context,
                description: shortcut.description
            });
        }
        return result;
    }

    /**
     * Show help dialog with all shortcuts
     */
    showHelp() {
        if(typeof document === 'undefined') return;

        const shortcuts = this.getAll();
        let html = '<div class="shortcuts-help"><h2>Keyboard Shortcuts</h2><table>';
        html += '<tr><th>Shortcut</th><th>Action</th><th>Context</th></tr>';

        shortcuts.forEach(s => {
            html += '<tr><td><kbd>' + s.keys + '</kbd></td>';
            html += '<td>' + s.description + '</td>';
            html += '<td>' + s.context + '</td></tr>';
        });

        html += '</table></div>';

        // Show in modal
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = '<div class="modal-content">' + html + '</div>';
        modal.addEventListener('click', (e) => {
            if(e.target === modal) modal.remove();
        });
        document.body.appendChild(modal);
    }

    // Placeholder action methods
    navigate(page) { Logger.debug('Navigate to:', page); }
    save() { Logger.debug('Save'); }
    saveAll() { Logger.debug('Save all'); }
    openSearch() { Logger.debug('Open search'); }
    createNew() { Logger.debug('Create new'); }
    closeModal() {
        if(typeof document !== 'undefined') {
            const modal = document.querySelector('.modal.active');
            if(modal) modal.classList.remove('active');
        }
    }
    undo() { Logger.debug('Undo'); }
    redo() { Logger.debug('Redo'); }
    print() { if(typeof window !== 'undefined') window.print(); }
    export() { Logger.debug('Export'); }
    previousDay() { Logger.debug('Previous day'); }
    nextDay() { Logger.debug('Next day'); }
    previousWeek() { Logger.debug('Previous week'); }
    nextWeek() { Logger.debug('Next week'); }
    goToToday() { Logger.debug('Go to today'); }
    editSelected() { Logger.debug('Edit selected'); }
    deleteSelected() { Logger.debug('Delete selected'); }
}
