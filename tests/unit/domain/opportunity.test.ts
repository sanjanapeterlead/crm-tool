import { describe, expect, it } from "vitest";
import { checkStageMove, statusForStage } from "@/lib/domain/opportunity";
import { manualAssignment } from "@/lib/domain/assignment";

describe("statusForStage", () => {
  it("derives status from stage flags, not labels", () => {
    expect(statusForStage({ is_won: true, is_lost: false })).toBe("won");
    expect(statusForStage({ is_won: false, is_lost: true })).toBe("lost");
    expect(statusForStage({ is_won: false, is_lost: false })).toBe("open");
  });
});

describe("checkStageMove", () => {
  const open = { is_won: false, is_lost: false };
  const won = { is_won: true, is_lost: false };
  const lost = { is_won: false, is_lost: true };

  it("allows moves to open and won stages and clears any old lost reason", () => {
    expect(checkStageMove(open, "stale reason")).toEqual({ ok: true, lostReason: null });
    expect(checkStageMove(won)).toEqual({ ok: true, lostReason: null });
  });

  it("requires a reason to mark a lead lost", () => {
    expect(checkStageMove(lost).ok).toBe(false);
    expect(checkStageMove(lost, "   ").ok).toBe(false);
  });

  it("keeps a trimmed lost reason", () => {
    expect(checkStageMove(lost, "  Price too high ")).toEqual({ ok: true, lostReason: "Price too high" });
  });
});

describe("manualAssignment", () => {
  it("honours the requested assignee and otherwise leaves the lead unassigned", async () => {
    const base = { orgId: "o", source: "manual" };
    expect(await manualAssignment.pickAssignee({ ...base, requestedAssigneeId: "rep-a" })).toBe("rep-a");
    expect(await manualAssignment.pickAssignee({ ...base, requestedAssigneeId: null })).toBeNull();
  });
});
