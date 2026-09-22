"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS, nextStepFor, type CallOutcome } from "@/lib/domain/calls";
import { logCallAction } from "@/app/(app)/actions";

/**
 * Record what happened on a call the salesperson made from their own phone.
 * Picking an outcome offers the sensible next step (a follow-up, a meeting)
 * without forcing one — except "Follow up", where a date is the whole point.
 */
export function LogCallDialog({
  leadId,
  leadName,
  defaultFollowupDate,
  trigger,
}: {
  leadId: string;
  leadName: string;
  /** Tomorrow, in the organization's timezone (`YYYY-MM-DD`). */
  defaultFollowupDate: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [withFollowup, setWithFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState(defaultFollowupDate);
  const [followupTime, setFollowupTime] = useState("10:00");
  const [followupNote, setFollowupNote] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const next = outcome ? nextStepFor(outcome) : null;
  const followupRequired = next?.followUp === "required";
  const showFollowup = followupRequired || withFollowup;

  function pick(value: CallOutcome) {
    setOutcome(value);
    const step = nextStepFor(value);
    setWithFollowup(step.followUp !== "none");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!outcome) return;

    setPending(true);
    const result = await logCallAction({
      lead_id: leadId,
      outcome,
      duration_minutes: minutes.trim() === "" ? null : Number(minutes),
      notes: notes.trim(),
      next_followup: showFollowup
        ? {
            type: "call",
            due_date: followupDate,
            due_time: followupTime,
            description: followupNote.trim() || `Call ${leadName} again`,
          }
        : undefined,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(showFollowup ? "Call logged, follow-up set" : "Call logged");
    setOpen(false);
    setOutcome(null);
    setMinutes("");
    setNotes("");
    setWithFollowup(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log call with {leadName}</DialogTitle>
          <DialogDescription>What happened? Takes ten seconds and keeps the timeline honest.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Outcome</legend>
            <div className="grid grid-cols-2 gap-2">
              {CALL_OUTCOMES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={outcome === value}
                  onClick={() => pick(value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    outcome === value
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "hover:bg-muted"
                  )}
                >
                  {CALL_OUTCOME_LABELS[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="call-minutes">Minutes</Label>
              <Input
                id="call-minutes"
                type="number"
                min={0}
                max={1440}
                inputMode="numeric"
                placeholder="Optional"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="call-notes">Notes</Label>
              <Textarea
                id="call-notes"
                rows={2}
                maxLength={4000}
                placeholder="What did they say?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {next?.scheduleMeeting && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Next: schedule a meeting from this lead&apos;s page.
            </p>
          )}
          {next?.suggestLostReason && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              This may be a dead end — you can mark the lead lost (&ldquo;{next.suggestLostReason}&rdquo;) afterwards.
            </p>
          )}

          {outcome && next?.followUp !== "none" && (
            <div className="space-y-3 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={showFollowup}
                  disabled={followupRequired}
                  onChange={(e) => setWithFollowup(e.target.checked)}
                />
                Set the next follow-up{followupRequired ? " (required)" : ""}
              </label>
              {showFollowup && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-date">Date</Label>
                    <Input
                      id="fu-date"
                      type="date"
                      required
                      value={followupDate}
                      onChange={(e) => setFollowupDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-time">Time</Label>
                    <Input
                      id="fu-time"
                      type="time"
                      value={followupTime}
                      onChange={(e) => setFollowupTime(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="fu-note">Reminder</Label>
                    <Input
                      id="fu-note"
                      maxLength={200}
                      placeholder={`Call ${leadName} again`}
                      value={followupNote}
                      onChange={(e) => setFollowupNote(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={!outcome || pending}>
              {pending ? "Saving…" : "Save call"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
