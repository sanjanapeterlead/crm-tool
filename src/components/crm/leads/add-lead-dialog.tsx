"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LeadForm } from "@/components/crm/leads/lead-form";
import { createLeadAction } from "@/app/(app)/actions";
import type { Profile } from "@/lib/types/domain";
import type { LeadFormInput } from "@/lib/validation/lead";

export function AddLeadDialog({ members }: { members: Profile[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(input: LeadFormInput) {
    const result = await createLeadAction(input);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Lead created");
    setOpen(false);
    router.refresh();
    if (result.data) router.push(`/leads/${result.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Add Lead
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new lead</DialogTitle>
        </DialogHeader>
        <LeadForm members={members} onSubmit={handleSubmit} submitLabel="Create Lead" />
      </DialogContent>
    </Dialog>
  );
}
