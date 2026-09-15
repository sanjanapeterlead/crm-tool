-- Core schema for the CRM.
-- Multi-tenant: every business table is scoped to an organization via org_id.

create extension if not exists pgcrypto;

-- ============================================================================
-- organizations
-- ============================================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  calendly_booking_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- profiles (1:1 with auth.users, org-independent identity)
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- organization_members (membership + role within an org)
-- ============================================================================
create table organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'salesperson')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index idx_organization_members_user on organization_members (user_id);
create index idx_organization_members_org on organization_members (org_id);

-- ============================================================================
-- lead_statuses (pipeline stages, customizable per org, not hardcoded)
-- ============================================================================
create table lead_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  key text not null,
  label text not null,
  sort_order int not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create index idx_lead_statuses_org on lead_statuses (org_id, sort_order);

-- ============================================================================
-- leads
-- ============================================================================
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  source text not null default 'Manual',
  status_id uuid not null references lead_statuses (id),
  assigned_to uuid references profiles (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_contact_required check (phone is not null or email is not null)
);

create index idx_leads_org on leads (org_id, created_at desc);
create index idx_leads_org_status on leads (org_id, status_id);
create index idx_leads_org_assigned on leads (org_id, assigned_to);
create index idx_leads_org_name on leads (org_id, first_name, last_name);

-- ============================================================================
-- notes
-- ============================================================================
create table notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notes_lead on notes (lead_id, created_at desc);
create index idx_notes_org on notes (org_id);

-- ============================================================================
-- meetings (business record of a meeting; Calendly/Google Meet do the actual
-- scheduling/video call — see SchedulingProvider integration boundary)
-- ============================================================================
create table meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  salesperson_id uuid references profiles (id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  meeting_type text not null default 'calendly',
  external_booking_url text,
  meeting_url text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_meetings_lead on meetings (lead_id, scheduled_start desc);
create index idx_meetings_org on meetings (org_id, scheduled_start);

-- ============================================================================
-- followups
-- ============================================================================
create table followups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  assigned_to uuid references profiles (id) on delete set null,
  due_date date not null,
  due_time time,
  description text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_followups_lead on followups (lead_id, due_date);
create index idx_followups_org_assigned on followups (org_id, assigned_to, status, due_date);

-- ============================================================================
-- activities (immutable audit timeline)
-- ============================================================================
create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  activity_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_activities_lead on activities (lead_id, created_at desc);
create index idx_activities_org on activities (org_id, created_at desc);

-- ============================================================================
-- integration_settings (home for Calendly today; other providers later)
-- ============================================================================
create table integration_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  provider text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);
