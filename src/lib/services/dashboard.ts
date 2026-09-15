import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import { permissions } from "@/lib/permissions";

export async function getDashboardMetrics(supabase: SupabaseClient, session: SessionContext) {
  const scoped = !permissions.canViewAllLeads(session.role);
  const today = new Date().toISOString().slice(0, 10);

  const leadsBase = () => {
    let q = supabase.from("leads").select("id, status_id, status:status_id(is_won, is_lost)", {
      count: "exact",
      head: false,
    });
    q = q.eq("org_id", session.orgId);
    if (scoped) q = q.eq("assigned_to", session.user.id);
    return q;
  };

  const meetingsBase = (status?: string) => {
    let q = supabase.from("meetings").select("id", { count: "exact", head: true }).eq("org_id", session.orgId);
    if (scoped) q = q.eq("salesperson_id", session.user.id);
    if (status) q = q.eq("status", status);
    return q;
  };

  const followupsBase = () => {
    let q = supabase.from("followups").select("id, due_date", { count: "exact", head: false }).eq("org_id", session.orgId).eq("status", "pending");
    if (scoped) q = q.eq("assigned_to", session.user.id);
    return q;
  };

  const [leadsResult, statusesResult, meetingsScheduled, meetingsCompleted, followupsResult] = await Promise.all([
    leadsBase(),
    supabase.from("lead_statuses").select("*").eq("org_id", session.orgId).order("sort_order"),
    meetingsBase("scheduled"),
    meetingsBase("completed"),
    followupsBase(),
  ]);

  if (leadsResult.error) throw new Error(leadsResult.error.message);
  if (statusesResult.error) throw new Error(statusesResult.error.message);
  if (followupsResult.error) throw new Error(followupsResult.error.message);

  const leads = leadsResult.data ?? [];
  const statuses = statusesResult.data ?? [];
  const followups = followupsResult.data ?? [];

  const wonStatusIds = new Set(statuses.filter((s) => s.is_won).map((s) => s.id));
  const lostStatusIds = new Set(statuses.filter((s) => s.is_lost).map((s) => s.id));

  const converted = leads.filter((l) => wonStatusIds.has(l.status_id)).length;
  const lost = leads.filter((l) => lostStatusIds.has(l.status_id)).length;
  const active = leads.length - converted - lost;

  const newStatusId = statuses.find((s) => s.is_default)?.id;
  const newLeads = newStatusId ? leads.filter((l) => l.status_id === newStatusId).length : 0;

  const followupsToday = followups.filter((f) => f.due_date === today).length;
  const followupsOverdue = followups.filter((f) => f.due_date < today).length;

  const pipeline = statuses.map((status) => ({
    status,
    count: leads.filter((l) => l.status_id === status.id).length,
  }));

  return {
    totalActiveLeads: active,
    newLeads,
    meetingsScheduled: meetingsScheduled.count ?? 0,
    meetingsCompleted: meetingsCompleted.count ?? 0,
    followupsToday,
    followupsOverdue,
    converted,
    lost,
    pipeline,
  };
}

export async function getRecentActivity(supabase: SupabaseClient, session: SessionContext, limit = 10) {
  let query = supabase
    .from("activities")
    .select("*, lead:lead_id(id, first_name, last_name), actor:actor_id(id, full_name, email)")
    .eq("org_id", session.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!permissions.canViewAllLeads(session.role)) {
    const { data: myLeads } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", session.orgId)
      .or(`assigned_to.eq.${session.user.id},created_by.eq.${session.user.id}`);
    const ids = (myLeads ?? []).map((l) => l.id);
    query = query.in("lead_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load recent activity: ${error.message}`);
  return data ?? [];
}
