import type { NextRequest } from "next/server";
import { whatsappWebhookProviders } from "@/lib/composition/whatsapp";
import { getMetaConfig } from "@/lib/integrations/meta/config";
import { getRequestId, logger } from "@/lib/observability/logger";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rate-limit";
import { handleWhatsAppEvents } from "@/lib/services/conversations";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta's subscription handshake: echo `hub.challenge` if the verify token matches. */
export async function GET(request: NextRequest) {
  const config = getMetaConfig();
  if (!config) return new Response("Integration not configured", { status: 503 });

  const params = request.nextUrl.searchParams;
  if (params.get("hub.mode") !== "subscribe" || params.get("hub.verify_token") !== config.webhookVerifyToken) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
}

/**
 * Inbound WhatsApp messages and delivery receipts. Verified against the exact
 * raw body by whichever provider's signature matches (Meta's, or the mock's in
 * demo mode), rate-limited, then applied idempotently — Meta redelivers
 * anything it doesn't get a 200 for, and receipts arrive out of order.
 *
 * Processing failures still answer 200: they're recorded on the receipt and
 * healed by the provider's own retry, whereas a non-2xx would make Meta
 * disable the subscription after sustained failures.
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  const log = logger.child({ requestId, provider: "whatsapp", route: "webhooks/whatsapp" });
  const admin = createAdminClient();

  const ipLimit = await checkRateLimit(admin, {
    key: `webhook:whatsapp:ip:${clientIp(request.headers)}`,
    limit: 600,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

  const providers = whatsappWebhookProviders();
  if (providers.length === 0) return new Response("Integration not configured", { status: 503 });

  // The HMAC covers the exact bytes: verify before parsing.
  const rawBody = await request.text();
  const provider = providers.find((p) => p.verifyWebhook(rawBody, request.headers));
  if (!provider) {
    log.warn("webhook.rejected", { reason: "bad_signature" });
    return new Response("Invalid signature", { status: 401 });
  }

  let events;
  try {
    events = provider.parseWebhook(rawBody);
  } catch {
    log.warn("webhook.rejected", { reason: "malformed" });
    return new Response("Malformed payload", { status: 400 });
  }

  const results = await handleWhatsAppEvents(admin, { provider, events, requestId, log });
  log.info("webhook.processed", { provider: provider.id, events: results.length });
  return Response.json({ requestId, results });
}
