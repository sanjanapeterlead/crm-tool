"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Check, Phone, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { classifyDue, type DueState } from "@/lib/domain/due";
import { FOLLOWUP_TYPE_LABELS, type FollowupType } from "@/lib/validation/followup";
import { cn } from "@/lib/utils";
import { updateFollowupStatusAction } from "@/app/(app)/actions";
import type { Followup } from "@/lib/types/domain";

const STATUS_VARIANT: Record<Followup["status"], string> = {
  pending: "border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  completed: "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const DUE_LABEL: Record<DueState, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
};

const DUE_VARIANT: Record<DueState, string> = {
  overdue: "border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  due_today: "border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  upcoming: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function FollowupRow({
  followup,
  showLead = false,
  showAssignee = false,
  timezone,
  withCallLink = false,
}: {
  followup: Followup & { type?: string };
  showLead?: boolean;
  showAssignee?: boolean;
  /** When given, a pending follow-up shows Overdue / Due today / Upcoming in this timezone. */
  timezone?: string;
  /** Show a tap-to-call button (needs the lead's phone). */
  withCallLink?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const dueState =
    timezone && followup.status === "pending"
      ? classifyDue({ date: followup.due_date, time: followup.due_time }, new Date(), timezone)
      : null;
  const phone = (followup.lead as { phone?: string | null } | undefined)?.phone;

  function updateStatus(status: "completed" | "cancelled") {
    startTransition(async () => {
      const result = await updateFollowupStatusAction(followup.id, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "completed" ? "Follow-up completed" : "Follow-up cancelled");
      router.refresh();
    });
  }

  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-md border p-3", dueState === "overdue" && "border-red-600/30")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {format(parseISO(followup.due_date), "MMM d, yyyy")}
            {followup.due_time ? ` · ${followup.due_time.slice(0, 5)}` : ""}
          </span>
          <Badge variant="outline" className={dueState ? DUE_VARIANT[dueState] : STATUS_VARIANT[followup.status]}>
            {dueState ? DUE_LABEL[dueState] : followup.status}
          </Badge>
          {followup.type && followup.type !== "follow_up" && (
            <Badge variant="secondary">{FOLLOWUP_TYPE_LABELS[followup.type as FollowupType] ?? followup.type}</Badge>
          )}
        </div>
        {showLead && followup.lead && (
          <Link href={`/leads/${followup.lead.id}`} className="text-sm text-muted-foreground hover:underline">
            {followup.lead.first_name} {followup.lead.last_name}
          </Link>
        )}
        <p className="mt-1 text-sm">{followup.description}</p>
        {showAssignee && followup.assignee && (
          <p className="mt-1 text-xs text-muted-foreground">
            {followup.assignee.full_name || followup.assignee.email}
          </p>
        )}
      </div>
      {followup.status === "pending" && (
        <div className="flex shrink-0 gap-1.5">
          {withCallLink && phone && (
            <a href={`tel:${phone}`} aria-label="Call" className={buttonVariants({ size: "icon-sm", variant: "outline" })}>
              <Phone className="size-3.5" />
            </a>
          )}
          <Button size="icon-sm" variant="outline" disabled={pending} onClick={() => updateStatus("completed")} aria-label="Mark completed">
            <Check className="size-3.5" />
          </Button>
          <Button size="icon-sm" variant="outline" disabled={pending} onClick={() => updateStatus("cancelled")} aria-label="Cancel follow-up">
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
