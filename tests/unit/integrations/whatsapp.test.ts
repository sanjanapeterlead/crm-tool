import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaApiError } from "@/lib/integrations/meta/client";
import { classifySendError, MetaCloudWhatsAppProvider } from "@/lib/integrations/whatsapp/cloud-adapter";
import { MockWhatsAppProvider } from "@/lib/integrations/whatsapp/mock-adapter";
import { parseWhatsAppWebhook } from "@/lib/integrations/whatsapp/webhook-format";
import type { MetaConfig } from "@/lib/integrations/meta/config";

const config: MetaConfig = {
  appId: "app",
  appSecret: "app-secret",
  webhookVerifyToken: "verify",
  graphVersion: "v23.0",
  appUrl: "http://localhost:3000",
};

const connection = { phoneNumberId: "PN-1", accessToken: "EAAG-super-secret-token" };

function sign(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });

afterEach(() => vi.unstubAllGlobals());

describe("parseWhatsAppWebhook", () => {
  const envelope = (value: unknown, field = "messages") =>
    JSON.stringify({ entry: [{ id: "WABA", changes: [{ field, value }] }] });

  it("extracts an inbound text message with the sender's name", () => {
    const events = parseWhatsAppWebhook(
      envelope({
        metadata: { display_phone_number: "911234567890", phone_number_id: "PN-1" },
        contacts: [{ wa_id: "919820010001", profile: { name: "Riya" } }],
        messages: [{ from: "919820010001", id: "wamid.A", timestamp: "1790000000", type: "text", text: { body: "Hello!" } }],
      })
    );
    expect(events).toEqual([
      {
        kind: "message",
        phoneNumberId: "PN-1",
        providerMessageId: "wamid.A",
        from: "919820010001",
        senderName: "Riya",
        messageType: "text",
        text: "Hello!",
        occurredAt: new Date(1790000000 * 1000).toISOString(),
      },
    ]);
  });

  it("represents a non-text message without inventing text", () => {
    const [event] = parseWhatsAppWebhook(
      envelope({ metadata: { phone_number_id: "PN-1" }, messages: [{ from: "91", id: "wamid.B", type: "image" }] })
    );
    expect(event).toMatchObject({ kind: "message", messageType: "image", text: null });
  });

  it("extracts delivery receipts, including a failure's reason", () => {
    const events = parseWhatsAppWebhook(
      envelope({
        metadata: { phone_number_id: "PN-1" },
        statuses: [
          { id: "wamid.C", status: "delivered", timestamp: "1790000100" },
          { id: "wamid.D", status: "failed", timestamp: "1790000200", errors: [{ code: 131026, title: "Message undeliverable" }] },
        ],
      })
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "status", providerMessageId: "wamid.C", status: "delivered" });
    expect(events[1]).toMatchObject({ kind: "status", status: "failed", errorCode: "131026", errorMessage: "Message undeliverable" });
  });

  it("ignores unrelated fields, unknown statuses and malformed entries instead of guessing", () => {
    expect(parseWhatsAppWebhook(envelope({ metadata: { phone_number_id: "PN-1" }, messages: [{ nope: true }] }))).toEqual([]);
    expect(parseWhatsAppWebhook(envelope({ metadata: { phone_number_id: "PN-1" }, statuses: [{ id: "x", status: "deleted" }] }))).toEqual([]);
    expect(parseWhatsAppWebhook(envelope({ anything: 1 }, "account_update"))).toEqual([]);
    expect(parseWhatsAppWebhook(envelope({ no: "metadata" }))).toEqual([]);
    expect(parseWhatsAppWebhook(JSON.stringify({}))).toEqual([]);
  });

  it("throws on a body that isn't JSON", () => {
    expect(() => parseWhatsAppWebhook("not json")).toThrow();
  });
});

describe("classifySendError", () => {
  const meta = (message: string, status: number, code?: number) => new MetaApiError(message, status, code);

  it.each([
    [meta("token expired", 401, 190), "auth", false],
    [meta("outside window", 400, 131047), "window_closed", false],
    [meta("undeliverable", 400, 131026), "invalid_recipient", false],
    [meta("throttled", 400, 130429), "rate_limited", true],
    [meta("too many", 429), "rate_limited", true],
    [meta("boom", 500, 1), "other", true],
    [meta("bad request", 400, 1), "other", false],
  ] as const)("maps %j to %s (retryable: %s)", (error, code, retryable) => {
    expect(classifySendError(error)).toMatchObject({ ok: false, code, retryable });
  });

  it("treats a network failure as retryable", () => {
    expect(classifySendError(new TypeError("fetch failed"))).toMatchObject({ code: "other", retryable: true });
  });

  it("tells the user to reconnect on an auth failure, without echoing any credential", () => {
    const failure = classifySendError(meta("Invalid OAuth access token", 401, 190));
    expect(failure.error).toMatch(/reconnect whatsapp/i);
  });
});

describe("MetaCloudWhatsAppProvider", () => {
  function stubFetch(response: { ok?: boolean; status?: number; body: unknown }) {
    const fetchMock = vi.fn(async () => ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body,
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends a template through the phone number's messages endpoint and returns the message id", async () => {
    const fetchMock = stubFetch({ body: { messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.SENT" }] } });
    const outcome = await new MetaCloudWhatsAppProvider(config).sendTemplate(connection, {
      to: "919820010001",
      templateName: "welcome_intro",
      languageCode: "en",
      bodyParameters: ["Riya"],
    });

    expect(outcome).toEqual({ ok: true, providerMessageId: "wamid.SENT" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/v23.0/PN-1/messages");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      messaging_product: "whatsapp",
      to: "919820010001",
      type: "template",
      template: { name: "welcome_intro", language: { code: "en" } },
    });
    expect(sent.template.components[0].parameters).toEqual([{ type: "text", text: "Riya" }]);
  });

  it("sends free text", async () => {
    const fetchMock = stubFetch({ body: { messages: [{ id: "wamid.T" }] } });
    const outcome = await new MetaCloudWhatsAppProvider(config).sendText(connection, { to: "919820010001", body: "Thanks!" });
    expect(outcome).toEqual({ ok: true, providerMessageId: "wamid.T" });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].body as string);
    expect(sent).toMatchObject({ type: "text", text: { body: "Thanks!" } });
  });

  it("returns a typed failure — it never throws — when Meta rejects the call", async () => {
    stubFetch({ ok: false, status: 400, body: { error: { message: "Message undeliverable", code: 131026 } } });
    const outcome = await new MetaCloudWhatsAppProvider(config).sendText(connection, { to: "1", body: "x" });
    expect(outcome).toMatchObject({ ok: false, code: "invalid_recipient", retryable: false });
  });

  it("reports an accepted request that carries no message id as a failure", async () => {
    stubFetch({ body: { messages: [] } });
    const outcome = await new MetaCloudWhatsAppProvider(config).sendText(connection, { to: "1", body: "x" });
    expect(outcome.ok).toBe(false);
  });

  it("never puts the access token in a failure message", async () => {
    stubFetch({ ok: false, status: 401, body: { error: { message: "Invalid token", code: 190 } } });
    const outcome = await new MetaCloudWhatsAppProvider(config).sendText(connection, { to: "1", body: "x" });
    expect(JSON.stringify(outcome)).not.toContain("EAAG-super-secret-token");
  });

  it("verifies webhooks against the Meta app secret", () => {
    const provider = new MetaCloudWhatsAppProvider(config);
    const body = '{"entry":[]}';
    expect(provider.verifyWebhook(body, headers({ "x-hub-signature-256": sign(body, "app-secret") }))).toBe(true);
    expect(provider.verifyWebhook(body, headers({ "x-hub-signature-256": sign(body, "wrong") }))).toBe(false);
    expect(provider.verifyWebhook(body, headers({}))).toBe(false);
    expect(provider.verifyWebhook(body, headers({ "x-mock-signature": sign(body, "app-secret") }))).toBe(false);
  });
});

describe("MockWhatsAppProvider", () => {
  const provider = new MockWhatsAppProvider("mock-secret");
  const template = { to: "919820010001", templateName: "t", languageCode: "en", bodyParameters: [] };

  it("is labelled a mock so the UI can say 'demo mode'", () => {
    expect(provider.isMock).toBe(true);
  });

  it("pretends to send, returning a recognisably fake message id", async () => {
    const outcome = await provider.sendTemplate(connection, template);
    expect(outcome.ok && outcome.providerMessageId).toMatch(/^mock\.wamid\./);
    expect((await provider.sendText(connection, { to: "919820010001", body: "hi" })).ok).toBe(true);
  });

  it("simulates a permanent failure for numbers ending 0000 and a retryable one for 9999", async () => {
    expect(await provider.sendText(connection, { to: "919820010000", body: "x" })).toMatchObject({
      ok: false,
      code: "invalid_recipient",
      retryable: false,
    });
    expect(await provider.sendTemplate(connection, { ...template, to: "919820019999" })).toMatchObject({
      ok: false,
      code: "rate_limited",
      retryable: true,
    });
  });

  it("verifies webhooks with the mock secret and rejects Meta's header", () => {
    const body = '{"entry":[]}';
    expect(provider.verifyWebhook(body, headers({ "x-mock-signature": sign(body, "mock-secret") }))).toBe(true);
    expect(provider.verifyWebhook(body, headers({ "x-mock-signature": sign(body, "other") }))).toBe(false);
    expect(provider.verifyWebhook(body, headers({ "x-hub-signature-256": sign(body, "mock-secret") }))).toBe(false);
  });
});
