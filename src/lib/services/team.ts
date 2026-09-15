import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/session";

export async function listOrgMembers(supabase: SupabaseClient, session: SessionContext) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, role, created_at, profile:user_id(id, email, full_name, avatar_url)")
    .eq("org_id", session.orgId)
    .order("created_at");

  if (error) throw new Error(`Failed to load team: ${error.message}`);
  return data ?? [];
}

export async function listLeadStatuses(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from("lead_statuses")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load lead statuses: ${error.message}`);
  return data ?? [];
}
