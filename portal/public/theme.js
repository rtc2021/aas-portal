/**
 * AAS Portal Theme System v1.1 (Safe Rewrite)
 * - Dark (default) / Light ("Grandma Mode")
 * - Injects light-theme CSS overrides
 * - Injects a toggle button into #floatingUser
 * - Syncs favicon to THEME TOGGLE (not OS)
 *
 * Requires these files in /public:
 * - /favicon-dark.svg
 * - /favicon-light.svg
 * - /favicon.ico (optional)
 */
(function () {
  'use strict';

  const THEME_KEY = 'aas-theme';
  const STYLE_ID = 'aas-theme-styles';
  const FAVICON_ID = 'aas-favicon';

  // ============================================================================
  // LIGHT THEME OVERRIDES (your existing CSS, unchanged)
  // ============================================================================
  const LIGHT_THEME_CSS = `
    /* ========================================
       BODY & GLOBAL
       ======================================== */
    body.light-theme {
      background: #f4f6f8 !important;
      color: #1a1a2e !important;
    }

    /* ========================================
       PARTS FINDER (#aasPartsFinder --pf-*)
       ======================================== */
    body.light-theme #aasPartsFinder {
      --pf-bg: rgba(244, 246, 248, 0.95);
      --pf-bg-solid: rgba(255, 255, 255, 0.98);
      --pf-bg-card: rgba(255, 255, 255, 0.95);
      --pf-border: rgba(0, 0, 0, 0.1);
      --pf-border-hover: rgba(0, 0, 0, 0.2);
      --pf-text: #1a1a2e;
      --pf-text-muted: rgba(26, 26, 46, 0.7);
      --pf-text-dim: rgba(26, 26, 46, 0.5);
      --pf-accent: #0066aa;
      --pf-accent-glow: rgba(0, 102, 170, 0.2);
      --pf-accent-soft: rgba(0, 102, 170, 0.8);
      --pf-highlight: rgba(0, 102, 170, 0.15);
      --pf-highlight-text: #004d80;
      --pf-success: rgba(34, 150, 80, 0.9);
    }

    /* ========================================
       DOOR BROWSER (#aasDoorBrowser --db-*)
       ======================================== */
    body.light-theme #aasDoorBrowser {
      --db-bg: #f4f6f8;
      --db-surface: #ffffff;
      --db-glass: rgba(255, 255, 255, 0.9);
      --db-glass-border: rgba(0, 0, 0, 0.08);
      --db-glass-border-hover: rgba(0, 0, 0, 0.15);
      --db-text: rgba(26, 26, 46, 0.92);
      --db-text-muted: rgba(26, 26, 46, 0.6);
      --db-text-faint: rgba(26, 26, 46, 0.4);
      --db-primary: #0066aa;
      --db-primary-glow: rgba(0, 102, 170, 0.15);
      --db-success: #1a8050;
      --db-success-glow: rgba(26, 128, 80, 0.12);
      --db-warning: #cc8800;
      --db-warning-glow: rgba(204, 136, 0, 0.12);
      --db-danger: #cc3333;
      --db-pink: #cc5588;
      --db-pink-glow: rgba(204, 85, 136, 0.12);
      --db-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    }

    /* ========================================
       TECH MANUALS HUB (#manualHub --mh-*)
       ======================================== */
    body.light-theme #manualHub,
    body.light-theme .mh-root {
      --mh-bg: #f4f6f8;
      --mh-surface: #ffffff;
      --mh-card: rgba(255, 255, 255, 0.95);
      --mh-border: rgba(0, 0, 0, 0.1);
      --mh-border-hover: rgba(0, 0, 0, 0.2);
      --mh-text: #1a1a2e;
      --mh-text-muted: rgba(26, 26, 46, 0.65);
      --mh-text-dim: rgba(26, 26, 46, 0.45);
      --mh-accent: #0066aa;
      --mh-accent-glow: rgba(0, 102, 170, 0.15);
      --mh-highlight: rgba(0, 102, 170, 0.12);
    }

    /* ========================================
       COMMAND CENTER (#aasCommandCenter --cc-*)
       ======================================== */
    body.light-theme #aasCommandCenter {
      --cc-bg: #f4f6f8;
      --cc-surface: #ffffff;
      --cc-card: rgba(255, 255, 255, 0.95);
      --cc-glass: rgba(255, 255, 255, 0.9);
      --cc-border: rgba(0, 0, 0, 0.1);
      --cc-border-hover: rgba(0, 0, 0, 0.2);
      --cc-text: #1a1a2e;
      --cc-text-muted: rgba(26, 26, 46, 0.65);
      --cc-text-dim: rgba(26, 26, 46, 0.45);
      --cc-accent: #0066aa;
      --cc-accent-glow: rgba(0, 102, 170, 0.15);
    }

    /* ========================================
       WORK SUMMARY (--ws-* if exists)
       ======================================== */
    body.light-theme #workSummary,
    body.light-theme .ws-root {
      --ws-bg: #f4f6f8;
      --ws-surface: #ffffff;
      --ws-card: rgba(255, 255, 255, 0.95);
      --ws-border: rgba(0, 0, 0, 0.1);
      --ws-text: #1a1a2e;
      --ws-text-muted: rgba(26, 26, 46, 0.65);
      --ws-accent: #0066aa;
    }

    /* ========================================
       CUSTOMER COMMAND CENTER (#customerCommand --ccc-*)
       ======================================== */
    body.light-theme #customerCommand {
      --ccc-bg: #f4f6f8;
      --ccc-surface: rgba(255, 255, 255, 0.95);
      --ccc-card: #ffffff;
      --ccc-border: rgba(0, 0, 0, 0.1);
      --ccc-border-hover: rgba(0, 119, 170, 0.4);
      --ccc-text: #1a1a2e;
      --ccc-text-secondary: rgba(26, 26, 46, 0.75);
      --ccc-text-muted: rgba(26, 26, 46, 0.55);
      --ccc-accent: #0077aa;
      --ccc-accent-bg: rgba(0, 119, 170, 0.1);
      --ccc-green: #16a34a;
      --ccc-green-bg: rgba(22, 163, 74, 0.12);
      --ccc-amber: #d97706;
      --ccc-amber-bg: rgba(217, 119, 6, 0.12);
      --ccc-red: #dc2626;
      --ccc-red-bg: rgba(220, 38, 38, 0.12);
      --ccc-input-bg: #ffffff;
      --ccc-table-header: rgba(0, 119, 170, 0.06);
      --ccc-table-hover: rgba(0, 0, 0, 0.02);
      --ccc-glow: 0 4px 20px rgba(0, 0, 0, 0.1);
      background: var(--ccc-bg) !important;
    }
    body.light-theme #customerCommand .bg-effects { display: none !important; }
    body.light-theme #customerCommand .auth-overlay { background: #f4f6f8 !important; }
    body.light-theme #customerCommand .auth-card {
      background: #ffffff !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme #customerCommand .ccc-title {
      background: linear-gradient(135deg, #1a1a2e 0%, #0077aa 100%) !important;
      -webkit-background-clip: text !important;
    }

    /* ========================================
       NAVIGATION / FLOATING USER / COPILOT / AUTH
       (kept as-is for compatibility; you can remove later if nav.css takes over)
       ======================================== */
    body.light-theme .nav-toggle {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .nav-toggle:hover {
      background: rgba(0, 102, 170, 0.1) !important;
      border-color: rgba(0, 102, 170, 0.3) !important;
    }
    body.light-theme .nav-toggle svg { stroke: #1a1a2e !important; }

    body.light-theme .nav-panel {
      background: rgba(255, 255, 255, 0.98) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .nav-panel__overlay.open { background: rgba(0, 0, 0, 0.3) !important; }
    body.light-theme .nav-panel__link { color: rgba(26, 26, 46, 0.8) !important; }
    body.light-theme .nav-panel__link:hover {
      background: rgba(0, 102, 170, 0.08) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .nav-panel__link.active {
      background: rgba(0, 102, 170, 0.12) !important;
      color: #0066aa !important;
    }
    body.light-theme .nav-panel__section { color: rgba(26, 26, 46, 0.5) !important; }
    body.light-theme .nav-panel__divider { background: rgba(0, 0, 0, 0.1) !important; }

    body.light-theme .floating-user {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .floating-user__name { color: #1a1a2e !important; }
    body.light-theme .floating-user__role { color: #0066aa !important; }
    body.light-theme .floating-user__logout {
      background: rgba(0, 0, 0, 0.06) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .floating-user__logout:hover {
      background: rgba(220, 50, 50, 0.15) !important;
      color: #cc3333 !important;
    }

    body.light-theme .auth-overlay { background: rgba(244, 246, 248, 0.98) !important; }
    body.light-theme .auth-card {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .auth-spinner {
      border-color: rgba(0, 0, 0, 0.1) !important;
      border-top-color: #0066aa !important;
    }
    body.light-theme #authLoadingText,
    body.light-theme .auth-subtitle { color: rgba(26, 26, 46, 0.7) !important; }

    body.light-theme .aas-copilot-toggle {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 102, 170, 0.3) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-panel {
      background: rgba(255, 255, 255, 0.98) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .aas-copilot-header {
      background: rgba(0, 102, 170, 0.06) !important;
      border-color: rgba(0, 0, 0, 0.08) !important;
    }
    body.light-theme .aas-copilot-title { color: #1a1a2e !important; }
    body.light-theme .aas-copilot-title-text {
      background: linear-gradient(135deg, #1a1a2e, #0066aa) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
    }
    body.light-theme .aas-copilot-message.assistant .aas-copilot-message-content {
      background: rgba(0, 0, 0, 0.04) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
      color: #1a1a2e !important;
    }

    /* Theme Toggle Button */
    .theme-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 50%;
      color: #fff;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-right: 8px;
      flex-shrink: 0;
    }
    .theme-toggle:hover {
      background: rgba(0, 212, 255, 0.15);
      border-color: rgba(0, 212, 255, 0.4);
      transform: scale(1.05);
    }
    .theme-toggle svg { width: 16px; height: 16px; }
    .theme-toggle .sun-icon { display: none; }
    .theme-toggle .moon-icon { display: block; }

    body.light-theme .theme-toggle {
      background: rgba(0, 0, 0, 0.06);
      border-color: rgba(0, 0, 0, 0.12);
      color: #1a1a2e;
    }
    body.light-theme .theme-toggle:hover {
      background: rgba(0, 102, 170, 0.1);
      border-color: rgba(0, 102, 170, 0.3);
    }
    body.light-theme .theme-toggle .sun-icon { display: block; }
    body.light-theme .theme-toggle .moon-icon { display: none; }

    /* Disable animated backgrounds in light */
    body.light-theme .cc-bg,
    body.light-theme .db-bg,
    body.light-theme .pf-bg,
    body.light-theme [class*="-bg"]::before,
    body.light-theme [class*="-bg"]::after {
      background: #f4f6f8 !important;
      animation: none !important;
    }
  `;

  // ============================================================================
  // THEME FUNCTIONS
  // ============================================================================

  function getCurrentTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  // Sync favicon to in-app theme toggle (Grandma Mode)
  function syncFavicon(theme) {
    let link = document.getElementById(FAVICON_ID);

    if (!link) {
      link = document.createElement('link');
      link.id = FAVICON_ID;
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }

    link.href = (theme === 'light') ? '/favicon-light.svg' : '/favicon-dark.svg';
  }

  function applyTheme(theme) {
    if (theme === 'light') document.body.classList.add('light-theme');
    else document.body.classList.remove('light-theme');

    localStorage.setItem(THEME_KEY, theme);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.title = theme === 'dark' ? '👵 Grandma Mode' : '🌙 Dark Mode';
    }

    // Ensure favicon follows the toggle
    syncFavicon(theme);
  }

  function toggleTheme() {
    const current = getCurrentTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = LIGHT_THEME_CSS;
    document.head.appendChild(style);
  }

  function createToggleButton() {
    const toggle = document.createElement('button');
    toggle.id = 'themeToggle';
    toggle.className = 'theme-toggle';
    toggle.title = getCurrentTheme() === 'dark' ? '👵 Grandma Mode' : '🌙 Dark Mode';
    toggle.innerHTML = `
      <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
      <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    `;
    toggle.addEventListener('click', toggleTheme);
    return toggle;
  }

  function injectToggle() {
    const maxAttempts = 80;
    let attempts = 0;

    const timer = setInterval(() => {
      attempts++;

      const floatingUser = document.getElementById('floatingUser');
      if (floatingUser && !document.getElementById('themeToggle')) {
        const toggle = createToggleButton();
        floatingUser.insertBefore(toggle, floatingUser.firstChild);
        clearInterval(timer);
      }

      if (attempts >= maxAttempts) clearInterval(timer);
    }, 100);
  }

  function init() {
    injectStyles();

    const savedTheme = getCurrentTheme();

    // Apply class early to avoid flash
    if (savedTheme === 'light') document.body.classList.add('light-theme');

    // Sync favicon immediately (even before DOMContentLoaded)
    syncFavicon(savedTheme);

    // Finish applying theme + inject toggle once DOM is ready
    const onReady = () => {
      applyTheme(savedTheme);
      injectToggle();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }

  // Run
  init();

  // Expose API
  window.AASTheme = {
    toggle: toggleTheme,
    set: applyTheme,
    get: getCurrentTheme
  };
})();
