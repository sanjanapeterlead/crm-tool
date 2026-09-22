import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dueBoundaries } from "@/lib/domain/due";
import { logCall } from "@/lib/services/calls";
import { getOwnerDashboard, getTodayQueue } from "@/lib/services/dashboard";
import { updateFollowupStatus } from "@/lib/services/followups";
import { assignLead, changeLeadStage, createLead, getLeadTimeline, listLeads } from "@/lib/services/leads";
import { createMeeting, updateMeetingStatus, type CalendarRuntime } from "@/lib/services/meetings";
import { MockCalendarProvider } from "@/lib/integrations/google/mock-adapter";
import { createNote } from "@/lib/services/notes";
import { createOrganizationWithAdmin, inviteMember, DEFAULT_STATUSES } from "@/lib/services/organizations";
import { setMemberActive } from "@/lib/services/team";
import { PASSWORD, admin, sessionFor, uniquePhone } from "./support";

/**
 * The whole product story, end to end, in a brand-new organization created the
 * way a customer would: owner signs up, invites a salesperson, and a lead goes
 * from manual entry to Won (and another to Lost).
 */

const stamp = randomUUID().slice(0, 8);
const ownerEmail = `owner.${stamp}@lifecycle.example`;
const repEmail = `rep.${stamp}@lifecycle.example`;

let orgId: string;
let ownerId: string;
let repId: string;
let owner: Awaited<ReturnType<typeof sessionFor>>;
let rep: Awaited<ReturnType<typeof sessionFor>>;
let calendar: CalendarRuntime;
let stages: Record<string, string>;
let timezone: string;
let today: string;

beforeAll(async () => {
  const created = await createOrganizationWithAdmin(admin, { orgName: `Lifecycle ${stamp}`, email: ownerEmail, password: PASSWORD });
  orgId = created.orgId;
  ownerId = created.userId;
  owner = await sessionFor(ownerEmail);

  // The salesperson accepts their invite: give the invited account a password so the test can sign in as them.
  const invited = await inviteMember(admin, { orgId, email: repEmail, role: "salesperson", invitedBy: ownerId });
  repId = invited.userId;
  await admin.auth.admin.updateUserById(repId, { password: PASSWORD, email_confirm: true });
  await admin.from("profiles").update({ full_name: "Reena Rep" }).eq("id", repId);
  rep = await sessionFor(repEmail);

  const { data } = await admin.from("lead_statuses").select("id, key").eq("org_id", orgId);
  stages = Object.fromEntries((data ?? []).map((s) => [s.key as string, s.id as string]));
  timezone = owner.session.timezone;
  today = dueBoundaries(new Date(), timezone).today;
  calendar = { provider: new MockCalendarProvider(), connection: { calendarId: "primary", credential: "mock" }, mode: "demo" };
});

afterAll(async () => {
  await admin.from("organizations").delete().eq("id", orgId);
  for (const id of [ownerId, repId]) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("1. the owner creates an organization and a team member", () => {
  it("starts with the V1 pipeline: New Lead → … → Won, plus Lost, with one entry stage", async () => {
    expect(DEFAULT_STATUSES.map((s) => s.label)).toEqual([
      "New Lead", "Contact Needed", "Contacted", "Interested", "Meeting Scheduled",
      "Meeting Completed", "Payment Pending", "Won", "Lost",
    ]);
    const { data: pipelines } = await admin.from("pipelines").select("id, is_default").eq("org_id", orgId);
    expect(pipelines).toHaveLength(1);
    expect(pipelines![0].is_default).toBe(true);

    const { data: rows } = await admin.from("lead_statuses").select("key, is_default, is_won, is_lost").eq("org_id", orgId);
    expect(rows?.filter((r) => r.is_default).map((r) => r.key)).toEqual(["new_lead"]);
    expect(rows?.filter((r) => r.is_won).map((r) => r.key)).toEqual(["won"]);
    expect(rows?.filter((r) => r.is_lost).map((r) => r.key)).toEqual(["lost"]);
  });

  it("makes the founder an admin and the invited person a salesperson, in the same org", async () => {
    const { data } = await admin.from("organization_members").select("user_id, role").eq("org_id", orgId);
    expect(Object.fromEntries((data ?? []).map((m) => [m.user_id, m.role]))).toEqual({ [ownerId]: "admin", [repId]: "salesperson" });
    expect(owner.session.role).toBe("admin");
    expect(rep.session.role).toBe("salesperson");
    expect(rep.session.orgId).toBe(orgId);
  });

  it("gives the organization the India-first defaults", () => {
    expect(owner.session.timezone).toBe("Asia/Kolkata");
  });
});

describe("3. manual lead → assignment → call → follow-up → stage moves → meeting → Won", () => {
  let leadId: string;
  let phone: string;

  it("the owner creates the lead by hand; it lands in the entry stage, unassigned, uncontacted", async () => {
    phone = uniquePhone();
    const result = await createLead(owner.db, owner.session, {
      first_name: "Ananya", last_name: "Iyer", phone: phone.slice(3), email: `ananya.${stamp}@example.com`, source: "Facebook Ad", priority: "high", value: 450000,
    } as never);
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;
    leadId = result.leadId;

    const { data: lead } = await admin.from("leads").select("status_id, assigned_to, first_contacted_at, phone, priority, value").eq("id", leadId).single();
    expect(lead?.status_id).toBe(stages.new_lead);
    expect(lead?.assigned_to).toBeNull();
    expect(lead?.first_contacted_at).toBeNull();
    expect(lead?.phone).toBe(phone); // normalized to E.164 from "9876…"
    expect(lead).toMatchObject({ priority: "high" });
    expect(Number(lead?.value)).toBe(450000);
  });

  it("the salesperson can see it in the pool but cannot assign it to someone else", async () => {
    const { leads } = await listLeads(rep.db, rep.session);
    expect(leads.map((l) => l.id)).toContain(leadId);
    await expect(assignLead(rep.db, rep.session, leadId, ownerId)).rejects.toThrow(/manager or admin/i);
  });

  it("the owner assigns it to the salesperson, and it lands on their Today queue as needing first contact", async () => {
    await assignLead(owner.db, owner.session, leadId, repId);
    const queue = await getTodayQueue(rep.db, rep.session);
    expect(queue.needsFirstContact.map((l) => l.id)).toContain(leadId);
    expect(queue.next).toEqual({ leadId, reason: "new_lead" });
  });

  it("the salesperson logs a call and sets the next follow-up in one step", async () => {
    await logCall(rep.db, rep.session, {
      lead_id: leadId,
      outcome: "connected_interested",
      duration_minutes: 6,
      notes: "Wants the UK intake details",
      next_followup: { type: "call", due_date: addDays(today, -1), description: "Send fee sheet, then call back" },
    });

    const { data: lead } = await admin.from("leads").select("first_contacted_at, next_action_at").eq("id", leadId).single();
    expect(lead?.first_contacted_at).not.toBeNull();
    expect(lead?.next_action_at).not.toBeNull();

    const queue = await getTodayQueue(rep.db, rep.session);
    expect(queue.needsFirstContact.map((l) => l.id)).not.toContain(leadId);
    expect(queue.overdue.map((f) => f.description)).toContain("Send fee sheet, then call back"); // dated yesterday → overdue
  });

  it("completing the follow-up clears the overdue item and is recorded on the timeline", async () => {
    const { data: followup } = await admin.from("followups").select("id").eq("lead_id", leadId).eq("status", "pending").single();
    await updateFollowupStatus(rep.db, rep.session, followup!.id as string, "completed");

    const queue = await getTodayQueue(rep.db, rep.session);
    expect(queue.overdue.map((f) => f.description)).not.toContain("Send fee sheet, then call back");
    const { data: lead } = await admin.from("leads").select("next_action_at").eq("id", leadId).single();
    expect(lead?.next_action_at).toBeNull();
  });

  it("the salesperson moves the stage through the pipeline, each move logged with from and to", async () => {
    await createNote(rep.db, rep.session, { lead_id: leadId, content: "Sent brochure on WhatsApp" });
    await changeLeadStage(rep.db, rep.session, leadId, stages.contacted);
    await changeLeadStage(rep.db, rep.session, leadId, stages.interested);

    const { data } = await admin.from("activities").select("title, metadata").eq("lead_id", leadId).eq("activity_type", "status_changed").order("created_at");
    expect(data?.map((a) => a.title)).toEqual(["Stage changed: New Lead → Contacted", "Stage changed: Contacted → Interested"]);
    expect(data?.[1].metadata).toMatchObject({ from: "Contacted", to: "Interested" });
  });

  it("schedules a meeting on the calendar, then holds it", async () => {
    const { meetingId, calendarSync } = await createMeeting(
      rep.db,
      rep.session,
      { lead_id: leadId, scheduled_date: addDays(today, 1), scheduled_time: "16:00", duration_minutes: 30, use_calendar: true } as never,
      { calendar }
    );
    expect(calendarSync.status).toBe("synced");
    await changeLeadStage(rep.db, rep.session, leadId, stages.meeting_scheduled);

    await updateMeetingStatus(rep.db, rep.session, meetingId, "completed", { calendar });
    await changeLeadStage(rep.db, rep.session, leadId, stages.meeting_completed);
    await changeLeadStage(rep.db, rep.session, leadId, stages.payment_pending);
  });

  it("closes the deal as Won, stamping when", async () => {
    await changeLeadStage(rep.db, rep.session, leadId, stages.won);
    const { data } = await admin.from("leads").select("status_id, closed_at, lost_reason").eq("id", leadId).single();
    expect(data?.status_id).toBe(stages.won);
    expect(data?.closed_at).not.toBeNull();
    expect(data?.lost_reason).toBeNull();
  });

  it("the whole story is on one chronological timeline", async () => {
    const { activities, calls, meetings, followups, notes } = await getLeadTimeline(rep.db, leadId);
    const types = activities.map((a) => a.activity_type as string);
    for (const expected of ["lead_created", "lead_assigned", "call_logged", "followup_created", "followup_completed", "note_created", "status_changed", "meeting_scheduled", "meeting_completed"]) {
      expect(types, expected).toContain(expected);
    }
    expect(calls).toHaveLength(1);
    expect(meetings).toHaveLength(1);
    expect(followups).toHaveLength(1);
    expect(notes).toHaveLength(1);

    // Newest first, and the creation is the oldest entry.
    const times = activities.map((a) => new Date(a.created_at as string).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(activities[activities.length - 1].activity_type).toBe("lead_created");
  });

  it("the owner's dashboard counts the win and the rep's work", async () => {
    const dashboard = await getOwnerDashboard(owner.db, owner.session);
    expect(dashboard.wonThisWeek).toBe(1);
    expect(dashboard.newLeadsToday).toBeGreaterThanOrEqual(1);
    const reena = dashboard.reps.find((r) => r.user_id === repId)!;
    expect(reena.calls).toBe(1);
    expect(reena.followups_completed).toBe(1);
    expect(reena.meetings_completed).toBe(1);
    expect(dashboard.pipeline.find((p) => p.stage.key === "won")?.count).toBe(1);
    expect(dashboard.sources.find((s) => s.source === "Facebook Ad")).toMatchObject({ lead_count: 1, won_count: 1 });
  });
});

describe("3b. the Lost path", () => {
  it("won't mark a lead lost without a reason, records the reason when given, and counts it", async () => {
    const result = await createLead(rep.db, rep.session, { first_name: "Manish", last_name: "Tiwari", phone: uniquePhone().slice(3), source: "Referral" } as never);
    if (result.outcome !== "created") throw new Error("setup failed");

    await expect(changeLeadStage(rep.db, rep.session, result.leadId, stages.lost)).rejects.toThrow(/reason/i);
    await changeLeadStage(rep.db, rep.session, result.leadId, stages.lost, "Chose a competitor");

    const { data } = await admin.from("leads").select("lost_reason, closed_at").eq("id", result.leadId).single();
    expect(data).toMatchObject({ lost_reason: "Chose a competitor" });
    expect(data?.closed_at).not.toBeNull();
    expect((await getOwnerDashboard(owner.db, owner.session)).lostThisWeek).toBe(1);
  });

  it("a revived lead loses its stale reason", async () => {
    const result = await createLead(rep.db, rep.session, { first_name: "Revive", phone: uniquePhone().slice(3), source: "Manual" } as never);
    if (result.outcome !== "created") throw new Error("setup failed");
    await changeLeadStage(rep.db, rep.session, result.leadId, stages.lost, "No response");
    await changeLeadStage(rep.db, rep.session, result.leadId, stages.contacted);

    const { data } = await admin.from("leads").select("lost_reason, closed_at").eq("id", result.leadId).single();
    expect(data?.lost_reason).toBeNull();
    expect(data?.closed_at).toBeNull();
  });
});

describe("team lifecycle", () => {
  it("deactivating a salesperson bans their sign-in and can be reversed", async () => {
    await setMemberActive(admin, { orgId, targetUserId: repId, actingUserId: ownerId, isActive: false });
    const { error } = await (await import("./support")).anonClient().auth.signInWithPassword({ email: repEmail, password: PASSWORD });
    expect(error).not.toBeNull();

    await setMemberActive(admin, { orgId, targetUserId: repId, actingUserId: ownerId, isActive: true });
    const { error: back } = await (await import("./support")).anonClient().auth.signInWithPassword({ email: repEmail, password: PASSWORD });
    expect(back).toBeNull();
  });
});
