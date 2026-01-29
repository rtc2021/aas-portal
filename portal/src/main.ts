/**
 * AAS Portal - Main Entry Point
 * This file is loaded on every page
 */

import "./styles/tokens.css";
import "./styles/copilot.css";
import { initPortal, CONFIG } from "./core";
import { initCopilot } from "./ui";

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

async function init(): Promise<void> {
  // Initialize core (auth, config, etc.)
  await initPortal();
  
  // Initialize Copilot panel
  if (CONFIG.features.copilotEnabled) {
    initCopilot();
  }
  
  // Set version in footer
  const versionEls = document.querySelectorAll("[data-version]");
  versionEls.forEach((el) => {
    el.textContent = `v${CONFIG.version}`;
  });
}
