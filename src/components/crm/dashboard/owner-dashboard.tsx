import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarCheck, CalendarClock, Trophy, UserX, Users, XCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "@/components/crm/dashboard/metric-card";
import { PipelineOverview } from "@/components/crm/dashboard/pipeline-overview";
import { RecentActivity } from "@/components/crm/dashboard/recent-activity";
import type { OwnerDashboard } from "@/lib/services/dashboard";
import type { Activity, Lead, LeadStatus, Profile } from "@/lib/types/domain";

type ActivityRow = Activity & { lead: Pick<Lead, "id" | "first_name" | "last_name">; actor: Profile | null };

function repName(rep: { full_name: string | null; email: string }) {
  return rep.full_name || rep.email;
}

/**
 * The owner's one screen. It leads with what's being neglected (uncontacted
 * leads, overdue follow-ups) rather than totals, because the question this
 * answers is "where do I need to step in today?".
 */
export function OwnerDashboardView({
  data,
  activity,
  orgName,
}: {
  data: OwnerDashboard;
  activity: ActivityRow[];
  orgName: string;
}) {
  const needsAttention = data.uncontacted > 0 || data.overdueFollowups > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{orgName}</h1>
        <p className="text-sm text-muted-foreground">
          {needsAttention ? "Here's what needs your attention." : "Nothing is being neglected right now."}
        </p>
      </div>

      <section aria-labelledby="attention-heading" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <h2 id="attention-heading" className="sr-only">
          Needs attention
        </h2>
        <Link href="/leads?uncontacted=1" className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
          <MetricCard label="Leads nobody has contacted" value={data.uncontacted} icon={UserX} tone={data.uncontacted > 0 ? "warning" : "default"} />
        </Link>
        <Link href="/followups?view=overdue" className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
          <MetricCard label="Overdue follow-ups" value={data.overdueFollowups} icon={AlertTriangle} tone={data.overdueFollowups > 0 ? "warning" : "default"} />
        </Link>
      </section>

      {data.longestWaiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4" aria-hidden /> Waiting the longest for a first contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.longestWaiting.map((lead) => (
              <div key={lead.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.first_name} {lead.last_name}
                  </Link>
                  <span className="text-muted-foreground"> · {lead.source}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>waiting {formatDistanceToNow(new Date(lead.created_at))}</span>
                  {lead.assignee ? (
                    <span>{repName(lead.assignee)}</span>
                  ) : (
                    <Badge variant="outline" className="border-amber-600/30 text-amber-700 dark:text-amber-400">
                      Unassigned
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="numbers-heading" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <h2 id="numbers-heading" className="sr-only">
          This week
        </h2>
        <MetricCard label="New leads today" value={data.newLeadsToday} icon={Users} />
        <MetricCard label="New leads this week" value={data.newLeadsThisWeek} icon={Users} />
        <MetricCard label="Meetings scheduled" value={data.meetingsUpcoming} icon={CalendarClock} />
        <MetricCard label="Meetings completed (week)" value={data.meetingsCompletedThisWeek} icon={CalendarCheck} />
        <MetricCard label="Won this week" value={data.wonThisWeek} icon={Trophy} tone="success" />
        <MetricCard label="Lost this week" value={data.lostThisWeek} icon={XCircle} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PipelineOverview
          pipeline={data.pipeline.map((p) => ({ status: p.stage as unknown as LeadStatus, count: p.count }))}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead sources · last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {data.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leads in the last 30 days. Connect Meta Ads in Settings, or add a lead manually.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Won</TableHead>
                    <TableHead className="text-right">Conversion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sources.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell>{s.source}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.lead_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.won_count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.lead_count > 0 ? `${Math.round((s.won_count / s.lead_count) * 100)}%` : "–"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team activity · this week</CardTitle>
        </CardHeader>
        <CardContent>
          {data.reps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Invite your team from the Team page to see their activity here.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team member</TableHead>
                    <TableHead className="text-right">Open leads</TableHead>
                    <TableHead className="text-right">Uncontacted</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Follow-ups done</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Meetings held</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reps.map((rep) => (
                    <TableRow key={rep.user_id}>
                      <TableCell className="font-medium">{repName(rep)}</TableCell>
                      <TableCell className="text-right tabular-nums">{rep.open_leads}</TableCell>
                      <TableCell className="text-right tabular-nums">{rep.uncontacted}</TableCell>
                      <TableCell className="text-right tabular-nums">{rep.calls}</TableCell>
                      <TableCell className="text-right tabular-nums">{rep.followups_completed}</TableCell>
                      <TableCell className={`text-right tabular-nums ${rep.overdue_followups > 0 ? "font-medium text-red-700 dark:text-red-400" : ""}`}>
                        {rep.overdue_followups}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{rep.meetings_completed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecentActivity activities={activity} />
    </div>
  );
}
