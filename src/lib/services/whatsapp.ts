import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WhatsAppGraphClient, WhatsAppApiError } from "@/lib/integrations/whatsapp/client";
import { requireWhatsAppConfig } from "@/lib/integrations/whatsapp/config";
import { countVariables, getBodyText } from "@/lib/integrations/whatsapp/mapping";
import type { WhatsAppBusiness, WhatsAppBusinessAccount, WhatsAppPhoneNumber } from "@/lib/integrations/whatsapp/types";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

export { WhatsAppApiError };

export interface WhatsAppConnection {
  id: string;
  org_id: string;
  meta_user_id: string;
  meta_user_name: string | null;
  scopes: string[];
  token_expires_at: string | null;
  business_id: string | null;
  business_name: string | null;
  waba_id: string | null;
  waba_name: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  connected_at: string;
}

export interface WhatsAppAvailableNumber {
  id: string;
  org_id: string;
  business_id: string;
  business_name: string | null;
  waba_id: string;
  waba_name: string | null;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
}

export interface WhatsAppTemplateRow {
  id: string;
  org_id: string;
  template_id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  body_text: string;
  variable_count: number;
}

export function createGraphClient() {
  return new WhatsAppGraphClient(requireWhatsAppConfig());
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export async function getConnection(
  supabase: SupabaseClient,
  orgId: string
): Promise<WhatsAppConnection | null> {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load WhatsApp connection: ${error.message}`);
  return (data as WhatsAppConnection | null) ?? null;
}

export async function listAvailableNumbers(
  supabase: SupabaseClient,
  orgId: string
): Promise<WhatsAppAvailableNumber[]> {
  const { data, error } = await supabase
    .from("whatsapp_available_numbers")
    .select("*")
    .eq("org_id", orgId)
    .order("discovered_at");

  if (error) throw new Error(`Failed to load available numbers: ${error.message}`);
  return (data ?? []) as WhatsAppAvailableNumber[];
}

interface DiscoveredCandidate {
  business: WhatsAppBusiness;
  waba: WhatsAppBusinessAccount;
  phone: WhatsAppPhoneNumber;
}

async function discoverCandidates(
  graph: WhatsAppGraphClient,
  userAccessToken: string
): Promise<DiscoveredCandidate[]> {
  const businesses = await graph.listBusinesses(userAccessToken);
  const candidates: DiscoveredCandidate[] = [];

  for (const business of businesses) {
    const wabas = await graph.listOwnedWabas(business.id, userAccessToken);
    for (const waba of wabas) {
      const phones = await graph.listPhoneNumbers(waba.id, userAccessToken);
      for (const phone of phones) {
        candidates.push({ business, waba, phone });
      }
    }
  }

  return candidates;
}

/**
 * Persists a completed OAuth handshake: the long-lived token, account
 * identity, and every WABA/number the user granted access to. When exactly
 * one candidate is found it's auto-selected as the active sender; otherwise
 * the admin resolves it from `whatsapp_available_numbers` in Settings.
 */
export async function saveConnection(
  admin: SupabaseClient,
  params: {
    orgId: string;
    userId: string;
    metaUserId: string;
    metaUserName: string | null;
    userAccessToken: string;
    tokenExpiresAt: string | null;
    scopes: string[];
  }
): Promise<{ candidateCount: number }> {
  const graph = createGraphClient();
  const candidates = await discoverCandidates(graph, params.userAccessToken);

  const autoSelected = candidates.length === 1 ? candidates[0] : null;

  const { error: connectionError } = await admin.from("whatsapp_connections").upsert(
    {
      org_id: params.orgId,
      meta_user_id: params.metaUserId,
      meta_user_name: params.metaUserName,
      scopes: params.scopes,
      token_expires_at: params.tokenExpiresAt,
      business_id: autoSelected?.business.id ?? null,
      business_name: autoSelected?.business.name ?? null,
      waba_id: autoSelected?.waba.id ?? null,
      waba_name: autoSelected?.waba.name ?? null,
      phone_number_id: autoSelected?.phone.id ?? null,
      display_phone_number: autoSelected?.phone.display_phone_number ?? null,
      verified_name: autoSelected?.phone.verified_name ?? null,
      connected_by: params.userId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (connectionError) throw new Error(`Failed to save connection: ${connectionError.message}`);

  const { error: tokenError } = await admin.from("whatsapp_user_tokens").upsert(
    {
      org_id: params.orgId,
      user_access_token: encryptSecret(params.userAccessToken),
      expires_at: params.tokenExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (tokenError) throw new Error(`Failed to save user token: ${tokenError.message}`);

  // Replace the candidate list wholesale — simpler and safer than diffing,
  // and this only runs on connect/reconnect, not on any hot path.
  await admin.from("whatsapp_available_numbers").delete().eq("org_id", params.orgId);
  if (candidates.length > 0) {
    const { error: candidatesError } = await admin.from("whatsapp_available_numbers").insert(
      candidates.map((c) => ({
        org_id: params.orgId,
        business_id: c.business.id,
        business_name: c.business.name,
        waba_id: c.waba.id,
        waba_name: c.waba.name,
        phone_number_id: c.phone.id,
        display_phone_number: c.phone.display_phone_number,
        verified_name: c.phone.verified_name,
      }))
    );
    if (candidatesError) {
      throw new Error(`Failed to save discovered numbers: ${candidatesError.message}`);
    }
  }

  return { candidateCount: candidates.length };
}

export async function selectActiveNumber(
  admin: SupabaseClient,
  orgId: string,
  phoneNumberId: string
): Promise<void> {
  const { data: candidate, error: lookupError } = await admin
    .from("whatsapp_available_numbers")
    .select("*")
    .eq("org_id", orgId)
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (lookupError) throw new Error(`Failed to look up number: ${lookupError.message}`);
  if (!candidate) throw new Error("That number was not discovered for this organization.");

  const { error } = await admin
    .from("whatsapp_connections")
    .update({
      business_id: candidate.business_id,
      business_name: candidate.business_name,
      waba_id: candidate.waba_id,
      waba_name: candidate.waba_name,
      phone_number_id: candidate.phone_number_id,
      display_phone_number: candidate.display_phone_number,
      verified_name: candidate.verified_name,
    })
    .eq("org_id", orgId);

  if (error) throw new Error(`Failed to select number: ${error.message}`);
}

export async function disconnect(admin: SupabaseClient, orgId: string): Promise<void> {
  await admin.from("whatsapp_user_tokens").delete().eq("org_id", orgId);
  await admin.from("whatsapp_available_numbers").delete().eq("org_id", orgId);
  await admin.from("whatsapp_templates").delete().eq("org_id", orgId);
  const { error } = await admin.from("whatsapp_connections").delete().eq("org_id", orgId);
  if (error) throw new Error(`Failed to disconnect: ${error.message}`);
}

export async function getUserToken(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("whatsapp_user_tokens")
    .select("user_access_token")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load access token: ${error.message}`);
  return data?.user_access_token ? decryptSecret(data.user_access_token) : null;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function syncTemplates(
  admin: SupabaseClient,
  orgId: string
): Promise<{ synced: number }> {
  const connection = await getConnection(admin, orgId);
  if (!connection?.waba_id) {
    throw new Error("Connect WhatsApp and select a number before syncing templates.");
  }

  const token = await getUserToken(admin, orgId);
  if (!token) throw new Error("No access token. Reconnect WhatsApp.");

  const graph = createGraphClient();
  const templates = await graph.listMessageTemplates(connection.waba_id, token);

  let synced = 0;
  for (const template of templates) {
    const bodyText = getBodyText(template);
    const header = template.components?.find((c) => c.type === "HEADER");
    const footer = template.components?.find((c) => c.type === "FOOTER");

    const { error } = await admin.from("whatsapp_templates").upsert(
      {
        org_id: orgId,
        template_id: template.id,
        name: template.name,
        language: template.language,
        category: template.category ?? null,
        status: template.status,
        header_type: header?.format ?? null,
        header_text: header?.text ?? null,
        body_text: bodyText,
        footer_text: footer?.text ?? null,
        components: template.components ?? [],
        variable_count: countVariables(bodyText),
        synced_at: new Date().toISOString(),
      },
      { onConflict: "org_id,name,language" }
    );
    if (error) throw new Error(`Failed to save template ${template.name}: ${error.message}`);
    synced += 1;
  }

  return { synced };
}

export async function listTemplates(
  supabase: SupabaseClient,
  orgId: string
): Promise<WhatsAppTemplateRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("org_id", orgId)
    .order("name");

  if (error) throw new Error(`Failed to load templates: ${error.message}`);
  return (data ?? []) as WhatsAppTemplateRow[];
}
