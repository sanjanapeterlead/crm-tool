-- ============================================================================
-- updated_at maintenance
-- ============================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at before update on organizations
  for each row execute function set_updated_at();
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger trg_notes_updated_at before update on notes
  for each row execute function set_updated_at();
create trigger trg_meetings_updated_at before update on meetings
  for each row execute function set_updated_at();
create trigger trg_followups_updated_at before update on followups
  for each row execute function set_updated_at();
create trigger trg_integration_settings_updated_at before update on integration_settings
  for each row execute function set_updated_at();

-- ============================================================================
-- Auto-create a profile row whenever a Supabase auth user is created.
-- ============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Authorization helper functions (used by RLS policies and app code).
-- security definer + fixed search_path so they can safely read
-- organization_members regardless of caller-level RLS.
-- ============================================================================
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from organization_members where user_id = auth.uid() limit 1;
$$;

create or replace function current_org_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from organization_members where user_id = auth.uid() limit 1;
$$;

create or replace function is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where user_id = auth.uid() and org_id = target_org
  );
$$;
