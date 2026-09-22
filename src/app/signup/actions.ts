"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signupEnabled } from "@/lib/auth/signup-gate";
import { UserError } from "@/lib/domain/errors";
import { logger } from "@/lib/observability/logger";
import { RATE_LIMIT_ENV, rateLimitFor } from "@/lib/security/limits";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";
import { createOrganizationWithAdmin } from "@/lib/services/organizations";
import { createAdminClient } from "@/lib/supabase/admin";
import { signupSchema } from "@/lib/validation/auth";

export interface SignupState {
  error?: string;
}

export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  if (!signupEnabled()) return { error: "Sign-up is closed. Ask your administrator for an invitation." };

  const parsed = signupSchema.safeParse({
    orgName: formData.get("orgName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createAdminClient();

  // Creating an organization is the one unauthenticated action that writes a
  // lot (an auth user, an org, a pipeline), so it's the one to throttle hardest.
  // Fails closed: if the limiter is down, don't open the door.
  const limit = await checkRateLimit(
    admin,
    { key: `signup:ip:${clientIp(await headers())}`, limit: rateLimitFor(RATE_LIMIT_ENV.signupPerIp), windowSeconds: 3600 },
    { failOpen: false }
  );
  if (!limit.allowed) return { error: "Too many sign-up attempts from your network. Please try again later." };

  try {
    await createOrganizationWithAdmin(admin, parsed.data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create your organization.";
    // Supabase's own error text when the email is already registered.
    if (message.toLowerCase().includes("already been registered")) {
      return { error: "An account with that email already exists. Try signing in instead." };
    }
    if (e instanceof UserError) return { error: e.message };
    // Anything else is ours to fix, not the visitor's to read (constraint names, table columns…).
    logger.error("signup.failed", { error: e });
    return { error: "We couldn't create your organization. Please try again." };
  }

  redirect(`/login?signedUp=1&email=${encodeURIComponent(parsed.data.email)}`);
}
