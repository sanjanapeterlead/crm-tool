-- Meta (Facebook/Instagram) Lead Ads integration.
--
-- Data flow: an admin connects via Facebook OAuth -> we store the long-lived
-- user token and each Page's access token -> we subscribe each Page to the
-- `leadgen` webhook field -> Meta POSTs to /api/webhooks/meta on every form
-- submission -> we fetch the lead's field data from the Graph API and create
-- a CRM lead with its ad attribution.
--
-- SECURITY NOTE ON TOKENS
-- Access tokens live in dedicated tables (meta_user_tokens, meta_page_tokens)
-- that have RLS enabled and NO policies, and have privileges revoked from the
-- `anon`/`authenticated` roles. Only the service role (which bypasses RLS)
-- can read them. This matters because Supabase exposes new public-schema
-- tables to the Data API by default (see `auto_expose_new_tables` in
-- supabase/config.toml) — without the revokes below, a signed-in user could
-- query a Page access token straight from the browser.

-- ============================================================================
-- meta_connections (one connected Meta account per org; non-secret metadata)
-- ============================================================================
create table meta_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations (id) on delete cascade,
  meta_user_id text not null,
  meta_user_name text,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  -- Inbound Meta leads are assigned to this person. Null => left unassigned.
  default_assignee_id uuid references profiles (id) on delete set null,
  connected_by uuid references profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- meta_user_tokens (SECRET — service role only)
-- ============================================================================
create table meta_user_tokens (
  org_id uuid primary key references organizations (id) on delete cascade,
  user_access_token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- meta_pages (Facebook Pages whose lead forms feed this org)
-- `page_id` is globally unique: the webhook resolves which org an incoming
-- event belongs to by its page_id, so one Page cannot feed two orgs.
-- ============================================================================
create table meta_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  page_id text not null unique,
  page_name text not null,
  instagram_account_id text,
  webhook_subscribed boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_meta_pages_org on meta_pages (org_id);

-- ============================================================================
-- meta_page_tokens (SECRET — service role only)
-- ============================================================================
create table meta_page_tokens (
  page_id text primary key references meta_pages (page_id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  page_access_token text not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- meta_lead_forms (lead forms discovered on a connected Page; drives backfill)
-- ============================================================================
create table meta_lead_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  page_id text not null references meta_pages (page_id) on delete cascade,
  form_id text not null,
  form_name text not null,
  status text,
  leads_count int,
  last_backfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, form_id)
);

create index idx_meta_lead_forms_page on meta_lead_forms (page_id);

-- ============================================================================
-- leads: external identity, so a Meta lead is imported exactly once
-- ============================================================================
alter table leads
  add column external_provider text check (external_provider in ('meta')),
  add column external_id text;

-- Idempotency key for webhook retries and for backfill overlapping live
-- ingestion. Partial so manually created leads (null external_id) are exempt.
create unique index idx_leads_external_identity
  on leads (org_id, external_provider, external_id)
  where external_id is not null;

-- ============================================================================
-- meta_lead_attribution (1:1 with an imported lead — which ad produced it)
-- ============================================================================
create table meta_lead_attribution (
  lead_id uuid primary key references leads (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  leadgen_id text not null,
  page_id text,
  form_id text,
  form_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  -- 'fb' | 'ig' as reported by Meta.
  platform text,
  is_organic boolean not null default false,
  -- Every answer from the form, including custom questions we don't map to a
  -- lead column, so nothing the prospect told us is ever lost.
  field_data jsonb not null default '[]'::jsonb,
  meta_created_time timestamptz,
  created_at timestamptz not null default now()
);

create index idx_meta_lead_attribution_org on meta_lead_attribution (org_id);
create index idx_meta_lead_attribution_campaign on meta_lead_attribution (org_id, campaign_id);
create index idx_meta_lead_attribution_form on meta_lead_attribution (org_id, form_id);

-- ============================================================================
-- meta_webhook_events (delivery log — the answer to "why is that lead missing")
-- ============================================================================
create table meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- Null when we couldn't map the event's page_id to a connected org.
  org_id uuid references organizations (id) on delete cascade,
  page_id text,
  form_id text,
  leadgen_id text,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processed', 'duplicate', 'ignored', 'failed')),
  error text,
  lead_id uuid references leads (id) on delete set null,
  attempts int not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_meta_webhook_events_org on meta_webhook_events (org_id, received_at desc);
create index idx_meta_webhook_events_status on meta_webhook_events (status, received_at desc);
create index idx_meta_webhook_events_leadgen on meta_webhook_events (leadgen_id);

-- ============================================================================
-- meta_backfill_jobs (historical import; resumable because serverless
-- functions time out long before a large form finishes paginating)
-- ============================================================================
create table meta_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  form_id text not null,
  form_name text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  -- Graph API `after` cursor for the next page of results.
  next_cursor text,
  imported_count int not null default 0,
  skipped_count int not null default 0,
  failed_count int not null default 0,
  error text,
  started_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_meta_backfill_jobs_org on meta_backfill_jobs (org_id, created_at desc);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create trigger trg_meta_connections_updated_at before update on meta_connections
  for each row execute function set_updated_at();
create trigger trg_meta_pages_updated_at before update on meta_pages
  for each row execute function set_updated_at();
create trigger trg_meta_lead_forms_updated_at before update on meta_lead_forms
  for each row execute function set_updated_at();
create trigger trg_meta_backfill_jobs_updated_at before update on meta_backfill_jobs
  for each row execute function set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table meta_connections enable row level security;
alter table meta_user_tokens enable row level security;
alter table meta_pages enable row level security;
alter table meta_page_tokens enable row level security;
alter table meta_lead_forms enable row level security;
alter table meta_lead_attribution enable row level security;
alter table meta_webhook_events enable row level security;
alter table meta_backfill_jobs enable row level security;

-- Token tables: no policies at all, and no table privileges. Service role
-- only. Do not add a select policy to these two tables.
revoke all on meta_user_tokens from anon, authenticated;
revoke all on meta_page_tokens from anon, authenticated;

-- meta_connections
create policy meta_connections_select on meta_connections
  for select using (org_id = current_org_id());

create policy meta_connections_admin_write on meta_connections
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- meta_pages
create policy meta_pages_select on meta_pages
  for select using (org_id = current_org_id());

create policy meta_pages_admin_write on meta_pages
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- meta_lead_forms
create policy meta_lead_forms_select on meta_lead_forms
  for select using (org_id = current_org_id());

create policy meta_lead_forms_admin_write on meta_lead_forms
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- meta_lead_attribution: visible to whoever can see the underlying lead, so a
-- salesperson sees attribution only for their own leads.
create policy meta_lead_attribution_select on meta_lead_attribution
  for select using (
    exists (
      select 1 from leads l
      where l.id = meta_lead_attribution.lead_id
        and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );

-- meta_webhook_events: admins only — payloads contain prospect PII and are an
-- operational log, not lead data.
create policy meta_webhook_events_admin on meta_webhook_events
  for select using (org_id = current_org_id() and current_org_role() = 'admin');

-- meta_backfill_jobs
create policy meta_backfill_jobs_admin on meta_backfill_jobs
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');
