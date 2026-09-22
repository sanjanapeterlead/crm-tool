import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { GoogleCalendarClient } from "@/lib/integrations/google/client";
import { getGoogleConfig } from "@/lib/integrations/google/config";
import { createSignedState } from "@/lib/security/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts the Google OAuth flow for the signed-in admin's organization. */
export async function GET() {
  const session = await requireRole(["admin"]);

  const config = getGoogleConfig();
  if (!config) redirect("/settings/integrations/google?error=not_configured");

  const state = createSignedState(config.clientSecret, session.orgId, session.user.id);
  redirect(new GoogleCalendarClient(config).authorizeUrl(state));
}
