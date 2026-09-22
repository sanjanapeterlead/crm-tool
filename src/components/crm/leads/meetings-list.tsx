import { Video, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MeetingStatusMenu } from "@/components/crm/leads/meeting-status-menu";
import { MeetingSyncStatus, RescheduleMeetingDialog } from "@/components/crm/leads/meeting-calendar-controls";
import { dueBoundaries } from "@/lib/domain/due";
import { formatDateTime } from "@/lib/format";
import type { Meeting } from "@/lib/types/domain";

export const MEETING_STATUS_VARIANT: Record<Meeting["status"], string> = {
  scheduled: "border-blue-600/30 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  completed: "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
  no_show: "border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

/** The meeting's date and time as the org's clock reads them — what a reschedule form should start from. */
function localParts(iso: string, timezone: string) {
  const { today, nowTime } = dueBoundaries(new Date(iso), timezone);
  return { date: today, time: nowTime.slice(0, 5) };
}

export function MeetingsList({ meetings, timezone }: { meetings: Meeting[]; timezone: string }) {
  if (meetings.length === 0) {
    return <p className="text-sm text-muted-foreground">No meetings yet.</p>;
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => {
        const local = localParts(meeting.scheduled_start, timezone);
        return (
          <div key={meeting.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{formatDateTime(meeting.scheduled_start, timezone)}</p>
                {meeting.title && <p className="text-xs text-muted-foreground">{meeting.title}</p>}
                <Badge variant="outline" className={`mt-1 ${MEETING_STATUS_VARIANT[meeting.status]}`}>
                  {meeting.status.replace("_", " ")}
                </Badge>
              </div>
              <MeetingStatusMenu meetingId={meeting.id} status={meeting.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {meeting.meeting_url && (
                <a
                  href={meeting.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Video className="size-3.5" /> Join meeting
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
              {meeting.status === "scheduled" && (
                <RescheduleMeetingDialog
                  meetingId={meeting.id}
                  defaultDate={local.date}
                  defaultTime={local.time}
                  timezone={timezone}
                />
              )}
            </div>
            <div className="mt-2">
              <MeetingSyncStatus
                meetingId={meeting.id}
                provider={meeting.provider}
                syncError={meeting.sync_error}
                status={meeting.status}
              />
            </div>
            {meeting.notes && <p className="mt-2 text-sm text-muted-foreground">{meeting.notes}</p>}
          </div>
        );
      })}
    </div>
  );
}
