/**
 * AAS Copilot UI v1.0
 * Self-contained AI assistant panel
 * Auto-injects into page, role-gated for Admin/Tech only
 * 
 * Usage: Just include <script src="/copilot.js"></script> on any page
 * Or add to netlify.toml to auto-load on all pages
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    apiEndpoint: '/api/copilot',
    allowedRoles: ['Admin', 'Tech'],
    panelWidth: '420px',
    animationDuration: '300ms'
  };

  // ============================================================================
  // STYLES
  // ============================================================================
  
  const STYLES = `
    /* Copilot Toggle Button */
    .aas-copilot-toggle {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9990;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 20px;
      background: var(--floating-bg, rgba(15, 15, 25, 0.9));
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-hover, rgba(0, 212, 255, 0.3));
      border-radius: 50px;
      color: var(--text-primary, #fff);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 
        0 0 30px rgba(0, 212, 255, 0.2),
        0 4px 20px rgba(0, 0, 0, 0.4);
      transition: all 0.3s ease;
    }
    
    .aas-copilot-toggle:hover {
      transform: translateY(-2px);
      border-color: rgba(0, 212, 255, 0.6);
      box-shadow: 
        0 0 40px rgba(0, 212, 255, 0.35),
        0 8px 30px rgba(0, 0, 0, 0.5);
    }
    
    .aas-copilot-toggle.active {
      background: linear-gradient(135deg, #00d4ff, #0099cc);
      color: #050508;
      border-color: transparent;
    }
    
    .aas-copilot-toggle svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    
    .aas-copilot-toggle-text {
      letter-spacing: 0.5px;
    }
    
    .aas-copilot-toggle-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 12px;
      height: 12px;
      background: #22c55e;
      border-radius: 50%;
      border: 2px solid #050508;
      animation: copilot-pulse 2s infinite;
    }
    
    @keyframes copilot-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.1); }
    }

    /* Copilot Panel */
    .aas-copilot-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: ${CONFIG.panelWidth};
      max-width: 100vw;
      z-index: 9995;
      display: flex;
      flex-direction: column;
      background: var(--nav-bg, rgba(10, 10, 18, 0.95));
      backdrop-filter: blur(30px);
      -webkit-backdrop-filter: blur(30px);
      border-left: 1px solid var(--border-color, rgba(0, 212, 255, 0.2));
      box-shadow: -10px 0 50px rgba(0, 0, 0, 0.5);
      transform: translateX(100%);
      transition: transform ${CONFIG.animationDuration} cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    .aas-copilot-panel.open {
      transform: translateX(0);
    }
    
    /* Panel Header */
    .aas-copilot-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      background: var(--accent-bg, rgba(0, 212, 255, 0.05));
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }
    
    .aas-copilot-title {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary, #fff);
    }
    
    .aas-copilot-title-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.05));
      border-radius: 10px;
      border: 1px solid rgba(0, 212, 255, 0.3);
    }
    
    .aas-copilot-title-icon svg {
      width: 18px;
      height: 18px;
      color: #00d4ff;
    }
    
    .aas-copilot-title-text {
      background: linear-gradient(135deg, #fff, #00d4ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .aas-copilot-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .aas-copilot-close:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }
    
    .aas-copilot-close svg {
      width: 18px;
      height: 18px;
    }
    
    /* Context Toggle */
    .aas-copilot-context {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 20px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 13px;
      color: rgba(255, 255, 255, 0.6);
    }
    
    .aas-copilot-context input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #00d4ff;
      cursor: pointer;
    }
    
    .aas-copilot-context label {
      cursor: pointer;
      user-select: none;
    }
    
    .aas-copilot-context-info {
      margin-left: auto;
      padding: 4px 10px;
      background: rgba(0, 212, 255, 0.1);
      border-radius: 20px;
      font-size: 11px;
      color: #00d4ff;
      font-weight: 500;
    }
    
    /* Messages Container */
    .aas-copilot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .aas-copilot-messages::-webkit-scrollbar {
      width: 6px;
    }
    
    .aas-copilot-messages::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.02);
    }
    
    .aas-copilot-messages::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }
    
    .aas-copilot-messages::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    /* Welcome Message */
    .aas-copilot-welcome {
      padding: 24px;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(0, 212, 255, 0.02));
      border: 1px solid rgba(0, 212, 255, 0.15);
      border-radius: 16px;
    }
    
    .aas-copilot-welcome h3 {
      margin: 0 0 12px;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    }
    
    .aas-copilot-welcome p {
      margin: 0 0 16px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      line-height: 1.5;
    }
    
    .aas-copilot-welcome-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .aas-copilot-welcome-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 10px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
    }
    
    .aas-copilot-welcome-list li svg {
      width: 16px;
      height: 16px;
      color: #00d4ff;
      flex-shrink: 0;
    }
    
    /* Message Bubbles */
    .aas-copilot-message {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 95%;
      animation: message-appear 0.3s ease;
    }
    
    @keyframes message-appear {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .aas-copilot-message.user {
      align-self: flex-end;
    }
    
    .aas-copilot-message.assistant {
      align-self: flex-start;
    }
    
    .aas-copilot-message-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--text-muted, rgba(255, 255, 255, 0.4));
    }
    
    .aas-copilot-message-role {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .aas-copilot-message.user .aas-copilot-message-role {
      color: rgba(0, 212, 255, 0.8);
    }
    
    .aas-copilot-message.assistant .aas-copilot-message-role {
      color: rgba(34, 197, 94, 0.8);
    }
    
    .aas-copilot-message-content {
      padding: 14px 18px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    .aas-copilot-message.user .aas-copilot-message-content {
      background: linear-gradient(135deg, #00d4ff, #0099cc);
      color: #050508;
      border-bottom-right-radius: 4px;
    }
    
    .aas-copilot-message.assistant .aas-copilot-message-content {
      background: var(--bg-secondary, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      color: var(--text-primary, rgba(255, 255, 255, 0.9));
      border-bottom-left-radius: 4px;
    }
    
    /* Manufacturer Badge */
    .aas-copilot-manufacturer {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .aas-copilot-manufacturer.stanley { color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); }
    .aas-copilot-manufacturer.horton { color: #22c55e; border-color: rgba(34, 197, 94, 0.3); }
    .aas-copilot-manufacturer.besam { color: #00d4ff; border-color: rgba(0, 212, 255, 0.3); }
    .aas-copilot-manufacturer.nabco { color: #a855f7; border-color: rgba(168, 85, 247, 0.3); }
    
    /* Loading State */
    .aas-copilot-loading {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      border-bottom-left-radius: 4px;
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
    }
    
    .aas-copilot-loading-dots {
      display: flex;
      gap: 4px;
    }
    
    .aas-copilot-loading-dots span {
      width: 8px;
      height: 8px;
      background: #00d4ff;
      border-radius: 50%;
      animation: loading-dot 1.4s infinite;
    }
    
    .aas-copilot-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .aas-copilot-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes loading-dot {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1); }
    }
    
    /* Input Form */
    .aas-copilot-form {
      display: flex;
      gap: 12px;
      padding: 20px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    
    .aas-copilot-input {
      flex: 1;
      padding: 14px 18px;
      background: var(--bg-input, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      color: var(--text-primary, #fff);
      font-family: inherit;
      font-size: 16px; /* Prevents iOS zoom on focus */
      outline: none;
      transition: all 0.2s;
    }
    
    .aas-copilot-input:focus {
      border-color: var(--accent, rgba(0, 212, 255, 0.5));
      box-shadow: 0 0 0 3px var(--accent-bg, rgba(0, 212, 255, 0.1));
    }
    
    .aas-copilot-input::placeholder {
      color: var(--text-muted, rgba(255, 255, 255, 0.3));
    }
    
    .aas-copilot-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .aas-copilot-submit {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      padding: 0;
      background: linear-gradient(135deg, #00d4ff, #0099cc);
      border: none;
      border-radius: 12px;
      color: #050508;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .aas-copilot-submit:hover {
      transform: scale(1.05);
      box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
    }
    
    .aas-copilot-submit:active {
      transform: scale(0.95);
    }
    
    .aas-copilot-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    
    .aas-copilot-submit svg {
      width: 20px;
      height: 20px;
    }
    
    /* Overlay */
    .aas-copilot-overlay {
      position: fixed;
      inset: 0;
      z-index: 9994;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${CONFIG.animationDuration} ease;
    }
    
    .aas-copilot-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    /* Mobile Responsive */
    @media (max-width: 480px) {
      .aas-copilot-panel {
        width: 100vw;
      }
      
      .aas-copilot-toggle {
        bottom: 16px;
        right: 16px;
        padding: 12px 16px;
      }
      
      .aas-copilot-toggle-text {
        display: none;
      }
    }
    
    /* Keyboard shortcut hint */
    .aas-copilot-kbd {
      display: none;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: rgba(255, 255, 255, 0.5);
    }
    
    @media (min-width: 768px) {
      .aas-copilot-kbd {
        display: flex;
      }
    }
  `;

  // ============================================================================
  // HTML TEMPLATES
  // ============================================================================
  
  const ICONS = {
    robot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    wrench: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
  };

  function createToggleButton() {
    return `
      <button class="aas-copilot-toggle" id="aasCopilotToggle" aria-label="Open AAS Copilot">
        <span class="aas-copilot-toggle-badge"></span>
        ${ICONS.robot}
        <span class="aas-copilot-toggle-text">AAS Copilot</span>
        <span class="aas-copilot-kbd"><span>⌘</span><span>K</span></span>
      </button>
    `;
  }

  function createPanel() {
    return `
      <div class="aas-copilot-overlay" id="aasCopilotOverlay"></div>
      <aside class="aas-copilot-panel" id="aasCopilotPanel" role="dialog" aria-label="AAS Copilot">
        <header class="aas-copilot-header">
          <h2 class="aas-copilot-title">
            <span class="aas-copilot-title-icon">${ICONS.robot}</span>
            <span class="aas-copilot-title-text">AAS Copilot</span>
          </h2>
          <div style="display:flex;gap:8px;">
            <button class="aas-copilot-close" id="aasCopilotClear" aria-label="Clear chat" title="Clear chat">
              ${ICONS.refresh}
            </button>
            <button class="aas-copilot-close" id="aasCopilotClose" aria-label="Close">
              ${ICONS.close}
            </button>
          </div>
        </header>
        
        <div class="aas-copilot-context">
          <input type="checkbox" id="aasCopilotContextToggle" checked>
          <label for="aasCopilotContextToggle">Include page context</label>
          <span class="aas-copilot-context-info" id="aasCopilotContextInfo"></span>
        </div>
        
        <div class="aas-copilot-messages" id="aasCopilotMessages">
          <div class="aas-copilot-welcome">
            <h3>👋 Hey! I'm your AAS Copilot</h3>
            <p>I can help you with:</p>
            <ul class="aas-copilot-welcome-list">
              <li>${ICONS.zap}<span>Error codes & troubleshooting</span></li>
              <li>${ICONS.wrench}<span>Programming & learn cycles</span></li>
              <li>${ICONS.search}<span>Parts lookup</span></li>
              <li>${ICONS.book}<span>Technical specs & wiring</span></li>
            </ul>
            <p style="margin-top:16px;font-size:13px;color:rgba(255,255,255,0.5);">Just type your question below!</p>
          </div>
        </div>
        
        <form class="aas-copilot-form" id="aasCopilotForm">
          <input 
            type="text" 
            class="aas-copilot-input" 
            id="aasCopilotInput"
            placeholder="Ask about a door issue, part, or procedure..."
            autocomplete="off"
          >
          <button type="submit" class="aas-copilot-submit" id="aasCopilotSubmit" aria-label="Send">
            ${ICONS.send}
          </button>
        </form>
      </aside>
    `;
  }

  // ============================================================================
  // COPILOT CLASS
  // ============================================================================
  
  class AASCopilot {
    constructor() {
      this.isOpen = false;
      this.messages = [];
      this.isLoading = false;
      this.doorContext = null;
    }

    async init() {
      // Check if user has permission
      const hasAccess = await this.checkAccess();
      if (!hasAccess) {
        console.log('[Copilot] User does not have access');
        return;
      }

      // Inject styles
      this.injectStyles();
      
      // Inject HTML
      this.injectHTML();
      
      // Bind events
      this.bindEvents();
      
      // Detect page context
      this.detectContext();
      
      console.log('[Copilot] Initialized successfully');
    }

    async checkAccess() {
      // Wait for AASAuth to be available
      let attempts = 0;
      while (!window.AASAuth && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      
      if (!window.AASAuth) {
        console.log('[Copilot] AASAuth not found - showing copilot anyway');
        return true; // Show anyway if no auth
      }
      
      try {
        const roles = await window.AASAuth.getUserRoles();
        const hasRole = CONFIG.allowedRoles.some(r => roles.includes(r));
        console.log('[Copilot] User roles:', roles, 'Has access:', hasRole);
        return hasRole;
      } catch (e) {
        console.error('[Copilot] Error checking roles:', e);
        return false;
      }
    }

    injectStyles() {
      const style = document.createElement('style');
      style.id = 'aas-copilot-styles';
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    injectHTML() {
      // Create container
      const container = document.createElement('div');
      container.id = 'aasCopilotContainer';
      container.innerHTML = createToggleButton() + createPanel();
      document.body.appendChild(container);
    }

    bindEvents() {
      // Toggle button
      const toggle = document.getElementById('aasCopilotToggle');
      const close = document.getElementById('aasCopilotClose');
      const clear = document.getElementById('aasCopilotClear');
      const overlay = document.getElementById('aasCopilotOverlay');
      const form = document.getElementById('aasCopilotForm');

      toggle?.addEventListener('click', () => this.toggle());
      close?.addEventListener('click', () => this.close());
      clear?.addEventListener('click', () => this.clearChat());
      overlay?.addEventListener('click', () => this.close());
      form?.addEventListener('submit', (e) => this.handleSubmit(e));

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K to toggle
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          this.toggle();
        }
        // Escape to close
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
    }

    detectContext() {
      const url = new URL(window.location.href);
      const doorId = url.searchParams.get('id');
      const path = url.pathname;
      
      const contextInfo = document.getElementById('aasCopilotContextInfo');
      
      if (doorId) {
        this.doorContext = { doorId, page: path };
        if (contextInfo) contextInfo.textContent = `Door: ${doorId}`;
      } else if (path.includes('/tech/')) {
        this.doorContext = { page: path };
        if (contextInfo) contextInfo.textContent = 'Tech Portal';
      } else {
        this.doorContext = { page: path };
        if (contextInfo) contextInfo.textContent = '';
      }
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.isOpen = true;
      document.getElementById('aasCopilotPanel')?.classList.add('open');
      document.getElementById('aasCopilotOverlay')?.classList.add('open');
      document.getElementById('aasCopilotToggle')?.classList.add('active');
      document.getElementById('aasCopilotInput')?.focus();
    }

    close() {
      this.isOpen = false;
      document.getElementById('aasCopilotPanel')?.classList.remove('open');
      document.getElementById('aasCopilotOverlay')?.classList.remove('open');
      document.getElementById('aasCopilotToggle')?.classList.remove('active');
    }

    clearChat() {
      this.messages = [];
      const container = document.getElementById('aasCopilotMessages');
      if (container) {
        container.innerHTML = `
          <div class="aas-copilot-welcome">
            <h3>👋 Hey! I'm your AAS Copilot</h3>
            <p>I can help you with:</p>
            <ul class="aas-copilot-welcome-list">
              <li>${ICONS.zap}<span>Error codes & troubleshooting</span></li>
              <li>${ICONS.wrench}<span>Programming & learn cycles</span></li>
              <li>${ICONS.search}<span>Parts lookup</span></li>
              <li>${ICONS.book}<span>Technical specs & wiring</span></li>
            </ul>
            <p style="margin-top:16px;font-size:13px;color:rgba(255,255,255,0.5);">Just type your question below!</p>
          </div>
        `;
      }
    }

    async handleSubmit(e) {
      e.preventDefault();
      
      const input = document.getElementById('aasCopilotInput');
      const message = input?.value.trim();
      
      if (!message || this.isLoading) return;
      
      // Clear input
      input.value = '';
      
      // Hide welcome
      const welcome = document.querySelector('.aas-copilot-welcome');
      if (welcome) welcome.style.display = 'none';
      
      // Add user message
      this.addMessage('user', message);
      
      // Show loading
      this.setLoading(true);
      
      try {
        // Build request
        const includeContext = document.getElementById('aasCopilotContextToggle')?.checked;
        const request = {
          messages: this.messages.map(m => ({ role: m.role, content: m.content }))
        };
        
        if (includeContext && this.doorContext) {
          request.doorId = this.doorContext.doorId;
          request.doorContext = this.doorContext;
        }
        
        // Call API
        const response = await fetch(CONFIG.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Debug logging - check browser console for tool execution details
        if (data.toolsUsed) {
          console.group('[AAS Copilot] Tool Execution');
          console.log('Tools Used:', data.toolsUsed);
          console.log('Iterations:', data.iterations);
          if (data.toolCalls) {
            data.toolCalls.forEach((tc, i) => {
              console.group(`Tool ${i + 1}: ${tc.name}`);
              console.log('Input:', tc.input);
              console.log('Result:', tc.result);
              console.groupEnd();
            });
          }
          console.log('Token Usage:', data.usage);
          console.groupEnd();
        } else {
          console.log('[AAS Copilot] No tools used for this query');
        }
        
        // Add assistant message
        this.addMessage('assistant', data.response, data.manufacturer);
        
      } catch (error) {
        console.error('[Copilot] Error:', error);
        this.addMessage('assistant', `Sorry, I encountered an error: ${error.message}. Please try again.`);
      } finally {
        this.setLoading(false);
      }
    }

    addMessage(role, content, manufacturer = null) {
      this.messages.push({ role, content, timestamp: new Date() });
      
      const container = document.getElementById('aasCopilotMessages');
      const div = document.createElement('div');
      div.className = `aas-copilot-message ${role}`;
      
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let manufacturerBadge = '';
      if (manufacturer) {
        manufacturerBadge = `<span class="aas-copilot-manufacturer ${manufacturer}">${manufacturer}</span>`;
      }
      
      div.innerHTML = `
        <div class="aas-copilot-message-meta">
          <span class="aas-copilot-message-role">${role === 'user' ? 'You' : 'Copilot'}</span>
          <span>${time}</span>
        </div>
        <div class="aas-copilot-message-content">${this.escapeHtml(content)}</div>
        ${manufacturerBadge}
      `;
      
      container?.appendChild(div);
      container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }

    setLoading(loading) {
      this.isLoading = loading;
      
      const input = document.getElementById('aasCopilotInput');
      const submit = document.getElementById('aasCopilotSubmit');
      const container = document.getElementById('aasCopilotMessages');
      
      if (input) input.disabled = loading;
      if (submit) submit.disabled = loading;
      
      // Remove existing loading indicator
      const existing = document.querySelector('.aas-copilot-loading');
      if (existing) existing.remove();
      
      if (loading) {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'aas-copilot-loading';
        loadingDiv.innerHTML = `
          <div class="aas-copilot-loading-dots">
            <span></span><span></span><span></span>
          </div>
          <span>Thinking...</span>
        `;
        container?.appendChild(loadingDiv);
        container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      let html = div.innerHTML.replace(/\n/g, '<br>');

      // Convert markdown images ![alt](url) to inline images FIRST (before link conversion)
      html = html.replace(/!\[([^\]]*)\]\((https:\/\/drive\.google\.com\/thumbnail\?id=[^)]+)\)/g,
        '<br><img src="$2" alt="$1" style="max-width: 280px; max-height: 200px; border-radius: 8px; margin: 8px 0; border: 1px solid rgba(255,255,255,0.1);" loading="lazy" onerror="this.style.display=\'none\'"><br>');

      // Convert markdown links [text](url) to clickable HTML links
      html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color: #00d4ff; text-decoration: underline;">$1</a>');

      // Fallback: Convert any remaining raw Google Drive thumbnail URLs to inline images
      html = html.replace(/(https:\/\/drive\.google\.com\/thumbnail\?id=[^&\s<]+&sz=w\d+)/g,
        '<br><img src="$1" alt="Part image" style="max-width: 280px; max-height: 200px; border-radius: 8px; margin: 8px 0; border: 1px solid rgba(255,255,255,0.1);" loading="lazy" onerror="this.style.display=\'none\'"><br>');

      return html;
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  // Wait for DOM ready
  function init() {
    const copilot = new AASCopilot();
    copilot.init();
    
    // Expose globally for debugging
    window.AASCopilot = copilot;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
