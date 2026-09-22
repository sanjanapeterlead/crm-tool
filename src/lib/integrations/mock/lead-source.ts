import { z } from "zod";
import type { HeaderReader, InboundLead, LeadSourceEvent, LeadSourceProvider } from "@/lib/ports/lead-source";
import { verifyWebhookSignature } from "@/lib/security/signature";

/**
 * A lead source that needs no credentials: a signed JSON POST to
 * `/api/webhooks/mock-lead`. It exists so the whole capture pipeline — verify,
 * dedupe, idempotency, assignment, timeline — can be demonstrated and tested
 * end to end without a Meta app. It goes through exactly the same
 * `captureLead` service as a real Meta delivery.
 */

const leadSchema = z.object({
  id: z.string().trim().min(1).max(120),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  source: z.string().trim().max(60).optional(),
  campaign: z.string().trim().max(200).optional(),
  created_time: z.string().datetime().optional(),
});

const payloadSchema = z.object({
  org_id: z.string().uuid(),
  leads: z.array(leadSchema).min(1).max(50),
});

export type MockLeadPayload = z.infer<typeof payloadSchema>;

export const MOCK_PROVIDER_ID = "mock";
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

export class MockLeadSource implements LeadSourceProvider {
  readonly id = MOCK_PROVIDER_ID;

  constructor(private readonly secret: string) {}

  verify(rawBody: string, headers: HeaderReader): boolean {
    return verifyWebhookSignature(rawBody, headers.get(MOCK_SIGNATURE_HEADER), this.secret);
  }

  /** Throws a ZodError / SyntaxError on a malformed body. */
  parse(rawBody: string): LeadSourceEvent[] {
    return this.parsePayload(rawBody).leads.map((lead) => ({
      externalId: lead.id,
      inline: toInboundLead(lead),
    }));
  }

  /** The org the (signed) payload says it is for. */
  parseOrgId(rawBody: string): string {
    return this.parsePayload(rawBody).org_id;
  }

  async resolve(event: LeadSourceEvent): Promise<InboundLead> {
    if (!event.inline) throw new Error("A mock lead event always carries its lead.");
    return event.inline;
  }

  private parsePayload(rawBody: string): MockLeadPayload {
    return payloadSchema.parse(JSON.parse(rawBody));
  }
}

function toInboundLead(lead: z.infer<typeof leadSchema>): InboundLead {
  return {
    provider: MOCK_PROVIDER_ID,
    externalId: lead.id,
    source: lead.source || "Facebook Ad",
    firstName: lead.first_name,
    lastName: lead.last_name || null,
    phone: lead.phone || null,
    email: lead.email || null,
    receivedAt: lead.created_time ?? null,
    timeline: {
      title: "Imported from test lead source",
      description: lead.campaign ?? "Mock lead source",
      metadata: { external_id: lead.id, campaign: lead.campaign ?? null },
    },
  };
}
