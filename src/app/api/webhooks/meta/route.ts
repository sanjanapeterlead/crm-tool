import type { NextRequest } from "next/server";
import { getMetaConfig } from "@/lib/integrations/meta/config";
import { verifyWebhookSignature } from "@/lib/security/signature";
import { MetaApiError } from "@/lib/integrations/meta/client";
import type { MetaLeadgenChangeValue, MetaWebhookPayload } from "@/lib/integrations/meta/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestId, logger, type Logger } from "@/lib/observability/logger";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rate-limit";
import { markConnected, markFailing } from "@/lib/services/integration-health";
import {
  createGraphClient,
  getPageToken,
  ingestMetaLead,
  markWebhookEvent,
  recordWebhookEvent,
  resolveOrgByPageId,
} from "@/lib/services/meta";

// Signature verification needs Node's crypto and the unbuffered raw body.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's subscription handshake: it calls this once when you save the callback
 * URL in the App Dashboard and expects `hub.challenge` echoed back verbatim.
 */
export async function GET(request: NextRequest) {
  const config = getMetaConfig();
  if (!config) return new Response("Integration not configured", { status: 503 });

  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || token !== config.webhookVerifyToken) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge ?? "", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

/**
 * Lead delivery. Meta retries any non-2xx response with backoff and disables
 * the subscription after sustained failures, so this handler returns 200 for
 * anything that is our problem to fix (an unmappable lead, a revoked token)
 * and records the failure in `meta_webhook_events` for retry from the admin
 * UI. A non-200 is reserved for "we genuinely could not tell what this was".
 */
export async function POST(request: NextRequest) {
  const config = getMetaConfig();
  if (!config) return new Response("Integration not configured", { status: 503 });

  const requestId = getRequestId(request.headers);
  const log = logger.child({ requestId, provider: "meta", route: "webhooks/meta" });
  const admin = createAdminClient();

  // Coarse per-address limit first, so junk can't reach the database. Generous:
  // Meta batches deliveries and retries on any non-2xx.
  const ipLimit = await checkRateLimit(admin, {
    key: `webhook:meta:ip:${clientIp(request.headers)}`,
    limit: 600,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

  // Read the raw body before parsing: the HMAC is over exact bytes.
  const rawBody = await request.text();
  const signatureValid = verifyWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    config.appSecret
  );

  if (!signatureValid) {
    // Never persist or act on unsigned input — it could be anyone.
    log.warn("webhook.rejected", { reason: "bad_signature" });
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }

  const changes: MetaLeadgenChangeValue[] = (payload.entry ?? []).flatMap((entry) =>
    (entry.changes ?? [])
      .filter((change) => change.field === "leadgen" && change.value?.leadgen_id)
      .map((change) => change.value)
  );

  for (const change of changes) {
    await processLeadgenChange(admin, change, payload, log);
  }

  return new Response("OK", { status: 200 });
}

async function processLeadgenChange(
  admin: ReturnType<typeof createAdminClient>,
  change: MetaLeadgenChangeValue,
  payload: MetaWebhookPayload,
  log: Logger
) {
  const resolved = await resolveOrgByPageId(admin, change.page_id).catch(() => null);

  const eventId = await recordWebhookEvent(admin, {
    orgId: resolved?.orgId ?? null,
    pageId: change.page_id ?? null,
    formId: change.form_id ?? null,
    leadgenId: change.leadgen_id,
    signatureValid: true,
    payload,
  });

  if (!resolved) {
    await markWebhookEvent(admin, eventId, {
      status: "ignored",
      error: `No connected organization owns Page ${change.page_id}.`,
    });
    return;
  }

  if (!resolved.isActive) {
    await markWebhookEvent(admin, eventId, {
      status: "ignored",
      error: "Lead ingestion is paused for this Page.",
      orgId: resolved.orgId,
    });
    return;
  }

  try {
    const pageToken = await getPageToken(admin, change.page_id);
    if (!pageToken) {
      throw new Error("No stored access token for this Page. Reconnect the Meta account.");
    }

    const { data: connection } = await admin
      .from("meta_connections")
      .select("default_assignee_id")
      .eq("org_id", resolved.orgId)
      .maybeSingle();

    // The webhook carries only identifiers; the answers come from the API.
    const graph = createGraphClient();
    const lead = await graph.getLead(change.leadgen_id, pageToken);

    const outcome = await ingestMetaLead(admin, {
      orgId: resolved.orgId,
      pageId: change.page_id,
      lead,
      defaultAssigneeId: (connection?.default_assignee_id as string | null) ?? null,
    });

    await markWebhookEvent(admin, eventId, {
      status: outcome.status,
      leadId: outcome.leadId,
      orgId: resolved.orgId,
    });
    await markConnected(admin, resolved.orgId, "meta");
    log.info("webhook.processed", { orgId: resolved.orgId, leadgenId: change.leadgen_id, outcome: outcome.status });
  } catch (e) {
    const message =
      e instanceof MetaApiError && e.isAuthError
        ? `Meta rejected our access token (${e.message}). Reconnect the Meta account in Settings.`
        : e instanceof Error
          ? e.message
          : "Unknown ingestion failure.";

    await markWebhookEvent(admin, eventId, {
      status: "failed",
      error: message,
      orgId: resolved.orgId,
    });
    await markFailing(admin, resolved.orgId, "meta", message);
    log.error("webhook.failed", { orgId: resolved.orgId, leadgenId: change.leadgen_id, error: e });
  }
}
