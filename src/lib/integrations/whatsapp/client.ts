import "server-only";
import { appSecretProof } from "@/lib/security/signature";
import { MetaGraphClient, MetaApiError } from "@/lib/integrations/meta/client";
import type { MetaConfig } from "./config";
import type {
  WhatsAppBusiness,
  WhatsAppBusinessAccount,
  WhatsAppErrorResponse,
  WhatsAppPhoneNumber,
  WhatsAppSendResponse,
  WhatsAppTemplate,
} from "./types";

export { MetaApiError as WhatsAppApiError };

interface ListResponse<T> {
  data: T[];
}

/**
 * Graph API surface specific to WhatsApp discovery and sending. OAuth code
 * exchange is identical to the Ads flow's (same `/oauth/access_token`
 * endpoint, nothing product-specific) — construct a `MetaGraphClient` for
 * that step rather than duplicating it here.
 */
export class WhatsAppGraphClient {
  constructor(private readonly config: MetaConfig) {}

  private get baseUrl() {
    return `https://graph.facebook.com/${this.config.graphVersion}`;
  }

  private async request<T>(
    path: string,
    accessToken: string,
    params: Record<string, string> = {},
    init?: RequestInit
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("appsecret_proof", appSecretProof(accessToken, this.config.appSecret));

    const response = await fetch(url, { ...init, cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as T & WhatsAppErrorResponse;

    if (!response.ok || body.error) {
      const error = body.error;
      throw new MetaApiError(
        error?.message ?? `Graph API request failed with status ${response.status}`,
        response.status,
        error?.code,
        error?.error_subcode
      );
    }

    return body as T;
  }

  /** Business Manager accounts the connecting user administers. */
  async listBusinesses(userAccessToken: string): Promise<WhatsAppBusiness[]> {
    const body = await this.request<ListResponse<WhatsAppBusiness>>("me/businesses", userAccessToken, {
      fields: "id,name",
      limit: "50",
    });
    return body.data ?? [];
  }

  async listOwnedWabas(businessId: string, userAccessToken: string): Promise<WhatsAppBusinessAccount[]> {
    const body = await this.request<ListResponse<WhatsAppBusinessAccount>>(
      `${businessId}/owned_whatsapp_business_accounts`,
      userAccessToken,
      { fields: "id,name", limit: "50" }
    );
    return body.data ?? [];
  }

  async listPhoneNumbers(wabaId: string, userAccessToken: string): Promise<WhatsAppPhoneNumber[]> {
    const body = await this.request<ListResponse<WhatsAppPhoneNumber>>(
      `${wabaId}/phone_numbers`,
      userAccessToken,
      { fields: "id,display_phone_number,verified_name,quality_rating", limit: "50" }
    );
    return body.data ?? [];
  }

  async listMessageTemplates(wabaId: string, userAccessToken: string): Promise<WhatsAppTemplate[]> {
    const body = await this.request<ListResponse<WhatsAppTemplate>>(
      `${wabaId}/message_templates`,
      userAccessToken,
      { fields: "id,name,language,category,status,components", limit: "200" }
    );
    return body.data ?? [];
  }

  /**
   * Sends an approved template message. The org's long-lived user token is
   * used directly against the phone number id — WhatsApp phone numbers don't
   * have their own separate access token the way Facebook Pages do.
   */
  async sendTemplateMessage(
    phoneNumberId: string,
    userAccessToken: string,
    payload: {
      to: string;
      templateName: string;
      languageCode: string;
      bodyParameters: string[];
    }
  ): Promise<WhatsAppSendResponse> {
    const components =
      payload.bodyParameters.length > 0
        ? [
            {
              type: "body",
              parameters: payload.bodyParameters.map((text) => ({ type: "text", text })),
            },
          ]
        : [];

    return this.request<WhatsAppSendResponse>(
      `${phoneNumberId}/messages`,
      userAccessToken,
      {},
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: payload.to,
          type: "template",
          template: {
            name: payload.templateName,
            language: { code: payload.languageCode },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      }
    );
  }

  /**
   * Sends a free-form text message. WhatsApp only accepts these inside the
   * 24-hour customer-service window; outside it the API answers error 131047.
   */
  async sendTextMessage(
    phoneNumberId: string,
    userAccessToken: string,
    payload: { to: string; body: string }
  ): Promise<WhatsAppSendResponse> {
    return this.request<WhatsAppSendResponse>(
      `${phoneNumberId}/messages`,
      userAccessToken,
      {},
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: payload.to,
          type: "text",
          text: { body: payload.body, preview_url: false },
        }),
      }
    );
  }
}

export function createOAuthGraphClient(config: MetaConfig) {
  return new MetaGraphClient(config);
}
