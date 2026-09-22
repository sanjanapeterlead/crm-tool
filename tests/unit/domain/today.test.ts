import { describe, expect, it } from "vitest";
import { chooseNextLead } from "@/lib/domain/today";

describe("chooseNextLead — the 'Start next lead' rule", () => {
  it("returns nothing when there is nothing to do", () => {
    expect(chooseNextLead({ uncontacted: [], overdue: [], dueToday: [] })).toBeNull();
  });

  it("puts a never-contacted lead first, then the most overdue, then today's earliest", () => {
    const all = {
      uncontacted: [{ leadId: "new", createdAt: "2026-09-19T08:00:00Z" }],
      overdue: [{ leadId: "late", dueAt: "2026-09-18T10:00:00Z" }],
      dueToday: [{ leadId: "soon", dueAt: "2026-09-19T15:00:00Z" }],
    };
    expect(chooseNextLead(all)).toEqual({ leadId: "new", reason: "new_lead" });
    expect(chooseNextLead({ ...all, uncontacted: [] })).toEqual({ leadId: "late", reason: "overdue_followup" });
    expect(chooseNextLead({ ...all, uncontacted: [], overdue: [] })).toEqual({ leadId: "soon", reason: "followup_today" });
  });

  it("picks the lead that has waited longest among the uncontacted", () => {
    const next = chooseNextLead({
      uncontacted: [
        { leadId: "fresh", createdAt: "2026-09-19T09:00:00Z" },
        { leadId: "waiting", createdAt: "2026-09-18T09:00:00Z" },
      ],
      overdue: [],
      dueToday: [],
    });
    expect(next?.leadId).toBe("waiting");
  });

  it("picks the most overdue follow-up, and the earliest one due today", () => {
    expect(
      chooseNextLead({
        uncontacted: [],
        overdue: [
          { leadId: "yesterday", dueAt: "2026-09-18T10:00:00Z" },
          { leadId: "last-week", dueAt: "2026-09-12T10:00:00Z" },
        ],
        dueToday: [],
      })?.leadId
    ).toBe("last-week");

    expect(
      chooseNextLead({
        uncontacted: [],
        overdue: [],
        dueToday: [
          { leadId: "evening", dueAt: "2026-09-19T18:00:00Z" },
          { leadId: "noon", dueAt: "2026-09-19T12:00:00Z" },
        ],
      })?.leadId
    ).toBe("noon");
  });
});
