import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getMetaConfig } from "@/lib/integrations/meta/config";
import { buildAuthorizeUrl, createOAuthState } from "@/lib/integrations/meta/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts the Facebook OAuth flow for the signed-in admin's organization. */
export async function GET() {
  const session = await requireRole(["admin"]);

  const config = getMetaConfig();
  if (!config) {
    redirect("/settings/integrations/meta?error=not_configured");
  }

  const state = createOAuthState(config, session.orgId, session.user.id);
  redirect(buildAuthorizeUrl(config, state));
}
