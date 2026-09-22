import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Liveness + a shallow database check, for container healthchecks and uptime
 * monitors. Public by design and deliberately uninformative: it reports only
 * whether the app can reach its database, never versions, keys or counts.
 */
export async function GET() {
  try {
    const { error } = await createAdminClient().from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    if (error) return Response.json({ status: "degraded" }, { status: 503 });
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503 });
  }
}
