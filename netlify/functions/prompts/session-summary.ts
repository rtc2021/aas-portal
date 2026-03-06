/**
 * Session Summary Prompt Builder
 * 
 * At the end of each Copilot interaction, we ask Claude to summarize
 * the session in 200-300 words. This summary persists and becomes
 * context for the next session about the same door/topic.
 * 
 * This is a LIGHTWEIGHT call — uses haiku model, low max_tokens.
 */

import { Turn } from "../memory/types";

export function buildSessionSummaryPrompt(input: {
  priorSummary: string;
  recentTurns: Turn[];
  finalResponse: string;
  doorId?: string;
  customer?: string;
}): string {
  return [
    "You are summarizing an automatic door service session for technician continuity.",
    "Write 150-250 words max. Be specific and factual.",
    "",
    "Include if present:",
    "- Door ID and location",
    "- Symptom or question asked",
    "- Tools used and key findings",
    "- Resolution or next steps",
    "- Parts mentioned",
    "- Any confirmed facts about the door or facility",
    "",
    "Do NOT invent facts. If uncertain, say 'uncertain'.",
    "Do NOT include greetings or filler.",
    "",
    input.doorId ? `Door ID: ${input.doorId}` : "",
    input.customer ? `Customer: ${input.customer}` : "",
    "",
    "PRIOR SESSION SUMMARY:",
    input.priorSummary || "(first session — no prior summary)",
    "",
    "RECENT CONVERSATION:",
    (input.recentTurns || [])
      .slice(-8)
      .map(t => `${t.role.toUpperCase()}: ${t.content.slice(0, 500)}`)
      .join("\n"),
    "",
    "FINAL RESPONSE:",
    (input.finalResponse || "").slice(0, 800),
    "",
    "OUTPUT: Plain text summary only. No markdown, no headers.",
  ].filter(Boolean).join("\n");
}
