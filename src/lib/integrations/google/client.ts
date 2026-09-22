import "server-only";
import { GOOGLE_OAUTH_SCOPES, getGoogleRedirectUri, type GoogleConfig } from "./config";

/** An error response from Google's OAuth or Calendar API. `message` is Google's own text — never our credentials. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Google's machine reason, e.g. `invalid_grant`, `rateLimitExceeded`. */
    readonly reason?: string
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const CALENDAR_URL = "https://www.googleapis.com/calendar/v3";

export interface GoogleEvent {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
}

export interface GoogleEventBody {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string; displayName?: string }>;
  conferenceData?: {
    createRequest: { requestId: string; conferenceSolutionKey: { type: "hangoutsMeet" } };
  };
}

/** Thin typed wrapper over Google's OAuth + Calendar HTTP APIs. Nothing else in the app calls Google directly. */
export class GoogleCalendarClient {
  constructor(private readonly config: GoogleConfig) {}

  authorizeUrl(state: string): string {
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", getGoogleRedirectUri(this.config));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
    // `offline` + `consent` make Google issue a refresh token every time, which
    // is what lets us create events later without the admin being present.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return url.toString();
  }

  private async tokenRequest(params: Record<string, string>) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...params }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || body.error) {
      throw new GoogleApiError(body.error_description ?? body.error ?? `Token request failed (${response.status})`, response.status, body.error);
    }
    return body;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string | null; scopes: string[] }> {
    const body = await this.tokenRequest({
      code,
      grant_type: "authorization_code",
      redirect_uri: getGoogleRedirectUri(this.config),
    });
    return { accessToken: body.access_token ?? "", refreshToken: body.refresh_token ?? null, scopes: (body.scope ?? "").split(" ").filter(Boolean) };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const body = await this.tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
    if (!body.access_token) throw new GoogleApiError("Google returned no access token.", 500);
    return body.access_token;
  }

  async getAccountEmail(accessToken: string): Promise<string> {
    const response = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { email?: string };
    if (!response.ok || !body.email) throw new GoogleApiError("Could not read the Google account's email.", response.status);
    return body.email;
  }

  private async calendarRequest<T>(
    accessToken: string,
    method: string,
    path: string,
    options: { query?: Record<string, string>; body?: unknown; allowStatuses?: number[] } = {}
  ): Promise<{ status: number; body: T | null }> {
    const url = new URL(`${CALENDAR_URL}/${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, ...(options.body ? { "content-type": "application/json" } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });

    if (response.status === 204) return { status: 204, body: null };
    const parsed = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };

    if (!response.ok && !options.allowStatuses?.includes(response.status)) {
      throw new GoogleApiError(
        parsed.error?.message ?? `Google Calendar request failed (${response.status})`,
        response.status,
        parsed.error?.errors?.[0]?.reason
      );
    }
    return { status: response.status, body: parsed };
  }

  /** Inserts an event. Returns `null` (not an error) when `event.id` already exists: the caller then fetches it. */
  async insertEvent(accessToken: string, calendarId: string, event: GoogleEventBody, withConference: boolean): Promise<GoogleEvent | null> {
    const { status, body } = await this.calendarRequest<GoogleEvent>(accessToken, "POST", `calendars/${encodeURIComponent(calendarId)}/events`, {
      query: { sendUpdates: "all", ...(withConference ? { conferenceDataVersion: "1" } : {}) },
      body: event,
      allowStatuses: [409],
    });
    return status === 409 ? null : body;
  }

  async getEvent(accessToken: string, calendarId: string, eventId: string): Promise<GoogleEvent> {
    const { body } = await this.calendarRequest<GoogleEvent>(accessToken, "GET", `calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
    return body as GoogleEvent;
  }

  async patchEvent(accessToken: string, calendarId: string, eventId: string, patch: GoogleEventBody): Promise<GoogleEvent> {
    const { body } = await this.calendarRequest<GoogleEvent>(accessToken, "PATCH", `calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      query: { sendUpdates: "all" },
      body: patch,
    });
    return body as GoogleEvent;
  }

  /** 404/410 mean it's already gone — the outcome the caller wanted. */
  async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    await this.calendarRequest(accessToken, "DELETE", `calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      query: { sendUpdates: "all" },
      allowStatuses: [404, 410],
    });
  }

  /** Revokes a token at Google when an org disconnects. Best effort. */
  async revoke(token: string): Promise<void> {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      cache: "no-store",
    }).catch(() => undefined);
  }
}

/** The Meet link, from whichever field Google populated. */
export function meetLinkOf(event: GoogleEvent): string | null {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? null;
}
