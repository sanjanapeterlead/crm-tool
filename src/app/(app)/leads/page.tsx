import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listLeads } from "@/lib/services/leads";
import { listLeadStatuses, listOrgMembers } from "@/lib/services/team";
import { LEAD_SOURCES } from "@/lib/types/domain";
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

  const [statuses, members, { leads, total, page, pageSize }] = await Promise.all([
    listLeadStatuses(supabase, session.orgId),
    listOrgMembers(supabase, session),
    listLeads(supabase, session, {
      search: params.search,
      statusId: params.status,
      assignedTo: params.assigned,
      source: params.source,
      page: params.page ? Number(params.page) : 1,
    }),
  ]);

  const memberProfiles = members.map((m) => (Array.isArray(m.profile) ? m.profile[0] : m.profile)!).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">Every lead in your pipeline, in one place.</p>
        </div>
        <AddLeadDialog members={memberProfiles} />
      </div>

      <LeadFilters statuses={statuses} members={memberProfiles} sources={[...LEAD_SOURCES]} />

      <LeadsTable leads={leads as unknown as LeadRow[]} />

      <Pagination page={page} pageSize={pageSize} total={total} basePath="/leads" searchParams={params} />
    </div>
  );
}
