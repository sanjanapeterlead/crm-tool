"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { followupFormSchema, type FollowupFormInput } from "@/lib/validation/followup";
import { createFollowupAction } from "@/app/(app)/actions";
import type { Profile } from "@/lib/types/domain";

export function AddFollowupDialog({
  leadId,
  members,
  defaultAssignee,
  trigger,
}: {
  leadId: string;
  members: Profile[];
  defaultAssignee?: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const form = useForm<FollowupFormInput>({
    resolver: zodResolver(followupFormSchema),
    defaultValues: {
      lead_id: leadId,
      assigned_to: defaultAssignee ?? "",
      due_date: new Date().toISOString().slice(0, 10),
      due_time: "",
      description: "",
    },
  });

  async function handleSubmit(data: FollowupFormInput) {
    const result = await createFollowupAction(data);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Follow-up created");
    setOpen(false);
    form.reset();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a follow-up</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="due_date">Date</Label>
              <Input id="due_date" type="date" {...form.register("due_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_time">Time (optional)</Label>
              <Input id="due_time" type="time" {...form.register("due_time")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Select
              value={form.watch("assigned_to")}
              onValueChange={(v) => form.setValue("assigned_to", v ?? "")}
            >
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">What needs to happen?</Label>
            <Textarea id="description" rows={3} {...form.register("description")} />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Create follow-up"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
