import { beforeAll, describe, expect, it } from "vitest";
import { addDays, dueBoundaries } from "@/lib/domain/due";
import { captureLead } from "@/lib/services/capture";
import { logCall } from "@/lib/services/calls";
import { getOwnerDashboard, getRecentActivity, getTodayQueue } from "@/lib/services/dashboard";
import { createFollowup, listFollowups, updateFollowupStatus } from "@/lib/services/followups";
import { assignLead, changeLeadStage, getLead, getLeadTimeline, listLeads } from "@/lib/services/leads";
import { SEED_USERS, actorOf, admin, manualInput, seedOrgId, sessionFor, uniquePhone, userIdOf } from "./support";

type Ctx = Awaited<ReturnType<typeof sessionFor>>;
let orgId: string;
let manager: Ctx;
let adminUser: Ctx;
let jordan: Ctx;
let priya: Ctx;
let jordanId: string;
let timezone: string;
let today: string;

beforeAll(async () => {
  orgId = await seedOrgId();
  manager = await sessionFor(SEED_USERS.manager);
  adminUser = await sessionFor(SEED_USERS.admin);
  jordan = await sessionFor(SEED_USERS.jordan);
  priya = await sessionFor(SEED_USERS.priya);
  jordanId = await userIdOf(SEED_USERS.jordan);
  const { data: org } = await admin.from("organizations").select("timezone").eq("id", orgId).single();
  timezone = org!.timezone as string;
  today = dueBoundaries(new Date(), timezone).today;
});

async function newLeadFor(assigneeId: string | null, overrides = {}) {
  const result = await captureLead(manager.db, actorOf(manager.session), manualInput({ assigneeId, ...overrides }));
  if (result.outcome !== "created") throw new Error("setup failed");
  return result;
}

async function stageId(key: string) {
  const { data } = await admin.from("lead_statuses").select("id").eq("org_id", orgId).eq("key", key).single();
  return data!.id as string;
}

describe("lead list and detail queries", () => {
  it("lists leads for every role without a query error", async () => {
    for (const ctx of [adminUser, manager, jordan]) {
      const { leads, total } = await listLeads(ctx.db, ctx.session);
      expect(leads.length).toBeGreaterThan(0);
      expect(total).toBeGreaterThanOrEqual(leads.length);
    }
  });

  it("shows a salesperson their own leads and the unassigned pool, never a colleague's", async () => {
    const mine = await newLeadFor(jordanId);
    const theirs = await newLeadFor(await userIdOf(SEED_USERS.priya));
    const pool = await newLeadFor(null);

    const { leads } = await listLeads(jordan.db, jordan.session, { pageSize: 200 });
    const ids = new Set(leads.map((l) => l.id as string));
    expect(ids.has(mine.leadId)).toBe(true);
    expect(ids.has(pool.leadId)).toBe(true);
    expect(ids.has(theirs.leadId)).toBe(false);
  });

  it("searches by name, by phone however it is typed, and by email", async () => {
    const phone = uniquePhone();
    const email = `findme.${crypto.randomUUID().slice(0, 6)}@example.com`;
    const lead = await newLeadFor(null, { firstName: "Zorblax", lastName: "Quimby", phone, email });
    const national = phone.slice(3); // 10 digits without +91

    for (const term of ["Zorblax", "zorblax quimby", national, `+91 ${national.slice(0, 5)} ${national.slice(5)}`, email.slice(0, 12)]) {
      const { leads } = await listLeads(manager.db, manager.session, { search: term });
      expect(leads.map((l) => l.id), `search "${term}"`).toContain(lead.leadId);
    }
  });

  it("cannot be tricked by filter syntax in the search box", async () => {
    // Pre-fix, a comma/paren in the term rewrote the PostgREST filter.
    for (const term of ["x,id.not.is.null", "a),(b", 'q"r', "100%", "a\\b"]) {
      const { leads } = await listLeads(manager.db, manager.session, { search: term });
      expect(Array.isArray(leads)).toBe(true);
    }
    const { total: everything } = await listLeads(manager.db, manager.session, { pageSize: 1 });
    const { total: injected } = await listLeads(manager.db, manager.session, { search: "zzz,id.not.is.null", pageSize: 1 });
    expect(injected).toBeLessThan(everything);
  });

  it("filters by state, uncontacted, assignee, priority and created date", async () => {
    const lead = await newLeadFor(jordanId, { priority: "high" });

    const uncontacted = await listLeads(manager.db, manager.session, { uncontacted: true, pageSize: 500 });
    expect(uncontacted.leads.map((l) => l.id)).toContain(lead.leadId);

    const won = await listLeads(manager.db, manager.session, { state: "won", pageSize: 500 });
    expect(won.leads.map((l) => l.id)).not.toContain(lead.leadId);
    expect(won.leads.every((l) => (l.status as { is_won: boolean }).is_won)).toBe(true);

    const high = await listLeads(manager.db, manager.session, { priority: "high", assignedTo: jordanId, pageSize: 500 });
    expect(high.leads.map((l) => l.id)).toContain(lead.leadId);

    const todays = await listLeads(manager.db, manager.session, { createdFrom: today, createdTo: today, pageSize: 500 });
    expect(todays.leads.map((l) => l.id)).toContain(lead.leadId);
    const past = await listLeads(manager.db, manager.session, { createdTo: addDays(today, -400), pageSize: 500 });
    expect(past.leads.map((l) => l.id)).not.toContain(lead.leadId);

    const pool = await newLeadFor(null);
    const unassigned = await listLeads(manager.db, manager.session, { assignedTo: "unassigned", pageSize: 500 });
    expect(unassigned.leads.map((l) => l.id)).toContain(pool.leadId);
    expect(unassigned.leads.every((l) => l.assigned_to === null)).toBe(true);
  });

  it("filters leads by overdue and due-today follow-ups", async () => {
    const overdueLead = await newLeadFor(jordanId);
    const todayLead = await newLeadFor(jordanId);
    await createFollowup(jordan.db, jordan.session, { lead_id: overdueLead.leadId, due_date: addDays(today, -2), description: "late" });
    await createFollowup(jordan.db, jordan.session, { lead_id: todayLead.leadId, due_date: today, description: "today, no time" });

    const overdue = await listLeads(manager.db, manager.session, { due: "overdue", pageSize: 500 });
    expect(overdue.leads.map((l) => l.id)).toContain(overdueLead.leadId);
    expect(overdue.leads.map((l) => l.id)).not.toContain(todayLead.leadId);

    const dueToday = await listLeads(manager.db, manager.session, { due: "today", pageSize: 500 });
    expect(dueToday.leads.map((l) => l.id)).toContain(todayLead.leadId);
    expect(dueToday.leads.map((l) => l.id)).not.toContain(overdueLead.leadId);
  });

  it("loads a lead with its contact and a timeline that includes call logs", async () => {
    const lead = await newLeadFor(jordanId);
    await logCall(jordan.db, jordan.session, { lead_id: lead.leadId, outcome: "connected_interested", duration_minutes: 4, notes: "keen" });

    const detail = await getLead(jordan.db, lead.leadId);
    expect((detail as { contact: { id: string } }).contact.id).toBe(lead.contactId);

    const timeline = await getLeadTimeline(jordan.db, lead.leadId);
    expect(timeline.calls).toHaveLength(1);
    expect(timeline.activities.map((a) => a.activity_type)).toContain("call_logged");
  });
});

describe("the Today queue separates due work from overdue work", () => {
  it("puts each follow-up in exactly one bucket by the org's clock", async () => {
    const lead = await newLeadFor(jordanId);
    const mk = (due_date: string, description: string, due_time?: string) =>
      createFollowup(jordan.db, jordan.session, { lead_id: lead.leadId, due_date, due_time, description });

    await mk(addDays(today, -1), "yesterday");
    await mk(today, "today, no time yet");
    await mk(addDays(today, 1), "tomorrow");

    const queue = await getTodayQueue(jordan.db, jordan.session);
    const descriptions = (items: Array<{ description: string }>) => items.map((f) => f.description);

    expect(descriptions(queue.overdue)).toContain("yesterday");
    expect(descriptions(queue.dueToday)).toContain("today, no time yet");
    for (const text of ["yesterday", "today, no time yet", "tomorrow"]) {
      const buckets = [queue.overdue, queue.dueToday].filter((b) => descriptions(b).includes(text));
      expect(buckets.length, text).toBeLessThanOrEqual(1);
    }
    expect(descriptions(queue.overdue)).not.toContain("today, no time yet");
    expect(descriptions(queue.overdue)).not.toContain("tomorrow");
    expect(descriptions(queue.dueToday)).not.toContain("tomorrow");
    expect(descriptions(queue.dueToday)).not.toContain("yesterday");
  });

  it("treats a time earlier today as overdue and a later time as still due today", async () => {
    const now = dueBoundaries(new Date(), timezone);
    const hour = Number(now.nowTime.slice(0, 2));
    // Only meaningful when there is room on both sides of "now" within today.
    if (hour < 1 || hour > 22) return;

    const lead = await newLeadFor(jordanId);
    const at = (h: number) => `${String(h).padStart(2, "0")}:00`;
    await createFollowup(jordan.db, jordan.session, { lead_id: lead.leadId, due_date: today, due_time: at(hour - 1), description: "an hour ago" });
    await createFollowup(jordan.db, jordan.session, { lead_id: lead.leadId, due_date: today, due_time: at(hour + 1), description: "in an hour" });

    const queue = await getTodayQueue(jordan.db, jordan.session);
    expect(queue.overdue.map((f) => f.description)).toContain("an hour ago");
    expect(queue.dueToday.map((f) => f.description)).toContain("in an hour");
    expect(queue.dueToday.map((f) => f.description)).not.toContain("an hour ago");
    expect(queue.overdue.map((f) => f.description)).not.toContain("in an hour");
  });

  it("agrees with the /followups views for the same person", async () => {
    const queue = await getTodayQueue(jordan.db, jordan.session);
    const overdueView = await listFollowups(jordan.db, jordan.session, "overdue");
    const todayView = await listFollowups(jordan.db, jordan.session, "today");
    expect(queue.overdue.map((f) => f.id).sort()).toEqual(overdueView.map((f) => f.id as string).sort());
    expect(queue.dueToday.map((f) => f.id).sort()).toEqual(todayView.map((f) => f.id as string).sort());
  });

  it("lists new leads needing first contact and clears them once a call is logged", async () => {
    // The queue lists the longest-waiting leads first and is capped, so start from an empty backlog.
    await admin.from("leads").update({ first_contacted_at: new Date().toISOString() }).eq("assigned_to", jordanId).is("first_contacted_at", null);
    const lead = await newLeadFor(jordanId);
    const before = await getTodayQueue(jordan.db, jordan.session);
    expect(before.needsFirstContact.map((l) => l.id)).toContain(lead.leadId);
    expect(before.next).not.toBeNull();

    await logCall(jordan.db, jordan.session, { lead_id: lead.leadId, outcome: "no_answer" });
    const after = await getTodayQueue(jordan.db, jordan.session);
    expect(after.needsFirstContact.map((l) => l.id)).not.toContain(lead.leadId);
    expect(after.needsFirstContactTotal).toBe(before.needsFirstContactTotal - 1);
  });

  it("reports the true total when more leads are waiting than the queue lists", async () => {
    await admin.from("leads").update({ first_contacted_at: new Date().toISOString() }).eq("assigned_to", jordanId).is("first_contacted_at", null);
    for (let i = 0; i < 27; i++) await newLeadFor(jordanId);
    const queue = await getTodayQueue(jordan.db, jordan.session);
    expect(queue.needsFirstContact).toHaveLength(25);
    expect(queue.needsFirstContactTotal).toBe(27);
    await admin.from("leads").update({ first_contacted_at: new Date().toISOString() }).eq("assigned_to", jordanId).is("first_contacted_at", null);
  });

  it("only ever shows a person their own queue, even a manager", async () => {
    const lead = await newLeadFor(await userIdOf(SEED_USERS.priya));
    await createFollowup(manager.db, manager.session, { lead_id: lead.leadId, assigned_to: await userIdOf(SEED_USERS.priya), due_date: addDays(today, -3), description: "priya's overdue" });

    const managerQueue = await getTodayQueue(manager.db, manager.session);
    expect(managerQueue.overdue.map((f) => f.description)).not.toContain("priya's overdue");
    const priyaQueue = await getTodayQueue(priya.db, priya.session);
    expect(priyaQueue.overdue.map((f) => f.description)).toContain("priya's overdue");
  });

  it("puts the longest-waiting new lead first in 'Start next lead'", async () => {
    const queue = await getTodayQueue(jordan.db, jordan.session);
    if (queue.needsFirstContact.length < 2) return;
    expect(queue.next?.reason).toBe("new_lead");
    expect(queue.next?.leadId).toBe(queue.needsFirstContact[0].id); // ordered oldest first
  });
});

describe("the owner dashboard reflects the underlying data", () => {
  it("is refused to a salesperson", async () => {
    await expect(getOwnerDashboard(jordan.db, jordan.session)).rejects.toThrow(/managers and admins/i);
  });

  it("returns a complete dashboard for a manager and for an admin", async () => {
    for (const ctx of [manager, adminUser]) {
      const data = await getOwnerDashboard(ctx.db, ctx.session);
      expect(data.pipeline.length).toBeGreaterThanOrEqual(9);
      expect(data.reps.length).toBeGreaterThan(0);
      expect(data.sources.length).toBeGreaterThan(0);
      expect(typeof data.overdueFollowups).toBe("number");
    }
  });

  it("moves its numbers when leads, calls, follow-ups and stages change", async () => {
    const snap = () => getOwnerDashboard(manager.db, manager.session);
    const stageCount = (d: Awaited<ReturnType<typeof snap>>, key: string) => d.pipeline.find((p) => p.stage.key === key)!.count;
    const rep = (d: Awaited<ReturnType<typeof snap>>) => d.reps.find((r) => r.user_id === jordanId)!;

    const start = await snap();

    // 1. A new, unassigned-then-assigned lead nobody has contacted.
    const lead = await newLeadFor(jordanId, { source: "Instagram" });
    const afterCreate = await snap();
    expect(afterCreate.newLeadsToday).toBe(start.newLeadsToday + 1);
    expect(afterCreate.newLeadsThisWeek).toBe(start.newLeadsThisWeek + 1);
    expect(afterCreate.uncontacted).toBe(start.uncontacted + 1);
    expect(stageCount(afterCreate, "new_lead")).toBe(stageCount(start, "new_lead") + 1);
    expect(rep(afterCreate).open_leads).toBe(rep(start).open_leads + 1);
    expect(rep(afterCreate).uncontacted).toBe(rep(start).uncontacted + 1);
    const instagram = (d: typeof start) => d.sources.find((s) => s.source === "Instagram")?.lead_count ?? 0;
    expect(instagram(afterCreate)).toBe(instagram(start) + 1);

    // 2. An overdue follow-up.
    const followup = await createFollowup(jordan.db, jordan.session, { lead_id: lead.leadId, due_date: addDays(today, -1), description: "overdue for dashboard" });
    const afterOverdue = await snap();
    expect(afterOverdue.overdueFollowups).toBe(afterCreate.overdueFollowups + 1);
    expect(rep(afterOverdue).overdue_followups).toBe(rep(afterCreate).overdue_followups + 1);

    // 3. A call clears "uncontacted" and counts as activity.
    await logCall(jordan.db, jordan.session, { lead_id: lead.leadId, outcome: "connected_interested" });
    const afterCall = await snap();
    expect(afterCall.uncontacted).toBe(afterOverdue.uncontacted - 1);
    expect(rep(afterCall).calls).toBe(rep(afterOverdue).calls + 1);
    expect(rep(afterCall).uncontacted).toBe(rep(afterOverdue).uncontacted - 1);

    // 4. Completing the follow-up clears the overdue count and is credited to the rep.
    await updateFollowupStatus(jordan.db, jordan.session, followup.id as string, "completed");
    const afterDone = await snap();
    expect(afterDone.overdueFollowups).toBe(afterCall.overdueFollowups - 1);
    expect(rep(afterDone).followups_completed).toBe(rep(afterCall).followups_completed + 1);

    // 5. Moving stages moves the pipeline counts; winning is counted.
    await changeLeadStage(jordan.db, jordan.session, lead.leadId, await stageId("interested"));
    const afterInterested = await snap();
    expect(stageCount(afterInterested, "new_lead")).toBe(stageCount(afterDone, "new_lead") - 1);
    expect(stageCount(afterInterested, "interested")).toBe(stageCount(afterDone, "interested") + 1);

    await changeLeadStage(jordan.db, jordan.session, lead.leadId, await stageId("won"));
    const afterWon = await snap();
    expect(afterWon.wonThisWeek).toBe(afterInterested.wonThisWeek + 1);
    expect(stageCount(afterWon, "won")).toBe(stageCount(afterInterested, "won") + 1);
    expect(afterWon.uncontacted).toBe(afterInterested.uncontacted); // already contacted
  });

  it("counts a lead lost only when a reason is given", async () => {
    const lead = await newLeadFor(jordanId);
    await expect(changeLeadStage(jordan.db, jordan.session, lead.leadId, await stageId("lost"))).rejects.toThrow(/reason/i);
    await changeLeadStage(jordan.db, jordan.session, lead.leadId, await stageId("lost"), "Price too high");

    const { data } = await admin.from("leads").select("lost_reason, closed_at").eq("id", lead.leadId).single();
    expect(data?.lost_reason).toBe("Price too high");
    expect(data?.closed_at).not.toBeNull();
  });

  it("shows recent activity, scoped to what the viewer may see", async () => {
    const managerFeed = await getRecentActivity(manager.db, manager.session, 200);
    const jordanFeed = await getRecentActivity(jordan.db, jordan.session, 200);
    expect(managerFeed.length).toBeGreaterThan(0);
    const priyaLead = await newLeadFor(await userIdOf(SEED_USERS.priya));
    const jordanNow = await getRecentActivity(jordan.db, jordan.session, 500);
    expect(jordanNow.some((a) => (a.lead as { id: string }).id === priyaLead.leadId)).toBe(false);
    expect(jordanFeed.length).toBeGreaterThan(0);
  });
});

describe("assignment rules (DECISIONS D-012)", () => {
  it("lets a manager assign, a salesperson claim from the pool, and blocks everything else", async () => {
    const pool = await newLeadFor(null);

    // A salesperson can claim an unassigned lead for themselves…
    await assignLead(jordan.db, jordan.session, pool.leadId, jordanId);
    expect((await admin.from("leads").select("assigned_to").eq("id", pool.leadId).single()).data?.assigned_to).toBe(jordanId);

    // …but cannot then hand it to a colleague…
    await expect(assignLead(jordan.db, jordan.session, pool.leadId, await userIdOf(SEED_USERS.priya))).rejects.toThrow(/manager or admin/i);
    // …and a colleague cannot take it (they can't even see it any more).
    await expect(assignLead(priya.db, priya.session, pool.leadId, await userIdOf(SEED_USERS.priya))).rejects.toThrow();

    // A manager can reassign freely.
    await assignLead(manager.db, manager.session, pool.leadId, await userIdOf(SEED_USERS.priya));
    expect((await admin.from("leads").select("assigned_to").eq("id", pool.leadId).single()).data?.assigned_to).toBe(await userIdOf(SEED_USERS.priya));

    const { data: activities } = await admin.from("activities").select("activity_type").eq("lead_id", pool.leadId);
    expect(activities?.filter((a) => a.activity_type === "lead_assigned").length).toBeGreaterThanOrEqual(2);
  });

  it("is enforced by the database itself, not just the service", async () => {
    const lead = await newLeadFor(jordanId);
    // Jordan calling the API directly to hand his lead to Priya.
    const attempt = await jordan.db.from("leads").update({ assigned_to: await userIdOf(SEED_USERS.priya) }).eq("id", lead.leadId).select();
    expect(attempt.error?.code).toBe("42501");
  });
});
