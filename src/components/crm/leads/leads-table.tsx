import Link from "next/link";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { formatDate } from "@/lib/format";
import { Mail, Phone } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/crm/leads/status-badge";
import type { Lead, LeadStatus, Profile, Followup, Activity } from "@/lib/types/domain";

export interface LeadRow extends Lead {
  status: LeadStatus;
  assignee: Profile | null;
  followups: Pick<Followup, "id" | "due_date" | "due_time" | "status">[];
  activities: Pick<Activity, "id" | "created_at">[];
}

function nextFollowup(followups: LeadRow["followups"]) {
  const pending = followups.filter((f) => f.status === "pending").sort((a, b) => a.due_date.localeCompare(b.due_date));
  return pending[0] ?? null;
}

function lastActivity(activities: LeadRow["activities"]) {
  if (activities.length === 0) return null;
  return activities.reduce((latest, a) => (a.created_at > latest.created_at ? a : latest));
}

export function LeadsTable({ leads, timezone }: { leads: LeadRow[]; timezone: string }) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium">No leads found</p>
        <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters, or add a new lead.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned to</TableHead>
            <TableHead>Next follow-up</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const followup = nextFollowup(lead.followups);
            const activity = lastActivity(lead.activities);
            return (
              <TableRow key={lead.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/leads/${lead.id}`} className="hover:underline">
                    {lead.first_name} {lead.last_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{lead.source}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="size-3.5" /> {lead.email}
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="size-3.5" /> {lead.phone}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="text-sm">{lead.assignee?.full_name || lead.assignee?.email || "Unassigned"}</TableCell>
                <TableCell className="text-sm">
                  {followup ? format(parseISO(followup.due_date), "MMM d") : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {activity ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(lead.created_at, timezone)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
