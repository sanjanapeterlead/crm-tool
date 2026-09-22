import { countVariables, renderBody, templateApprovalError } from "@/lib/domain/whatsapp";
import type { WhatsAppTemplate, WhatsAppTemplateComponent } from "./types";

// The template rules are pure business logic and live in the domain layer;
// re-exported here so everything template-related is importable from one place.
export { countVariables, renderBody };

export function getComponent(
  template: Pick<WhatsAppTemplate, "components">,
  type: WhatsAppTemplateComponent["type"]
): WhatsAppTemplateComponent | undefined {
  return template.components?.find((c) => c.type === type);
}

export function getBodyText(template: Pick<WhatsAppTemplate, "components">): string {
  return getComponent(template, "BODY")?.text ?? "";
}

/**
 * WhatsApp only allows sending a template Meta has approved — anything else
 * gets rejected by the Graph API with a less specific error, so this check
 * runs before the network call to surface a clearer message.
 */
export function assertTemplateApproved(template: { name: string; status: string }): void {
  const problem = templateApprovalError(template);
  if (problem) throw new Error(problem);
}

/**
 * Normalizes a lead's freeform phone number (e.g. "+1-555-9999") to the
 * digits-only, country-code-prefixed format the Cloud API's `to` field
 * expects. Returns null when there aren't enough digits to plausibly be a
 * phone number with a country code, so the caller can reject before calling
 * the API rather than surfacing Meta's own less specific error.
 */
export function normalizePhoneForWhatsApp(rawPhone: string): string | null {
  const digits = rawPhone.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
