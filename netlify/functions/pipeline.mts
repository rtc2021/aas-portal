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

function extractPathname(value: string): string {
  if (!value) return "";
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return new URL(value).pathname;
    }
  } catch {
    // Fall through to raw parsing.
  }
  const rawPath = value.split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function extractPipelineRoute(pathname: string): string | null {
  const apiMatch = pathname.match(/^\/api(\/pipeline(?:\/.+)?)$/);
  if (apiMatch) return apiMatch[1];

  // Support direct function invocation forms used by some Netlify rewrite flows.
  const fnMatch = pathname.match(/^\/.netlify\/functions\/pipeline(\/.+)?$/);
  if (fnMatch) return `/pipeline${fnMatch[1] || ""}`;

  const rawPipelineMatch = pathname.match(/^(\/pipeline(?:\/.+)?)$/);
  if (rawPipelineMatch) return rawPipelineMatch[1];

  return null;
}

function getDropletPath(pathname: string, originalPathname?: string | null, search?: string): string | null {
  const directMatch = extractPipelineRoute(pathname);
  if (directMatch) return directMatch;

  if (originalPathname) {
    const rawOriginalPath = extractPathname(originalPathname);
    const originalMatch = extractPipelineRoute(rawOriginalPath);
    if (originalMatch) return originalMatch;
  }

  // Netlify rewrites can invoke the function URL directly while preserving
  // the original route in a query string key such as `path`.
  if (search) {
    const params = new URLSearchParams(search);
    const pathQuery = params.get("path") || params.get("pathname") || params.get("route");
    if (pathQuery) {
      const queryPath = extractPathname(pathQuery);
      const queryMatch = extractPipelineRoute(queryPath);
      if (queryMatch) return queryMatch;
    }
  }

  return null;
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders() });
  }

  const requestUrl = new URL(req.url);
  const originalPath = req.headers.get("x-original-url")
    || req.headers.get("x-nf-original-pathname")
    || req.headers.get("x-nf-original-path")
    || req.headers.get("x-nf-request-uri")
    || req.headers.get("x-forwarded-uri");
  const dropletPath = getDropletPath(requestUrl.pathname, originalPath, requestUrl.search);
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
    const upstreamSearchParams = new URLSearchParams(requestUrl.search);
    upstreamSearchParams.delete("path");
    upstreamSearchParams.delete("pathname");
    upstreamSearchParams.delete("route");
    const upstreamQuery = upstreamSearchParams.toString();
    const upstreamUrl = `${DROPLET_URL}${dropletPath}${upstreamQuery ? `?${upstreamQuery}` : ""}`;
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
