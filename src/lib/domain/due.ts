/**
 * "Today", "overdue" and "due now" for follow-ups.
 *
 * A follow-up's date and time are wall-clock in the *organization's*
 * timezone ("call at 4 pm"), so every comparison converts `now` into that
 * zone first. Comparing against UTC (`toISOString().slice(0, 10)`) is wrong
 * for an Indian org between 00:00 and 05:30 IST, when UTC is still yesterday.
 */

export type DueState = "overdue" | "due_today" | "upcoming";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export interface DueBoundaries {
  /** `YYYY-MM-DD` — today's date in the org timezone. */
  today: string;
  /** `HH:MM:SS` (24h) — the current wall-clock time in the org timezone. */
  nowTime: string;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Today's date and current time as seen by an org in `timezone`. */
export function dueBoundaries(now: Date, timezone: string = DEFAULT_TIMEZONE): DueBoundaries {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    today: `${get("year")}-${get("month")}-${get("day")}`,
    nowTime: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

/** Milliseconds the zone is ahead of UTC at `at` (IST → +19_800_000). */
function zoneOffsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which the wall-clock `date` (`YYYY-MM-DD`) + `time`
 * (`HH:MM`) occurs in `timezone`. This is how a form's "15:00" becomes a
 * stored instant: it means 15:00 *in the organization's zone*, never in the
 * server's (UTC on most hosts) or the browser's.
 *
 * For a time that doesn't exist (skipped by a spring-forward DST change) the
 * result lands just after the gap; for an ambiguous one (repeated in autumn)
 * it picks the first occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, timezone: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const first = guess - zoneOffsetMs(new Date(guess), timezone);
  // Re-check the offset at the candidate instant: a DST change between the
  // guess and the true moment would otherwise be off by an hour.
  const second = guess - zoneOffsetMs(new Date(first), timezone);

  // If `second` doesn't read back as the requested wall-clock time, the time
  // falls in a spring-forward gap; `first` is then the instant just after it.
  const readBack = dueBoundaries(new Date(second), timezone);
  return new Date(readBack.today === date && readBack.nowTime.startsWith(time) ? second : first);
}

/** The UTC instant at which `date` (`YYYY-MM-DD`) begins in `timezone`. */
export function startOfDayUtc(date: string, timezone: string = DEFAULT_TIMEZONE): Date {
  return zonedTimeToUtc(date, "00:00", timezone);
}

/** Today's `[start, end)` as UTC instants, for range queries on timestamptz columns. */
export function localDayBounds(
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): { start: Date; end: Date; today: string } {
  const { today } = dueBoundaries(now, timezone);
  const [y, m, d] = today.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: startOfDayUtc(today, timezone), end: startOfDayUtc(next, timezone), today };
}

/** `date` (`YYYY-MM-DD`) shifted by whole days — calendar arithmetic, no timezone involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. Weeks start on Monday for reporting. */
export function startOfWeekDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dayOfWeek + 6) % 7));
}

/**
 * Overdue means the moment has passed: an earlier date, or today with a time
 * earlier than now. A follow-up due today with no time stays "due today"
 * until the day ends — the salesperson never picked a time to miss.
 */
export function classifyDue(
  due: { date: string; time?: string | null },
  now: Date,
  timezone: string = DEFAULT_TIMEZONE
): DueState {
  const { today, nowTime } = dueBoundaries(now, timezone);

  if (due.date < today) return "overdue";
  if (due.date > today) return "upcoming";

  // Compare at second precision, like the database does: "HH:MM" from a form
  // and "HH:MM:SS" from Postgres both normalize to HH:MM:SS.
  const dueTime = due.time ? (due.time.length === 5 ? `${due.time}:00` : due.time.slice(0, 8)) : null;
  if (dueTime && dueTime < nowTime) return "overdue";
  return "due_today";
}
