import { z } from "zod";

export const leadSourceSchema = z.enum([
  "Facebook Ad",
  "Instagram",
  "Referral",
  "Website",
  "Manual",
  "Other",
]);

export const leadFormSchema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required").max(100),
    last_name: z.string().trim().max(100).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
    source: leadSourceSchema,
    assigned_to: z.string().uuid().optional().or(z.literal("")),
    status_id: z.string().uuid().optional(),
  })
  .refine((data) => (data.phone && data.phone.length > 0) || (data.email && data.email.length > 0), {
    message: "Provide at least a phone number or an email",
    path: ["phone"],
  });

export type LeadFormInput = z.infer<typeof leadFormSchema>;

export const leadStatusChangeSchema = z.object({
  lead_id: z.string().uuid(),
  status_id: z.string().uuid(),
});

export const leadAssignSchema = z.object({
  lead_id: z.string().uuid(),
  assigned_to: z.string().uuid(),
});
