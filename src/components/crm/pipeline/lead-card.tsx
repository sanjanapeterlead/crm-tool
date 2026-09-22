"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowRight, ExternalLink, Flame, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { stageHue, toneStyle } from "@/lib/ui/tones";
import { PersonAvatar } from "@/components/crm/layout/person-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LeadStatus, Profile } from "@/lib/types/domain";

export interface PipelineLead {
  id: string;
  first_name: string;
  last_name: string | null;
  status_id: string;
  source: string;
  value: number | null;
  priority: "low" | "medium" | "high";
  first_contacted_at: string | null;
  updated_at: string;
  assignee: Profile | null;
}

export function leadName(lead: Pick<PipelineLead, "first_name" | "last_name">) {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ");
}

export function LeadCard({
  lead,
  status,
  statuses,
  formatMoney,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  lead: PipelineLead;
  status: LeadStatus;
  statuses: LeadStatus[];
  formatMoney: (value: number) => string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (statusId: string) => void;
}) {
  const name = leadName(lead);
  const assigneeName = lead.assignee?.full_name || lead.assignee?.email;
  const closed = status.is_won || status.is_lost;
  const uncontacted = !closed && !lead.first_contacted_at;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead-id", lead.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group/card relative cursor-grab rounded-lg border bg-card p-3 shadow-xs transition-[box-shadow,border-color,opacity] hover:border-primary/30 hover:shadow-md active:cursor-grabbing",
        dragging && "opacity-40 ring-2 ring-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          draggable={false}
          className="min-w-0 truncate text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-lg hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {name}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${name}`}
            className="relative z-10 -mt-1 -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100 data-[popup-open]:bg-muted data-[popup-open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem render={<Link href={`/leads/${lead.id}`} />}>
              <ExternalLink />
              Open lead
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
              {statuses
                .filter((s) => s.id !== status.id)
                .map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => onMove(s.id)}>
                    <span aria-hidden style={toneStyle(stageHue(s))} className="tone-bg size-2 rounded-full" />
                    {s.label}
                    <ArrowRight className="ml-auto opacity-0 group-data-highlighted/dropdown-menu-item:opacity-60" />
                  </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs">
        {lead.value !== null ? (
          <span className="font-semibold tabular-nums text-foreground">{formatMoney(Number(lead.value))}</span>
        ) : (
          <span className="text-muted-foreground">No value</span>
        )}
        {lead.priority === "high" && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-px text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
            <Flame className="size-3" aria-hidden />
            High
          </span>
        )}
        {uncontacted && (
          <span className="rounded-full bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
            Not contacted
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          {assigneeName ? (
            <PersonAvatar name={assigneeName} size="sm" className="size-5" />
          ) : (
            <span aria-hidden className="size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/50" />
          )}
          <span className="truncate">{assigneeName ?? "Unassigned"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-24 truncate">{lead.source}</span>
          <span aria-hidden>·</span>
          <time dateTime={lead.updated_at} title="Time since last update">
            {formatDistanceToNowStrict(new Date(lead.updated_at), { roundingMethod: "floor" })
              .replace(/ seconds?/, "s")
              .replace(/ minutes?/, "m")
              .replace(/ hours?/, "h")
              .replace(/ days?/, "d")
              .replace(/ months?/, "mo")
              .replace(/ years?/, "y")}
          </time>
        </span>
      </div>
    </div>
  );
}
