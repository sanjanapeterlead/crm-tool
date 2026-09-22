import { z } from "zod";
import type { InboundMessageEvent, StatusEvent, WhatsAppEvent } from "@/lib/ports/whatsapp";

/**
 * Parses the WhatsApp Cloud API's webhook envelope
 * (`entry[].changes[].value.{messages,statuses}`). Shared by the real adapter
 * and the mock, so a mock delivery exercises the very same parsing code a real
 * one does — only the signature secret differs.
 *
 * Lenient about fields we don't use (Meta adds them freely) and strict about
 * the ones we depend on: anything unusable is dropped rather than guessed at.
 */

const messageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().optional(),
  type: z.string().default("unknown"),
  text: z.object({ body: z.string() }).optional(),
});

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  timestamp: z.string().optional(),
  errors: z.array(z.object({ code: z.union([z.number(), z.string()]).optional(), title: z.string().optional(), message: z.string().optional() })).optional(),
});

const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().min(1) }),
  contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
  messages: z.array(z.unknown()).optional(),
  statuses: z.array(z.unknown()).optional(),
});

const envelopeSchema = z.object({
  entry: z
    .array(z.object({ changes: z.array(z.object({ field: z.string().optional(), value: z.unknown() })).optional() }))
    .optional(),
});

const KNOWN_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

function toIso(timestamp: string | undefined): string {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

export function parseWhatsAppWebhook(rawBody: string): WhatsAppEvent[] {
  const envelope = envelopeSchema.parse(JSON.parse(rawBody));
  const events: WhatsAppEvent[] = [];

  for (const entry of envelope.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;

      const value = valueSchema.safeParse(change.value);
      if (!value.success) continue;
      const { metadata, contacts } = value.data;
      const names = new Map((contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null]));

      for (const raw of value.data.messages ?? []) {
        const message = messageSchema.safeParse(raw);
        if (!message.success) continue;
        const m = message.data;
        const event: InboundMessageEvent = {
          kind: "message",
          phoneNumberId: metadata.phone_number_id,
          providerMessageId: m.id,
          from: m.from,
          senderName: names.get(m.from) ?? null,
          messageType: m.type,
          text: m.type === "text" ? (m.text?.body ?? "") : null,
          occurredAt: toIso(m.timestamp),
        };
        events.push(event);
      }

      for (const raw of value.data.statuses ?? []) {
        const status = statusSchema.safeParse(raw);
        if (!status.success || !KNOWN_STATUSES.has(status.data.status)) continue;
        const s = status.data;
        const failure = s.errors?.[0];
        const event: StatusEvent = {
          kind: "status",
          phoneNumberId: metadata.phone_number_id,
          providerMessageId: s.id,
          status: s.status as StatusEvent["status"],
          occurredAt: toIso(s.timestamp),
          ...(failure ? { errorCode: String(failure.code ?? ""), errorMessage: failure.message ?? failure.title } : {}),
        };
        events.push(event);
      }
    }
  }

  return events;
}
