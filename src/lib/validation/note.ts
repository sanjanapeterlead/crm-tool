import { z } from "zod";

export const noteFormSchema = z.object({
  lead_id: z.string().uuid(),
  content: z.string().trim().min(1, "Note cannot be empty").max(5000),
});

export type NoteFormInput = z.infer<typeof noteFormSchema>;
