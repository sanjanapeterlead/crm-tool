import { z } from "zod";

export const FOLLOWUP_TYPES = ["follow_up", "call", "whatsapp", "meeting", "other"] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];

export const FOLLOWUP_TYPE_LABELS: Record<FollowupType, string> = {
  follow_up: "Follow-up",
  call: "Call",
  whatsapp: "WhatsApp",
  meeting: "Meeting",
  other: "Other",
};

export const followupFormSchema = z.object({
  lead_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  type: z.enum(FOLLOWUP_TYPES).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
    .optional()
    .or(z.literal("")),
  description: z.string().trim().min(1, "Description is required").max(1000),
});

export type FollowupFormInput = z.infer<typeof followupFormSchema>;

export const followupStatusSchema = z.object({
  followup_id: z.string().uuid(),
  status: z.enum(["pending", "completed", "cancelled"]),
});
