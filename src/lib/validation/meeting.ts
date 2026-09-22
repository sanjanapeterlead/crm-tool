import { z } from "zod";

export const meetingFormSchema = z.object({
  lead_id: z.string().uuid(),
  salesperson_id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  // Wall-clock in the organization's timezone; converted to an instant server-side.
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/, "Time is required"),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  /** Create a calendar event (with a Meet link) instead of pasting a link. */
  use_calendar: z.boolean().optional().default(false),
  /** Extra attendees, comma/space separated; validated in the service. */
  guest_emails: z.string().trim().max(600).optional().or(z.literal("")),
  meeting_url: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
  external_booking_url: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type MeetingFormInput = z.input<typeof meetingFormSchema>;
export type MeetingFormParsed = z.output<typeof meetingFormSchema>;

export const meetingStatusSchema = z.object({
  meeting_id: z.string().uuid(),
  status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
});

export const meetingRescheduleSchema = z.object({
  meeting_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/, "Time is required"),
  duration_minutes: z.coerce.number().int().min(5).max(480),
});
