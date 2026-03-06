/**
 * AAS Copilot Memory Types — V21 Memory Layer
 * Tier 1 (Session) + Tier 2 (Door/Site)
 * 
 * These types define the shape of all memory objects stored in Netlify Blobs.
 */

export type Role = "admin" | "tech" | "customer";

export type CopilotSourceKind =
  | "manual"
  | "playbook"
  | "nfpa"
  | "portal"
  | "sheet"
  | "limble"
  | "field_note";

export type Turn = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

// -------- Tier 1: Session memory --------

export type SessionMemoryV1 = {
  v: 1;
  sessionKey: string;
  summary: string;            // 200-300 word rollover summary from prior turns
  turns: Turn[];              // last 10 turns (rolling window)
  pinnedChunkIds: string[];   // best chunk IDs from last retrieval (carry forward)
  toolsUsed: string[];        // which tools were called this session
  updatedAt: number;
};

// -------- Tier 2: Door memory --------

export type DoorPatternTag =
  | "humidity"
  | "sensor"
  | "wiring"
  | "mechanical"
  | "operator"
  | "access_control"
  | "power"
  | "encoder"
  | "other";

export type DoorPattern = {
  tag: DoorPatternTag;
  note: string;
  confidence: number; // 0.0 - 1.0
  evidence: Array<{
    kind: "service_history" | "tech_confirmed";
    ref: string; // WO id, task id
  }>;
  lastSeen: number;
};

export type DoorFacts = {
  door_id: string;
  customer: string;
  facility: string;
  manufacturer?: string;
  model?: string;
  controller?: string;
  door_type?: "swing" | "slide" | "fold" | "revolving" | "manual" | "fire" | "unknown";
};

export type DoorMemoryV2 = {
  v: 2;
  doorKey: string;
  facts: DoorFacts;
  patterns: DoorPattern[];
  lastResolved: Array<{ date: string; symptom: string; fix: string; ref?: string }>;
  pinnedChunkIds: string[];
  updatedAt: number;
};

// -------- Tier 2: Site/Facility memory --------

export type FacilityRiskFlag = {
  type: "political" | "safety" | "compliance" | "billing" | "environmental" | "other";
  note: string;
  lastSeen: number;
};

export type FacilityMemoryV2 = {
  v: 2;
  siteKey: string;
  facts: {
    customer: string;
    facility: string;
    contacts?: Record<string, string>;
    environment?: string; // e.g. "high humidity", "coastal", "industrial"
  };
  trends: Array<{ key: string; count90d: number; lastSeen: number }>;
  riskFlags: FacilityRiskFlag[];
  updatedAt: number;
};
