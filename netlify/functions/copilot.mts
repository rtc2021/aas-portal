import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================================
// AAS CENTRAL INTELLIGENCE - COPILOT v2.0
// ============================================================================

const anthropic = new Anthropic({
  apiKey: Netlify.env.get("ANTHROPIC_API_KEY"),
});

const PORTAL_BASE_URL = Netlify.env.get("PORTAL_BASE_URL") || "https://aas-portal.netlify.app";
const LIMBLE_API_URL = "https://api.limblecmms.com";
const LIMBLE_CLIENT_ID = Netlify.env.get("LIMBLE_CLIENT_ID");
const LIMBLE_CLIENT_SECRET = Netlify.env.get("LIMBLE_CLIENT_SECRET");

// ============================================================================
// LIMBLE API
// ============================================================================

function getLimbleAuthHeader(): string {
  if (!LIMBLE_CLIENT_ID || !LIMBLE_CLIENT_SECRET) {
    throw new Error("Limble credentials not configured");
  }
  return `Basic ${Buffer.from(`${LIMBLE_CLIENT_ID}:${LIMBLE_CLIENT_SECRET}`).toString("base64")}`;
}

async function limbleRequest(endpoint: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${LIMBLE_API_URL}/v2/${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.append(k, v));
  }
  const response = await fetch(url.toString(), {
    headers: { Authorization: getLimbleAuthHeader(), "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Limble: ${response.status}`);
  return response.json();
}

// ============================================================================
// TOOLS
// ============================================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_door_info",
    description: "Get door details from Door Registry by ID (AAS-XXX, FD-XXX, or MH-1.81)",
    input_schema: {
      type: "object" as const,
      properties: { door_id: { type: "string" } },
      required: ["door_id"]
    }
  },
  {
    name: "search_doors",
    description: "Search doors by customer, location, or manufacturer",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" }, manufacturer: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "get_work_orders",
    description: "Get work orders from Limble (open by default)",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"] },
        asset_id: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "get_work_order_details",
    description: "Get specific work order details",
    input_schema: {
      type: "object" as const,
      properties: { task_id: { type: "string" } },
      required: ["task_id"]
    }
  },
  {
    name: "get_service_history",
    description: "Get service history for a door/asset",
    input_schema: {
      type: "object" as const,
      properties: { asset_id: { type: "string" }, asset_name: { type: "string" }, limit: { type: "number" } }
    }
  },
  {
    name: "get_limble_asset",
    description: "Get asset details from Limble",
    input_schema: {
      type: "object" as const,
      properties: { asset_id: { type: "string" }, search: { type: "string" } }
    }
  },
  {
    name: "search_parts",
    description: "Search parts inventory",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" }, manufacturer: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "get_parts_for_error",
    description: "Get parts commonly needed for an error code",
    input_schema: {
      type: "object" as const,
      properties: { manufacturer: { type: "string" }, error_code: { type: "string" }, issue_type: { type: "string" } },
      required: ["manufacturer"]
    }
  }
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "get_door_info": {
        const r = await fetch(`${PORTAL_BASE_URL}/api/door?id=${encodeURIComponent(input.door_id as string)}`);
        return r.ok ? await r.text() : JSON.stringify({ error: "Door not found" });
      }
      case "search_doors": {
        let url = `${PORTAL_BASE_URL}/api/search-index?q=${encodeURIComponent(input.query as string)}&type=doors`;
        if (input.manufacturer) url += `&manufacturer=${encodeURIComponent(input.manufacturer as string)}`;
        return await (await fetch(url)).text();
      }
      case "get_work_orders": {
        const params: Record<string, string> = { limit: String((input.limit as number) || 20) };
        if ((input.status as string) === "completed") {
          const now = new Date(), past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          params.completedDateFrom = past.toISOString().split("T")[0];
          params.completedDateTo = now.toISOString().split("T")[0];
        }
        if (input.asset_id) params.assetID = input.asset_id as string;
        return JSON.stringify(await limbleRequest("tasks", params), null, 2);
      }
      case "get_work_order_details":
        return JSON.stringify(await limbleRequest(`tasks/${input.task_id}`), null, 2);
      case "get_service_history": {
        let assetId = input.asset_id as string;
        if (!assetId && input.asset_name) {
          const assets = await limbleRequest("assets", { search: input.asset_name as string }) as { id: number }[];
          if (assets?.length) assetId = String(assets[0].id);
          else return JSON.stringify({ error: "Asset not found" });
        }
        if (!assetId) return JSON.stringify({ error: "Need asset_id or asset_name" });
        const now = new Date(), past = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        return JSON.stringify(await limbleRequest("tasks", {
          assetID: assetId,
          completedDateFrom: past.toISOString().split("T")[0],
          completedDateTo: now.toISOString().split("T")[0],
          limit: String((input.limit as number) || 10)
        }), null, 2);
      }
      case "get_limble_asset":
        if (input.asset_id) return JSON.stringify(await limbleRequest(`assets/${input.asset_id}`), null, 2);
        if (input.search) return JSON.stringify(await limbleRequest("assets", { search: input.search as string }), null, 2);
        return JSON.stringify({ error: "Need asset_id or search" });
      case "search_parts": {
        let url = `${PORTAL_BASE_URL}/api/search-index?q=${encodeURIComponent(input.query as string)}&type=parts`;
        if (input.manufacturer) url += `&manufacturer=${encodeURIComponent(input.manufacturer as string)}`;
        return await (await fetch(url)).text();
      }
      case "get_parts_for_error": {
        const map: Record<string, string[]> = {
          "b1": ["encoder cable"], "b2": ["encoder", "magnet"], "b3": ["encoder cable"],
          "35": ["controller"], "e4": ["encoder", "motor"], "e5": ["lock"]
        };
        const terms = [input.manufacturer as string, ...(map[(input.error_code as string)?.toLowerCase()] || []), input.issue_type].filter(Boolean);
        return await (await fetch(`${PORTAL_BASE_URL}/api/search-index?q=${encodeURIComponent(terms.join(" "))}&type=parts`)).text();
      }
      default: return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) { return JSON.stringify({ error: `Tool failed: ${e instanceof Error ? e.message : "Unknown"}` }); }
}

// ============================================================================
// PLAYBOOKS
// ============================================================================

const PLAYBOOKS = `
# HORTON
## C3150 (Slide)
Learn: Hold SET+RESET, release RESET, keep SET 5s → Select type → SET/UP confirm → Sensors DOWN → Day/Nite DOWN → "Data Saved" → ACTIVATE DOOR
Params: Toggle ON → double-click SET | SuperTech: Hold UP + double-click SET | Save: Toggle OFF/ON
P01 Open 75% | P05 Close 38% | P09 Hold 2s | P11/12 Close Force | P23/24 Open Obst | P42 Lock | P61-65 Sensors
Re-Learn: Closed=double-click DOWN (open obst) | Open=double-click DOWN (close force)
Errors: Lock fail=P42/wiring | Sensor>60s=stuck | EEPROM/Motor Drive=REPLACE | Pulse Loss=encoder/belt
Diag: D01 test | D02 volts | D04 log

## C4190 (Swing/Fold)
Pots: SPEED/CHECK/DACCL/ACCEL/DELAY/L.OUT CW↑ | LIMIT CCW↑ force | OBST CW↑
Jumpers: JB1 Push-N-Go | JB2 Touch Stop (remove=off) | JB3 Lock Delay (remove=0.25s)
LEDs: D1 ACT(2) | D2 SAF(4) | D3 TGL(5) | D4 SNR(9)
No op: D3 on? (jump 5&6), D2 off? | High speed no control=REPLACE

# STANLEY
## MC521/iQ (Slide)
FIS: CLOSED+power → 99=00 unlock → 96=01 (A0) → 00=single/dual → 01=handing (CCW=RIGHT) → 03=01 (A1) → 11=rocker/rotary → 07=lock → OPEN/CLOSED → 99=01 lock
Params: 0 Open | 1 Close | 2 Open Check | 3 Check Len | 6 Hold | 7 Lock Logic
Status: 00 Normal | 20 Breakout | 33/34/36 Comm | 35 Motor=REPLACE | 0b Obst | A0/A1/A2 FIS | b1 Cable | b2 Pair | b3 Both | c1 Learn
Quick: 99=00/01 unlock/lock | 96=01 FIS | 97=01 firmware | Cycle: lock→any index→UP/DOWN

## iQ Swing/Fold
Types: 03/04 Magic-Swing | 05/06 Magic-Force | 09/10 Fold
Fire: 0 OFF | 1 OPEN | 2 CLOSE all | 3 OPEN retry | 4 CLOSE obs Hold
DE(18): 00 OFF | 01 15s | 02 30s | Gap 0.080-0.120"

# NABCO
## U30 (SLIDE ONLY)
Pins: 1=12V | 2=Common | 3=Act(61) | 4=Hold(6B) | 5=Reduced | 6/7=Mode | 8=One-way(62) | 10=Panic(BA)
Modes: Two-Way OFF/OFF | Hold ON/ON | One-way ON/OFF | Night OFF/ON
Errors: 1=Recycle | 2=12V | 3=Handy | 6/7=Sensor 61/62
Defaults: Open 3 | Close 2 | Delay 2 | Recycle 1 (0=DON'T USE)
Test: Short 2&3

## OPUS (Swing/Fold)
GT-300/400/500 Standard | GT-710 Low | Fuses: Opus 5A | Brake 3A | Motor 2A
Ohms: GT300-500 15-30Ω | GT710 30-50Ω

# BESAM
## SL500 (Slide)
Display: on=Normal | E#=Error | L=Learning | P=Adjust
Learn: AUTO → power → LEARN 2s → cycles → LEARN 2s → "on"
Buttons: 1s Modules | 2s Learn | 10s Reset
Errors: E1 Sensor | E2 Emergency | E3 Electronic | E4 Motor | E5 Lock | E6 Comm | E7 Temp(wait)

## SW200i (Swing)
LED: 1(10s)=KILL | 1(2s)=24V | 3=Bad | 4=Encoder | 5=Lock | 8=Hot | 10=Re-learn
Re-learn after: SPTE, CLTQ, Lock, DIP, extension, lock change
`;

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are the AAS Technical Copilot for Automatic Access Solutions field technicians.

## CAPABILITIES
- Troubleshooting with manufacturer playbooks
- Viewing work orders from Limble CMMS
- Door info and service history lookup
- Parts search and recommendations

## CONTEXT
AAS: 700+ locations Louisiana, healthcare focus | Door IDs: AAS-XXX, FD-XXX | CMMS: Limble

## TOOLS (READ-ONLY)
Doors: get_door_info, search_doors | Limble: get_work_orders, get_work_order_details, get_service_history, get_limble_asset | Parts: search_parts, get_parts_for_error

## PLAYBOOKS
${PLAYBOOKS}

## GUIDELINES
1. BE CONCISE - mobile users
2. LEAD WITH ANSWER
3. NUMBERED STEPS for procedures
4. SAFETY WARNINGS when relevant
5. USE TOOLS for specific doors, work orders, parts, history
6. DETECT MFR: Index/FIS/b1=Stanley | P01/double-click SET=Horton | U30/Handy=NABCO | SL500/E1-E7=Besam`;

// ============================================================================
// HANDLER
// ============================================================================

interface Message { role: "user" | "assistant"; content: string; }
interface CopilotRequest {
  messages: Message[];
  doorId?: string;
  doorContext?: { manufacturer?: string; model?: string; location?: string; customer?: string; };
  technicianId?: string;
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }});
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

    let systemPrompt = SYSTEM_PROMPT;
    if (body.doorId || body.doorContext) {
      systemPrompt += `\n\n## CURRENT CONTEXT\nDoor: ${body.doorId || ""}`;
      if (body.doorContext?.manufacturer) systemPrompt += ` | Mfr: ${body.doorContext.manufacturer}`;
      if (body.doorContext?.model) systemPrompt += ` | Model: ${body.doorContext.model}`;
      if (body.doorContext?.customer) systemPrompt += ` | Customer: ${body.doorContext.customer}`;
    }
    if (body.technicianId) systemPrompt += `\nTech: ${body.technicianId}`;

    const messages: Anthropic.MessageParam[] = body.messages.map(m => ({ role: m.role, content: m.content }));

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < 5) {
      iterations++;
      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUseBlocks) {
        console.log(`Tool: ${tu.name}`, tu.input);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: await executeTool(tu.name, tu.input as Record<string, unknown>) });
      }
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });
    }

    const responseText = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("\n");
    const allText = (body.messages.map(m => m.content).join(" ") + " " + responseText).toLowerCase();
    const manufacturer = /index|fis|b[123]|stanley/.test(allText) ? "stanley" :
      /p\d{2}|double-click|horton/.test(allText) ? "horton" :
      /u30|handy|nabco|opus/.test(allText) ? "nabco" :
      /sl500|sw200|besam|e[1-7]/.test(allText) ? "besam" : body.doorContext?.manufacturer;

    return new Response(JSON.stringify({
      response: responseText,
      manufacturer,
      toolsUsed: iterations > 0,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }});
  } catch (error) {
    console.error("Copilot error:", error);
    return new Response(JSON.stringify({ error: "Failed", details: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}

export const config: Config = { path: "/api/copilot" };
