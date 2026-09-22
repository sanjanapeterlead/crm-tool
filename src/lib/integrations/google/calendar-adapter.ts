import "server-only";
import type {
  CalendarConnection,
  CalendarEventInput,
  CalendarEventOutcome,
  CalendarFailure,
  CalendarOperationOutcome,
  CalendarProvider,
} from "@/lib/ports/calendar";
import { GoogleApiError, GoogleCalendarClient, meetLinkOf, type GoogleEventBody } from "./client";
import type { GoogleConfig } from "./config";

const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded"]);

/**
 * Turns anything Google (or the network) throws into the CRM's small
 * vocabulary of calendar failures. The message is Google's own, safe to show.
 */
export function classifyCalendarError(error: unknown): CalendarFailure {
  if (error instanceof GoogleApiError) {
    if (error.reason === "invalid_grant" || error.status === 401) {
      return { ok: false, code: "auth", retryable: false, error: "Google rejected our access. An admin needs to reconnect Google Calendar in Settings." };
    }
    if (error.status === 429 || (error.reason && RATE_LIMIT_REASONS.has(error.reason))) {
      return { ok: false, code: "rate_limited", retryable: true, error: "Google Calendar is rate limiting us. Try again in a minute." };
    }
    if (error.status === 403) {
      return { ok: false, code: "auth", retryable: false, error: "Google Calendar denied the request (permissions). An admin may need to reconnect and grant calendar access." };
    }
    if (error.status >= 500) return { ok: false, code: "other", retryable: true, error: error.message };
    return { ok: false, code: "invalid_request", retryable: false, error: error.message };
  }
  return { ok: false, code: "other", retryable: true, error: error instanceof Error ? error.message : "Unknown calendar error." };
}

/** Google's event ids allow lowercase a–v and digits, 5–1024 chars: a UUID's hex qualifies. */
function googleEventId(eventId: string): string {
  return eventId.toLowerCase().replace(/[^a-v0-9]/g, "");
}

function toBody(input: CalendarEventInput, id: string): GoogleEventBody {
  return {
    id,
    summary: input.title,
    description: input.description,
    start: { dateTime: input.startsAt, timeZone: input.timezone },
    end: { dateTime: input.endsAt, timeZone: input.timezone },
    attendees: input.attendees.map((a) => ({ email: a.email, ...(a.name ? { displayName: a.name } : {}) })),
    ...(input.withVideoLink
      ? { conferenceData: { createRequest: { requestId: id, conferenceSolutionKey: { type: "hangoutsMeet" as const } } } }
      : {}),
  };
}

/** Google Calendar, with Meet links, through OAuth-granted access to one connected account. */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly id = "google";
  readonly isMock = false;
  private readonly client: GoogleCalendarClient;

  constructor(config: GoogleConfig, client?: GoogleCalendarClient) {
    this.client = client ?? new GoogleCalendarClient(config);
  }

  async createEvent(connection: CalendarConnection, event: CalendarEventInput): Promise<CalendarEventOutcome> {
    const id = googleEventId(event.eventId);
    try {
      const token = await this.client.refreshAccessToken(connection.credential);
      // Idempotent: inserting with our own id means a retry after a timeout hits
      // 409 (already exists) instead of booking a second event.
      const created =
        (await this.client.insertEvent(token, connection.calendarId, toBody(event, id), event.withVideoLink)) ??
        (await this.client.getEvent(token, connection.calendarId, id));

      return { ok: true, externalEventId: created.id, meetingUrl: meetLinkOf(created), eventUrl: created.htmlLink ?? null };
    } catch (error) {
      return classifyCalendarError(error);
    }
  }

  async updateEventTime(
    connection: CalendarConnection,
    externalEventId: string,
    change: { startsAt: string; endsAt: string; timezone: string }
  ): Promise<CalendarOperationOutcome> {
    try {
      const token = await this.client.refreshAccessToken(connection.credential);
      await this.client.patchEvent(token, connection.calendarId, externalEventId, {
        start: { dateTime: change.startsAt, timeZone: change.timezone },
        end: { dateTime: change.endsAt, timeZone: change.timezone },
      });
      return { ok: true };
    } catch (error) {
      return classifyCalendarError(error);
    }
  }

  async cancelEvent(connection: CalendarConnection, externalEventId: string): Promise<CalendarOperationOutcome> {
    try {
      const token = await this.client.refreshAccessToken(connection.credential);
      await this.client.deleteEvent(token, connection.calendarId, externalEventId);
      return { ok: true };
    } catch (error) {
      return classifyCalendarError(error);
    }
  }
}
