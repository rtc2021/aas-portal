/**
 * Auth0 SPA Authentication
 * Handles login, logout, token management
 */

import { CONFIG } from "./config";

// Auth0 SPA SDK will be loaded from CDN
declare const createAuth0Client: any;

export interface User {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
}

let auth0Client: any = null;
let currentUser: User | null = null;
let sdkLoaded = false;

// CDN URLs to try
const CDN_URLS = [
  'https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js',
  'https://cdn.jsdelivr.net/npm/@auth0/auth0-spa-js@2.1.3/dist/auth0-spa-js.production.js',
  'https://unpkg.com/@auth0/auth0-spa-js@2.1.3/dist/auth0-spa-js.production.js'
];

// Load SDK dynamically
function loadScript(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(url);
    script.onerror = () => reject(url);
    document.head.appendChild(script);
  });
}

async function loadAuth0SDK(): Promise<boolean> {
  if (sdkLoaded) return true;
  
  for (const url of CDN_URLS) {
    try {
      await loadScript(url);
      await new Promise(r => setTimeout(r, 300));
      
      if (typeof (window as any).createAuth0Client === 'function') {
        sdkLoaded = true;
        return true;
      } else if (typeof (window as any).auth0 !== 'undefined' && typeof (window as any).auth0.createAuth0Client === 'function') {
        (window as any).createAuth0Client = (window as any).auth0.createAuth0Client;
        sdkLoaded = true;
        return true;
      }
    } catch (e) {
      console.warn('[Auth] CDN failed:', url);
    }
  }
  return false;
}

/**
 * Initialize Auth0 client
 */
export async function initAuth(): Promise<void> {
  if (auth0Client) return;
  
  // Load SDK first
  const loaded = await loadAuth0SDK();
  if (!loaded) {
    console.error('[Auth] Failed to load Auth0 SDK from all CDNs');
    return;
  }

  try {
    auth0Client = await (window as any).createAuth0Client({
      domain: CONFIG.auth0.domain,
      clientId: CONFIG.auth0.clientId,
      authorizationParams: {
        audience: CONFIG.auth0.audience,
        redirect_uri: window.location.origin,
      },
      cacheLocation: "localstorage",
      useRefreshTokens: true,
    });

    // Handle redirect callback
    if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check if user is authenticated
    if (await auth0Client.isAuthenticated()) {
      const user = await auth0Client.getUser();
      const claims = await auth0Client.getIdTokenClaims();
      currentUser = {
        sub: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture,
        roles: claims?.[`${CONFIG.auth0.namespace}/roles`] || [],
      };
    }
  } catch (error) {
    console.error("Auth0 initialization failed:", error);
  }
}

/**
 * Get current authenticated user
 */
export function getUser(): User | null {
  return currentUser;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return currentUser !== null;
}

/**
 * Get access token for API calls
 */
export async function getAccessToken(): Promise<string | null> {
  if (!auth0Client) return null;
  
  try {
    return await auth0Client.getTokenSilently();
  } catch (error) {
    console.error("Failed to get access token:", error);
    return null;
  }
}

/**
 * Login with redirect
 */
export async function login(): Promise<void> {
  if (!auth0Client) return;
  await auth0Client.loginWithRedirect();
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
  if (!auth0Client) return;
  await auth0Client.logout({
    logoutParams: {
      returnTo: window.location.origin,
    },
  });
}

/**
 * Check if user has a specific role
 */
export function hasRole(role: string): boolean {
  return currentUser?.roles.includes(role) ?? false;
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(roles: string[]): boolean {
  return roles.some((role) => hasRole(role));
}
