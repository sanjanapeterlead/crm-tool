"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { RATE_LIMIT_ENV, rateLimitFor } from "@/lib/security/limits";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

const TOO_MANY = "Too many sign-in attempts. Please wait a few minutes and try again.";

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Never trust the target: an absolute URL here is an open redirect.
  const redirectTo = safeRedirectPath(String(formData.get("redirectTo") ?? "/"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Slow down credential stuffing: per address, and per account (so one target
  // can't be hammered from many addresses). The email is hashed in the key so
  // the limiter table never holds a plaintext address.
  const admin = createAdminClient();
  const ip = clientIp(await headers());
  const emailKey = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24);
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(admin, { key: `login:ip:${ip}`, limit: rateLimitFor(RATE_LIMIT_ENV.loginPerIp), windowSeconds: 600 }),
    checkRateLimit(admin, { key: `login:email:${emailKey}`, limit: rateLimitFor(RATE_LIMIT_ENV.loginPerEmail), windowSeconds: 600 }),
  ]);
  if (!byIp.allowed || !byEmail.allowed) return { error: TOO_MANY };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  redirect(redirectTo);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
