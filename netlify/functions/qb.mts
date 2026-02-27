import type { Context } from "@netlify/functions";

const DROPLET_URL = Netlify.env.get("DROPLET_URL");
const DROPLET_INTERNAL_KEY = Netlify.env.get("DROPLET_INTERNAL_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://aas-portal.netlify.app",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function baseHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
    ...extra,
  };
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }
  return atob(base64);
}

function getRolesFromToken(authHeader: string | null): string[] {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return [];
  }

  try {
    const token = authHeader.substring(7);
    const parts = token.split(".");
    if (parts.length !== 3) return [];

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const namespace = "https://aas-portal.com";
    return payload[`${namespace}/roles`] || [];
  } catch {
    return [];
  }
}

function getDropletPath(pathname: string): string | null {
  const base = pathname.replace(/^\/api\/qb\/?/, "");
  const normalized = base.replace(/\/+/g, "/").replace(/^\//, "");

  const allowedExact = new Set([
    "connect",
    "callback",
    "status",
    "disconnect",
    "customers",
    "customers/search",
    "products",
    "products/search",
    "invoice/create",
    "estimate/create",
    "terms",
    "taxcodes",
  ]);

  if (allowedExact.has(normalized)) {
    return `/qb/${normalized}`;
  }

  if (normalized.startsWith("invoice/")) {
    const rest = normalized.replace(/^invoice\//, "");
    if (rest && !rest.includes("/")) {
      return `/qb/invoice/${rest}`;
    }
    const subMatch = rest.match(/^([^/]+)\/(void|send)$/);
    if (subMatch) {
      return `/qb/invoice/${subMatch[1]}/${subMatch[2]}`;
    }
  }

  if (normalized.startsWith("estimate/")) {
    const rest = normalized.replace(/^estimate\//, "");
    if (rest && !rest.includes("/")) {
      return `/qb/estimate/${rest}`;
    }
  }

  return null;
}

function requiresInternalKey(dropletPath: string): boolean {
  return dropletPath !== "/qb/callback";
}

function requiresAdmin(dropletPath: string, method: string): boolean {
  if (method === "POST" && dropletPath === "/qb/invoice/create") return true;
  if (method === "POST" && dropletPath === "/qb/estimate/create") return true;
  if (method === "POST" && dropletPath.includes("/void")) return true;
  if (method === "POST" && dropletPath.includes("/send")) return true;
  return false;
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders() });
  }

  const requestUrl = new URL(req.url);
  const dropletPath = getDropletPath(requestUrl.pathname);
  if (!dropletPath) {
    return new Response(JSON.stringify({ error: "Unknown QB route" }), {
      status: 404,
      headers: baseHeaders(),
    });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: baseHeaders(),
    });
  }

  if (requiresAdmin(dropletPath, req.method)) {
    const roles = getRolesFromToken(req.headers.get("Authorization"));
    if (!roles.includes("Admin")) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: baseHeaders(),
      });
    }
  }

  try {
    const upstreamUrl = `${DROPLET_URL}${dropletPath}${requestUrl.search}`;
    const upstreamHeaders: Record<string, string> = {
      Accept: "application/json",
    };

    const authHeader = req.headers.get("Authorization");
    if (authHeader) upstreamHeaders.Authorization = authHeader;

    if (requiresInternalKey(dropletPath)) {
      if (!DROPLET_INTERNAL_KEY) {
        return new Response(JSON.stringify({ error: "DROPLET_INTERNAL_KEY is not configured" }), {
          status: 500,
          headers: baseHeaders(),
        });
      }
      upstreamHeaders["x-internal-key"] = DROPLET_INTERNAL_KEY;
    }

    const init: RequestInit = {
      method: req.method,
      headers: upstreamHeaders,
    };

    if (req.method === "POST") {
      upstreamHeaders["Content-Type"] = "application/json";
      init.body = await req.text();
    }

    const upstream = await fetch(upstreamUrl, init);
    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: baseHeaders(),
    });
  } catch (error) {
    console.error("[QB Proxy] Error:", error);
    return new Response(JSON.stringify({ error: "Failed to reach QB integration service" }), {
      status: 502,
      headers: baseHeaders(),
    });
  }
}

