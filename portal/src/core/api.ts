/**
 * API Client
 * Handles requests to Netlify functions and AI backend
 */

import { CONFIG } from "./config";
import { getAccessToken } from "./auth";

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Make an authenticated API request
 */
async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getAccessToken();
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: errorText || `HTTP ${response.status}`,
        status: response.status,
      };
    }
    
    const data = await response.json();
    return { data, status: response.status };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Network error",
      status: 0,
    };
  }
}

// =============================================================================
// Netlify Function APIs (current)
// =============================================================================

/**
 * Get door details by ID
 */
export async function getDoor(doorId: string) {
  return request(`${CONFIG.api.netlify.door}?id=${encodeURIComponent(doorId)}`);
}

/**
 * Get portal stats
 */
export async function getStats() {
  return request(CONFIG.api.netlify.stats);
}

// =============================================================================
// AI Backend APIs (future - via droplet)
// =============================================================================

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  context?: PageContext;
  conversation_id?: string;
  mode?: "auto" | "diagnose" | "manual" | "parts";
}

export interface PageContext {
  page: string;
  door_id?: string;
  manufacturer?: string;
  model?: string;
  door_type?: string;
  [key: string]: unknown;
}

export interface ChatResponse {
  response_text: string;
  diagnosis?: {
    likely_cause: string;
    confidence: number;
    category: string;
  };
  checklist?: Array<{
    step: number;
    action: string;
    manual_ref?: { manual_id: string; page: number };
  }>;
  parts_needed?: Array<{
    part_number: string;
    description: string;
    quantity: number;
  }>;
  sources?: Array<{
    type: "playbook" | "manual";
    id?: string;
    manual_id?: string;
    page?: number;
    relevance: number;
  }>;
}

/**
 * Send a chat message to the AI Copilot
 * Returns a ReadableStream for streaming responses
 */
export async function chat(request: ChatRequest): Promise<Response> {
  const baseUrl = CONFIG.features.aiBackendEnabled
    ? CONFIG.api.ai
    : CONFIG.api.netlify.copilot;
  
  const token = await getAccessToken();
  
  return fetch(`${baseUrl}/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  });
}

/**
 * Quick diagnose endpoint (non-streaming, faster)
 */
export async function diagnose(
  doorId: string,
  symptom: string,
  context: Partial<PageContext>
): Promise<ApiResponse<ChatResponse>> {
  const baseUrl = CONFIG.features.aiBackendEnabled
    ? CONFIG.api.ai
    : CONFIG.api.netlify.copilot;
  
  return request(`${baseUrl}/v1/diagnose`, {
    method: "POST",
    body: JSON.stringify({
      door_id: doorId,
      symptom,
      context,
    }),
  });
}

/**
 * Search parts semantically
 */
export async function searchParts(query: string, filters?: {
  manufacturer?: string;
  category?: string;
}) {
  const baseUrl = CONFIG.features.aiBackendEnabled
    ? CONFIG.api.ai
    : "/api/search-index";
  
  return request(`${baseUrl}/v1/search`, {
    method: "POST",
    body: JSON.stringify({
      query,
      collection: "parts",
      filters,
    }),
  });
}
