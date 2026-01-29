/**
 * Command Center Page Script
 * Loads stats and recent activity
 */

import { setPageContext, api } from "../core";

// Set page context for Copilot
setPageContext({
  page: "command",
  description: "Command Center - dashboard and quick actions",
});

// Load stats on page ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadStats);
} else {
  loadStats();
}

async function loadStats(): Promise<void> {
  try {
    const response = await api.getStats();
    
    if (response.data) {
      const stats = response.data as {
        doors?: number;
        customers?: number;
        openWorkOrders?: number;
        completedThisWeek?: number;
      };
      
      updateStat("stat-doors", stats.doors);
      updateStat("stat-customers", stats.customers);
      updateStat("stat-wo-open", stats.openWorkOrders);
      updateStat("stat-wo-completed", stats.completedThisWeek);
    }
  } catch (error) {
    console.error("Failed to load stats:", error);
  }
  
  // Load recent activity
  loadRecentActivity();
}

function updateStat(elementId: string, value: number | undefined): void {
  const el = document.getElementById(elementId);
  if (el && value !== undefined) {
    el.textContent = value.toLocaleString();
  }
}

async function loadRecentActivity(): Promise<void> {
  const container = document.getElementById("recent-activity");
  if (!container) return;
  
  // For now, show placeholder data
  // In production, this would fetch from an API
  const recentItems = [
    { icon: "🚪", title: "MH-1.81 - Inspection Complete", meta: "Manning Family Children's Hospital • 2 hours ago" },
    { icon: "🔧", title: "WO-4521 - Sensor Replacement", meta: "Ochsner Westbank Campus • 5 hours ago" },
    { icon: "📋", title: "Fire Door Inspection Scheduled", meta: "15 doors at St. Tammany • Tomorrow" },
  ];
  
  container.innerHTML = recentItems.map(item => `
    <div class="recent-item">
      <div class="recent-item-icon">${item.icon}</div>
      <div class="recent-item-content">
        <div class="recent-item-title">${item.title}</div>
        <div class="recent-item-meta">${item.meta}</div>
      </div>
    </div>
  `).join("");
}
