"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { permissions } from "@/lib/permissions";
import {
  leadFormSchema,
  leadStatusChangeSchema,
  leadAssignSchema,
  type LeadFormInput,
} from "@/lib/validation/lead";
import { noteFormSchema, type NoteFormInput } from "@/lib/validation/note";
import { meetingFormSchema, meetingStatusSchema, type MeetingFormInput } from "@/lib/validation/meeting";
import { followupFormSchema, followupStatusSchema, type FollowupFormInput } from "@/lib/validation/followup";
import * as leadsService from "@/lib/services/leads";
import * as notesService from "@/lib/services/notes";
import * as meetingsService from "@/lib/services/meetings";
import * as followupsService from "@/lib/services/followups";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function revalidateLead(leadId: string) {
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  revalidatePath("/followups");
  revalidatePath("/meetings");
  revalidatePath("/");
}

export async function createLeadAction(input: LeadFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = leadFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const session = await requireSession();
  const supabase = await createClient();

  const { data: defaultStatus } = await supabase
    .from("lead_statuses")
    .select("id")
    .eq("org_id", session.orgId)
    .eq("is_default", true)
    .maybeSingle();

  if (!defaultStatus) return { ok: false, error: "No default lead status configured." };

  try {
    const lead = await leadsService.createLead(supabase, session, parsed.data, defaultStatus.id);
    revalidateLead(lead.id);
    return { ok: true, data: { id: lead.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create lead." };
  }
}

export async function updateLeadAction(leadId: string, input: LeadFormInput): Promise<ActionResult> {
  const parsed = leadFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const session = await requireSession();
  const supabase = await createClient();

  try {
    await leadsService.updateLead(supabase, session, leadId, parsed.data);
    revalidateLead(leadId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update lead." };
  }
}

export async function assignLeadAction(leadId: string, assignedTo: string): Promise<ActionResult> {
  const parsed = leadAssignSchema.safeParse({ lead_id: leadId, assigned_to: assignedTo });
  if (!parsed.success) return { ok: false, error: "Invalid assignment." };

  const session = await requireSession();
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("organization_members")
    .select("profile:user_id(full_name, email)")
    .eq("org_id", session.orgId)
    .eq("user_id", assignedTo)
    .maybeSingle();

  if (!member) return { ok: false, error: "That person is not a member of this organization." };
  const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
  const name = profile?.full_name || profile?.email || "team member";

  try {
    await leadsService.assignLead(supabase, session, leadId, assignedTo, name);
    revalidateLead(leadId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to assign lead." };
  }
}

export async function changeLeadStatusAction(leadId: string, statusId: string): Promise<ActionResult> {
  const parsed = leadStatusChangeSchema.safeParse({ lead_id: leadId, status_id: statusId });
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: current }, { data: next }] = await Promise.all([
    supabase.from("leads").select("status:status_id(label)").eq("id", leadId).maybeSingle(),
    supabase.from("lead_statuses").select("label").eq("id", statusId).maybeSingle(),
  ]);

  if (!next) return { ok: false, error: "Status not found." };
  const currentStatus = Array.isArray(current?.status) ? current?.status[0] : current?.status;
  const fromLabel = currentStatus?.label ?? "Unknown";

  try {
    await leadsService.changeLeadStatus(supabase, session, leadId, statusId, fromLabel, next.label);
    revalidateLead(leadId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to change status." };
  }
}

export async function createNoteAction(input: NoteFormInput): Promise<ActionResult> {
  const parsed = noteFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };

  const session = await requireSession();
  const supabase = await createClient();

  try {
    await notesService.createNote(supabase, session, parsed.data);
    revalidateLead(parsed.data.lead_id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add note." };
  }
}

export async function createMeetingAction(input: MeetingFormInput): Promise<ActionResult> {
  const parsed = meetingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid meeting." };

  const session = await requireSession();
  const supabase = await createClient();

  try {
    await meetingsService.createMeeting(supabase, session, parsed.data);
    revalidateLead(parsed.data.lead_id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to schedule meeting." };
  }
}

export async function updateMeetingStatusAction(
  meetingId: string,
  leadId: string,
  status: string
): Promise<ActionResult> {
  const parsed = meetingStatusSchema.safeParse({ meeting_id: meetingId, status });
  if (!parsed.success) return { ok: false, error: "Invalid meeting status." };

  const session = await requireSession();
  const supabase = await createClient();

  try {
    await meetingsService.updateMeetingStatus(supabase, session, meetingId, leadId, parsed.data.status);
    revalidateLead(leadId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update meeting." };
  }
}

export async function createFollowupAction(input: FollowupFormInput): Promise<ActionResult> {
  const parsed = followupFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid follow-up." };

  const session = await requireSession();
  const supabase = await createClient();

  try {
    await followupsService.createFollowup(supabase, session, parsed.data);
    revalidateLead(parsed.data.lead_id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create follow-up." };
  }
}

export async function updateFollowupStatusAction(
  followupId: string,
  leadId: string,
  status: string
): Promise<ActionResult> {
  const parsed = followupStatusSchema.safeParse({ followup_id: followupId, status });
  if (!parsed.success) return { ok: false, error: "Invalid follow-up status." };

  const session = await requireSession();
  const supabase = await createClient();

  try {
    await followupsService.updateFollowupStatus(supabase, session, followupId, leadId, parsed.data.status);
    revalidateLead(leadId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update follow-up." };
  }
}

export async function deleteLeadAction(leadId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!permissions.canDeleteLead(session.role)) {
    return { ok: false, error: "You don't have permission to delete leads." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/");
  return { ok: true };
}
