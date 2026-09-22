import type { InboundLead } from "@/lib/ports/lead-source";
import type { MetaFieldDatum, MetaLead } from "./types";

export interface MappedLeadContact {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Meta form field names vary by form and locale, and advertisers rename them
 * freely, so we match against a list of known aliases rather than assuming a
 * fixed schema. Anything unmatched is still preserved in `field_data` on the
 * attribution row.
 */
const FIELD_ALIASES = {
  fullName: ["full_name", "fullname", "name", "your_name"],
  firstName: ["first_name", "firstname", "given_name"],
  lastName: ["last_name", "lastname", "surname", "family_name"],
  email: ["email", "email_address", "work_email"],
  phone: ["phone_number", "phone", "mobile_number", "mobile", "telephone", "work_phone_number"],
} as const;

function findValue(fieldData: MetaFieldDatum[], aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const match = fieldData.find((field) => field.name?.toLowerCase() === alias);
    const value = match?.values?.find((v) => v && v.trim().length > 0);
    if (value) return value.trim();
  }
  return null;
}

function splitFullName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: fullName, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function mapLeadContact(fieldData: MetaFieldDatum[]): MappedLeadContact {
  const email = findValue(fieldData, FIELD_ALIASES.email);
  const phone = findValue(fieldData, FIELD_ALIASES.phone);

  let firstName = findValue(fieldData, FIELD_ALIASES.firstName);
  let lastName = findValue(fieldData, FIELD_ALIASES.lastName);

  if (!firstName) {
    const fullName = findValue(fieldData, FIELD_ALIASES.fullName);
    if (fullName) {
      const split = splitFullName(fullName);
      firstName = split.firstName;
      lastName = lastName ?? split.lastName;
    }
  }

  // `leads.first_name` is NOT NULL, and a form can legitimately collect only a
  // phone number, so fall back to whatever identifies the person.
  const fallback = email ?? phone ?? "Unknown";

  return {
    firstName: firstName ?? fallback,
    lastName: lastName ?? null,
    email,
    phone,
  };
}

/** Maps Meta's platform code onto the CRM's `LEAD_SOURCES` values. */
export function mapLeadSource(platform: string | undefined): string {
  switch (platform?.toLowerCase()) {
    case "ig":
    case "instagram":
      return "Instagram";
    case "fb":
    case "facebook":
      return "Facebook Ad";
    default:
      return "Facebook Ad";
  }
}

/** Form answers that aren't part of the contact record, for display on the lead. */
export function extractCustomAnswers(fieldData: MetaFieldDatum[]): MetaFieldDatum[] {
  const known = new Set<string>(Object.values(FIELD_ALIASES).flat());
  return fieldData.filter((field) => !known.has(field.name?.toLowerCase()));
}

export function describeLead(lead: MetaLead): string {
  const parts = [lead.campaign_name, lead.adset_name, lead.ad_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" › ") : "Meta lead ad";
}

/**
 * A Meta lead as the CRM core understands it. This is the seam: everything
 * Meta-specific (field aliases, platform codes, ad names) is resolved here, so
 * `captureLead` never sees a Meta shape.
 */
export function toInboundLead(lead: MetaLead): InboundLead {
  const contact = mapLeadContact(lead.field_data ?? []);
  return {
    provider: "meta",
    externalId: lead.id,
    source: mapLeadSource(lead.platform),
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    email: contact.email,
    receivedAt: lead.created_time ?? null,
    timeline: {
      title: "Imported from Meta Ads",
      description: describeLead(lead),
      metadata: {
        leadgen_id: lead.id,
        platform: lead.platform ?? null,
        campaign_name: lead.campaign_name ?? null,
        ad_name: lead.ad_name ?? null,
      },
    },
  };
}
