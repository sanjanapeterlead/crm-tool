/**
 * WhatsApp business rules that don't depend on any provider's API.
 */

export type MessageStatus = "sent" | "delivered" | "read" | "failed" | "received";
export type ConsentStatus = "unknown" | "opted_in" | "opted_out";

/** WhatsApp lets a business send free-form messages only within 24h of the customer's last message. */
export const SERVICE_WINDOW_HOURS = 24;

/**
 * Whether a free-text message may be sent now. Outside the window only an
 * approved template is allowed — the provider would reject anything else.
 */
export function isWithinServiceWindow(lastInboundAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const last = typeof lastInboundAt === "string" ? new Date(lastInboundAt) : lastInboundAt;
  if (Number.isNaN(last.getTime())) return false;
  return now.getTime() - last.getTime() < SERVICE_WINDOW_HOURS * 3_600_000;
}

/** When the free-text window closes, for showing "reply within 3h" in the UI. */
export function serviceWindowClosesAt(lastInboundAt: string | Date | null | undefined): Date | null {
  if (!lastInboundAt) return null;
  const last = typeof lastInboundAt === "string" ? new Date(lastInboundAt) : lastInboundAt;
  return Number.isNaN(last.getTime()) ? null : new Date(last.getTime() + SERVICE_WINDOW_HOURS * 3_600_000);
}

const RANK: Record<"sent" | "delivered" | "read", number> = { sent: 1, delivered: 2, read: 3 };

/**
 * Applies a delivery receipt to a message's current status. Receipts arrive
 * out of order and get redelivered, so this is monotonic: a message never goes
 * backwards (a late "delivered" after "read" is ignored), and "failed" only
 * lands on a message that hadn't reached the customer yet.
 */
export function nextMessageStatus(current: MessageStatus, incoming: "sent" | "delivered" | "read" | "failed"): MessageStatus {
  if (current === "received") return current; // inbound messages have no lifecycle
  if (current === "failed") return "failed";

  if (incoming === "failed") return current === "sent" ? "failed" : current;
  return RANK[incoming] > RANK[current as "sent" | "delivered" | "read"] ? incoming : current;
}

const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "cancel", "end", "quit", "stop all", "opt out", "optout"]);

/** A customer replying with a bare opt-out keyword ("STOP") must not be messaged again. */
export function isOptOutText(text: string | null | undefined): boolean {
  if (!text) return false;
  return OPT_OUT_WORDS.has(text.trim().toLowerCase().replace(/[.!]+$/, ""));
}

export type SendGate = { allowed: true } | { allowed: false; reason: string };

/** May we message this contact on WhatsApp at all? Unknown consent is allowed; an explicit opt-out is not. */
export function checkSendAllowed(consent: ConsentStatus): SendGate {
  if (consent === "opted_out") {
    return { allowed: false, reason: "This contact opted out of WhatsApp messages, so nothing can be sent." };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

/** Matches `{{1}}`, `{{2}}`, … — WhatsApp's positional variable syntax. */
const VARIABLE_PATTERN = /\{\{(\d+)\}\}/g;

/** How many `{{n}}` placeholders the body has, so a compose form knows how many inputs to render. */
export function countVariables(bodyText: string): number {
  const matches = [...bodyText.matchAll(VARIABLE_PATTERN)].map((m) => Number(m[1]));
  return matches.length > 0 ? Math.max(...matches) : 0;
}

/** Substitutes `{{n}}` with the supplied value, 1-indexed to match WhatsApp's own numbering. */
export function renderBody(bodyText: string, values: string[]): string {
  return bodyText.replace(VARIABLE_PATTERN, (match, indexStr) => {
    const index = Number(indexStr) - 1;
    return values[index] ?? match;
  });
}

/**
 * WhatsApp only delivers a template Meta has approved. Checking first gives a
 * clear message instead of the provider's less specific rejection.
 */
export function templateApprovalError(template: { name: string; status: string }): string | null {
  return template.status === "APPROVED"
    ? null
    : `Template "${template.name}" is not approved yet (status: ${template.status}).`;
}
