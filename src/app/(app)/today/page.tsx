import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTodayQueue } from "@/lib/services/dashboard";
import { listOrgMembers } from "@/lib/services/team";
import { permissions } from "@/lib/domain/permissions";
import { TodayView } from "@/components/crm/dashboard/today-view";
import type { Profile } from "@/lib/types/domain";

/** Everyone's personal work queue — managers and admins included (their own leads, not the team's). */
export default async function TodayPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [queue, members] = await Promise.all([getTodayQueue(supabase, session), listOrgMembers(supabase, session)]);
  const profiles = members
    .map((m) => (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile)
    .filter(Boolean);

  return <TodayView queue={queue} members={profiles} heading="My Today" canAssign={permissions.canViewAllLeads(session.role)} />;
}
