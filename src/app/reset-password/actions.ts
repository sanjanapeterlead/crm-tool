"use server";

import { redirect } from "next/navigation";
import { logger } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validation/auth";

export interface ResetPasswordState {
  error?: string;
}

/** Sets a new password for the person the emailed link signed in. */
export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No session means the link expired or was opened in another browser.
  if (!user) redirect("/forgot-password?error=expired");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("password_reset.failed", { message: error.message });
    return { error: "We couldn't update your password. It may be too weak or the same as your current one." };
  }

  redirect("/");
}
