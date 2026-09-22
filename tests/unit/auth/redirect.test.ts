import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath (open-redirect guard)", () => {
  it.each(["/", "/leads", "/leads/123?tab=notes", "/followups?view=overdue", "/settings/integrations/google"])(
    "allows the same-origin path %j",
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    }
  );

  it.each([
    "https://evil.example",
    "http://evil.example/login",
    "//evil.example",
    "//evil.example/leads",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "evil.example",
    "leads",
    "/leads\r\nSet-Cookie: x=1",
    "/leads\u0000",
    "",
  ])("rejects %j and falls back", (input) => {
    expect(safeRedirectPath(input)).toBe("/");
  });

  it("falls back for missing input and honours a custom fallback", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined, "/today")).toBe("/today");
    expect(safeRedirectPath("https://evil.example", "/today")).toBe("/today");
  });
});
