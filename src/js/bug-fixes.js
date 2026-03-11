// ============================================
// BUG FIXES AND IMPROVEMENTS
// Only contains unique utilities that don't
// conflict with app.js core functions
// ============================================

// ============================================
// Utility: Safe execution wrapper
// ============================================

function safeExecute(fn, errorMessage = 'Operation failed') {
    try {
        return fn();
    } catch (error) {
        Logger.error(errorMessage, error);
        if(typeof showAlert === 'function') {
            showAlert(errorMessage + ': ' + error.message, 'error');
        }
        if(typeof addSystemLog === 'function') {
            addSystemLog('Error: ' + errorMessage);
        }
        return null;
    }
}

// ============================================
// Utility: Null-safe data access
// ============================================

function safeGet(object, path, defaultValue = null) {
    return path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : defaultValue, object);
}

// ============================================
// Utility: Form validation
// ============================================

function validateForm(formId) {
    try {
        const form = document.getElementById(formId);
        if(!form) {
            Logger.error('Form ' + formId + ' not found');
            return false;
        }

        const requiredFields = form.querySelectorAll('[required]');
        let isValid = true;
        let firstInvalid = null;

        requiredFields.forEach(field => {
            if(!field.value.trim()) {
                isValid = false;
                field.classList.add('validation-invalid');
                if(!firstInvalid) firstInvalid = field;
            } else {
                field.classList.remove('validation-invalid');
                field.classList.add('validation-valid');
            }
        });

        if(firstInvalid) {
            firstInvalid.focus();
            showAlert('Please fill in all required fields', 'error');
        }

        return isValid;
    } catch (error) {
        Logger.error('[validateForm] Error:', error.message || error);
        return false;
    }
}

// ============================================
// Utility: Close all modals
// ============================================

function closeAllModals() {
    try {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            modal.classList.remove('active');
        });

        document.querySelectorAll('.dashboard').forEach(d => {
            d.removeAttribute('aria-hidden');
        });
    } catch (error) {
        Logger.error('[closeAllModals] Error:', error.message || error);
    }
}

// ============================================
// Utility: Debounce helper
// ============================================

// debounce is defined in helper-functions.js

// ============================================
// Utility: Lazy load for large datasets
// ============================================

function lazyLoadData(containerId, items, renderItem, batchSize = 20) {
    try {
        const container = document.getElementById(containerId);
        if(!container) return;

        container.textContent = '';

        let currentIndex = 0;

        const loadBatch = function() {
            const fragment = document.createDocumentFragment();
            const endIndex = Math.min(currentIndex + batchSize, items.length);

            for(let i = currentIndex; i < endIndex; i++) {
                const item = renderItem(items[i]);
                if(item) {
                    fragment.appendChild(item);
                }
            }

            container.appendChild(fragment);
            currentIndex = endIndex;

            if(currentIndex < items.length) {
                requestAnimationFrame(loadBatch);
            }
        }

        loadBatch();
    } catch (error) {
        Logger.error('[lazyLoadData] Error:', error.message || error);
    }
}

// ============================================
// Utility: Screen reader announcements
// ============================================

function announceToScreenReader(message) {
    try {
        let announcer = document.getElementById('screenReaderAnnouncer');
        if(!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'screenReaderAnnouncer';
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            announcer.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
            document.body.appendChild(announcer);
        }
        announcer.textContent = '';
        setTimeout(() => {
            announcer.textContent = message;
        }, 100);
    } catch (error) {
        Logger.error('[announceToScreenReader] Error:', error.message || error);
    }
}

// ============================================
// Utility: Error boundary wrapper
// ============================================

function withErrorBoundary(fn, fallback) {
    return function(...args) {
        try {
            return fn.apply(this, args);
        } catch (error) {
            Logger.error('Error in function:', error);
            if(typeof fallback === 'function') {
                return fallback(error);
            }
            return null;
        }
    };
}

// ============================================
// Event listeners for keyboard and modal close
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Close modals on escape key
    document.addEventListener('keydown', function(e) {
        if(e.key === 'Escape') {
            closeAllModals();
        }
    });

    // Close modals on outside click
    document.addEventListener('click', function(e) {
        if(e.target.classList.contains('modal')) {
            closeAllModals();
        }
    });

    Logger.debug('Bug fixes utilities loaded');
});
