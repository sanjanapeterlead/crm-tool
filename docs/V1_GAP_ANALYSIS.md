# V1 Gap Analysis

> **Status (2026-09-20): all gaps below are closed** except the items listed
> under *Remaining* at the end. The tables are kept as the original audit; the
> proof for each requirement is in the test suites (README → Commands) and
> `docs/v1-scope.md`.

Measured against the V1 requirements (sections A–M, UX, security, testing,
docs). Status is as of the 2026-09-19 audit — see
[CURRENT_STATE.md](CURRENT_STATE.md) for evidence.

Legend — ✅ done · 🟡 partial (works, needs change) · ❌ missing.
"Slice" refers to the implementation sequence at the bottom.

## Functional requirements

| Req | Requirement | Status | Gap | Slice |
|---|---|---|---|---|
| **A** | Sign-in/out/session | ✅ | — | — |
| A | Org creation | 🟡 | Works via `/signup`; default pipeline ≠ V1 spec; no rate limit | 1, 2 |
| A | Roles OWNER/ADMIN, MANAGER, SALESPERSON | 🟡 | `admin/manager/salesperson` exist; only one admin per org, can't invite a manager or change a role | 6 |
| A | Invite team members | 🟡 | Salesperson only; no resend; no password reset | 6 |
| A | Permissions enforced in backend | 🟡 | RLS is strong; app-layer matrix is thin and untested; assignment rule undefined | 1, 3 |
| **B** | Contacts (fields, tags, notes, search) | ❌ | No `contacts` table; name/phone/email live on `leads`; no tags, no `additional_phone`, no normalized phone | 2, 3 |
| B | Dedupe by normalized phone/email per org | ❌ | None | 2, 3 |
| **C** | Pipelines + ordered stages | 🟡 | Stages exist (`lead_statuses`); no `pipelines` table; wrong default set | 2 |
| C | Opportunity fields (value, priority, nextActionAt, lostReason, status) | ❌ | Only source/status/assignee | 2 |
| C | List + Kanban | ✅ | Kanban must route through the same stage-move service | 3 |
| C | Stage move → activity | ✅ | Already logged; keep, add from/to stage ids | 3 |
| **D** | Manual lead create | 🟡 | Works, but not through a shared capture service | 3 |
| D | Lead-source provider interface + mock/test webhook | ❌ | Meta has no port; no mock path | 3 |
| D | Real Meta adapter | ✅ | Complete (OAuth, webhook, backfill). Re-plumb through capture service | 3 |
| D | Preserve external lead/form/campaign IDs | ✅ | `meta_lead_attribution` | — |
| D | Idempotent ingestion | ✅ | Unique index on `(org_id, provider, external_id)`; extend to contact-level dedupe | 3 |
| D | Same service for manual/test/Meta | ❌ | Two divergent code paths | 3 |
| **E** | Manual assignment + audit | 🟡 | Works + logs activity; no role rule | 3 |
| E | `AssignmentStrategy` boundary | ❌ | Interface + `ManualAssignment` only; round-robin is V2 | 3 |
| **F** | One timeline per contact/opportunity | 🟡 | Per-lead timeline works; missing call/WhatsApp-inbound/task-completed types; no `contact_id` | 2, 4 |
| **G** | Call action (`tel:`) | ❌ | | 4 |
| G | Outcome enum, duration, notes, immediate follow-up | ❌ | New `call_logs` + activity | 4 |
| **H** | Task/follow-up model | 🟡 | Exists as `followups`; no `type`; date+time not timezone-aware | 2, 4 |
| H | Today/upcoming/overdue correct | ❌ | UTC-date bug; same-day-past-time not overdue | 1, 4 |
| H | Completion in timeline | ✅ | | — |
| H | Salesperson home = action queue | ❌ | `/` is a vanity-metrics grid | 4 |
| **I** | `WhatsAppProvider` + production adapter + mock | 🟡 | Production outbound-template exists; no interface, no mock | 5 |
| I | Send from lead page | ✅ | Template only; needs free-text within 24h window | 5 |
| I | Inbound webhook → contact/conversation | ❌ | | 5 |
| I | Message status + errors surfaced | 🟡 | Only sync sent/failed; no delivered/read | 5 |
| I | Conversations, consent/opt-in metadata | ❌ | | 2, 5 |
| **J** | `CalendarProvider` + Google (Meet) + mock | ❌ | Only a Calendly link-out | 7 |
| J | Store external event id, attendees, meeting URL | ❌ | Meeting table has URL only | 2, 7 |
| **K** | Salesperson "Today" dashboard | ❌ | | 4 |
| K | Owner dashboard (needs attention, source breakdown, per-rep counts) | ❌ | Metric grid only, computed in memory | 4 |
| **L** | Search by name/phone/email | 🟡 | Works; phone not normalized; unsafe filter string | 3 |
| L | Filters: assignee, stage, status, source, created date, overdue/due | 🟡 | Missing status, created-date, overdue/due | 3 |
| **M** | Audit important changes with actor | 🟡 | Per-lead `activities` only; nothing for settings/team/integration changes | 2, 6 |
| M | Integration health page (connected/disconnected/failing) | 🟡 | Status rows; no "failing", no Google | 7 |
| M | Safe operational logs | 🟡 | Webhook event table is safe; no structured logger | 1 |

## Non-functional requirements

| Requirement | Status | Gap |
|---|---|---|
| Multi-tenant, `org_id` on every record | ✅ | Extend to all new tables |
| Never trust browser `organizationId` | ✅ | Org derived from session; **but** client-supplied related ids unverified (defect #3) |
| Cross-tenant FK integrity | ❌ | Add org-consistency constraints/triggers |
| External systems behind interfaces | 🟡 | Only scheduling; add ports for lead source, WhatsApp, calendar |
| Webhook auth + idempotency + safe logging | 🟡 | Meta ✅; WhatsApp/Google/mock ❌ → generic `webhook_receipts` |
| Secrets not exposed/logged; credentials encrypted | 🟡 | Not exposed ✅; not encrypted ❌ |
| Rate limiting on sensitive endpoints + webhooks | ❌ | Postgres-backed limiter |
| CSRF/CORS/cookies | ✅ | Server actions have Next's built-in origin check; no CORS-exposed API; Supabase SSR cookies |
| Strong validation | ✅ | Zod on every action; extend to new inputs and webhook payloads |
| Reproducible migrations + seed | 🟡 | Migrations ✅; seed lacks V1 pipeline, contacts, calls, WhatsApp, meetings |
| Structured logging + correlation IDs | ❌ | |
| Queue interface | ❌ | Interface + inline implementation only |
| Dockerfile, env-driven config | ❌ | |
| OpenAPI | n/a | No public REST API in V1 (DECISIONS D-004) |

## Testing / quality gate (spec items 1–10)

| # | Flow to prove | Today |
|---|---|---|
| 1 | Owner creates org / team member | ✅ Playwright `org-onboarding` |
| 2 | Org A user can't read/write Org B by guessing IDs, incl. direct API | ❌ (tokens only) → Vitest DB integration suite |
| 3 | Lead → assign → call → follow-up → stage → meeting → Won/Lost | 🟡 partial Playwright; add call + Won/Lost |
| 4 | Mock Meta webhook idempotent | 🟡 signature/logging tested; duplicate-creation not |
| 5 | WhatsApp in/out + failure | ❌ |
| 6 | Calendar create + record | ❌ |
| 7 | Today queue due vs overdue | ❌ → pure-function unit tests |
| 8 | Owner dashboard reflects data changes | ❌ |
| 9 | Unit/integration tests on critical services | ❌ no unit runner |
| 10 | Playwright core happy path | ✅ exists (flaky) |
| — | Lint, typecheck, test, build | tsc ✅ lint ✅ build not yet verified |

## Documentation

| Deliverable | Status |
|---|---|
| README | Stale (V0) |
| `docs/ARCHITECTURE.md`, `CURRENT_STATE`, `V1_GAP_ANALYSIS`, `DECISIONS` | Written in Phase 0 |
| `docs/domain-model.md`, `integrations.md`, `security.md`, `v1-scope.md` | ❌ |
| `.env.example` | Stale; needs encryption key, Google, mock flags |
| API docs | n/a (D-004) |

## Proposed refactoring

Ordered by risk reduction. Each is incremental, keeps the current behaviour
observable, and ships with tests.

1. **Extract a pure `domain/` layer** (phone normalization, dedupe keys,
   follow-up classification in an org timezone, call outcomes, permission
   matrix). No I/O → cheap to unit-test, fixes defect #2 in one place.
2. **Introduce contacts + pipelines + opportunity fields** as an *additive*
   migration; backfill contacts from existing leads; keep `leads` /
   `lead_statuses` as the physical Opportunity / Stage tables so every
   existing query, RLS policy, and page keeps working.
3. **One `captureLead` service** used by manual create, the mock source, and
   Meta ingestion. Deletes the duplicated creation path.
4. **Ports for external systems** (`LeadSourceProvider`, `WhatsAppProvider`,
   `CalendarProvider`, `JobQueue`) and a single composition root that picks
   real vs mock adapters. Existing Meta/WhatsApp clients become adapters, not
   rewrites.
5. **Harden the perimeter**: token encryption, Postgres rate limiter,
   `webhook_receipts`, org-consistency constraints, JSON logger with request
   ids.
6. **Split `actions.ts`** by domain and add a small `runAction()` wrapper to
   remove the copy-pasted try/catch/revalidate.
7. **Role-specific home**: `/` renders Today for salespeople and the
   needs-attention dashboard for owner/manager, both via SQL aggregation.

## Proposed V1 implementation sequence

| Slice | Content | Exit criteria |
|---|---|---|
| **0** | Audit docs; baseline gate (`tsc`, `lint`, `build`); Vitest set up | Docs merged; baseline recorded |
| **1** | `domain/` pure modules + unit tests; encryption util; logger; rate-limit util; fix UTC "today" and filter-injection defects | Unit tests green |
| **2** | Migration `0007`: contacts, pipelines, opportunity fields, call_logs, task type, org timezone, conversations/messages evolution, meeting external fields, audit_events, webhook_receipts, rate_limits, org-consistency constraints, drop `integration_settings`; backfill; regenerate types | `db:reset` clean; tenant-isolation suite passes |
| **3** | `captureLead` + `AssignmentStrategy`; refactor manual create + Meta ingestion; mock lead source + test webhook; stage-move service; search/filters | Repeated identical webhook creates exactly one opportunity |
| **4** | Call logging; Task model; Today page; Owner dashboard | Due vs overdue proven in tests; dashboard reflects mutations |
| **5** | WhatsApp provider port, mock adapter, inbound + status webhook, conversations, consent | In/out/failure recorded on timeline |
| **6** | Team: invite manager, change role, password reset; audit events for team/settings | Role-matrix authorization tests |
| **7** | Calendar port, Google adapter, mock, meeting scheduling UI; integration health page | Meeting created + recorded via mock; Google behind config |
| **8** | Seed, Dockerfile, docs set, Playwright happy path, full gate (lint/tsc/test/build), build report | All 10 quality-gate flows demonstrated |

Slices 1 and 2 are the foundation; nothing in 3–7 should start before the
contact/opportunity model and the domain layer exist, or the work will be done
twice.

## Remaining after the V1 build

Not gaps in V1 scope, but honest leftovers (also in `docs/security.md`):

- No Content-Security-Policy header; no MFA; manual encryption-key rotation.
- Inbound WhatsApp from unknown numbers is logged, not converted to leads (D-021).
- One WhatsApp number / one Google account per org.
- Meta long-lived tokens are not proactively refreshed.
- `meta_webhook_events` and `webhook_receipts` are two delivery logs (D-023).
- Real-provider paths (Meta, WhatsApp Cloud API, Google) are verified against
  stubbed HTTP and the demo adapters, **not against the live providers** — that
  needs your credentials (see the build report / README "Going live").
