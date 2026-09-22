/** One answer to one question on a Meta lead form. */
export interface MetaFieldDatum {
  name: string;
  values: string[];
}

/** A lead as returned by `GET /{leadgen_id}` on the Graph API. */
export interface MetaLead {
  id: string;
  created_time: string;
  field_data: MetaFieldDatum[];
  form_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  platform?: string;
  is_organic?: boolean;
}

/** The `value` object of a `leadgen` webhook change. */
export interface MetaLeadgenChangeValue {
  leadgen_id: string;
  page_id: string;
  form_id: string;
  adgroup_id?: string;
  ad_id?: string;
  created_time?: number;
}

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time?: number;
    changes?: Array<{
      field: string;
      value: MetaLeadgenChangeValue;
    }>;
  }>;
}

/** A Page from `GET /me/accounts`. */
export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

/** A lead form from `GET /{page_id}/leadgen_forms`. */
export interface MetaLeadForm {
  id: string;
  name: string;
  status?: string;
  leads_count?: number;
}

export interface MetaPaging {
  cursors?: { before?: string; after?: string };
  next?: string;
}

export interface MetaListResponse<T> {
  data: T[];
  paging?: MetaPaging;
}

export interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** Shape of a Graph API error body. */
export interface MetaErrorResponse {
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}
