import { describe, expect, it } from "vitest";
import { buildSearchClauses } from "@/lib/services/leads";

describe("buildSearchClauses", () => {
  it("requires every word to match, so a full name narrows instead of widening", () => {
    const clauses = buildSearchClauses("Vikram Singh");
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toContain("first_name.ilike.%Vikram%");
    expect(clauses[1]).toContain("last_name.ilike.%Singh%");
  });

  it("treats a phone number typed with spaces and punctuation as one digit string", () => {
    expect(buildSearchClauses("+91 98974 94788")).toEqual(["phone.ilike.%919897494788%"]);
    expect(buildSearchClauses("(98974) 94788")).toEqual(["phone.ilike.%9897494788%"]);
  });

  it("matches a partial number", () => {
    expect(buildSearchClauses("98974")).toEqual(["phone.ilike.%98974%"]);
  });

  it("searches names and email when the word is not a number", () => {
    expect(buildSearchClauses("priya@ex")[0]).toContain("email.ilike.%priya@ex%");
  });

  it.each(["a,b", "x),(y", 'q"r', "100%", "a\\b", "z*y"])(
    "strips PostgREST filter syntax from %j so a search can only narrow results",
    (term) => {
      for (const clause of buildSearchClauses(term)) {
        expect(clause).not.toMatch(/[()"\\*]/);
        // Each clause is a fixed set of column filters; nothing user-supplied can add another.
        const parts = clause.split(",");
        expect(parts.every((part) => /^(first_name|last_name|email|phone)\.ilike\.%[^,%]*%$/.test(part))).toBe(true);
      }
    }
  );

  it("caps the number of words so a long paste can't build a huge query", () => {
    expect(buildSearchClauses("a b c d e f g h i j")).toHaveLength(5);
  });

  it("returns no clauses for an empty search", () => {
    expect(buildSearchClauses("   ")).toEqual([]);
    expect(buildSearchClauses(",,,")).toEqual([]);
  });
});
