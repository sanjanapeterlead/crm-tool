import "server-only";
import { getMetaConfig, type MetaConfig } from "@/lib/integrations/meta/config";

/**
 * WhatsApp sends through the same Meta app (App ID/Secret) as the Ads
 * integration — Facebook Login for Business grants scopes per-product on one
 * token, so there is one app to configure in the Meta Dashboard, not two.
 */
export { getMetaConfig as getWhatsAppMetaConfig };
export type { MetaConfig };

export const WHATSAPP_OAUTH_SCOPES = [
  "business_management",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
] as const;

/**
 * `getMetaConfig()` also requires META_WEBHOOK_VERIFY_TOKEN even though
 * WhatsApp sending has no webhook of its own — that variable exists for the
 * Meta Ads webhook, and the two integrations share one Meta app's config.
 * Set all three even if only WhatsApp is wanted.
 */
export function requireWhatsAppConfig(): MetaConfig {
  const config = getMetaConfig();
  if (!config) {
    throw new Error(
      "WhatsApp is not configured. Set META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN."
    );
  }
  return config;
}

export function getWhatsAppOAuthRedirectUri(config: MetaConfig): string {
  return `${config.appUrl}/api/integrations/whatsapp/callback`;
}
