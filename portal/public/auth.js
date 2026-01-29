/**
 * AAS Portal - Auth0 Authentication Module
 * SDK loaded in page head
 */

const AUTH_CONFIG = {
  domain: 'dev-sug5bhfoekw1qquv.us.auth0.com',
  clientId: 'GKz9sYl80XVddHTTRKe82QFUpd85cl1W',
  audience: 'https://api.aas-portal.com',
  namespace: 'https://aas-portal.com'
};

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
  '/door/': { roles: ['Admin', 'Tech', 'Customer'] },
  '/door': { roles: ['Admin', 'Tech', 'Customer'] },
  '/service/': { roles: ['Admin', 'Tech', 'Customer'] },
  '/service': { roles: ['Admin', 'Tech', 'Customer'] },
};

let auth0Client = null;

// Get the createAuth0Client function from wherever the SDK exposes it
function getCreateAuth0Client() {
  // Try global first (how older versions expose it)
  if (typeof createAuth0Client === 'function') {
    return createAuth0Client;
  }
  // Try window.createAuth0Client
  if (typeof window.createAuth0Client === 'function') {
    return window.createAuth0Client;
  }
  // Try auth0 namespace (how v2.x exposes it)
  if (window.auth0 && typeof window.auth0.createAuth0Client === 'function') {
    return window.auth0.createAuth0Client;
  }
  // Try Auth0Client constructor directly
  if (typeof Auth0Client === 'function') {
    return async (config) => new Auth0Client(config);
  }
  if (window.Auth0Client) {
    return async (config) => new window.Auth0Client(config);
  }
  if (window.auth0 && window.auth0.Auth0Client) {
    return async (config) => new window.auth0.Auth0Client(config);
  }
  return null;
}

async function initAuth() {
  if (auth0Client) return auth0Client;
  
  const createClient = getCreateAuth0Client();
  if (!createClient) {
    console.error('[Auth] SDK loaded but createAuth0Client not found');
    console.log('[Auth] Available on window.auth0:', window.auth0 ? Object.keys(window.auth0) : 'undefined');
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

function checkPageAccess(roles) {
  const path = window.location.pathname;
  const access = PAGE_ACCESS[path] || PAGE_ACCESS[path.replace(/\/$/, '')] || { roles: ['Admin', 'Tech', 'Customer'] };
  const allowed = access.roles.some(r => roles.includes(r));
  return { allowed, redirect: allowed ? null : (access.redirect || '/tech/parts/') };
}

function getDefaultPage(roles) {
  if (roles.includes('Admin')) return '/';
  if (roles.includes('Tech')) return '/tech/parts/';
  if (roles.includes('Customer')) return '/door/';
  return '/tech/parts/';
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

async function handleAuth() {
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
  
  console.log('[Auth] User:', user?.email, 'Roles:', roles);
  
  // Check page access
  const { allowed, redirect } = checkPageAccess(roles);
  if (!allowed) {
    updateAuthOverlay('denied', 'Redirecting...');
    setTimeout(() => { window.location.href = redirect; }, 500);
    return;
  }
  
  // Success - show page
  updateFloatingUser(user, roles);
  updateAuthOverlay('authenticated');
}

// Export for global use
window.AASAuth = { login, logout, getUserRoles, initAuth };

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleAuth);
} else {
  handleAuth();
}
