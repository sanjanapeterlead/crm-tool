/**
 * V1 call handling is manual: the salesperson dials from their own phone
 * (a `tel:` link) and records what happened afterwards. There is no
 * telephony, recording or transcription (DECISIONS D-016).
 */

export const CALL_OUTCOMES = [
  "connected_interested",
  "no_answer",
  "follow_up",
  "meeting",
  "not_interested",
  "wrong_number",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  connected_interested: "Connected / Interested",
  no_answer: "No answer",
  follow_up: "Follow up",
  meeting: "Meeting",
  not_interested: "Not interested",
  wrong_number: "Wrong number",
};

export function isCallOutcome(value: string): value is CallOutcome {
  return (CALL_OUTCOMES as readonly string[]).includes(value);
}

export interface CallNextStep {
  /** `required` blocks the "done" state of the form until a follow-up is set. */
  followUp: "required" | "suggested" | "none";
  /** Offer to open the schedule-meeting flow. */
  scheduleMeeting: boolean;
  /** When set, offer to mark the lead lost with this reason pre-filled. */
  suggestLostReason: string | null;
}

/**
 * What the UI should offer after each outcome. A plain lookup, not a
 * workflow engine: it only *suggests*; the salesperson decides.
 */
export function nextStepFor(outcome: CallOutcome): CallNextStep {
  switch (outcome) {
    case "connected_interested":
      return { followUp: "suggested", scheduleMeeting: true, suggestLostReason: null };
    case "no_answer":
      return { followUp: "suggested", scheduleMeeting: false, suggestLostReason: null };
    case "follow_up":
      return { followUp: "required", scheduleMeeting: false, suggestLostReason: null };
    case "meeting":
      return { followUp: "none", scheduleMeeting: true, suggestLostReason: null };
    case "not_interested":
      return { followUp: "none", scheduleMeeting: false, suggestLostReason: "Not interested" };
    case "wrong_number":
      return { followUp: "none", scheduleMeeting: false, suggestLostReason: "Wrong number" };
  }
}

/** Outcomes where the prospect actually spoke to us — used for "first contact" logic. */
export function isConnectedOutcome(outcome: CallOutcome): boolean {
  return outcome === "connected_interested" || outcome === "follow_up" || outcome === "meeting" || outcome === "not_interested";
}
