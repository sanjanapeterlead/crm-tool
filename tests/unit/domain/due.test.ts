import { describe, expect, it } from "vitest";
import {
  addDays,
  classifyDue,
  dueBoundaries,
  isValidTimezone,
  localDayBounds,
  startOfWeekDate,
  zonedTimeToUtc,
} from "@/lib/domain/due";

const IST = "Asia/Kolkata";

describe("dueBoundaries", () => {
  it("uses the org's calendar day, not UTC's", () => {
    // 20:00 UTC on the 19th is 01:30 IST on the 20th.
    const now = new Date("2026-09-19T20:00:00Z");
    expect(dueBoundaries(now, IST)).toEqual({ today: "2026-09-20", nowTime: "01:30:00" });
    expect(dueBoundaries(now, "UTC").today).toBe("2026-09-19");
  });

  it("handles a zone behind UTC", () => {
    const now = new Date("2026-09-20T03:00:00Z"); // 20:00 on the 19th in Los Angeles (PDT)
    expect(dueBoundaries(now, "America/Los_Angeles")).toEqual({ today: "2026-09-19", nowTime: "20:00:00" });
  });

  it("never reports hour 24 at local midnight", () => {
    const now = new Date("2026-09-19T18:30:00Z"); // 00:00 IST
    expect(dueBoundaries(now, IST)).toEqual({ today: "2026-09-20", nowTime: "00:00:00" });
  });
});

describe("classifyDue (the Today queue's due-vs-overdue rule)", () => {
  // 10:30 UTC = 16:00 IST on 2026-09-19
  const now = new Date("2026-09-19T10:30:00Z");

  it("an earlier date is overdue", () => {
    expect(classifyDue({ date: "2026-09-18" }, now, IST)).toBe("overdue");
  });

  it("a later date is upcoming", () => {
    expect(classifyDue({ date: "2026-09-20" }, now, IST)).toBe("upcoming");
  });

  it("today with no time is due today, not overdue", () => {
    expect(classifyDue({ date: "2026-09-19" }, now, IST)).toBe("due_today");
    expect(classifyDue({ date: "2026-09-19", time: null }, now, IST)).toBe("due_today");
  });

  it("today with a time that has passed is overdue", () => {
    expect(classifyDue({ date: "2026-09-19", time: "15:59:00" }, now, IST)).toBe("overdue");
    expect(classifyDue({ date: "2026-09-19", time: "09:00" }, now, IST)).toBe("overdue");
  });

  it("today at the current moment or later is still due today", () => {
    expect(classifyDue({ date: "2026-09-19", time: "16:00:00" }, now, IST)).toBe("due_today");
    expect(classifyDue({ date: "2026-09-19", time: "18:30:00" }, now, IST)).toBe("due_today");
  });

  it("is overdue the instant the due second passes (matches the database's comparison)", () => {
    const justAfter = new Date("2026-09-19T10:30:01Z"); // 16:00:01 IST
    expect(classifyDue({ date: "2026-09-19", time: "16:00" }, justAfter, IST)).toBe("overdue");
    expect(classifyDue({ date: "2026-09-19", time: "16:00:00" }, now, IST)).toBe("due_today");
  });

  it("regression: shortly after IST midnight the org's 'today' has already rolled over", () => {
    const afterMidnightIst = new Date("2026-09-19T20:00:00Z"); // 01:30 IST on the 20th
    // The 19th is yesterday for the org; a UTC comparison would call it 'due today'.
    expect(classifyDue({ date: "2026-09-19" }, afterMidnightIst, IST)).toBe("overdue");
    expect(classifyDue({ date: "2026-09-20" }, afterMidnightIst, IST)).toBe("due_today");
  });
});

describe("localDayBounds", () => {
  it("returns the org's day as UTC instants (IST is UTC+5:30, no DST)", () => {
    const { start, end, today } = localDayBounds(new Date("2026-09-19T10:30:00Z"), IST);
    expect(today).toBe("2026-09-19");
    expect(start.toISOString()).toBe("2026-09-18T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-19T18:30:00.000Z");
  });

  it("uses the org's day even when UTC is still on the previous date", () => {
    const { start, today } = localDayBounds(new Date("2026-09-19T20:00:00Z"), IST); // 01:30 IST on the 20th
    expect(today).toBe("2026-09-20");
    expect(start.toISOString()).toBe("2026-09-19T18:30:00.000Z");
  });

  it("handles a DST zone (Los Angeles, PDT = UTC-7)", () => {
    const { start, end } = localDayBounds(new Date("2026-09-19T12:00:00Z"), "America/Los_Angeles");
    expect(start.toISOString()).toBe("2026-09-19T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-20T07:00:00.000Z");
  });

  it("gets a 23-hour day right across a DST change", () => {
    // US spring-forward: 2026-03-08 has only 23 hours in Los Angeles.
    const { start, end } = localDayBounds(new Date("2026-03-08T20:00:00Z"), "America/Los_Angeles");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
});

describe("calendar helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the Monday that starts the week", () => {
    expect(startOfWeekDate("2026-09-21")).toBe("2026-09-21"); // a Monday
    expect(startOfWeekDate("2026-09-20")).toBe("2026-09-14"); // Sunday belongs to the week before
    expect(startOfWeekDate("2026-09-24")).toBe("2026-09-21"); // Thursday
  });
});

describe("zonedTimeToUtc — a form's wall-clock time in the org's zone", () => {
  it("reads 15:00 as 15:00 India time, not the server's (regression: it used the server's zone)", () => {
    expect(zonedTimeToUtc("2026-09-20", "15:00", IST).toISOString()).toBe("2026-09-20T09:30:00.000Z");
  });

  it("crosses the date line correctly for early-morning local times", () => {
    expect(zonedTimeToUtc("2026-09-20", "01:30", IST).toISOString()).toBe("2026-09-19T20:00:00.000Z");
  });

  it("handles a DST zone in summer and winter", () => {
    expect(zonedTimeToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-15", "09:00", "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("round-trips through dueBoundaries", () => {
    const instant = zonedTimeToUtc("2026-09-20", "16:45", IST);
    expect(dueBoundaries(instant, IST)).toEqual({ today: "2026-09-20", nowTime: "16:45:00" });
  });

  it("places a nonexistent spring-forward time just after the gap", () => {
    // 2026-03-08 02:30 doesn't exist in New York (clocks jump 02:00 → 03:00).
    const result = zonedTimeToUtc("2026-03-08", "02:30", "America/New_York");
    expect(dueBoundaries(result, "America/New_York").nowTime.slice(0, 2)).toBe("03");
  });
});
