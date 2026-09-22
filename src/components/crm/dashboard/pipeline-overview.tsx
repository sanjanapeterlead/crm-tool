import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stageHue, toneStyle } from "@/lib/ui/tones";
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
            style={toneStyle(stageHue(status))}
            className="block rounded-md px-1 py-1 hover:bg-muted/60"
          >
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span aria-hidden className="tone-bg size-2 rounded-full" />
                {status.label}
              </span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="tone-bg h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
