import type { Context, Config } from "@netlify/functions";

/**
 * QB Webhook Handler — receives real-time events from QuickBooks Online
 * 
 * Events handled:
 *   Estimate.Update  → sync estimate status (Pending/Accepted/Rejected)
 *   Invoice.Update   → sync invoice status (Paid/Voided)
 *   Invoice.Void     → mark invoice voided
 *   Payment.Create   → mark invoice paid
 *   Estimate.Emailed → mark estimate as sent
 * 
 * Flow:
 *   1. Verify HMAC-SHA256 signature (QB requirement)
 *   2. Parse event notifications
 *   3. Forward to droplet API for processing
 *   4. Return 200 within 3 seconds (QB timeout)
 * 
 * QB sends: { "eventNotifications": [{ "realmId": "...", "dataChangeEvent": { "entities": [...] } }] }
 */

// HMAC-SHA256 verification
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", algorithm: { name: "HMAC", hash: "SHA-256" } },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === signature;
}

export default async (req: Request, context: Context) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const DROPLET_URL = Netlify.env.get("DROPLET_URL");
  const verifierToken = Netlify.env.get("QB_WEBHOOK_VERIFIER_TOKEN");
  const internalKey = Netlify.env.get("QB_INTERNAL_KEY");

  if (!DROPLET_URL || !verifierToken || !internalKey) {
    const missing = [
      !DROPLET_URL && "DROPLET_URL",
      !verifierToken && "QB_WEBHOOK_VERIFIER_TOKEN",
      !internalKey && "QB_INTERNAL_KEY",
    ].filter(Boolean);
    console.error(`[QB Webhook] Missing env vars: ${missing.join(", ")}`);
    return new Response("Server misconfigured", { status: 500 });
  }

  // Read body as text for signature verification
  const bodyText = await req.text();

  // Handle QB verification challenge (GET with challenge param)
  // QB may also POST an empty body to verify the endpoint
  if (!bodyText || bodyText.trim() === "") {
    return new Response("OK", { status: 200 });
  }

  // Verify HMAC-SHA256 signature
  const signature = req.headers.get("intuit-signature");
  if (!signature) {
    console.error("[QB Webhook] REJECTED: Missing intuit-signature header");
    return new Response("Missing signature", { status: 401 });
  }

  const valid = await verifySignature(bodyText, signature, verifierToken);
  if (!valid) {
    console.error("[QB Webhook] Invalid signature — possible spoofed request");
    return new Response("Invalid signature", { status: 401 });
  }

  // Parse the webhook payload
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (e) {
    console.error(`[QB Webhook] Failed to parse JSON body — first 200 chars: ${bodyText.substring(0, 200)}`);
    return new Response("Invalid JSON", { status: 400 });
  }

  const notifications = payload.eventNotifications || [];
  console.log(`[QB Webhook] Received ${notifications.length} notification(s)`);

  // Process each notification — extract events we care about
  const events: Array<{ entity: string; operation: string; id: string; name: string }> = [];

  for (const notif of notifications) {
    const realmId = notif.realmId;
    const entities = notif.dataChangeEvent?.entities || [];

    for (const entity of entities) {
      const entityName = entity.name; // "Estimate", "Invoice", "Payment"
      const entityId = entity.id;
      const operation = entity.operation; // "Create", "Update", "Delete", "Void", "Emailed"
      const lastUpdated = entity.lastUpdated;

      console.log(`[QB Webhook] ${entityName}.${operation} — ID: ${entityId}, realm: ${realmId}`);

      // Validate entity ID
      if (!entityId) {
        console.warn(`[QB Webhook] Skipped ${entityName}.${operation} — missing entity ID`);
        continue;
      }

      // Only forward events we handle
      if (
        (entityName === "Estimate" && ["Update", "Emailed"].includes(operation)) ||
        (entityName === "Invoice" && ["Update", "Void"].includes(operation)) ||
        (entityName === "Payment" && operation === "Create")
      ) {
        events.push({
          entity: entityName,
          operation,
          id: entityId,
          name: `${entityName}.${operation}`,
          lastUpdated,
        });
      } else {
        console.log(`[QB Webhook] Skipped unhandled event: ${entityName}.${operation}`);
      }
    }
  }

  // Forward events to droplet API (fire and forget — must respond within 3 seconds)
  if (events.length > 0) {
    try {
      // Use waitUntil to process after responding
      context.waitUntil(
        fetch(`${DROPLET_URL}/pipeline/v2/webhook/qb`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": internalKey,
          },
          body: JSON.stringify({
            events,
            raw_payload: payload,
            received_at: new Date().toISOString(),
          }),
        })
          .then(async (resp) => {
            const body = await resp.text();
            if (resp.status !== 200) {
              console.error(`[QB Webhook] Droplet returned ${resp.status}: ${body.substring(0, 500)}`);
              return;
            }
            try {
              const result = JSON.parse(body);
              const failures = result.results?.filter((r: any) => r.status?.startsWith("error:") || r.status?.startsWith("qb_fetch_failed")) || [];
              if (failures.length > 0) {
                console.error(`[QB Webhook] ${failures.length}/${result.processed} events failed on droplet: ${JSON.stringify(failures)}`);
              } else {
                console.log(`[QB Webhook] Forwarded ${events.length} events — all processed successfully`);
              }
            } catch {
              console.log(`[QB Webhook] Forwarded ${events.length} events — status: ${resp.status}`);
            }
          })
          .catch((err) => {
            console.error(`[QB Webhook] CRITICAL: Failed to forward ${events.length} events to droplet. Events: ${JSON.stringify(events)}. Error: ${err}`);
          })
      );
    } catch (err) {
      console.error(`[QB Webhook] Forward error: ${err}`);
    }
  }

  // Always return 200 quickly — QB requires response within 3 seconds
  return new Response("OK", { status: 200 });
};

export const config: Config = {
  path: "/api/qb/webhook",
};
