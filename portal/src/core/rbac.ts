/**
 * Role-Based Access Control
 * Defines permissions and guards for different user roles
 */

import { getUser, hasAnyRole } from "./auth";

export type Role = "Admin" | "Tech" | "Customer";

export interface Permission {
  view: boolean;
  edit: boolean;
  delete: boolean;
}

/**
 * Page access rules
 */
const PAGE_ACCESS: Record<string, Role[]> = {
  "/": ["Admin", "Tech", "Customer"],
  "/tech/command": ["Admin", "Tech"],
  "/tech/parts": ["Admin", "Tech"],
  "/tech/doors": ["Admin", "Tech"],
  "/tech/manuals": ["Admin", "Tech"],
  "/tech/summary": ["Admin", "Tech"],
  "/door": ["Admin", "Tech", "Customer"], // Customer sees only their doors
  "/service": ["Admin", "Tech"],
};

/**
 * Feature access rules
 */
const FEATURE_ACCESS: Record<string, Role[]> = {
  copilot: ["Admin", "Tech"],
  "copilot:diagnose": ["Admin", "Tech"],
  "copilot:programming": ["Admin", "Tech"],
  "manuals:download": ["Admin", "Tech"],
  "parts:pricing": ["Admin"],
  "doors:edit": ["Admin"],
  "doors:delete": ["Admin"],
};

/**
 * Check if current user can access a page
 */
export function canAccessPage(path: string): boolean {
  const user = getUser();
  
  // No auth configured - allow all (dev mode)
  if (!user) return true;
  
  const normalizedPath = path.split("?")[0]; // Remove query params
  const allowedRoles = PAGE_ACCESS[normalizedPath];
  
  if (!allowedRoles) {
    console.warn(`No access rules defined for path: ${normalizedPath}`);
    return false;
  }
  
  return hasAnyRole(allowedRoles);
}

/**
 * Check if current user can use a feature
 */
export function canUseFeature(feature: string): boolean {
  const user = getUser();
  
  // No auth configured - allow all (dev mode)
  if (!user) return true;
  
  const allowedRoles = FEATURE_ACCESS[feature];
  
  if (!allowedRoles) {
    console.warn(`No access rules defined for feature: ${feature}`);
    return false;
  }
  
  return hasAnyRole(allowedRoles);
}

/**
 * Guard a page - redirect to login or show unauthorized
 */
export function guardPage(path: string): void {
  if (!canAccessPage(path)) {
    const user = getUser();
    
    if (!user) {
      // Not logged in - redirect to login
      window.location.href = `/login?redirect=${encodeURIComponent(path)}`;
    } else {
      // Logged in but unauthorized
      window.location.href = "/unauthorized";
    }
  }
}

/**
 * Get current user's role for display
 */
export function getUserRoleDisplay(): string {
  const user = getUser();
  if (!user) return "Guest";
  
  if (user.roles.includes("Admin")) return "Administrator";
  if (user.roles.includes("Tech")) return "Technician";
  if (user.roles.includes("Customer")) return "Customer";
  
  return "User";
}
