import "server-only";
import { MetaApiError } from "@/lib/integrations/meta/client";
import { verifyWebhookSignature } from "@/lib/security/signature";
import type {
  OutboundTemplate,
  OutboundText,
  SendOutcome,
  WhatsAppConnection,
  WhatsAppEvent,
  WhatsAppProvider,
} from "@/lib/ports/whatsapp";
import type { HeaderReader } from "@/lib/ports/lead-source";
import type { MetaConfig } from "./config";
import { WhatsAppGraphClient } from "./client";
import type { WhatsAppSendResponse } from "./types";
import { parseWhatsAppWebhook } from "./webhook-format";

type Failure = Extract<SendOutcome, { ok: false }>;

/** Cloud API error codes worth telling apart (developers.facebook.com → WhatsApp error codes). */
const WINDOW_CLOSED = new Set([131047, 131051]);
const INVALID_RECIPIENT = new Set([131026, 131030, 131021, 131009, 100]);
const RATE_LIMITED = new Set([4, 80007, 130429, 131056]);

/**
 * Turns anything the Graph API (or the network) throws into the CRM's small
 * vocabulary of send failures. `error` is safe to show a person — it's Meta's
 * own message, which never contains our credentials.
 */
export function classifySendError(error: unknown): Failure {
  if (error instanceof MetaApiError) {
    if (error.isAuthError) {
      return { ok: false, code: "auth", retryable: false, error: `Meta rejected our access token (${error.message}). Reconnect WhatsApp in Settings.` };
    }
    if (error.code !== undefined && WINDOW_CLOSED.has(error.code)) {
      return { ok: false, code: "window_closed", retryable: false, error: "The 24-hour reply window has closed. Send an approved template instead." };
    }
    if (error.code !== undefined && INVALID_RECIPIENT.has(error.code)) {
      return { ok: false, code: "invalid_recipient", retryable: false, error: error.message };
    }
    if ((error.code !== undefined && RATE_LIMITED.has(error.code)) || error.status === 429) {
      return { ok: false, code: "rate_limited", retryable: true, error: "WhatsApp is rate limiting us. Try again in a minute." };
    }
    return { ok: false, code: "other", retryable: error.status >= 500, error: error.message };
  }

  const message = error instanceof Error ? error.message : "Unknown error sending the message.";
  // A thrown non-Meta error is a network/runtime failure: worth retrying.
  return { ok: false, code: "other", retryable: true, error: message };
}

function toOutcome(response: WhatsAppSendResponse): SendOutcome {
  const id = response.messages?.[0]?.id;
  return id
    ? { ok: true, providerMessageId: id }
    : { ok: false, code: "other", retryable: false, error: "WhatsApp accepted the request but returned no message id." };
}

/** The official WhatsApp Business Cloud API. */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly id = "meta_cloud";
  readonly isMock = false;
  private readonly graph: WhatsAppGraphClient;

  constructor(
    private readonly config: MetaConfig,
    graph?: WhatsAppGraphClient
  ) {
    this.graph = graph ?? new WhatsAppGraphClient(config);
  }

  async sendTemplate(connection: WhatsAppConnection, message: OutboundTemplate): Promise<SendOutcome> {
    try {
      return toOutcome(
        await this.graph.sendTemplateMessage(connection.phoneNumberId, connection.accessToken, {
          to: message.to,
          templateName: message.templateName,
          languageCode: message.languageCode,
          bodyParameters: message.bodyParameters,
        })
      );
    } catch (error) {
      return classifySendError(error);
    }
  }

  async sendText(connection: WhatsAppConnection, message: OutboundText): Promise<SendOutcome> {
    try {
      return toOutcome(
        await this.graph.sendTextMessage(connection.phoneNumberId, connection.accessToken, {
          to: message.to,
          body: message.body,
        })
      );
    } catch (error) {
      return classifySendError(error);
    }
  }

  verifyWebhook(rawBody: string, headers: HeaderReader): boolean {
    return verifyWebhookSignature(rawBody, headers.get("x-hub-signature-256"), this.config.appSecret);
  }

  parseWebhook(rawBody: string): WhatsAppEvent[] {
    return parseWhatsAppWebhook(rawBody);
  }
}
