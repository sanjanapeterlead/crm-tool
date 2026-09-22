# Current State (Phase 0 audit)

Audit date: 2026-09-19. Repo state audited: `master` @ `c632cfb` **plus 44
uncommitted files** (Meta Ads, WhatsApp outbound, org onboarding, team
management — everything after the first seven commits is still in the working
tree, not in git history).

This document records what exists, verified by reading the code. It is a
snapshot; the maintained as-built model is the root [`ARCHITECTURE.md`](../ARCHITECTURE.md),
and the target architecture is [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

## 1. What the system is

A multi-tenant CRM for lead-driven sales teams. Modular monolith: one Next.js
16 app (App Router, React 19, Turbopack), one Postgres database via Supabase
(Postgres + Auth + RLS). No separate backend service.

| Layer | Technology | Notes |
|---|---|---|
| Web + server | Next.js 16.3.5, React 19.2, TypeScript 5 | Server Components read; `"use server"` actions write; route handlers only for webhooks + OAuth |
| Auth | Supabase Auth (email/password), `@supabase/ssr` cookies | `src/proxy.ts` refreshes session + redirects |
| Database | Supabase Postgres, 6 migrations, RLS on every table | Hard tenant boundary is RLS |
| UI | Tailwind 4, shadcn/ui on Base UI, react-hook-form, zod, sonner | |
| Tests | Playwright only (4 spec files, ~45 tests) | Needs live local Supabase + seed |
| Deploy | Intended: Vercel + hosted Supabase | No Dockerfile, no CI config in repo |

Versions of note: `zod` 3.25, `@supabase/supabase-js` 2.116, `@playwright/test` 1.63.

## 2. Inventory

### 2.1 Routes / pages (`src/app`)

| Route | Purpose |
|---|---|
| `/login`, `/signup` | Public. Signup creates org + founding admin + default pipeline (service-role) |
| `/` | Dashboard: 8 metric cards, pipeline counts, recent activity (same page for every role) |
| `/leads`, `/leads/[id]` | List (search, status/assignee/source/campaign filters, pagination); detail (info, timeline, notes, meetings, follow-ups, WhatsApp messages, Meta attribution) |
| `/pipeline` | Kanban by `lead_statuses` |
| `/followups` | Today / upcoming / overdue / completed tabs |
| `/meetings` | Flat list of meetings |
| `/team` | Member list, invite salesperson, deactivate/reactivate (admin) |
| `/settings` | Org name, Calendly URL, integration status rows |
| `/settings/integrations/meta`, `/whatsapp` | Connect/disconnect, page/form/number selection, backfill, event log, template sync |
| `/api/webhooks/meta` | Meta `leadgen` webhook (GET handshake, POST signed delivery) |
| `/api/integrations/{meta,whatsapp}/{connect,callback}` | OAuth |

### 2.2 Database (migrations 0001–0006)

Tables: `organizations`, `profiles`, `organization_members`, `lead_statuses`,
`leads`, `notes`, `meetings`, `followups`, `activities`, `integration_settings`
(unused), `meta_connections`, `meta_user_tokens`*, `meta_pages`,
`meta_page_tokens`*, `meta_lead_forms`, `meta_lead_attribution`,
`meta_webhook_events`, `meta_backfill_jobs`, `whatsapp_connections`,
`whatsapp_user_tokens`*, `whatsapp_available_numbers`, `whatsapp_templates`,
`whatsapp_messages`. (*= RLS enabled, zero policies, privileges revoked from
`anon`/`authenticated`.)

Every business table has `org_id`; RLS helper functions (`current_org_id()`,
`current_org_role()`, `is_org_member()`, `can_access_lead()`) are
`security definer` with fixed `search_path`. Roles: `admin`, `manager`,
`salesperson`; one org per user (`unique(user_id)`).

### 2.3 Services (`src/lib/services`)

`leads`, `followups`, `meetings`, `notes`, `activities` (sole writer to
`activities`), `dashboard`, `team`, `settings`, `organizations`, `meta`,
`meta-backfill`, `whatsapp`. Services take an untyped `SupabaseClient`
(RLS-scoped for user paths, admin client for webhook/integration-token paths).

### 2.4 Integrations (`src/lib/integrations`)

- `meta/`: config, Graph client, OAuth, HMAC signature verify (constant-time),
  field mapping, types. Webhook is signature-verified, logs every delivery to
  `meta_webhook_events`, returns 200 for processing failures so Meta doesn't
  disable the subscription.
- `whatsapp/`: Graph client, OAuth (shares Meta app), template mapping, phone
  digit-normalization. **Outbound template send only.** No webhook.
- `scheduling/`: `SchedulingProvider` interface + `CalendlyProvider` that only
  builds a prefilled booking URL. No Calendly API.

### 2.5 Verified quality baseline

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **Pass** (0 errors) |
| `npm run lint` | **Pass**, 2 warnings (react-hook-form `watch()` under React Compiler in `lead-form.tsx`, `add-followup-dialog.tsx`) |
| `next build` | **Pass** (baseline, before any V1 change) |
| Playwright | Not run: Docker Desktop was not running, so the local Supabase stack (`127.0.0.1:54331`) was down |

## 3. Feature classification

Legend — **KEEP**: working and suitable for V1. **REFACTOR**: valuable but
must be reshaped (modularity, security, tenancy, testability). **DEFER**:
belongs to V2+ and must not expand V1. **REMOVE**: duplicate/obsolete/unsafe.

| Feature | Class | Reason / what changes |
|---|---|---|
| Supabase email/password login, session proxy, `requireSession/requireRole` | KEEP | Sound. Add password reset (gap). |
| Org signup + default pipeline seeding | REFACTOR | Works; default stages differ from V1 spec; needs rate limit + optional `SIGNUP_ENABLED` gate. |
| Team invite (salesperson), deactivate/reactivate via Auth ban | KEEP | Deliberate, documented design. Extend: invite manager; promote role. |
| RLS policies + `can_access_lead()` | KEEP | Strong boundary. Extend to new tables; add cross-tenant FK integrity. |
| `permissions` module | REFACTOR | Only 5 rules; V1 needs an explicit role×action matrix and tests. |
| Lead CRUD (`leads` table) | REFACTOR | Conflates contact and opportunity. Add `contacts`; `leads` becomes the Opportunity (see DECISIONS D-002). |
| Lead list + filters | REFACTOR | Search builds a PostgREST `.or()` string from raw user text (`leads.ts:51`); no date/overdue filters; phone search doesn't normalize. |
| Lead detail page | REFACTOR | Add Call/WhatsApp/Schedule actions, next task, call log; keep timeline. |
| Kanban `/pipeline` | KEEP | Works; stage move must go through one service that logs activity. |
| `lead_statuses` (stages) | REFACTOR | Add `pipelines` parent; V1 default stage set. Physical name kept. |
| Notes | KEEP | |
| Follow-ups | REFACTOR | Becomes Task/Follow-up: add `type`, org-timezone "today", time-of-day overdue. Currently UTC-date based (`followups.ts:25`, `dashboard.ts:8`). |
| Meetings (manual + Calendly link) | REFACTOR | Behind `CalendarProvider`; Calendly link-out becomes the "manual link" provider; add Google + mock. |
| Activity timeline (`activities`, `logActivity`) | KEEP | Right shape. Add types (call_logged, whatsapp_received…), `contact_id`. |
| Dashboard | REFACTOR | Loads every lead into memory; same view for all roles; no source breakdown / uncontacted / per-rep counts. Split into Today (salesperson) and Owner. |
| Meta Ads OAuth/webhook/backfill/attribution/event log | KEEP | High quality. REFACTOR only: ingestion path (see next row), token encryption, rate limit, provider port. |
| `ingestMetaLead` (`meta.ts:377`) | REFACTOR | Duplicates lead-creation logic vs `createLead`; no contact dedupe. Route through one `captureLead` service. |
| WhatsApp outbound template send | REFACTOR | Wrap in `WhatsAppProvider`; add conversations, inbound + status webhook, free-text within 24h window, consent metadata, mock adapter. |
| WhatsApp/Meta token tables | REFACTOR | RLS-locked (good) but **plaintext at rest**; add app-level AES-GCM. |
| Calendly booking URL setting | KEEP | Cheap fallback provider. |
| Integration status rows on `/settings` | REFACTOR | Show connected / disconnected / **failing** with last error; add Google. |
| `deleteLeadAction` (direct table call in action) | REFACTOR | Hard delete destroys history; move to service, audit it. Low priority. |
| `integration_settings` table | REMOVE | Unused (only referenced in a comment). |
| `src/lib/supabase/client.ts` | REMOVE | Browser client, unused. |
| Call logging, call outcomes | (missing) | New, V1 scope. |
| Audit events (non-lead entities) | (missing) | New, V1 scope. |
| Round-robin assignment, automation/workflow engine, ad-spend ROI, speed-to-lead auto-nudge | DEFER | V2. Provide `AssignmentStrategy` interface only. |
| Calendly/DaySchedule API scheduling | DEFER | V2; provider boundary only. |
| Telephony, call recording, voice AI, email marketing, funnels, payments | DEFER (out of product) | Explicitly excluded. |

## 4. Technical debt and defects found

Each item verified in the code. Severity is the auditor's judgement.

### Security / correctness

1. **Integration tokens are plaintext at rest** (`meta_user_tokens`, `meta_page_tokens`, `whatsapp_user_tokens`). RLS + revoked privileges protect them from clients, but a DB dump/backup/service-key leak exposes long-lived Meta tokens. *High.*
2. **"Today" is computed in UTC**, not the org's timezone — `new Date().toISOString().slice(0,10)` in `followups.ts:25` and `dashboard.ts:8`. For an Indian org, between 00:00–05:30 IST "today" is still yesterday, so follow-ups are misclassified. Also same-day items whose time has passed are never "overdue". *High for the target market.*
3. **Client-supplied IDs are trusted for relationships.** `updateFollowupStatusAction(followupId, leadId, …)` logs the activity against the caller's `leadId` without checking it matches the follow-up (same in meetings). `assigned_to`, `salesperson_id` and `status_id` on create/update aren't verified to belong to the caller's org; FKs are global (`leads.status_id → lead_statuses(id)`, `assigned_to → profiles(id)`). RLS stops cross-tenant *reads*, but a guessed foreign UUID can create a dangling cross-tenant reference. *Medium.*
4. **Any salesperson can reassign any lead they can see** (`assignLeadAction` has no role check). Not covered by a permission rule. *Medium; needs an explicit product rule.*
5. **PostgREST filter built from raw input** in `listLeads` (`leads.ts:51`, `.or(\`first_name.ilike.%${term}%,…\`)`). A term containing `,` `(` `)` alters the filter grammar. Tenant/role scoping is separate `AND`ed params plus RLS, so this is a correctness/DoS issue rather than a data leak. *Low–medium.*
6. **No rate limiting anywhere** — signup (open to the public), invite, webhooks, OAuth callbacks. *Medium.*
7. **No structured logging or correlation IDs.** Webhook failures live in a table only; there's no request id linking a webhook delivery to its lead. *Low–medium.*
8. Graph API tokens travel as `?access_token=` query params (`meta/client.ts:52`, `whatsapp/client.ts:43`). Meta supports the `Authorization: Bearer` header, which keeps tokens out of URL logs. *Low.*
9. Signup is open to anyone with no config gate. Fine for self-serve SaaS, wrong for a design-partner pilot. *Low.*
10. Middleware `PUBLIC_PATHS` uses `startsWith` (`/auth` also matches `/authors`). *Low.*

### Domain / architecture

11. **No Contact/Opportunity split.** A person who submits two Meta forms, or is entered manually after a form, becomes two unrelated `leads`. No dedupe by phone/email exists. Phone isn't normalized on write.
12. **No `pipelines` table**; stages hang directly off the org. Default stages (New, Contacted, Qualified, Meeting Scheduled, Follow-up, Won, Lost) don't match the V1 pipeline.
13. **Two lead-creation code paths** (`createLead`, `ingestMetaLead`) that log different activity types and share no dedupe/normalization.
14. **Opportunity fields missing:** value, priority, `next_action_at`, `lost_reason`.
15. **Dashboard scalability:** `getDashboardMetrics` selects every lead into memory and counts in JS (`dashboard.ts:11–64`).
16. **Provider boundaries are uneven.** Only Calendly has an interface; Meta and WhatsApp services import concrete Graph clients directly, so core code "knows" Meta.
17. **`ActionResult` handling is copy-pasted** (try/catch + revalidate) across ~12 actions in one 269-line `actions.ts`.

### Testing / DX

18. **No unit-test runner**; pure-function tests are smuggled into Playwright spec files.
19. **No tenant-isolation test for core tables** (leads, notes, follow-ups, meetings, activities, messages) and **no per-role authorization tests**. Only tokens and one signup scenario are covered.
20. **Known-flaky spec** (`lead-workflow.spec.ts` lead creation races `router.refresh()` / `router.push()`).
21. E2E specs depend on a running Docker/Supabase stack and seed slug `summit-sales-group`; seed org id is random per reset.
22. `README.md` still describes "V0"; `.env.example` says "none required for V0's normal request path" (now false).
23. No Dockerfile, no CI workflow, no `output: "standalone"`.
24. Two React-Compiler lint warnings from `watch()`.

## 5. Reusable assets (do not rebuild)

- `src/lib/supabase/{server,admin}.ts`, `src/lib/auth/session.ts`, `src/proxy.ts`.
- RLS helper functions and the token-lockdown pattern (revoke + no policies).
- `logActivity()` as the single timeline writer.
- `ActionResult<T>` convention.
- `integrations/meta/signature.ts` (constant-time HMAC), `mapping.ts`, `oauth.ts`.
- `meta_webhook_events` delivery-log pattern and `meta_lead_attribution`.
- Whole UI component library under `components/ui` and the `components/crm/*` feature components (leads table, kanban, dialogs).
- `createOrganizationWithAdmin` with compensating user deletion.
- Seed script structure (`seed_user()` helper).

## 6. Outcome (added after the V1 build)

This document is the *audit snapshot*; it is intentionally not rewritten. What
happened to each finding:

- **Defects 1–10 (security/correctness): all fixed** — token encryption
  (D-009), org-timezone "today" (D-007), org-consistency constraints +
  server-derived lead ids, assignment rule (D-012, D-019), search-clause
  hardening, rate limiting (D-010, D-022), structured logging, and the
  open-redirect the audit missed (D-025). The header-vs-query token transport
  (defect 8) was left as is: Graph calls carry `appsecret_proof`.
- **Debt 11–17 (domain/architecture): fixed** — contacts/pipelines
  (D-002), one `captureLead` path, opportunity fields, SQL dashboards, ports for
  lead source / WhatsApp / calendar, `runAction` replacing the copy-pasted
  action boilerplate.
- **Testing 18–24: fixed** — Vitest unit + DB-integration layers,
  tenant-isolation and per-role suites, the flaky spec replaced (D-024), README
  and `.env.example` rewritten, Dockerfile added. The two React-Compiler lint
  warnings from `watch()` remain (pre-existing, harmless).
- **REMOVE items:** `integration_settings`, `supabase/client.ts`,
  `SchedulingProvider` — removed (D-011).
- **DEFER items** remain deferred (round-robin, automation, ad-spend ROI,
  Calendly/DaySchedule API, telephony …); see `docs/v1-scope.md`.
