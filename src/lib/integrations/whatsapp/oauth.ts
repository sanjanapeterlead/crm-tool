import "server-only";
import { createOAuthState, verifyOAuthState } from "@/lib/integrations/meta/oauth";
import { getWhatsAppOAuthRedirectUri, WHATSAPP_OAUTH_SCOPES } from "./config";
import type { MetaConfig } from "./config";

// State signing is a generic HMAC over {orgId, userId, nonce, issuedAt} with
// no product-specific fields, so the Ads OAuth flow's implementation is
// reused as-is rather than re-signing the same shape a second way.
export { createOAuthState, verifyOAuthState };

export function buildWhatsAppAuthorizeUrl(config: MetaConfig, state: string): string {
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", getWhatsAppOAuthRedirectUri(config));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", WHATSAPP_OAUTH_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}
