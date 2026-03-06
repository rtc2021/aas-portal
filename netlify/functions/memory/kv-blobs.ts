/**
 * AAS Copilot Memory — Netlify Blobs KV Adapter
 * 
 * All memory (session, door, site) is stored in Netlify Blobs.
 * Uses global store so memory persists across all deploys.
 * 
 * Stores:
 *   "copilot-sessions" — Tier 1 session memory (30-day TTL)
 *   "copilot-doors"    — Tier 2 door memory (180-day TTL)
 *   "copilot-sites"    — Tier 2 site/facility memory (365-day TTL)
 */

import { getStore } from "@netlify/blobs";

// -------- Key normalization --------

export function normKeyPart(s: string): string {
  return (s || "unknown").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export function buildSessionKey(input: {
  customer: string;
  facility?: string;
  doorId?: string | null;
}): string {
  const c = normKeyPart(input.customer);
  const f = normKeyPart(input.facility || "general");
  const d = input.doorId ? normKeyPart(input.doorId) : "multi-door";
  return `${c}/${f}/${d}`;
}

export function buildDoorKey(input: {
  customer: string;
  facility?: string;
  doorId: string;
}): string {
  const c = normKeyPart(input.customer);
  const f = normKeyPart(input.facility || "general");
  const d = normKeyPart(input.doorId);
  return `${c}/${f}/${d}`;
}

export function buildSiteKey(input: {
  customer: string;
  facility?: string;
}): string {
  const c = normKeyPart(input.customer);
  const f = normKeyPart(input.facility || "general");
  return `${c}/${f}`;
}

// -------- Store accessors --------

function getSessionStore() {
  return getStore({ name: "copilot-sessions", consistency: "eventual" });
}

function getDoorStore() {
  return getStore({ name: "copilot-doors", consistency: "eventual" });
}

function getSiteStore() {
  return getStore({ name: "copilot-sites", consistency: "eventual" });
}

// -------- Generic CRUD --------

export async function loadBlob<T>(storeName: "session" | "door" | "site", key: string): Promise<T | null> {
  try {
    const store = storeName === "session" ? getSessionStore()
      : storeName === "door" ? getDoorStore()
      : getSiteStore();
    const data = await store.get(key, { type: "json" });
    return data as T | null;
  } catch {
    return null;
  }
}

export async function saveBlob<T>(storeName: "session" | "door" | "site", key: string, value: T): Promise<void> {
  try {
    const store = storeName === "session" ? getSessionStore()
      : storeName === "door" ? getDoorStore()
      : getSiteStore();
    await store.setJSON(key, value);
  } catch (err) {
    console.error(`[Memory] Failed to save ${storeName}/${key}:`, err);
  }
}
