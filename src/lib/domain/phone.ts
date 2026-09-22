import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/**
 * Default country used to interpret numbers typed without a country code
 * (a salesperson entering "98765 43210"). India first; the value is a
 * parameter everywhere so an international org can override it later.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode = "IN";

/**
 * Normalizes a freeform phone number to E.164 (`+919876543210`), the single
 * canonical form used for dedupe, WhatsApp routing and search. Returns null
 * when the input can't plausibly be a phone number.
 *
 * Uses `isPossible()` (length/shape) rather than `isValid()` (assigned
 * number ranges): lead forms contain typos, and rejecting a real prospect
 * because the ranges in our bundled metadata are a release behind is worse
 * than storing a number that then fails to deliver.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY
): string | null {
  const text = raw?.trim();
  if (!text) return null;

  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  if (!parsed || !parsed.isPossible()) return null;

  return parsed.number;
}

/** The Cloud API's `to` field: E.164 without the leading `+`. */
export function toWhatsAppRecipient(e164: string): string {
  return e164.replace(/^\+/, "");
}
