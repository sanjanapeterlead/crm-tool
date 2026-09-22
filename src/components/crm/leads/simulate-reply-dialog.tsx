"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { simulateWhatsAppReplyAction } from "@/app/(app)/actions";

/** Demo mode only: fakes a customer reply through the real inbound pipeline. */
export function SimulateReplyDialog({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("Hi, I saw your ad — can you share the fees?");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await simulateWhatsAppReplyAction(leadId, text);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Simulated reply received");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Simulate customer reply</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simulate a reply from {leadName}</DialogTitle>
          <DialogDescription>
            Demo mode only. This goes through the same inbound path a real WhatsApp webhook uses, so the timeline, the
            24-hour reply window and opt-out handling all behave as they would live. Try replying &ldquo;STOP&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sim-reply">Their message</Label>
            <Textarea id="sim-reply" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || text.trim() === ""}>
              {pending ? "Sending…" : "Deliver reply"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
