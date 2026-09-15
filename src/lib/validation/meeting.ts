import { z } from "zod";

export const meetingFormSchema = z.object({
  lead_id: z.string().uuid(),
  salesperson_id: z.string().uuid().optional().or(z.literal("")),
  scheduled_date: z.string().min(1, "Date is required"),
  scheduled_time: z.string().min(1, "Time is required"),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  meeting_url: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
  external_booking_url: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type MeetingFormInput = z.infer<typeof meetingFormSchema>;

export const meetingStatusSchema = z.object({
  meeting_id: z.string().uuid(),
  status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
});
