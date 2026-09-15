-- Row Level Security is the hard, non-negotiable tenant-isolation boundary:
-- every table below only ever returns rows for the caller's own organization.
-- Role-based visibility (salespeople seeing only their own leads) is enforced
-- here too for defense-in-depth, and is re-checked in the server-side
-- service layer, which is the primary place business authorization lives.

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table organization_members enable row level security;
alter table lead_statuses enable row level security;
alter table leads enable row level security;
alter table notes enable row level security;
alter table meetings enable row level security;
alter table followups enable row level security;
alter table activities enable row level security;
alter table integration_settings enable row level security;

-- Whether the caller (given their org role) may access a lead they don't
-- necessarily own. Admin/manager see everything in the org; a salesperson
-- only sees leads assigned to them or that they created.
create or replace function can_access_lead(p_org uuid, p_assigned uuid, p_created uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org = current_org_id() and (
    current_org_role() in ('admin', 'manager')
    or p_assigned = auth.uid()
    or p_created = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create policy organizations_select on organizations
  for select using (is_org_member(id));

create policy organizations_update on organizations
  for update using (is_org_member(id) and current_org_role() = 'admin');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on profiles
  for select using (
    id = auth.uid()
    or id in (select user_id from organization_members where org_id = current_org_id())
  );

create policy profiles_update_self on profiles
  for update using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
create policy organization_members_select on organization_members
  for select using (org_id = current_org_id());

create policy organization_members_admin_write on organization_members
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- ---------------------------------------------------------------------------
-- lead_statuses
-- ---------------------------------------------------------------------------
create policy lead_statuses_select on lead_statuses
  for select using (org_id = current_org_id());

create policy lead_statuses_admin_write on lead_statuses
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create policy leads_select on leads
  for select using (can_access_lead(org_id, assigned_to, created_by));

create policy leads_insert on leads
  for insert with check (org_id = current_org_id());

create policy leads_update on leads
  for update using (can_access_lead(org_id, assigned_to, created_by));

create policy leads_delete on leads
  for delete using (org_id = current_org_id() and current_org_role() in ('admin', 'manager'));

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create policy notes_select on notes
  for select using (
    exists (
      select 1 from leads l
      where l.id = notes.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

create policy notes_insert on notes
  for insert with check (
    org_id = current_org_id()
    and exists (
      select 1 from leads l
      where l.id = notes.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

create policy notes_update_own on notes
  for update using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------
create policy meetings_select on meetings
  for select using (
    exists (
      select 1 from leads l
      where l.id = meetings.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

create policy meetings_write on meetings
  for all using (
    exists (
      select 1 from leads l
      where l.id = meetings.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  )
  with check (
    org_id = current_org_id()
    and exists (
      select 1 from leads l
      where l.id = meetings.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

-- ---------------------------------------------------------------------------
-- followups
-- ---------------------------------------------------------------------------
create policy followups_select on followups
  for select using (
    exists (
      select 1 from leads l
      where l.id = followups.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

create policy followups_write on followups
  for all using (
    exists (
      select 1 from leads l
      where l.id = followups.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  )
  with check (
    org_id = current_org_id()
    and exists (
      select 1 from leads l
      where l.id = followups.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

-- ---------------------------------------------------------------------------
-- activities (immutable: select + insert only, no update/delete policy)
-- ---------------------------------------------------------------------------
create policy activities_select on activities
  for select using (
    exists (
      select 1 from leads l
      where l.id = activities.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

create policy activities_insert on activities
  for insert with check (
    org_id = current_org_id()
    and exists (
      select 1 from leads l
      where l.id = activities.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

-- ---------------------------------------------------------------------------
-- integration_settings
-- ---------------------------------------------------------------------------
create policy integration_settings_select on integration_settings
  for select using (org_id = current_org_id());

create policy integration_settings_admin_write on integration_settings
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');
