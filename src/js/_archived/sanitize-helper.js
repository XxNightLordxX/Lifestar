/**
 * Sanitization Helper - Provides safe HTML rendering functions
 * Prevents XSS attacks by escaping HTML entities
 */

/**
 * Escape HTML entities in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML
 */

function escapeHTML(str) {
    if(str === null || str === undefined) {
        return '';
    }

    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Safely set innerHTML with escaped content
 * @param {HTMLElement} element - Element to set content on
 * @param {string} content - Content to set (will be escaped)
 */
function safeSetInnerHTML(element, content) {
    if(!element) return;

    // Escape the content
    const safeContent = escapeHTML(content);
    element.textContent = safeContent;
}

/**
 * Safely create option elements from data
 * @param {Array} items - Array of items
 * @param {string} valueKey - Key for value attribute
 * @param {string} textKey - Key for display text
 * @param {string} selectedValue - Currently selected value
 * @param {string} placeholder - Default placeholder text
 * @returns {string} Safe HTML string for options
 */
function safeCreateOptions(items, valueKey, textKey, selectedValue, placeholder = 'Select') {
    let options = `<option value="">${escapeHTML(placeholder)}</option>`;

    for(const item of items) {
        const value = escapeHTML(String(item[valueKey] || ''));
        const text = escapeHTML(String(item[textKey] || item.username || ''));
        const selected = String(value) === String(selectedValue) ? 'selected' : '';
        options += `<option value="${value}" ${selected}>${text}</option>`;
    }

    return options;
}

/**
 * Safely render user data in HTML
 * @param {Object} user - User object
 * @returns {Object} Escaped user object
 */
function safeRenderUser(user) {
    return {
        id: escapeHTML(String(user.id || '')),
        fullName: escapeHTML(user.fullName || user.username || ''),
        username: escapeHTML(user.username || ''),
        role: escapeHTML(user.role || '')
    };
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeInput(input) {
    if (input === null || input === undefined) {
        return '';
    }
    return escapeHTML(String(input));
}

/**
 * SanitizeHelper namespace for easy access to sanitization functions
 */
const SanitizeHelper = {
    escape: escapeHTML,
    sanitize: sanitizeInput,
    safeSetHTML: safeSetInnerHTML,
    safeOptions: safeCreateOptions,
    safeUser: safeRenderUser
};

// Export functions for global use
if(typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHTML,
        safeSetInnerHTML,
        safeCreateOptions,
        safeRenderUser,
        sanitizeInput,
        SanitizeHelper
    };
}
