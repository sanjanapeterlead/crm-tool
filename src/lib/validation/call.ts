import { z } from "zod";
import { CALL_OUTCOMES } from "@/lib/domain/calls";
import { followupFormSchema } from "@/lib/validation/followup";

/** The next follow-up a salesperson can set in the same breath as logging a call. */
const nextFollowupSchema = followupFormSchema.omit({ lead_id: true });

export const callLogSchema = z.object({
  lead_id: z.string().uuid(),
  outcome: z.enum(CALL_OUTCOMES),
  /** Whole minutes, as people think of call length; stored as seconds. */
  duration_minutes: z.number().int().min(0).max(1440).nullable().optional(),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  next_followup: nextFollowupSchema.optional(),
});

export type CallLogInput = z.infer<typeof callLogSchema>;
