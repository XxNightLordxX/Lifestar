/**
 * Undo/Redo System for Lifestar Ambulance Scheduling
 * Tracks schedule changes and allows reverting/replaying them
 */

const UndoRedoManager = {
    _undoStack: [],
    _redoStack: [],
    _maxHistory: 50,
    
    /**
     * Record a change that can be undone
     * @param {string} action - Description of the action
     * @param {Object} undoData - Data needed to undo
     * @param {Object} redoData - Data needed to redo
     */
    record(action, undoData, redoData) {
        this._undoStack.push({
            action: action,
            undoData: JSON.parse(JSON.stringify(undoData)),
            redoData: JSON.parse(JSON.stringify(redoData)),
            timestamp: new Date().toISOString()
        });
        
        // Clear redo stack on new action
        this._redoStack = [];
        
        // Limit stack size
        if (this._undoStack.length > this._maxHistory) {
            this._undoStack.shift();
        }
        
        this._updateUI();
    },
    
    /**
     * Undo the last action
     * @returns {Object|null} The undone action or null
     */
    undo() {
        if (this._undoStack.length === 0) {
            if (typeof showToast === 'function') showToast('Nothing to undo', 'info');
            return null;
        }
        
        const entry = this._undoStack.pop();
        this._redoStack.push(entry);
        
        // Apply undo
        this._applyChange(entry.undoData);
        
        if (typeof showToast === 'function') {
            showToast('Undone: ' + entry.action, 'info');
        }
        
        this._updateUI();
        return entry;
    },
    
    /**
     * Redo the last undone action
     * @returns {Object|null} The redone action or null
     */
    redo() {
        if (this._redoStack.length === 0) {
            if (typeof showToast === 'function') showToast('Nothing to redo', 'info');
            return null;
        }
        
        const entry = this._redoStack.pop();
        this._undoStack.push(entry);
        
        // Apply redo
        this._applyChange(entry.redoData);
        
        if (typeof showToast === 'function') {
            showToast('Redone: ' + entry.action, 'info');
        }
        
        this._updateUI();
        return entry;
    },
    
    /**
     * Apply a change to the data store
     * @param {Object} changeData - {type, key, value, scheduleId, ...}
     */
    _applyChange(changeData) {
        try {
            switch (changeData.type) {
                case 'schedule_update':
                    this._applyScheduleUpdate(changeData);
                    break;
                case 'schedule_delete':
                    this._applyScheduleDelete(changeData);
                    break;
                case 'schedule_add':
                    this._applyScheduleAdd(changeData);
                    break;
                case 'crew_update':
                    this._applyCrewUpdate(changeData);
                    break;
                case 'crew_delete':
                    this._applyCrewDelete(changeData);
                    break;
                case 'crew_add':
                    this._applyCrewAdd(changeData);
                    break;
                case 'status_change':
                    this._applyStatusChange(changeData);
                    break;
                default:
                    Logger.warn('[UndoRedo] Unknown change type:', changeData.type);
            }
            
            // Save and refresh
            if (typeof saveData === 'function') saveData();
            
        } catch (error) {
            Logger.error('[UndoRedo] Error applying change:', error.message);
        }
    },
    
    _applyScheduleUpdate(data) {
        if (typeof schedules !== 'undefined' && schedules) {
            const idx = (schedules || []).findIndex(s => s.id === data.scheduleId);
            if (idx !== -1) {
                Object.assign(schedules[idx], data.changes);
            }
        }
    },
    
    _applyScheduleDelete(data) {
        if (typeof schedules !== 'undefined' && schedules && data.schedule) {
            schedules.push(data.schedule);
        }
    },
    
    _applyScheduleAdd(data) {
        if (typeof schedules !== 'undefined' && schedules) {
            const idx = (schedules || []).findIndex(s => s.id === data.scheduleId);
            if (idx !== -1) {
                schedules.splice(idx, 1);
            }
        }
    },
    
    _applyCrewUpdate(data) {
        if (typeof schedules !== 'undefined' && schedules) {
            const schedule = (schedules || []).find(s => s.id === data.scheduleId);
            if (schedule && schedule.crews) {
                const crewIdx = schedule.crews.findIndex(c => c.id === data.crewId);
                if (crewIdx !== -1) {
                    Object.assign(schedule.crews[crewIdx], data.changes);
                }
            }
        }
    },
    
    _applyCrewDelete(data) {
        if (typeof schedules !== 'undefined' && schedules && data.crew) {
            const schedule = (schedules || []).find(s => s.id === data.scheduleId);
            if (schedule) {
                if (!schedule.crews) schedule.crews = [];
                schedule.crews.push(data.crew);
            }
        }
    },
    
    _applyCrewAdd(data) {
        if (typeof schedules !== 'undefined' && schedules) {
            const schedule = (schedules || []).find(s => s.id === data.scheduleId);
            if (schedule && schedule.crews) {
                const idx = schedule.crews.findIndex(c => c.id === data.crewId);
                if (idx !== -1) {
                    schedule.crews.splice(idx, 1);
                }
            }
        }
    },
    
    _applyStatusChange(data) {
        if (typeof schedules !== 'undefined' && schedules) {
            const schedule = (schedules || []).find(s => s.id === data.scheduleId);
            if (schedule) {
                schedule.status = data.status;
            }
        }
    },
    
    /**
     * Update UI elements (undo/redo buttons)
     */
    _updateUI() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        const undoCount = document.getElementById('undoCount');
        const redoCount = document.getElementById('redoCount');
        
        if (undoBtn) undoBtn.disabled = this._undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this._redoStack.length === 0;
        if (undoCount) undoCount.textContent = this._undoStack.length;
        if (redoCount) redoCount.textContent = this._redoStack.length;
    },
    
    /**
     * Check if undo is available
     */
    canUndo() {
        return this._undoStack.length > 0;
    },
    
    /**
     * Check if redo is available
     */
    canRedo() {
        return this._redoStack.length > 0;
    },
    
    /**
     * Get undo/redo history for display
     */
    getHistory() {
        return {
            undo: this._undoStack.map(e => ({ action: e.action, timestamp: e.timestamp })).reverse(),
            redo: this._redoStack.map(e => ({ action: e.action, timestamp: e.timestamp })).reverse()
        };
    },
    
    /**
     * Clear all history
     */
    clear() {
        this._undoStack = [];
        this._redoStack = [];
        this._updateUI();
    }
};

// Keyboard shortcuts: Ctrl+Z = Undo, Ctrl+Shift+Z / Ctrl+Y = Redo
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        UndoRedoManager.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        UndoRedoManager.redo();
    }
});