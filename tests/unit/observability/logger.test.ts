import { describe, expect, it } from "vitest";
import { createLogger, getRequestId, REDACTED, redact } from "@/lib/observability/logger";

function capture() {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger({ service: "test" }, { sink: (line) => lines.push(JSON.parse(line)), minLevel: "debug" });
  return { lines, logger };
}

describe("logger", () => {
  it("emits one JSON object per event with bindings and fields", () => {
    const { lines, logger } = capture();
    logger.child({ requestId: "req-12345678" }).info("webhook.received", { provider: "meta" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      event: "webhook.received",
      service: "test",
      requestId: "req-12345678",
      provider: "meta",
    });
    expect(typeof lines[0].time).toBe("string");
  });

  it("redacts secret-looking keys at any depth", () => {
    const { lines, logger } = capture();
    logger.info("connect", {
      page: { name: "Acme", access_token: "EAAG123", nested: { clientSecret: "hunter2" } },
      authorization: "Bearer abc",
    });
    const line = JSON.stringify(lines[0]);
    expect(line).not.toContain("EAAG123");
    expect(line).not.toContain("hunter2");
    expect(lines[0]).toMatchObject({ authorization: REDACTED });
    expect((lines[0].page as { name: string }).name).toBe("Acme");
  });

  it("scrubs tokens embedded in strings such as URLs and error messages", () => {
    const scrubbed = redact(
      "GET https://graph.facebook.com/x?access_token=EAAG123&fields=id failed: Bearer abc.def-ghi"
    ) as string;
    expect(scrubbed).not.toContain("EAAG123");
    expect(scrubbed).not.toContain("abc.def-ghi");
  });

  it("serialises errors as name and message only", () => {
    const error = new Error("boom access_token=EAAG123");
    const out = redact({ error }) as { error: { name: string; message: string; stack?: string } };
    expect(out.error.name).toBe("Error");
    expect(out.error.message).not.toContain("EAAG123");
    expect(out.error.stack).toBeUndefined();
  });

  it("truncates very large strings so a payload cannot flood the logs", () => {
    expect((redact("x".repeat(5000)) as string).length).toBeLessThan(600);
  });

  it("respects the minimum level", () => {
    const lines: string[] = [];
    const logger = createLogger({}, { sink: (l) => lines.push(l), minLevel: "warn" });
    logger.info("skipped");
    logger.error("kept");
    expect(lines).toHaveLength(1);
  });
});

describe("getRequestId", () => {
  it("reuses a well-formed inbound id", () => {
    expect(getRequestId(new Headers({ "x-request-id": "abc-12345678" }))).toBe("abc-12345678");
  });

  it("mints a new id when absent or unsafe", () => {
    expect(getRequestId(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
    expect(getRequestId(new Headers({ "x-request-id": "bad id with spaces" }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
