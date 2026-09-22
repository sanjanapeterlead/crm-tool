-- WhatsApp: conversations, inbound messages, delivery status, consent.
--
-- Before this, `whatsapp_messages` was an outbound-only send log keyed by lead.
-- V1 adds the other half — replies from the prospect and delivery receipts — so
-- a Conversation (one per contact per channel) now owns the messages, and a
-- message has a direction and a lifecycle. The table keeps its name so every
-- existing query and RLS policy on it continues to work.

-- ============================================================================
-- conversations
-- ============================================================================
create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  contact_id uuid not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  -- WhatsApp only allows free-form (non-template) messages within 24h of the
  -- contact's last message to us; this is the timestamp that rule keys off.
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, contact_id, channel),
  foreign key (org_id, contact_id) references contacts (org_id, id) on delete cascade
);

create trigger trg_conversations_updated_at before update on conversations
  for each row execute function set_updated_at();

-- Backfill: one conversation per contact that already has outbound messages.
insert into conversations (org_id, contact_id, last_message_at)
select m.org_id, l.contact_id, max(m.created_at)
from whatsapp_messages m
join leads l on l.id = m.lead_id
group by m.org_id, l.contact_id;

-- ============================================================================
-- whatsapp_messages: direction, type, lifecycle
-- ============================================================================
alter table whatsapp_messages
  add column conversation_id uuid,
  add column direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  add column message_type text not null default 'template' check (message_type in ('template', 'text')),
  add column from_phone text,
  add column error_code text,
  add column delivered_at timestamptz,
  add column read_at timestamptz;

-- Inbound messages and free-text sends have no template.
alter table whatsapp_messages
  alter column template_name drop not null,
  alter column language drop not null,
  alter column to_phone drop not null;

update whatsapp_messages m
set conversation_id = c.id
from leads l, conversations c
where l.id = m.lead_id and c.org_id = m.org_id and c.contact_id = l.contact_id;

alter table whatsapp_messages alter column conversation_id set not null;
alter table whatsapp_messages
  add constraint whatsapp_messages_org_conversation_fkey
    foreign key (org_id, conversation_id) references conversations (org_id, id) on delete cascade;

-- Lifecycle. The old check only knew sent/failed.
alter table whatsapp_messages drop constraint whatsapp_messages_status_check;
alter table whatsapp_messages add constraint whatsapp_messages_status_check
  check (status in ('sent', 'delivered', 'read', 'failed', 'received'));

-- The provider's message id is the idempotency key for inbound messages and
-- how a later delivery receipt finds its message.
create unique index idx_whatsapp_messages_provider_id
  on whatsapp_messages (org_id, wa_message_id)
  where wa_message_id is not null;

create index idx_whatsapp_messages_conversation
  on whatsapp_messages (conversation_id, created_at desc);

-- One org per WhatsApp number, so an inbound webhook (which names only the
-- number) resolves to exactly one tenant.
create unique index idx_whatsapp_connections_phone_number
  on whatsapp_connections (phone_number_id)
  where phone_number_id is not null;

-- ============================================================================
-- Consent (opt-in) metadata on the contact
-- ============================================================================
alter table contacts
  add column whatsapp_consent_status text not null default 'unknown'
    check (whatsapp_consent_status in ('unknown', 'opted_in', 'opted_out')),
  add column whatsapp_consent_source text check (whatsapp_consent_source is null or length(whatsapp_consent_source) <= 200),
  add column whatsapp_consent_at timestamptz;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table conversations enable row level security;

-- Visible to whoever can see the contact. Written only by the service-role
-- send/receive paths, like whatsapp_messages.
create policy conversations_select on conversations
  for select using (
    exists (
      select 1 from contacts c
      where c.id = conversations.contact_id and can_access_contact(c.org_id, c.id, c.created_by)
    )
  );
