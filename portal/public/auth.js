/**
 * AAS Portal - Auth0 Authentication Module v2
 * Role-based access control with customer routing
 */

const AUTH_CONFIG = {
  domain: 'dev-sug5bhfoekw1qquv.us.auth0.com',
  clientId: 'GKz9sYl80XVddHTTRKe82QFUpd85cl1W',
  audience: 'https://api.aas-portal.com',
  namespace: 'https://aas-portal.com'
};

// PUBLIC pages don't require auth
const PUBLIC_PAGES = ['/service/', '/service'];

// Default landing pages by role
const ROLE_DEFAULT_PAGES = {
  'Admin': '/tech/parts/',
  'Tech': '/tech/parts/',
  'Customer': '/customer/command/'
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
  '/tech/summary/': { roles: ['Admin', 'Tech'] },
  '/tech/summary': { roles: ['Admin', 'Tech'] },
  '/door/': { roles: ['Admin', 'Tech', 'Customer'] },
  '/door': { roles: ['Admin', 'Tech', 'Customer'] },
  '/service/': { roles: ['*'] },
  '/service': { roles: ['*'] },
  '/customer/': { roles: ['Admin', 'Customer'] },
  '/customer': { roles: ['Admin', 'Customer'] },
  '/customer/command/': { roles: ['Admin', 'Customer'] },
  '/customer/command': { roles: ['Admin', 'Customer'] },
};

const CDN_URLS = [
  'https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js',
  'https://cdn.jsdelivr.net/npm/@auth0/auth0-spa-js@2.1.3/dist/auth0-spa-js.production.js',
  'https://unpkg.com/@auth0/auth0-spa-js@2.1.3/dist/auth0-spa-js.production.js'
];

let auth0Client = null;
let sdkLoaded = false;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(url);
    script.onerror = () => reject(url);
    document.head.appendChild(script);
  });
}

async function loadAuth0SDK() {
  if (sdkLoaded) return true;
  for (const url of CDN_URLS) {
    try {
      await loadScript(url);
      await new Promise(r => setTimeout(r, 300));
      if (typeof createAuth0Client === 'function') {
        sdkLoaded = true;
        return true;
      } else if (typeof window.auth0 !== 'undefined' && typeof window.auth0.createAuth0Client === 'function') {
        window.createAuth0Client = window.auth0.createAuth0Client;
        sdkLoaded = true;
        return true;
      }
    } catch (e) {
      console.warn('[Auth] CDN failed:', url);
    }
  }
  return false;
}

async function initAuth() {
  if (auth0Client) return auth0Client;
  const loaded = await loadAuth0SDK();
  if (!loaded) {
    console.error('[Auth] Failed to load Auth0 SDK');
    return null;
  }
  try {
    auth0Client = await createAuth0Client({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: AUTH_CONFIG.audience
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true
    });
    if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return auth0Client;
  } catch (error) {
    console.error('[Auth] Init error:', error);
    return null;
  }
}

async function login() {
  const client = await initAuth();
  if (client) await client.loginWithRedirect();
}

async function logout() {
  const client = await initAuth();
  if (client) client.logout({ logoutParams: { returnTo: window.location.origin } });
}

async function isAuthenticated() {
  const client = await initAuth();
  return client ? await client.isAuthenticated() : false;
}

async function getUser() {
  const client = await initAuth();
  if (!client) return null;
  if (!(await client.isAuthenticated())) return null;
  return await client.getUser();
}

async function getUserRoles() {
  const client = await initAuth();
  if (!client) return [];
  try {
    const claims = await client.getIdTokenClaims();
    return claims?.[`${AUTH_CONFIG.namespace}/roles`] || [];
  } catch (e) {
    return [];
  }
}

async function getToken() {
  const client = await initAuth();
  if (!client) return null;
  try {
    return await client.getTokenSilently();
  } catch (e) {
    return null;
  }
}

function hasAccess(roles, requiredRoles) {
  if (requiredRoles.includes('*')) return true;
  return requiredRoles.some(r => roles.includes(r));
}

function getDefaultPageForRoles(roles) {
  // Check roles in priority order
  if (roles.includes('Admin')) return ROLE_DEFAULT_PAGES['Admin'];
  if (roles.includes('Tech')) return ROLE_DEFAULT_PAGES['Tech'];
  if (roles.includes('Customer')) {
    // Preserve customer param if present, otherwise use stored preference
    const params = new URLSearchParams(window.location.search);
    const customerParam = params.get('customer');
    const storedCustomer = localStorage.getItem('aas-customer');
    const customer = customerParam || storedCustomer;
    if (customer) {
      localStorage.setItem('aas-customer', customer);
      return `/customer/command/?customer=${customer}`;
    }
    return ROLE_DEFAULT_PAGES['Customer'];
  }
  return '/';
}

async function checkPageAccess() {
  const path = window.location.pathname;
  
  // Public pages - no auth needed
  if (PUBLIC_PAGES.some(p => path.startsWith(p))) {
    console.log('[Auth] Public page, no auth required');
    showPageContent();
    return;
  }
  
  const client = await initAuth();
  if (!client) {
    console.error('[Auth] Client not initialized');
    return;
  }
  
  const authenticated = await client.isAuthenticated();
  
  if (!authenticated) {
    // Not logged in - show login
    console.log('[Auth] Not authenticated, showing login');
    showLoginButton();
    return;
  }
  
  // Get user and roles
  const user = await client.getUser();
  const roles = await getUserRoles();
  console.log('[Auth] User:', user?.email, 'Roles:', roles);
  
  // Check page access rules
  const pageRule = PAGE_ACCESS[path] || PAGE_ACCESS[path.replace(/\/$/, '')] || PAGE_ACCESS[path + '/'];
  
  if (pageRule) {
    if (!hasAccess(roles, pageRule.roles)) {
      // No access to this page - redirect to appropriate default
      const defaultPage = getDefaultPageForRoles(roles);
      console.log('[Auth] No access to', path, '- redirecting to', defaultPage);
      window.location.href = defaultPage;
      return;
    }
  }
  
  // Has access - show content
  console.log('[Auth] Access granted to', path);
  showPageContent();
  updateUserBadge(user, roles);
  
  // Call page-specific init if defined
  if (typeof window.onPageReady === 'function') {
    window.onPageReady(user, roles);
  }
}

function showPageContent() {
  // Hide auth overlay
  const authOverlay = document.getElementById('authOverlay');
  if (authOverlay) authOverlay.classList.add('hidden');
  
  // Show page content
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.style.display = 'block';
  
  // Alternative class-based approach
  document.querySelectorAll('.page-content').forEach(el => {
    el.style.display = 'block';
  });
}

function showLoginButton() {
  const authOverlay = document.getElementById('authOverlay');
  if (authOverlay) {
    authOverlay.classList.remove('hidden');
    // Show login elements
    const loginBtn = authOverlay.querySelector('.auth-btn, #loginBtn');
    if (loginBtn) {
      loginBtn.style.display = 'inline-flex';
      loginBtn.onclick = login;
    }
    const title = authOverlay.querySelector('.auth-title');
    if (title) title.style.display = 'block';
    const subtitle = authOverlay.querySelector('.auth-subtitle');
    if (subtitle) subtitle.style.display = 'block';
  }
}

function updateUserBadge(user, roles) {
  const badge = document.getElementById('floatingUser');
  if (badge) {
    badge.style.display = 'flex';
    const nameEl = document.getElementById('floatingUserName');
    const roleEl = document.getElementById('floatingUserRole');
    if (nameEl) nameEl.textContent = user?.name || user?.email || 'User';
    if (roleEl) roleEl.textContent = roles[0] || 'User';
  }

  // Show/hide elements based on data-role attribute
  document.querySelectorAll('[data-role]').forEach(el => {
    const requiredRoles = el.dataset.role.split(',');
    const hasAccess = requiredRoles.some(r => roles.includes(r)) || requiredRoles.includes('*');
    el.style.display = hasAccess ? '' : 'none';
  });

  // Show copilot button for Tech/Admin
  const copilotBtn = document.getElementById('copilotBtn');
  const copilotTrigger = document.getElementById('copilotV3Trigger');
  const canUseCopilot = roles.includes('Admin') || roles.includes('Tech');
  
  if (copilotBtn) {
    copilotBtn.style.display = canUseCopilot ? '' : 'none';
  }
  if (copilotTrigger) {
    copilotTrigger.style.display = canUseCopilot ? '' : 'none';
  }
}

// Export for global access
window.AASAuth = {
  login,
  logout,
  isAuthenticated,
  getUser,
  getUserRoles,
  getToken,
  hasAccess,
  checkPageAccess
};

// Auto-init on page load
document.addEventListener('DOMContentLoaded', checkPageAccess);
