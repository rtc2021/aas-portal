import type { Context } from "@netlify/functions";

const DROPLET_URL = Netlify.env.get("DROPLET_URL") || "http://134.199.203.192:8000";
const DROPLET_INTERNAL_KEY = Netlify.env.get("DROPLET_INTERNAL_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function baseHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { "Content-Type": "application/json", ...CORS_HEADERS, ...extra };
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding) base64 += "=".repeat(4 - padding);
  return atob(base64);
}

function getRolesFromToken(authHeader: string | null): string[] {
  if (!authHeader?.startsWith("Bearer ")) return [];
  try {
    const parts = authHeader.substring(7).split(".");
    if (parts.length !== 3) return [];
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return payload["https://aas-portal.com/roles"] || [];
  } catch { return []; }
}

function getDropletPath(pathname: string): string | null {
  const match = pathname.match(/^\/api(\/pipeline\/.+)$/);
  return match ? match[1] : null;
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders() });
  }

  const requestUrl = new URL(req.url);
  const dropletPath = getDropletPath(requestUrl.pathname);
  if (!dropletPath) {
    return new Response(JSON.stringify({ error: "Unknown pipeline route" }), {
      status: 404, headers: baseHeaders(),
    });
  }

  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: baseHeaders(),
    });
  }

  const roles = getRolesFromToken(req.headers.get("Authorization"));
  if (!roles.includes("Admin")) {
    return new Response(JSON.stringify({ error: "Admin role required" }), {
      status: 403, headers: baseHeaders(),
    });
  }

  if (!DROPLET_INTERNAL_KEY) {
    return new Response(JSON.stringify({ error: "DROPLET_INTERNAL_KEY not configured" }), {
      status: 500, headers: baseHeaders(),
    });
  }

  try {
    const upstreamUrl = `${DROPLET_URL}${dropletPath}${requestUrl.search}`;
    const upstreamHeaders: Record<string, string> = {
      Accept: "application/json",
      "x-internal-key": DROPLET_INTERNAL_KEY,
    };

    const init: RequestInit = { method: req.method, headers: upstreamHeaders };

    if (req.method === "POST" || req.method === "PATCH") {
      upstreamHeaders["Content-Type"] = "application/json";
      init.body = await req.text();
    }

    const upstream = await fetch(upstreamUrl, init);
    const text = await upstream.text();

    return new Response(text, { status: upstream.status, headers: baseHeaders() });
  } catch (error) {
    console.error("[Pipeline Proxy] Error:", error);
    return new Response(JSON.stringify({ error: "Failed to reach pipeline service" }), {
      status: 502, headers: baseHeaders(),
    });
  }
}
