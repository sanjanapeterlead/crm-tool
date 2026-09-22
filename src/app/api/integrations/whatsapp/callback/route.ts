import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { createOAuthGraphClient } from "@/lib/integrations/whatsapp/client";
import { getWhatsAppMetaConfig, getWhatsAppOAuthRedirectUri, WHATSAPP_OAUTH_SCOPES } from "@/lib/integrations/whatsapp/config";
import { verifyOAuthState } from "@/lib/integrations/whatsapp/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveConnection } from "@/lib/services/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/settings/integrations/whatsapp";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL(SETTINGS_PATH, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const config = getWhatsAppMetaConfig();
  if (!config) return back(request, { error: "not_configured" });

  const params = request.nextUrl.searchParams;

  if (params.get("error")) {
    return back(request, {
      error: "denied",
      detail: params.get("error_description") ?? params.get("error") ?? "",
    });
  }

  const code = params.get("code");
  if (!code) return back(request, { error: "missing_code" });

  const state = verifyOAuthState(config, params.get("state"));
  if (!state) return back(request, { error: "invalid_state" });

  const session = await requireRole(["admin"]);
  if (session.orgId !== state.orgId || session.user.id !== state.userId) {
    return back(request, { error: "state_mismatch" });
  }

  try {
    const oauthClient = createOAuthGraphClient(config);

    const shortLived = await oauthClient.exchangeCodeForToken(code, getWhatsAppOAuthRedirectUri(config));
    const longLived = await oauthClient.exchangeForLongLivedToken(shortLived.access_token);
    const me = await oauthClient.getMe(longLived.access_token);

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    const admin = createAdminClient();
    const { candidateCount } = await saveConnection(admin, {
      orgId: session.orgId,
      userId: session.user.id,
      metaUserId: me.id,
      metaUserName: me.name ?? null,
      userAccessToken: longLived.access_token,
      tokenExpiresAt: expiresAt,
      scopes: [...WHATSAPP_OAUTH_SCOPES],
    });

    if (candidateCount === 0) {
      return back(request, { error: "no_numbers" });
    }
    if (candidateCount > 1) {
      return back(request, { connected: "1", select_number: "1" });
    }
    return back(request, { connected: "1" });
  } catch (e) {
    return back(request, {
      error: "exchange_failed",
      detail: e instanceof Error ? e.message : "Unknown error",
    });
  }
}
