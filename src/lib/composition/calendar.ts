import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleCalendarProvider } from "@/lib/integrations/google/calendar-adapter";
import { getGoogleConfig } from "@/lib/integrations/google/config";
import { MockCalendarProvider } from "@/lib/integrations/google/mock-adapter";
import { mockProvidersEnabled } from "@/lib/integrations/mode";
import { getCalendarConnection, getCalendarCredential } from "@/lib/services/calendar-connections";
import type { CalendarRuntime } from "@/lib/services/meetings";

/**
 * The composition root for calendars — the one place that decides which
 * adapter an organization uses (docs/ARCHITECTURE.md, DECISIONS D-015/D-017).
 * Adding DaySchedule or Calendly's API means another branch here and a new
 * adapter; meetings, the timeline and the UI don't change.
 *
 *  - Org connected Google and the app has Google credentials → Google ("live").
 *  - Otherwise, if mock providers are enabled → the mock ("demo").
 *  - Otherwise → null: no calendar. Meetings still work with a pasted link.
 */
export async function resolveCalendar(admin: SupabaseClient, orgId: string): Promise<CalendarRuntime | null> {
  const connection = await getCalendarConnection(admin, orgId);

  if (connection) {
    const config = getGoogleConfig();
    const credential = config ? await getCalendarCredential(admin, orgId) : null;
    if (config && credential) {
      return {
        provider: new GoogleCalendarProvider(config),
        connection: { calendarId: connection.calendar_id, credential },
        mode: "live",
      };
    }
  }

  if (mockProvidersEnabled()) {
    return { provider: new MockCalendarProvider(), connection: { calendarId: "primary", credential: "mock" }, mode: "demo" };
  }
  return null;
}

export type CalendarMode = "live" | "demo" | "unavailable";

/** Which mode the calendar is in, for the UI — without reading any credential. */
export async function calendarMode(db: SupabaseClient, orgId: string): Promise<CalendarMode> {
  const connection = await getCalendarConnection(db, orgId);
  if (connection && getGoogleConfig()) return "live";
  return mockProvidersEnabled() ? "demo" : "unavailable";
}
