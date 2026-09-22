"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LeadCard, type PipelineLead } from "@/components/crm/pipeline/lead-card";
import { LostReasonField } from "@/components/crm/leads/lost-reason-field";
import { changeLeadStatusAction } from "@/app/(app)/actions";
import type { LeadStatus } from "@/lib/types/domain";

export function PipelineColumn({ status, leads }: { status: LeadStatus; leads: PipelineLead[] }) {
  const [dragOver, setDragOver] = useState(false);
  // A lead dropped on a lost stage waits here until the person says why.
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function move(leadId: string, reason?: string) {
    const result = await changeLeadStatusAction(leadId, status.id, reason);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const leadId = e.dataTransfer.getData("text/lead-id");
    if (!leadId) return;

    if (status.is_lost) {
      setLostReason("");
      setPendingLeadId(leadId);
      return;
    }
    await move(leadId);
  }

  async function confirmLost() {
    if (!pendingLeadId) return;
    setSaving(true);
    const ok = await move(pendingLeadId, lostReason.trim());
    setSaving(false);
    if (ok) setPendingLeadId(null);
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/20 transition-colors",
          dragOver && "border-primary bg-primary/5"
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-medium">{status.label}</span>
          <span className="text-xs text-muted-foreground">{leads.length}</span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2">
          {leads.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No leads</p>
          ) : (
            leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
          )}
        </div>
      </div>

      <Dialog open={pendingLeadId !== null} onOpenChange={(open) => !open && setPendingLeadId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this lead as lost</DialogTitle>
          </DialogHeader>
          <LostReasonField value={lostReason} onChange={setLostReason} />
          <DialogFooter>
            <Button onClick={confirmLost} disabled={saving || lostReason.trim() === ""}>
              {saving ? "Saving…" : "Mark as lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
