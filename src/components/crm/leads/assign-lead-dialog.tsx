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
import { assignLeadAction } from "@/app/(app)/actions";
import type { Profile } from "@/lib/types/domain";

export function AssignLeadDialog({
  leadId,
  members,
  currentAssignee,
  trigger,
}: {
  leadId: string;
  members: Profile[];
  currentAssignee: string | null;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentAssignee ?? "");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleAssign() {
    if (!value) return;
    setPending(true);
    const result = await assignLeadAction(leadId, value);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Lead assigned");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign lead</DialogTitle>
        </DialogHeader>
        <Select value={value} onValueChange={(v) => setValue(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a salesperson">
              {(v: string) => {
                const m = members.find((m) => m.id === v);
                return m?.full_name || m?.email || "Choose a salesperson";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name || m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={handleAssign} disabled={!value || pending}>
            {pending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
