import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as whatsappWebhook } from "@/app/api/webhooks/whatsapp/route";
import { resolveWhatsApp } from "@/lib/composition/whatsapp";
import { captureLead } from "@/lib/services/capture";
import {
  getConversationState,
  listMessagesForLead,
  sendTemplateMessage,
  sendTextMessage,
  type WhatsAppRuntime,
} from "@/lib/services/conversations";
import { SEED_USERS, SYSTEM, admin, countRows, createRivalOrg, manualInput, seedOrgId, sessionFor, uniquePhone, uniquePhoneEndingIn, userIdOf } from "./support";

const MOCK_SECRET = "dev-mock-webhook-secret";
let orgId: string;
let runtime: WhatsAppRuntime;
let managerId: string;
let templateId: string;
let rival: Awaited<ReturnType<typeof createRivalOrg>>;

beforeAll(async () => {
  orgId = await seedOrgId();
  managerId = await userIdOf(SEED_USERS.manager);
  const resolved = await resolveWhatsApp(admin, orgId);
  if (!resolved) throw new Error("expected demo mode in tests");
  runtime = resolved;
  const { data } = await admin.from("whatsapp_templates").select("id").eq("org_id", orgId).eq("name", "welcome_intro").single();
  templateId = data!.id as string;
  rival = await createRivalOrg();
});

afterAll(async () => {
  await rival?.cleanup();
});

async function leadWithPhone(phone = uniquePhone(), extra = {}) {
  const result = await captureLead(admin, SYSTEM(orgId), manualInput({ phone, ...extra }));
  if (result.outcome !== "created") throw new Error("setup failed");
  return { ...result, phone };
}

const sendTemplate = (leadId: string) =>
  sendTemplateMessage(admin, runtime, { orgId, leadId, templateId, variableValues: ["Riya"], sentByUserId: managerId });

function inboundBody(phone: string, options: { id?: string; text?: string; numberId?: string } = {}) {
  const from = phone.replace(/^\+/, "");
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: options.numberId ?? `mock:${orgId}` },
              contacts: [{ wa_id: from, profile: { name: "Riya" } }],
              messages: [{ from, id: options.id ?? `mock.in.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: options.text ?? "Hello" } }],
            },
          },
        ],
      },
    ],
  });
}

function statusBody(messageId: string, status: string, errors?: unknown[], numberId = `mock:${orgId}`) {
  return JSON.stringify({
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: numberId }, statuses: [{ id: messageId, status, timestamp: String(Math.floor(Date.now() / 1000)), ...(errors ? { errors } : {}) }] } }] }],
  });
}

function post(body: string, headerName = "x-mock-signature", secret = MOCK_SECRET, signed = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signed) headers[headerName] = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
  return whatsappWebhook(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", body, headers }));
}

async function results(response: Response) {
  return ((await response.json()) as { results: Array<{ outcome: string; kind: string }> }).results;
}

describe("demo mode selection", () => {
  it("uses the mock adapter, flagged as demo, when the org has no real WhatsApp connection", () => {
    expect(runtime.mode).toBe("demo");
    expect(runtime.provider.isMock).toBe(true);
  });
});

describe("sending (quality gate 5)", () => {
  it("records an outbound template on the timeline and marks the lead contacted", async () => {
    const lead = await leadWithPhone();
    const result = await sendTemplate(lead.leadId);
    expect(result.status).toBe("sent");

    const messages = await listMessagesForLead(admin, lead.leadId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: "outbound", message_type: "template", template_name: "welcome_intro", status: "sent" });
    expect(messages[0].rendered_body).toBe("Hi Riya, thanks for your interest in Summit Sales Group! When is a good time for a quick call?");

    const { data: activities } = await admin.from("activities").select("activity_type, title").eq("lead_id", lead.leadId);
    expect(activities?.some((a) => a.activity_type === "whatsapp_sent")).toBe(true);
    expect(activities?.find((a) => a.activity_type === "whatsapp_sent")?.title).toMatch(/demo mode/i);

    const { data: row } = await admin.from("leads").select("first_contacted_at").eq("id", lead.leadId).single();
    expect(row?.first_contacted_at).not.toBeNull();
  });

  it("records a failed send explicitly: a failed message, a timeline entry, and the lead stays uncontacted", async () => {
    const lead = await leadWithPhone(uniquePhoneEndingIn("0000")); // the mock rejects numbers ending 0000
    const result = await sendTemplate(lead.leadId);
    expect(result).toMatchObject({ status: "failed", code: "invalid_recipient" });

    const messages = await listMessagesForLead(admin, lead.leadId);
    expect(messages[0]).toMatchObject({ status: "failed", error_code: "invalid_recipient" });
    expect(messages[0].error).toMatch(/not on whatsapp/i);

    const { data: activities } = await admin.from("activities").select("activity_type").eq("lead_id", lead.leadId);
    expect(activities?.some((a) => a.activity_type === "whatsapp_failed")).toBe(true);
    expect(activities?.some((a) => a.activity_type === "whatsapp_sent")).toBe(false);

    const { data: row } = await admin.from("leads").select("first_contacted_at").eq("id", lead.leadId).single();
    expect(row?.first_contacted_at).toBeNull();
  });

  it("does not turn the integration 'failing' because one contact's number is bad", async () => {
    await admin.from("integration_health").delete().eq("org_id", orgId).eq("provider", "whatsapp");
    await sendTemplate((await leadWithPhone(uniquePhoneEndingIn("0000"))).leadId);
    const { data } = await admin.from("integration_health").select("status").eq("org_id", orgId).eq("provider", "whatsapp");
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses an unapproved template, an unfilled variable, a missing template and an unknown lead", async () => {
    const lead = await leadWithPhone();
    await admin.from("whatsapp_templates").update({ status: "PENDING" }).eq("id", templateId);
    await expect(sendTemplate(lead.leadId)).rejects.toThrow(/not approved/i);
    await admin.from("whatsapp_templates").update({ status: "APPROVED" }).eq("id", templateId);

    await expect(sendTemplateMessage(admin, runtime, { orgId, leadId: lead.leadId, templateId, variableValues: [], sentByUserId: managerId })).rejects.toThrow(/every template variable/i);
    await expect(sendTemplateMessage(admin, runtime, { orgId, leadId: lead.leadId, templateId: randomUUID(), variableValues: ["x"], sentByUserId: managerId })).rejects.toThrow(/unknown template/i);
    await expect(sendTemplate(randomUUID())).rejects.toThrow(/lead not found/i);
  });

  it("will not use another organization's template or lead", async () => {
    const theirs = await captureLead(admin, SYSTEM(rival.orgId), manualInput());
    if (theirs.outcome !== "created") throw new Error("setup failed");
    await expect(sendTemplate(theirs.leadId)).rejects.toThrow(/lead not found/i);
  });
});

describe("the 24-hour reply window", () => {
  it("blocks free text until the customer messages first, then allows it, then blocks again after 24h", async () => {
    const lead = await leadWithPhone();
    await sendTemplate(lead.leadId);

    await expect(sendTextMessage(admin, runtime, { orgId, leadId: lead.leadId, body: "Hello?", sentByUserId: managerId })).rejects.toThrow(/24-hour/i);
    expect((await getConversationState(admin, lead.leadId)).windowOpen).toBe(false);

    await post(inboundBody(lead.phone, { text: "Yes, tell me more" }));
    expect((await getConversationState(admin, lead.leadId)).windowOpen).toBe(true);

    const sent = await sendTextMessage(admin, runtime, { orgId, leadId: lead.leadId, body: "Of course — here are the details.", sentByUserId: managerId });
    expect(sent.status).toBe("sent");

    await admin.from("conversations").update({ last_inbound_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("org_id", orgId).eq("contact_id", lead.contactId);
    await expect(sendTextMessage(admin, runtime, { orgId, leadId: lead.leadId, body: "Still there?", sentByUserId: managerId })).rejects.toThrow(/24-hour/i);
  });

  it("rejects empty and oversized text", async () => {
    const lead = await leadWithPhone();
    await expect(sendTextMessage(admin, runtime, { orgId, leadId: lead.leadId, body: "   ", sentByUserId: managerId })).rejects.toThrow(/write a message/i);
    await expect(sendTextMessage(admin, runtime, { orgId, leadId: lead.leadId, body: "x".repeat(5000), sentByUserId: managerId })).rejects.toThrow(/4096/);
  });
});

describe("inbound webhook", () => {
  it("rejects a delivery with no signature or a wrong one, storing nothing", async () => {
    const lead = await leadWithPhone();
    const body = inboundBody(lead.phone, { id: `mock.in.${randomUUID()}` });
    expect((await post(body, "x-mock-signature", MOCK_SECRET, false)).status).toBe(401);
    expect((await post(body, "x-mock-signature", "wrong-secret")).status).toBe(401);
    expect(await countRows("whatsapp_messages", { lead_id: lead.leadId })).toBe(0);
  });

  it("links a reply to the right contact, lead and conversation, and shows it on the timeline", async () => {
    const lead = await leadWithPhone();
    const outcomes = await results(await post(inboundBody(lead.phone, { text: "I'm interested" })));
    expect(outcomes).toEqual([{ providerMessageId: expect.any(String), kind: "message", outcome: "processed" }]);

    const messages = await listMessagesForLead(admin, lead.leadId);
    expect(messages[0]).toMatchObject({ direction: "inbound", status: "received", rendered_body: "I'm interested", from_phone: lead.phone });

    const { data: activities } = await admin.from("activities").select("activity_type, description, actor_id").eq("lead_id", lead.leadId);
    const received = activities?.find((a) => a.activity_type === "whatsapp_received");
    expect(received).toMatchObject({ description: "I'm interested", actor_id: null });
  });

  it("applies the same delivery only once, however many times it is redelivered", async () => {
    const lead = await leadWithPhone();
    const body = inboundBody(lead.phone, { id: `mock.in.${randomUUID()}` });

    const first = await results(await post(body));
    expect(first[0].outcome).toBe("processed");
    for (let i = 0; i < 4; i++) expect((await results(await post(body)))[0].outcome).toBe("duplicate");

    expect(await countRows("whatsapp_messages", { lead_id: lead.leadId })).toBe(1);
    expect(await countRows("activities", { lead_id: lead.leadId, activity_type: "whatsapp_received" })).toBe(1);
  });

  it("applies concurrent redeliveries once", async () => {
    const lead = await leadWithPhone();
    const body = inboundBody(lead.phone, { id: `mock.in.${randomUUID()}` });
    await Promise.all(Array.from({ length: 6 }, () => post(body)));
    expect(await countRows("whatsapp_messages", { lead_id: lead.leadId })).toBe(1);
    expect(await countRows("activities", { lead_id: lead.leadId, activity_type: "whatsapp_received" })).toBe(1);
  });

  it("matches a number typed differently in the CRM", async () => {
    const national = "6" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    const lead = await leadWithPhone(national); // stored as +91<national>
    const outcomes = await results(await post(inboundBody(`+91${national}`)));
    expect(outcomes[0].outcome).toBe("processed");
    expect(await countRows("whatsapp_messages", { lead_id: lead.leadId })).toBe(1);
  });

  it("does not create a contact for a stranger who messages the number", async () => {
    const stranger = uniquePhone();
    const before = await countRows("contacts", { org_id: orgId });
    const outcomes = await results(await post(inboundBody(stranger)));
    expect(outcomes[0].outcome).toBe("unmatched");
    expect(await countRows("contacts", { org_id: orgId })).toBe(before);
  });

  it("reports a message for a number no organization owns as unmatched", async () => {
    const lead = await leadWithPhone();
    const outcomes = await results(await post(inboundBody(lead.phone, { numberId: "999-not-ours" })));
    expect(outcomes[0].outcome).toBe("unmatched");
    expect(await countRows("whatsapp_messages", { lead_id: lead.leadId })).toBe(0);
  });

  it("never lets a reply into one tenant land in another, even for the same phone number", async () => {
    const phone = uniquePhone();
    const mine = await leadWithPhone(phone);
    const theirs = await captureLead(admin, SYSTEM(rival.orgId), manualInput({ phone }));
    if (theirs.outcome !== "created") throw new Error("setup failed");

    await post(inboundBody(phone, { numberId: `mock:${orgId}` }));
    expect(await countRows("whatsapp_messages", { lead_id: mine.leadId })).toBe(1);
    expect(await countRows("whatsapp_messages", { lead_id: theirs.leadId })).toBe(0);
  });

  it("does not let the *real* Meta signature address a tenant with the demo-only 'mock:' number id", async () => {
    const lead = await leadWithPhone();
    const secret = process.env.META_APP_SECRET;
    if (!secret) return; // Meta isn't configured in this environment
    const response = await post(inboundBody(lead.phone), "x-hub-signature-256", secret);
    expect(response.status).toBe(200);
    expect((await results(response))[0].outcome).toBe("unmatched");
    expect(await countRows("whatsapp_messages", { lead_id: lead.leadId })).toBe(0);
  });

  it("stores the message under the org's own RLS: a rival org's admin cannot read it", async () => {
    const lead = await leadWithPhone();
    await post(inboundBody(lead.phone));
    const rivalSession = await sessionFor(rival.adminEmail);
    const { data } = await rivalSession.db.from("whatsapp_messages").select("id").eq("lead_id", lead.leadId);
    expect(data ?? []).toHaveLength(0);
    const { data: conversations } = await rivalSession.db.from("conversations").select("id").eq("contact_id", lead.contactId);
    expect(conversations ?? []).toHaveLength(0);
  });
});

describe("delivery receipts", () => {
  it("moves a message from sent to delivered to read", async () => {
    const lead = await leadWithPhone();
    await sendTemplate(lead.leadId);
    const [message] = await listMessagesForLead(admin, lead.leadId);
    const wamid = (await admin.from("whatsapp_messages").select("wa_message_id").eq("id", message.id).single()).data!.wa_message_id as string;

    await post(statusBody(wamid, "delivered"));
    expect((await listMessagesForLead(admin, lead.leadId))[0].status).toBe("delivered");
    await post(statusBody(wamid, "read"));
    const row = (await admin.from("whatsapp_messages").select("status, delivered_at, read_at").eq("id", message.id).single()).data!;
    expect(row.status).toBe("read");
    expect(row.delivered_at).not.toBeNull();
    expect(row.read_at).not.toBeNull();
  });

  it("does not move backwards when receipts arrive late or repeated", async () => {
    const lead = await leadWithPhone();
    await sendTemplate(lead.leadId);
    const [message] = await listMessagesForLead(admin, lead.leadId);
    const wamid = (await admin.from("whatsapp_messages").select("wa_message_id").eq("id", message.id).single()).data!.wa_message_id as string;

    await post(statusBody(wamid, "read"));
    const late = await results(await post(statusBody(wamid, "delivered")));
    expect(late[0].outcome).toBe("ignored");
    expect((await listMessagesForLead(admin, lead.leadId))[0].status).toBe("read");
    expect((await results(await post(statusBody(wamid, "read"))))[0].outcome).toBe("duplicate");
  });

  it("surfaces an asynchronous delivery failure on the message and the timeline", async () => {
    const lead = await leadWithPhone();
    await sendTemplate(lead.leadId);
    const [message] = await listMessagesForLead(admin, lead.leadId);
    const wamid = (await admin.from("whatsapp_messages").select("wa_message_id").eq("id", message.id).single()).data!.wa_message_id as string;

    await post(statusBody(wamid, "failed", [{ code: 131026, title: "Message undeliverable" }]));
    const updated = (await listMessagesForLead(admin, lead.leadId))[0];
    expect(updated.status).toBe("failed");
    expect(updated.error_code).toBe("131026");

    const { data: activities } = await admin.from("activities").select("activity_type").eq("lead_id", lead.leadId);
    expect(activities?.some((a) => a.activity_type === "whatsapp_failed")).toBe(true);
  });

  it("reports a receipt for a message we never sent as unmatched", async () => {
    const outcomes = await results(await post(statusBody(`mock.wamid.${randomUUID()}`, "delivered")));
    expect(outcomes[0].outcome).toBe("unmatched");
  });
});

describe("consent", () => {
  it("records an opt-out when the customer replies STOP, and blocks every later send", async () => {
    const lead = await leadWithPhone();
    await sendTemplate(lead.leadId);
    await post(inboundBody(lead.phone, { text: "STOP" }));

    const { data: contact } = await admin.from("contacts").select("whatsapp_consent_status, whatsapp_consent_source, whatsapp_consent_at").eq("id", lead.contactId).single();
    expect(contact?.whatsapp_consent_status).toBe("opted_out");
    expect(contact?.whatsapp_consent_at).not.toBeNull();

    await expect(sendTemplate(lead.leadId)).rejects.toThrow(/opted out/i);
    await expect(sendTextMessage(admin, runtime, { orgId, leadId: lead.leadId, body: "hi", sentByUserId: managerId })).rejects.toThrow(/opted out/i);
    expect((await getConversationState(admin, lead.leadId)).consent).toBe("opted_out");
  });

  it("does not mistake an ordinary sentence containing 'stop' for an opt-out", async () => {
    const lead = await leadWithPhone();
    await post(inboundBody(lead.phone, { text: "Please don't stop calling me" }));
    const { data } = await admin.from("contacts").select("whatsapp_consent_status").eq("id", lead.contactId).single();
    expect(data?.whatsapp_consent_status).toBe("unknown");
  });
});
