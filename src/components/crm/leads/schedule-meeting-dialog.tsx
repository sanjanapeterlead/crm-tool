"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { meetingFormSchema, type MeetingFormInput } from "@/lib/validation/meeting";
import { createMeetingAction } from "@/app/(app)/actions";

export function ScheduleMeetingDialog({
  leadId,
  calendlyBookingUrl,
  trigger,
}: {
  leadId: string;
  calendlyBookingUrl: string | null;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const form = useForm<MeetingFormInput>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      lead_id: leadId,
      scheduled_date: new Date().toISOString().slice(0, 10),
      scheduled_time: "15:00",
      duration_minutes: 30,
      meeting_url: "",
      external_booking_url: calendlyBookingUrl ?? "",
      notes: "",
    },
  });

  async function handleSubmit(data: MeetingFormInput) {
    const result = await createMeetingAction(data);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Meeting scheduled");
    setOpen(false);
    form.reset();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>
            Book the time slot in Calendly, then log the confirmed details here so the CRM
            timeline stays accurate.
          </DialogDescription>
        </DialogHeader>

        {calendlyBookingUrl ? (
          <a
            href={calendlyBookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            <ExternalLink />
            Open Calendly booking page
          </a>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No Calendly booking URL configured yet. Add one in Settings, or just log the meeting
            details below.
          </p>
        )}

        <Separator />

        <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_date">Date</Label>
              <Input id="scheduled_date" type="date" {...form.register("scheduled_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_time">Time</Label>
              <Input id="scheduled_time" type="time" {...form.register("scheduled_time")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duration_minutes">Duration (minutes)</Label>
            <Input id="duration_minutes" type="number" min={5} step={5} {...form.register("duration_minutes")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting_url">Google Meet / video link</Label>
            <Input id="meeting_url" placeholder="https://meet.google.com/…" {...form.register("meeting_url")} />
            {form.formState.errors.meeting_url && (
              <p className="text-xs text-destructive">{form.formState.errors.meeting_url.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...form.register("notes")} />
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Log meeting"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
