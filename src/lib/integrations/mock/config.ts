import { mockProvidersEnabled } from "@/lib/integrations/mode";

/**
 * The shared secret that signs `/api/webhooks/mock-lead` deliveries. Returns
 * null when mock providers are off, so the route can answer 404 as though it
 * didn't exist. Outside production a well-known default keeps local demos
 * zero-config; in production the secret must be set explicitly.
 */
export function getMockWebhookSecret(): string | null {
  if (!mockProvidersEnabled()) return null;
  const secret = process.env.MOCK_WEBHOOK_SECRET;
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? null : "dev-mock-webhook-secret";
}
