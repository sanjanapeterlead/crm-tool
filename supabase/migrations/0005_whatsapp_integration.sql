-- WhatsApp (Cloud API) integration — outbound, template-based messaging only.
--
-- Data flow: an admin connects via the same Facebook Login for Business used
-- for Meta Ads (see 0004_meta_ads_integration.sql), granting WhatsApp scopes
-- -> we discover the org's WhatsApp Business Account(s) and phone number(s)
-- -> the admin picks the one this org sends from -> templates are synced from
-- Meta so a salesperson can pick one and fill in its variables from a lead's
-- detail page -> we call the Cloud API to send.
--
-- No inbound webhook in this pass: replies are not captured, and delivery
-- status beyond the synchronous send response is not tracked. See the
-- "WhatsApp integration" section of README.md for what a two-way inbox would add.
--
-- SECURITY NOTE ON TOKENS: identical posture to meta_user_tokens in migration
-- 0004 — RLS enabled with NO policies, and table privileges revoked from
-- anon/authenticated. Only the service role may read whatsapp_user_tokens.

-- ============================================================================
-- whatsapp_connections (one connected number per org; non-secret metadata)
-- ============================================================================
create table whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations (id) on delete cascade,
  meta_user_id text not null,
  meta_user_name text,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  -- Null until the admin resolves which discovered number to send from —
  -- see whatsapp_available_numbers. Denormalized here (rather than a lookup
  -- join every send) because exactly one number is ever active at a time.
  business_id text,
  business_name text,
  waba_id text,
  waba_name text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  connected_by uuid references profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- whatsapp_user_tokens (SECRET — service role only)
-- ============================================================================
create table whatsapp_user_tokens (
  org_id uuid primary key references organizations (id) on delete cascade,
  user_access_token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- whatsapp_available_numbers (candidates discovered at connect time; an org
-- with more than one WABA/number picks the active one from this list)
-- ============================================================================
create table whatsapp_available_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  business_id text not null,
  business_name text,
  waba_id text not null,
  waba_name text,
  phone_number_id text not null,
  display_phone_number text,
  verified_name text,
  discovered_at timestamptz not null default now(),
  unique (org_id, phone_number_id)
);

create index idx_whatsapp_available_numbers_org on whatsapp_available_numbers (org_id);

-- ============================================================================
-- whatsapp_templates (approved/pending message templates synced from Meta)
-- ============================================================================
create table whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  template_id text not null,
  name text not null,
  language text not null,
  category text,
  status text not null default 'PENDING',
  header_type text,
  header_text text,
  body_text text not null default '',
  footer_text text,
  -- Raw component list from the Graph API, kept verbatim so a template type
  -- this UI doesn't specifically model (e.g. media headers, buttons) is not
  -- silently dropped — only body-variable substitution is built on top of it.
  components jsonb not null default '[]'::jsonb,
  variable_count int not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name, language)
);

create index idx_whatsapp_templates_org on whatsapp_templates (org_id, status);

-- ============================================================================
-- whatsapp_messages (outbound send log — append-only, mirrors `activities`)
-- ============================================================================
create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  template_id uuid references whatsapp_templates (id) on delete set null,
  template_name text not null,
  language text not null,
  -- Body with {{n}} placeholders substituted, for display without rejoining
  -- the template (which may since have been edited or removed upstream).
  rendered_body text not null,
  to_phone text not null,
  wa_message_id text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_whatsapp_messages_lead on whatsapp_messages (lead_id, created_at desc);
create index idx_whatsapp_messages_org on whatsapp_messages (org_id, created_at desc);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create trigger trg_whatsapp_connections_updated_at before update on whatsapp_connections
  for each row execute function set_updated_at();
create trigger trg_whatsapp_templates_updated_at before update on whatsapp_templates
  for each row execute function set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table whatsapp_connections enable row level security;
alter table whatsapp_user_tokens enable row level security;
alter table whatsapp_available_numbers enable row level security;
alter table whatsapp_templates enable row level security;
alter table whatsapp_messages enable row level security;

-- Token table: no policies at all, and no table privileges. Service role only.
revoke all on whatsapp_user_tokens from anon, authenticated;

-- whatsapp_connections
create policy whatsapp_connections_select on whatsapp_connections
  for select using (org_id = current_org_id());

create policy whatsapp_connections_admin_write on whatsapp_connections
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- whatsapp_available_numbers: setup-flow internal, admin only.
create policy whatsapp_available_numbers_admin on whatsapp_available_numbers
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- whatsapp_templates: any org member can see them (needed to pick one when
-- sending); only an admin can trigger a re-sync.
create policy whatsapp_templates_select on whatsapp_templates
  for select using (org_id = current_org_id());

create policy whatsapp_templates_admin_write on whatsapp_templates
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');

-- whatsapp_messages: visible to whoever can see the underlying lead. Written
-- only through the service-role send path (like meta_lead_attribution),
-- since sending also requires reading the org's secret access token.
create policy whatsapp_messages_select on whatsapp_messages
  for select using (
    exists (
      select 1 from leads l
      where l.id = whatsapp_messages.lead_id
        and can_access_lead(l.org_id, l.assigned_to, l.created_by)
    )
  );
