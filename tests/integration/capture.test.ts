import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CaptureError, captureLead } from "@/lib/services/capture";
import { changeLeadStage } from "@/lib/services/leads";
import {
  SEED_USERS,
  SYSTEM,
  actorOf,
  admin,
  countRows,
  createRivalOrg,
  manualInput,
  seedOrgId,
  sessionFor,
  uniqueEmail,
  uniquePhone,
  userIdOf,
} from "./support";

let orgId: string;
let manager: Awaited<ReturnType<typeof sessionFor>>;
let jordan: Awaited<ReturnType<typeof sessionFor>>;
let priya: Awaited<ReturnType<typeof sessionFor>>;
let rival: Awaited<ReturnType<typeof createRivalOrg>>;

beforeAll(async () => {
  orgId = await seedOrgId();
  manager = await sessionFor(SEED_USERS.manager);
  jordan = await sessionFor(SEED_USERS.jordan);
  priya = await sessionFor(SEED_USERS.priya);
  rival = await createRivalOrg();
});

afterAll(async () => {
  await rival?.cleanup();
});

async function leadRow(id: string) {
  const { data } = await admin
    .from("leads")
    .select("id, contact_id, phone, first_name, assigned_to, status:status_id(key, is_default)")
    .eq("id", id)
    .single();
  return data as unknown as {
    id: string;
    contact_id: string;
    phone: string;
    first_name: string;
    assigned_to: string | null;
    status: { key: string; is_default: boolean };
  };
}

describe("captureLead — manual entry", () => {
  it("creates a contact and an opportunity in the pipeline's entry stage, with a timeline entry", async () => {
    const input = manualInput({ firstName: "Meera", phone: "98765 43210".replace("98765 43210", uniquePhone()) });
    const result = await captureLead(manager.db, actorOf(manager.session), input);

    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    const lead = await leadRow(result.leadId);
    expect(lead.status.is_default).toBe(true);
    expect(lead.status.key).toBe("new_lead");
    expect(lead.first_name).toBe("Meera");

    expect(await countRows("lead_inquiries", { lead_id: result.leadId })).toBe(1);
    const { data: activities } = await admin.from("activities").select("activity_type, contact_id").eq("lead_id", result.leadId);
    expect(activities?.map((a) => a.activity_type)).toContain("lead_created");
    // The trigger stamps the contact on every timeline row.
    expect(activities?.every((a) => a.contact_id === result.contactId)).toBe(true);
  });

  it("normalizes the phone to E.164 on the contact and the lead's display copy", async () => {
    const national = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    const result = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone: `${national.slice(0, 5)} ${national.slice(5)}` }));
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    const { data: contact } = await admin.from("contacts").select("phone_normalized").eq("id", result.contactId).single();
    expect(contact?.phone_normalized).toBe(`+91${national}`);
    expect((await leadRow(result.leadId)).phone).toBe(`+91${national}`);
  });

  it("joins an existing open lead instead of creating a duplicate — however the phone is typed", async () => {
    const national = "8" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    const first = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone: national }));
    expect(first.outcome).toBe("created");
    if (first.outcome !== "created") return;

    for (const spelling of [`+91 ${national}`, `0${national}`, `+91-${national.slice(0, 5)}-${national.slice(5)}`]) {
      const again = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone: spelling, firstName: "Repeat" }));
      expect(again.outcome).toBe("merged");
      if (again.outcome === "merged") expect(again.leadId).toBe(first.leadId);
    }

    expect(await countRows("contacts", { org_id: orgId, phone_normalized: `+91${national}` })).toBe(1);
    expect(await countRows("leads", { contact_id: first.contactId })).toBe(1);
    const { data: activities } = await admin.from("activities").select("activity_type").eq("lead_id", first.leadId);
    expect(activities?.filter((a) => a.activity_type === "lead_inquiry_received")).toHaveLength(3);
  });

  it("dedupes by email, ignoring case", async () => {
    const email = uniqueEmail("dedupe");
    const first = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone: null, email }));
    const second = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone: null, email: email.toUpperCase() }));

    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("merged");
    expect(await countRows("contacts", { org_id: orgId, email_normalized: email })).toBe(1);
  });

  it("creates a new opportunity for a returning contact once the previous one is closed", async () => {
    const phone = uniquePhone();
    const first = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone }));
    if (first.outcome !== "created") throw new Error("setup failed");

    const { data: won } = await admin.from("lead_statuses").select("id").eq("org_id", orgId).eq("is_won", true).single();
    await changeLeadStage(manager.db, manager.session, first.leadId, won!.id as string);

    const second = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone }));
    expect(second.outcome).toBe("created");
    if (second.outcome !== "created") return;

    expect(second.contactId).toBe(first.contactId);
    expect(second.leadId).not.toBe(first.leadId);
    expect(await countRows("contacts", { org_id: orgId, phone_normalized: phone })).toBe(1);
  });

  it("rejects input with no way to reach the person", async () => {
    await expect(
      captureLead(manager.db, actorOf(manager.session), manualInput({ phone: null, email: null }))
    ).rejects.toBeInstanceOf(CaptureError);
  });

  it("tells a person their phone number is invalid, but accepts a sloppy one from a webhook", async () => {
    await expect(
      captureLead(manager.db, actorOf(manager.session), manualInput({ phone: "12345", strictPhone: true }))
    ).rejects.toThrow(/valid phone/i);

    const fromWebhook = await captureLead(
      admin,
      SYSTEM(orgId),
      manualInput({ phone: "12345", email: uniqueEmail("sloppy"), strictPhone: false })
    );
    expect(fromWebhook.outcome).toBe("created");
  });
});

describe("captureLead — idempotency for external events", () => {
  it("creates exactly one lead when the same webhook is delivered many times concurrently", async () => {
    const externalId = `test-${crypto.randomUUID()}`;
    const input = manualInput({
      source: "Facebook Ad",
      external: { provider: "mock", id: externalId },
      timeline: { type: "lead_imported_from_ads", title: "Imported from Test Source" },
    });

    const results = await Promise.all(Array.from({ length: 6 }, () => captureLead(admin, SYSTEM(orgId), { ...input })));

    expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(5);

    const created = results.find((r) => r.outcome === "created");
    if (created?.outcome !== "created") throw new Error("no created result");
    expect(await countRows("leads", { org_id: orgId, external_provider: "mock", external_id: externalId })).toBe(1);
    expect(await countRows("lead_inquiries", { org_id: orgId, external_id: externalId })).toBe(1);

    const { data: activities } = await admin.from("activities").select("activity_type").eq("lead_id", created.leadId);
    expect(activities?.filter((a) => a.activity_type === "lead_imported_from_ads")).toHaveLength(1);
  });

  it("stays a no-op on replay even when the first delivery merged into an existing lead", async () => {
    const phone = uniquePhone();
    const original = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone }));
    if (original.outcome !== "created") throw new Error("setup failed");

    const externalId = `merge-${crypto.randomUUID()}`;
    const inbound = manualInput({ phone, external: { provider: "mock", id: externalId } });

    const first = await captureLead(admin, SYSTEM(orgId), inbound);
    expect(first.outcome).toBe("merged");

    const replay = await captureLead(admin, SYSTEM(orgId), inbound);
    expect(replay.outcome).toBe("duplicate");
    if (replay.outcome === "duplicate") expect(replay.createdOpportunity).toBe(false);

    const { data: activities } = await admin.from("activities").select("activity_type").eq("lead_id", original.leadId);
    expect(activities?.filter((a) => a.activity_type === "lead_inquiry_received")).toHaveLength(1);
  });

  it("runs the integration hook for a replay, so a half-finished first delivery is repaired", async () => {
    const externalId = `hook-${crypto.randomUUID()}`;
    const input = manualInput({ external: { provider: "mock", id: externalId } });
    const seen: string[] = [];
    const onCaptured = async (r: { outcome: string }) => {
      seen.push(r.outcome);
    };

    await captureLead(admin, SYSTEM(orgId), input, { onCaptured });
    await captureLead(admin, SYSTEM(orgId), input, { onCaptured });
    expect(seen).toEqual(["created", "duplicate"]);
  });

  it("treats the same external id from different providers as different events", async () => {
    const externalId = `shared-${crypto.randomUUID()}`;
    const a = await captureLead(admin, SYSTEM(orgId), manualInput({ external: { provider: "mock", id: externalId } }));
    const b = await captureLead(admin, SYSTEM(orgId), manualInput({ external: { provider: "meta", id: externalId } }));
    expect(a.outcome).toBe("created");
    expect(b.outcome).toBe("created");
  });
});

describe("captureLead — assignment and ownership", () => {
  it("lets a manager create a lead assigned to a salesperson and logs the assignment", async () => {
    const priyaId = await userIdOf(SEED_USERS.priya);
    const result = await captureLead(manager.db, actorOf(manager.session), manualInput({ assigneeId: priyaId }));
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    expect((await leadRow(result.leadId)).assigned_to).toBe(priyaId);
    const { data: activities } = await admin.from("activities").select("activity_type").eq("lead_id", result.leadId);
    expect(activities?.map((a) => a.activity_type)).toContain("lead_assigned");
  });

  it("stops a salesperson creating a lead for a colleague", async () => {
    const priyaId = await userIdOf(SEED_USERS.priya);
    await expect(
      captureLead(jordan.db, actorOf(jordan.session), manualInput({ assigneeId: priyaId }))
    ).rejects.toThrow(/only assign a new lead to yourself/i);
  });

  it("lets a salesperson create an unassigned lead or one for themselves", async () => {
    const own = await captureLead(jordan.db, actorOf(jordan.session), manualInput({ assigneeId: jordan.session.user.id }));
    const pool = await captureLead(jordan.db, actorOf(jordan.session), manualInput());
    expect(own.outcome).toBe("created");
    expect(pool.outcome).toBe("created");
  });

  it("does not write to a colleague's lead when a salesperson enters the same person", async () => {
    const phone = uniquePhone();
    const priyaId = await userIdOf(SEED_USERS.priya);
    const owned = await captureLead(manager.db, actorOf(manager.session), manualInput({ phone, assigneeId: priyaId }));
    if (owned.outcome !== "created") throw new Error("setup failed");

    const before = await countRows("activities", { lead_id: owned.leadId });
    const attempt = await captureLead(jordan.db, actorOf(jordan.session), manualInput({ phone }));

    expect(attempt.outcome).toBe("existing_restricted");
    if (attempt.outcome === "existing_restricted") expect(attempt.assigneeId).toBe(priyaId);
    expect(await countRows("activities", { lead_id: owned.leadId })).toBe(before);
    expect(await countRows("leads", { contact_id: owned.contactId })).toBe(1);
  });

  it("refuses an assignee who belongs to another organization", async () => {
    await expect(
      captureLead(manager.db, actorOf(manager.session), manualInput({ assigneeId: rival.adminId }))
    ).rejects.toThrow(/isn't a member/i);
  });

  it("keeps two organizations' contacts separate even for the same phone number", async () => {
    const phone = uniquePhone();
    const mine = await captureLead(admin, SYSTEM(orgId), manualInput({ phone }));
    const theirs = await captureLead(admin, SYSTEM(rival.orgId), manualInput({ phone }));

    expect(mine.outcome).toBe("created");
    expect(theirs.outcome).toBe("created");
    if (mine.outcome === "created" && theirs.outcome === "created") {
      expect(mine.contactId).not.toBe(theirs.contactId);
    }
  });

  it("is used by every salesperson: priya sees the unassigned pool a colleague created", async () => {
    const created = await captureLead(jordan.db, actorOf(jordan.session), manualInput());
    if (created.outcome !== "created") throw new Error("setup failed");

    const { data } = await priya.db.from("leads").select("id").eq("id", created.leadId);
    expect(data).toHaveLength(1);
  });
});
