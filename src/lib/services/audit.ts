import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export interface AuditInput {
  orgId: string;
  /** Null for system actions (a webhook disconnecting a revoked integration). */
  actorId: string | null;
  /** Dotted verb, e.g. `lead.deleted`, `team.member_deactivated`, `integration.connected`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** One human-readable line. Never put a secret or a whole payload here. */
  summary: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

/**
 * Records a change that isn't part of a lead's own timeline (team, settings,
 * integrations, deletions). Lead changes go through `logActivity` instead.
 *
 * Append-only: no update/delete policy exists, and the privileges are revoked
 * from every non-service role.
 */
export async function recordAudit(db: SupabaseClient, input: AuditInput): Promise<void> {
  const { error } = await db.from("audit_events").insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
    request_id: input.requestId ?? null,
  });

  // An audit write must never take the user's action down with it, but a
  // silent gap in the trail is worse than noise — surface it in the logs.
  if (error) logger.error("audit.write_failed", { action: input.action, error: error.message });
}

export async function listAuditEvents(db: SupabaseClient, orgId: string, limit = 50) {
  const { data, error } = await db
    .from("audit_events")
    .select("id, action, entity_type, entity_id, summary, created_at, actor:actor_id(id, full_name, email)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load audit events: ${error.message}`);
  return data ?? [];
}
