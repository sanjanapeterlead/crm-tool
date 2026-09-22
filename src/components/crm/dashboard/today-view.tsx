import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarClock, Clock, ExternalLink, Inbox, PartyPopper, Phone, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowupRow } from "@/components/crm/followups/followup-row";
import { AddLeadDialog } from "@/components/crm/leads/add-lead-dialog";
import type { TodayQueue } from "@/lib/services/dashboard";
import type { NextLeadReason } from "@/lib/domain/today";
import type { Followup, Profile } from "@/lib/types/domain";

const NEXT_REASON: Record<NextLeadReason, string> = {
  new_lead: "A new lead is waiting for its first contact",
  overdue_followup: "A follow-up has slipped past its time",
  followup_today: "Your next follow-up today",
};

function timeInZone(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
}

/**
 * The salesperson's home: work to do, not charts. Order is deliberate —
 * brand-new leads first (speed matters most), then broken promises, then the
 * rest of today.
 */
export function TodayView({
  queue,
  members,
  heading = "Today",
  canAssign = false,
}: {
  queue: TodayQueue;
  members: Profile[];
  heading?: string;
  /** Managers/admins may assign a new lead to anyone; salespeople only to themselves. */
  canAssign?: boolean;
}) {
  const { needsFirstContact, needsFirstContactTotal, overdue, dueToday, meetingsToday, unassignedCount, next, timezone } = queue;
  const nothingToDo =
    needsFirstContact.length === 0 && overdue.length === 0 && dueToday.length === 0 && meetingsToday.length === 0;

  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(new Date());

  return (
    <div className="space-y-6">
      <div className="bg-brand-wash flex flex-wrap items-end justify-between gap-3 rounded-2xl border bg-card px-5 py-6 md:px-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-primary uppercase">{todayLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{heading}</h1>
        </div>
        {next && (
          <Link
            href={`/leads/${next.leadId}`}
            className={buttonVariants({ size: "lg" })}
            aria-describedby="next-lead-reason"
          >
            Start next lead
          </Link>
        )}
      </div>
      {next && (
        <p id="next-lead-reason" className="-mt-4 text-sm text-muted-foreground">
          {NEXT_REASON[next.reason]}.
        </p>
      )}

      {nothingToDo && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PartyPopper className="size-8 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">You&apos;re all caught up</p>
              <p className="text-sm text-muted-foreground">
                No new leads to contact and nothing due today.
                {unassignedCount > 0
                  ? ` There ${unassignedCount === 1 ? "is 1 lead" : `are ${unassignedCount} leads`} in the unassigned pool you can claim.`
                  : " Add a lead, or check the pipeline for deals that have gone quiet."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {unassignedCount > 0 && (
                <Link href="/leads?assigned=unassigned" className={buttonVariants({ variant: "outline" })}>
                  <Inbox /> View unassigned leads
                </Link>
              )}
              <AddLeadDialog members={members} canAssign={canAssign} />
            </div>
          </CardContent>
        </Card>
      )}

      {needsFirstContact.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4" aria-hidden /> Contact these first
              <Badge variant="secondary">{needsFirstContactTotal}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsFirstContact.map((lead) => (
              <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.first_name} {lead.last_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {lead.source} · waiting {formatDistanceToNow(new Date(lead.created_at))}
                    {lead.priority === "high" ? " · high priority" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className={buttonVariants({ size: "sm" })}>
                      <Phone /> Call
                    </a>
                  )}
                  <Link href={`/leads/${lead.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <ExternalLink /> Open
                  </Link>
                </div>
              </div>
            ))}
            {needsFirstContactTotal > needsFirstContact.length && (
              <p className="pt-1 text-sm text-muted-foreground">
                Showing the {needsFirstContact.length} waiting longest.{" "}
                <Link href="/leads?uncontacted=1" className="font-medium text-primary hover:underline">
                  View all {needsFirstContactTotal}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {overdue.length > 0 && (
        <Card className="border-red-600/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
              <AlertTriangle className="size-4" aria-hidden /> Overdue
              <Badge variant="secondary">{overdue.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.map((f) => (
              <FollowupRow
                key={f.id}
                followup={f as unknown as Followup}
                timezone={timezone}
                showLead
                withCallLink
              />
            ))}
          </CardContent>
        </Card>
      )}

      {dueToday.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" aria-hidden /> Due later today
              <Badge variant="secondary">{dueToday.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dueToday.map((f) => (
              <FollowupRow
                key={f.id}
                followup={f as unknown as Followup}
                timezone={timezone}
                showLead
                withCallLink
              />
            ))}
          </CardContent>
        </Card>
      )}

      {meetingsToday.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" aria-hidden /> Meetings today
              <Badge variant="secondary">{meetingsToday.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {meetingsToday.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {timeInZone(m.scheduled_start, timezone)}
                    {m.scheduled_end ? ` – ${timeInZone(m.scheduled_end, timezone)}` : ""}
                  </p>
                  {m.lead && (
                    <Link href={`/leads/${m.lead.id}`} className="text-sm text-muted-foreground hover:underline">
                      {m.lead.first_name} {m.lead.last_name}
                    </Link>
                  )}
                </div>
                {m.meeting_url && (
                  <a
                    href={m.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    Join meeting
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!nothingToDo && unassignedCount > 0 && (
        <p className="text-sm text-muted-foreground">
          <Link href="/leads?assigned=unassigned" className="font-medium text-primary hover:underline">
            {unassignedCount} unassigned {unassignedCount === 1 ? "lead" : "leads"}
          </Link>{" "}
          can be claimed.
        </p>
      )}
    </div>
  );
}
