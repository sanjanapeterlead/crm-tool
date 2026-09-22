import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGraphClient,
  getPageToken,
  ingestMetaLead,
  setAttributionFormName,
} from "@/lib/services/meta";

export interface BackfillJob {
  id: string;
  org_id: string;
  form_id: string;
  form_name: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  next_cursor: string | null;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pages of leads pulled per invocation. Kept small so a batch finishes inside
 * a serverless function's time limit; the caller advances the job by calling
 * `runBackfillBatch` again while `status` is still 'running'.
 */
const PAGES_PER_BATCH = 3;
const LEADS_PER_PAGE = 50;

export async function createBackfillJob(
  admin: SupabaseClient,
  params: { orgId: string; formId: string; formName: string | null; startedBy: string }
): Promise<BackfillJob> {
  const { data, error } = await admin
    .from("meta_backfill_jobs")
    .insert({
      org_id: params.orgId,
      form_id: params.formId,
      form_name: params.formName,
      status: "pending",
      started_by: params.startedBy,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to start backfill: ${error.message}`);
  return data as BackfillJob;
}

export async function getBackfillJob(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string
): Promise<BackfillJob | null> {
  const { data, error } = await supabase
    .from("meta_backfill_jobs")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load backfill job: ${error.message}`);
  return (data as BackfillJob | null) ?? null;
}

export async function listBackfillJobs(
  supabase: SupabaseClient,
  orgId: string,
  limit = 10
): Promise<BackfillJob[]> {
  const { data, error } = await supabase
    .from("meta_backfill_jobs")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load backfill jobs: ${error.message}`);
  return (data ?? []) as BackfillJob[];
}

/**
 * Imports the next few pages of historical leads for a job's form, then saves
 * the Graph cursor so the next call resumes exactly where this one stopped.
 * Returns the updated job; `status === 'running'` means there is more to do.
 */
export async function runBackfillBatch(
  admin: SupabaseClient,
  orgId: string,
  jobId: string
): Promise<BackfillJob> {
  const job = await getBackfillJob(admin, orgId, jobId);
  if (!job) throw new Error("Backfill job not found.");
  if (job.status === "completed" || job.status === "cancelled") return job;

  const { data: form } = await admin
    .from("meta_lead_forms")
    .select("page_id, form_name")
    .eq("org_id", orgId)
    .eq("form_id", job.form_id)
    .maybeSingle();

  if (!form) {
    return failJob(admin, jobId, "That form is no longer connected. Re-sync forms and try again.");
  }

  const pageToken = await getPageToken(admin, form.page_id as string);
  if (!pageToken) {
    return failJob(admin, jobId, "No access token for that Page. Reconnect the Meta account.");
  }

  const { data: connection } = await admin
    .from("meta_connections")
    .select("default_assignee_id")
    .eq("org_id", orgId)
    .maybeSingle();

  const graph = createGraphClient();
  const formName = (form.form_name as string) ?? job.form_name;

  let cursor = job.next_cursor;
  let imported = job.imported_count;
  let skipped = job.skipped_count;
  let failed = job.failed_count;
  let done = false;

  await admin.from("meta_backfill_jobs").update({ status: "running" }).eq("id", jobId);

  try {
    for (let page = 0; page < PAGES_PER_BATCH; page += 1) {
      const { leads, nextCursor } = await graph.listFormLeads(job.form_id, pageToken, {
        after: cursor ?? undefined,
        limit: LEADS_PER_PAGE,
      });

      for (const lead of leads) {
        try {
          const outcome = await ingestMetaLead(admin, {
            orgId,
            pageId: form.page_id as string,
            lead,
            defaultAssigneeId: (connection?.default_assignee_id as string | null) ?? null,
          });
          if (outcome.status === "processed") {
            imported += 1;
            await setAttributionFormName(admin, outcome.leadId, formName);
          } else {
            skipped += 1;
          }
        } catch {
          // One unmappable lead (e.g. a form collecting no contact field)
          // must not abort the rest of the import.
          failed += 1;
        }
      }

      cursor = nextCursor;
      if (!nextCursor) {
        done = true;
        break;
      }
    }
  } catch (e) {
    return failJob(
      admin,
      jobId,
      e instanceof Error ? e.message : "Backfill failed against the Meta API.",
      { imported, skipped, failed, cursor }
    );
  }

  const { data: updated, error } = await admin
    .from("meta_backfill_jobs")
    .update({
      status: done ? "completed" : "running",
      next_cursor: done ? null : cursor,
      imported_count: imported,
      skipped_count: skipped,
      failed_count: failed,
      error: null,
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update backfill job: ${error.message}`);

  if (done) {
    await admin
      .from("meta_lead_forms")
      .update({ last_backfilled_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("form_id", job.form_id);
  }

  return updated as BackfillJob;
}

async function failJob(
  admin: SupabaseClient,
  jobId: string,
  message: string,
  progress?: { imported: number; skipped: number; failed: number; cursor: string | null }
): Promise<BackfillJob> {
  const { data } = await admin
    .from("meta_backfill_jobs")
    .update({
      status: "failed",
      error: message,
      ...(progress
        ? {
            imported_count: progress.imported,
            skipped_count: progress.skipped,
            failed_count: progress.failed,
            next_cursor: progress.cursor,
          }
        : {}),
    })
    .eq("id", jobId)
    .select("*")
    .single();

  return data as BackfillJob;
}

export async function cancelBackfillJob(
  admin: SupabaseClient,
  orgId: string,
  jobId: string
): Promise<void> {
  await admin
    .from("meta_backfill_jobs")
    .update({ status: "cancelled" })
    .eq("org_id", orgId)
    .eq("id", jobId);
}
