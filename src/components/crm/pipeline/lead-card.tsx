"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Profile } from "@/lib/types/domain";

export interface PipelineLead {
  id: string;
  first_name: string;
  last_name: string | null;
  status_id: string;
  assignee: Profile | null;
}

export function LeadCard({ lead }: { lead: PipelineLead }) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/lead-id", lead.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <Card draggable onDragStart={handleDragStart} className="cursor-grab gap-2 p-3 active:cursor-grabbing">
      <Link href={`/leads/${lead.id}`} className="text-sm font-medium hover:underline">
        {lead.first_name} {lead.last_name}
      </Link>
      <p className="text-xs text-muted-foreground">
        {lead.assignee?.full_name || lead.assignee?.email || "Unassigned"}
      </p>
    </Card>
  );
}
