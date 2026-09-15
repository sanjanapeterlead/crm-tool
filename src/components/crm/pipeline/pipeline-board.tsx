import { PipelineColumn } from "@/components/crm/pipeline/pipeline-column";
import type { PipelineLead } from "@/components/crm/pipeline/lead-card";
import type { LeadStatus } from "@/lib/types/domain";

export function PipelineBoard({ statuses, leads }: { statuses: LeadStatus[]; leads: PipelineLead[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statuses.map((status) => (
        <PipelineColumn
          key={status.id}
          status={status}
          leads={leads.filter((l) => l.status_id === status.id)}
        />
      ))}
    </div>
  );
}
