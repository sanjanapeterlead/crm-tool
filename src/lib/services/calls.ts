import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import type { CallLogInput } from "@/lib/validation/call";
import { CALL_OUTCOME_LABELS } from "@/lib/domain/calls";
import { UserError } from "@/lib/domain/errors";
import { logActivity } from "@/lib/services/activities";
import { createFollowup } from "@/lib/services/followups";

/**
 * Records a call the salesperson made from their own phone. Append-only: a
 * call log is never edited, so the history of "what happened when" is
 * trustworthy. Optionally sets the next follow-up in the same step, since
 * "log it, then remember to call back" is the moment people forget.
 */
export async function logCall(db: SupabaseClient, session: SessionContext, input: CallLogInput) {
  const { data: lead, error: leadError } = await db
    .from("leads")
    .select("id, contact_id, first_contacted_at")
    .eq("id", input.lead_id)
    .eq("org_id", session.orgId)
    .maybeSingle();
  if (leadError) throw new Error(`Failed to load lead: ${leadError.message}`);
  if (!lead) throw new UserError("Lead not found.");

  const { data: call, error } = await db
    .from("call_logs")
    .insert({
      org_id: session.orgId,
      lead_id: lead.id,
      contact_id: lead.contact_id,
      caller_id: session.user.id,
      outcome: input.outcome,
      duration_seconds: input.duration_minutes != null ? input.duration_minutes * 60 : null,
      notes: input.notes || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to log call: ${error.message}`);

  // The first outreach takes a lead out of the "needs first contact" queue.
  if (!lead.first_contacted_at) {
    await db
      .from("leads")
      .update({ first_contacted_at: new Date().toISOString() })
      .eq("id", lead.id)
      .eq("org_id", session.orgId)
      .is("first_contacted_at", null);
  }

  await logActivity(db, {
    orgId: session.orgId,
    leadId: lead.id as string,
    actorId: session.user.id,
    type: "call_logged",
    title: `Call: ${CALL_OUTCOME_LABELS[input.outcome]}`,
    description: describeCall(input),
    metadata: { call_id: call.id, outcome: input.outcome, duration_minutes: input.duration_minutes ?? null },
  });

  if (input.next_followup) {
    await createFollowup(db, session, { ...input.next_followup, lead_id: lead.id as string });
  }

  return { callId: call.id as string };
}

function describeCall(input: CallLogInput): string | undefined {
  const parts: string[] = [];
  if (input.duration_minutes) parts.push(`${input.duration_minutes} min`);
  if (input.notes) parts.push(input.notes);
  return parts.length > 0 ? parts.join(" — ") : undefined;
}
