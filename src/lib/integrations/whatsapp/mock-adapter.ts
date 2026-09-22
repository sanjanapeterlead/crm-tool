import { randomUUID } from "node:crypto";
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
import { parseWhatsAppWebhook } from "./webhook-format";

export const MOCK_WHATSAPP_SIGNATURE_HEADER = "x-mock-signature";

/**
 * Stands in for WhatsApp when no credentials are configured (demo mode). Every
 * send "succeeds" with a fake message id — *nothing is delivered* — except for
 * numbers that end in a trigger, so the failure paths can be shown and tested:
 *
 *   …0000  →  "not on WhatsApp"      (a permanent failure)
 *   …9999  →  rate limited           (a retryable failure)
 *
 * Inbound deliveries use the real Cloud API payload shape, parsed by the real
 * parser, signed with the mock webhook secret instead of Meta's app secret.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly id = "mock";
  readonly isMock = true;

  constructor(private readonly webhookSecret: string) {}

  async sendTemplate(_connection: WhatsAppConnection, message: OutboundTemplate): Promise<SendOutcome> {
    return this.respond(message.to);
  }

  async sendText(_connection: WhatsAppConnection, message: OutboundText): Promise<SendOutcome> {
    return this.respond(message.to);
  }

  verifyWebhook(rawBody: string, headers: HeaderReader): boolean {
    return verifyWebhookSignature(rawBody, headers.get(MOCK_WHATSAPP_SIGNATURE_HEADER), this.webhookSecret);
  }

  parseWebhook(rawBody: string): WhatsAppEvent[] {
    return parseWhatsAppWebhook(rawBody);
  }

  private respond(to: string): SendOutcome {
    if (to.endsWith("0000")) {
      return { ok: false, code: "invalid_recipient", retryable: false, error: "Demo mode: this number is not on WhatsApp." };
    }
    if (to.endsWith("9999")) {
      return { ok: false, code: "rate_limited", retryable: true, error: "Demo mode: WhatsApp is rate limiting us. Try again in a minute." };
    }
    return { ok: true, providerMessageId: `mock.wamid.${randomUUID()}` };
  }
}
