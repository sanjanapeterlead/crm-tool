import { z } from "zod";

export const signupSchema = z.object({
  orgName: z.string().trim().min(2, "Organization name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  role: z.enum(["manager", "salesperson"]),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const roleChangeSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "manager", "salesperson"]),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, { message: "The passwords don't match.", path: ["confirm"] });
