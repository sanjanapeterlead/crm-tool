import "server-only";

/**
 * Meta app credentials. These are app-level (one Meta app serves every org);
 * per-org access tokens live in the database instead.
 */
export interface MetaConfig {
  appId: string;
  appSecret: string;
  /** Shared secret echoed back during Meta's webhook verification handshake. */
  webhookVerifyToken: string;
  graphVersion: string;
  /** Public origin of this deployment, used to build the OAuth redirect URI. */
  appUrl: string;
}

export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "leads_retrieval",
  "ads_read",
] as const;

function readAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  // Vercel sets this for preview and production deployments.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/**
 * Returns null when the Meta app isn't configured, so the Settings UI can
 * explain what's missing instead of the app crashing at import time.
 */
export function getMetaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!appId || !appSecret || !webhookVerifyToken) return null;

  return {
    appId,
    appSecret,
    webhookVerifyToken,
    graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
    appUrl: readAppUrl(),
  };
}

export function requireMetaConfig(): MetaConfig {
  const config = getMetaConfig();
  if (!config) {
    throw new Error(
      "Meta Ads integration is not configured. Set META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN."
    );
  }
  return config;
}

export function getOAuthRedirectUri(config: MetaConfig): string {
  return `${config.appUrl}/api/integrations/meta/callback`;
}

export function getWebhookUrl(config: MetaConfig): string {
  return `${config.appUrl}/api/webhooks/meta`;
}
