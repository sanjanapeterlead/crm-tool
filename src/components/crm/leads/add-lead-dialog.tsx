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

export function AddLeadDialog({ members, canAssign = true }: { members: Profile[]; canAssign?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(input: LeadFormInput) {
    const result = await createLeadAction(input);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // The action already revalidates every affected page, so navigating is enough
    // (calling refresh() as well raced the navigation and made the dialog flaky).
    toast.success(
      result.data?.outcome === "merged"
        ? "Already in the CRM — opened the existing lead"
        : "Lead created"
    );
    setOpen(false);
    if (result.data) router.push(`/leads/${result.data.id}`);
    else router.refresh();
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
        <LeadForm members={members} onSubmit={handleSubmit} submitLabel="Create Lead" showAssignment={canAssign} />
      </DialogContent>
    </Dialog>
  );
}
