import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * Only for trusted server paths that have no user session and therefore no
 * org context to be scoped by — today: the Meta webhook receiver, and the
 * admin-triggered flows that need Page access tokens (which are deliberately
 * unreadable through RLS). Every caller MUST scope its own queries by
 * `org_id`, because none of the policies in
 * supabase/migrations/0003_rls_policies.sql apply here.
 *
 * Never import this from a Server Component or an unauthenticated action.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for the Meta Ads integration."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
