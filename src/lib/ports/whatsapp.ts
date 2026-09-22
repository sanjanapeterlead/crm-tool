import type { HeaderReader } from "@/lib/ports/lead-source";

/**
 * Port: sending and receiving WhatsApp messages. The CRM core talks only to
 * this — it never sees Meta's Graph API. Adapters: the official Cloud API
 * (`integrations/whatsapp/cloud-adapter.ts`) and a mock for demos and tests.
 */

/** What an adapter needs to act for one organization's shared business number. */
export interface WhatsAppConnection {
  phoneNumberId: string;
  /** Secret. Only ever passed straight through to the provider; never logged. */
  accessToken: string;
}

export interface OutboundTemplate {
  /** Recipient in E.164 without the leading plus, as the Cloud API expects. */
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
}

export interface OutboundText {
  to: string;
  body: string;
}

/** Why a send failed, in terms the CRM can act on — not the provider's own codes. */
export type SendFailureCode =
  | "auth" // credentials rejected: an admin must reconnect
  | "window_closed" // free text outside the 24h window: use a template
  | "invalid_recipient" // the number isn't on WhatsApp / isn't valid
  | "rate_limited" // try again shortly
  | "other";

export type SendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; code: SendFailureCode; error: string; retryable: boolean };

export interface InboundMessageEvent {
  kind: "message";
  /** Which of the org's numbers received it — how the webhook finds the tenant. */
  phoneNumberId: string;
  providerMessageId: string;
  /** Sender in E.164 without the plus. */
  from: string;
  senderName: string | null;
  /** `text` for a written message; `image`, `audio`, … otherwise. */
  messageType: string;
  /** The text, or null for a non-text message. */
  text: string | null;
  occurredAt: string;
}

export interface StatusEvent {
  kind: "status";
  phoneNumberId: string;
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  occurredAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export type WhatsAppEvent = InboundMessageEvent | StatusEvent;

export interface WhatsAppProvider {
  readonly id: string;
  /** True for adapters that pretend — the UI labels these "Demo mode". */
  readonly isMock: boolean;

  sendTemplate(connection: WhatsAppConnection, message: OutboundTemplate): Promise<SendOutcome>;
  sendText(connection: WhatsAppConnection, message: OutboundText): Promise<SendOutcome>;

  /** True only if a webhook delivery provably came from the provider. Called with the exact raw body. */
  verifyWebhook(rawBody: string, headers: HeaderReader): boolean;
  /** Extracts inbound messages and delivery receipts. Throws on a malformed body. */
  parseWebhook(rawBody: string): WhatsAppEvent[];
}
