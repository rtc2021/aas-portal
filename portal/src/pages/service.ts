/**
 * Service Detail Page Script
 * For all doors (not just fire inspections)
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
  operator?: string;
  controller?: string;
  last_service_date?: string;
  status?: string;
}

let currentDoor: DoorData | null = null;

// Initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

async function init(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const doorId = params.get("id");
  
  if (!doorId) {
    showError("No door ID provided. Use /service?id=AAS-XXX");
    return;
  }
  
  await loadDoor(doorId);
  setupCopilot();
}

async function loadDoor(doorId: string): Promise<void> {
  try {
    const response = await api.getDoor(doorId);
    
    if (response.error || !response.data) {
      throw new Error(response.error || "Door not found");
    }
    
    currentDoor = response.data as DoorData;
    
    // Set page context for Copilot
    setPageContext({
      page: "service",
      door_id: currentDoor.name || currentDoor.id,
      manufacturer: currentDoor.manufacturer,
      model: currentDoor.model,
      door_type: currentDoor.door_type,
      operator: currentDoor.operator,
      controller: currentDoor.controller,
      site_name: currentDoor.site_name,
    });
    
    document.title = `${currentDoor.name || doorId} • Service • AAS Portal`;
    
    populateUI(currentDoor);
    
    document.getElementById("loading-state")?.classList.add("hidden");
    document.getElementById("service-details")?.classList.remove("hidden");
    
    loadServiceHistory(doorId);
    loadCommonParts(currentDoor.manufacturer, currentDoor.model);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to load door");
  }
}

function populateUI(door: DoorData): void {
  setText("door-id", door.name || door.id);
  setText("door-location", door.location || "Location not specified");
  setText("site-name", door.site_name || "");
  setText("manufacturer", door.manufacturer || "—");
  setText("model", door.model || "—");
  setText("operator", door.operator || door.controller || "—");
  setText("last-service", door.last_service_date || "—");
  
  const typeTag = document.getElementById("door-type-tag");
  if (typeTag && door.door_type) {
    typeTag.textContent = door.door_type;
  }
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showError(message: string): void {
  document.getElementById("loading-state")?.classList.add("hidden");
  document.getElementById("error-state")?.classList.remove("hidden");
  const msgEl = document.getElementById("error-message");
  if (msgEl) msgEl.textContent = message;
}

function setupCopilot(): void {
  const input = document.getElementById("copilot-input") as HTMLInputElement;
  const btn = document.getElementById("copilot-submit") as HTMLButtonElement;
  const responseEl = document.getElementById("copilot-response");
  
  if (!input || !btn || !responseEl) return;
  
  const submit = async () => {
    const message = input.value.trim();
    if (!message || !currentDoor) return;
    
    btn.disabled = true;
    btn.textContent = "Thinking...";
    responseEl.classList.remove("hidden");
    responseEl.innerHTML = "<em>Analyzing...</em>";
    
    try {
      const response = await api.diagnose(
        currentDoor.name || currentDoor.id,
        message,
        {
          page: "service",
          manufacturer: currentDoor.manufacturer,
          model: currentDoor.model,
          door_type: currentDoor.door_type,
        }
      );
      
      if (response.error) throw new Error(response.error);
      
      const data = response.data;
      if (!data) throw new Error("No response");
      
      responseEl.innerHTML = formatCopilotResponse(data);
    } catch (error) {
      responseEl.innerHTML = `<span style="color:#ff4444">Error: ${error instanceof Error ? error.message : "Failed"}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Ask";
    }
  };
  
  btn.addEventListener("click", submit);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") submit();
  });
}

function formatCopilotResponse(data: api.ChatResponse): string {
  let html = "";
  
  if (data.response_text) {
    html += `<p>${escapeHtml(data.response_text)}</p>`;
  }
  
  if (data.diagnosis) {
    html += `
      <div style="margin-top:1rem;padding:0.75rem;background:rgba(0,212,255,0.1);border-radius:6px;">
        <strong>Likely Cause:</strong> ${escapeHtml(data.diagnosis.likely_cause)}<br>
        <small style="color:rgba(255,255,255,0.6)">${Math.round(data.diagnosis.confidence * 100)}% confidence • ${data.diagnosis.category}</small>
      </div>
    `;
  }
  
  if (data.checklist?.length) {
    html += `<div style="margin-top:1rem;"><strong>Steps:</strong><ol style="margin:0.5rem 0;padding-left:1.25rem;">`;
    data.checklist.forEach(item => {
      html += `<li>${escapeHtml(item.action)}</li>`;
    });
    html += `</ol></div>`;
  }
  
  if (data.parts_needed?.length) {
    html += `<div style="margin-top:1rem;"><strong>Parts:</strong><ul style="margin:0.5rem 0;padding-left:1.25rem;">`;
    data.parts_needed.forEach(part => {
      html += `<li><code>${escapeHtml(part.part_number)}</code> - ${escapeHtml(part.description)}</li>`;
    });
    html += `</ul></div>`;
  }
  
  return html || "<em>No specific diagnosis available.</em>";
}

async function loadServiceHistory(doorId: string): Promise<void> {
  const container = document.getElementById("service-history");
  if (!container) return;
  
  // Placeholder data - replace with API call
  const history = [
    { date: "2025-01-20", title: "Routine Maintenance", desc: "Lubricated tracks, checked sensors" },
    { date: "2024-12-15", title: "Sensor Replacement", desc: "Replaced motion sensor #2" },
    { date: "2024-11-01", title: "Annual Inspection", desc: "Full system check, passed" },
  ];
  
  container.innerHTML = history.map(h => `
    <div class="history-item">
      <div class="history-date">${h.date}</div>
      <div class="history-content">
        <div class="history-title">${h.title}</div>
        <div class="history-desc">${h.desc}</div>
      </div>
    </div>
  `).join("");
}

async function loadCommonParts(manufacturer?: string, model?: string): Promise<void> {
  const container = document.getElementById("common-parts");
  if (!container) return;
  
  // Placeholder - replace with API call filtered by manufacturer/model
  const parts = [
    { number: "4190-BELT", desc: "Drive Belt" },
    { number: "4190-SENS", desc: "Motion Sensor" },
    { number: "4190-CTRL", desc: "Control Board" },
  ];
  
  container.innerHTML = parts.map(p => `
    <div class="part-card">
      <div class="part-number">${p.number}</div>
      <div class="part-desc">${p.desc}</div>
    </div>
  `).join("");
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
