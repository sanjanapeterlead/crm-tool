import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Mail, Phone, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLead, getLeadTimeline } from "@/lib/services/leads";
import { listLeadStatuses, listOrgMembers } from "@/lib/services/team";
import { getOrganization } from "@/lib/services/settings";
import { canAccessLead } from "@/lib/permissions";
import { StatusBadge } from "@/components/crm/leads/status-badge";
import { AssignLeadDialog } from "@/components/crm/leads/assign-lead-dialog";
import { ChangeStatusDialog } from "@/components/crm/leads/change-status-dialog";
import { ScheduleMeetingDialog } from "@/components/crm/leads/schedule-meeting-dialog";
import { AddNoteDialog } from "@/components/crm/leads/add-note-dialog";
import { AddFollowupDialog } from "@/components/crm/followups/add-followup-dialog";
import { EditLeadDialog } from "@/components/crm/leads/edit-lead-dialog";
import { ActivityTimeline } from "@/components/crm/leads/activity-timeline";
import { NotesList } from "@/components/crm/leads/notes-list";
import { MeetingsList } from "@/components/crm/leads/meetings-list";
import { FollowupRow } from "@/components/crm/followups/followup-row";
import type { Lead, LeadStatus, Profile } from "@/lib/types/domain";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const lead = await getLead(supabase, id);
  if (!lead) notFound();
  if (!canAccessLead(session.role, session.user.id, lead)) notFound();

  const [{ notes, meetings, followups, activities }, statuses, members, organization] = await Promise.all([
    getLeadTimeline(supabase, id),
    listLeadStatuses(supabase, session.orgId),
    listOrgMembers(supabase, session),
    getOrganization(supabase, session.orgId),
  ]);

  const memberProfiles = members
    .map((m) => (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile)
    .filter(Boolean);

  const leadTyped = lead as unknown as Lead & { status: LeadStatus; assignee: Profile | null };
  const nextFollowup = followups.find((f) => f.status === "pending") ?? null;
  const upcomingMeeting = meetings.find((m) => m.status === "scheduled") ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {leadTyped.first_name} {leadTyped.last_name}
                  </h1>
                  <EditLeadDialog
                    lead={leadTyped}
                    members={memberProfiles}
                    trigger={
                      <Button variant="ghost" size="icon-sm">
                        <Pencil className="size-3.5" />
                      </Button>
                    }
                  />
                </div>
                <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:gap-4">
                  {leadTyped.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="size-3.5" /> {leadTyped.phone}
                    </span>
                  )}
                  {leadTyped.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="size-3.5" /> {leadTyped.email}
                    </span>
                  )}
                  <span>Source: {leadTyped.source}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={leadTyped.status} />
                <span className="text-sm text-muted-foreground">
                  Assigned to {leadTyped.assignee?.full_name || leadTyped.assignee?.email || "Unassigned"}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <ChangeStatusDialog
                leadId={id}
                statuses={statuses}
                currentStatusId={leadTyped.status_id}
                trigger={<Button variant="outline">Change Status</Button>}
              />
              <ScheduleMeetingDialog
                leadId={id}
                calendlyBookingUrl={organization.calendly_booking_url}
                trigger={<Button variant="outline">Schedule Meeting</Button>}
              />
              <AddFollowupDialog
                leadId={id}
                members={memberProfiles}
                defaultAssignee={leadTyped.assigned_to ?? session.user.id}
                trigger={<Button variant="outline">Add Follow-up</Button>}
              />
              <AddNoteDialog leadId={id} trigger={<Button variant="outline">Add Note</Button>} />
              <AssignLeadDialog
                leadId={id}
                members={memberProfiles}
                currentAssignee={leadTyped.assigned_to}
                trigger={<Button variant="outline">Reassign</Button>}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline activities={activities} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <NotesList notes={notes} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next Follow-up</CardTitle>
          </CardHeader>
          <CardContent>
            {nextFollowup ? (
              <FollowupRow followup={nextFollowup} />
            ) : (
              <p className="text-sm text-muted-foreground">No follow-up scheduled.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Meeting</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingMeeting ? (
              <p className="text-sm">
                {format(new Date(upcomingMeeting.scheduled_start), "MMM d, yyyy · h:mm a")}
                <br />
                {upcomingMeeting.meeting_url && (
                  <Link
                    href={upcomingMeeting.meeting_url}
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    Google Meet link
                  </Link>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming meeting.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingsList meetings={meetings} leadId={id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Follow-up History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {followups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups yet.</p>
            ) : (
              followups.map((f) => <FollowupRow key={f.id} followup={f} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
