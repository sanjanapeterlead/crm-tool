import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole, Profile } from "@/lib/types/domain";

export interface SessionContext {
  user: { id: string; email: string };
  profile: Profile;
  orgId: string;
  orgName: string;
  role: OrgRole;
}

/**
 * Resolves the signed-in user's organization membership and role.
 * This is the single source of truth for "who is asking" on the server —
 * every service function takes a SessionContext rather than re-deriving it.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role, profiles:user_id(id, email, full_name, avatar_url), organizations:org_id(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return null;

  const profile = Array.isArray(membership.profiles)
    ? membership.profiles[0]
    : membership.profiles;
  const organization = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;

  if (!profile || !organization) return null;

  return {
    user: { id: user.id, email: user.email ?? "" },
    profile: profile as Profile,
    orgId: membership.org_id as string,
    orgName: (organization as { name: string }).name,
    role: membership.role as OrgRole,
  };
}

/** Redirects to /login if there is no authenticated, org-linked session. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

/** Redirects to / if the current user's role is not in `roles`. */
export async function requireRole(roles: OrgRole[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect("/");
  return session;
}
