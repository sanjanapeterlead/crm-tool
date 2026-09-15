"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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

export function LeadFilters({
  statuses,
  members,
  sources,
}: {
  statuses: LeadStatus[];
  members: Profile[];
  sources: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [, startTransition] = useTransition();

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

  const statusLabel = (v: string) => (v === ALL ? "All statuses" : statuses.find((s) => s.id === v)?.label ?? "Status");
  const memberLabel = (v: string) => {
    if (v === ALL) return "Everyone";
    const m = members.find((m) => m.id === v);
    return m?.full_name || m?.email || "Assigned to";
  };
  const sourceLabel = (v: string) => (v === ALL ? "All sources" : v);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search leads…"
          className="pl-8"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setParam("search", e.target.value);
          }}
        />
      </div>
      <Select defaultValue={searchParams.get("status") ?? ALL} onValueChange={(v) => setParam("status", v ?? "")}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Status">{statusLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select defaultValue={searchParams.get("assigned") ?? ALL} onValueChange={(v) => setParam("assigned", v ?? "")}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Assigned to">{memberLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.full_name || m.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select defaultValue={searchParams.get("source") ?? ALL} onValueChange={(v) => setParam("source", v ?? "")}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Source">{sourceLabel}</SelectValue>
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
    </div>
  );
}
