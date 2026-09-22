import { z } from "zod";
import { isValidTimezone } from "@/lib/domain/due";

/** Zones offered in the picker; any valid IANA name is accepted by the server. */
export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
] as const;

export const settingsSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(120),
  calendly_booking_url: z
    .string()
    .trim()
    .max(500)
    .url("Enter a valid URL")
    .nullable()
    .or(z.literal("").transform(() => null)),
  timezone: z.string().refine(isValidTimezone, "Choose a valid timezone"),
});

export type SettingsInput = z.input<typeof settingsSchema>;
