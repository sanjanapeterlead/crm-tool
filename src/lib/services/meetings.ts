import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import type { MeetingFormInput } from "@/lib/validation/meeting";
import type { MeetingStatus } from "@/lib/types/domain";
import { logActivity } from "@/lib/services/activities";

export async function createMeeting(
  supabase: SupabaseClient,
  session: SessionContext,
  input: MeetingFormInput
) {
  const scheduledStart = new Date(`${input.scheduled_date}T${input.scheduled_time}:00`);
  const scheduledEnd = new Date(scheduledStart.getTime() + input.duration_minutes * 60_000);

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      org_id: session.orgId,
      lead_id: input.lead_id,
      salesperson_id: input.salesperson_id || session.user.id,
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      meeting_type: "calendly",
      meeting_url: input.meeting_url || null,
      external_booking_url: input.external_booking_url || null,
      notes: input.notes || null,
      status: "scheduled",
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to schedule meeting: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId: input.lead_id,
    actorId: session.user.id,
    type: "meeting_scheduled",
    title: "Meeting scheduled",
    description: `Scheduled for ${scheduledStart.toLocaleString()}.`,
  });

  return meeting;
}

const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

const STATUS_ACTIVITY: Record<MeetingStatus, "meeting_completed" | "meeting_cancelled" | null> = {
  scheduled: null,
  completed: "meeting_completed",
  cancelled: "meeting_cancelled",
  no_show: "meeting_cancelled",
};

export async function updateMeetingStatus(
  supabase: SupabaseClient,
  session: SessionContext,
  meetingId: string,
  leadId: string,
  status: MeetingStatus
) {
  const { error } = await supabase.from("meetings").update({ status }).eq("id", meetingId);
  if (error) throw new Error(`Failed to update meeting: ${error.message}`);

  const activityType = STATUS_ACTIVITY[status];
  if (activityType) {
    await logActivity(supabase, {
      orgId: session.orgId,
      leadId,
      actorId: session.user.id,
      type: activityType,
      title: `Meeting ${STATUS_LABELS[status].toLowerCase()}`,
    });
  }
}
