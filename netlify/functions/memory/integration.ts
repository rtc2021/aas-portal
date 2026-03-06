/**
 * AAS Copilot Memory Integration — V21
 * 
 * This module wraps around the existing copilot.mts handler.
 * It does NOT replace the tool loop — it adds memory before and after.
 * 
 * FLOW:
 *   1. beforeLoop()  — Load memory, build prompt injection, return hints
 *   2. [existing tool loop runs unchanged]
 *   3. afterLoop()   — Save turns, update pinned chunks, summarize, persist
 * 
 * USAGE IN copilot.mts:
 * 
 *   import { beforeLoop, afterLoop } from "./memory/integration";
 *   
 *   // Before Claude call:
 *   const mem = await beforeLoop({
 *     role: isAdmin ? "admin" : isTech ? "tech" : "customer",
 *     customer: body.doorContext?.customer || body.customer || "aas",
 *     facility: body.doorContext?.location || "general",
 *     doorId: body.doorId || null,
 *     userMessage: latestUserMsg,
 *   });
 *   
 *   // Inject memory into system prompt:
 *   systemPrompt += mem.promptBlock;
 *   
 *   // [run tool loop as normal]
 *   
 *   // After getting final response:
 *   await afterLoop(mem, {
 *     responseText,
 *     toolsCalled: Array.from(toolsCalledThisRequest),
 *     anthropic,  // pass the Anthropic client for summary call
 *   });
 */

import Anthropic from "@anthropic-ai/sdk";
import { Role, SessionMemoryV1, DoorMemoryV2, FacilityMemoryV2 } from "./types";
import { loadSession, saveSession, pushTurns, setPinnedChunkIds, addToolUsed, buildSessionPromptBlock } from "./session";
import { loadDoorMemory, saveDoorMemory, loadSiteMemory, saveSiteMemory, buildDoorPromptBlock, buildSitePromptBlock, buildRetrievalHints, mergeDoorPinned } from "./door-site";
import { redactDoorMemory, redactSiteMemory } from "./redaction";
import { buildSessionSummaryPrompt } from "../prompts/session-summary";

export type MemoryContext = {
  role: Role;
  customer: string;
  facility: string;
  doorId: string | null;
  userMessage: string;
  session: SessionMemoryV1;
  door: DoorMemoryV2 | null;
  site: FacilityMemoryV2;
  promptBlock: string;
  retrievalHints: string[];
};

export type BeforeLoopInput = {
  role: Role;
  customer: string;
  facility?: string;
  doorId?: string | null;
  userMessage: string;
};

export type AfterLoopInput = {
  responseText: string;
  toolsCalled: string[];
  anthropic: Anthropic;
};

/**
 * Call BEFORE the Claude tool loop.
 * Loads all relevant memory and builds prompt injection.
 */
export async function beforeLoop(input: BeforeLoopInput): Promise<MemoryContext> {
  const customer = input.customer || "aas";
  const facility = input.facility || "general";
  const doorId = input.doorId || null;
  const role = input.role;

  // Load all memory in parallel
  const [session, site] = await Promise.all([
    loadSession({ customer, facility, doorId }),
    loadSiteMemory({ customer, facility }),
  ]);

  let door: DoorMemoryV2 | null = null;
  if (doorId) {
    door = await loadDoorMemory({ customer, facility, doorId });
  }

  // Apply role-based redaction
  const redactedDoor = door ? redactDoorMemory(door, role) : null;
  const redactedSite = redactSiteMemory(site, role);

  // Build prompt block (only includes non-empty sections)
  const blocks: string[] = [];

  const sessionBlock = buildSessionPromptBlock(session);
  if (sessionBlock) blocks.push(sessionBlock);

  if (redactedDoor) {
    const doorBlock = buildDoorPromptBlock(redactedDoor);
    if (doorBlock) blocks.push(doorBlock);
  }

  const siteBlock = buildSitePromptBlock(redactedSite);
  if (siteBlock) blocks.push(siteBlock);

  const promptBlock = blocks.length > 0
    ? "\n\n# MEMORY CONTEXT\n" + blocks.join("\n\n")
    : "";

  // Build retrieval hints for better search
  const retrievalHints = buildRetrievalHints(door, site);

  return {
    role,
    customer,
    facility,
    doorId,
    userMessage: input.userMessage || "",
    session,
    door,
    site,
    promptBlock,
    retrievalHints,
  };
}

/**
 * Call AFTER the Claude tool loop completes.
 * Saves turns, updates memory, generates summary.
 */
export async function afterLoop(
  mem: MemoryContext,
  result: AfterLoopInput
): Promise<void> {
  try {
    // Push current turn pair (user message was captured in beforeLoop)
    pushTurns(mem.session, mem.userMessage, result.responseText);

    // Track tools used
    for (const tool of result.toolsCalled) {
      addToolUsed(mem.session, tool);
    }

    // Extract pinned chunk IDs from tool results
    // (Tool results that reference chunk IDs can be tracked here)
    // For now, keep existing pinned chunks
    if (mem.door) {
      mergeDoorPinned(mem.door, mem.session.pinnedChunkIds);
    }

    // Generate session summary using lightweight model
    const summaryPrompt = buildSessionSummaryPrompt({
      priorSummary: mem.session.summary,
      recentTurns: mem.session.turns.slice(-8),
      finalResponse: result.responseText,
      doorId: mem.doorId || undefined,
      customer: mem.customer,
    });

    try {
      const summaryResponse = await result.anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: summaryPrompt }],
      });

      const summaryText = summaryResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map(b => b.text)
        .join(" ");

      if (summaryText.length > 20) {
        mem.session.summary = summaryText;
      }
    } catch (err) {
      console.error("[Memory] Summary generation failed:", err);
      // Non-fatal — keep prior summary
    }

    // Save all memory in parallel
    const saves: Promise<void>[] = [
      saveSession(mem.session),
      saveSiteMemory(mem.site),
    ];
    if (mem.door) {
      saves.push(saveDoorMemory(mem.door));
    }

    await Promise.all(saves);

    console.log(`[Memory] Saved: session=${mem.session.sessionKey}, door=${mem.door?.doorKey || "none"}, site=${mem.site.siteKey}`);
  } catch (err) {
    // Memory save failures are non-fatal — log and continue
    console.error("[Memory] afterLoop error:", err);
  }
}
