# Architecture — module map and dependency rules

This is the **target** structure for V1 and the rules that keep it that way.
The as-built description of what exists today (request lifecycle, RLS vs admin
client, migrations, testing gotchas) is the root
[`ARCHITECTURE.md`](../ARCHITECTURE.md) — read that first; this file adds the
boundaries. Rationale for the choices is in [DECISIONS.md](DECISIONS.md).

## Shape

A **modular monolith**: one Next.js app, one Postgres. Tenant isolation is
enforced by Row Level Security in the database; application code adds
role-based authorization and business rules on top.

```
Browser ──► Server Component / Server Action ──► Application service ──► Supabase (RLS)
                (src/app, thin)                    (src/lib/services)

Provider ─► Route handler (webhook) ─► verify ─► receipt (idempotency) ─► Application service
                (src/app/api)                                                 │
                                                                              ▼
                                                          Port ◄── Adapter (Meta / WhatsApp / Google / mock)
```

## Layers

```
src/lib/
  domain/         Pure TypeScript. No I/O, no Next, no Supabase, no env.
                  Business rules and value logic: phone normalization, dedupe
                  keys, due/overdue classification, call outcomes, permission
                  matrix, stage rules, assignment strategy.
  ports/          Interfaces the core depends on: LeadSourceProvider,
                  WhatsAppProvider, CalendarProvider, JobQueue.
  services/       Application services (use-cases). Orchestrate DB + ports.
                  One file per bounded module (see below).
  integrations/   Adapters. One folder per provider; each implements a port
                  (a real adapter and a mock).
  composition/    THE composition root: picks live vs. demo adapters per org.
  security/       crypto (AES-GCM), rate limiter, webhook signature helpers.
  observability/  JSON logger with request/correlation ids + secret redaction.
  supabase/ auth/ Infrastructure: clients, session resolution.
src/app/          Routes. Server actions and route handlers stay THIN:
                  validate → authorize → call one service → revalidate.
src/components/   UI. Never talks to the database or a provider.
```

### Dependency rules (enforced by ESLint `no-restricted-imports`)

1. `domain` imports **nothing** from the rest of `src` (only other `domain`
   files — by relative path — pure libraries and the standard library).
2. `ports` imports only `domain` types.
3. `services` may import `domain`, `ports`, `security`, `observability`,
   `supabase`, other `services`. **Never** a concrete adapter or an SDK/Graph
   client — they receive adapters through `composition/` / parameters.
4. `integrations/<x>` imports `ports`, `domain`, `security`,
   `observability`. It never imports `services` (an adapter doesn't know the
   CRM). Shared HMAC/OAuth primitives live in `security/`. One deliberate
   exception: `integrations/whatsapp` builds on `integrations/meta`'s Graph
   client because both are products on the same Meta platform and app.
5. `app` and `components` import `services`, `domain`, `auth`. Server actions and
   webhook routes additionally use `composition/` to obtain the right adapter,
   then pass it into the service.
6. Only `supabase/admin.ts` callers may bypass RLS, and every admin-client
   query must filter by `org_id` explicitly (see below).

> Status: the *capture* and *messaging* paths are fully behind ports
> (`services/capture.ts`, `conversations.ts`, `meetings.ts`). The Meta/WhatsApp
> **connection-management** services (`meta.ts`, `meta-backfill.ts`,
> `whatsapp.ts` — OAuth, discovery, template sync) still construct Graph clients
> directly and are allow-listed in ESLint; that list is meant to shrink.

## Bounded modules

Each row is a `services/*.ts` file (or small folder) owning its data. A module
may call another module's exported functions, never its tables.

| Module | Owns | Notes |
|---|---|---|
| `organizations` | organizations, pipelines, stages, timezone | Bootstrap uses admin client by design |
| `team` (auth + members) | profiles, organization_members | Invite, role change, deactivate |
| `contacts` | contacts | Normalization + dedupe keys; WhatsApp consent |
| `opportunities` (`leads.ts`) | leads (opportunity), stage moves, assignment | Stage move + assignment are the only writers of those fields |
| `capture` | — (orchestrates) | `captureLead()` — the single entry for manual, mock, Meta |
| `activities` | activities | **Only** writer to the timeline |
| `tasks` (`followups.ts`) | followups | Due classification via `domain/due` |
| `calls` | call_logs | Outcome → activity |
| `conversations` (`whatsapp.ts`) | conversations, whatsapp_messages, templates | Talks to `WhatsAppProvider` |
| `meetings` | meetings | Talks to `CalendarProvider` |
| `integrations` (connections) | *_connections, token tables, health | Encrypts/decrypts credentials |
| `webhooks` | webhook_receipts | Idempotency + safe logging |
| `reporting` (`dashboard.ts`) | (read-only) | SQL aggregation, no business writes |
| `audit` | audit_events | Non-lead changes (team, settings, integrations) |

## Multi-tenancy rules

- Every tenant-owned table has `org_id not null` and RLS enabled.
- The organization id **always** comes from the resolved session
  (`requireSession()`), or — in webhooks — from a provider-specific lookup
  that maps an external account id to exactly one org. It is never read from a
  request body or query string.
- Related ids supplied by the client (stage, assignee, contact, lead) are
  validated to belong to the same org, and the database backs this with
  org-consistency constraints so a bug can't create a cross-tenant reference.
- Admin-client (RLS-bypassing) code is limited to: org bootstrap, credential
  storage/reads, webhook ingestion, rate limiting, and auth-admin calls.
  Each such query filters `org_id` by hand and has a test.
- Secrets tables have RLS enabled with no policies and privileges revoked from
  `anon`/`authenticated`; values are additionally AES-GCM encrypted.

## Authorization model

Three layers, deliberately redundant:

1. **Route gate** — `proxy.ts` (authenticated or not).
2. **Application** — `domain/permissions.ts` role × action matrix, checked in
   services (not in components). UI hides controls for UX only.
3. **Database** — RLS is the backstop; if it disagrees with the matrix, RLS
   wins and the app is fixed.

| Action | admin | manager | salesperson |
|---|:-:|:-:|:-:|
| View all leads/tasks/dashboards in org | ✅ | ✅ | own + unassigned pool (D-019) |
| Create lead/contact | ✅ | ✅ | ✅ |
| Log call / note / task / WhatsApp / meeting on visible lead | ✅ | ✅ | ✅ |
| Move stage | ✅ | ✅ | ✅ (own) |
| Assign / reassign | ✅ | ✅ | claim unassigned only |
| Delete lead | ✅ | ✅ | ❌ |
| Invite/deactivate/change role | ✅ | ❌ | ❌ |
| Connect integrations, org settings | ✅ | ❌ | ❌ |
| Owner dashboard | ✅ | ✅ | ❌ (gets Today) |

## Integration pattern

A port is defined once in `ports/`. Each provider adds a folder in
`integrations/` with: `config.ts` (env → typed config or `null`, never throws
at import), an adapter implementing the port, `mapping.ts` (external →
domain), and `types.ts` (external shapes). A `mock` adapter exists per port.
`composition/` chooses real vs mock (D-017). Adding a provider = new folder +
one composition line; no service changes. See `docs/integrations.md`.

Inbound events follow one path:
`route handler → verify signature/token → rate-limit → webhook_receipts insert
(unique on provider+event id) → adapter.parse → service (idempotent) → mark
receipt`. A duplicate delivery hits the unique key and short-circuits.

## Observability

`observability/logger.ts` emits one JSON line per event with `requestId`,
`orgId`, `provider`, `event`; redacts keys matching token/secret/authorization
and truncates bodies. Webhook handlers generate (or accept `x-request-id`)
a correlation id and store it on the receipt so a lead can be traced to the
delivery that created it.

## Testing pyramid

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest (`unit`) | `domain/*`, adapters with fake HTTP, mapping |
| Integration | Vitest (`integration`) against local Supabase | RLS tenant isolation, role matrix, services, webhook idempotency, mock providers |
| E2E | Playwright | Core happy path lead → won through the UI |

## Deployment

Environment-driven. Vercel + hosted Supabase is the primary target; a
`Dockerfile` (Next `output: "standalone"`) runs the same app anywhere Node
runs, pointed at any Supabase/Postgres+GoTrue. See README for env vars.
