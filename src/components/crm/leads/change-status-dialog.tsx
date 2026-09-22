"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LostReasonField } from "@/components/crm/leads/lost-reason-field";
import { changeLeadStatusAction } from "@/app/(app)/actions";
import type { LeadStatus } from "@/lib/types/domain";

export function ChangeStatusDialog({
  leadId,
  statuses,
  currentStatusId,
  trigger,
}: {
  leadId: string;
  statuses: LeadStatus[];
  currentStatusId: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentStatusId);
  const [lostReason, setLostReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const target = statuses.find((s) => s.id === value);
  const needsReason = Boolean(target?.is_lost) && value !== currentStatusId;

  async function handleChange() {
    setPending(true);
    const result = await changeLeadStatusAction(leadId, value, needsReason ? lostReason.trim() : undefined);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(target?.is_won ? "Marked as won" : "Stage updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change stage</DialogTitle>
        </DialogHeader>
        <Select value={value} onValueChange={(v) => v && setValue(v)}>
          <SelectTrigger className="w-full" aria-label="New stage">
            <SelectValue>{(v: string) => statuses.find((s) => s.id === v)?.label ?? "Select stage"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsReason && <LostReasonField value={lostReason} onChange={setLostReason} />}
        <DialogFooter>
          <Button
            onClick={handleChange}
            disabled={pending || value === currentStatusId || (needsReason && lostReason.trim() === "")}
          >
            {pending ? "Updating…" : "Update stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
