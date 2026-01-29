/**
 * AAS Copilot Panel
 * Global AI assistant drawer that works across all portal pages
 */

import { api, getPageContext, canUseFeature } from "../core";

// Types for structured responses
interface DiagnosisBlock {
  type: "diagnosis";
  likely_cause: string;
  confidence: number;
  category: string;
}

interface ChecklistBlock {
  type: "checklist";
  items: Array<{
    step: number;
    action: string;
    manual_ref?: { manual_id: string; page: number };
  }>;
}

interface PartsBlock {
  type: "parts";
  items: Array<{
    part_number: string;
    description: string;
    quantity: number;
  }>;
}

interface SourcesBlock {
  type: "sources";
  items: Array<{
    type: "playbook" | "manual";
    id?: string;
    manual_id?: string;
    page?: number;
    relevance: number;
  }>;
}

type ResponseBlock = DiagnosisBlock | ChecklistBlock | PartsBlock | SourcesBlock;

interface Message {
  role: "user" | "assistant";
  content: string;
  blocks?: ResponseBlock[];
  timestamp: Date;
}

/**
 * Initialize the Copilot panel
 */
export function initCopilot(): void {
  if (!canUseFeature("copilot")) {
    return;
  }

  // Create and inject the Copilot HTML
  const copilotHTML = createCopilotHTML();
  document.body.insertAdjacentHTML("beforeend", copilotHTML);

  // Get elements
  const panel = document.getElementById("copilot-panel")!;
  const toggleBtn = document.getElementById("copilot-toggle")!;
  const closeBtn = document.getElementById("copilot-close")!;
  const form = document.getElementById("copilot-form") as HTMLFormElement;
  const input = document.getElementById("copilot-input") as HTMLInputElement;
  const messagesContainer = document.getElementById("copilot-messages")!;
  const contextToggle = document.getElementById("copilot-context-toggle") as HTMLInputElement;

  let isOpen = false;
  let conversationId = crypto.randomUUID();
  const messages: Message[] = [];

  // Toggle panel
  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
    toggleBtn.classList.toggle("active", isOpen);
    if (isOpen) {
      input.focus();
    }
  }

  toggleBtn.addEventListener("click", toggle);
  closeBtn.addEventListener("click", toggle);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) {
      toggle();
    }
  });

  // Handle form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    // Add user message
    addMessage({ role: "user", content: message, timestamp: new Date() });
    input.value = "";
    input.disabled = true;

    // Get context if enabled
    const context = contextToggle.checked ? getPageContext() : undefined;

    try {
      // Send to API
      const response = await api.chat({
        message,
        context: context || undefined,
        conversation_id: conversationId,
        mode: "auto",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      let assistantMessage: Message = {
        role: "assistant",
        content: "",
        blocks: [],
        timestamp: new Date(),
      };
      
      const messageEl = addMessage(assistantMessage);
      const contentEl = messageEl.querySelector(".message-content")!;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                assistantMessage.content += parsed.token;
                contentEl.textContent = assistantMessage.content;
              } else if (parsed.final) {
                // Final structured response
                assistantMessage.content = parsed.final.response_text || assistantMessage.content;
                assistantMessage.blocks = parseBlocks(parsed.final);
                renderMessage(messageEl, assistantMessage);
              }
            } catch {
              // Ignore parse errors for partial data
            }
          }
        }
      }

      // Update messages array
      messages.push(assistantMessage);
    } catch (error) {
      addMessage({
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      });
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  function addMessage(message: Message): HTMLElement {
    messages.push(message);
    const el = document.createElement("div");
    el.className = `copilot-message ${message.role}`;
    renderMessage(el, message);
    messagesContainer.appendChild(el);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return el;
  }

  function renderMessage(el: HTMLElement, message: Message): void {
    el.innerHTML = `
      <div class="message-header">
        <span class="message-role">${message.role === "user" ? "You" : "Copilot"}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="message-content">${escapeHtml(message.content)}</div>
      ${message.blocks ? renderBlocks(message.blocks) : ""}
    `;
  }

  function renderBlocks(blocks: ResponseBlock[]): string {
    return blocks.map((block) => {
      switch (block.type) {
        case "diagnosis":
          return `
            <div class="copilot-block diagnosis">
              <div class="block-header">Diagnosis</div>
              <div class="diagnosis-cause">${escapeHtml(block.likely_cause)}</div>
              <div class="diagnosis-meta">
                <span class="confidence">${Math.round(block.confidence * 100)}% confidence</span>
                <span class="category">${escapeHtml(block.category)}</span>
              </div>
            </div>
          `;
        case "checklist":
          return `
            <div class="copilot-block checklist">
              <div class="block-header">Troubleshooting Steps</div>
              <ol class="checklist-items">
                ${block.items
                  .map(
                    (item) => `
                  <li>
                    ${escapeHtml(item.action)}
                    ${item.manual_ref ? `<a href="/tech/manuals?id=${item.manual_ref.manual_id}&page=${item.manual_ref.page}" class="manual-link">Manual p.${item.manual_ref.page}</a>` : ""}
                  </li>
                `
                  )
                  .join("")}
              </ol>
            </div>
          `;
        case "parts":
          return `
            <div class="copilot-block parts">
              <div class="block-header">Parts Needed</div>
              <ul class="parts-list">
                ${block.items
                  .map(
                    (item) => `
                  <li>
                    <span class="part-number">${escapeHtml(item.part_number)}</span>
                    <span class="part-desc">${escapeHtml(item.description)}</span>
                    <span class="part-qty">×${item.quantity}</span>
                  </li>
                `
                  )
                  .join("")}
              </ul>
            </div>
          `;
        case "sources":
          return `
            <div class="copilot-block sources">
              <div class="block-header">Sources</div>
              <ul class="sources-list">
                ${block.items
                  .map(
                    (item) => `
                  <li>
                    <span class="source-type">${item.type}</span>
                    ${item.manual_id ? `<a href="/tech/manuals?id=${item.manual_id}&page=${item.page || 1}">${item.manual_id} p.${item.page}</a>` : `<span>${item.id}</span>`}
                    <span class="relevance">${Math.round(item.relevance * 100)}%</span>
                  </li>
                `
                  )
                  .join("")}
              </ul>
            </div>
          `;
        default:
          return "";
      }
    }).join("");
  }

  function parseBlocks(response: api.ChatResponse): ResponseBlock[] {
    const blocks: ResponseBlock[] = [];
    
    if (response.diagnosis) {
      blocks.push({ type: "diagnosis", ...response.diagnosis });
    }
    if (response.checklist?.length) {
      blocks.push({ type: "checklist", items: response.checklist });
    }
    if (response.parts_needed?.length) {
      blocks.push({ type: "parts", items: response.parts_needed });
    }
    if (response.sources?.length) {
      blocks.push({ type: "sources", items: response.sources });
    }
    
    return blocks;
  }
}

function createCopilotHTML(): string {
  return `
    <button id="copilot-toggle" class="copilot-toggle" aria-label="Toggle Copilot">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3z"/>
        <circle cx="9" cy="13" r="1.5"/>
        <circle cx="15" cy="13" r="1.5"/>
        <path d="M9 17h6"/>
      </svg>
      <span class="copilot-label">Copilot</span>
    </button>
    
    <aside id="copilot-panel" class="copilot-panel">
      <header class="copilot-header">
        <h2>AAS Copilot</h2>
        <button id="copilot-close" class="copilot-close" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>
      
      <div class="copilot-context">
        <label>
          <input type="checkbox" id="copilot-context-toggle" checked>
          <span>Include page context</span>
        </label>
      </div>
      
      <div id="copilot-messages" class="copilot-messages">
        <div class="copilot-welcome">
          <p>Hi! I'm your AAS Copilot. I can help with:</p>
          <ul>
            <li>Diagnosing door issues</li>
            <li>Finding parts</li>
            <li>Technical manual questions</li>
            <li>Programming guidance</li>
          </ul>
        </div>
      </div>
      
      <form id="copilot-form" class="copilot-form">
        <input 
          type="text" 
          id="copilot-input" 
          placeholder="Ask about a door issue, part, or procedure..."
          autocomplete="off"
        >
        <button type="submit" aria-label="Send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </form>
    </aside>
  `;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
