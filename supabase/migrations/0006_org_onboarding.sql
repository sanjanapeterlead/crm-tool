-- Organization + user onboarding.
--
-- Before this migration, the only way a user or organization could exist was
-- a direct SQL insert (see seed.sql's seed_user() helper) — there was no
-- product path to create a second organization or add a salesperson to an
-- existing one. This migration adds the constraint the app already silently
-- assumes (one org per user) and a display-only activity flag; the actual
-- enforcement mechanism for deactivation is Supabase Auth's own ban
-- mechanism (`auth.admin.updateUserById(id, { ban_duration })`), applied in
-- application code — not RLS. See ARCHITECTURE.md for why: threading a
-- second gate through current_org_id()/current_org_role()/is_org_member()
-- would touch every RLS policy in the system for no real benefit, since a
-- banned user's session already fails Supabase's own getUser() check on
-- their very next request.

-- One organization per user — the session-resolution code in
-- src/lib/auth/session.ts already assumes this (.maybeSingle() on a lookup
-- by user_id); this makes that assumption a real, enforced invariant.
alter table organization_members
  add constraint organization_members_user_id_key unique (user_id);

-- Display-only: lets the team list render active/deactivated instantly from
-- an RLS-scoped query, without every page load needing the service-role
-- admin client to check auth.users' banned_until. Kept in sync by
-- setMemberActiveAction; never itself the access-control boundary.
alter table organization_members
  add column is_active boolean not null default true;
