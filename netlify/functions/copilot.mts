import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

// Memory layer stubs — V21 memory integration (no-op until Blobs wired)
interface MemoryContext {
  role: string;
  customer?: string;
  facility?: string;
  doorId?: string;
  userMessage?: string;
  promptBlock?: string;
}

async function beforeLoop(ctx: {
  role: string;
  customer?: string;
  facility?: string;
  doorId?: string;
  userMessage?: string;
}): Promise<MemoryContext | null> {
  return null;
}

async function afterLoop(
  memCtx: MemoryContext,
  result: { responseText: string; toolsCalled: string[]; anthropic: Anthropic }
): Promise<void> {
  return;
}

// =============================================================================
// COPILOT V21.1 — Accuracy & Isolation Patch
// =============================================================================
// V20 base: ALL retrieval goes through DROPLET (single Retrieval Gateway)
// V21 upgrade: 3-tier memory (session/door/facility) via Netlify Blobs
//   - beforeLoop() loads memory + builds prompt injection before Claude call
//   - afterLoop() saves turns + generates Haiku summary (fire-and-forget)
//   - Role redaction: admin=all, tech=no billing/political, customer=basic only
// V21.1 patch (Feb 2026):
//   - Fix #2: Pass manufacturer/door_type to droplet /search for server-side Qdrant filter
//   - Fix #3: get_work_orders uses ?assets= fast path when asset_id provided (~50 API calls → 1-10)
//   - Fix #4: Auto-inject customer filter from JWT in customer portal tool calls (tenant isolation)
//   - Fix #5: Customer system prompt now has ## Tool Routing (STRICT) section
//   - Fix #6: detectManufacturer expanded: +record, +tormax, +dormakaba
// ANSI update (Feb 2026): search_ansi156_10, search_ansi156_19, search_ansi156_38
// Tool count: 15 (admin), 14 (tech), 11 (customer)
// Models: Admin/Tech → claude-opus-4-6 | Customer → claude-sonnet-4-5-20250929
// Droplet endpoints /search-ansi156-{10,19,38} are LIVE (3 Qdrant collections, 357 total points)
// Dependency: @netlify/blobs ^8.0.0 + ./memory/ (7 files, 811 lines)
// =============================================================================

const anthropic = new Anthropic({
  apiKey: Netlify.env.get("ANTHROPIC_API_KEY"),
});

const DROPLET_URL = Netlify.env.get("DROPLET_URL");
const LIMBLE_CLIENT_ID = Netlify.env.get("LIMBLE_CLIENT_ID");
const LIMBLE_CLIENT_SECRET = Netlify.env.get("LIMBLE_CLIENT_SECRET");

// Google Sheets IDs (set in Netlify env vars or use defaults)
const PARTS_SHEET_ID = Netlify.env.get("PARTS_SHEET_ID") || "1VEC9agWIuajszDSQrz3pyJ30a3Gz_P5KO-uLWIru9Hk";
const MANUALS_SHEET_ID = Netlify.env.get("MANUALS_SHEET_ID") || "1pDacinz2vl8nioHV_mmSGmokHVO7DnzXGyVPUO5_KPU";

const LIMBLE_BASE_URL = "https://api.limblecmms.com/v2";
function getLimbleAuth(): string {
  return "Basic " + btoa(`${LIMBLE_CLIENT_ID}:${LIMBLE_CLIENT_SECRET}`);
}

// Decode base64url (JWT uses base64url, not standard base64)
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return atob(base64);
}

// Extract role and user info from Auth0 JWT
function extractUserFromToken(authHeader: string | null): {
  email?: string;
  roles: string[];
  customerId?: string;
  technicianId?: string;
} {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { roles: [] };
  }

  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) return { roles: [] };

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const namespace = 'https://aas-portal.com';

    return {
      email: payload.email,
      roles: payload[`${namespace}/roles`] || [],
      customerId: payload[`${namespace}/customer_id`],
      technicianId: getTechnicianId(payload.email)
    };
  } catch (e) {
    console.error('[Copilot] Token parse error:', e);
    return { roles: [] };
  }
}

// Map tech emails to Limble user IDs
function getTechnicianId(email?: string): string | undefined {
  if (!email) return undefined;

  const techMap: Record<string, string> = {
    'ruben@automaticaccesssolution.com': '265672',
    'support@automaticaccesssolution.com': '265670',
    'partsteam@automaticaccesssolution.com': '360229',
    'service@automaticaccesssolution.com': '265673',
    'jonas@automaticaccesssolution.com': '266967',
    'sdd101603@yahoo.com': '361996',
    'djjspadoni504@gmail.com': '359401',
    'uruben730@gmail.com': '384799',
  };

  return techMap[email.toLowerCase()];
}

// Verify Auth0 JWT token for customer portal
function verifyCustomerToken(authHeader: string | null): { valid: boolean; email?: string; customerId?: string; roles?: string[]; error?: string } {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing authorization header' };
  }

  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const namespace = 'https://aas-portal.com';

    if (payload.exp && payload.exp < Date.now() / 1000) {
      return { valid: false, error: 'Token expired' };
    }

    return {
      valid: true,
      email: payload.email,
      customerId: payload[`${namespace}/customer_id`],
      roles: payload[`${namespace}/roles`] || []
    };
  } catch (e) {
    console.error('[Copilot] Token verification error:', e);
    return { valid: false, error: 'Token verification failed' };
  }
}

// =============================================================================
// TOOL DEFINITIONS — ADMIN MODE (15 tools)
// =============================================================================
// REMOVED: search_field_knowledge (consolidated into search_manuals_rag)
// REMOVED: search_playbooks (legacy duplicate)
// REMOVED: Direct Qdrant for parts (now via droplet /search-parts)
// REMOVED: Direct Qdrant for assets (now via droplet /search-assets)
// ADDED: search_ansi156_10, search_ansi156_19, search_ansi156_38 (Feb 2026)
// =============================================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_door_info",
    description: "Get door details from Door Registry including manufacturer, model, location, customer. Use door ID in AAS-XXX, FD-XXX, or Name format like MH-1.81",
    input_schema: {
      type: "object" as const,
      properties: {
        door_id: { type: "string", description: "Door ID (AAS-XXX, FD-XXX) or Name (MH-1.81)" }
      },
      required: ["door_id"]
    }
  },
  {
    name: "search_doors",
    description: "Search for doors by customer, location, or manufacturer",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term (customer name, location, etc.)" },
        manufacturer: { type: "string", description: "Filter by manufacturer (horton, stanley, nabco, besam)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_parts",
    description: "Search parts inventory by name, part number, or description. Returns tiered results: exact matches, close matches, partial matches.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Part number, name, or description to search for" },
        manufacturer: { type: "string", description: "Filter by manufacturer" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_assets",
    description: "Search asset/door locations by name, ID, customer, or address. Use when tech asks 'where is door X', 'what doors at location Y', or needs to find a door by asset ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Asset ID, door name, location, customer name, or address" },
        customer: { type: "string", description: "Filter by customer/parent name (Manning, Ochsner, etc.)" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_work_orders",
    description: "Get work orders from Limble CMMS. Can filter by status, date, technician, or asset.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"], description: "Filter by status (default: open)" },
        date_filter: { type: "string", description: "Filter completed tasks by date: 'today', 'yesterday', 'this_week', 'this_month', or YYYY-MM-DD format" },
        asset_id: { type: "string", description: "Filter by asset/door ID" },
        user_id: { type: "string", description: "Filter by technician user ID" }
      }
    }
  },
  {
    name: "get_service_history",
    description: "Get service history for a specific door/asset from Limble",
    input_schema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "The asset/door ID to get history for" },
        days: { type: "number", description: "Number of days of history (default 365)" }
      },
      required: ["asset_id"]
    }
  },
  {
    name: "get_technicians",
    description: "Get list of technicians/users from Limble CMMS. Use to find userID for a technician by name.",
    input_schema: {
      type: "object" as const,
      properties: {
        name_filter: { type: "string", description: "Optional: filter by technician name (partial match)" }
      }
    }
  },
  {
    name: "search_manuals",
    description: "Search technical manuals database by manufacturer, controller, door type, or model. Returns links to PDF manuals in Google Drive.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term - manufacturer, controller name, model, or door type" },
        manufacturer: { type: "string", description: "Filter by manufacturer (Horton, Stanley, Besam, BEA, etc.)" },
        door_type: { type: "string", description: "Filter by door type (Slide, Swing, Sensor, etc.)" },
        controller: { type: "string", description: "Filter by controller (MC521, 4190, iQ, etc.)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_manuals_rag",
    description: "Search 29,000+ technical manual chunks AND field knowledge using AI semantic search. Returns actual content excerpts with source citations PLUS AAS tribal knowledge tips. Use this for detailed technical questions about installation, troubleshooting, programming, wiring, specifications, and maintenance procedures.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language search - describe what you're looking for" },
        manufacturer: { type: "string", description: "Filter by manufacturer: horton, stanley, besam, nabco, record, tormax" },
        door_type: { type: "string", description: "Filter by door type: slide, swing, folding, icu, fire, revolving" },
        doc_type: { type: "string", description: "Filter by document type: installation, service, programming, wiring, parts, troubleshooting" },
        component: { type: "string", description: "Filter by component: motor, controller, sensor, belt, carrier, track, gearbox" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_nfpa80",
    description: "Search NFPA 80 (2019) Fire Doors and Other Opening Protectives standard. Use for: fire door inspection requirements, annual testing, self-closing/latching, clearance gaps, labeling, fire damper inspection, door propping rules, Joint Commission compliance.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Compliance question or topic" },
        chapter: { type: "string", description: "Filter by chapter: 4=General, 5=ITM, 6=Swinging, 11=Rolling Steel, 19=Dampers, 21=Curtains" },
        healthcare_only: { type: "boolean", description: "Filter to healthcare-relevant clauses only" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_nfpa101",
    description: "Search NFPA 101 (2018) Life Safety Code. Use for: egress requirements, exit specifications, corridor widths, occupancy classifications, means of egress, travel distance, door swing direction in egress paths, panic hardware, delayed egress locks, access-controlled egress.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query for NFPA 101 Life Safety Code" },
        chapter: { type: "string", description: "Filter by chapter: 7=Means of Egress, 8=Features of Fire Protection, 12-13=Assembly, 18-19=Healthcare, 36-37=Mercantile, 38-39=Business" },
        healthcare_only: { type: "boolean", description: "Filter to healthcare-relevant sections (Ch 18-19)" },
        annex: { type: "boolean", description: "Set false to exclude explanatory annex material and return only enforceable requirements" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_nfpa105",
    description: "Search NFPA 105 (2019) Standard for Smoke Door Assemblies. Use for: smoke doors, smoke barriers, smoke compartments, horizontal exits, smoke dampers, and how smoke doors differ from fire doors.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query for NFPA 105 Smoke Door Assemblies" },
        chapter: { type: "string", description: "Filter by chapter: 4=General, 5=Installation/Testing/Maintenance, 6=Smoke Dampers, 7=Other Opening Protectives" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_ansi156_10",
    description: "Search ANSI/BHMA A156.10 (2024) Power Operated Pedestrian Doors. Use for: automatic sliding/swinging door requirements, sensor activation zones, entrapment protection, break-away egress, safety signage, pedestrian door force limits, opening/closing speeds.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query about power operated pedestrian doors" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_ansi156_19",
    description: "Search ANSI/BHMA A156.19 (2019) Power Assist & Low Energy Power Operated Swing Doors. Use for: low energy operators, power assist doors, ADA openers, knowing-act activation, swing door force/speed limits, cycle testing requirements, 300,000 cycle test.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query about power assist or low energy swing doors" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_ansi156_38",
    description: "Search ANSI/BHMA A156.38 (2019) Low Energy Power Operated Sliding & Folding Doors. Use for: low energy sliders, folding door operators, activation requirements, force limits for sliding/folding low energy doors.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query about low energy sliding or folding doors" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  }
];

// Tech tools - same as TOOLS but without get_technicians
const TECH_TOOLS: Anthropic.Tool[] = TOOLS.filter(tool =>
  tool.name !== 'get_technicians'
);

// Customer tools - NFPA codes, ANSI standards, door info, manuals, assets (11 tools)
const CUSTOMER_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_nfpa80",
    description: "Search NFPA 80 (2019) Fire Doors standard for compliance questions: inspection requirements, annual testing, self-closing/latching, clearance gaps, labeling, door propping rules.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Compliance question or topic" },
        healthcare_only: { type: "boolean", description: "Filter to healthcare-relevant clauses" },
        limit: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_nfpa101",
    description: "Search NFPA 101 (2018) Life Safety Code for egress requirements, exit specifications, corridor widths, occupancy classifications, means of egress, travel distance.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query for NFPA 101 Life Safety Code" },
        chapter: { type: "string", description: "Filter by chapter: 7=Means of Egress, 18-19=Healthcare" },
        annex: { type: "boolean", description: "Set false to exclude annex material" },
        limit: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_nfpa105",
    description: "Search NFPA 105 (2019) Standard for Smoke Door Assemblies. Use for smoke doors, smoke barriers, smoke compartments, and differences between smoke doors and fire doors.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query for NFPA 105 Smoke Door Assemblies" },
        chapter: { type: "string", description: "Filter by chapter: 4=General, 5=Installation/Testing/Maintenance" },
        limit: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_ansi156_10",
    description: "Search ANSI/BHMA A156.10 (2024) standard for power operated pedestrian door requirements including safety, sensors, entrapment protection, and signage.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Compliance question or topic about automatic doors" },
        limit: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_ansi156_19",
    description: "Search ANSI/BHMA A156.19 (2019) standard for power assist and low energy swing door requirements including ADA openers, force limits, and activation.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Compliance question about low energy or power assist swing doors" },
        limit: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_ansi156_38",
    description: "Search ANSI/BHMA A156.38 (2019) standard for low energy power operated sliding and folding door requirements.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Compliance question about low energy sliding or folding doors" },
        limit: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_manuals_rag",
    description: "Search technical manuals to understand door issues. Use this to inform your explanation to the customer, but do NOT share detailed repair steps or part numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "What you're looking for - describe the issue or topic" },
        manufacturer: { type: "string", description: "Filter by manufacturer: horton, stanley, besam, nabco, record, tormax" },
        door_type: { type: "string", description: "Filter by door type: slide, swing, folding, icu, fire, revolving" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_door_info",
    description: "Get details about a specific door including manufacturer, model, location. Use door ID format like WB-1.1 or MH-1.81",
    input_schema: {
      type: "object" as const,
      properties: {
        door_id: { type: "string", description: "Door ID (e.g., WB-1.1, MH-1.81)" }
      },
      required: ["door_id"]
    }
  },
  {
    name: "search_doors",
    description: "Search for doors by location or manufacturer. Results filtered to customer's facility only.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term (location, area, etc.)" },
        manufacturer: { type: "string", description: "Filter by manufacturer (horton, stanley, nabco, besam)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_assets",
    description: "Search asset/door locations by name, ID, customer, or address. Use when customer asks 'where is door X' or 'what doors at location Y'.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Asset ID, door name, location, customer name, or address" },
        customer: { type: "string", description: "Filter by customer/parent name" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_service_history",
    description: "Get service history for a specific door showing completed work, dates, and technician notes. Use the asset ID from door data or portal context.",
    input_schema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "The asset/door ID to get history for" },
        days: { type: "number", description: "Number of days of history (default 365)" }
      },
      required: ["asset_id"]
    }
  }
];

// =============================================================================
// TOOL EXECUTION — All retrieval now goes through DROPLET
// =============================================================================

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {

      // ====== DROPLET TOOLS (Retrieval Gateway) ======

      case "search_manuals_rag": {
        const query = input.query as string;
        const manufacturer = input.manufacturer as string | undefined;
        const docType = input.doc_type as string | undefined;
        const component = input.component as string | undefined;
        const doorType = input.door_type as string | undefined;
        const limit = Math.min((input.limit as number) || 5, 10);

        try {
          const response = await fetch(`${DROPLET_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              top_k: limit,
              ...(manufacturer && { manufacturer }),
              ...(doorType && { door_type: doorType }),
              ...(docType && { doc_type: docType }),
              ...(component && { component })
            })
          });

          if (!response.ok) {
            return JSON.stringify({ error: "Door Guru V3 search unavailable", status: response.status });
          }

          const data = await response.json();
          const manualResults = data.manual_results || [];
          const playbookResults = data.playbook_results || [];

          // Apply client-side filters if specified
          let filteredManuals = manualResults;
          if (manufacturer) {
            filteredManuals = filteredManuals.filter((r: any) =>
              (r.manufacturer || "").toLowerCase().includes(manufacturer.toLowerCase())
            );
          }
          if (doorType) {
            filteredManuals = filteredManuals.filter((r: any) => {
              const doorTypes = r.door_type ? (Array.isArray(r.door_type) ? r.door_type : [r.door_type]) : [];
              return doorTypes.some((dt: string) => dt.toLowerCase().includes(doorType.toLowerCase()));
            });
          }

          if (filteredManuals.length === 0 && playbookResults.length === 0) {
            return JSON.stringify({
              query, filters: { manufacturer, door_type: doorType },
              count: 0, message: "No matching documentation found. Try broadening your search or removing filters.",
              manual_results: [], playbook_results: []
            });
          }

          const formattedManuals = filteredManuals.slice(0, limit).map((hit: any, index: number) => ({
            rank: index + 1,
            score: hit.score ? hit.score.toFixed(3) : null,
            manufacturer: hit.manufacturer || "unknown",
            model: hit.model || null,
            doc_type: hit.doc_type || null,
            source: hit.source_pdf || hit.source || "unknown",
            drive_link: hit.drive_link || null,
            component: hit.component || null,
            door_type: hit.door_type || null,
            text: hit.text || ""
          }));

          const formattedPlaybooks = playbookResults.slice(0, 3).map((hit: any, index: number) => ({
            rank: index + 1,
            score: hit.score ? hit.score.toFixed(3) : null,
            category: hit.category || null,
            trigger: hit.trigger || null,
            action: hit.action || null,
            why: hit.why || null,
            manufacturer: hit.manufacturer || null,
            equipment: hit.equipment || null
          }));

          return JSON.stringify({
            query, filters: { manufacturer, door_type: doorType },
            count: formattedManuals.length,
            manual_results: formattedManuals,
            playbook_results: formattedPlaybooks,
            playbook_count: formattedPlaybooks.length
          });

        } catch (error) {
          return JSON.stringify({ error: "Failed to search Door Guru V3", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      case "search_nfpa80": {
        const query = input.query as string;
        const chapter = input.chapter as string | undefined;
        const healthcareOnly = input.healthcare_only as boolean | undefined;
        const limit = Math.min((input.limit as number) || 5, 10);

        try {
          const response = await fetch(`${DROPLET_URL}/search-nfpa80`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, chapter, healthcare_only: healthcareOnly, limit })
          });

          if (!response.ok) {
            return JSON.stringify({ error: "NFPA 80 search unavailable", status: response.status });
          }

          const data = await response.json();

          if (!data.results || data.results.length === 0) {
            return JSON.stringify({
              standard: "NFPA 80", edition: 2019, query, results: [],
              message: "No relevant NFPA 80 fire door sections found."
            });
          }

          // Normalize to same schema as NFPA 101/105
          return JSON.stringify({
            standard: "NFPA 80",
            edition: 2019,
            query,
            filters: { chapter, healthcare_only: healthcareOnly },
            results: data.results.map((r: any) => ({
              section: r.section_key || r.section || r.chapter || "N/A",
              chapter: r.chapter || null,
              title: r.title || r.chapter_title || null,
              score: r.score ? parseFloat((r.score).toFixed(3)) : (r.compliance_score || null),
              text: r.text || "",
            }))
          });
        } catch (error) {
          return JSON.stringify({ error: "Failed to search NFPA 80", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      case "search_nfpa101": {
        const query = input.query as string;
        const chapter = input.chapter as string | undefined;
        const healthcareOnly = input.healthcare_only as boolean | undefined;
        const annex = input.annex as boolean | undefined;
        const limit = Math.min((input.limit as number) || 5, 10);

        try {
          const response = await fetch(`${DROPLET_URL}/search-nfpa101`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, chapter, healthcare_only: healthcareOnly, annex, top_k: limit })
          });

          if (!response.ok) {
            return JSON.stringify({ error: "NFPA 101 search unavailable", status: response.status });
          }

          const data = await response.json();

          if (!data.results || data.results.length === 0) {
            return JSON.stringify({
              standard: "NFPA 101", edition: 2018, query, results: [],
              message: "No relevant NFPA 101 Life Safety Code sections found."
            });
          }

          // Standardized format — same schema as NFPA 80
          return JSON.stringify({
            standard: "NFPA 101",
            edition: 2018,
            query,
            filters: { chapter, healthcare_only: healthcareOnly, annex },
            results: data.results.map((r: any) => ({
              section: r.section || r.chapter || "N/A",
              chapter: r.chapter || null,
              title: r.title || r.chapter_title || null,
              score: r.score ? parseFloat((r.score).toFixed(3)) : null,
              text: r.text || "",
            }))
          });
        } catch (error) {
          return JSON.stringify({ error: "Failed to search NFPA 101", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      case "search_nfpa105": {
        const query = input.query as string;
        const chapter = input.chapter as string | undefined;
        const limit = Math.min((input.limit as number) || 5, 10);

        try {
          const response = await fetch(`${DROPLET_URL}/search-nfpa105`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, chapter, top_k: limit })
          });

          if (!response.ok) {
            return JSON.stringify({ error: "NFPA 105 search unavailable", status: response.status });
          }

          const data = await response.json();

          if (!data.results || data.results.length === 0) {
            return JSON.stringify({
              standard: "NFPA 105", edition: 2019, query, results: [],
              message: "No relevant NFPA 105 Smoke Door Assembly sections found."
            });
          }

          // Standardized format — same schema as NFPA 80
          return JSON.stringify({
            standard: "NFPA 105",
            edition: 2019,
            query,
            filters: { chapter },
            results: data.results.map((r: any) => ({
              section: r.section || r.chapter || "N/A",
              chapter: r.chapter || null,
              title: r.title || r.chapter_title || null,
              score: r.score ? parseFloat((r.score).toFixed(3)) : null,
              text: r.text || "",
            }))
          });
        } catch (error) {
          return JSON.stringify({ error: "Failed to search NFPA 105", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      // ====== ANSI/BHMA STANDARDS (A156.10, A156.19, A156.38) ======

      case "search_ansi156_10":
      case "search_ansi156_19":
      case "search_ansi156_38": {
        const query = input.query as string;
        const limit = Math.min((input.limit as number) || 5, 10);

        const endpointMap: Record<string, { url: string; standard: string; edition: number; title: string }> = {
          search_ansi156_10: { url: "/search-ansi156-10", standard: "ANSI/BHMA A156.10", edition: 2024, title: "Power Operated Pedestrian Doors" },
          search_ansi156_19: { url: "/search-ansi156-19", standard: "ANSI/BHMA A156.19", edition: 2019, title: "Power Assist & Low Energy Swing Doors" },
          search_ansi156_38: { url: "/search-ansi156-38", standard: "ANSI/BHMA A156.38", edition: 2019, title: "Low Energy Sliding & Folding Doors" },
        };

        const ep = endpointMap[name];

        try {
          const response = await fetch(`${DROPLET_URL}${ep.url}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, limit })
          });

          if (!response.ok) {
            return JSON.stringify({ error: `${ep.standard} search unavailable`, status: response.status });
          }

          const data = await response.json();

          if (!data.results || data.results.length === 0) {
            return JSON.stringify({
              standard: ep.standard, edition: ep.edition, query, results: [],
              message: `No relevant ${ep.standard} ${ep.title} sections found.`
            });
          }

          return JSON.stringify({
            standard: ep.standard,
            edition: ep.edition,
            query,
            results: data.results.map((r: any) => ({
              section: r.section || r.chapter || "N/A",
              chapter: r.chapter || null,
              title: r.title || r.section_title || null,
              score: r.score ? parseFloat((r.score).toFixed(3)) : null,
              text: r.text || "",
            }))
          });
        } catch (error) {
          return JSON.stringify({ error: `Failed to search ${ep.standard}`, details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      case "search_parts": {
        const query = (input.query as string).trim();
        const manufacturer = input.manufacturer as string | undefined;

        try {
          // Route through droplet Retrieval Gateway
          const response = await fetch(`${DROPLET_URL}/search-parts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, manufacturer })
          });

          if (!response.ok) {
            return JSON.stringify({ error: "Parts search unavailable", status: response.status });
          }

          return await response.text();
        } catch (error) {
          return JSON.stringify({ error: "Failed to search parts", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      case "search_assets": {
        const query = (input.query as string).trim();
        const customer = input.customer as string | undefined;

        try {
          // Route through droplet Retrieval Gateway
          const response = await fetch(`${DROPLET_URL}/search-assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, customer })
          });

          if (!response.ok) {
            return JSON.stringify({ error: "Asset search unavailable", status: response.status });
          }

          return await response.text();
        } catch (error) {
          return JSON.stringify({ error: "Failed to search assets", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      // ====== DROPLET DOOR LOOKUP ======

      case "get_door_info": {
        const doorId = input.door_id as string;
        try {
          const response = await fetch(`${DROPLET_URL}/door-info`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ door_id: doorId })
          });
          if (!response.ok) return JSON.stringify({ error: `Door not found: ${doorId}` });
          return await response.text();
        } catch (error) {
          return JSON.stringify({ error: `Failed to look up door: ${doorId}`, details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      case "search_doors": {
        const query = input.query as string;
        const mfr = input.manufacturer as string | undefined;
        const customer = input.customer as string | undefined;
        // Route through droplet search-assets (same Qdrant collection)
        const searchQuery = mfr ? `${mfr} ${query}` : query;
        const searchBody: Record<string, string> = { query: searchQuery };
        if (customer) searchBody.customer = customer;
        try {
          const response = await fetch(`${DROPLET_URL}/search-assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(searchBody)
          });
          if (!response.ok) {
            return JSON.stringify({ error: "Door search unavailable", status: response.status });
          }
          return await response.text();
        } catch (error) {
          return JSON.stringify({ error: "Failed to search doors", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      // ====== GOOGLE SHEETS TOOLS ======

      case "search_manuals": {
        const query = (input.query as string).toLowerCase();
        const mfrFilter = input.manufacturer as string | undefined;
        const doorTypeFilter = input.door_type as string | undefined;
        const controllerFilter = input.controller as string | undefined;
        
        if (!MANUALS_SHEET_ID) {
          return JSON.stringify({ error: "Manuals database not configured." });
        }
        
        const MANUALS_CSV_URL = `https://docs.google.com/spreadsheets/d/${MANUALS_SHEET_ID}/export?format=csv`;
        
        try {
          const response = await fetch(MANUALS_CSV_URL);
          if (!response.ok) {
            return JSON.stringify({ error: "Failed to fetch manuals database", status: response.status });
          }
          
          const csvText = await response.text();
          const lines = csvText.split('\n');
          
          if (lines.length < 2) {
            return JSON.stringify({ error: "Manuals sheet is empty or invalid" });
          }
          
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
          
          const findCol = (exact: string, partial?: string) => {
            let idx = headers.indexOf(exact);
            if (idx === -1 && partial) idx = headers.findIndex(h => h.includes(partial));
            return idx;
          };
          
          const mfrCol = findCol('manufacturer');
          const productCol = findCol('productline');
          const doorTypeCol = findCol('doortype_final', 'doortype');
          const controllerCol = findCol('controller');
          const modelCol = findCol('model');
          const fileCol = findCol('filename');
          const linkCol = findCol('drivelink');
          const tagsCol = findCol('tags');
          
          const results: any[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            const values: string[] = [];
            let current = '';
            let inQuotes = false;
            for (const char of line) {
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            values.push(current.trim());
            
            const manufacturer = mfrCol >= 0 ? values[mfrCol] || '' : '';
            const productLine = productCol >= 0 ? values[productCol] || '' : '';
            const doorType = doorTypeCol >= 0 ? values[doorTypeCol] || '' : '';
            const controller = controllerCol >= 0 ? values[controllerCol] || '' : '';
            const model = modelCol >= 0 ? values[modelCol] || '' : '';
            const fileName = fileCol >= 0 ? values[fileCol] || '' : '';
            const driveLink = linkCol >= 0 ? values[linkCol] || '' : '';
            const tags = tagsCol >= 0 ? values[tagsCol] || '' : '';
            
            const searchText = `${manufacturer} ${productLine} ${doorType} ${controller} ${model} ${fileName} ${tags}`.toLowerCase();
            
            const manualSynonyms: Record<string, string[]> = {
              'manual': ['guide', 'instructions', 'handbook'],
              'guide': ['manual', 'instructions'],
              'install': ['installation', 'setup'],
              'installation': ['install', 'setup'],
              'service': ['maintenance', 'repair'],
              'maintenance': ['service', 'repair'],
              'slide': ['slider', 'sliding'],
              'slider': ['slide', 'sliding'],
              'swing': ['swinging'],
              'fold': ['folding', 'bifold']
            };
            
            const queryWords = query.split(/\s+/).filter(w => w.length > 0);
            let matchCount = 0;
            
            for (const word of queryWords) {
              if (searchText.includes(word)) {
                matchCount++;
              } else {
                const synonyms = manualSynonyms[word] || [];
                if (synonyms.some(syn => searchText.includes(syn))) {
                  matchCount++;
                }
              }
            }
            
            const minRequired = queryWords.length <= 2 ? queryWords.length : Math.ceil(queryWords.length / 2);
            if (matchCount < minRequired) continue;
            
            if (mfrFilter && !manufacturer.toLowerCase().includes(mfrFilter.toLowerCase())) continue;
            if (doorTypeFilter && !doorType.toLowerCase().includes(doorTypeFilter.toLowerCase())) continue;
            if (controllerFilter && !controller.toLowerCase().includes(controllerFilter.toLowerCase())) continue;
            
            results.push({ manufacturer, productLine, doorType, controller, model, fileName, driveLink: driveLink || null, tags, matchScore: matchCount });
          }
          
          results.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
          const finalResults = results.slice(0, 30).map(({ matchScore, ...rest }: any) => rest);
          
          return JSON.stringify({
            query, filters: { manufacturer: mfrFilter, doorType: doorTypeFilter, controller: controllerFilter },
            count: finalResults.length, manuals: finalResults
          });
          
        } catch (error) {
          return JSON.stringify({ error: "Failed to search manuals", details: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      // ====== LIMBLE CMMS TOOLS ======

      case "get_work_orders": {
        const status = (input.status as string) || "open";
        const dateFilter = input.date_filter as string | undefined;
        const assetId = input.asset_id as string | undefined;
        const userId = input.user_id as string | undefined;
        
        const COMPLETED_STATUS_IDS = [2, 3100];
        const OPEN_STATUS_IDS = [0, 1, 2969];

        let allTasks: any[] = [];
        let maxPage = 0;

        if (assetId && !userId) {
          // FAST PATH: server-side filter via ?assets= (1-10 calls vs ~50)
          let page = 1;
          const maxPages = 10;
          while (page <= maxPages) {
            const url = `${LIMBLE_BASE_URL}/tasks?assets=${assetId}&limit=100&page=${page}`;
            const resp = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
            if (!resp.ok) {
              if (page === 1) return JSON.stringify({ error: "Failed to fetch work orders for asset" });
              break;
            }
            const data = await resp.json();
            const tasks = Array.isArray(data) ? data : (data.data || data.tasks || []);
            if (tasks.length === 0) break;
            allTasks = allTasks.concat(tasks);
            if (tasks.length < 100) break;
            page++;
          }
          maxPage = page;
        } else {
          // FULL SCAN: no asset filter — need all tasks for dashboard/date queries
          const findLastPage = async (): Promise<number> => {
            let low = 1, high = 100, lastPage = 1;
            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const resp = await fetch(`${LIMBLE_BASE_URL}/tasks?page=${mid}&limit=100`, {
                headers: { Authorization: getLimbleAuth() }
              });
              if (!resp.ok) break;
              const data = await resp.json();
              const tasks = Array.isArray(data) ? data : (data.data || data.tasks || []);
              if (tasks.length > 0) {
                lastPage = mid;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
            return lastPage;
          };

          maxPage = await findLastPage();
          const pagesToFetch = Math.min(maxPage, 50);

          for (let page = maxPage; page >= Math.max(1, maxPage - pagesToFetch + 1); page--) {
            const url = `${LIMBLE_BASE_URL}/tasks?page=${page}&limit=100`;
            const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
            if (!response.ok) continue;
            const data = await response.json();
            const tasks = Array.isArray(data) ? data : (data.data || data.tasks || []);
            allTasks = allTasks.concat(tasks);
          }
        }
        
        allTasks.sort((a: any, b: any) => {
          const aDate = a.dateCompleted || 0;
          const bDate = b.dateCompleted || 0;
          return bDate - aDate;
        });
        
        let tasks = allTasks;
        
        const getDateRangeUnix = (filter: string): { start: number; end: number } | null => {
          const centralNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          const year = centralNow.getFullYear();
          const month = centralNow.getMonth();
          const day = centralNow.getDate();
          
          let startDate: Date;
          let endDate: Date;
          
          if (filter === 'today') {
            startDate = new Date(year, month, day, 0, 0, 0);
            endDate = new Date(year, month, day, 23, 59, 59);
          } else if (filter === 'yesterday') {
            startDate = new Date(year, month, day - 1, 0, 0, 0);
            endDate = new Date(year, month, day - 1, 23, 59, 59);
          } else if (filter === 'this_week') {
            const dayOfWeek = centralNow.getDay();
            startDate = new Date(year, month, day - dayOfWeek, 0, 0, 0);
            endDate = new Date(year, month, day, 23, 59, 59);
          } else if (filter === 'this_month') {
            startDate = new Date(year, month, 1, 0, 0, 0);
            endDate = new Date(year, month, day, 23, 59, 59);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) {
            const [y, m, d] = filter.split('-').map(Number);
            startDate = new Date(y, m - 1, d, 0, 0, 0);
            endDate = new Date(y, m - 1, d, 23, 59, 59);
          } else {
            return null;
          }
          
          return {
            start: Math.floor(startDate.getTime() / 1000),
            end: Math.floor(endDate.getTime() / 1000)
          };
        };
        
        const isCompleted = (t: any) => COMPLETED_STATUS_IDS.includes(t.statusID);
        const isOpen = (t: any) => OPEN_STATUS_IDS.includes(t.statusID) || t.statusID === undefined;
        
        const now = Math.floor(Date.now() / 1000);
        const oneYearAgoUnix = now - (365 * 24 * 60 * 60);
        const totalTasks = tasks.length;
        
        const completedThisYear = tasks.filter((t: any) => 
          isCompleted(t) && t.dateCompleted && t.dateCompleted >= oneYearAgoUnix
        ).length;
        const openTasks = tasks.filter((t: any) => isOpen(t)).length;
        
        const todayRange = getDateRangeUnix('today');
        const completedToday = todayRange ? tasks.filter((t: any) => 
          isCompleted(t) && t.dateCompleted && t.dateCompleted >= todayRange.start && t.dateCompleted <= todayRange.end
        ).length : 0;
        
        if (status === "open") {
          tasks = tasks.filter((t: any) => isOpen(t));
        } else if (status === "completed") {
          tasks = tasks.filter((t: any) => isCompleted(t));
          
          if (dateFilter) {
            const range = getDateRangeUnix(dateFilter);
            if (range) {
              tasks = tasks.filter((t: any) => 
                t.dateCompleted && t.dateCompleted >= range.start && t.dateCompleted <= range.end
              );
            }
          } else {
            const sevenDaysAgoUnix = now - (7 * 24 * 60 * 60);
            tasks = tasks.filter((t: any) => t.dateCompleted && t.dateCompleted >= sevenDaysAgoUnix);
          }
        } else if (status === "all" && dateFilter) {
          const range = getDateRangeUnix(dateFilter);
          if (range) {
            tasks = tasks.filter((t: any) => {
              if (isCompleted(t) && t.dateCompleted) {
                return t.dateCompleted >= range.start && t.dateCompleted <= range.end;
              }
              return true;
            });
          }
        }
        
        if (assetId) {
          tasks = tasks.filter((t: any) => String(t.assetID) === assetId);
        }
        
        if (userId) {
          tasks = tasks.filter((t: any) => 
            String(t.userID) === userId || String(t.completedByUser) === userId
          );
        }
        
        const formatDate = (unix: number) => {
          if (!unix || unix === 0) return null;
          return new Date(unix * 1000).toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric',
            timeZone: 'America/Chicago'
          });
        };
        
        const getStatusName = (statusID: number): string => {
          const statusMap: { [key: number]: string } = {
            0: 'Open', 1: 'In Progress', 2: 'Complete',
            2969: 'Return/Quote for Parts', 3100: 'Work Complete - Pending'
          };
          return statusMap[statusID] || `Unknown (${statusID})`;
        };
        
        const summary = tasks.slice(0, 50).map((t: any) => ({
          taskID: t.taskID, name: t.name, status: getStatusName(t.statusID), statusID: t.statusID,
          description: t.description, assetID: t.assetID, locationID: t.locationID,
          userID: t.userID, teamID: t.teamID, priority: t.priority,
          due: formatDate(t.due), dateCompleted: formatDate(t.dateCompleted),
          completedByUser: t.completedByUser,
          completionNotes: t.completionNotes ? t.completionNotes.substring(0, 200) : null
        }));
        
        return JSON.stringify({ 
          stats: { totalTasksInSystem: totalTasks, totalPagesInLimble: maxPage, completedThisYear, completedToday, currentlyOpen: openTasks },
          filtered: { status, dateFilter: dateFilter || null, count: tasks.length, showing: summary.length },
          tasks: summary 
        });
      }

      case "get_service_history": {
        const assetId = input.asset_id as string;
        const days = (input.days as number) || 365;
        const startDateUnix = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

        // Limble v2: ?assets= is server-side filter (from asset meta.tasks)
        // Some assetIDs are building locations (parent assets) with 500+ tasks
        let allTasks: any[] = [];
        let page = 1;
        const maxPages = 10; // Safety cap: 1,000 tasks max per lookup

        while (page <= maxPages) {
          const url = `${LIMBLE_BASE_URL}/tasks?assets=${assetId}&limit=100&page=${page}`;
          const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
          if (!response.ok) {
            if (page === 1) return JSON.stringify({ error: "Failed to fetch service history" });
            break;
          }

          const data = await response.json();
          const tasks = Array.isArray(data) ? data : (data.data || data.tasks || []);
          if (tasks.length === 0) break;

          allTasks = allTasks.concat(tasks);
          if (tasks.length < 100) break; // Last page
          page++;
        }

        // Filter to completed tasks within date range
        const filtered = allTasks.filter((t: any) => {
          if (!t.dateCompleted || t.dateCompleted === 0) return false;
          return t.dateCompleted >= startDateUnix;
        });

        // Sort newest first
        filtered.sort((a: any, b: any) => (b.dateCompleted || 0) - (a.dateCompleted || 0));

        const formatDate = (unix: number) => {
          if (!unix || unix === 0) return null;
          return new Date(unix * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago'
          });
        };

        const summary = filtered.slice(0, 30).map((t: any) => ({
          taskID: t.taskID, name: t.name, dateCompleted: formatDate(t.dateCompleted),
          completedByUser: t.completedByUser, completionNotes: t.completionNotes
        }));

        return JSON.stringify({
          assetID: assetId, daysSearched: days,
          totalTasksForAsset: allTasks.length, pagesSearched: page - 1,
          completedInRange: filtered.length, showing: summary.length,
          history: summary
        });
      }

      case "get_technicians": {
        const nameFilter = (input.name_filter as string || "").toLowerCase();
        
        const url = `${LIMBLE_BASE_URL}/users`;
        const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
        if (!response.ok) return JSON.stringify({ error: "Failed to fetch technicians" });
        
        const allUsers = await response.json();
        let users = Array.isArray(allUsers) ? allUsers : (allUsers.data || allUsers.users || []);
        
        if (nameFilter) {
          users = users.filter((u: any) => {
            const fullName = `${u.firstName || ''} ${u.lastName || ''} ${u.name || ''}`.toLowerCase();
            return fullName.includes(nameFilter);
          });
        }
        
        const summary = users.slice(0, 50).map((u: any) => ({
          userID: u.userID || u.id,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email, role: u.role || u.roleName
        }));
        
        return JSON.stringify({ count: users.length, showing: summary.length, technicians: summary });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({ error: `Tool failed: ${error instanceof Error ? error.message : "Unknown"}` });
  }
}

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

function getCurrentDate(): string {
  return new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Chicago'
  });
}

const SYSTEM_PROMPT_BASE = `You are the AAS Technical Copilot for Automatic Access Solutions LLC.

## TODAY'S DATE
{{CURRENT_DATE}}

## CORE RULES
1. You have access to AAS data via tools — USE THEM.
2. Never claim you "don't have access." If something isn't found, say: "No matching records found in the system for that query."
3. Never hallucinate. If sources are missing, ask for the exact controller/connector label.
4. Always cite sources for technical claims (manual + link).

## EFFICIENCY RULES
- Call the RIGHT tool on the FIRST try using the routing rules below.
- Maximum 2 tool calls per response.
- If first search returns no relevant results, answer with what you have and ask user to rephrase.
- Do NOT call the same tool twice with slightly different queries.
- If you need a second tool call, it MUST be a DIFFERENT tool or DIFFERENT source.

## TOOL ROUTING (STRICT)
- **Tasks/work orders** → get_work_orders immediately
- **Door-specific** → get_door_info or search_doors
- **Asset/door location** → search_assets (where is X, doors at Y, asset ID lookup)
- **Parts** → search_parts
- **Technical HOW-TO / wiring / programming / error codes / pinouts** → search_manuals_rag FIRST
- **Manual PDF links** → search_manuals
- **NFPA 80 / fire door compliance / Joint Commission / inspection requirements** → search_nfpa80
- **"What does code say" / "NFPA" / "annual inspection" / "self-closing test"** → search_nfpa80
- **NFPA 101 / life safety / egress / corridor / exit / travel distance / occupancy / means of egress** → search_nfpa101
- **NFPA 105 / smoke door / smoke barrier / smoke compartment / horizontal exit / smoke damper** → search_nfpa105
- **"Smoke door vs fire door" / "what type of door"** → search_nfpa80 AND search_nfpa105 (compare both)
- **ANSI A156.10 / automatic door standard / sensor activation / entrapment / power operated pedestrian door** → search_ansi156_10
- **ANSI A156.19 / power assist / low energy swing / ADA opener / knowing act activation** → search_ansi156_19
- **ANSI A156.38 / low energy slider / low energy folding door** → search_ansi156_38
- **"What does ANSI say" / "BHMA standard" / "door operator standard"** → pick the right A156 standard based on door type (sliding=A156.10 or A156.38, swing=A156.19)
- **AAADM certification questions / inspector test prep** → search relevant ANSI A156 standard(s)

## PARTS SEARCH TRIGGERS (USE search_parts FOR THESE)
Always use search_parts when user mentions:
- Part numbers (C5639, K5656, etc.)
- "part for", "part number", "I need", "order", "quote", "replace"
- Physical components: bottom guide, top roller, carrier, motor, belt, pulley, bearing, track, cap, wheel, arm, bracket, sensor, switch, board
- Manufacturer + model + component (e.g., "horton 2003 belt", "besam carrier")

**DO NOT confuse with manuals:**
- "bottom guide" = PART (search_parts)
- "installation guide" = MANUAL (search_manuals_rag)
- "horton 2003 slider parts" = PARTS
- "how to install horton 2003" = MANUAL

## PARTS SEARCH RESPONSE FORMAT
Parts search returns tiered results:
- **exactMatches**: All query words found - show these first
- **closeMatches**: Most words found - show if no exact
- **partialMatches**: Some words found - ask for clarification

**Display format:** MFG# (AAS#) - Description
- MFG# = Manufacturer part number (matches manuals)
- AAS# = Internal number for Limble ordering

**Response rules:**
1. If exactMatches > 0: List exact matches, mention close matches exist
2. If only closeMatches: Show them, ask "Did you mean X or Y?"
3. If only partialMatches: Ask for clarification before listing
4. Always include AAS# so tech can find in Limble

**Image display rules (when parts have thumbnail_url):**
1. Display as markdown image on its own line:
   ![Part Description](thumbnail_url)
2. Add clickable link to full-size below:
   [View full image](full_url)
3. Show max 3 images per response to keep it compact
4. Images help techs visually confirm correct part before ordering

## PINOUT / TABLE EXTRACTION MODE (MANDATORY)
**Trigger when user asks:** pinout, CNx/Jx/TBx, "terminal block", "1–12", "functions", wiring terminals.

**Steps:**
1. Call search_manuals_rag with a table-targeted query (include connector name + "terminal block" + numbers)
2. Output a numbered list exactly as the manual labels it
3. Include Source: source_pdf + manual link

**If not found:** Say "Pinout table not found in retrieved chunks." Ask for connector label.

## ERROR CODE MODE (MANDATORY)
**Trigger when user asks:** error code, fault code, diagnostic code, "E-XX", "error XX"

**Steps:**
1. Retrieve error code table first via search_manuals_rag
2. Respond with: **Code → Meaning → Likely causes → First checks**
3. Cite manual source

## QUERY REWRITE RULES (for search_manuals_rag)
Rewrite user queries into high-recall strings. Include manufacturer/model when known from context.

**Examples:**
- "pinout for control" → "Horton C4190 CN1 terminal block 1 2 3 4 5 6 7 8 9 10 11 12 pinout"
- "StpNR'sum StopNSeek" → "C4190 StpNR'sum StopNSeek CN1 terminals function"
- "MC521 obstruction" → "Stanley MC521 obstruction error code table"
- "door won't close" → "[manufacturer] [model] door not closing troubleshooting"

## TOOL FALLBACK ORDERING
If search_manuals_rag returns no results:
1. Try once more with rewritten query using synonyms
2. Then call search_manuals to return best manual link(s)
3. Then say "No matching content found" and ask for controller label or exact term

## NFPA 80 (2019) — FIRE DOORS AND OTHER OPENING PROTECTIVES
**Use search_nfpa80 when query involves:**
- Fire door inspection requirements, frequency, annual testing
- Self-closing, self-latching, clearance/gap specifications
- Door propping/wedging rules, fire door labeling
- Fire damper inspection (Chapter 19)
- Joint Commission compliance, deficiency citations
- "What does NFPA 80 say about...", "code requirement for..."
- AHJ (Authority Having Jurisdiction), record keeping

**Chapter quick reference:**
- Ch 4: General (field mods, clearances) | Ch 5: ITM (inspections) — MOST USED
- Ch 6: Swinging doors (hardware, frames) | Ch 11: Rolling steel (drop tests)
- Ch 19: Fire dampers | Ch 21: Curtain assemblies

**Response format:**
1. Cite specific clause: "Per NFPA 80 §5.2.3..."
2. Quote the requirement text
3. Add annex explanatory material if available
4. Flag Joint Commission relevance for healthcare customers
5. Combine with other tools: search_nfpa80 for code + get_door_info for door status

## NFPA 101 (2018) — LIFE SAFETY CODE
**Use search_nfpa101 when query involves:**
Building egress, exit requirements, corridor width, occupancy classification, travel distance, exit access, exit discharge, means of egress, assembly occupancy, healthcare occupancy, door swing direction in egress path, panic hardware requirements, delayed egress locks, access-controlled egress.

**Chapter quick reference:**
- Ch 3: Definitions | Ch 7: Means of Egress — MOST USED
- Ch 12-13: Assembly occupancy | Ch 18-19: Healthcare occupancy — KEY FOR HOSPITALS
- Ch 36-37: Mercantile occupancy | Ch 38-39: Business occupancy
- Ch 8: Features of fire protection | Ch 9: Building service/fire protection equipment

**Response format:**
1. Cite specific section: "Per NFPA 101 §7.2.1..."
2. Quote the requirement text
3. Note occupancy-specific variations if applicable
4. Flag healthcare relevance for hospital customers (Ch 18-19)
5. Cross-reference with NFPA 80 when door hardware intersects fire protection

## NFPA 105 (2019) — SMOKE DOOR ASSEMBLIES
**Use search_nfpa105 when query involves:**
Smoke doors, smoke barriers, smoke compartments, horizontal exits, smoke dampers, smoke-rated vs fire-rated, "is this a smoke door or fire door", smoke partition, smoke containment, leakage rating.

**Chapter quick reference:**
- Ch 4: General requirements | Ch 5: Installation, testing, maintenance — MOST USED
- Ch 6: Smoke dampers | Ch 7: Other opening protectives
- Annex A: Explanatory material | Annex B: Smoke leakage testing

**Response format:**
1. Cite specific section: "Per NFPA 105 §5.3.1..."
2. Quote the requirement text
3. ALWAYS clarify smoke door vs fire door distinction when relevant
4. Cross-reference NFPA 80 when fire/smoke ratings overlap
5. For hospitals: note Joint Commission expects both standards compliance on smoke barrier doors

## ANSI/BHMA A156.10 (2024) — POWER OPERATED PEDESTRIAN DOORS
**Use search_ansi156_10 when query involves:**
Automatic sliding doors, automatic swinging doors (full energy), sensor activation zones, entrapment protection, break-away force for egress, safety signage requirements, opening/closing speed limits, kinetic energy limits, guide rail requirements, emergency egress.

**Response format:**
1. Cite specific section: "Per ANSI/BHMA A156.10 §X.X..."
2. Quote the requirement text
3. Note that A156.10 covers FULL ENERGY (higher speed/force) operators
4. If question is about LOW ENERGY doors, redirect to A156.19 (swing) or A156.38 (slide/fold)

## ANSI/BHMA A156.19 (2019) — POWER ASSIST & LOW ENERGY SWING DOORS
**Use search_ansi156_19 when query involves:**
Power assist swing doors, low energy swing operators, ADA door openers, knowing-act activation (push button, push plate), swing door force limits, 300,000 cycle test, closing speed for low energy swing.

**Response format:**
1. Cite specific section: "Per ANSI/BHMA A156.19 §X.X..."
2. Quote the requirement text
3. Clarify: A156.19 = swing doors only. For sliding/folding low energy → A156.38
4. Note: "knowing act" means user must intentionally activate (button press, etc.)

## ANSI/BHMA A156.38 (2019) — LOW ENERGY SLIDING & FOLDING DOORS
**Use search_ansi156_38 when query involves:**
Low energy sliding doors, low energy folding doors, low energy bi-fold, activation requirements for low energy sliders, force limits for low energy sliding/folding.

**Response format:**
1. Cite specific section: "Per ANSI/BHMA A156.38 §X.X..."
2. Quote the requirement text
3. Clarify: A156.38 = sliding/folding only. For swing low energy → A156.19. For full energy → A156.10

## YOUR TOOLS
1. **search_manuals_rag** - Door Guru V3 API (29,111 chunks). Returns manufacturer manual excerpts AND AAS field playbooks in one call.
2. **search_manuals** - Search for PDF links by manufacturer, controller, door type
3. **search_parts** - Parts inventory with tiered matching (exact/close/partial)
4. **search_assets** - Door/asset location lookup by name, ID, customer, address
5. **get_work_orders** - Tasks from Limble CMMS
6. **get_technicians** - List techs with userIDs (admin only)
7. **get_service_history** - Service records for a door
8. **get_door_info** - Door details by ID from Door Registry
9. **search_doors** - Find doors by customer/location
10. **search_nfpa80** - NFPA 80 (2019) fire door compliance. 404 clauses.
11. **search_nfpa101** - NFPA 101 (2018) Life Safety Code. 5,842 clauses. Egress, corridors, occupancy.
12. **search_nfpa105** - NFPA 105 (2019) Smoke Door Assemblies. 236 clauses. Smoke barriers, compartments.
13. **search_ansi156_10** - ANSI/BHMA A156.10 (2024) Power Operated Pedestrian Doors. 259 sections. Sensors, entrapment, egress.
14. **search_ansi156_19** - ANSI/BHMA A156.19 (2019) Power Assist & Low Energy Swing Doors. 50 sections. ADA openers, force limits.
15. **search_ansi156_38** - ANSI/BHMA A156.38 (2019) Low Energy Sliding & Folding Doors. 48 sections. Low energy sliders, activation.

## search_manuals_rag V3 RESPONSE FORMAT
This tool returns TWO result types:
- **manual_results**: Manufacturer documentation (wiring, specs, procedures) - AUTHORITATIVE SOURCE
- **playbook_results**: AAS tribal knowledge from 20+ years field experience - PRACTICAL TIPS

**Response rules:**
1. Lead with manual_results for technical accuracy
2. Add playbook_results as "Field tip:" or "From experience:" after manual content
3. If model number mentioned (4190, MC521, etc.), prioritize results matching that exact model
4. Playbooks are real AAS tech experiences - phrase as "Techs have found..." or "Common issue:"
5. If playbook contradicts manual, note both: "Manual says X, but field experience shows Y"
6. For analog controllers (Horton 4190, 4160), don't suggest "programming" - they use potentiometers

## SOURCE HIERARCHY
- **NFPA 80 standard** = authority for fire door compliance/inspection requirements
- **NFPA 101 standard** = authority for egress, corridor, occupancy requirements
- **NFPA 105 standard** = authority for smoke door/smoke barrier requirements
- **ANSI/BHMA A156.10** = authority for power operated pedestrian door safety/performance
- **ANSI/BHMA A156.19** = authority for power assist and low energy swing door safety/performance
- **ANSI/BHMA A156.38** = authority for low energy sliding and folding door safety/performance
- When standards overlap (e.g., fire-rated smoke door), cite BOTH applicable standards
- When ANSI and NFPA overlap (e.g., automatic door in egress path), cite BOTH
- **Manufacturer manuals** = authority for wiring/specs/pinouts
- **Field knowledge** = practical experience and best practices

## RESPONSE TEMPLATES

**Technical How-To:**
1. [Step]
2. [Step]
3. [Step]

**Notes:** [1-3 bullets if needed]
**Source:** [Manual Name](drive_link)

**Pinout Response:**
**Connector: CNx**
1. [Function]
2. [Function]
...
**Source:** [Manual Name](drive_link)

**Error Code Response:**
**Code XX** → [Meaning]
- Likely causes: [list]
- First checks: [list]
**Source:** [Manual Name](drive_link)

## RESPONSE STYLE
- BE CONCISE - Techs are on mobile
- ANSWER DIRECTLY - No preamble, no "Great question!"
- NUMBERED STEPS for procedures
- ALWAYS include manual link when quoting technical content
- Format links as: [Manufacturer Model Manual](drive_link)
- If field knowledge + manual both apply, lead with manual, then add field experience

## COMPANY CONTEXT
- Louisiana-based, 700+ customer locations
- Healthcare: Manning, Ochsner
- Door IDs: AAS-XXX, FD-XXX, Names like MH-1.81
- Tech IDs: Ruben=265672, Jonas=266967, Sean=361996`;

const CUSTOMER_SYSTEM_PROMPT = `You are the Compliance Assistant for customers of Automatic Access Solutions (AAS), a fire door inspection and service company.

## Your Knowledge Base

You have access to search these NFPA codes:
- **NFPA 80** - Fire Doors and Other Opening Protectives
  - Fire ratings, door gaps, clearances, hardware requirements
  - Closer and coordinator requirements
  - Annual inspection requirements
  - Labeling and signage

- **NFPA 101** - Life Safety Code
  - Means of egress requirements
  - Exit and corridor specifications
  - Occupancy classifications
  - Travel distance limits
  - Door swing direction requirements

- **NFPA 105** - Smoke Door Assemblies
  - Smoke barrier requirements
  - Smoke compartment specifications
  - Differences between smoke doors and fire doors
  - Smoke door hardware requirements

You also have access to ANSI/BHMA automatic door standards:
- **ANSI/BHMA A156.10** (2024) - Power Operated Pedestrian Doors
  - Automatic sliding and swinging door safety requirements
  - Sensor activation zones, entrapment protection
  - Break-away egress, opening/closing speeds
  - Safety signage requirements

- **ANSI/BHMA A156.19** (2019) - Power Assist & Low Energy Swing Doors
  - ADA door openers, power assist requirements
  - Low energy swing door force and speed limits
  - Knowing-act activation requirements

- **ANSI/BHMA A156.38** (2019) - Low Energy Sliding & Folding Doors
  - Low energy sliding door requirements
  - Low energy folding door requirements
  - Activation and force limits

## Context Available

The customer's portal data is included at the start of their messages, showing:
- Their door inspection results and compliance percentage
- Their open service tasks with details
- Which doors are currently failing inspection

## How to Help Customers

1. **Answer compliance questions** by searching the relevant NFPA code(s) or ANSI standard(s)
2. **Cite specific sections** when possible (e.g., "According to NFPA 80, Section 5.2.1..." or "Per ANSI A156.10 §4.3...")
3. **Explain in plain language** what requirements mean for their facility
4. **Help interpret inspection findings** - what failed and why it matters
5. **Clarify the difference** between fire doors (NFPA 80) and smoke doors (NFPA 105)
6. **Explain automatic door standards** - which ANSI standard applies to their door type
7. **Look up service history** for specific doors when customers ask about past work, repairs, or recurring issues. Use the asset ID from the portal context data.

## Tool Routing (STRICT)
- **Fire door compliance / inspection / gap / label / self-closing** → search_nfpa80
- **Egress / exit / corridor / occupancy / travel distance** → search_nfpa101
- **Smoke door / smoke barrier / smoke compartment** → search_nfpa105
- **"Smoke door vs fire door"** → search_nfpa80 AND search_nfpa105
- **Automatic sliding door standard / sensor / entrapment** → search_ansi156_10
- **ADA opener / low energy swing / power assist** → search_ansi156_19
- **Low energy slider / folding door** → search_ansi156_38
- **"What doors do I have?" / door list / door locations** → search_assets
- **Door status / details / manufacturer / model** → get_door_info
- **Past work / service history / repairs / recurring issues** → get_service_history
- **"Why is my door doing X?" / troubleshooting explanation** → search_manuals_rag (explain simply, no repair steps)
- **Door search by area or manufacturer** → search_doors
- Maximum 2 tool calls per response. Pick the RIGHT tool first.

## Important Guidelines

- Always search NFPA codes or ANSI standards before answering technical compliance questions
- Be helpful and educational - customers want to understand their compliance status
- If you're unsure, say so and recommend they contact AAS for clarification
- Reference the specific data provided (door IDs, task numbers, etc.)
- Explain technical terms simply

DO NOT:
- Invent information not in the provided context
- Give specific part numbers or prices
- Provide step-by-step repair instructions
- Share internal technician names or labor costs from service history

CONTACT INFO (only share if asked):
- Phone: (504) 336-4422
- Text: (504) 810-5285
- Email: service@automaticaccesssolution.com`;

// =============================================================================
// MAIN HANDLER
// =============================================================================

interface Message { role: "user" | "assistant"; content: string; }
interface CopilotRequest {
  messages: Message[];
  doorId?: string;
  doorContext?: { manufacturer?: string; model?: string; location?: string; customer?: string; };
  technicianId?: string;
  mode?: 'technician' | 'customer_portal';
  customer?: string;
  customerContext?: {
    customer?: string;
    customerLabel?: string;
    totalDoors?: number;
    passingDoors?: number;
    failingDoors?: number;
    compliancePercent?: number;
    openTasks?: number;
    failingDoorsList?: Array<{ id: string; location: string; notes: string; }>;
  };
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "https://aas-portal.netlify.app",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: CopilotRequest = await req.json();
    if (!body.messages?.length) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get('Authorization');
    const userInfo = extractUserFromToken(authHeader);
    const isAdmin = userInfo.roles.includes('Admin');
    const isTech = userInfo.roles.includes('Tech');

    console.log(`[Copilot V21.2] Request from ${userInfo.email}, roles: ${userInfo.roles.join(', ')}`);

    // ========== CUSTOMER PORTAL MODE ==========
    if (body.mode === 'customer_portal') {
      const authResult = verifyCustomerToken(authHeader);

      if (!authResult.valid) {
        return new Response(
          JSON.stringify({ error: authResult.error || 'Unauthorized' }),
          { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://aas-portal.netlify.app" } }
        );
      }

      const customerAliases: Record<string, string[]> = {
        'westbank': ['westbank', 'ochsner_westbank'],
        'ochsner_westbank': ['westbank', 'ochsner_westbank'],
        'mannings': ['mannings', 'manning'],
        'manning': ['mannings', 'manning']
      };

      const requestedCustomer = body.customerContext?.customer || body.customer;
      const tokenCustomerId = authResult.customerId;
      const allowedIds = customerAliases[tokenCustomerId || ''] || [tokenCustomerId];
      const hasAccess = !tokenCustomerId || !requestedCustomer || allowedIds.includes(requestedCustomer);

      if (!hasAccess) {
        console.log(`[Copilot] Access denied: token customer_id=${tokenCustomerId}, requested=${requestedCustomer}`);
        return new Response(
          JSON.stringify({ error: 'Access denied to this customer portal' }),
          { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://aas-portal.netlify.app" } }
        );
      }

      // ========== MEMORY LAYER (CUSTOMER) ==========
      let custMemCtx: MemoryContext | null = null;
      try {
        custMemCtx = await beforeLoop({
          role: "customer",
          customer: requestedCustomer || tokenCustomerId || "unknown",
          facility: body.doorContext?.location,
          doorId: body.doorId,
          userMessage: body.messages[body.messages.length - 1]?.content || "",
        });
      } catch (err) {
        console.error("[Memory] Customer beforeLoop failed:", err);
      }
      // ========== END MEMORY LAYER ==========

      const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
        role: m.role, content: m.content,
      }));

      let response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        system: CUSTOMER_SYSTEM_PROMPT + (custMemCtx?.promptBlock || ""),
        tools: CUSTOMER_TOOLS,
        tool_choice: { type: "auto" },
        messages,
      });

      let iterations = 0;
      const customerToolsCalled: Set<string> = new Set();
      while (response.stop_reason === "tool_use" && iterations < 3) {
        if (customerToolsCalled.size >= 2) {
          break;
        }
        iterations++;
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          customerToolsCalled.add(toolUse.name);
          const toolInput = toolUse.input as Record<string, unknown>;

          // Auto-inject customer scope for tenant isolation
          const customerName = requestedCustomer || tokenCustomerId;
          if (customerName && ['search_assets', 'search_doors'].includes(toolUse.name)) {
            if (!toolInput.customer) {
              toolInput.customer = customerName;
            }
          }

          const result = await executeTool(toolUse.name, toolInput);
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
        }

        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });

        try {
          response = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 1024,
            system: CUSTOMER_SYSTEM_PROMPT + (custMemCtx?.promptBlock || ""),
            tools: CUSTOMER_TOOLS,
            messages,
          });
        } catch (apiError) {
          console.error("[Customer Portal] Claude API error during tool loop:", apiError);
          return new Response(
            JSON.stringify({
              response: "I found some information but encountered a temporary issue. Please try again in a moment.",
              error: apiError instanceof Error ? apiError.message : "API error"
            }),
            { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://aas-portal.netlify.app" } }
          );
        }
      }

      // If we broke out due to tool budget, force a final text response
      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")?.id || "budget_limit", content: "Tool budget reached. Summarize your findings with the information you already have." }] });
        try {
          response = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 1024,
            system: CUSTOMER_SYSTEM_PROMPT + (custMemCtx?.promptBlock || ""),
            messages,
          });
        } catch (apiError) {
          console.error("[Customer Portal] Claude API error during budget wrap-up:", apiError);
        }
      }

      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      const responseText = textBlocks.map((b) => b.text).join("\n");

      // ========== SAVE MEMORY (CUSTOMER) ==========
      if (custMemCtx) {
        afterLoop(custMemCtx, {
          responseText,
          toolsCalled: Array.from(customerToolsCalled),
          anthropic,
        }).catch(err => console.error("[Memory] Customer afterLoop failed:", err));
      }
      // ========== END SAVE MEMORY ==========

      return new Response(
        JSON.stringify({ response: responseText }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://aas-portal.netlify.app" } }
      );
    }
    // ========== END CUSTOMER PORTAL MODE ==========

    // ========== TECHNICIAN/ADMIN MODE ==========
    const availableTools = isAdmin ? TOOLS : TECH_TOOLS;

    let systemPrompt = SYSTEM_PROMPT_BASE.replace('{{CURRENT_DATE}}', getCurrentDate());
    if (body.doorId || body.doorContext) {
      systemPrompt += "\n\n## CURRENT CONTEXT";
      if (body.doorId) systemPrompt += `\nDoor ID: ${body.doorId}`;
      if (body.doorContext?.manufacturer) systemPrompt += `\nManufacturer: ${body.doorContext.manufacturer}`;
      if (body.doorContext?.model) systemPrompt += `\nModel: ${body.doorContext.model}`;
      if (body.doorContext?.location) systemPrompt += `\nLocation: ${body.doorContext.location}`;
      if (body.doorContext?.customer) systemPrompt += `\nCustomer: ${body.doorContext.customer}`;
    }

    if (isTech && !isAdmin) {
      systemPrompt += `\n\n## USER CONTEXT
You are assisting technician: ${userInfo.email}
Technician ID: ${userInfo.technicianId || 'unknown'}

IMPORTANT RESTRICTIONS:
- When using get_work_orders, ALWAYS filter to this technician's tasks only (user_id: ${userInfo.technicianId})
- Do NOT reveal other technicians' schedules or assignments
- Do NOT discuss pricing, billing, or quotes
- Focus on technical support: manuals, parts lookup, troubleshooting`;
    }

    // ========== MEMORY LAYER (ADMIN/TECH) ==========
    const memUserMsg = body.messages[body.messages.length - 1]?.content || "";
    let memCtx: MemoryContext | null = null;
    try {
      memCtx = await beforeLoop({
        role: isAdmin ? "admin" : "tech",
        customer: body.doorContext?.customer || body.customer || "aas",
        facility: body.doorContext?.location,
        doorId: body.doorId,
        userMessage: memUserMsg,
      });
      if (memCtx.promptBlock) {
        systemPrompt += memCtx.promptBlock;
      }
    } catch (err) {
      console.error("[Memory] beforeLoop failed (non-fatal):", err);
    }
    // ========== END MEMORY LAYER ==========

    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role, content: m.content,
    }));

    let response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      tools: availableTools,
      tool_choice: { type: "auto" },
      messages,
    });

    let iterations = 0;
    let toolsUsed = false;
    const toolCalls: { name: string; input: any; result: string }[] = [];
    const toolsCalledThisRequest: Set<string> = new Set();

    // Tool-call budget: max 3 iterations, hard cap at 2 unique tools (same tool with different params allowed)
    while (response.stop_reason === "tool_use" && iterations < 3) {
      // Hard enforcement: stop after 2 tool calls
      if (toolsCalledThisRequest.size >= 2) {
        break;
      }
      iterations++;
      toolsUsed = true;

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        // Track which tools have been called
        toolsCalledThisRequest.add(toolUse.name);

        const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });

        toolCalls.push({
          name: toolUse.name,
          input: toolUse.input,
          result: result.length > 500 ? result.substring(0, 500) + "... (truncated)" : result
        });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      try {
        response = await anthropic.messages.create({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          tools: availableTools,
          messages,
        });
      } catch (apiError) {
        console.error("Claude API error during tool loop:", apiError);
        return new Response(
          JSON.stringify({
            response: "I gathered information but encountered an error synthesizing the response. Here's what I found in my tools - please check the browser console for details.",
            toolsUsed, toolCalls, iterations,
            error: apiError instanceof Error ? apiError.message : "API error"
          }),
          { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://aas-portal.netlify.app" } }
        );
      }
    }

    // If we broke out due to tool budget, force a final text response
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")?.id || "budget_limit", content: "Tool budget reached. Summarize your findings with the information you already have." }] });
      try {
        response = await anthropic.messages.create({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        });
      } catch (apiError) {
        console.error("Claude API error during budget wrap-up:", apiError);
      }
    }

    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    
    const responseText = textBlocks.length > 0 
      ? textBlocks.map((b) => b.text).join("\n")
      : "I processed your request but couldn't generate a text response. Check the tool results in the browser console.";

    const latestUserMsg = body.messages.filter((m) => m.role === "user").pop()?.content || "";
    const manufacturer = detectManufacturer(latestUserMsg + " " + responseText) || body.doorContext?.manufacturer;

    // ========== SAVE MEMORY (ADMIN/TECH) ==========
    if (memCtx) {
      afterLoop(memCtx, {
        responseText,
        toolsCalled: Array.from(toolsCalledThisRequest),
        anthropic,
      }).catch(err => console.error("[Memory] afterLoop failed:", err));
    }
    // ========== END SAVE MEMORY ==========

    return new Response(
      JSON.stringify({
        response: responseText, manufacturer, toolsUsed,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        iterations,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://aas-portal.netlify.app" } }
    );
  } catch (error) {
    console.error("Copilot error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request", details: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://aas-portal.netlify.app" } }
    );
  }
}

function detectManufacturer(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/index\s*\d{1,2}|fis|duraglide|duracare|mc521|stanley|magic-swing/.test(lower)) return "stanley";
  if (/p\d{2}|double-click set|toggle switch|c3150|c4190|horton|series 2000/.test(lower)) return "horton";
  if (/handy terminal|u30|opus|nabco|gt[- ]?\d{3,4}/.test(lower)) return "nabco";
  if (/gyro[- ]?tech/.test(lower)) return "nabco";
  if (/sl500|sw200|unislide|swingmaster|besam|assa abloy/.test(lower)) return "besam";
  if (/dormakaba|dorma\b|kaba|ed100|ed200|es200|esa\d{3}/.test(lower)) return "dorma";
  if (/doro[- ]?matic|dor-o-matic/.test(lower)) return "dorma";
  if (/record\b|fpc902|k-swing|8100/.test(lower)) return "record";
  if (/tormax|ict|tx9[0-9]|uni-turn/.test(lower)) return "tormax";
  if (/\bbea\b|ixio|lzr[- ]?\w|eagle\s*\d/.test(lower)) return "bea";
  if (/boon\s*edam|tourlock|speedlane|circlelock/.test(lower)) return "boon edam";
  return undefined;
}

export const config: Config = { path: "/api/copilot" }; 
