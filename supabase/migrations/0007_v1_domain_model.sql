-- V1 domain model (see docs/DECISIONS.md D-002, D-007, D-010, D-011, D-012).
--
-- Additive and backward-compatible: every existing table and column keeps
-- working. What this adds:
--   * contacts        — the person/business, separate from the sales attempt
--   * pipelines       — parent of the stages (lead_statuses); leads is the
--                       Opportunity, lead_statuses is the PipelineStage
--   * opportunity fields (value, priority, next_action_at, lost_reason, ...)
--   * call_logs, lead_inquiries (capture idempotency), audit_events,
--     integration_health, webhook_receipts, rate_limits
--   * org-consistency constraints: a row can no longer reference a stage,
--     contact, lead or assignee that belongs to a *different* organization,
--     even when written through the service-role client
--   * removes the unused integration_settings table
--
-- Existing leads are backfilled into contacts (deduped by normalized
-- phone/email within each org) before the new columns become NOT NULL.

-- ============================================================================
-- organizations: timezone, phone country, currency
-- ============================================================================
alter table organizations
  add column timezone text not null default 'Asia/Kolkata',
  add column default_country text not null default 'IN' check (default_country ~ '^[A-Z]{2}$'),
  add column currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$');

-- ============================================================================
-- pipelines (parent of lead_statuses)
-- ============================================================================
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

-- Exactly one default pipeline per org.
create unique index idx_pipelines_one_default on pipelines (org_id) where is_default;

insert into pipelines (org_id, name, is_default)
select id, 'Sales Pipeline', true from organizations;

alter table lead_statuses add column pipeline_id uuid references pipelines (id) on delete cascade;

update lead_statuses s
set pipeline_id = p.id
from pipelines p
where p.org_id = s.org_id and p.is_default;

alter table lead_statuses alter column pipeline_id set not null;

-- Composite-FK targets (a child can then only point at a same-org parent).
alter table lead_statuses
  add constraint lead_statuses_org_id_id_key unique (org_id, id),
  add constraint lead_statuses_pipeline_id_id_key unique (pipeline_id, id),
  add constraint lead_statuses_org_pipeline_fkey
    foreign key (org_id, pipeline_id) references pipelines (org_id, id) on delete cascade;

create index idx_lead_statuses_pipeline on lead_statuses (pipeline_id, sort_order);

-- ============================================================================
-- contacts
-- ============================================================================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  first_name text not null,
  last_name text,
  -- As entered (trimmed) and in canonical E.164 / lowercase form. The
  -- *_normalized columns are the dedupe keys; they are computed in
  -- src/lib/domain/contact.ts so there is exactly one implementation.
  phone text,
  phone_normalized text,
  additional_phone text,
  additional_phone_normalized text,
  email text,
  email_normalized text,
  source text not null default 'Manual',
  source_detail text,
  tags text[] not null default '{}',
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_channel_required check (phone is not null or email is not null),
  unique (org_id, id)
);

-- One contact per person per org: enforced by the database so a race between
-- two webhook deliveries can't create duplicates.
create unique index idx_contacts_org_phone on contacts (org_id, phone_normalized)
  where phone_normalized is not null;
create unique index idx_contacts_org_email on contacts (org_id, email_normalized)
  where email_normalized is not null;
create index idx_contacts_org_created on contacts (org_id, created_at desc);
create index idx_contacts_tags on contacts using gin (tags);

-- ---------------------------------------------------------------------------
-- Backfill: one contact per distinct person among existing leads. SQL can't
-- run libphonenumber, so this helper approximates the TypeScript normalizer
-- for the common cases (+CC…, 10-digit national, 0-prefixed). It exists only
-- for this migration; new data is normalized in application code.
-- ---------------------------------------------------------------------------
create function _v1_norm_phone(p text) returns text
language sql immutable
as $$
  select case
    when p is null or btrim(p) = '' then null
    else (
      select case
        when left(btrim(p), 1) = '+' and length(d) between 8 and 15 then '+' || d
        when length(d) = 10 then '+91' || d
        when length(d) = 11 and left(d, 1) = '0' then '+91' || substr(d, 2)
        when length(d) = 12 and left(d, 2) = '91' then '+' || d
        when length(d) between 8 and 15 then '+' || d
        else null
      end
      from (select regexp_replace(p, '\D', '', 'g') as d) x
    )
  end
$$;

create function _v1_norm_email(p text) returns text
language sql immutable
as $$
  select case
    when lower(btrim(p)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then lower(btrim(p))
    else null
  end
$$;

-- The backfill below rewrites every lead; don't let that masquerade as an edit.
alter table leads disable trigger trg_leads_updated_at;

alter table leads
  add column contact_id uuid,
  add column pipeline_id uuid,
  add column value numeric(14, 2) check (value is null or value >= 0),
  add column priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  add column next_action_at timestamptz,
  add column lost_reason text,
  -- Set the first time anyone reaches out (a call is logged or a WhatsApp is
  -- sent). Null = "uncontacted", the owner dashboard's headline number.
  add column first_contacted_at timestamptz,
  -- Maintained by trigger when the stage is won/lost.
  add column closed_at timestamptz;

-- The provider set is open — each lead-source adapter registers its own id —
-- so a closed list would need a migration per integration.
alter table leads drop constraint leads_external_provider_check;
alter table leads add constraint leads_external_provider_check
  check (external_provider ~ '^[a-z][a-z0-9_]*$');

do $$
declare
  r record;
  v_phone text;
  v_email text;
  v_contact uuid;
begin
  for r in select * from leads order by created_at, id loop
    v_phone := _v1_norm_phone(r.phone);
    v_email := _v1_norm_email(r.email);
    v_contact := null;

    if v_phone is not null then
      select id into v_contact from contacts where org_id = r.org_id and phone_normalized = v_phone;
    end if;
    if v_contact is null and v_email is not null then
      select id into v_contact from contacts where org_id = r.org_id and email_normalized = v_email;
    end if;

    if v_contact is null then
      insert into contacts (
        org_id, first_name, last_name, phone, phone_normalized, email, email_normalized,
        source, created_by, created_at
      ) values (
        r.org_id, r.first_name, r.last_name, nullif(btrim(r.phone), ''), v_phone,
        nullif(btrim(r.email), ''), v_email, r.source, r.created_by, r.created_at
      ) returning id into v_contact;
    end if;

    update leads set contact_id = v_contact where id = r.id;
  end loop;
end $$;

drop function _v1_norm_phone(text);
drop function _v1_norm_email(text);

update leads l
set pipeline_id = s.pipeline_id
from lead_statuses s
where s.id = l.status_id;

update leads l
set first_contacted_at = (
  select min(a.created_at) from activities a
  where a.lead_id = l.id and a.activity_type in ('whatsapp_sent', 'status_changed')
);

update leads l
set closed_at = l.updated_at
from lead_statuses s
where s.id = l.status_id and (s.is_won or s.is_lost);

alter table leads enable trigger trg_leads_updated_at;

alter table leads
  alter column contact_id set not null,
  alter column pipeline_id set not null;

-- ============================================================================
-- Org-consistency constraints (composite foreign keys)
--
-- RLS already stops a signed-in user from *seeing* another org's rows. These
-- make the database refuse to *store* a cross-tenant reference at all, so a
-- bug in a webhook handler or a guessed UUID can't create one.
-- ============================================================================
alter table leads
  add constraint leads_org_id_id_key unique (org_id, id),
  add constraint leads_org_contact_fkey
    foreign key (org_id, contact_id) references contacts (org_id, id) on delete restrict,
  add constraint leads_org_pipeline_fkey
    foreign key (org_id, pipeline_id) references pipelines (org_id, id) on delete restrict,
  -- The stage must belong to the lead's own pipeline (and so to its org).
  add constraint leads_pipeline_stage_fkey
    foreign key (pipeline_id, status_id) references lead_statuses (pipeline_id, id),
  -- The assignee must be a member of the lead's org.
  add constraint leads_org_assignee_fkey
    foreign key (org_id, assigned_to) references organization_members (org_id, user_id)
    on delete set null (assigned_to);

create index idx_leads_contact on leads (contact_id);
create index idx_leads_org_next_action on leads (org_id, next_action_at) where next_action_at is not null;
create index idx_leads_org_uncontacted on leads (org_id, created_at) where first_contacted_at is null;

alter table followups
  add constraint followups_org_lead_fkey
    foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade,
  add constraint followups_org_assignee_fkey
    foreign key (org_id, assigned_to) references organization_members (org_id, user_id)
    on delete set null (assigned_to);

alter table meetings
  add constraint meetings_org_lead_fkey
    foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade,
  add constraint meetings_org_salesperson_fkey
    foreign key (org_id, salesperson_id) references organization_members (org_id, user_id)
    on delete set null (salesperson_id);

alter table notes
  add constraint notes_org_lead_fkey
    foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade;

alter table activities
  add column contact_id uuid,
  add constraint activities_org_lead_fkey
    foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade;

update activities a
set contact_id = l.contact_id
from leads l
where l.id = a.lead_id;

alter table activities
  add constraint activities_org_contact_fkey
    foreign key (org_id, contact_id) references contacts (org_id, id) on delete cascade;

create index idx_activities_contact on activities (contact_id, created_at desc);

alter table whatsapp_messages
  add constraint whatsapp_messages_org_lead_fkey
    foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade;

alter table meta_lead_attribution
  add constraint meta_lead_attribution_org_lead_fkey
    foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade;

-- ============================================================================
-- followups → tasks: add a type
-- ============================================================================
alter table followups
  add column type text not null default 'follow_up'
    check (type in ('follow_up', 'call', 'whatsapp', 'meeting', 'other'));

-- ============================================================================
-- call_logs (append-only record of a call the salesperson made from their own
-- phone — DECISIONS D-016)
-- ============================================================================
create table call_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null,
  contact_id uuid not null,
  -- Plain FK so the caller can be embedded (`caller:caller_id(...)`); the
  -- composite FK below additionally proves they belong to this org.
  caller_id uuid references profiles (id) on delete set null,
  outcome text not null check (
    outcome in ('connected_interested', 'no_answer', 'follow_up', 'meeting', 'not_interested', 'wrong_number')
  ),
  duration_seconds int check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 86400)),
  notes text check (notes is null or length(notes) <= 4000),
  called_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade,
  foreign key (org_id, contact_id) references contacts (org_id, id) on delete cascade,
  foreign key (org_id, caller_id) references organization_members (org_id, user_id)
    on delete set null (caller_id)
);

create index idx_call_logs_lead on call_logs (lead_id, called_at desc);
create index idx_call_logs_org_caller on call_logs (org_id, caller_id, called_at desc);

-- ============================================================================
-- lead_inquiries: one row per time someone raised their hand (a manual entry,
-- a Meta form submission, a test fixture). This is the idempotency record for
-- lead capture: the unique index makes replaying the same external event a
-- no-op, even when the event merged into an existing opportunity (in which
-- case there is no new leads row to carry the external id).
-- ============================================================================
create table lead_inquiries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  contact_id uuid not null,
  lead_id uuid not null,
  source text not null,
  external_provider text,
  external_id text,
  -- true when this inquiry created the opportunity; false when it merged into one.
  created_opportunity boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (org_id, lead_id) references leads (org_id, id) on delete cascade,
  foreign key (org_id, contact_id) references contacts (org_id, id) on delete cascade,
  constraint lead_inquiries_external_pair check ((external_provider is null) = (external_id is null))
);

create unique index idx_lead_inquiries_external
  on lead_inquiries (org_id, external_provider, external_id)
  where external_id is not null;
create index idx_lead_inquiries_lead on lead_inquiries (lead_id, created_at);

insert into lead_inquiries (org_id, contact_id, lead_id, source, external_provider, external_id, created_at)
select org_id, contact_id, id, source, external_provider, external_id, created_at
from leads;

-- ============================================================================
-- audit_events: who changed what outside a lead's own timeline (team,
-- settings, integrations). Lead changes live in `activities`.
-- ============================================================================
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index idx_audit_events_org on audit_events (org_id, created_at desc);

-- ============================================================================
-- integration_health: one row per (org, provider) so the Integrations page can
-- say connected / failing / disconnected without querying five token tables.
-- Never stores secrets; last_error is a short safe message.
-- ============================================================================
create table integration_health (
  org_id uuid not null references organizations (id) on delete cascade,
  provider text not null,
  status text not null check (status in ('connected', 'failing', 'disconnected')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 500),
  updated_at timestamptz not null default now(),
  primary key (org_id, provider)
);

-- ============================================================================
-- webhook_receipts: generic inbound-event idempotency + safe delivery log for
-- providers added after Meta (WhatsApp, Google, the mock lead source). A
-- second delivery of the same event hits the unique key and short-circuits.
-- Stores no payload — only what's needed to explain what happened.
-- ============================================================================
create table webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  org_id uuid references organizations (id) on delete cascade,
  status text not null default 'received'
    check (status in ('received', 'processed', 'duplicate', 'ignored', 'unmatched', 'failed')),
  request_id text,
  error text check (error is null or length(error) <= 500),
  attempts int not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_key)
);

create index idx_webhook_receipts_org on webhook_receipts (org_id, received_at desc);
create index idx_webhook_receipts_status on webhook_receipts (status, received_at desc);

-- ============================================================================
-- rate_limits: cross-instance fixed-window limiter (DECISIONS D-010).
-- ============================================================================
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Returns true if the call is within `p_limit` hits per `p_window_seconds`.
create function rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup so the table doesn't grow without bound.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on rate_limits from anon, authenticated;
revoke all on webhook_receipts from anon, authenticated;
-- Admins may read their org's delivery log (RLS narrows the rows); nobody but
-- the service role may write it.
grant select on webhook_receipts to authenticated;
-- The audit trail is append-only for every non-service caller.
revoke update, delete on audit_events from anon, authenticated;
revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;

-- ============================================================================
-- Triggers: keep derived columns correct no matter which code path writes.
-- ============================================================================
create trigger trg_pipelines_updated_at before update on pipelines
  for each row execute function set_updated_at();
create trigger trg_contacts_updated_at before update on contacts
  for each row execute function set_updated_at();

-- leads keeps its name/phone/email columns as a denormalized display copy of
-- the contact (so every existing query and the search box keep working).
-- Contacts are the source of truth; this trigger makes the copy unforgeable.
create function leads_apply_contact() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c contacts%rowtype;
begin
  select * into c from contacts where id = new.contact_id and org_id = new.org_id;
  if not found then
    raise exception 'contact % does not exist in this organization', new.contact_id
      using errcode = '23503';
  end if;
  new.first_name := c.first_name;
  new.last_name := c.last_name;
  new.phone := coalesce(c.phone_normalized, c.phone);
  new.email := coalesce(c.email_normalized, c.email);
  return new;
end;
$$;

create trigger trg_leads_apply_contact
  before insert or update of contact_id on leads
  for each row execute function leads_apply_contact();

create function contacts_sync_leads() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.first_name, new.last_name, new.phone, new.phone_normalized, new.email, new.email_normalized)
     is distinct from
     (old.first_name, old.last_name, old.phone, old.phone_normalized, old.email, old.email_normalized) then
    update leads
    set first_name = new.first_name,
        last_name = new.last_name,
        phone = coalesce(new.phone_normalized, new.phone),
        email = coalesce(new.email_normalized, new.email)
    where contact_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_contacts_sync_leads
  after update on contacts
  for each row execute function contacts_sync_leads();

-- Timeline rows carry the contact so a contact-level timeline needs no join.
create function activities_fill_contact() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is null then
    select contact_id into new.contact_id from leads where id = new.lead_id and org_id = new.org_id;
  end if;
  return new;
end;
$$;

create trigger trg_activities_fill_contact
  before insert on activities
  for each row execute function activities_fill_contact();

-- closed_at follows the stage.
create function leads_track_close() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_won boolean;
  v_lost boolean;
begin
  select is_won, is_lost into v_won, v_lost from lead_statuses where id = new.status_id;
  if coalesce(v_won, false) or coalesce(v_lost, false) then
    new.closed_at := coalesce(new.closed_at, now());
    if tg_op = 'UPDATE' then
      if old.status_id is distinct from new.status_id then
        new.closed_at := now();
      end if;
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger trg_leads_track_close
  before insert or update of status_id on leads
  for each row execute function leads_track_close();

-- next_action_at = the earliest pending follow-up, as an instant in the org's
-- timezone. A follow-up without a time is due by the END of its day, so it
-- becomes overdue at the org's next midnight — the same rule as
-- src/lib/domain/due.ts (classifyDue).
create function refresh_lead_next_action(p_lead uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads l
  set next_action_at = (
    select min(
      (case when f.due_time is null then (f.due_date + 1)::timestamp else (f.due_date + f.due_time) end)
        at time zone o.timezone
    )
    from followups f
    join organizations o on o.id = f.org_id
    where f.lead_id = l.id and f.status = 'pending'
  )
  where l.id = p_lead;
end;
$$;

create function followups_refresh_next_action() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform refresh_lead_next_action(new.lead_id);
  elsif tg_op = 'DELETE' then
    perform refresh_lead_next_action(old.lead_id);
  else
    perform refresh_lead_next_action(new.lead_id);
    if new.lead_id is distinct from old.lead_id then
      perform refresh_lead_next_action(old.lead_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_followups_refresh_next_action
  after insert or update or delete on followups
  for each row execute function followups_refresh_next_action();

-- Backfill next_action_at for existing pending follow-ups.
do $$
declare r record;
begin
  for r in select distinct lead_id from followups where status = 'pending' loop
    perform refresh_lead_next_action(r.lead_id);
  end loop;
end $$;

-- Assignment rule at the database level (DECISIONS D-012): a salesperson may
-- not assign a lead to someone else or take one that's already owned, even by
-- calling the API directly. Service-role callers (auth.uid() is null: webhooks,
-- default-assignee on import) are exempt.
create function leads_guard_assignment() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or current_org_role() <> 'salesperson' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.assigned_to is not null and new.assigned_to <> auth.uid() then
      raise exception 'Only a manager or admin can assign a lead to someone else.' using errcode = '42501';
    end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    if not (old.assigned_to is null and new.assigned_to = auth.uid()) then
      raise exception 'Only a manager or admin can reassign a lead.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_leads_guard_assignment
  before insert or update of assigned_to on leads
  for each row execute function leads_guard_assignment();

-- ============================================================================
-- Contact lookup for capture. A salesperson can only *see* contacts tied to
-- their own leads, but dedupe must find "this person already exists" whoever
-- owns them — otherwise two reps would race into the unique index. Returns
-- only an id, and only within the caller's own org.
-- ============================================================================
create function find_contact_for_capture(p_org uuid, p_phone_normalized text, p_email_normalized text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null and p_org is distinct from current_org_id() then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  if p_phone_normalized is not null then
    select id into v_id from contacts where org_id = p_org and phone_normalized = p_phone_normalized;
    if v_id is not null then return v_id; end if;
  end if;
  if p_email_normalized is not null then
    select id into v_id from contacts where org_id = p_org and email_normalized = p_email_normalized;
  end if;
  return v_id;
end;
$$;

revoke all on function find_contact_for_capture(uuid, text, text) from public, anon;
grant execute on function find_contact_for_capture(uuid, text, text) to authenticated, service_role;

-- The contact's currently open (not won/lost) opportunity, whoever owns it. A
-- second inquiry from the same person joins this instead of creating a
-- duplicate. Returns just enough for the caller to decide whether it may
-- write to that lead's timeline (RLS would hide the lead itself).
create function find_open_opportunity_for_capture(p_org uuid, p_contact uuid)
returns table (lead_id uuid, assigned_to uuid, created_by uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and p_org is distinct from current_org_id() then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  return query
    select l.id, l.assigned_to, l.created_by
    from leads l
    where l.org_id = p_org and l.contact_id = p_contact and l.closed_at is null
    order by l.created_at desc
    limit 1;
end;
$$;

revoke all on function find_open_opportunity_for_capture(uuid, uuid) from public, anon;
grant execute on function find_open_opportunity_for_capture(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- Unassigned pool (DECISIONS D-012): a lead nobody owns yet is visible to every
-- salesperson in the org, so a rep can claim it. Once assigned, it's visible
-- only to its owner (and its creator) as before; admins/managers see all.
-- ============================================================================
create or replace function can_access_lead(p_org uuid, p_assigned uuid, p_created uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org = current_org_id() and (
    current_org_role() in ('admin', 'manager')
    or p_assigned is null
    or p_assigned = auth.uid()
    or p_created = auth.uid()
  );
$$;

-- ============================================================================
-- Row Level Security for the new tables
-- ============================================================================
alter table pipelines enable row level security;
alter table contacts enable row level security;
alter table call_logs enable row level security;
alter table lead_inquiries enable row level security;
alter table audit_events enable row level security;
alter table integration_health enable row level security;
alter table webhook_receipts enable row level security;
alter table rate_limits enable row level security;

-- pipelines
create policy pipelines_select on pipelines
  for select using (org_id = current_org_id());
create policy pipelines_admin_write on pipelines
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- contacts: admin/manager see all; a salesperson sees contacts they created or
-- that have a lead assigned to / created by them.
create function can_access_contact(p_org uuid, p_contact uuid, p_created uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org = current_org_id() and (
    current_org_role() in ('admin', 'manager')
    or p_created = auth.uid()
    or exists (
      select 1 from leads l
      where l.contact_id = p_contact
        and (l.assigned_to is null or l.assigned_to = auth.uid() or l.created_by = auth.uid())
    )
  );
$$;

create policy contacts_select on contacts
  for select using (can_access_contact(org_id, id, created_by));
create policy contacts_insert on contacts
  for insert with check (org_id = current_org_id());
create policy contacts_update on contacts
  for update using (can_access_contact(org_id, id, created_by))
  with check (org_id = current_org_id());
create policy contacts_delete on contacts
  for delete using (org_id = current_org_id() and current_org_role() in ('admin', 'manager'));

-- call_logs: append-only (no update/delete policy), visible with the lead.
create policy call_logs_select on call_logs
  for select using (
    exists (
      select 1 from leads l
      where l.id = call_logs.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );
create policy call_logs_insert on call_logs
  for insert with check (
    org_id = current_org_id()
    and caller_id = auth.uid()
    and exists (
      select 1 from leads l
      where l.id = call_logs.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

-- lead_inquiries: written by capture, visible with the lead, never edited.
create policy lead_inquiries_select on lead_inquiries
  for select using (
    exists (
      select 1 from leads l
      where l.id = lead_inquiries.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );
create policy lead_inquiries_insert on lead_inquiries
  for insert with check (
    org_id = current_org_id()
    and exists (
      select 1 from leads l
      where l.id = lead_inquiries.lead_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

-- audit_events: admins read; any member's action may be recorded as themselves.
create policy audit_events_select on audit_events
  for select using (org_id = current_org_id() and current_org_role() = 'admin');
create policy audit_events_insert on audit_events
  for insert with check (org_id = current_org_id() and actor_id = auth.uid());

-- integration_health: every member can see status (a salesperson should know
-- WhatsApp is failing); only service-role code writes it.
create policy integration_health_select on integration_health
  for select using (org_id = current_org_id());

-- webhook_receipts: admins can see their org's delivery log; service role writes.
create policy webhook_receipts_select on webhook_receipts
  for select using (org_id = current_org_id() and current_org_role() = 'admin');

-- rate_limits: no policies — service role only.

-- ============================================================================
-- Removals (DECISIONS D-011)
-- ============================================================================
drop table integration_settings;
