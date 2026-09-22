/**
 * Port: anything that delivers new leads (Meta Lead Ads today; Google Ads, a
 * website form or a partner feed later). The CRM core sees only `InboundLead`
 * — it never learns which provider produced it (docs/ARCHITECTURE.md).
 */

export interface InboundLead {
  /** Which adapter produced this (`meta`, `mock`…). Half of the idempotency key. */
  provider: string;
  /** The provider's own id for this lead. The other half of the idempotency key. */
  externalId: string;
  /** One of the CRM's LEAD_SOURCES labels ("Facebook Ad", "Instagram"…). */
  source: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  /** When the prospect submitted it, if the provider says (keeps backfilled leads in order). */
  receivedAt?: string | null;
  /** What to write on the lead's timeline when this creates or joins an opportunity. */
  timeline: {
    title: string;
    description?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface LeadSourceEvent {
  externalId: string;
  /** Provider routing hints, e.g. Meta's page id — the route handler uses them to find the org. */
  scope?: Record<string, string>;
  /** Present when the delivery already contains the whole lead (the mock source). */
  inline?: InboundLead;
}

export interface HeaderReader {
  get(name: string): string | null;
}

export interface LeadSourceProvider {
  readonly id: string;
  /** True only if the request provably came from the provider. Called with the exact raw body. */
  verify(rawBody: string, headers: HeaderReader): boolean;
  /** Extracts the lead events in a delivery. Throws on a malformed body. */
  parse(rawBody: string): LeadSourceEvent[];
  /** Turns an event into a normalized lead, calling the provider's API if the delivery carried only ids. */
  resolve(event: LeadSourceEvent, credentials: { accessToken?: string }): Promise<InboundLead>;
}
