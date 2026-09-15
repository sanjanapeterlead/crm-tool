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
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleChange() {
    setPending(true);
    const result = await changeLeadStatusAction(leadId, value);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Status updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change status</DialogTitle>
        </DialogHeader>
        <Select value={value} onValueChange={(v) => v && setValue(v)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: string) => statuses.find((s) => s.id === v)?.label ?? "Select status"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={handleChange} disabled={pending || value === currentStatusId}>
            {pending ? "Updating…" : "Update status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
