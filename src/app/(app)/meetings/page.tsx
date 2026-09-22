import { Video, ExternalLink, CalendarClock } from "lucide-react";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { permissions } from "@/lib/domain/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/crm/layout/page-header";
import { EmptyState } from "@/components/crm/layout/empty-state";
import { MeetingStatusMenu } from "@/components/crm/leads/meeting-status-menu";
import { MeetingSyncStatus } from "@/components/crm/leads/meeting-calendar-controls";
import { MEETING_STATUS_VARIANT as STATUS_VARIANT } from "@/components/crm/leads/meetings-list";
import { formatDateTime } from "@/lib/format";
import type { Meeting, Lead, Profile } from "@/lib/types/domain";

export default async function MeetingsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  let query = supabase
    .from("meetings")
    .select("*, lead:lead_id(id, first_name, last_name), salesperson:salesperson_id(id, email, full_name)")
    .eq("org_id", session.orgId);

  if (!permissions.canViewAllLeads(session.role)) {
    query = query.eq("salesperson_id", session.user.id);
  }

  const { data, error } = await query.order("scheduled_start", { ascending: false });
  if (error) throw new Error(error.message);

  const meetings = (data ?? []) as unknown as (Meeting & {
    lead: Pick<Lead, "id" | "first_name" | "last_name">;
    salesperson: Profile | null;
  })[];

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarClock} title="Meetings" description="Every meeting booked through the CRM." />

      {meetings.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No meetings yet"
          description="Schedule one from a lead's detail page — it'll show up here with its Meet link and status."
        />
      ) : (
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <Card key={meeting.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/leads/${meeting.lead.id}`} className="font-medium hover:underline">
                    {meeting.lead.first_name} {meeting.lead.last_name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{formatDateTime(meeting.scheduled_start, session.timezone)}</span>
                    <Badge variant="outline" className={STATUS_VARIANT[meeting.status]}>
                      {meeting.status.replace("_", " ")}
                    </Badge>
                    <span>{meeting.salesperson?.full_name || meeting.salesperson?.email}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-sm">
                    {meeting.meeting_url && (
                      <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        <Video className="size-3.5" /> Join
                      </a>
                    )}
                    {meeting.external_booking_url && (
                      <a href={meeting.external_booking_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="size-3.5" /> Calendly
                      </a>
                    )}
                  </div>
                  <div className="mt-1">
                    <MeetingSyncStatus
                      meetingId={meeting.id}
                      provider={meeting.provider}
                      syncError={meeting.sync_error}
                      status={meeting.status}
                    />
                  </div>
                </div>
                <MeetingStatusMenu meetingId={meeting.id} status={meeting.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
