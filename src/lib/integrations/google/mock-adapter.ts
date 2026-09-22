import type {
  CalendarConnection,
  CalendarEventInput,
  CalendarEventOutcome,
  CalendarOperationOutcome,
  CalendarProvider,
} from "@/lib/ports/calendar";

/**
 * Stands in for Google Calendar when no credentials are configured (demo
 * mode). "Events" are fabricated and the Meet link points nowhere real — a
 * meeting scheduled this way is recorded in the CRM but no invitation is sent.
 *
 * An attendee at `@fail.test` makes the create fail (retryable), so the
 * failure path can be shown and tested.
 */
export class MockCalendarProvider implements CalendarProvider {
  readonly id = "mock";
  readonly isMock = true;

  async createEvent(_connection: CalendarConnection, event: CalendarEventInput): Promise<CalendarEventOutcome> {
    if (event.attendees.some((a) => a.email.toLowerCase().endsWith("@fail.test"))) {
      return { ok: false, code: "other", retryable: true, error: "Demo mode: the calendar is unavailable right now." };
    }
    const short = event.eventId.replace(/[^a-z0-9]/gi, "").slice(0, 10);
    return {
      ok: true,
      externalEventId: `mock.event.${event.eventId}`,
      meetingUrl: event.withVideoLink ? `https://meet.google.com/demo-${short}` : null,
      eventUrl: null,
    };
  }

  async updateEventTime(): Promise<CalendarOperationOutcome> {
    return { ok: true };
  }

  async cancelEvent(): Promise<CalendarOperationOutcome> {
    return { ok: true };
  }
}
