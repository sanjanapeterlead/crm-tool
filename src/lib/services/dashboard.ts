import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import { addDays, dueBoundaries, localDayBounds, startOfDayUtc, startOfWeekDate } from "@/lib/domain/due";
import { UserError } from "@/lib/domain/errors";
import { permissions } from "@/lib/domain/permissions";
import { chooseNextLead, type NextLead } from "@/lib/domain/today";
import { getDefaultPipeline, type PipelineStageRow } from "@/lib/services/pipelines";
import { listFollowups } from "@/lib/services/followups";
import { getOrgTimezone } from "@/lib/services/settings";

type Relation<T> = T | T[] | null;
const one = <T,>(value: Relation<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

// ---------------------------------------------------------------------------
// Salesperson "Today"
// ---------------------------------------------------------------------------

export interface TodayLead {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  source: string;
  priority: string;
  created_at: string;
}

export interface TodayFollowup {
  id: string;
  lead_id: string;
  description: string;
  type: string;
  due_date: string;
  due_time: string | null;
  lead: { id: string; first_name: string; last_name: string | null; phone: string | null } | null;
}

export interface TodayMeeting {
  id: string;
  lead_id: string;
  scheduled_start: string;
  scheduled_end: string | null;
  meeting_url: string | null;
  lead: { id: string; first_name: string; last_name: string | null } | null;
}

export interface TodayQueue {
  timezone: string;
  /** The longest-waiting leads, capped so the page stays a queue, not a database dump. */
  needsFirstContact: TodayLead[];
  /** How many in total need a first contact (can exceed what's listed). */
  needsFirstContactTotal: number;
  overdue: TodayFollowup[];
  dueToday: TodayFollowup[];
  meetingsToday: TodayMeeting[];
  /** Leads nobody owns yet, visible to reps so they can claim them. */
  unassignedCount: number;
  next: NextLead | null;
}

/**
 * The work queue a salesperson lands on: who to contact first, what's overdue,
 * what's due later today, and today's meetings. Everything is scoped to the
 * person asking (even for managers — this is *their* queue, not the team's).
 */
export async function getTodayQueue(db: SupabaseClient, session: SessionContext): Promise<TodayQueue> {
  const timezone = await getOrgTimezone(db, session.orgId);
  const { start, end } = localDayBounds(new Date(), timezone);

  const [leadsResult, overdue, dueToday, meetingsResult, poolResult] = await Promise.all([
    db
      .from("leads")
      .select("id, first_name, last_name, phone, source, priority, created_at, status:status_id!inner(is_won, is_lost)", { count: "exact" })
      .eq("org_id", session.orgId)
      .eq("assigned_to", session.user.id)
      .is("first_contacted_at", null)
      .eq("status.is_won", false)
      .eq("status.is_lost", false)
      .order("created_at", { ascending: true })
      .limit(25),
    listFollowups(db, session, "overdue", { mine: true }),
    listFollowups(db, session, "today", { mine: true }),
    db
      .from("meetings")
      .select("id, lead_id, scheduled_start, scheduled_end, meeting_url, lead:lead_id(id, first_name, last_name)")
      .eq("org_id", session.orgId)
      .eq("salesperson_id", session.user.id)
      .eq("status", "scheduled")
      .gte("scheduled_start", start.toISOString())
      .lt("scheduled_start", end.toISOString())
      .order("scheduled_start"),
    db
      .from("leads")
      .select("id, status:status_id!inner(is_won, is_lost)", { count: "exact", head: true })
      .eq("org_id", session.orgId)
      .is("assigned_to", null)
      .eq("status.is_won", false)
      .eq("status.is_lost", false),
  ]);

  if (leadsResult.error) throw new Error(`Failed to load new leads: ${leadsResult.error.message}`);
  if (meetingsResult.error) throw new Error(`Failed to load meetings: ${meetingsResult.error.message}`);
  if (poolResult.error) throw new Error(`Failed to count unassigned leads: ${poolResult.error.message}`);

  const needsFirstContact = (leadsResult.data ?? []) as unknown as TodayLead[];
  const overdueItems = overdue as unknown as TodayFollowup[];
  const dueTodayItems = dueToday as unknown as TodayFollowup[];
  const meetingsToday = (meetingsResult.data ?? []).map((m) => ({ ...m, lead: one(m.lead) })) as unknown as TodayMeeting[];

  const at = (f: TodayFollowup) => `${f.due_date}T${f.due_time ?? "23:59:59"}`;

  return {
    timezone,
    needsFirstContact,
    needsFirstContactTotal: leadsResult.count ?? needsFirstContact.length,
    overdue: overdueItems,
    dueToday: dueTodayItems,
    meetingsToday,
    unassignedCount: poolResult.count ?? 0,
    next: chooseNextLead({
      uncontacted: needsFirstContact.map((l) => ({ leadId: l.id, createdAt: l.created_at })),
      overdue: overdueItems.map((f) => ({ leadId: f.lead_id, dueAt: at(f) })),
      dueToday: dueTodayItems.map((f) => ({ leadId: f.lead_id, dueAt: at(f) })),
    }),
  };
}

// ---------------------------------------------------------------------------
// Owner / manager dashboard
// ---------------------------------------------------------------------------

export interface RepActivityRow {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  open_leads: number;
  uncontacted: number;
  calls: number;
  followups_completed: number;
  overdue_followups: number;
  meetings_completed: number;
}

export interface SourceRow {
  source: string;
  lead_count: number;
  won_count: number;
}

export interface WaitingLead {
  id: string;
  first_name: string;
  last_name: string | null;
  source: string;
  created_at: string;
  assignee: { full_name: string | null; email: string } | null;
}

export interface OwnerDashboard {
  timezone: string;
  /** Start of the week the per-rep numbers cover (Monday, org time). */
  periodStart: string;
  newLeadsToday: number;
  newLeadsThisWeek: number;
  uncontacted: number;
  longestWaiting: WaitingLead[];
  overdueFollowups: number;
  pipeline: Array<{ stage: PipelineStageRow; count: number }>;
  meetingsUpcoming: number;
  meetingsCompletedThisWeek: number;
  wonThisWeek: number;
  lostThisWeek: number;
  reps: RepActivityRow[];
  /** Lead sources over the last 30 days. */
  sources: SourceRow[];
}

/**
 * One screen answering "what is being neglected": leads nobody has touched,
 * overdue follow-ups, who's carrying what. Managers/admins only — a
 * salesperson's numbers come from `getTodayQueue`.
 */
export async function getOwnerDashboard(db: SupabaseClient, session: SessionContext): Promise<OwnerDashboard> {
  if (!permissions.canViewOwnerDashboard(session.role)) {
    throw new UserError("The team dashboard is for managers and admins.");
  }

  const orgId = session.orgId;
  const timezone = await getOrgTimezone(db, orgId);
  const now = new Date();
  const { start: dayStart, today } = localDayBounds(now, timezone);
  const weekStart = startOfDayUtc(startOfWeekDate(today), timezone);
  const { nowTime } = dueBoundaries(now, timezone);

  const [
    pipeline,
    stageCounts,
    newToday,
    newWeek,
    uncontacted,
    waiting,
    overdue,
    meetingsUpcoming,
    meetingsDone,
    won,
    lost,
    reps,
    sources,
  ] = await Promise.all([
    getDefaultPipeline(db, orgId),
    db.rpc("dashboard_stage_counts", { p_org: orgId }),
    baseLeads(db, orgId).gte("created_at", dayStart.toISOString()),
    baseLeads(db, orgId).gte("created_at", weekStart.toISOString()),
    baseLeads(db, orgId).is("first_contacted_at", null).eq("status.is_won", false).eq("status.is_lost", false),
    db
      .from("leads")
      .select("id, first_name, last_name, source, created_at, assignee:assigned_to(full_name, email), status:status_id!inner(is_won, is_lost)")
      .eq("org_id", orgId)
      .is("first_contacted_at", null)
      .eq("status.is_won", false)
      .eq("status.is_lost", false)
      .order("created_at", { ascending: true })
      .limit(5),
    db
      .from("followups")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending")
      .or(`due_date.lt.${today},and(due_date.eq.${today},due_time.lt.${nowTime})`),
    db
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .gte("scheduled_start", now.toISOString()),
    db
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "completed")
      .gte("scheduled_start", weekStart.toISOString()),
    baseLeads(db, orgId).eq("status.is_won", true).gte("closed_at", weekStart.toISOString()),
    baseLeads(db, orgId).eq("status.is_lost", true).gte("closed_at", weekStart.toISOString()),
    db.rpc("dashboard_rep_activity", { p_org: orgId, p_from: weekStart.toISOString() }),
    db.rpc("dashboard_source_breakdown", { p_org: orgId, p_from: startOfDayUtc(addDays(today, -29), timezone).toISOString() }),
  ]);

  for (const result of [stageCounts, newToday, newWeek, uncontacted, waiting, overdue, meetingsUpcoming, meetingsDone, won, lost, reps, sources]) {
    if (result.error) throw new Error(`Failed to load dashboard: ${result.error.message}`);
  }

  const countsByStage = new Map<string, number>(
    ((stageCounts.data ?? []) as Array<{ stage_id: string; lead_count: number }>).map((r) => [r.stage_id, Number(r.lead_count)])
  );

  return {
    timezone,
    periodStart: weekStart.toISOString(),
    newLeadsToday: newToday.count ?? 0,
    newLeadsThisWeek: newWeek.count ?? 0,
    uncontacted: uncontacted.count ?? 0,
    longestWaiting: (waiting.data ?? []).map((l) => ({ ...l, assignee: one(l.assignee) })) as unknown as WaitingLead[],
    overdueFollowups: overdue.count ?? 0,
    pipeline: pipeline.stages.map((stage) => ({ stage, count: countsByStage.get(stage.id) ?? 0 })),
    meetingsUpcoming: meetingsUpcoming.count ?? 0,
    meetingsCompletedThisWeek: meetingsDone.count ?? 0,
    wonThisWeek: won.count ?? 0,
    lostThisWeek: lost.count ?? 0,
    reps: ((reps.data ?? []) as RepActivityRow[]).map(numberize),
    sources: ((sources.data ?? []) as SourceRow[]).map((s) => ({
      source: s.source,
      lead_count: Number(s.lead_count),
      won_count: Number(s.won_count),
    })),
  };
}

/** A head-count query over the org's leads, joined to their stage flags. */
function baseLeads(db: SupabaseClient, orgId: string) {
  return db
    .from("leads")
    .select("id, status:status_id!inner(is_won, is_lost)", { count: "exact", head: true })
    .eq("org_id", orgId);
}

/** Postgres `count(*)` can arrive as a bigint string over some transports. */
function numberize(row: RepActivityRow): RepActivityRow {
  return {
    ...row,
    open_leads: Number(row.open_leads),
    uncontacted: Number(row.uncontacted),
    calls: Number(row.calls),
    followups_completed: Number(row.followups_completed),
    overdue_followups: Number(row.overdue_followups),
    meetings_completed: Number(row.meetings_completed),
  };
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

export async function getRecentActivity(db: SupabaseClient, session: SessionContext, limit = 10) {
  // RLS already limits a salesperson to activity on leads they can see.
  const { data, error } = await db
    .from("activities")
    .select("*, lead:lead_id(id, first_name, last_name), actor:actor_id(id, full_name, email)")
    .eq("org_id", session.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load recent activity: ${error.message}`);
  return data ?? [];
}
