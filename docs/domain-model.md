# Domain model

Entities, what they mean, and how they relate. Table names are the physical
ones; where the domain word differs, it's called out (DECISIONS D-002).

```
Organization ──< Membership >── User (profile)
     │
     ├──< Pipeline ──< PipelineStage            (table: lead_statuses)
     │
     ├──< Contact ──< Opportunity ──────────────  (table: leads)
     │        │            │  ├──< Activity        (append-only timeline)
     │        │            │  ├──< Task/Follow-up  (table: followups)
     │        │            │  ├──< CallLog
     │        │            │  ├──< Note
     │        │            │  ├──< Meeting ──< MeetingAttendee
     │        │            │  ├──< LeadInquiry     (capture idempotency)
     │        │            │  └──< Message         (table: whatsapp_messages)
     │        └──< Conversation ──< Message
     │
     ├──< IntegrationConnection  (meta_*, whatsapp_*, calendar_connections)
     │        └── token tables (locked down, encrypted)
     ├──< IntegrationHealth
     ├──< WebhookReceipt   (idempotency + safe delivery log)
     └──< AuditEvent
```

## Core entities

**Organization** (`organizations`) — the tenant. Carries `timezone` (default
`Asia/Kolkata`; "today", "overdue" and every displayed time use it),
`default_country` (how a number typed without a country code is read),
`currency`. Every other business row has `org_id`.

**User / Membership** (`profiles`, `organization_members`) — a person and their
role in one org. Roles: `admin` (= the brief's OWNER/ADMIN), `manager`,
`salesperson`. One org per user (unique). Deactivation is Supabase Auth's ban;
`is_active` is a display mirror.

**Contact** (`contacts`) — the *person or business*. Names, `phone` /
`phone_normalized` (E.164), `additional_phone`, `email` / `email_normalized`,
`source`, `tags`, `notes`, and WhatsApp **consent** (`unknown` / `opted_in` /
`opted_out`, plus who/when). Partial unique indexes on `(org_id,
phone_normalized)` and `(org_id, email_normalized)` are the dedupe keys: the
database, not application code, guarantees one contact per person per org.

**Pipeline / PipelineStage** (`pipelines`, `lead_statuses`) — an ordered set of
stages. Behaviour comes from flags, never labels: `is_default` (entry stage),
`is_won`, `is_lost`. V1 has one default pipeline per org.

**Opportunity** (`leads`) — a *sales attempt* for a contact: stage, assignee,
`source`, `priority`, `value`, `next_action_at`, `lost_reason`,
`first_contacted_at` ("uncontacted" = null), `closed_at`. A contact can have many
over time; while one is **open** (not won/lost) a new inquiry from the same
person joins it instead of creating a duplicate. The lead's name/phone/email
columns are a database-maintained *display copy* of the contact (a trigger keeps
them in sync), so the contact is the single source of truth.

**Activity** (`activities`) — the immutable timeline: lead created / imported,
inquiry received, assigned, stage changed (with from/to), call logged, WhatsApp
sent / received / failed, note, follow-up created / completed, meeting
scheduled / rescheduled / completed / cancelled. Append-only (no update or
delete policy). Rows carry `contact_id` (filled by trigger) so a contact-level
timeline needs no join.

**Task / Follow-up** (`followups`) — `type` (call, WhatsApp, meeting, follow-up,
other), assignee, `due_date` + optional `due_time` as **wall-clock in the org's
timezone**, status, `completed_at`. "Overdue" = the due moment has passed; a
follow-up with no time is due by the end of its day. One rule, implemented once
in `domain/due.ts` and mirrored in SQL.

**CallLog** (`call_logs`) — outcome (`connected_interested`, `no_answer`,
`follow_up`, `meeting`, `not_interested`, `wrong_number`), optional duration and
notes. Append-only.

**Conversation / Message** (`conversations`, `whatsapp_messages`) — one
conversation per contact per channel; `last_inbound_at` drives the 24-hour
free-text window. Messages have a direction (`outbound`/`inbound`), a type
(`template`/`text`) and a lifecycle (`sent` → `delivered` → `read`, or
`failed`; inbound = `received`), with the provider's message id as the
idempotency key.

**Meeting / MeetingAttendee** (`meetings`, `meeting_attendees`) — start/end
instants, `provider` (`manual`, `calendly`, `google`, `mock`),
`external_event_id`, `meeting_url`, `sync_error`, attendees with roles.

**LeadInquiry** (`lead_inquiries`) — one row each time someone raised their hand
(manual, Meta form, test source). Its unique `(org, provider, external_id)` is
the idempotency record for capture, including when the event merged into an
existing opportunity.

## Cross-cutting

**IntegrationConnection** — non-secret metadata per provider (`meta_connections`,
`whatsapp_connections`, `calendar_connections`). Tokens live in separate tables
with RLS enabled and **no policies**, privileges revoked, and values AES-GCM
encrypted.

**IntegrationHealth** (`integration_health`) — `(org, provider)` → connected /
failing / disconnected, last success, last *safe* error.

**WebhookReceipt** (`webhook_receipts`) — unique `(provider, event_key)`;
stores no payload. Meta Lead Ads keep their own delivery log
(`meta_webhook_events`) for the admin UI.

**AuditEvent** (`audit_events`) — actor + action + summary for changes outside a
lead's timeline (team, settings, integrations, lead deletion). Append-only;
readable by admins.

## Integrity guarantees enforced by the database

- Every child table references its parent through a **composite foreign key that
  includes `org_id`** — a stage, contact, lead or assignee from another
  organization cannot be stored, even by the service role.
- One contact per normalized phone / email per org.
- One lead / inquiry per `(org, provider, external_id)`.
- One default pipeline per org.
- A salesperson cannot reassign a lead (trigger), independent of app code.
- `closed_at`, `next_action_at`, the lead's display copy of the contact, and the
  timeline's `contact_id` are trigger-maintained, so every code path agrees.
