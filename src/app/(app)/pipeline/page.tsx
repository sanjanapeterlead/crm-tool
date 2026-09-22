import { Kanban } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listLeadStatuses } from "@/lib/services/team";
import { getOrganization } from "@/lib/services/settings";
import { permissions } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/crm/layout/page-header";
import { PipelineBoard } from "@/components/crm/pipeline/pipeline-board";
import type { PipelineLead } from "@/components/crm/pipeline/lead-card";

export default async function PipelinePage() {
  const session = await requireSession();
  const supabase = await createClient();
  const canViewAll = permissions.canViewAllLeads(session.role);

  let query = supabase
    .from("leads")
    .select(
      "id, first_name, last_name, status_id, source, value, priority, first_contacted_at, updated_at, assignee:assigned_to(id, email, full_name)"
    )
    .eq("org_id", session.orgId);

  if (!canViewAll) {
    query = query.or(`assigned_to.eq.${session.user.id},created_by.eq.${session.user.id}`);
  }

  const [statuses, organization, { data, error }] = await Promise.all([
    listLeadStatuses(supabase, session.orgId),
    getOrganization(supabase, session.orgId),
    query.order("updated_at", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);

  return (
    // Fills the viewport below the shell (mobile: 3.5rem header + 2rem padding;
    // desktop: 3rem padding) so columns scroll on their own, not the page.
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[32rem] flex-col gap-5 md:h-[calc(100dvh-3rem)]">
      <PageHeader
        icon={Kanban}
        title="Pipeline"
        description="Drag a card to another stage, or use its menu to move it."
      />
      <PipelineBoard
        statuses={statuses}
        leads={(data ?? []) as unknown as PipelineLead[]}
        currency={(organization.currency as string | null) ?? "INR"}
        currentUserId={session.user.id}
        showOwnerFilter={canViewAll}
      />
    </div>
  );
}
