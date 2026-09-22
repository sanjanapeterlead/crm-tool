-- Calendar: Google Calendar / Meet behind a provider boundary (DECISIONS D-015).
--
-- `meetings` was a record of a meeting scheduled elsewhere (Calendly link-out).
-- It now also records which provider created the calendar event, that event's
-- id, and the attendees, so a meeting scheduled from the CRM is a real calendar
-- event with a Meet link — and any other provider (DaySchedule, Calendly API)
-- can be added later without touching the meeting model.

-- ============================================================================
-- calendar_connections (one per org in V1; non-secret metadata)
-- ============================================================================
create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations (id) on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text not null,
  calendar_id text not null default 'primary',
  scopes text[] not null default '{}',
  connected_by uuid references profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_calendar_connections_updated_at before update on calendar_connections
  for each row execute function set_updated_at();

-- ============================================================================
-- calendar_tokens (SECRET — service role only; the value is also AES-GCM
-- encrypted by the application, see src/lib/security/crypto.ts)
-- ============================================================================
create table calendar_tokens (
  org_id uuid primary key references organizations (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- meetings: provider, external event, sync state
-- ============================================================================
alter table meetings
  add column provider text not null default 'manual'
    check (provider in ('manual', 'calendly', 'google', 'mock')),
  add column title text,
  add column external_event_id text,
  add column external_event_url text,
  -- Set when creating/updating the calendar event failed: the meeting is saved
  -- either way (the salesperson still has it), but it must not look synced.
  add column sync_error text check (sync_error is null or length(sync_error) <= 500);

update meetings set provider = 'calendly' where meeting_type = 'calendly' and external_booking_url is not null;
alter table meetings drop column meeting_type;

alter table meetings add constraint meetings_org_id_id_key unique (org_id, id);

-- A given calendar event belongs to exactly one meeting.
create unique index idx_meetings_external_event
  on meetings (org_id, provider, external_event_id)
  where external_event_id is not null;

-- ============================================================================
-- meeting_attendees
-- ============================================================================
create table meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  meeting_id uuid not null,
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name text,
  role text not null default 'guest' check (role in ('salesperson', 'contact', 'guest')),
  created_at timestamptz not null default now(),
  foreign key (org_id, meeting_id) references meetings (org_id, id) on delete cascade,
  unique (meeting_id, email)
);

create index idx_meeting_attendees_meeting on meeting_attendees (meeting_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table calendar_connections enable row level security;
alter table calendar_tokens enable row level security;
alter table meeting_attendees enable row level security;

-- Token table: no policies, no privileges. Service role only.
revoke all on calendar_tokens from anon, authenticated;

create policy calendar_connections_select on calendar_connections
  for select using (org_id = current_org_id());
create policy calendar_connections_admin_write on calendar_connections
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- Attendees follow the meeting (and so the lead).
create policy meeting_attendees_select on meeting_attendees
  for select using (
    exists (
      select 1 from meetings m
      join leads l on l.id = m.lead_id
      where m.id = meeting_attendees.meeting_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );
create policy meeting_attendees_write on meeting_attendees
  for all using (
    exists (
      select 1 from meetings m
      join leads l on l.id = m.lead_id
      where m.id = meeting_attendees.meeting_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  )
  with check (
    org_id = current_org_id()
    and exists (
      select 1 from meetings m
      join leads l on l.id = m.lead_id
      where m.id = meeting_attendees.meeting_id and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );
