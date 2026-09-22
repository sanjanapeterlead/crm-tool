import { Users } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listLeads, type LeadDueFilter, type LeadStateFilter } from "@/lib/services/leads";
import { permissions } from "@/lib/domain/permissions";
import { listCampaigns } from "@/lib/services/meta";
import { listLeadStatuses, listOrgMembers } from "@/lib/services/team";
import { LEAD_SOURCES } from "@/lib/types/domain";
import { PageHeader } from "@/components/crm/layout/page-header";
import { LeadFilters } from "@/components/crm/leads/lead-filters";
import { AddLeadDialog } from "@/components/crm/leads/add-lead-dialog";
import { LeadsTable, type LeadRow } from "@/components/crm/leads/leads-table";
import { Pagination } from "@/components/crm/pagination";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const [statuses, members, campaigns, { leads, total, page, pageSize }] = await Promise.all([
    listLeadStatuses(supabase, session.orgId),
    listOrgMembers(supabase, session),
    listCampaigns(supabase, session.orgId),
    listLeads(supabase, session, {
      search: params.search,
      statusId: params.status,
      assignedTo: params.assigned,
      source: params.source,
      campaignId: params.campaign,
      priority: params.priority,
      state: (["open", "won", "lost"] as const).find((s) => s === params.state) as LeadStateFilter | undefined,
      due: (["overdue", "today"] as const).find((d) => d === params.due) as LeadDueFilter | undefined,
      uncontacted: params.uncontacted === "1",
      createdFrom: params.from,
      createdTo: params.to,
      page: params.page && Number(params.page) > 0 ? Math.floor(Number(params.page)) : 1,
    }),
  ]);

  const memberProfiles = members.map((m) => (Array.isArray(m.profile) ? m.profile[0] : m.profile)!).filter(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Leads"
        description="Every lead in your pipeline, in one place."
        actions={<AddLeadDialog members={memberProfiles} canAssign={permissions.canViewAllLeads(session.role)} />}
      />

      <LeadFilters
        statuses={statuses}
        members={memberProfiles}
        sources={[...LEAD_SOURCES]}
        campaigns={campaigns}
      />

      <LeadsTable leads={leads as unknown as LeadRow[]} timezone={session.timezone} />

      <Pagination page={page} pageSize={pageSize} total={total} basePath="/leads" searchParams={params} />
    </div>
  );
}
