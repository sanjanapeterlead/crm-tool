import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import type { FollowupFormInput } from "@/lib/validation/followup";
import type { FollowupStatus } from "@/lib/types/domain";
import { logActivity } from "@/lib/services/activities";
import { permissions } from "@/lib/permissions";

export type FollowupView = "today" | "upcoming" | "overdue" | "completed";

export async function listFollowups(
  supabase: SupabaseClient,
  session: SessionContext,
  view: FollowupView
) {
  let query = supabase
    .from("followups")
    .select("*, lead:lead_id(id, first_name, last_name), assignee:assigned_to(id, email, full_name)")
    .eq("org_id", session.orgId);

  if (!permissions.canViewAllLeads(session.role)) {
    query = query.eq("assigned_to", session.user.id);
  }

  const today = new Date().toISOString().slice(0, 10);

  if (view === "today") {
    query = query.eq("status", "pending").eq("due_date", today);
  } else if (view === "upcoming") {
    query = query.eq("status", "pending").gt("due_date", today);
  } else if (view === "overdue") {
    query = query.eq("status", "pending").lt("due_date", today);
  } else {
    query = query.eq("status", "completed");
  }

  const { data, error } = await query.order("due_date", { ascending: view !== "completed" });
  if (error) throw new Error(`Failed to load follow-ups: ${error.message}`);
  return data ?? [];
}

export async function createFollowup(
  supabase: SupabaseClient,
  session: SessionContext,
  input: FollowupFormInput
) {
  const { data: followup, error } = await supabase
    .from("followups")
    .insert({
      org_id: session.orgId,
      lead_id: input.lead_id,
      assigned_to: input.assigned_to || session.user.id,
      due_date: input.due_date,
      due_time: input.due_time || null,
      description: input.description,
      status: "pending",
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create follow-up: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId: input.lead_id,
    actorId: session.user.id,
    type: "followup_created",
    title: "Follow-up created",
    description: `Due ${input.due_date}${input.due_time ? ` at ${input.due_time}` : ""}: ${input.description}`,
  });

  return followup;
}

export async function updateFollowupStatus(
  supabase: SupabaseClient,
  session: SessionContext,
  followupId: string,
  leadId: string,
  status: FollowupStatus
) {
  const { error } = await supabase
    .from("followups")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", followupId);

  if (error) throw new Error(`Failed to update follow-up: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId,
    actorId: session.user.id,
    type: status === "completed" ? "followup_completed" : "followup_cancelled",
    title: status === "completed" ? "Follow-up completed" : "Follow-up cancelled",
  });
}
