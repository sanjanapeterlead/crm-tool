import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";
import type { LeadFormInput } from "@/lib/validation/lead";
import { permissions } from "@/lib/permissions";
import { logActivity } from "@/lib/services/activities";

export interface LeadFilters {
  search?: string;
  statusId?: string;
  assignedTo?: string;
  source?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

export async function listLeads(
  supabase: SupabaseClient,
  session: SessionContext,
  filters: LeadFilters = {}
) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("leads")
    .select(
      "*, status:status_id(*), assignee:assigned_to(id, email, full_name), followups(id, due_date, due_time, status), activities(id, created_at)",
      { count: "exact" }
    )
    .eq("org_id", session.orgId);

  if (!permissions.canViewAllLeads(session.role)) {
    query = query.or(`assigned_to.eq.${session.user.id},created_by.eq.${session.user.id}`);
  }

  if (filters.search) {
    const term = filters.search.trim();
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
    );
  }
  if (filters.statusId) query = query.eq("status_id", filters.statusId);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.source) query = query.eq("source", filters.source);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(`Failed to list leads: ${error.message}`);

  return { leads: data ?? [], total: count ?? 0, page, pageSize };
}

export async function getLead(supabase: SupabaseClient, leadId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("*, status:status_id(*), assignee:assigned_to(id, email, full_name)")
    .eq("id", leadId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load lead: ${error.message}`);
  return data;
}

export async function getLeadTimeline(supabase: SupabaseClient, leadId: string) {
  const [notes, meetings, followups, activities] = await Promise.all([
    supabase
      .from("notes")
      .select("*, author:author_id(id, email, full_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("meetings")
      .select("*, salesperson:salesperson_id(id, email, full_name)")
      .eq("lead_id", leadId)
      .order("scheduled_start", { ascending: false }),
    supabase
      .from("followups")
      .select("*, assignee:assigned_to(id, email, full_name)")
      .eq("lead_id", leadId)
      .order("due_date", { ascending: true }),
    supabase
      .from("activities")
      .select("*, actor:actor_id(id, email, full_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
  ]);

  for (const result of [notes, meetings, followups, activities]) {
    if (result.error) throw new Error(`Failed to load lead timeline: ${result.error.message}`);
  }

  return {
    notes: notes.data ?? [],
    meetings: meetings.data ?? [],
    followups: followups.data ?? [],
    activities: activities.data ?? [],
  };
}

export async function createLead(
  supabase: SupabaseClient,
  session: SessionContext,
  input: LeadFormInput,
  defaultStatusId: string
) {
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      org_id: session.orgId,
      first_name: input.first_name,
      last_name: input.last_name || null,
      phone: input.phone || null,
      email: input.email || null,
      source: input.source,
      status_id: input.status_id || defaultStatusId,
      assigned_to: input.assigned_to || null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create lead: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId: lead.id,
    actorId: session.user.id,
    type: "lead_created",
    title: "Lead created",
    description: `${lead.first_name} ${lead.last_name ?? ""}`.trim() + " was added to the CRM.",
  });

  if (input.assigned_to) {
    await logActivity(supabase, {
      orgId: session.orgId,
      leadId: lead.id,
      actorId: session.user.id,
      type: "lead_assigned",
      title: "Assigned to salesperson",
      description: "Lead assigned during creation.",
    });
  }

  return lead;
}

export async function updateLead(
  supabase: SupabaseClient,
  session: SessionContext,
  leadId: string,
  input: LeadFormInput
) {
  const { data: lead, error } = await supabase
    .from("leads")
    .update({
      first_name: input.first_name,
      last_name: input.last_name || null,
      phone: input.phone || null,
      email: input.email || null,
      source: input.source,
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update lead: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId,
    actorId: session.user.id,
    type: "lead_updated",
    title: "Lead details updated",
  });

  return lead;
}

export async function assignLead(
  supabase: SupabaseClient,
  session: SessionContext,
  leadId: string,
  assigneeId: string,
  assigneeName: string
) {
  const { error } = await supabase
    .from("leads")
    .update({ assigned_to: assigneeId })
    .eq("id", leadId);

  if (error) throw new Error(`Failed to assign lead: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId,
    actorId: session.user.id,
    type: "lead_assigned",
    title: "Assigned to salesperson",
    description: `Lead assigned to ${assigneeName}.`,
  });
}

export async function changeLeadStatus(
  supabase: SupabaseClient,
  session: SessionContext,
  leadId: string,
  newStatusId: string,
  fromLabel: string,
  toLabel: string
) {
  const { error } = await supabase
    .from("leads")
    .update({ status_id: newStatusId })
    .eq("id", leadId);

  if (error) throw new Error(`Failed to change lead status: ${error.message}`);

  await logActivity(supabase, {
    orgId: session.orgId,
    leadId,
    actorId: session.user.id,
    type: "status_changed",
    title: `Status changed: ${fromLabel} → ${toLabel}`,
    metadata: { from: fromLabel, to: toLabel },
  });
}
