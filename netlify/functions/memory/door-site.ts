/**
 * Tier 2: Door + Site Memory
 * 
 * Door memory: per-door facts, recurring patterns, resolved history.
 *   "MH-1.81 has had 3 sensor issues in 180 days — likely humidity."
 * 
 * Site memory: per-facility trends, risk flags, environment notes.
 *   "Manning has high humidity, CN1 corrosion pattern across multiple doors."
 */

import { DoorMemoryV2, DoorFacts, DoorPattern, FacilityMemoryV2, FacilityRiskFlag } from "./types";
import { loadBlob, saveBlob, buildDoorKey, buildSiteKey } from "./kv-blobs";

// -------- Door Memory --------

export async function loadDoorMemory(input: {
  customer: string;
  facility?: string;
  doorId: string;
}, seed?: Partial<DoorFacts>): Promise<DoorMemoryV2> {
  const key = buildDoorKey(input);
  const existing = await loadBlob<DoorMemoryV2>("door", key);
  if (existing && existing.v === 2) return existing;

  return {
    v: 2,
    doorKey: key,
    facts: {
      door_id: input.doorId,
      customer: input.customer,
      facility: input.facility || "unknown",
      ...seed,
    },
    patterns: [],
    lastResolved: [],
    pinnedChunkIds: [],
    updatedAt: Date.now(),
  };
}

export async function saveDoorMemory(mem: DoorMemoryV2): Promise<void> {
  mem.updatedAt = Date.now();
  await saveBlob("door", mem.doorKey, mem);
}

/**
 * Update door facts when we learn new info from tool results
 * (e.g., get_door_info returns manufacturer/model we didn't know)
 */
export function updateDoorFacts(mem: DoorMemoryV2, updates: Partial<DoorFacts>): void {
  if (updates.manufacturer && !mem.facts.manufacturer) mem.facts.manufacturer = updates.manufacturer;
  if (updates.model && !mem.facts.model) mem.facts.model = updates.model;
  if (updates.controller && !mem.facts.controller) mem.facts.controller = updates.controller;
  if (updates.door_type && !mem.facts.door_type) mem.facts.door_type = updates.door_type as DoorFacts["door_type"];
}

/**
 * Add a resolved issue to door history.
 * Kept to last 10 entries.
 */
export function addResolvedIssue(mem: DoorMemoryV2, symptom: string, fix: string, ref?: string): void {
  mem.lastResolved.push({
    date: new Date().toISOString().split("T")[0],
    symptom,
    fix,
    ref,
  });
  mem.lastResolved = mem.lastResolved.slice(-10);
}

/**
 * Merge pinned chunk IDs from current session into door memory
 */
export function mergeDoorPinned(mem: DoorMemoryV2, newIds: string[]): void {
  const merged = Array.from(new Set([...(mem.pinnedChunkIds || []), ...(newIds || [])]));
  mem.pinnedChunkIds = merged.slice(0, 12);
}

// -------- Site/Facility Memory --------

export async function loadSiteMemory(input: {
  customer: string;
  facility?: string;
}): Promise<FacilityMemoryV2> {
  const key = buildSiteKey(input);
  const existing = await loadBlob<FacilityMemoryV2>("site", key);
  if (existing && existing.v === 2) return existing;

  return {
    v: 2,
    siteKey: key,
    facts: {
      customer: input.customer,
      facility: input.facility || "unknown",
    },
    trends: [],
    riskFlags: [],
    updatedAt: Date.now(),
  };
}

export async function saveSiteMemory(mem: FacilityMemoryV2): Promise<void> {
  mem.updatedAt = Date.now();
  await saveBlob("site", mem.siteKey, mem);
}

/**
 * Add or update a risk flag for a facility
 */
export function addRiskFlag(mem: FacilityMemoryV2, flag: Omit<FacilityRiskFlag, "lastSeen">): void {
  const existing = mem.riskFlags.find(f => f.type === flag.type && f.note === flag.note);
  if (existing) {
    existing.lastSeen = Date.now();
  } else {
    mem.riskFlags.push({ ...flag, lastSeen: Date.now() });
  }
  // Keep last 20 flags
  mem.riskFlags = mem.riskFlags.slice(-20);
}

// -------- Retrieval Hints (memory → better search) --------

/**
 * Build retrieval hints from door + site memory.
 * These get appended to the search query to improve relevance.
 */
export function buildRetrievalHints(door: DoorMemoryV2 | null, site: FacilityMemoryV2 | null): string[] {
  const hints: string[] = [];

  if (door) {
    if (door.facts.manufacturer) hints.push(door.facts.manufacturer);
    if (door.facts.model) hints.push(door.facts.model);
    if (door.facts.controller) hints.push(door.facts.controller);
    if (door.facts.door_type) hints.push(door.facts.door_type);
    // Add recurring pattern tags as hints
    for (const p of door.patterns.slice(0, 3)) {
      hints.push(p.tag);
    }
  }

  if (site?.facts.environment) {
    hints.push(site.facts.environment);
  }

  return hints;
}

/**
 * Build door context string to inject into system prompt.
 */
export function buildDoorPromptBlock(door: DoorMemoryV2): string {
  const parts: string[] = [];

  parts.push("## DOOR MEMORY (from prior sessions)");
  parts.push(`Door: ${door.facts.door_id} | Customer: ${door.facts.customer} | Facility: ${door.facts.facility}`);

  if (door.facts.manufacturer) parts.push(`Manufacturer: ${door.facts.manufacturer}`);
  if (door.facts.model) parts.push(`Model: ${door.facts.model}`);
  if (door.facts.controller) parts.push(`Controller: ${door.facts.controller}`);
  if (door.facts.door_type) parts.push(`Type: ${door.facts.door_type}`);

  if (door.patterns.length > 0) {
    parts.push("\nRecurring patterns for this door:");
    for (const p of door.patterns) {
      parts.push(`- [${p.tag}] ${p.note} (confidence: ${(p.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (door.lastResolved.length > 0) {
    parts.push("\nRecent resolved issues:");
    for (const r of door.lastResolved.slice(-5)) {
      parts.push(`- ${r.date}: "${r.symptom}" → Fixed: ${r.fix}`);
    }
  }

  return parts.join("\n");
}

/**
 * Build site context string to inject into system prompt.
 */
export function buildSitePromptBlock(site: FacilityMemoryV2): string {
  const parts: string[] = [];

  if (site.facts.environment || site.riskFlags.length > 0 || site.trends.length > 0) {
    parts.push("## FACILITY MEMORY");
    parts.push(`Customer: ${site.facts.customer} | Facility: ${site.facts.facility}`);

    if (site.facts.environment) {
      parts.push(`Environment: ${site.facts.environment}`);
    }

    if (site.riskFlags.length > 0) {
      parts.push("\nFacility flags:");
      for (const f of site.riskFlags.slice(-5)) {
        parts.push(`- [${f.type}] ${f.note}`);
      }
    }

    if (site.trends.length > 0) {
      parts.push("\nRecent trends (90d):");
      for (const t of site.trends.slice(0, 5)) {
        parts.push(`- ${t.key}: ${t.count90d} occurrences`);
      }
    }
  }

  return parts.join("\n");
}
