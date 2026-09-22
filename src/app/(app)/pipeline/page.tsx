import { Kanban } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listLeadStatuses } from "@/lib/services/team";
import { permissions } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/crm/layout/page-header";
import { PipelineBoard } from "@/components/crm/pipeline/pipeline-board";
import type { PipelineLead } from "@/components/crm/pipeline/lead-card";

export default async function PipelinePage() {
  const session = await requireSession();
  const supabase = await createClient();

  const statuses = await listLeadStatuses(supabase, session.orgId);

  let query = supabase
    .from("leads")
    .select("id, first_name, last_name, status_id, assignee:assigned_to(id, email, full_name)")
    .eq("org_id", session.orgId);

  if (!permissions.canViewAllLeads(session.role)) {
    query = query.or(`assigned_to.eq.${session.user.id},created_by.eq.${session.user.id}`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-5">
      <PageHeader icon={Kanban} title="Pipeline" description="Drag a lead card between columns to update its status." />
      <PipelineBoard statuses={statuses} leads={(data ?? []) as unknown as PipelineLead[]} />
    </div>
  );
}
