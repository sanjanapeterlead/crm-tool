import { describe, expect, it } from "vitest";
import { normalizePhone, toWhatsAppRecipient } from "@/lib/domain/phone";

describe("normalizePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["+91-9876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["(+91) 98765 43210", "+919876543210"],
  ])("normalizes the Indian number %j to %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("treats every spelling of one number as the same dedupe key", () => {
    const spellings = ["9876543210", "+91 9876543210", "098765 43210", "+919876543210"];
    expect(new Set(spellings.map((s) => normalizePhone(s))).size).toBe(1);
  });

  it("keeps an explicit foreign country code rather than assuming India", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
  });

  it("honours a different default country for numbers without a country code", () => {
    expect(normalizePhone("(415) 555-2671", "US")).toBe("+14155552671");
  });

  it("stays compatible with the numbers the WhatsApp layer already accepted", () => {
    expect(normalizePhone("+1-555-0123456")).toBe("+15550123456");
  });

  it.each([[""], ["   "], [null], [undefined], ["abc"], ["12345"], ["555-0123"], ["1".repeat(20)]])(
    "returns null for %j",
    (raw) => {
      expect(normalizePhone(raw as string | null | undefined)).toBeNull();
    }
  );
});

describe("toWhatsAppRecipient", () => {
  it("drops the leading plus", () => {
    expect(toWhatsAppRecipient("+919876543210")).toBe("919876543210");
  });
});
