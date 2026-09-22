"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MetaApiError } from "@/lib/integrations/meta/client";
import * as metaService from "@/lib/services/meta";
import * as backfillService from "@/lib/services/meta-backfill";
import { ingestMetaLead } from "@/lib/services/meta";
import type { ActionResult } from "@/app/(app)/actions";

const SETTINGS_PATH = "/settings/integrations/meta";

function revalidateIntegration() {
  revalidatePath(SETTINGS_PATH);
  revalidatePath("/leads");
  revalidatePath("/");
}

function toMessage(e: unknown): string {
  if (e instanceof MetaApiError && e.isAuthError) {
    return `Meta rejected our access token: ${e.message}. Reconnect the Meta account.`;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function disconnectMetaAction(): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  try {
    await metaService.disconnect(createAdminClient(), session.orgId);
    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function setMetaDefaultAssigneeAction(
  assigneeId: string | null
): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  const supabase = await createClient();

  if (assigneeId) {
    const { data: member } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("org_id", session.orgId)
      .eq("user_id", assigneeId)
      .maybeSingle();

    if (!member) {
      return { ok: false, error: "That person is not a member of this organization." };
    }
  }

  try {
    await metaService.setDefaultAssignee(supabase, session.orgId, assigneeId);
    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

/** Subscribes or unsubscribes a Page from `leadgen` webhook delivery. */
export async function togglePageSubscriptionAction(
  pageId: string,
  subscribe: boolean
): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("meta_pages")
    .select("page_id")
    .eq("org_id", session.orgId)
    .eq("page_id", pageId)
    .maybeSingle();

  if (!page) return { ok: false, error: "That Page is not connected to this organization." };

  try {
    const token = await metaService.getPageToken(admin, pageId);
    if (!token) return { ok: false, error: "No access token for that Page. Reconnect Meta." };

    const graph = metaService.createGraphClient();
    if (subscribe) {
      await graph.subscribePageToLeadgen(pageId, token);
    } else {
      await graph.unsubscribePage(pageId, token);
    }

    await admin
      .from("meta_pages")
      .update({ webhook_subscribed: subscribe })
      .eq("org_id", session.orgId)
      .eq("page_id", pageId);

    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function togglePageActiveAction(
  pageId: string,
  isActive: boolean
): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  const supabase = await createClient();

  try {
    await metaService.setPageActive(supabase, session.orgId, pageId, isActive);
    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function syncLeadFormsAction(): Promise<ActionResult<{ synced: number }>> {
  const session = await requireRole(["admin"]);
  try {
    const result = await metaService.syncLeadForms(createAdminClient(), session.orgId);
    revalidateIntegration();
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function startBackfillAction(
  formId: string
): Promise<ActionResult<{ jobId: string }>> {
  const session = await requireRole(["admin"]);
  const admin = createAdminClient();

  const { data: form } = await admin
    .from("meta_lead_forms")
    .select("form_id, form_name")
    .eq("org_id", session.orgId)
    .eq("form_id", formId)
    .maybeSingle();

  if (!form) return { ok: false, error: "Unknown form. Sync forms and try again." };

  try {
    const job = await backfillService.createBackfillJob(admin, {
      orgId: session.orgId,
      formId,
      formName: (form.form_name as string) ?? null,
      startedBy: session.user.id,
    });
    revalidateIntegration();
    return { ok: true, data: { jobId: job.id } };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

/**
 * Advances a backfill by one batch. The client calls this repeatedly while
 * `done` is false, which keeps each request inside the serverless time limit.
 */
export async function runBackfillBatchAction(jobId: string): Promise<
  ActionResult<{
    done: boolean;
    status: string;
    imported: number;
    skipped: number;
    failed: number;
    error: string | null;
  }>
> {
  const session = await requireRole(["admin"]);
  try {
    const job = await backfillService.runBackfillBatch(createAdminClient(), session.orgId, jobId);
    revalidateIntegration();
    return {
      ok: true,
      data: {
        done: job.status !== "running" && job.status !== "pending",
        status: job.status,
        imported: job.imported_count,
        skipped: job.skipped_count,
        failed: job.failed_count,
        error: job.error,
      },
    };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function cancelBackfillAction(jobId: string): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  try {
    await backfillService.cancelBackfillJob(createAdminClient(), session.orgId, jobId);
    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

/** Re-runs ingestion for a single failed webhook delivery. */
export async function retryWebhookEventAction(eventId: string): Promise<ActionResult> {
  const session = await requireRole(["admin"]);
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("meta_webhook_events")
    .select("id, page_id, leadgen_id, attempts")
    .eq("org_id", session.orgId)
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { ok: false, error: "Event not found." };
  if (!event.leadgen_id || !event.page_id) {
    return { ok: false, error: "This event has no lead to retry." };
  }

  try {
    const token = await metaService.getPageToken(admin, event.page_id as string);
    if (!token) return { ok: false, error: "No access token for that Page. Reconnect Meta." };

    const { data: connection } = await admin
      .from("meta_connections")
      .select("default_assignee_id")
      .eq("org_id", session.orgId)
      .maybeSingle();

    const graph = metaService.createGraphClient();
    const lead = await graph.getLead(event.leadgen_id as string, token);

    const outcome = await ingestMetaLead(admin, {
      orgId: session.orgId,
      pageId: event.page_id as string,
      lead,
      defaultAssigneeId: (connection?.default_assignee_id as string | null) ?? null,
    });

    await admin
      .from("meta_webhook_events")
      .update({ attempts: ((event.attempts as number) ?? 0) + 1 })
      .eq("id", eventId);

    await metaService.markWebhookEvent(admin, eventId, {
      status: outcome.status,
      leadId: outcome.leadId,
    });

    revalidateIntegration();
    return { ok: true };
  } catch (e) {
    const message = toMessage(e);
    await metaService.markWebhookEvent(admin, eventId, { status: "failed", error: message });
    revalidateIntegration();
    return { ok: false, error: message };
  }
}
