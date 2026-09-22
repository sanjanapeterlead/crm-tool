"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { RATE_LIMIT_ENV, rateLimitFor } from "@/lib/security/limits";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
}

/**
 * Sends a password-reset email. The answer is the same whether or not the
 * address has an account — otherwise this form is a free way to find out who
 * uses the product — and both the request and the outgoing email are
 * rate-limited, since each one sends mail from our domain.
 */
export async function requestPasswordReset(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email." };

  const admin = createAdminClient();
  const ip = clientIp(await headers());
  const emailKey = createHash("sha256").update(parsed.data.email.toLowerCase()).digest("hex").slice(0, 24);

  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(admin, { key: `reset:ip:${ip}`, limit: rateLimitFor(RATE_LIMIT_ENV.resetPerIp), windowSeconds: 3600 }, { failOpen: false }),
    checkRateLimit(admin, { key: `reset:email:${emailKey}`, limit: rateLimitFor(RATE_LIMIT_ENV.resetPerEmail), windowSeconds: 3600 }, { failOpen: false }),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return { error: "Too many reset requests. Please wait a while before trying again." };
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const supabase = await createClient();
  // The result is deliberately ignored: success and "no such user" look identical.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${origin}/auth/confirm?next=/reset-password` });

  return { sent: true };
}
