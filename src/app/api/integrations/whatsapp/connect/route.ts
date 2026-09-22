import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getWhatsAppMetaConfig } from "@/lib/integrations/whatsapp/config";
import { buildWhatsAppAuthorizeUrl, createOAuthState } from "@/lib/integrations/whatsapp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts the Facebook OAuth flow for WhatsApp, for the signed-in admin's organization. */
export async function GET() {
  const session = await requireRole(["admin"]);

  const config = getWhatsAppMetaConfig();
  if (!config) {
    redirect("/settings/integrations/whatsapp?error=not_configured");
  }

  const state = createOAuthState(config, session.orgId, session.user.id);
  redirect(buildWhatsAppAuthorizeUrl(config, state));
}
