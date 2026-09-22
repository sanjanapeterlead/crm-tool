/**
 * Port: creating, moving and cancelling calendar events (with a video link).
 * Google Calendar/Meet is the V1 adapter; DaySchedule, Calendly's API or
 * Outlook slot in later by implementing this — meetings, the timeline and the
 * UI never learn which one is behind it (DECISIONS D-015).
 */

/** What an adapter needs to act for one organization's connected calendar. */
export interface CalendarConnection {
  calendarId: string;
  /** Opaque, secret credential (for Google, an OAuth refresh token). Never logged. */
  credential: string;
}

export interface CalendarAttendee {
  email: string;
  name?: string | null;
}

export interface CalendarEventInput {
  /**
   * A stable id for this event, derived from the meeting. Making creation
   * idempotent on it means a retry after a timeout can never book twice.
   */
  eventId: string;
  title: string;
  description?: string;
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
  /** IANA zone the organizer sees the event in. */
  timezone: string;
  attendees: CalendarAttendee[];
  /** Ask the provider to attach a video-conference link (Google Meet). */
  withVideoLink: boolean;
}

export type CalendarFailureCode = "auth" | "invalid_request" | "rate_limited" | "other";

export type CalendarFailure = { ok: false; code: CalendarFailureCode; error: string; retryable: boolean };

export type CalendarEventOutcome =
  | { ok: true; externalEventId: string; meetingUrl: string | null; eventUrl: string | null }
  | CalendarFailure;

export type CalendarOperationOutcome = { ok: true } | CalendarFailure;

export interface CalendarProvider {
  readonly id: string;
  /** True for adapters that pretend — the UI labels these "Demo mode". */
  readonly isMock: boolean;

  createEvent(connection: CalendarConnection, event: CalendarEventInput): Promise<CalendarEventOutcome>;
  /** Moves an existing event. */
  updateEventTime(
    connection: CalendarConnection,
    externalEventId: string,
    change: { startsAt: string; endsAt: string; timezone: string }
  ): Promise<CalendarOperationOutcome>;
  /** Cancels an event. Cancelling one that's already gone is a success. */
  cancelEvent(connection: CalendarConnection, externalEventId: string): Promise<CalendarOperationOutcome>;
}
