import Link from "next/link";
import { ListChecks, PartyPopper } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listFollowups, type FollowupView } from "@/lib/services/followups";
import { FollowupRow } from "@/components/crm/followups/followup-row";
import { PageHeader } from "@/components/crm/layout/page-header";
import { EmptyState } from "@/components/crm/layout/empty-state";
import { cn } from "@/lib/utils";
import type { Followup } from "@/lib/types/domain";

const EMPTY_COPY: Record<FollowupView, { title: string; description: string }> = {
  today: { title: "Nothing due today", description: "Today's queue is clear. Check Upcoming for what's next." },
  upcoming: { title: "Nothing on the horizon", description: "No follow-ups scheduled ahead of today yet." },
  overdue: { title: "Nothing overdue", description: "Every follow-up is on schedule — good place to be." },
  completed: { title: "Nothing completed yet", description: "Follow-ups you finish will show up here." },
};

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
      <PageHeader icon={ListChecks} title="Follow-ups" description="What needs to happen next, and when." />

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
          <EmptyState
            icon={activeView === "overdue" || activeView === "today" ? PartyPopper : ListChecks}
            tone={activeView === "overdue" || activeView === "today" ? "brand" : "muted"}
            title={EMPTY_COPY[activeView].title}
            description={EMPTY_COPY[activeView].description}
          />
        ) : (
          followups.map((f) => <FollowupRow key={f.id} followup={f} showLead showAssignee />)
        )}
      </div>
    </div>
  );
}
