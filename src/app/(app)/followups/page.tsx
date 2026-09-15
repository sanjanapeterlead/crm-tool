import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listFollowups, type FollowupView } from "@/lib/services/followups";
import { FollowupRow } from "@/components/crm/followups/followup-row";
import { cn } from "@/lib/utils";
import type { Followup } from "@/lib/types/domain";

const VIEWS: { value: FollowupView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

export default async function FollowupsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const activeView = (VIEWS.some((v) => v.value === view) ? view : "today") as FollowupView;

  const results = await Promise.all(VIEWS.map((v) => listFollowups(supabase, session, v.value)));
  const counts = Object.fromEntries(VIEWS.map((v, i) => [v.value, results[i].length]));
  const followups = results[VIEWS.findIndex((v) => v.value === activeView)] as unknown as Followup[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">What needs to happen next, and when.</p>
      </div>

      <div className="inline-flex w-fit gap-1 rounded-lg bg-muted p-[3px]">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={`/followups?view=${v.value}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
              activeView === v.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v.label}
            <span className="text-xs text-muted-foreground">{counts[v.value]}</span>
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {followups.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            Nothing here.
          </div>
        ) : (
          followups.map((f) => <FollowupRow key={f.id} followup={f} showLead showAssignee />)
        )}
      </div>
    </div>
  );
}
