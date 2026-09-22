"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeadStatus, Profile } from "@/lib/types/domain";

const ALL = "__all__";
const UNASSIGNED = "unassigned";
const SEARCH_DEBOUNCE_MS = 300;

const STATE_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];
const DUE_OPTIONS = [
  { value: "overdue", label: "Overdue follow-up" },
  { value: "today", label: "Due today" },
];
const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];
const FILTER_KEYS = [
  "search", "status", "assigned", "source", "campaign", "priority", "state", "due", "uncontacted", "from", "to",
];

export function LeadFilters({
  statuses,
  members,
  sources,
  campaigns = [],
}: {
  statuses: LeadStatus[];
  members: Profile[];
  sources: string[];
  campaigns?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams]
  );

  // One request per pause in typing, not one per keystroke.
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    []
  );

  const active = FILTER_KEYS.some((key) => searchParams.get(key));
  const labelOf = (options: Array<{ value: string; label: string }>, fallback: string) => (v: string) =>
    v === ALL ? fallback : (options.find((o) => o.value === v)?.label ?? fallback);

  const memberLabel = (v: string) => {
    if (v === ALL) return "Everyone";
    if (v === UNASSIGNED) return "Unassigned";
    const m = members.find((m) => m.id === v);
    return m?.full_name || m?.email || "Assigned to";
  };

  const selectClass = "w-full sm:w-44";

  return (
    <div className="space-y-2" role="search" aria-label="Filter leads">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search leads by name, phone or email"
            placeholder="Name, phone or email…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              if (debounce.current) clearTimeout(debounce.current);
              debounce.current = setTimeout(() => setParam("search", value.trim()), SEARCH_DEBOUNCE_MS);
            }}
          />
        </div>

        <Select defaultValue={searchParams.get("status") ?? ALL} onValueChange={(v) => setParam("status", v ?? "")}>
          <SelectTrigger className={selectClass} aria-label="Stage">
            <SelectValue placeholder="Stage">
              {(v: string) => (v === ALL ? "All stages" : (statuses.find((s) => s.id === v)?.label ?? "Stage"))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stages</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select defaultValue={searchParams.get("assigned") ?? ALL} onValueChange={(v) => setParam("assigned", v ?? "")}>
          <SelectTrigger className={selectClass} aria-label="Assigned to">
            <SelectValue placeholder="Assigned to">{memberLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name || m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select defaultValue={searchParams.get("state") ?? ALL} onValueChange={(v) => setParam("state", v ?? "")}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Status">
            <SelectValue placeholder="Status">{labelOf(STATE_OPTIONS, "Any status")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {STATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select defaultValue={searchParams.get("due") ?? ALL} onValueChange={(v) => setParam("due", v ?? "")}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Follow-up due">
            <SelectValue placeholder="Follow-up">{labelOf(DUE_OPTIONS, "Any follow-up")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any follow-up</SelectItem>
            {DUE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select defaultValue={searchParams.get("source") ?? ALL} onValueChange={(v) => setParam("source", v ?? "")}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Source">
            <SelectValue placeholder="Source">{(v: string) => (v === ALL ? "All sources" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {campaigns.length > 0 && (
          <Select defaultValue={searchParams.get("campaign") ?? ALL} onValueChange={(v) => setParam("campaign", v ?? "")}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Campaign">
              <SelectValue placeholder="Campaign">
                {(v: string) => (v === ALL ? "All campaigns" : (campaigns.find((c) => c.id === v)?.name ?? "Campaign"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select defaultValue={searchParams.get("priority") ?? ALL} onValueChange={(v) => setParam("priority", v ?? "")}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Priority">
            <SelectValue placeholder="Priority">{labelOf(PRIORITY_OPTIONS, "Any priority")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any priority</SelectItem>
            {PRIORITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Created
          <Input
            type="date"
            aria-label="Created from"
            className="w-36"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(e) => setParam("from", e.target.value)}
          />
          –
          <Input
            type="date"
            aria-label="Created to"
            className="w-36"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(e) => setParam("to", e.target.value)}
          />
        </label>

        <Button
          type="button"
          variant={searchParams.get("uncontacted") ? "default" : "outline"}
          size="sm"
          aria-pressed={Boolean(searchParams.get("uncontacted"))}
          onClick={() => setParam("uncontacted", searchParams.get("uncontacted") ? "" : "1")}
        >
          Not yet contacted
        </Button>

        {active && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              startTransition(() => router.push(pathname));
            }}
          >
            <X /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
