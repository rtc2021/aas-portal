/**
 * AAS Portal - Auth0 Authentication Module (v1.2)
 * Role-based access control with floating user badge
 * /service/ is PUBLIC - no auth required
 *
 * v1.1: applyRoleClasses(roles) for nav.css data-admin-only gating
 * v1.2: getToken() for authenticated API requests (copilot.js)
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
  'ochsner_westbank': '/westbank/', // Alias
  'manning': '/mannings/'          // Alias
};

// PUBLIC pages don't require auth
const PUBLIC_PAGES = ['/service/', '/service'];

const PAGE_ACCESS = {
  '/': { roles: ['Admin'], redirect: '/tech/parts/' },

  '/tech/command/': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/command':  { roles: ['Admin'], redirect: '/tech/parts/' },

  '/tech/parts/':   { roles: ['Admin', 'Tech'] },
  '/tech/parts':    { roles: ['Admin', 'Tech'] },

  '/tech/manuals/': { roles: ['Admin', 'Tech'] },
  '/tech/manuals':  { roles: ['Admin', 'Tech'] },

  '/tech/doors/':   { roles: ['Admin', 'Tech'] },
  '/tech/doors':    { roles: ['Admin', 'Tech'] },

  '/tech/summary/': { roles: ['Admin'], redirect: '/tech/parts/' },
  '/tech/summary':  { roles: ['Admin'], redirect: '/tech/parts/' },

  '/door/': { roles: ['Admin', 'Tech', 'Customer'] },
  '/door':  { roles: ['Admin', 'Tech', 'Customer'] },

  '/customer/command/': { roles: ['Admin', 'Customer'] },
  '/customer/command':  { roles: ['Admin', 'Customer'] },

  '/customer/': { roles: ['Admin', 'Customer'] },
  '/customer':  { roles: ['Admin', 'Customer'] },

  // Customer-specific portals
  '/westbank/': { roles: ['Admin', 'Customer'], customerId: 'westbank' },
  '/westbank':  { roles: ['Admin', 'Customer'], customerId: 'westbank' },

  '/mannings/': { roles: ['Admin', 'Customer'], customerId: 'mannings' },
  '/mannings':  { roles: ['Admin', 'Customer'], customerId: 'mannings' }
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
  const access =
    PAGE_ACCESS[path] ||
    PAGE_ACCESS[path.replace(/\/$/, '')] ||
    { roles: ['Admin', 'Tech', 'Customer'] };

  const hasRole = access.roles.some(r => roles.includes(r));

  let allowed = hasRole;
  if (hasRole && access.customerId && !roles.includes('Admin')) {
    allowed =
      customerId === access.customerId ||
      CUSTOMER_PATHS[customerId] === path ||
      CUSTOMER_PATHS[customerId] === (path.replace(/\/$/, '') + '/');
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

  switch (state) {
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

function updateFloatingUser(user, roles) {
  const badge = document.getElementById('floatingUser');
  const nameEl = document.getElementById('floatingUserName');
  const roleEl = document.getElementById('floatingUserRole');

  if (badge && user) {
    if (nameEl) nameEl.textContent = user.name || user.email || 'User';
    if (roleEl) roleEl.textContent = roles[0] || 'User';
    badge.style.display = 'flex';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

/**
 * v1.1: Apply body classes so nav.css can gate admin links without setTimeout hacks.
 * nav.css expects body.is-admin for admin-only links.
 */
function applyRoleClasses(roles) {
  const r = Array.isArray(roles) ? roles : [];
  document.body.classList.toggle('is-admin', r.includes('Admin'));
  document.body.classList.toggle('is-tech', r.includes('Tech'));
  document.body.classList.toggle('is-customer', r.includes('Customer'));
}

async function login() {
  const client = await initAuth();
  if (!client) return;

  await client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin + window.location.pathname + window.location.search
    }
  });
}

async function logout() {
  const client = await initAuth();
  if (!client) return;

  await client.logout({ logoutParams: { returnTo: window.location.origin } });
}

async function getUserRoles() {
  const client = await initAuth();
  if (!client) return [];
  try {
    const claims = await client.getIdTokenClaims();
    return claims?.[AUTH_CONFIG.namespace + '/roles'] || [];
  } catch {
    return [];
  }
}

/**
 * v1.2: Get access token for authenticated API requests (used by copilot.js)
 */
async function getToken() {
  const client = await initAuth();
  if (!client) return null;
  try {
    return await client.getTokenSilently({ authorizationParams: { audience: AUTH_CONFIG.audience } });
  } catch {
    return null;
  }
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

  // Handle Auth0 redirect callback
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

  // Get user + token claims
  const user = await client.getUser();
  const claims = await client.getIdTokenClaims();

  const roles = claims?.[AUTH_CONFIG.namespace + '/roles'] || [];
  const customerId = claims?.[AUTH_CONFIG.namespace + '/customer_id'] || null;

  console.log('[Auth] User:', user?.email, 'Roles:', roles, 'Customer:', customerId);

  // v1.1: immediately apply role classes for nav.css gating
  applyRoleClasses(roles);

  // Check page access
  const { allowed, redirect } = checkPageAccess(roles, customerId);
  if (!allowed) {
    updateAuthOverlay('denied', 'Redirecting...');
    setTimeout(() => { window.location.href = redirect; }, 500);
    return;
  }

  // Success - show page
  updateFloatingUser(user, roles);
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
