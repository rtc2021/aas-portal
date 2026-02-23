import type { Context } from "@netlify/functions";

const DROPLET_URL = Netlify.env.get("DROPLET_URL");
const PIPELINE_KEY = Netlify.env.get("DROPLET_INTERNAL_KEY") || "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://aas-portal.netlify.app",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function respond(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const ALLOWED_PREFIXES = [
  "/pipeline/customers",
  "/pipeline/parts",
  "/pipeline/rates",
  "/pipeline/billing",
  "/pipeline/log",
  "/pipeline/stats",
  "/pipeline/dry-run",
  "/pipeline/process",
  "/pipeline/dashboard",
];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?"));
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!DROPLET_URL) {
    return respond(JSON.stringify({ error: "DROPLET_URL is not configured" }), 500);
  }

  if (!PIPELINE_KEY) {
    return respond(JSON.stringify({ error: "DROPLET_INTERNAL_KEY is not configured" }), 500);
  }

  if (!["GET", "POST", "PATCH", "PUT"].includes(req.method)) {
    return respond(JSON.stringify({ error: "Method not allowed" }), 405);
  }

  const url = new URL(req.url);
  const dropletPath = url.pathname.replace(/^\/api/, "");

  if (!isAllowedPath(dropletPath)) {
    return respond(JSON.stringify({ error: "Unknown pipeline route" }), 404);
  }

  try {
    const target = `${DROPLET_URL}${dropletPath}${url.search}`;
    const upstreamHeaders: Record<string, string> = {
      "Accept": "application/json",
      "x-internal-key": PIPELINE_KEY,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      upstreamHeaders["Content-Type"] = "application/json";
    }

    const init: RequestInit = {
      method: req.method,
      headers: upstreamHeaders,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.text();
    }

    const upstream = await fetch(target, init);
    const text = await upstream.text();

    return respond(text, upstream.status);
  } catch (error) {
    console.error("[Pipeline Proxy] Error:", error);
    return respond(JSON.stringify({ error: "Failed to reach pipeline service" }), 502);
  }
}
