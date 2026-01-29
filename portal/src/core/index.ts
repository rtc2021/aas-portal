/**
 * AAS Portal Core
 * Main entry point - initializes auth, config, and global features
 */

import { CONFIG, initVersion, getVersionString } from "./config";
import { initAuth, getUser, isAuthenticated, login, logout, hasRole } from "./auth";
import { canAccessPage, canUseFeature, guardPage, getUserRoleDisplay } from "./rbac";
import * as api from "./api";

// Re-export everything
export {
  CONFIG,
  getVersionString,
  getUser,
  isAuthenticated,
  login,
  logout,
  hasRole,
  canAccessPage,
  canUseFeature,
  guardPage,
  getUserRoleDisplay,
  api,
};

/**
 * Initialize the portal core
 * Call this on every page load
 */
export async function initPortal(): Promise<void> {
  // Log version
  initVersion();
  
  // Initialize authentication
  await initAuth();
  
  // Update UI based on auth state
  updateAuthUI();
  
  // Initialize global Copilot if enabled and user has access
  if (CONFIG.features.copilotEnabled && canUseFeature("copilot")) {
    // Copilot will be initialized separately by the copilot-panel module
    document.body.classList.add("copilot-enabled");
  }
}

/**
 * Update UI elements based on authentication state
 */
function updateAuthUI(): void {
  const user = getUser();
  
  // Update user display elements
  const userNameEls = document.querySelectorAll("[data-user-name]");
  const userRoleEls = document.querySelectorAll("[data-user-role]");
  const userAvatarEls = document.querySelectorAll("[data-user-avatar]");
  const loginBtns = document.querySelectorAll("[data-login-btn]");
  const logoutBtns = document.querySelectorAll("[data-logout-btn]");
  const authOnlyEls = document.querySelectorAll("[data-auth-only]");
  const guestOnlyEls = document.querySelectorAll("[data-guest-only]");
  
  if (user) {
    userNameEls.forEach((el) => (el.textContent = user.name || user.email));
    userRoleEls.forEach((el) => (el.textContent = getUserRoleDisplay()));
    userAvatarEls.forEach((el) => {
      if (el instanceof HTMLImageElement && user.picture) {
        el.src = user.picture;
      }
    });
    authOnlyEls.forEach((el) => el.classList.remove("hidden"));
    guestOnlyEls.forEach((el) => el.classList.add("hidden"));
  } else {
    authOnlyEls.forEach((el) => el.classList.add("hidden"));
    guestOnlyEls.forEach((el) => el.classList.remove("hidden"));
  }
  
  // Wire up login/logout buttons
  loginBtns.forEach((btn) => btn.addEventListener("click", () => login()));
  logoutBtns.forEach((btn) => btn.addEventListener("click", () => logout()));
}

/**
 * Set page context for Copilot
 * Each page should call this with relevant context
 */
export function setPageContext(context: api.PageContext): void {
  (window as any).AAS_CONTEXT = () => context;
}

/**
 * Get current page context
 */
export function getPageContext(): api.PageContext | null {
  const contextFn = (window as any).AAS_CONTEXT;
  return typeof contextFn === "function" ? contextFn() : null;
}
