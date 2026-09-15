import { Users, UserPlus, CalendarClock, CalendarCheck, Clock, AlertTriangle, Trophy, XCircle } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getDashboardMetrics, getRecentActivity } from "@/lib/services/dashboard";
import { MetricCard } from "@/components/crm/dashboard/metric-card";
import { PipelineOverview } from "@/components/crm/dashboard/pipeline-overview";
import { RecentActivity } from "@/components/crm/dashboard/recent-activity";
import type { Activity, Lead, Profile } from "@/lib/types/domain";

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [metrics, activity] = await Promise.all([
    getDashboardMetrics(supabase, session),
    getRecentActivity(supabase, session),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {session.role === "salesperson" ? "Your leads at a glance." : "Team performance at a glance."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Active leads" value={metrics.totalActiveLeads} icon={Users} />
        <MetricCard label="New leads" value={metrics.newLeads} icon={UserPlus} />
        <MetricCard label="Meetings scheduled" value={metrics.meetingsScheduled} icon={CalendarClock} />
        <MetricCard label="Meetings completed" value={metrics.meetingsCompleted} icon={CalendarCheck} />
        <MetricCard label="Follow-ups today" value={metrics.followupsToday} icon={Clock} tone="warning" />
        <MetricCard label="Overdue follow-ups" value={metrics.followupsOverdue} icon={AlertTriangle} tone="warning" />
        <MetricCard label="Converted" value={metrics.converted} icon={Trophy} tone="success" />
        <MetricCard label="Lost" value={metrics.lost} icon={XCircle} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PipelineOverview pipeline={metrics.pipeline} />
        <RecentActivity
          activities={
            activity as unknown as (Activity & {
              lead: Pick<Lead, "id" | "first_name" | "last_name">;
              actor: Profile | null;
            })[]
          }
        />
      </div>
    </div>
  );
}
