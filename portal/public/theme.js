/**
 * AAS Portal Theme System v1.0
 * Toggle between Dark (default) and Light ("Grandma Mode")
 * Supports all page variable systems: --pf-*, --db-*, --mh-*, --cc-*
 */
(function() {
  'use strict';

  const THEME_KEY = 'aas-theme';
  
  // ============================================================================
  // LIGHT THEME OVERRIDES
  // Each page uses scoped CSS variables, we override them all
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
    body.light-theme #customerCommand .bg-effects {
      display: none !important;
    }
    body.light-theme #customerCommand .auth-overlay {
      background: #f4f6f8 !important;
    }
    body.light-theme #customerCommand .auth-card {
      background: #ffffff !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme #customerCommand .ccc-title {
      background: linear-gradient(135deg, #1a1a2e 0%, #0077aa 100%) !important;
      -webkit-background-clip: text !important;
    }

    /* ========================================
       NAVIGATION (Hardcoded - must override)
       ======================================== */
    body.light-theme .nav-toggle {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .nav-toggle:hover {
      background: rgba(0, 102, 170, 0.1) !important;
      border-color: rgba(0, 102, 170, 0.3) !important;
    }
    body.light-theme .nav-toggle svg {
      stroke: #1a1a2e !important;
    }

    body.light-theme .nav-panel {
      background: rgba(255, 255, 255, 0.98) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .nav-panel__overlay.open {
      background: rgba(0, 0, 0, 0.3) !important;
    }
    body.light-theme .nav-panel__link {
      color: rgba(26, 26, 46, 0.8) !important;
    }
    body.light-theme .nav-panel__link:hover {
      background: rgba(0, 102, 170, 0.08) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .nav-panel__link.active {
      background: rgba(0, 102, 170, 0.12) !important;
      color: #0066aa !important;
    }
    body.light-theme .nav-panel__link svg {
      stroke: currentColor !important;
    }
    body.light-theme .nav-panel__section {
      color: rgba(26, 26, 46, 0.5) !important;
    }
    body.light-theme .nav-panel__divider {
      background: rgba(0, 0, 0, 0.1) !important;
    }

    /* ========================================
       FLOATING USER BADGE (Hardcoded)
       ======================================== */
    body.light-theme .floating-user {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .floating-user__name {
      color: #1a1a2e !important;
    }
    body.light-theme .floating-user__role {
      color: #0066aa !important;
    }
    body.light-theme .floating-user__logout {
      background: rgba(0, 0, 0, 0.06) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .floating-user__logout:hover {
      background: rgba(220, 50, 50, 0.15) !important;
      color: #cc3333 !important;
    }

    /* ========================================
       DASHBOARD / INDEX PAGE
       ======================================== */
    body.light-theme .dashboard-header {
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .dashboard-logo h1 {
      color: #0066aa !important;
      text-shadow: none !important;
    }
    body.light-theme .dashboard-logo img {
      filter: none !important;
    }
    body.light-theme .nav-card {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .nav-card:hover {
      border-color: rgba(0, 102, 170, 0.4) !important;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .nav-card__icon {
      background: rgba(0, 102, 170, 0.1) !important;
    }
    body.light-theme .nav-card__icon svg {
      stroke: #0066aa !important;
    }
    body.light-theme .nav-card__title {
      color: #1a1a2e !important;
    }
    body.light-theme .nav-card__desc {
      color: rgba(26, 26, 46, 0.7) !important;
    }
    body.light-theme .version {
      color: rgba(26, 26, 46, 0.5) !important;
    }

    /* ========================================
       AUTH OVERLAY
       ======================================== */
    body.light-theme .auth-overlay {
      background: rgba(244, 246, 248, 0.98) !important;
    }
    body.light-theme .auth-card {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .auth-spinner {
      border-color: rgba(0, 0, 0, 0.1) !important;
      border-top-color: #0066aa !important;
    }
    body.light-theme #authLoadingText,
    body.light-theme .auth-subtitle {
      color: rgba(26, 26, 46, 0.7) !important;
    }

    /* ========================================
       COPILOT PANEL
       ======================================== */
    body.light-theme .aas-copilot-toggle {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 102, 170, 0.3) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-toggle:hover {
      border-color: rgba(0, 102, 170, 0.5) !important;
      box-shadow: 0 0 20px rgba(0, 102, 170, 0.15), 0 4px 15px rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .aas-copilot-panel {
      background: rgba(255, 255, 255, 0.98) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .aas-copilot-header {
      background: rgba(0, 102, 170, 0.06) !important;
      border-color: rgba(0, 0, 0, 0.08) !important;
    }
    body.light-theme .aas-copilot-title {
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-title-text {
      background: linear-gradient(135deg, #1a1a2e, #0066aa) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
    }
    body.light-theme .aas-copilot-close {
      color: rgba(26, 26, 46, 0.6) !important;
    }
    body.light-theme .aas-copilot-close:hover {
      background: rgba(0, 0, 0, 0.08) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-messages {
      background: transparent !important;
    }
    body.light-theme .aas-copilot-message-meta {
      color: rgba(26, 26, 46, 0.5) !important;
    }
    body.light-theme .aas-copilot-message.assistant .aas-copilot-message-content {
      background: rgba(0, 0, 0, 0.04) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-input-area {
      background: rgba(255, 255, 255, 0.95) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    body.light-theme .aas-copilot-input {
      background: rgba(0, 0, 0, 0.04) !important;
      border-color: rgba(0, 0, 0, 0.12) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-input:focus {
      border-color: rgba(0, 102, 170, 0.5) !important;
      box-shadow: 0 0 0 3px rgba(0, 102, 170, 0.1) !important;
    }
    body.light-theme .aas-copilot-input::placeholder {
      color: rgba(26, 26, 46, 0.4) !important;
    }
    body.light-theme .aas-copilot-context {
      background: rgba(0, 102, 170, 0.06) !important;
      border-color: rgba(0, 0, 0, 0.08) !important;
    }
    body.light-theme .aas-copilot-context label {
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-context-label {
      color: rgba(26, 26, 46, 0.7) !important;
    }
    body.light-theme .aas-copilot-context-info {
      color: #0077aa !important;
      background: rgba(0, 119, 170, 0.12) !important;
    }
    body.light-theme .aas-copilot-welcome {
      background: linear-gradient(135deg, rgba(0, 102, 170, 0.08), rgba(0, 102, 170, 0.02)) !important;
      border-color: rgba(0, 102, 170, 0.2) !important;
    }
    body.light-theme .aas-copilot-welcome h3 {
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-welcome p {
      color: rgba(26, 26, 46, 0.7) !important;
    }
    body.light-theme .aas-copilot-welcome-list li {
      background: rgba(0, 0, 0, 0.04) !important;
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-welcome-list li svg {
      color: #0066aa !important;
    }

    /* ========================================
       PARTS FINDER - Additional Light Fixes
       ======================================== */
    body.light-theme #aasPartsFinder .part-card,
    body.light-theme #aasPartsFinder .pf-result,
    body.light-theme #aasPartsFinder [class*="result"],
    body.light-theme #aasPartsFinder [class*="card"] {
      color: #1a1a2e !important;
    }
    body.light-theme #aasPartsFinder .part-manufacturer,
    body.light-theme #aasPartsFinder .part-desc,
    body.light-theme #aasPartsFinder [class*="muted"],
    body.light-theme #aasPartsFinder [class*="secondary"],
    body.light-theme #aasPartsFinder [class*="description"],
    body.light-theme #aasPartsFinder [class*="desc"] {
      color: #444455 !important;
    }
    body.light-theme #aasPartsFinder h3,
    body.light-theme #aasPartsFinder h4,
    body.light-theme #aasPartsFinder .part-number,
    body.light-theme #aasPartsFinder [class*="title"] {
      color: #1a1a2e !important;
    }
    /* Force all text in parts results to be dark */
    body.light-theme #aasPartsFinder div,
    body.light-theme #aasPartsFinder span,
    body.light-theme #aasPartsFinder p {
      color: #333344 !important;
    }
    body.light-theme #aasPartsFinder strong,
    body.light-theme #aasPartsFinder b {
      color: #1a1a2e !important;
    }
    body.light-theme .aas-copilot-typing span {
      background: #0066aa !important;
    }

    /* ========================================
       SCROLLBARS
       ======================================== */
    body.light-theme ::-webkit-scrollbar {
      width: 8px;
    }
    body.light-theme ::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.04);
    }
    body.light-theme ::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 4px;
    }
    body.light-theme ::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.25);
    }

    /* ========================================
       THEME TOGGLE BUTTON
       ======================================== */
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
    .theme-toggle svg {
      width: 16px;
      height: 16px;
    }
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

    /* ========================================
       ANIMATED BACKGROUNDS (disable in light)
       ======================================== */
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

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem(THEME_KEY, theme);
    
    // Update toggle button title if exists
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.title = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
    // Sync dropdown select if exists
    const sel = document.getElementById('themeSelect');
    if (sel && sel.value !== theme) sel.value = theme;
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
    if (document.getElementById('aas-theme-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'aas-theme-styles';
    style.textContent = LIGHT_THEME_CSS;
    document.head.appendChild(style);
  }

  function createThemeSelector() {
    const current = getCurrentTheme();
    const row = document.createElement('div');
    row.className = 'user-menu__theme-row';
    row.id = 'themeToggle';
    row.innerHTML = `
      <label>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
        Theme
      </label>
      <select id="themeSelect">
        <option value="dark" ${current === 'dark' ? 'selected' : ''}>Dark</option>
        <option value="light" ${current === 'light' ? 'selected' : ''}>Light</option>
      </select>
    `;
    row.querySelector('select').addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
    return row;
  }

  // Legacy: floating button for pages without user menu
  function createToggleButton() {
    const toggle = document.createElement('button');
    toggle.id = 'themeToggle';
    toggle.className = 'theme-toggle';
    toggle.title = getCurrentTheme() === 'dark' ? 'Light Mode' : 'Dark Mode';
    toggle.innerHTML = `
      <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
      <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    `;
    toggle.onclick = toggleTheme;
    return toggle;
  }

  function injectToggle() {
    const maxAttempts = 50;
    let attempts = 0;

    const check = setInterval(() => {
      attempts++;

      // Prefer new user menu dropdown slot
      const slot = document.getElementById('userMenuThemeSlot');
      if (slot && !document.getElementById('themeToggle')) {
        clearInterval(check);
        slot.appendChild(createThemeSelector());
        // Show the divider after theme slot
        const divider = document.getElementById('userMenuThemeDivider');
        if (divider) divider.style.display = '';
        return;
      }

      // Fallback: legacy floating user badge (for pages that still have it)
      const floatingUser = document.getElementById('floatingUser');
      if (floatingUser && !document.getElementById('themeToggle')) {
        clearInterval(check);
        floatingUser.insertBefore(createToggleButton(), floatingUser.firstChild);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(check);
      }
    }, 100);
  }

  function init() {
    // Inject styles immediately
    injectStyles();
    
    // Apply saved theme immediately (before DOM fully loads)
    const savedTheme = getCurrentTheme();
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    }
    
    // Wait for DOM to inject toggle button
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        applyTheme(savedTheme);
        injectToggle();
      });
    } else {
      applyTheme(savedTheme);
      injectToggle();
    }
  }

  // Run immediately
  init();

  // Expose API
  window.AASTheme = {
    toggle: toggleTheme,
    set: applyTheme,
    get: getCurrentTheme
  };
})();
