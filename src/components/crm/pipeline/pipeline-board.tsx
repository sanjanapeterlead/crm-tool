"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { moneyFormatters } from "@/lib/ui/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PipelineColumn } from "@/components/crm/pipeline/pipeline-column";
import { leadName, type PipelineLead } from "@/components/crm/pipeline/lead-card";
import { LostReasonField } from "@/components/crm/leads/lost-reason-field";
import { changeLeadStatusAction } from "@/app/(app)/actions";
import type { LeadStatus } from "@/lib/types/domain";

type OwnerFilter = "all" | "mine" | "unassigned";

const OWNER_FILTERS: { id: OwnerFilter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "mine", label: "Mine" },
  { id: "unassigned", label: "Unassigned" },
];

/**
 * The kanban board. Owns the lead list so a move shows instantly
 * (useOptimistic) and reconciles with the server on refresh; a failed move
 * snaps back on its own when the transition ends.
 */
export function PipelineBoard({
  statuses,
  leads,
  currency,
  currentUserId,
  showOwnerFilter,
}: {
  statuses: LeadStatus[];
  leads: PipelineLead[];
  currency: string;
  currentUserId: string;
  showOwnerFilter: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticLeads, moveOptimistic] = useOptimistic(
    leads,
    (state, move: { leadId: string; statusId: string }) =>
      state.map((l) => (l.id === move.leadId ? { ...l, status_id: move.statusId } : l))
  );

  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Closed stages start collapsed; expanding one is a per-visit choice.
  const [expandedClosed, setExpandedClosed] = useState<Set<string>>(new Set());
  const [pendingLost, setPendingLost] = useState<{ leadId: string; statusId: string } | null>(null);
  const [lostReason, setLostReason] = useState("");

  const money = useMemo(() => moneyFormatters(currency), [currency]);

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return optimisticLeads.filter((l) => {
      if (owner === "mine" && l.assignee?.id !== currentUserId) return false;
      if (owner === "unassigned" && l.assignee) return false;
      if (!q) return true;
      return [leadName(l), l.source, l.assignee?.full_name, l.assignee?.email]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [optimisticLeads, search, owner, currentUserId]);

  const stats = useMemo(() => {
    const byId = new Map(statuses.map((s) => [s.id, s]));
    let open = 0;
    let openValue = 0;
    let won = 0;
    let wonValue = 0;
    let lost = 0;
    for (const l of visibleLeads) {
      const s = byId.get(l.status_id);
      const v = l.value ? Number(l.value) : 0;
      if (s?.is_won) {
        won++;
        wonValue += v;
      } else if (s?.is_lost) lost++;
      else {
        open++;
        openValue += v;
      }
    }
    const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
    return { open, openValue, won, wonValue, winRate };
  }, [visibleLeads, statuses]);

  function move(leadId: string, statusId: string, reason?: string, successMessage?: string) {
    startTransition(async () => {
      moveOptimistic({ leadId, statusId });
      const result = await changeLeadStatusAction(leadId, statusId, reason);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (successMessage) toast.success(successMessage);
      router.refresh();
    });
  }

  function requestMove(leadId: string, statusId: string) {
    const lead = optimisticLeads.find((l) => l.id === leadId);
    if (!lead || lead.status_id === statusId) return;
    const target = statuses.find((s) => s.id === statusId);
    if (target?.is_lost) {
      setLostReason("");
      setPendingLost({ leadId, statusId });
      return;
    }
    move(leadId, statusId, undefined, target?.is_won ? `${leadName(lead)} marked as won` : undefined);
  }

  function confirmLost() {
    if (!pendingLost) return;
    move(pendingLost.leadId, pendingLost.statusId, lostReason.trim());
    setPendingLost(null);
  }

  // Horizontal scroll affordance: arrows enable only when there's more to see.
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () =>
      setEdges({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Watch the columns too: expanding a closed stage widens the content
    // without resizing the scroller itself.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [statuses]);
  const scrollBy = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  const pendingLead = pendingLost ? optimisticLeads.find((l) => l.id === pendingLost.leadId) : null;
  const filtering = search.trim() !== "" || owner !== "all";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-4 sm:divide-x">
        <Stat label="Open deals" value={String(stats.open)} />
        <Stat label="Open pipeline value" value={money.compact(stats.openValue)} />
        <Stat label="Closed-won value" value={money.compact(stats.wonValue)} hint={`${stats.won} deals`} />
        <Stat label="Win rate" value={stats.winRate === null ? "—" : `${stats.winRate}%`} hint="won ÷ closed" />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, source or owner"
            aria-label="Filter leads"
            className="h-9 bg-card pr-8 pl-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear filter"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {showOwnerFilter && (
          <div role="radiogroup" aria-label="Owner" className="flex rounded-lg border bg-card p-0.5">
            {OWNER_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={owner === f.id}
                onClick={() => setOwner(f.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  owner === f.id ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {filtering && (
          <span className="text-sm text-muted-foreground">
            Showing {visibleLeads.length} of {optimisticLeads.length}
          </span>
        )}

        <div className="ml-auto hidden items-center gap-1 sm:flex">
          <Button variant="outline" size="icon" onClick={() => scrollBy(-1)} disabled={!edges.left} aria-label="Scroll board left">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" onClick={() => scrollBy(1)} disabled={!edges.right} aria-label="Scroll board right">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:thin] sm:snap-none"
        >
          {statuses.map((status) => {
            const closed = status.is_won || status.is_lost;
            return (
              <PipelineColumn
                key={status.id}
                status={status}
                statuses={statuses}
                leads={visibleLeads.filter((l) => l.status_id === status.id)}
                collapsed={closed && !expandedClosed.has(status.id)}
                onToggleCollapsed={
                  closed
                    ? () => {
                        const expanding = !expandedClosed.has(status.id);
                        setExpandedClosed((prev) => {
                          const next = new Set(prev);
                          if (expanding) next.add(status.id);
                          else next.delete(status.id);
                          return next;
                        });
                        // Bring a just-expanded column fully into view.
                        if (expanding)
                          requestAnimationFrame(() =>
                            scroller.current
                              ?.querySelector(`[data-stage-id="${status.id}"]`)
                              ?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })
                          );
                      }
                    : undefined
                }
                draggingId={draggingId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onMove={requestMove}
                formatMoney={money.full}
                formatCompact={money.compact}
              />
            );
          })}
        </div>
        {/* Edge fades hint that the board continues off-screen. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-background to-transparent transition-opacity",
            edges.left ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-background to-transparent transition-opacity",
            edges.right ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      <Dialog open={pendingLost !== null} onOpenChange={(open) => !open && setPendingLost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this lead as lost</DialogTitle>
            {pendingLead && (
              <DialogDescription>
                Recording why {leadName(pendingLead)} didn&apos;t convert keeps your loss reasons reportable.
              </DialogDescription>
            )}
          </DialogHeader>
          <LostReasonField value={lostReason} onChange={setLostReason} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingLost(null)}>
              Cancel
            </Button>
            <Button onClick={confirmLost} disabled={lostReason.trim() === ""}>
              Mark as lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3 [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}
