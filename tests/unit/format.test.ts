import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatShortDateTime, formatTime } from "@/lib/format";

describe("timestamp formatting in the org's zone", () => {
  const instant = "2026-09-20T09:30:00Z"; // 15:00 in India

  it("shows India time regardless of the machine's timezone", () => {
    expect(formatTime(instant, "Asia/Kolkata")).toMatch(/3:00\s?pm/i);
    expect(formatDateTime(instant, "Asia/Kolkata")).toMatch(/20 Sept? 2026.*3:00\s?pm/i);
    expect(formatShortDateTime(instant, "Asia/Kolkata")).toMatch(/20 Sept?.*3:00\s?pm/i);
  });

  it("shows the same instant differently for another org", () => {
    expect(formatTime(instant, "America/New_York")).toMatch(/5:30\s?am/i);
  });

  it("uses the org's date, which can differ from UTC's", () => {
    // 20:00 UTC on the 19th is already the 20th in India.
    expect(formatDate("2026-09-19T20:00:00Z", "Asia/Kolkata")).toMatch(/^20 Sep/);
    expect(formatDate("2026-09-19T20:00:00Z", "UTC")).toMatch(/^19 Sep/);
  });

  it("returns an empty string for an invalid date rather than throwing during render", () => {
    expect(formatDateTime("garbage")).toBe("");
  });
});
