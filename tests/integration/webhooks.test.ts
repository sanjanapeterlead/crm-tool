import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as mockLeadWebhook } from "@/app/api/webhooks/mock-lead/route";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { markConnected, markDisconnected, markFailing } from "@/lib/services/integration-health";
import { beginReceipt, finishReceipt } from "@/lib/services/webhooks";
import { admin, countRows, seedOrgId, uniqueEmail, uniquePhone } from "./support";

const SECRET = "dev-mock-webhook-secret"; // the non-production default; see integrations/mock/config.ts
let orgId: string;

beforeAll(async () => {
  orgId = await seedOrgId();
});

afterEach(() => {
  delete process.env.ENABLE_MOCK_PROVIDERS;
});

type MockLead = { id: string; first_name: string; last_name?: string; phone?: string; email?: string; source?: string; campaign?: string };

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function delivery(leads: MockLead[], options: { org?: string; secret?: string; signature?: string | null; body?: string } = {}) {
  const body = options.body ?? JSON.stringify({ org_id: options.org ?? orgId, leads });
  const headers: Record<string, string> = { "content-type": "application/json" };
  const signature = options.signature === undefined ? sign(body, options.secret) : options.signature;
  if (signature) headers["x-mock-signature"] = signature;
  return new NextRequest("http://localhost/api/webhooks/mock-lead", { method: "POST", body, headers });
}

const newLead = (overrides: Partial<MockLead> = {}): MockLead => ({
  id: `mock-${randomUUID()}`,
  first_name: "Riya",
  last_name: "Kapoor",
  phone: uniquePhone(),
  source: "Facebook Ad",
  campaign: "Study Abroad — Test",
  ...overrides,
});

async function json(response: Response) {
  return (await response.json()) as { results: Array<{ externalId: string; outcome: string; leadId?: string | null }> };
}

describe("mock lead webhook — authentication", () => {
  it("rejects an unsigned delivery and creates nothing", async () => {
    const lead = newLead();
    const response = await mockLeadWebhook(delivery([lead], { signature: null }));
    expect(response.status).toBe(401);
    expect(await countRows("leads", { org_id: orgId, external_id: lead.id })).toBe(0);
  });

  it("rejects a delivery signed with the wrong secret", async () => {
    const lead = newLead();
    const response = await mockLeadWebhook(delivery([lead], { secret: "not-the-secret" }));
    expect(response.status).toBe(401);
    expect(await countRows("leads", { org_id: orgId, external_id: lead.id })).toBe(0);
  });

  it("rejects a body that was altered after signing", async () => {
    const lead = newLead();
    const original = JSON.stringify({ org_id: orgId, leads: [lead] });
    const tampered = original.replace("Riya", "Mallory");
    const response = await mockLeadWebhook(delivery([lead], { body: tampered, signature: sign(original) }));
    expect(response.status).toBe(401);
  });

  it("answers 404 — as if the route didn't exist — when mock providers are disabled", async () => {
    process.env.ENABLE_MOCK_PROVIDERS = "false";
    const response = await mockLeadWebhook(delivery([newLead()]));
    expect(response.status).toBe(404);
  });

  it("returns 400 for a signed but malformed payload, and 404 for an unknown organization", async () => {
    const garbage = "not json at all";
    expect((await mockLeadWebhook(delivery([], { body: garbage }))).status).toBe(400);

    const noLeads = JSON.stringify({ org_id: orgId, leads: [] });
    expect((await mockLeadWebhook(delivery([], { body: noLeads }))).status).toBe(400);

    const unknown = await mockLeadWebhook(delivery([newLead()], { org: randomUUID() }));
    expect(unknown.status).toBe(404);
  });
});

describe("mock lead webhook — idempotency (quality gate 4)", () => {
  it("creates a lead once and answers 'duplicate' to every identical redelivery", async () => {
    const lead = newLead();

    const first = await json(await mockLeadWebhook(delivery([lead])));
    expect(first.results[0].outcome).toBe("created");

    for (let attempt = 0; attempt < 5; attempt++) {
      const again = await json(await mockLeadWebhook(delivery([lead])));
      expect(again.results[0].outcome).toBe("duplicate");
    }

    expect(await countRows("leads", { org_id: orgId, external_provider: "mock", external_id: lead.id })).toBe(1);
    expect(await countRows("lead_inquiries", { org_id: orgId, external_id: lead.id })).toBe(1);
    expect(await countRows("webhook_receipts", { provider: "mock", event_key: `${orgId}:${lead.id}` })).toBe(1);
    expect(await countRows("activities", { lead_id: first.results[0].leadId as string, activity_type: "lead_imported_from_ads" })).toBe(1);
  });

  it("creates it once even when the redeliveries arrive at the same time", async () => {
    const lead = newLead();
    const responses = await Promise.all(Array.from({ length: 8 }, () => mockLeadWebhook(delivery([lead]))));
    const outcomes = (await Promise.all(responses.map(json))).map((r) => r.results[0].outcome);

    expect(outcomes.filter((o) => o === "created")).toHaveLength(1);
    expect(outcomes.every((o) => o === "created" || o === "duplicate")).toBe(true);
    expect(await countRows("leads", { org_id: orgId, external_provider: "mock", external_id: lead.id })).toBe(1);
  });

  it("handles a batch: new leads are created, replayed ones are duplicates", async () => {
    const a = newLead();
    const b = newLead();
    await mockLeadWebhook(delivery([a]));

    const batch = await json(await mockLeadWebhook(delivery([a, b])));
    const byId = Object.fromEntries(batch.results.map((r) => [r.externalId, r.outcome]));
    expect(byId[a.id]).toBe("duplicate");
    expect(byId[b.id]).toBe("created");
  });

  it("joins a returning person to their open lead instead of creating a second one", async () => {
    const phone = uniquePhone();
    const first = await json(await mockLeadWebhook(delivery([newLead({ phone })])));
    const second = await json(await mockLeadWebhook(delivery([newLead({ phone })])));

    expect(first.results[0].outcome).toBe("created");
    expect(second.results[0].outcome).toBe("merged");
    expect(second.results[0].leadId).toBe(first.results[0].leadId);
    expect(await countRows("contacts", { org_id: orgId, phone_normalized: phone })).toBe(1);
  });

  it("dedupes across phone formats and across providers' identical contacts", async () => {
    const national = "7" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    const a = await json(await mockLeadWebhook(delivery([newLead({ phone: `+91 ${national}` })])));
    const b = await json(await mockLeadWebhook(delivery([newLead({ phone: national })])));
    expect(b.results[0].outcome).toBe("merged");
    expect(b.results[0].leadId).toBe(a.results[0].leadId);
  });

  it("accepts a lead whose phone is unusable as long as it has an email", async () => {
    const result = await json(await mockLeadWebhook(delivery([newLead({ phone: "12345", email: uniqueEmail("nophone") })])));
    expect(result.results[0].outcome).toBe("created");
  });

  it("records the delivery on the receipt and updates integration health", async () => {
    const lead = newLead();
    await mockLeadWebhook(delivery([lead]));

    const { data: receipt } = await admin
      .from("webhook_receipts")
      .select("status, request_id, attempts")
      .eq("provider", "mock")
      .eq("event_key", `${orgId}:${lead.id}`)
      .single();
    expect(receipt?.status).toBe("processed");
    expect(receipt?.request_id).toBeTruthy();

    const { data: health } = await admin.from("integration_health").select("status").eq("org_id", orgId).eq("provider", "mock_lead_source").single();
    expect(health?.status).toBe("connected");
  });

  it("stores no lead payload on the receipt — only what explains what happened", async () => {
    const lead = newLead({ first_name: "Confidential", phone: uniquePhone() });
    await mockLeadWebhook(delivery([lead]));
    const { data } = await admin.from("webhook_receipts").select("*").eq("event_key", `${orgId}:${lead.id}`).single();
    expect(JSON.stringify(data)).not.toContain("Confidential");
    expect(JSON.stringify(data)).not.toContain(lead.phone as string);
  });
});

describe("webhook receipts", () => {
  it("lets a provider retry heal a failed event but ignores a redelivery of a settled one", async () => {
    const eventKey = `test:${randomUUID()}`;

    const first = await beginReceipt(admin, { provider: "test", eventKey, orgId, requestId: "req-1" });
    expect(first.alreadyHandled).toBe(false);
    await finishReceipt(admin, first.id, { status: "failed", error: new Error("boom access_token=EAAG123secret") });

    const retry = await beginReceipt(admin, { provider: "test", eventKey, orgId, requestId: "req-2" });
    expect(retry.alreadyHandled).toBe(false); // failed events are reprocessed
    expect(retry.id).toBe(first.id);
    await finishReceipt(admin, retry.id, { status: "processed" });

    const settled = await beginReceipt(admin, { provider: "test", eventKey, orgId, requestId: "req-3" });
    expect(settled.alreadyHandled).toBe(true);

    const { data } = await admin.from("webhook_receipts").select("attempts, error, status").eq("id", first.id).single();
    expect(data?.attempts).toBe(2);
    expect(data?.status).toBe("processed");
  });

  it("scrubs secrets out of a recorded error", async () => {
    const eventKey = `test:${randomUUID()}`;
    const receipt = await beginReceipt(admin, { provider: "test", eventKey, orgId, requestId: "req" });
    await finishReceipt(admin, receipt.id, { status: "failed", error: new Error("GET /x?access_token=EAAG123secret failed") });
    const { data } = await admin.from("webhook_receipts").select("error").eq("id", receipt.id).single();
    expect(data?.error).not.toContain("EAAG123secret");
  });
});

describe("rate limiting", () => {
  it("allows up to the limit within a window, then refuses, per key", async () => {
    const key = `test:${randomUUID()}`;
    const rule = { key, limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await checkRateLimit(admin, rule)).allowed);
    expect(results).toEqual([true, true, true, false, false]);

    const other = await checkRateLimit(admin, { ...rule, key: `test:${randomUUID()}` });
    expect(other.allowed).toBe(true);
  });

  it("counts correctly under concurrency", async () => {
    const rule = { key: `test:${randomUUID()}`, limit: 5, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 12 }, () => checkRateLimit(admin, rule)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("tells a refused caller how long to wait", async () => {
    const rule = { key: `test:${randomUUID()}`, limit: 1, windowSeconds: 30 };
    await checkRateLimit(admin, rule);
    const refused = await checkRateLimit(admin, rule);
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });
});

describe("integration health", () => {
  it("moves between connected, failing and disconnected, keeping a safe last error", async () => {
    await markConnected(admin, orgId, "whatsapp");
    let { data } = await admin.from("integration_health").select("*").eq("org_id", orgId).eq("provider", "whatsapp").single();
    expect(data?.status).toBe("connected");
    expect(data?.last_success_at).not.toBeNull();

    await markFailing(admin, orgId, "whatsapp", new Error("Graph API said no (access_token=EAAG123secret)"));
    ({ data } = await admin.from("integration_health").select("*").eq("org_id", orgId).eq("provider", "whatsapp").single());
    expect(data?.status).toBe("failing");
    expect(data?.last_error).not.toContain("EAAG123secret");
    expect(data?.last_error_at).not.toBeNull();

    await markDisconnected(admin, orgId, "whatsapp");
    ({ data } = await admin.from("integration_health").select("*").eq("org_id", orgId).eq("provider", "whatsapp").single());
    expect(data?.status).toBe("disconnected");
    expect(data?.last_error).toBeNull();
  });
});
