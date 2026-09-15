import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeadStatus } from "@/lib/types/domain";

export function PipelineOverview({
  pipeline,
}: {
  pipeline: { status: LeadStatus; count: number }[];
}) {
  const max = Math.max(1, ...pipeline.map((p) => p.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pipeline.map(({ status, count }) => (
          <Link
            key={status.id}
            href={`/leads?status=${status.id}`}
            className="block rounded-md px-1 py-1 hover:bg-muted/60"
          >
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{status.label}</span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
