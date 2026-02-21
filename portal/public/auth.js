/**
 * AAS Portal - Auth0 Authentication Module v1.2
 * Role-based access control with dropdown user menu
 * /service/ is PUBLIC - no auth required
 */

const AUTH_CONFIG = {
  domain: 'dev-sug5bhfoekw1qquv.us.auth0.com',
  clientId: 'GKz9sYl80XVddHTTRKe82QFUpd85cl1W',
  audience: 'https://api.aas-portal.com',
  namespace: 'https://aas-portal.com'
};

// Customer ID to path mapping
const CUSTOMER_PATHS = {
  'westbank': '/westbank/',
  'mannings': '/mannings/',
  'ochsner_westbank': '/westbank/',
  'manning': '/mannings/'
};

// PUBLIC pages don't require auth
const PUBLIC_PAGES = ['/service/', '/service'];

const PAGE_ACCESS = {
  '/': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/command/': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/command': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/parts/': { roles: ['Admin', 'Tech'] },
  '/tech/parts': { roles: ['Admin', 'Tech'] },
  '/tech/manuals/': { roles: ['Admin', 'Tech'] },
  '/tech/manuals': { roles: ['Admin', 'Tech'] },
  '/tech/doors/': { roles: ['Admin', 'Tech'] },
  '/tech/doors': { roles: ['Admin', 'Tech'] },
  '/tech/summary/': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/summary': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/pricing/': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/pricing': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/door/': { roles: ['Admin', 'Tech', 'Customer'] },
  '/door': { roles: ['Admin', 'Tech', 'Customer'] },
  '/customer/command/': { roles: ['Admin', 'Customer'] },
  '/customer/command': { roles: ['Admin', 'Customer'] },
  '/customer/': { roles: ['Admin', 'Customer'] },
  '/customer': { roles: ['Admin', 'Customer'] },
  '/westbank/': { roles: ['Admin', 'Customer'], customerId: 'westbank' },
  '/westbank': { roles: ['Admin', 'Customer'], customerId: 'westbank' },
  '/mannings/': { roles: ['Admin', 'Customer'], customerId: 'mannings' },
  '/mannings': { roles: ['Admin', 'Customer'], customerId: 'mannings' },
};

let auth0Client = null;

function getCreateAuth0Client() {
  if (typeof createAuth0Client === 'function') return createAuth0Client;
  if (typeof window.createAuth0Client === 'function') return window.createAuth0Client;
  if (window.auth0 && typeof window.auth0.createAuth0Client === 'function') return window.auth0.createAuth0Client;
  if (typeof Auth0Client === 'function') return async (config) => new Auth0Client(config);
  if (window.Auth0Client) return async (config) => new window.Auth0Client(config);
  if (window.auth0 && window.auth0.Auth0Client) return async (config) => new window.auth0.Auth0Client(config);
  return null;
}

async function initAuth() {
  if (auth0Client) return auth0Client;

  const createClient = getCreateAuth0Client();
  if (!createClient) {
    console.error('[Auth] SDK not found');
    return null;
  }

  try {
    auth0Client = await createClient({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: window.location.origin + window.location.pathname,
        audience: AUTH_CONFIG.audience
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true
    });
    return auth0Client;
  } catch (e) {
    console.error('[Auth] Init failed:', e);
    return null;
  }
}

function isPublicPage() {
  const path = window.location.pathname;
  return PUBLIC_PAGES.some(p => path === p || path.startsWith(p));
}

function getDefaultPage(roles, customerId) {
  if (roles.includes('Admin')) return '/';
  if (roles.includes('Customer')) {
    if (customerId && CUSTOMER_PATHS[customerId]) return CUSTOMER_PATHS[customerId];
    return '/customer/command/';
  }
  if (roles.includes('Tech')) return '/tech/parts/';
  return '/tech/parts/';
}

function checkPageAccess(roles, customerId) {
  const path = window.location.pathname;
  const access = PAGE_ACCESS[path] || PAGE_ACCESS[path.replace(/\/$/, '')] || { roles: ['Admin', 'Tech', 'Customer'] };

  const hasRole = access.roles.some(r => roles.includes(r));
  let allowed = hasRole;
  if (hasRole && access.customerId && !roles.includes('Admin')) {
    allowed = customerId === access.customerId ||
              CUSTOMER_PATHS[customerId] === path ||
              CUSTOMER_PATHS[customerId] === path.replace(/\/$/, '') + '/';
  }

  const defaultRedirect = getDefaultPage(roles, customerId);
  return { allowed, redirect: allowed ? null : defaultRedirect };
}

function updateAuthOverlay(state, message) {
  const overlay = document.getElementById('authOverlay');
  const spinner = overlay?.querySelector('.auth-spinner');
  const loadingText = document.getElementById('authLoadingText');
  const title = overlay?.querySelector('.auth-title');
  const subtitle = overlay?.querySelector('.auth-subtitle');
  const btn = document.getElementById('authLoginBtn');
  const content = document.getElementById('pageContent');

  if (!overlay) return;

  switch(state) {
    case 'loading':
      overlay.classList.remove('hidden');
      if (spinner) spinner.style.display = 'block';
      if (loadingText) { loadingText.style.display = 'block'; loadingText.textContent = message || 'Loading...'; }
      if (title) title.style.display = 'none';
      if (subtitle) subtitle.style.display = 'none';
      if (btn) btn.style.display = 'none';
      if (content) content.style.display = 'none';
      break;
    case 'login':
      overlay.classList.remove('hidden');
      if (spinner) spinner.style.display = 'none';
      if (loadingText) loadingText.style.display = 'none';
      if (title) title.style.display = 'block';
      if (subtitle) subtitle.style.display = 'block';
      if (btn) { btn.style.display = 'inline-block'; btn.onclick = () => login(); }
      if (content) content.style.display = 'none';
      break;
    case 'denied':
      overlay.classList.remove('hidden');
      if (spinner) spinner.style.display = 'none';
      if (loadingText) { loadingText.style.display = 'block'; loadingText.textContent = message || 'Access Denied'; }
      if (title) title.style.display = 'none';
      if (subtitle) subtitle.style.display = 'none';
      if (btn) btn.style.display = 'none';
      if (content) content.style.display = 'none';
      break;
    case 'authenticated':
      overlay.classList.add('hidden');
      if (content) content.style.display = 'block';
      break;
  }
}

// =========================================================================
// USER MENU — Dynamically created dropdown (replaces static floating badge)
// =========================================================================

function getInitials(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return 'U';
}

function createUserMenu(user, roles) {
  // Remove legacy floating badge if present
  const legacy = document.getElementById('floatingUser');
  if (legacy) legacy.remove();

  // Don't double-create
  if (document.getElementById('userMenu')) return;

  const name = user.name || user.email || 'User';
  const email = user.email || '';
  const role = roles[0] || 'User';
  const initials = getInitials(user.name, user.email);
  const picture = user.picture || '';

  const menu = document.createElement('div');
  menu.id = 'userMenu';
  menu.className = 'user-menu';
  menu.innerHTML = `
    <button class="user-menu__trigger" id="userMenuTrigger" aria-expanded="false" aria-haspopup="true" title="${name}">
      ${picture
        ? `<img class="user-menu__avatar-img" src="${picture}" alt="${initials}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : ''}
      <span class="user-menu__avatar-initials" ${picture ? 'style="display:none"' : ''}>${initials}</span>
    </button>
    <div class="user-menu__dropdown" id="userMenuDropdown">
      <div class="user-menu__header">
        <div class="user-menu__avatar-lg">
          ${picture
            ? `<img src="${picture}" alt="${initials}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <span ${picture ? 'style="display:none"' : ''}>${initials}</span>
        </div>
        <div class="user-menu__identity">
          <div class="user-menu__name">${name}</div>
          <div class="user-menu__email">${email}</div>
        </div>
      </div>
      <div class="user-menu__role-badge">${role}</div>
      <div class="user-menu__divider"></div>
      <div class="user-menu__theme-slot" id="userMenuThemeSlot">
        <!-- theme.js will inject theme selector here -->
      </div>
      <div class="user-menu__divider" id="userMenuThemeDivider" style="display:none"></div>
      <button class="user-menu__item" onclick="window.AASAuth.logout()">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        Log out
      </button>
    </div>
  `;
  document.body.appendChild(menu);

  // Toggle dropdown
  const trigger = document.getElementById('userMenuTrigger');
  const dropdown = document.getElementById('userMenuDropdown');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    trigger.setAttribute('aria-expanded', isOpen);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) {
      menu.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) {
      menu.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  });
}

// =========================================================================

async function login() {
  const client = await initAuth();
  if (client) {
    await client.loginWithRedirect({
      authorizationParams: { redirect_uri: window.location.origin + window.location.pathname + window.location.search }
    });
  }
}

async function logout() {
  const client = await initAuth();
  if (client) {
    await client.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}

async function getUserRoles() {
  const client = await initAuth();
  if (!client) return [];
  try {
    const claims = await client.getIdTokenClaims();
    return claims?.[AUTH_CONFIG.namespace + '/roles'] || [];
  } catch { return []; }
}

async function getToken() {
  const client = await initAuth();
  if (!client) return null;
  try {
    return await client.getTokenSilently();
  } catch { return null; }
}

async function handleAuth() {
  // Skip auth for public pages
  if (isPublicPage()) {
    console.log('[Auth] Public page - no auth required');
    return;
  }

  updateAuthOverlay('loading', 'Initializing...');

  const client = await initAuth();
  if (!client) {
    updateAuthOverlay('login');
    return;
  }

  // Handle callback
  const params = new URLSearchParams(window.location.search);
  if (params.has('code') && params.has('state')) {
    updateAuthOverlay('loading', 'Completing sign in...');
    try {
      await client.handleRedirectCallback();
      const cleanUrl = window.location.pathname + (params.has('id') ? '?id=' + params.get('id') : '');
      window.history.replaceState({}, '', cleanUrl);
    } catch (e) {
      console.error('[Auth] Callback error:', e);
    }
  }

  // Check authentication
  const isAuth = await client.isAuthenticated();
  if (!isAuth) {
    updateAuthOverlay('login');
    return;
  }

  // Get user and roles
  const user = await client.getUser();
  const claims = await client.getIdTokenClaims();
  const roles = claims?.[AUTH_CONFIG.namespace + '/roles'] || [];
  const customerId = claims?.[AUTH_CONFIG.namespace + '/customer_id'] || null;
  const role = roles[0] || '';

  console.log('[Auth] User:', user?.email, 'Roles:', roles, 'Customer:', customerId);

  // Add role classes to body (for CSS-based visibility)
  if (roles.includes('Admin')) document.body.classList.add('is-admin');
  if (roles.includes('Tech')) document.body.classList.add('is-tech');
  if (roles.includes('Customer')) document.body.classList.add('is-customer');

  // Check page access
  const { allowed, redirect } = checkPageAccess(roles, customerId);
  if (!allowed) {
    updateAuthOverlay('denied', 'Redirecting...');
    setTimeout(() => { window.location.href = redirect; }, 500);
    return;
  }

  // Success - create user menu and show page
  createUserMenu(user, roles);
  updateAuthOverlay('authenticated');

  // Call page-specific init if defined
  if (typeof window.onPageReady === 'function') {
    try {
      window.onPageReady(user, roles, customerId);
    } catch (e) {
      console.error('[Auth] onPageReady error:', e);
    }
  }
}

// Export for global use
window.AASAuth = { login, logout, getUserRoles, getToken, initAuth };

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleAuth);
} else {
  handleAuth();
}
