import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/types/domain";

export function StatusBadge({ status }: { status: Pick<LeadStatus, "label" | "is_won" | "is_lost"> }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        status.is_won && "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
        status.is_lost && "border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
      )}
    >
      {status.label}
    </Badge>
  );
}
