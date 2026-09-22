import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { permissions } from "@/lib/domain/permissions";
import { getOwnerDashboard, getRecentActivity, getTodayQueue } from "@/lib/services/dashboard";
import { listOrgMembers } from "@/lib/services/team";
import { OwnerDashboardView } from "@/components/crm/dashboard/owner-dashboard";
import { TodayView } from "@/components/crm/dashboard/today-view";
import type { Activity, Lead, Profile } from "@/lib/types/domain";

/**
 * Home. A salesperson lands on their work queue; an owner or manager lands on
 * what's being neglected. Both are one screen — no chart hunting.
 */
export default async function HomePage() {
  const session = await requireSession();
  const supabase = await createClient();

  if (permissions.canViewOwnerDashboard(session.role)) {
    const [data, activity] = await Promise.all([
      getOwnerDashboard(supabase, session),
      getRecentActivity(supabase, session),
    ]);
    return (
      <OwnerDashboardView
        data={data}
        orgName={session.orgName}
        activity={
          activity as unknown as (Activity & {
            lead: Pick<Lead, "id" | "first_name" | "last_name">;
            actor: Profile | null;
          })[]
        }
      />
    );
  }

  const [queue, members] = await Promise.all([getTodayQueue(supabase, session), listOrgMembers(supabase, session)]);
  const profiles = members
    .map((m) => (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile)
    .filter(Boolean);

  return <TodayView queue={queue} members={profiles} />;
}
