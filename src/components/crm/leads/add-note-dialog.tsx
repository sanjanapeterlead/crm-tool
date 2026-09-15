"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createNoteAction } from "@/app/(app)/actions";

export function AddNoteDialog({ leadId, trigger }: { leadId: string; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (!content.trim()) return;
    setPending(true);
    const result = await createNoteAction({ lead_id: leadId, content });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Note added");
    setContent("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a note</DialogTitle>
        </DialogHeader>
        <Textarea
          rows={4}
          placeholder="What happened? What's next?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          autoFocus
        />
        <Button onClick={handleSubmit} disabled={pending || !content.trim()} className="w-full">
          {pending ? "Saving…" : "Add note"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
