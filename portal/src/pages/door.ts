/**
 * Door Detail Page Script
 * Loads door data and integrates with Copilot for diagnosis
 */

import { setPageContext, api } from "../core";

interface DoorData {
  id: string;
  name: string;
  location?: string;
  site_name?: string;
  manufacturer?: string;
  model?: string;
  door_type?: string;
  controller?: string;
  operator?: string;
  status?: string;
  last_service_date?: string;
  is_fire_door?: boolean;
}

let currentDoor: DoorData | null = null;

// Initialize on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

async function init(): Promise<void> {
  // Get door ID from URL
  const params = new URLSearchParams(window.location.search);
  const doorId = params.get("id");
  
  if (!doorId) {
    showError("No door ID provided. Please use a URL like /door?id=MH-1.81");
    return;
  }
  
  // Load door data
  await loadDoor(doorId);
  
  // Set up diagnose functionality
  setupDiagnose();
}

async function loadDoor(doorId: string): Promise<void> {
  const loadingEl = document.getElementById("loading-state");
  const errorEl = document.getElementById("error-state");
  const detailsEl = document.getElementById("door-details");
  
  try {
    const response = await api.getDoor(doorId);
    
    if (response.error || !response.data) {
      throw new Error(response.error || "Door not found");
    }
    
    currentDoor = response.data as DoorData;
    
    // Update page context for Copilot
    setPageContext({
      page: "door",
      door_id: currentDoor.id || currentDoor.name,
      manufacturer: currentDoor.manufacturer,
      model: currentDoor.model,
      door_type: currentDoor.door_type,
      controller: currentDoor.controller,
      site_name: currentDoor.site_name,
      last_service_date: currentDoor.last_service_date,
    });
    
    // Update page title
    document.title = `${currentDoor.name || doorId} • AAS Portal`;
    
    // Populate UI
    populateDoorDetails(currentDoor);
    
    // Show details, hide loading
    loadingEl?.classList.add("hidden");
    detailsEl?.classList.remove("hidden");
    
    // Load service history
    loadServiceHistory(doorId);
    
    // Check if fire door
    if (currentDoor.is_fire_door) {
      loadFireDetails(doorId);
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to load door");
  }
}

function populateDoorDetails(door: DoorData): void {
  setText("door-id", door.name || door.id);
  setText("door-location", door.location || "Location not specified");
  setText("door-site", door.site_name || "Site not specified");
  setText("door-manufacturer", door.manufacturer || "—");
  setText("door-model", door.model || "—");
  setText("door-type", door.door_type || "—");
  setText("door-controller", door.controller || door.operator || "—");
  
  // Update status badge
  const statusEl = document.querySelector(".status-badge");
  if (statusEl && door.status) {
    statusEl.textContent = door.status;
    if (door.status.toLowerCase() === "inactive") {
      statusEl.classList.add("status-inactive");
    }
  }
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showError(message: string): void {
  const loadingEl = document.getElementById("loading-state");
  const errorEl = document.getElementById("error-state");
  const errorMsgEl = document.getElementById("error-message");
  
  loadingEl?.classList.add("hidden");
  errorEl?.classList.remove("hidden");
  if (errorMsgEl) errorMsgEl.textContent = message;
}

function setupDiagnose(): void {
  const input = document.getElementById("symptom-input") as HTMLInputElement;
  const btn = document.getElementById("diagnose-btn") as HTMLButtonElement;
  const resultEl = document.getElementById("diagnose-result");
  
  if (!input || !btn || !resultEl) return;
  
  btn.addEventListener("click", async () => {
    const symptom = input.value.trim();
    if (!symptom || !currentDoor) return;
    
    btn.disabled = true;
    btn.textContent = "Diagnosing...";
    resultEl.classList.remove("hidden");
    resultEl.innerHTML = '<div class="loading-placeholder">Analyzing...</div>';
    
    try {
      const response = await api.diagnose(currentDoor.id || currentDoor.name, symptom, {
        page: "door",
        door_id: currentDoor.id || currentDoor.name,
        manufacturer: currentDoor.manufacturer,
        model: currentDoor.model,
        door_type: currentDoor.door_type,
        controller: currentDoor.controller,
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      const data = response.data;
      if (!data) {
        throw new Error("No diagnosis returned");
      }
      
      // Render diagnosis result
      resultEl.innerHTML = renderDiagnosis(data);
    } catch (error) {
      resultEl.innerHTML = `
        <div class="diagnose-error">
          <strong>Error:</strong> ${error instanceof Error ? error.message : "Failed to diagnose"}
        </div>
      `;
    } finally {
      btn.disabled = false;
      btn.textContent = "Diagnose";
    }
  });
  
  // Allow Enter key to submit
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      btn.click();
    }
  });
}

function renderDiagnosis(data: api.ChatResponse): string {
  let html = "";
  
  // Main response text
  if (data.response_text) {
    html += `<p class="diagnose-text">${escapeHtml(data.response_text)}</p>`;
  }
  
  // Diagnosis block
  if (data.diagnosis) {
    html += `
      <div class="diagnose-block">
        <div class="diagnose-block-header">Likely Cause</div>
        <div class="diagnose-cause">${escapeHtml(data.diagnosis.likely_cause)}</div>
        <div class="diagnose-meta">
          <span class="confidence">${Math.round(data.diagnosis.confidence * 100)}% confidence</span>
          <span class="category">${escapeHtml(data.diagnosis.category)}</span>
        </div>
      </div>
    `;
  }
  
  // Checklist
  if (data.checklist?.length) {
    html += `
      <div class="diagnose-block">
        <div class="diagnose-block-header">Troubleshooting Steps</div>
        <ol class="diagnose-checklist">
          ${data.checklist.map(item => `
            <li>
              ${escapeHtml(item.action)}
              ${item.manual_ref ? `<a href="/tech/manuals?id=${item.manual_ref.manual_id}&page=${item.manual_ref.page}" class="manual-link">See manual p.${item.manual_ref.page}</a>` : ""}
            </li>
          `).join("")}
        </ol>
      </div>
    `;
  }
  
  // Parts needed
  if (data.parts_needed?.length) {
    html += `
      <div class="diagnose-block">
        <div class="diagnose-block-header">Parts You May Need</div>
        <ul class="diagnose-parts">
          ${data.parts_needed.map(part => `
            <li>
              <span class="part-number">${escapeHtml(part.part_number)}</span>
              <span class="part-desc">${escapeHtml(part.description)}</span>
              <span class="part-qty">×${part.quantity}</span>
            </li>
          `).join("")}
        </ul>
      </div>
    `;
  }
  
  // Copilot CTA
  html += `
    <div class="diagnose-cta">
      <p>Need more help? Click the <strong>Copilot</strong> button for a detailed conversation.</p>
    </div>
  `;
  
  return html;
}

async function loadServiceHistory(doorId: string): Promise<void> {
  const container = document.getElementById("service-history");
  if (!container) return;
  
  // Placeholder - in production, fetch from API
  const history = [
    { date: "2025-01-15", title: "Routine Inspection", desc: "All components functioning normally. Lubricated hinges." },
    { date: "2024-12-20", title: "Sensor Adjustment", desc: "Adjusted motion sensor range. Tested activation." },
    { date: "2024-11-08", title: "Annual Maintenance", desc: "Complete maintenance performed. Replaced door seal." },
  ];
  
  container.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-date">${item.date}</div>
      <div class="history-content">
        <div class="history-title">${item.title}</div>
        <div class="history-desc">${item.desc}</div>
      </div>
    </div>
  `).join("");
}

async function loadFireDetails(doorId: string): Promise<void> {
  const section = document.getElementById("fire-section");
  const details = document.getElementById("fire-details");
  
  if (!section || !details) return;
  
  section.classList.remove("hidden");
  
  // Placeholder - in production, fetch fire inspection data
  details.innerHTML = `
    <div class="fire-info-grid">
      <div class="fire-info">
        <span class="fire-label">Last Inspection</span>
        <span class="fire-value">2025-01-10</span>
      </div>
      <div class="fire-info">
        <span class="fire-label">Next Due</span>
        <span class="fire-value">2026-01-10</span>
      </div>
      <div class="fire-info">
        <span class="fire-label">Status</span>
        <span class="fire-value fire-pass">PASS</span>
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
