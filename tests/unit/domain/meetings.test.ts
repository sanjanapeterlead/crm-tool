import { describe, expect, it } from "vitest";
import { buildAttendees, calendarEventIdFor, defaultMeetingTitle, parseEmailList } from "@/lib/domain/meetings";

describe("buildAttendees", () => {
  it("invites the salesperson, the contact and guests, each with a role", () => {
    const attendees = buildAttendees({
      salesperson: { email: "Priya@Firm.com", name: "Priya Shah" },
      contact: { email: "riya@example.com", name: "Riya Kapoor" },
      guestEmails: ["manager@firm.com"],
    });
    expect(attendees).toEqual([
      { email: "priya@firm.com", name: "Priya Shah", role: "salesperson" },
      { email: "riya@example.com", name: "Riya Kapoor", role: "contact" },
      { email: "manager@firm.com", name: null, role: "guest" },
    ]);
  });

  it("drops anyone without a usable email instead of sending a broken invite", () => {
    const attendees = buildAttendees({
      salesperson: { email: null, name: "No Email" },
      contact: { email: "not-an-email", name: "Bad" },
      guestEmails: ["", "ok@x.com"],
    });
    expect(attendees.map((a) => a.email)).toEqual(["ok@x.com"]);
  });

  it("never invites the same address twice, keeping the more specific role", () => {
    const attendees = buildAttendees({
      salesperson: { email: "priya@firm.com", name: "Priya" },
      contact: { email: "PRIYA@firm.com", name: "Same person" },
      guestEmails: ["priya@firm.com", "priya@firm.com"],
    });
    expect(attendees).toEqual([{ email: "priya@firm.com", name: "Priya", role: "salesperson" }]);
  });

  it("copes with no one at all", () => {
    expect(buildAttendees({})).toEqual([]);
  });
});

describe("parseEmailList", () => {
  it("splits on commas, semicolons and whitespace", () => {
    expect(parseEmailList("a@x.com, b@y.com;c@z.com  d@w.com")).toEqual(["a@x.com", "b@y.com", "c@z.com", "d@w.com"]);
  });

  it("returns nothing for an empty field", () => {
    expect(parseEmailList("")).toEqual([]);
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList(" , ; ")).toEqual([]);
  });
});

describe("calendarEventIdFor", () => {
  it("derives an id valid for Google (lowercase hex, no dashes) and stable for retries", () => {
    const id = "F47AC10B-58CC-4372-A567-0E02B2C3D479";
    expect(calendarEventIdFor(id)).toBe("f47ac10b58cc4372a5670e02b2c3d479");
    expect(calendarEventIdFor(id)).toBe(calendarEventIdFor(id));
    expect(calendarEventIdFor(id)).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe("defaultMeetingTitle", () => {
  it("names the meeting after the lead", () => {
    expect(defaultMeetingTitle("Riya Kapoor")).toBe("Meeting with Riya Kapoor");
    expect(defaultMeetingTitle("Riya Kapoor", "Summit")).toBe("Summit — meeting with Riya Kapoor");
  });
});
