/**
 * Timestamp display in the organization's timezone.
 *
 * `date-fns` `format()` and `Date#toLocale*` use the *runtime's* zone — UTC on a
 * typical server — so a meeting stored correctly would still be shown five and
 * a half hours off to an Indian team. Everything absolute goes through here.
 */

import { DEFAULT_TIMEZONE } from "@/lib/domain/due";

const LOCALE = "en-IN";

function fmt(iso: string | Date, timezone: string, options: Intl.DateTimeFormatOptions): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: timezone, ...options }).format(date);
}

/** `20 Sep 2026, 3:00 pm` */
export function formatDateTime(iso: string | Date, timezone: string = DEFAULT_TIMEZONE): string {
  return fmt(iso, timezone, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

/** `20 Sep, 3:00 pm` — for lists where the year is noise. */
export function formatShortDateTime(iso: string | Date, timezone: string = DEFAULT_TIMEZONE): string {
  return fmt(iso, timezone, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/** `20 Sep 2026` */
export function formatDate(iso: string | Date, timezone: string = DEFAULT_TIMEZONE): string {
  return fmt(iso, timezone, { day: "numeric", month: "short", year: "numeric" });
}

/** `3:00 pm` */
export function formatTime(iso: string | Date, timezone: string = DEFAULT_TIMEZONE): string {
  return fmt(iso, timezone, { hour: "numeric", minute: "2-digit", hour12: true });
}
