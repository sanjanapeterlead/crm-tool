"use client";

import { useState } from "react";
import { ChevronsLeftRight, Inbox, Trophy, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { stageHue, toneStyle } from "@/lib/ui/tones";
import { LeadCard, type PipelineLead } from "@/components/crm/pipeline/lead-card";
import type { LeadStatus } from "@/lib/types/domain";

/**
 * One stage of the board. Presentational: the board owns the lead list, the
 * optimistic move and the lost-reason prompt; this only reports drops.
 * Closed stages (won/lost) can render collapsed — a slim drop target — since
 * they grow forever and are rarely worked from the board.
 */
export function PipelineColumn({
  status,
  statuses,
  leads,
  collapsed,
  onToggleCollapsed,
  draggingId,
  onDragStart,
  onDragEnd,
  onMove,
  formatMoney,
  formatCompact,
}: {
  status: LeadStatus;
  statuses: LeadStatus[];
  leads: PipelineLead[];
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  draggingId: string | null;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
  onMove: (leadId: string, statusId: string) => void;
  formatMoney: (value: number) => string;
  formatCompact: (value: number) => string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const total = leads.reduce((sum, l) => sum + (l.value ? Number(l.value) : 0), 0);
  const draggingHere = draggingId !== null && leads.some((l) => l.id === draggingId);
  const isDropTarget = dragOver && !draggingHere;
  const ClosedIcon = status.is_won ? Trophy : XCircle;

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (draggingId === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      // Ignore leave events fired when moving between the column's own children.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const leadId = e.dataTransfer.getData("text/lead-id");
      if (leadId && !draggingHere) onMove(leadId, status.id);
    },
  };

  if (collapsed) {
    return (
      <section
        {...dropHandlers}
        data-stage-id={status.id}
        aria-label={`${status.label}, ${leads.length} leads`}
        style={toneStyle(stageHue(status))}
        className={cn(
          "flex w-14 shrink-0 snap-start flex-col items-center gap-3 rounded-xl border border-transparent bg-muted/60 py-3 transition-colors",
          isDropTarget && "tone-soft border-dashed"
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={`Show ${status.label}`}
          aria-label={`Show ${status.label} column`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <ChevronsLeftRight className="size-4" />
        </button>
        <span className="tone-soft rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">{leads.length}</span>
        <ClosedIcon aria-hidden className="tone-fg size-4" />
        <span className="text-sm font-medium [writing-mode:vertical-rl]">{status.label}</span>
      </section>
    );
  }

  return (
    <section
      {...dropHandlers}
      data-stage-id={status.id}
      aria-label={`${status.label}, ${leads.length} leads`}
      style={toneStyle(stageHue(status))}
      className={cn(
        "flex w-[min(18rem,82vw)] shrink-0 snap-start flex-col rounded-xl border border-transparent bg-muted/60 transition-colors",
        isDropTarget && "border-primary/40 bg-primary/5"
      )}
    >
      <header className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className="tone-bg size-2.5 shrink-0 rounded-full" />
            <span className="truncate">{status.label}</span>
            <span className="rounded-full bg-background px-1.5 py-px text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-border">
              {leads.length}
            </span>
          </h2>
          <p className="mt-0.5 pl-4.5 text-xs tabular-nums text-muted-foreground">
            {total > 0 ? formatCompact(total) : "—"}
          </p>
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={`Collapse ${status.label}`}
            aria-label={`Collapse ${status.label} column`}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ChevronsLeftRight className="size-4" />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            status={status}
            statuses={statuses}
            formatMoney={formatMoney}
            dragging={draggingId === lead.id}
            onDragStart={() => onDragStart(lead.id)}
            onDragEnd={onDragEnd}
            onMove={(statusId) => onMove(lead.id, statusId)}
          />
        ))}
        {isDropTarget ? (
          <div className="flex h-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-primary/40 text-xs font-medium text-primary">
            Drop to move to {status.label}
          </div>
        ) : (
          leads.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              <Inbox className="size-4" aria-hidden />
              No leads in this stage
            </div>
          )
        )}
      </div>
    </section>
  );
}
