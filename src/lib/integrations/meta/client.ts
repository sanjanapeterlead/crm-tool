import "server-only";
import { appSecretProof } from "@/lib/security/signature";
import type { MetaConfig } from "./config";
import type {
  MetaErrorResponse,
  MetaLead,
  MetaLeadForm,
  MetaListResponse,
  MetaPage,
  MetaTokenResponse,
} from "./types";

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  /** True when Meta says the token is expired, revoked, or invalid. */
  get isAuthError() {
    return this.status === 401 || this.code === 190 || this.code === 102;
  }
}

/**
 * Thin typed wrapper over the Graph API. Every call carries an
 * `appsecret_proof`, and Next's fetch cache is bypassed because all of these
 * reads are request-specific and must never be served stale.
 */
export class MetaGraphClient {
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
    const body = (await response.json().catch(() => ({}))) as T & MetaErrorResponse;

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

  /** Exchanges an OAuth `code` for a short-lived user access token. */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<MetaTokenResponse> {
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code", code);

    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as MetaTokenResponse & MetaErrorResponse;

    if (!response.ok || body.error) {
      throw new MetaApiError(
        body.error?.message ?? "Failed to exchange authorization code",
        response.status,
        body.error?.code
      );
    }
    return body;
  }

  /**
   * Upgrades a short-lived user token to a long-lived one (~60 days). Page
   * tokens derived from a long-lived user token do not themselves expire.
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("fb_exchange_token", shortLivedToken);

    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as MetaTokenResponse & MetaErrorResponse;

    if (!response.ok || body.error) {
      throw new MetaApiError(
        body.error?.message ?? "Failed to obtain a long-lived token",
        response.status,
        body.error?.code
      );
    }
    return body;
  }

  async getMe(userAccessToken: string): Promise<{ id: string; name?: string }> {
    return this.request("me", userAccessToken, { fields: "id,name" });
  }

  /** Pages the connecting user administers, each with its own access token. */
  async listPages(userAccessToken: string): Promise<MetaPage[]> {
    const body = await this.request<MetaListResponse<MetaPage>>("me/accounts", userAccessToken, {
      fields: "id,name,access_token,instagram_business_account",
      limit: "100",
    });
    return body.data ?? [];
  }

  /** Subscribes our app to a Page's `leadgen` events. */
  async subscribePageToLeadgen(pageId: string, pageAccessToken: string): Promise<void> {
    await this.request(
      `${pageId}/subscribed_apps`,
      pageAccessToken,
      { subscribed_fields: "leadgen" },
      { method: "POST" }
    );
  }

  async unsubscribePage(pageId: string, pageAccessToken: string): Promise<void> {
    await this.request(`${pageId}/subscribed_apps`, pageAccessToken, {}, { method: "DELETE" });
  }

  async listLeadForms(pageId: string, pageAccessToken: string): Promise<MetaLeadForm[]> {
    const body = await this.request<MetaListResponse<MetaLeadForm>>(
      `${pageId}/leadgen_forms`,
      pageAccessToken,
      { fields: "id,name,status,leads_count", limit: "100" }
    );
    return body.data ?? [];
  }

  private static readonly LEAD_FIELDS =
    "id,created_time,field_data,form_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,platform,is_organic";

  /** Fetches a single lead's answers. The webhook payload never includes these. */
  async getLead(leadgenId: string, pageAccessToken: string): Promise<MetaLead> {
    return this.request<MetaLead>(leadgenId, pageAccessToken, {
      fields: MetaGraphClient.LEAD_FIELDS,
    });
  }

  /** One page of historical leads for a form, for backfill. */
  async listFormLeads(
    formId: string,
    pageAccessToken: string,
    options: { after?: string; limit?: number } = {}
  ): Promise<{ leads: MetaLead[]; nextCursor: string | null }> {
    const params: Record<string, string> = {
      fields: MetaGraphClient.LEAD_FIELDS,
      limit: String(options.limit ?? 50),
    };
    if (options.after) params.after = options.after;

    const body = await this.request<MetaListResponse<MetaLead>>(
      `${formId}/leads`,
      pageAccessToken,
      params
    );

    // `paging.next` absent means we've reached the end of the collection.
    const nextCursor = body.paging?.next ? body.paging.cursors?.after ?? null : null;
    return { leads: body.data ?? [], nextCursor };
  }
}
