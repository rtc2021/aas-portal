/**
 * Role-based memory redaction.
 * 
 * Customers should NOT see:
 *   - Field notes / internal patterns
 *   - Technician-confirmed hunches
 *   - Billing/pricing info
 *   - Other customer data
 * 
 * Techs should NOT see:
 *   - Billing/pricing details
 *   - Other customer political flags
 */

import { Role, DoorMemoryV2, FacilityMemoryV2 } from "./types";

/**
 * Filter door memory for the given role before injecting into prompt.
 */
export function redactDoorMemory(door: DoorMemoryV2, role: Role): DoorMemoryV2 {
  if (role === "admin") return door;

  const redacted = { ...door };

  if (role === "customer") {
    // Customers see basic facts only — no patterns, no resolved history
    redacted.patterns = [];
    redacted.lastResolved = [];
    redacted.pinnedChunkIds = [];
  }

  if (role === "tech") {
    // Techs see patterns but not billing-related evidence
    redacted.patterns = door.patterns.map(p => ({
      ...p,
      evidence: p.evidence.filter(e => e.kind !== "service_history" || !e.ref.includes("billing")),
    }));
  }

  return redacted;
}

/**
 * Filter site memory for the given role.
 */
export function redactSiteMemory(site: FacilityMemoryV2, role: Role): FacilityMemoryV2 {
  if (role === "admin") return site;

  const redacted = { ...site };

  if (role === "customer") {
    // Customers see nothing from site memory
    redacted.trends = [];
    redacted.riskFlags = [];
  }

  if (role === "tech") {
    // Techs see trends but not political/billing flags
    redacted.riskFlags = site.riskFlags.filter(f =>
      f.type !== "political" && f.type !== "billing"
    );
  }

  return redacted;
}
