/**
 * Tier 1: Session Memory
 * 
 * Tracks the current conversation: last 10 turns, a rolling summary,
 * and pinned chunk IDs (best retrieval results to carry forward).
 * 
 * Session = one user sitting down with Copilot about a topic.
 * Key = customer/facility/doorId (or "multi-door" if no specific door).
 */

import { SessionMemoryV1, Turn } from "./types";
import { loadBlob, saveBlob, buildSessionKey } from "./kv-blobs";

const MAX_TURNS = 10;
const MAX_PINNED = 8;

export async function loadSession(input: {
  customer: string;
  facility?: string;
  doorId?: string | null;
}): Promise<SessionMemoryV1> {
  const key = buildSessionKey(input);
  const existing = await loadBlob<SessionMemoryV1>("session", key);
  if (existing && existing.v === 1) return existing;

  return {
    v: 1,
    sessionKey: key,
    summary: "",
    turns: [],
    pinnedChunkIds: [],
    toolsUsed: [],
    updatedAt: Date.now(),
  };
}

export async function saveSession(mem: SessionMemoryV1): Promise<void> {
  mem.updatedAt = Date.now();
  await saveBlob("session", mem.sessionKey, mem);
}

export function pushTurns(mem: SessionMemoryV1, userMsg: string, assistantMsg: string): void {
  const now = Date.now();
  mem.turns.push({ role: "user", content: userMsg, ts: now });
  mem.turns.push({ role: "assistant", content: assistantMsg, ts: now });
  // Keep only last MAX_TURNS turns
  mem.turns = mem.turns.slice(-MAX_TURNS);
}

export function setPinnedChunkIds(mem: SessionMemoryV1, ids: string[]): void {
  mem.pinnedChunkIds = (ids || []).slice(0, MAX_PINNED);
}

export function addToolUsed(mem: SessionMemoryV1, toolName: string): void {
  if (!mem.toolsUsed.includes(toolName)) {
    mem.toolsUsed.push(toolName);
  }
}

/**
 * Build session context string to inject into system prompt.
 * Only includes content if there's actually memory to share.
 */
export function buildSessionPromptBlock(mem: SessionMemoryV1): string {
  const parts: string[] = [];

  if (mem.summary) {
    parts.push(`## SESSION MEMORY (from prior conversation)\n${mem.summary}`);
  }

  if (mem.pinnedChunkIds.length > 0) {
    parts.push(`Pinned reference IDs from last session: ${mem.pinnedChunkIds.join(", ")}`);
  }

  return parts.join("\n\n");
}
