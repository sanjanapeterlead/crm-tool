"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { rescheduleMeetingAction, syncMeetingCalendarAction } from "@/app/(app)/actions";

/**
 * Says truthfully whether a meeting is on a calendar, and lets the salesperson
 * fix it if not. A failed sync is never hidden behind a friendly "scheduled".
 */
export function MeetingSyncStatus({
  meetingId,
  provider,
  syncError,
  status,
}: {
  meetingId: string;
  provider: string;
  syncError: string | null;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await syncMeetingCalendarAction(meetingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const sync = result.data?.calendar;
      if (sync?.status === "failed") toast.error(sync.error);
      else toast.success(sync?.status === "synced" && sync.demo ? "Recorded (demo mode)" : "Added to the calendar");
      router.refresh();
    });
  }

  if (provider === "google") return <Badge variant="outline">On Google Calendar</Badge>;
  if (provider === "mock") return <Badge variant="outline">Demo calendar</Badge>;

  if (syncError) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400" role="alert">
        <TriangleAlert className="size-3.5" aria-hidden />
        <span>Not on the calendar: {syncError}</span>
        {status === "scheduled" && (
          <Button size="sm" variant="outline" onClick={retry} disabled={pending}>
            <RefreshCw /> Retry
          </Button>
        )}
      </div>
    );
  }
  return null;
}

export function RescheduleMeetingDialog({
  meetingId,
  defaultDate,
  defaultTime,
  timezone,
}: {
  meetingId: string;
  /** The meeting's current date/time in the org's timezone. */
  defaultDate: string;
  defaultTime: string;
  timezone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [duration, setDuration] = useState("30");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await rescheduleMeetingAction(meetingId, {
      scheduled_date: date,
      scheduled_time: time,
      duration_minutes: Number(duration),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data?.calendar.status === "failed") {
      toast.warning(`Moved here, but the calendar wasn't updated: ${result.data.calendar.error}`);
    } else {
      toast.success("Meeting rescheduled");
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <CalendarClock /> Reschedule
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule meeting</DialogTitle>
          <DialogDescription>Times are in {timezone.replace(/_/g, " ")}. Attendees are notified if it&apos;s on a calendar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rs-date">Date</Label>
              <Input id="rs-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-time">Time</Label>
              <Input id="rs-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-duration">Minutes</Label>
              <Input id="rs-duration" type="number" min={5} max={480} step={5} required value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Reschedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
