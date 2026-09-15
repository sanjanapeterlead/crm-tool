import { z } from "zod";

export const followupFormSchema = z.object({
  lead_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  due_date: z.string().min(1, "Date is required"),
  due_time: z.string().optional().or(z.literal("")),
  description: z.string().trim().min(1, "Description is required").max(1000),
});

export type FollowupFormInput = z.infer<typeof followupFormSchema>;

export const followupStatusSchema = z.object({
  followup_id: z.string().uuid(),
  status: z.enum(["pending", "completed", "cancelled"]),
});
