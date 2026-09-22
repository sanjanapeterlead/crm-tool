import { describe, expect, it } from "vitest";
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS, isCallOutcome, nextStepFor } from "@/lib/domain/calls";

describe("call outcomes", () => {
  it("has a label for every outcome", () => {
    for (const outcome of CALL_OUTCOMES) expect(CALL_OUTCOME_LABELS[outcome]).toBeTruthy();
  });

  it("recognises only valid outcomes", () => {
    expect(isCallOutcome("no_answer")).toBe(true);
    expect(isCallOutcome("voicemail")).toBe(false);
  });

  it("requires a follow-up when the salesperson said 'follow up'", () => {
    expect(nextStepFor("follow_up").followUp).toBe("required");
  });

  it("offers to schedule a meeting after a meeting outcome or an interested call", () => {
    expect(nextStepFor("meeting").scheduleMeeting).toBe(true);
    expect(nextStepFor("connected_interested").scheduleMeeting).toBe(true);
    expect(nextStepFor("no_answer").scheduleMeeting).toBe(false);
  });

  it("suggests marking the lead lost, with a reason, for dead ends", () => {
    expect(nextStepFor("not_interested").suggestLostReason).toBe("Not interested");
    expect(nextStepFor("wrong_number").suggestLostReason).toBe("Wrong number");
    expect(nextStepFor("no_answer").suggestLostReason).toBeNull();
  });
});
