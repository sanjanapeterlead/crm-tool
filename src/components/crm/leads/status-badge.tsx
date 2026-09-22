import { Badge } from "@/components/ui/badge";
import { stageHue, toneStyle } from "@/lib/ui/tones";
import type { LeadStatus } from "@/lib/types/domain";

export function StatusBadge({
  status,
}: {
  status: Pick<LeadStatus, "label" | "is_won" | "is_lost"> & { sort_order?: number };
}) {
  return (
    <Badge variant="outline" style={toneStyle(stageHue(status))} className="tone-soft gap-1.5 font-medium">
      <span aria-hidden className="tone-bg size-1.5 rounded-full" />
      {status.label}
    </Badge>
  );
}
