"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateFollowupStatusAction } from "@/app/(app)/actions";
import type { Followup } from "@/lib/types/domain";

const STATUS_VARIANT: Record<Followup["status"], string> = {
  pending: "border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  completed: "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function FollowupRow({
  followup,
  showLead = false,
  showAssignee = false,
}: {
  followup: Followup;
  showLead?: boolean;
  showAssignee?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function updateStatus(status: "completed" | "cancelled") {
    startTransition(async () => {
      const result = await updateFollowupStatusAction(followup.id, followup.lead_id, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "completed" ? "Follow-up completed" : "Follow-up cancelled");
      router.refresh();
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {format(parseISO(followup.due_date), "MMM d, yyyy")}
            {followup.due_time ? ` · ${followup.due_time}` : ""}
          </span>
          <Badge variant="outline" className={STATUS_VARIANT[followup.status]}>
            {followup.status}
          </Badge>
        </div>
        {showLead && followup.lead && (
          <p className="text-sm text-muted-foreground">
            {followup.lead.first_name} {followup.lead.last_name}
          </p>
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
          <Button size="icon-sm" variant="outline" disabled={pending} onClick={() => updateStatus("completed")}>
            <Check className="size-3.5" />
          </Button>
          <Button size="icon-sm" variant="outline" disabled={pending} onClick={() => updateStatus("cancelled")}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
