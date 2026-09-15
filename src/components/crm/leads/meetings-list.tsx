import { format } from "date-fns";
import { Video, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MeetingStatusMenu } from "@/components/crm/leads/meeting-status-menu";
import type { Meeting } from "@/lib/types/domain";

const STATUS_VARIANT: Record<Meeting["status"], string> = {
  scheduled: "border-blue-600/30 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  completed: "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
  no_show: "border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export function MeetingsList({ meetings, leadId }: { meetings: Meeting[]; leadId: string }) {
  if (meetings.length === 0) {
    return <p className="text-sm text-muted-foreground">No meetings yet.</p>;
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => (
        <div key={meeting.id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {format(new Date(meeting.scheduled_start), "MMM d, yyyy · h:mm a")}
              </p>
              <Badge variant="outline" className={`mt-1 ${STATUS_VARIANT[meeting.status]}`}>
                {meeting.status.replace("_", " ")}
              </Badge>
            </div>
            <MeetingStatusMenu meetingId={meeting.id} leadId={leadId} status={meeting.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {meeting.meeting_url && (
              <a
                href={meeting.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Video className="size-3.5" /> Join Google Meet
              </a>
            )}
            {meeting.external_booking_url && (
              <a
                href={meeting.external_booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Calendly
              </a>
            )}
          </div>
          {meeting.notes && <p className="mt-2 text-sm text-muted-foreground">{meeting.notes}</p>}
        </div>
      ))}
    </div>
  );
}
