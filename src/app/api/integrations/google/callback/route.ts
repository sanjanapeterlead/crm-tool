import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { GoogleCalendarClient } from "@/lib/integrations/google/client";
import { getGoogleConfig } from "@/lib/integrations/google/config";
import { logger } from "@/lib/observability/logger";
import { verifySignedState } from "@/lib/security/oauth-state";
import { saveCalendarConnection } from "@/lib/services/calendar-connections";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/settings/integrations/google";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL(SETTINGS_PATH, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const config = getGoogleConfig();
  if (!config) return back(request, { error: "not_configured" });

  const params = request.nextUrl.searchParams;

  // The admin declined Google's consent screen.
  if (params.get("error")) return back(request, { error: "denied" });

  const code = params.get("code");
  if (!code) return back(request, { error: "missing_code" });

  const state = verifySignedState(config.clientSecret, params.get("state"));
  if (!state) return back(request, { error: "invalid_state" });

  // The signed state says which org started the flow; confirm the person
  // finishing it is still that same signed-in admin.
  const session = await requireRole(["admin"]);
  if (session.orgId !== state.orgId || session.user.id !== state.userId) {
    return back(request, { error: "state_mismatch" });
  }

  try {
    const google = new GoogleCalendarClient(config);
    const tokens = await google.exchangeCode(code);

    // Google only returns a refresh token on first consent; `prompt=consent`
    // forces it, so its absence means the flow was tampered with or misconfigured.
    if (!tokens.refreshToken) return back(request, { error: "no_refresh_token" });
    if (!tokens.scopes.some((scope) => scope.endsWith("/calendar.events"))) return back(request, { error: "missing_scope" });

    const accountEmail = await google.getAccountEmail(tokens.accessToken);

    await saveCalendarConnection(createAdminClient(), {
      orgId: session.orgId,
      userId: session.user.id,
      accountEmail,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
    });
    return back(request, { connected: "1" });
  } catch (error) {
    logger.error("google.oauth_failed", { orgId: session.orgId, error });
    return back(request, { error: "exchange_failed" });
  }
}
