import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetaConfig } from "@/lib/integrations/meta/config";
import { getMockWebhookSecret } from "@/lib/integrations/mock/config";
import { mockProvidersEnabled } from "@/lib/integrations/mode";
import { MetaCloudWhatsAppProvider } from "@/lib/integrations/whatsapp/cloud-adapter";
import { MockWhatsAppProvider } from "@/lib/integrations/whatsapp/mock-adapter";
import type { WhatsAppProvider } from "@/lib/ports/whatsapp";
import type { WhatsAppRuntime } from "@/lib/services/conversations";
import { getConnection, getUserToken } from "@/lib/services/whatsapp";

/**
 * The composition root for WhatsApp: the one place that decides which adapter
 * an organization uses (docs/ARCHITECTURE.md, DECISIONS D-017).
 *
 *  - The org connected a real number and the Meta app is configured → the
 *    official Cloud API adapter ("live").
 *  - Otherwise, if mock providers are enabled → the mock ("demo"), so the whole
 *    product can be evaluated without credentials.
 *  - Otherwise → null: WhatsApp is genuinely unavailable and the UI says so.
 *
 * A demo is never chosen silently in production — `mockProvidersEnabled()` is
 * off there unless someone turned it on.
 */
export async function resolveWhatsApp(admin: SupabaseClient, orgId: string): Promise<WhatsAppRuntime | null> {
  const connection = await getConnection(admin, orgId);

  if (connection?.phone_number_id) {
    const config = getMetaConfig();
    const token = config ? await getUserToken(admin, orgId) : null;
    if (config && token) {
      return {
        provider: new MetaCloudWhatsAppProvider(config),
        connection: { phoneNumberId: connection.phone_number_id, accessToken: token },
        mode: "live",
      };
    }
    // Connected on paper but unusable (missing app config or token): fall through
    // to demo only if mocks are on; otherwise report unavailable rather than pretend.
  }

  if (mockProvidersEnabled()) {
    const secret = getMockWebhookSecret() ?? "unused-in-send-path";
    return {
      provider: new MockWhatsAppProvider(secret),
      connection: { phoneNumberId: `mock:${orgId}`, accessToken: "mock" },
      mode: "demo",
    };
  }

  return null;
}

/** Every provider whose webhook signature this deployment can verify, tried in order. */
export function whatsappWebhookProviders(): WhatsAppProvider[] {
  const providers: WhatsAppProvider[] = [];

  const config = getMetaConfig();
  if (config) providers.push(new MetaCloudWhatsAppProvider(config));

  const mockSecret = getMockWebhookSecret();
  if (mockSecret) providers.push(new MockWhatsAppProvider(mockSecret));

  return providers;
}

export type WhatsAppMode = "live" | "demo" | "unavailable";

/**
 * Which mode WhatsApp is in for an org, for the UI — without reading the
 * access token. Mirrors `resolveWhatsApp`'s decision; safe to call with an
 * ordinary (RLS-scoped) client because it only reads the org's connection row.
 */
export async function whatsappMode(db: SupabaseClient, orgId: string): Promise<WhatsAppMode> {
  const connection = await getConnection(db, orgId);
  if (connection?.phone_number_id && getMetaConfig()) return "live";
  return mockProvidersEnabled() ? "demo" : "unavailable";
}
