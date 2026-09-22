import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { recordAudit } from "@/lib/services/audit";
import { markConnected, markDisconnected } from "@/lib/services/integration-health";

export interface CalendarConnectionRow {
  id: string;
  org_id: string;
  provider: "google";
  account_email: string;
  calendar_id: string;
  scopes: string[];
  connected_at: string;
}

export async function getCalendarConnection(db: SupabaseClient, orgId: string): Promise<CalendarConnectionRow | null> {
  const { data, error } = await db.from("calendar_connections").select("*").eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(`Failed to load calendar connection: ${error.message}`);
  return (data as CalendarConnectionRow | null) ?? null;
}

/** The org's stored refresh token, decrypted. Service role only: the table has no client access. */
export async function getCalendarCredential(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await admin.from("calendar_tokens").select("refresh_token").eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(`Failed to load calendar credential: ${error.message}`);
  return data?.refresh_token ? decryptSecret(data.refresh_token as string) : null;
}

/** Persists a completed OAuth handshake: the account identity, and the refresh token encrypted at rest. */
export async function saveCalendarConnection(
  admin: SupabaseClient,
  params: { orgId: string; userId: string; accountEmail: string; refreshToken: string; scopes: string[] }
): Promise<void> {
  const { error: connectionError } = await admin.from("calendar_connections").upsert(
    {
      org_id: params.orgId,
      provider: "google",
      account_email: params.accountEmail,
      scopes: params.scopes,
      connected_by: params.userId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (connectionError) throw new Error(`Failed to save calendar connection: ${connectionError.message}`);

  const { error: tokenError } = await admin.from("calendar_tokens").upsert(
    { org_id: params.orgId, refresh_token: encryptSecret(params.refreshToken), updated_at: new Date().toISOString() },
    { onConflict: "org_id" }
  );
  if (tokenError) throw new Error(`Failed to save calendar credential: ${tokenError.message}`);

  await markConnected(admin, params.orgId, "google_calendar");
  await recordAudit(admin, {
    orgId: params.orgId,
    actorId: params.userId,
    action: "integration.connected",
    entityType: "integration",
    entityId: "google_calendar",
    summary: `Connected Google Calendar (${params.accountEmail})`,
  });
}

export async function disconnectCalendar(admin: SupabaseClient, orgId: string, userId: string): Promise<void> {
  await admin.from("calendar_tokens").delete().eq("org_id", orgId);
  const { error } = await admin.from("calendar_connections").delete().eq("org_id", orgId);
  if (error) throw new Error(`Failed to disconnect Google Calendar: ${error.message}`);

  await markDisconnected(admin, orgId, "google_calendar");
  await recordAudit(admin, {
    orgId,
    actorId: userId,
    action: "integration.disconnected",
    entityType: "integration",
    entityId: "google_calendar",
    summary: "Disconnected Google Calendar",
  });
}
