import { format } from "date-fns";
import { Video, ExternalLink } from "lucide-react";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { permissions } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingStatusMenu } from "@/components/crm/leads/meeting-status-menu";
import type { Meeting, Lead, Profile } from "@/lib/types/domain";

const STATUS_VARIANT: Record<Meeting["status"], string> = {
  scheduled: "border-blue-600/30 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  completed: "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
  no_show: "border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
        <p className="text-sm text-muted-foreground">Every meeting booked through the CRM.</p>
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No meetings yet. Schedule one from a lead&apos;s detail page.
        </div>
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
                    <span>{format(new Date(meeting.scheduled_start), "MMM d, yyyy · h:mm a")}</span>
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
                </div>
                <MeetingStatusMenu meetingId={meeting.id} leadId={meeting.lead.id} status={meeting.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
