import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import type { FollowupFormInput } from "@/lib/validation/followup";
import type { FollowupStatus } from "@/lib/types/domain";
import { dueBoundaries } from "@/lib/domain/due";
import { UserError } from "@/lib/domain/errors";
import { permissions } from "@/lib/domain/permissions";
import { logActivity } from "@/lib/services/activities";
import { getOrgTimezone } from "@/lib/services/settings";

export type FollowupView = "today" | "upcoming" | "overdue" | "completed";

/**
 * Lists follow-ups for a view. "Today" and "overdue" are measured against the
 * org's own clock (DECISIONS D-007): something due at 10:00 is *overdue* at
 * 15:00, not "today", and a day ends at the org's midnight, not UTC's.
 */
export async function listFollowups(
  db: SupabaseClient,
  session: SessionContext,
  view: FollowupView,
  options: { /** Only the caller's own follow-ups, even for a manager (their personal queue). */ mine?: boolean } = {}
) {
  const timezone = await getOrgTimezone(db, session.orgId);
  const { today, nowTime } = dueBoundaries(new Date(), timezone);

  let query = db
    .from("followups")
    .select("*, lead:lead_id(id, first_name, last_name, phone), assignee:assigned_to(id, email, full_name)")
    .eq("org_id", session.orgId);

  if (options.mine || !permissions.canViewAllLeads(session.role)) {
    query = query.eq("assigned_to", session.user.id);
  }

  // today / nowTime come from our own clock, never from user input.
  if (view === "today") {
    query = query
      .eq("status", "pending")
      .eq("due_date", today)
      .or(`due_time.is.null,due_time.gte.${nowTime}`);
  } else if (view === "upcoming") {
    query = query.eq("status", "pending").gt("due_date", today);
  } else if (view === "overdue") {
    query = query
      .eq("status", "pending")
      .or(`due_date.lt.${today},and(due_date.eq.${today},due_time.lt.${nowTime})`);
  } else {
    query = query.eq("status", "completed");
  }

  const { data, error } = await query
    .order("due_date", { ascending: view !== "completed" })
    .order("due_time", { ascending: view !== "completed", nullsFirst: false });
  if (error) throw new Error(`Failed to load follow-ups: ${error.message}`);
  return data ?? [];
}

export async function createFollowup(db: SupabaseClient, session: SessionContext, input: FollowupFormInput) {
  const assigneeId = input.assigned_to || session.user.id;

  if (assigneeId !== session.user.id) {
    const { data: member } = await db
      .from("organization_members")
      .select("user_id")
      .eq("org_id", session.orgId)
      .eq("user_id", assigneeId)
      .maybeSingle();
    if (!member) throw new UserError("That person is not a member of this organization.");
  }

  const { data: followup, error } = await db
    .from("followups")
    .insert({
      org_id: session.orgId,
      lead_id: input.lead_id,
      assigned_to: assigneeId,
      type: input.type ?? "follow_up",
      due_date: input.due_date,
      due_time: input.due_time || null,
      description: input.description,
      status: "pending",
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) {
    // RLS hides a lead the caller can't see, so "not found" is the honest answer.
    if (error.code === "42501" || error.code === "23503") throw new UserError("Lead not found.");
    throw new Error(`Failed to create follow-up: ${error.message}`);
  }

  await logActivity(db, {
    orgId: session.orgId,
    leadId: input.lead_id,
    actorId: session.user.id,
    type: "followup_created",
    title: "Follow-up created",
    description: `Due ${input.due_date}${input.due_time ? ` at ${input.due_time}` : ""}: ${input.description}`,
  });

  return followup;
}

/**
 * Completes or cancels a follow-up. The lead the timeline entry is written to
 * comes from the follow-up row itself — never from the caller — so a forged
 * `leadId` can't plant an entry on someone else's lead.
 */
export async function updateFollowupStatus(
  db: SupabaseClient,
  session: SessionContext,
  followupId: string,
  status: FollowupStatus
) {
  const { data: followup, error: loadError } = await db
    .from("followups")
    .select("id, lead_id, status")
    .eq("id", followupId)
    .eq("org_id", session.orgId)
    .maybeSingle();
  if (loadError) throw new Error(`Failed to load follow-up: ${loadError.message}`);
  if (!followup) throw new UserError("Follow-up not found.");

  const { error } = await db
    .from("followups")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", followupId)
    .eq("org_id", session.orgId);

  if (error) throw new Error(`Failed to update follow-up: ${error.message}`);

  await logActivity(db, {
    orgId: session.orgId,
    leadId: followup.lead_id as string,
    actorId: session.user.id,
    type: status === "completed" ? "followup_completed" : "followup_cancelled",
    title: status === "completed" ? "Follow-up completed" : "Follow-up cancelled",
  });

  return { leadId: followup.lead_id as string };
}
