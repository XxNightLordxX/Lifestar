/**
 * Voice-Activated Commands Module
 * Recommendation #33 - Web Speech API integration
 * 
 * Commands:
 * - "go to [section]" — navigate to a dashboard section
 * - "create schedule" — open create schedule modal
 * - "logout" — log out
 * - "dark mode" / "light mode" — toggle theme
 * - "search [term]" — focus search and type term
 * - "help" — list available commands
 */


const VoiceCommands = (function() {
    'use strict';

    const recognition = null;
    const isListening = false;
    const micButton = null;
    const feedbackEl = null;

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSupported = !!SpeechRecognition;

    // Command definitions
    const SECTION_ALIASES = {
        'drafts': 'drafts', 'draft': 'drafts', 'draft schedules': 'drafts',
        'published': 'published', 'published schedules': 'published',
        'archived': 'archived', 'past schedules': 'archived', 'past': 'archived',
        'calendar': 'calendar', 'calendar view': 'calendar',
        'crews': 'crews', 'crew': 'crews', 'crew management': 'crews',
        'time off': 'timeoff', 'timeoff': 'timeoff', 'time-off': 'timeoff',
        'trades': 'trades', 'shift trades': 'trades',
        'swap': 'swap', 'swap marketplace': 'swap', 'marketplace': 'swap',
        'staff': 'staff', 'staff directory': 'staff',
        'availability': 'availability',
        'training': 'training',
        'bonus': 'bonus', 'bonus hours': 'bonus',
        'call-ins': 'callins', 'callins': 'callins', 'emergency': 'callins',
        'absences': 'absences', 'absence': 'absences',
        'on-call': 'oncall', 'oncall': 'oncall', 'on call': 'oncall',
        'analytics': 'analytics',
        'history': 'history', 'shift history': 'history',
        'notes': 'notes', 'supervisor notes': 'notes',
        'templates': 'templates', 'schedule templates': 'templates',
        'payroll': 'payroll',
        'overview': 'overview',
        'users': 'users', 'user management': 'users',
        'features': 'features', 'feature toggles': 'features',
        'logs': 'logs', 'system logs': 'logs',
        'permissions': 'permissions',
        'locations': 'locations'
    };

    /** Initialize voice recognition */
    function init() {
        if (!isSupported) return;

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 3;

        recognition.onresult = handleResult;
        recognition.onerror = handleError;
        recognition.onend = function() {
            isListening = false;
            updateMicButton();
        };
        recognition.onstart = function() {
            isListening = true;
            updateMicButton();
        };

        // Inject mic button after a delay
        setTimeout(injectMicButton, 800);
    }

    /** Handle speech recognition result */
    function handleResult(event) {
        const transcript = '';
        for (const i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim().toLowerCase();
        showFeedback('🎤 "' + transcript + '"');
        processCommand(transcript);
    }

    /** Handle recognition error */
    function handleError(event) {
        if (event.error === 'no-speech') {
            showFeedback('No speech detected. Try again.');
        } else if (event.error === 'not-allowed') {
            showFeedback('Microphone access denied.');
        } else {
            showFeedback('Voice error: ' + event.error);
        }
        isListening = false;
        updateMicButton();
    }

    /** Process a voice command */
    function processCommand(text) {
        // "go to [section]"
        const goToMatch = text.match(/^(?:go to|navigate to|show|open)\s+(.+)$/);
        if (goToMatch) {
            const target = goToMatch[1].trim();
            const section = SECTION_ALIASES[target];
            if (section) {
                navigateToSection(section);
                showFeedback('✅ Navigating to ' + section);
                return;
            }
        }

        // Direct section name
        if (SECTION_ALIASES[text]) {
            navigateToSection(SECTION_ALIASES[text]);
            showFeedback('✅ Navigating to ' + SECTION_ALIASES[text]);
            return;
        }

        // "create schedule"
        if (text.indexOf('create schedule') !== -1 || text.indexOf('new schedule') !== -1) {
            if (typeof showCreateScheduleModal === 'function') {
                showCreateScheduleModal();
                showFeedback('✅ Opening create schedule');
            }
            return;
        }

        // "logout" / "log out" / "sign out"
        if (text === 'logout' || text === 'log out' || text === 'sign out') {
            if (typeof handleLogout === 'function') {
                handleLogout();
                showFeedback('✅ Logging out');
            }
            return;
        }

        // "dark mode" / "light mode"
        if (text.indexOf('dark mode') !== -1 || text.indexOf('dark theme') !== -1) {
            if (typeof DarkMode !== 'undefined' && typeof DarkMode.enable === 'function') {
                DarkMode.enable();
                showFeedback('✅ Dark mode enabled');
            }
            return;
        }
        if (text.indexOf('light mode') !== -1 || text.indexOf('light theme') !== -1) {
            if (typeof DarkMode !== 'undefined' && typeof DarkMode.disable === 'function') {
                DarkMode.disable();
                showFeedback('✅ Light mode enabled');
            }
            return;
        }

        // "help"
        if (text === 'help' || text === 'commands' || text === 'what can you do') {
            showHelpOverlay();
            return;
        }

        // Unknown command
        showFeedback('❓ Unknown command: "' + text + '". Say "help" for commands.');
    }

    /** Navigate to a section based on current dashboard */
    function navigateToSection(section) {
        const superDash = document.getElementById('superDashboard');
        const bossDash = document.getElementById('bossDashboard');

        if (superDash && superDash.classList.contains('active')) {
            // Super admin sections
            const superSections = ['overview', 'users', 'features', 'logs', 'permissions', 'locations', 'ai', 'developer'];
            if (superSections.indexOf(section) !== -1) {
                if (typeof showSuperSection === 'function') showSuperSection(section);
            } else {
                // Boss sections via super admin
                if (typeof showSuperSection === 'function') showSuperSection('s_' + section);
            }
        } else if (bossDash && bossDash.classList.contains('active')) {
            if (typeof showBossSection === 'function') showBossSection(section);
        }
    }

    /** Toggle listening */
    function toggleListening() {
        if (!isSupported) {
            if (typeof showAlert === 'function') showAlert('Voice commands not supported in this browser', 'warning');
            return;
        }
        if (isListening) {
            recognition.stop();
        } else {
            try {
                recognition.start();
                showFeedback('🎤 Listening...');
            } catch (e) {
                // Already started
            }
        }
    }

    /** Inject microphone button into the UI */
    function injectMicButton() {
        if (document.getElementById('voiceMicBtn')) return;

        micButton = document.createElement('button');
        micButton.id = 'voiceMicBtn';
        micButton.setAttribute('aria-label', 'Voice commands');
        micButton.title = 'Voice Commands (click to speak)';
        micButton.textContent = '🎤';
        micButton.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;width:50px;height:50px;border-radius:50%;border:2px solid var(--border-color,#ccc);background:var(--bg-secondary,#fff);color:var(--text-primary,#333);font-size:1.4rem;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;';
        micButton.addEventListener('click', toggleListening);

        // Feedback element
        feedbackEl = document.createElement('div');
        feedbackEl.id = 'voiceFeedback';
        feedbackEl.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;background:var(--bg-secondary,#333);color:var(--text-primary,#fff);padding:8px 16px;border-radius:8px;font-size:0.85rem;max-width:300px;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:none;transition:opacity 0.3s ease;';

        document.body.appendChild(micButton);
        document.body.appendChild(feedbackEl);

        // Add styles for listening state
        const style = document.createElement('style');
        style.textContent = '#voiceMicBtn.listening{background:#dc3545;color:#fff;border-color:#dc3545;animation:pulse-mic 1.5s infinite;}' +
            '@keyframes pulse-mic{0%{box-shadow:0 0 0 0 rgba(220,53,69,0.4);}70%{box-shadow:0 0 0 15px rgba(220,53,69,0);}100%{box-shadow:0 0 0 0 rgba(220,53,69,0);}}' +
            '[dir="rtl"] #voiceMicBtn,[dir="rtl"] #voiceFeedback{right:auto;left:20px;}';
        document.head.appendChild(style);
    }

    /** Update mic button appearance */
    function updateMicButton() {
        if (!micButton) return;
        if (isListening) {
            micButton.classList.add('listening');
            micButton.textContent = '⏹️';
        } else {
            micButton.classList.remove('listening');
            micButton.textContent = '🎤';
        }
    }

    /** Show feedback text */
    function showFeedback(text) {
        if (!feedbackEl) return;
        feedbackEl.textContent = text;
        feedbackEl.style.display = 'block';
        feedbackEl.style.opacity = '1';
        clearTimeout(feedbackEl._timer);
        feedbackEl._timer = setTimeout(function() {
            feedbackEl.style.opacity = '0';
            setTimeout(function() { feedbackEl.style.display = 'none'; }, 300);
        }, 3000);
    }

    /** Show help overlay with available commands */
    function showHelpOverlay() {
        const existing = document.getElementById('voiceHelpOverlay');
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement('div');
        overlay.id = 'voiceHelpOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = '<div style="background:var(--bg-secondary,#fff);color:var(--text-primary,#333);border-radius:12px;padding:2rem;max-width:450px;width:90%;max-height:80vh;overflow-y:auto;">' +
            '<h2 style="margin:0 0 1rem;">🎤 Voice Commands</h2>' +
            '<table style="width:100%;border-collapse:collapse;">' +
            '<tr><td style="padding:6px 8px;font-weight:600;">Navigation</td><td style="padding:6px 8px;">"Go to [section]"</td></tr>' +
            '<tr><td style="padding:6px 8px;font-weight:600;">Sections</td><td style="padding:6px 8px;">drafts, published, calendar, crews, staff, analytics, payroll, etc.</td></tr>' +
            '<tr><td style="padding:6px 8px;font-weight:600;">Create</td><td style="padding:6px 8px;">"Create schedule" or "New schedule"</td></tr>' +
            '<tr><td style="padding:6px 8px;font-weight:600;">Theme</td><td style="padding:6px 8px;">"Dark mode" / "Light mode"</td></tr>' +
            '<tr><td style="padding:6px 8px;font-weight:600;">Logout</td><td style="padding:6px 8px;">"Logout" or "Sign out"</td></tr>' +
            '<tr><td style="padding:6px 8px;font-weight:600;">Help</td><td style="padding:6px 8px;">"Help" or "Commands"</td></tr>' +
            '</table>' +
            '<button onclick="this.closest(\'#voiceHelpOverlay\').remove()" style="margin-top:1rem;padding:8px 20px;border:none;background:#dc3545;color:#fff;border-radius:6px;cursor:pointer;">Close</button>' +
            '</div>';
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

    return {
        init: init,
        toggleListening: toggleListening,
        processCommand: processCommand,
        isSupported: function() { return isSupported; },
        isListening: function() { return isListening; },
        showHelp: showHelpOverlay
    };
})();