import { format } from "date-fns";
import {
  UserPlus,
  RefreshCw,
  ArrowRightLeft,
  StickyNote,
  CalendarPlus,
  CalendarCheck,
  CalendarX,
  ListChecks,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import type { Activity, ActivityType } from "@/lib/types/domain";

const ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  lead_created: UserPlus,
  lead_updated: RefreshCw,
  lead_assigned: ArrowRightLeft,
  status_changed: RefreshCw,
  note_created: StickyNote,
  meeting_scheduled: CalendarPlus,
  meeting_completed: CalendarCheck,
  meeting_cancelled: CalendarX,
  followup_created: ListChecks,
  followup_completed: CheckCircle2,
  followup_cancelled: XCircle,
  followup_rescheduled: Clock,
};

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {activities.map((activity, idx) => {
        const Icon = ICONS[activity.activity_type as ActivityType] ?? RefreshCw;
        return (
          <li key={activity.id} className="relative flex gap-3 pb-6 last:pb-0">
            {idx < activities.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border" />
            )}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
              <Icon className="size-4 text-muted-foreground" />
            </span>
            <div className="pt-1">
              <p className="text-sm font-medium">{activity.title}</p>
              {activity.description && (
                <p className="text-sm text-muted-foreground">{activity.description}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {format(new Date(activity.created_at), "MMM d, yyyy · h:mm a")}
                {activity.actor?.full_name ? ` · ${activity.actor.full_name}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
