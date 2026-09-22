import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityType } from "@/lib/types/domain";

interface LogActivityInput {
  orgId: string;
  leadId: string;
  /** Null for events the system performed with no human actor, e.g. a Meta webhook import. */
  actorId: string | null;
  type: ActivityType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Every meaningful thing that happens to a lead is logged here. Callers
 * never write directly to the `activities` table — this is the one place
 * that shape is decided, so the timeline stays consistent as new event
 * types are added.
 */
export async function logActivity(supabase: SupabaseClient, input: LogActivityInput) {
  const { error } = await supabase.from("activities").insert({
    org_id: input.orgId,
    lead_id: input.leadId,
    actor_id: input.actorId,
    activity_type: input.type,
    title: input.title,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) throw new Error(`Failed to log activity: ${error.message}`);
}
