import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: Netlify.env.get("ANTHROPIC_API_KEY"),
});

const PORTAL_BASE_URL = Netlify.env.get("PORTAL_BASE_URL") || "https://aas-portal.netlify.app";
const DROPLET_URL = Netlify.env.get("DROPLET_URL") || "http://134.199.203.192:8000";
const LIMBLE_CLIENT_ID = Netlify.env.get("LIMBLE_CLIENT_ID");
const LIMBLE_CLIENT_SECRET = Netlify.env.get("LIMBLE_CLIENT_SECRET");

const LIMBLE_BASE_URL = "https://api.limblecmms.com/v2";
function getLimbleAuth(): string {
  return "Basic " + btoa(`${LIMBLE_CLIENT_ID}:${LIMBLE_CLIENT_SECRET}`);
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_playbooks",
    description: "Search technical manuals and playbooks for troubleshooting info, error codes, procedures, wiring diagrams, and specifications. Use this for ANY technical question about door systems.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query - error codes, procedures, symptoms, manufacturer names" },
        top_k: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
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
    description: "Search parts inventory by name, part number, or description",
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
    name: "get_work_orders",
    description: "Get work orders from Limble CMMS. Can filter by status (open, completed, all) and asset.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"], description: "Filter by status (default: open)" },
        asset_id: { type: "string", description: "Filter by asset/door ID" }
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
  }
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "search_playbooks": {
        const query = input.query as string;
        const top_k = (input.top_k as number) || 5;
        try {
          const response = await fetch(`${DROPLET_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, top_k })
          });
          if (!response.ok) {
            return JSON.stringify({ error: "Playbook search unavailable", fallback: true });
          }
          return await response.text();
        } catch (e) {
          return JSON.stringify({ error: "Droplet unavailable", fallback: true });
        }
      }

      case "get_door_info": {
        const doorId = input.door_id as string;
        const response = await fetch(`${PORTAL_BASE_URL}/api/door?id=${encodeURIComponent(doorId)}`);
        if (!response.ok) return JSON.stringify({ error: `Door not found: ${doorId}` });
        return await response.text();
      }

      case "search_doors": {
        const query = input.query as string;
        const mfr = input.manufacturer as string | undefined;
        let url = `${PORTAL_BASE_URL}/api/search-index?q=${encodeURIComponent(query)}&type=doors`;
        if (mfr) url += `&manufacturer=${encodeURIComponent(mfr)}`;
        const response = await fetch(url);
        return await response.text();
      }

      case "search_parts": {
        const query = input.query as string;
        const mfr = input.manufacturer as string | undefined;
        let url = `${PORTAL_BASE_URL}/api/search-index?q=${encodeURIComponent(query)}&type=parts`;
        if (mfr) url += `&manufacturer=${encodeURIComponent(mfr)}`;
        const response = await fetch(url);
        return await response.text();
      }

      case "get_work_orders": {
        const status = (input.status as string) || "open";
        const assetId = input.asset_id as string | undefined;
        let url = `${LIMBLE_BASE_URL}/tasks?`;
        if (status === "open") url += "statuses=4,6,7,8";
        else if (status === "completed") {
          url += "statuses=9";
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          url += `&completedAfter=${ninetyDaysAgo.toISOString().split("T")[0]}`;
        }
        if (assetId) url += `&assetID=${encodeURIComponent(assetId)}`;
        const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
        if (!response.ok) return JSON.stringify({ error: "Failed to fetch work orders" });
        return await response.text();
      }

      case "get_service_history": {
        const assetId = input.asset_id as string;
        const days = (input.days as number) || 365;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const url = `${LIMBLE_BASE_URL}/tasks?assetID=${encodeURIComponent(assetId)}&statuses=9&completedAfter=${startDate.toISOString().split("T")[0]}`;
        const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
        if (!response.ok) return JSON.stringify({ error: "Failed to fetch service history" });
        return await response.text();
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({ error: `Tool failed: ${error instanceof Error ? error.message : "Unknown"}` });
  }
}

const SYSTEM_PROMPT = `You are the AAS Technical Copilot for Automatic Access Solutions LLC.

## YOUR ROLE
Expert assistant for automatic door systems. Help technicians with:
- Troubleshooting using manufacturer playbooks
- Door information and service history
- Parts and specifications
- Error codes and procedures
- Work orders

## COMPANY
- 700+ customer locations in Louisiana
- Healthcare: Manning, Ochsner facilities
- Door IDs: AAS-XXX, FD-XXX, Name: MH-1.81

## TOOLS
**ALWAYS use search_playbooks first for technical questions.**

- search_playbooks: Error codes, procedures, specs
- get_door_info: Door details by ID
- search_doors: Find by customer/location
- search_parts: Parts inventory
- get_work_orders: Limble work orders
- get_service_history: Service history

## GUIDELINES
1. USE TOOLS - search_playbooks for ANY technical question
2. BE CONCISE - techs on mobile
3. LEAD WITH SOLUTION
4. NUMBERED STEPS for procedures
5. SAFETY WARNINGS prominent

## MANUFACTURER DETECTION
- "Index 99" / "FIS" / "DuraGlide" → Stanley
- "P01" / "double-click SET" → Horton
- "Handy Terminal" / "U30" → NABCO
- "SL500" / "Learn button" → Besam`;

interface Message { role: "user" | "assistant"; content: string; }
interface CopilotRequest {
  messages: Message[];
  doorId?: string;
  doorContext?: { manufacturer?: string; model?: string; location?: string; customer?: string; };
  technicianId?: string;
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: CopilotRequest = await req.json();
    if (!body.messages?.length) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let systemPrompt = SYSTEM_PROMPT;
    if (body.doorId || body.doorContext) {
      systemPrompt += "\n\n## CURRENT CONTEXT";
      if (body.doorId) systemPrompt += `\nDoor ID: ${body.doorId}`;
      if (body.doorContext?.manufacturer) systemPrompt += `\nManufacturer: ${body.doorContext.manufacturer}`;
      if (body.doorContext?.model) systemPrompt += `\nModel: ${body.doorContext.model}`;
      if (body.doorContext?.location) systemPrompt += `\nLocation: ${body.doorContext.location}`;
      if (body.doorContext?.customer) systemPrompt += `\nCustomer: ${body.doorContext.customer}`;
    }

    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    let iterations = 0;
    let toolsUsed = false;
    while (response.stop_reason === "tool_use" && iterations < 5) {
      iterations++;
      toolsUsed = true;

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
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

    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    const responseText = textBlocks.map((b) => b.text).join("\n");

    const latestUserMsg = body.messages.filter((m) => m.role === "user").pop()?.content || "";
    const manufacturer = detectManufacturer(latestUserMsg + " " + responseText) || body.doorContext?.manufacturer;

    return new Response(
      JSON.stringify({
        response: responseText,
        manufacturer,
        toolsUsed,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error) {
    console.error("Copilot error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request", details: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

function detectManufacturer(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/index\s*\d{1,2}|fis|duraglide|duracare|mc521|stanley|magic-swing/.test(lower)) return "stanley";
  if (/p\d{2}|double-click set|toggle switch|c3150|c4190|horton|series 2000/.test(lower)) return "horton";
  if (/handy terminal|u30|opus|nabco|gyro|gt[- ]?\d{3,4}/.test(lower)) return "nabco";
  if (/sl500|sw200|unislide|swingmaster|besam|assa abloy/.test(lower)) return "besam";
  return undefined;
}

export const config: Config = { path: "/api/copilot" };
