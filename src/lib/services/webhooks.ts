import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redact } from "@/lib/observability/logger";

const UNIQUE_VIOLATION = "23505";

export type ReceiptStatus = "received" | "processed" | "duplicate" | "ignored" | "unmatched" | "failed";

/** Statuses that mean "we already dealt with this event" — a redelivery is a no-op. */
const SETTLED: ReceiptStatus[] = ["processed", "duplicate", "ignored", "unmatched"];

export interface Receipt {
  id: string;
  /** True when this exact provider event was already handled: skip processing. */
  alreadyHandled: boolean;
}

/**
 * Registers an inbound provider event before acting on it. The unique key on
 * `(provider, event_key)` is the idempotency guarantee for every webhook that
 * isn't Meta's original one: the second delivery finds the first's row.
 *
 * An event whose earlier attempt `failed` (or never finished) is *not*
 * settled — the provider retrying it is exactly how a transient error heals —
 * so it's handed back for reprocessing with `attempts` bumped.
 */
export async function beginReceipt(
  admin: SupabaseClient,
  params: { provider: string; eventKey: string; orgId: string | null; requestId: string }
): Promise<Receipt> {
  const { data, error } = await admin
    .from("webhook_receipts")
    .insert({
      provider: params.provider,
      event_key: params.eventKey,
      org_id: params.orgId,
      request_id: params.requestId,
    })
    .select("id")
    .single();

  if (!error) return { id: data.id as string, alreadyHandled: false };
  if (error.code !== UNIQUE_VIOLATION) throw new Error(`Failed to record webhook receipt: ${error.message}`);

  const { data: existing, error: lookupError } = await admin
    .from("webhook_receipts")
    .select("id, status, attempts")
    .eq("provider", params.provider)
    .eq("event_key", params.eventKey)
    .single();
  if (lookupError || !existing) throw new Error("Failed to read the existing webhook receipt.");

  if (SETTLED.includes(existing.status as ReceiptStatus)) {
    return { id: existing.id as string, alreadyHandled: true };
  }

  await admin
    .from("webhook_receipts")
    .update({ attempts: (existing.attempts as number) + 1, request_id: params.requestId, status: "received" })
    .eq("id", existing.id);
  return { id: existing.id as string, alreadyHandled: false };
}

export async function finishReceipt(
  admin: SupabaseClient,
  receiptId: string,
  outcome: { status: ReceiptStatus; error?: unknown; orgId?: string | null }
): Promise<void> {
  const message =
    outcome.error === undefined
      ? null
      : String(redact(outcome.error instanceof Error ? outcome.error.message : String(outcome.error))).slice(0, 500);

  await admin
    .from("webhook_receipts")
    .update({
      status: outcome.status,
      error: message,
      processed_at: new Date().toISOString(),
      ...(outcome.orgId !== undefined ? { org_id: outcome.orgId } : {}),
    })
    .eq("id", receiptId);
}

export async function listReceipts(db: SupabaseClient, orgId: string, limit = 25) {
  const { data, error } = await db
    .from("webhook_receipts")
    .select("id, provider, event_key, status, error, attempts, received_at, processed_at")
    .eq("org_id", orgId)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load webhook receipts: ${error.message}`);
  return data ?? [];
}
