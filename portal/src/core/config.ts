/**
 * AAS Portal Configuration
 * Single source of truth for version and settings
 */

export const CONFIG = {
  version: "4.0.0",
  appName: "AAS Portal",
  
  // API endpoints
  api: {
    // Netlify functions (current)
    netlify: {
      door: "/api/door",
      copilot: "/api/copilot",
      stats: "/api/stats",
    },
    // Droplet AI backend (future)
    ai: "https://api.aas-portal.com",
  },
  
  // Auth0 configuration - hardcoded for reliability
  auth0: {
    domain: "dev-sug5bhfoekw1qquv.us.auth0.com",
    clientId: "GKz9sY180XVddHTTRKe82QFUpd85c11W",
    audience: "https://api.aas-portal.com",
    namespace: "https://aas-portal.com",
  },
  
  // Feature flags
  features: {
    copilotEnabled: true,
    aiBackendEnabled: false, // flip when droplet is ready
  },
} as const;

/**
 * Get the full version string for display
 */
export function getVersionString(): string {
  return `${CONFIG.appName} v${CONFIG.version}`;
}

/**
 * Log version to console on load
 */
export function initVersion(): void {
  console.log(`%c${getVersionString()}`, "color: #00d4ff; font-weight: bold;");
}
