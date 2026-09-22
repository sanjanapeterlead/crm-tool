import { normalizeEmail } from "./contact";

export type AttendeeRole = "salesperson" | "contact" | "guest";

export interface MeetingAttendee {
  email: string;
  name: string | null;
  role: AttendeeRole;
}

/**
 * Who is invited: the salesperson running it, the contact, and any extra
 * guests. Deduped by normalized email (the salesperson adding their own
 * address as a guest must not produce two invitations), and anyone without a
 * usable email is dropped — a calendar invitation needs one. Earlier entries
 * win, so the salesperson/contact keep their role over a duplicate "guest".
 */
export function buildAttendees(input: {
  salesperson?: { email: string | null; name: string | null } | null;
  contact?: { email: string | null; name: string | null } | null;
  guestEmails?: string[];
}): MeetingAttendee[] {
  const seen = new Set<string>();
  const attendees: MeetingAttendee[] = [];

  const add = (raw: string | null | undefined, name: string | null, role: AttendeeRole) => {
    const email = normalizeEmail(raw);
    if (!email || seen.has(email)) return;
    seen.add(email);
    attendees.push({ email, name: name?.trim() || null, role });
  };

  add(input.salesperson?.email, input.salesperson?.name ?? null, "salesperson");
  add(input.contact?.email, input.contact?.name ?? null, "contact");
  for (const guest of input.guestEmails ?? []) add(guest, null, "guest");

  return attendees;
}

/** Splits a "a@x.com, b@y.com; c@z.com" field into candidate emails (validation happens later). */
export function parseEmailList(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function defaultMeetingTitle(leadName: string, orgName?: string): string {
  return orgName ? `${orgName} — meeting with ${leadName}` : `Meeting with ${leadName}`;
}

/** The stable id a meeting's calendar event is created under: retries can never double-book. */
export function calendarEventIdFor(meetingId: string): string {
  return meetingId.replace(/-/g, "").toLowerCase();
}
