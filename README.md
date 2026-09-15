# Summit CRM

A simple, focused CRM for small sales teams — the core workflow from manual
lead entry through assignment, meetings, follow-ups, and conversion. Built as
a deliberately thin V0: complete end-to-end, not exhaustively featured.

## Prerequisites

- [Node.js](https://nodejs.org) 20+ (developed on Node 22)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running) — powers the local Supabase stack
- npm (ships with Node)

No global installs are required. The Supabase CLI is a dev dependency and is
run through `npm`/`npx`.

## Installation

```bash
git clone <this-repo>
cd crm-tool
npm install
```

## Environment variables

```bash
cp .env.example .env.local
```

`npm run db:start` (below) prints the local Supabase URL and anon key —
paste them into `.env.local`. See `.env.example` for the full list and what
each variable is for.

## Database setup (Supabase, local)

This project uses Supabase's local development stack (Postgres + Auth +
Studio, all in Docker) — no cloud project is required for development.

```bash
npm run db:start   # starts the local stack, prints your URL/keys — copy into .env.local
npm run db:reset    # (re)applies all migrations and re-seeds sample data
```

`db:start` prints something like:

```
API URL: http://127.0.0.1:54331
DB URL: postgresql://postgres:postgres@127.0.0.1:54332/postgres
Studio URL: http://127.0.0.1:54333
anon key: eyJhbGciOi...
```

Put the API URL in `NEXT_PUBLIC_SUPABASE_URL` and the anon key in
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

> **Port note:** this project's `supabase/config.toml` uses ports in the
> `543{30-39}` range instead of Supabase's `543{20-29}` default, so it won't
> collide with another local Supabase project already running on this
> machine. If you don't have another project running locally, the default
> range works fine too — just update the ports in `config.toml` back if you
> prefer them.

Other useful commands:

```bash
npm run db:stop      # stop the local stack
npm run db:status     # show URLs/keys again without restarting
npm run db:types      # regenerate src/lib/types/database.types.ts from the running schema
```

Database changes are made via migrations in `supabase/migrations/`, applied
in order. Never hand-edit the local database schema outside of a migration —
`db:reset` is the source of truth for what a fresh database looks like.

## Running the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll land on `/login`.

## Default seed users

`db:reset` seeds one organization ("Summit Sales Group") with 15 sample
leads, meetings, follow-ups, notes, and activity history, plus these users
(all share the password below):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@summitsales.test` | `password123` |
| Manager | `manager@summitsales.test` | `password123` |
| Salesperson | `jordan@summitsales.test` | `password123` |
| Salesperson | `priya@summitsales.test` | `password123` |
| Salesperson | `marcus@summitsales.test` | `password123` |

Salespeople only see leads assigned to (or created by) them; admins and
managers see everything in the organization.

## Running tests

```bash
npm run lint          # ESLint
npx tsc --noEmit       # TypeScript
npm run test:e2e       # Playwright end-to-end tests
```

The Playwright suite (`tests/e2e/lead-workflow.spec.ts`) drives the entire
acceptance scenario in a real browser against the local dev server and
database: log in, create a lead, assign it, move it through the pipeline,
schedule a meeting, mark it completed, add a note, create and complete a
follow-up, and verify the timeline and dashboard reflect all of it. It
expects a freshly-seeded database (`npm run db:reset` first) so lead-name
lookups are unambiguous.

`playwright.config.ts` starts `npm run dev` automatically if nothing is
already listening on port 3000.

## Architecture

Modular monolith — Next.js App Router, no separate backend service.

```
src/
  app/
    login/                    public auth route + server actions
    (app)/                    authenticated shell (sidebar layout)
      page.tsx                dashboard
      leads/                  list, detail, actions
      pipeline/                kanban board
      followups/               today/upcoming/overdue/completed views
      meetings/
      team/
      settings/
      actions.ts               server actions (mutations) for the whole app
  components/
    ui/                        shadcn/ui primitives (generated, don't hand-roll)
    crm/                        feature components, one folder per domain
  lib/
    supabase/                  browser/server/middleware Supabase clients
    auth/                       session resolution (org + role) for server code
    permissions/                 role → capability rules, used server AND client
    validation/                  Zod schemas, shared by client forms and server actions
    services/                    business logic + DB access (one file per domain)
    integrations/scheduling/     SchedulingProvider interface + CalendlyProvider
    types/                       generated DB types + hand-written domain types
supabase/
  migrations/                   schema, functions/triggers, RLS policies
  seed.sql                       sample data (also creates auth users for local dev)
tests/e2e/                       Playwright
```

**Data flow for a mutation:** a Client Component calls a `"use server"`
action in `src/app/(app)/actions.ts` → the action re-validates input with the
same Zod schema the form used → resolves the caller's session (org + role)
→ calls a `services/*.ts` function, which does the DB write *and* logs an
`activities` row in the same place → the action revalidates the affected
paths. Nothing writes to the leads/notes/meetings/followups tables directly
from a component.

**Authorization is layered, not single-point:**
1. Supabase Row Level Security (`supabase/migrations/0003_rls_policies.sql`)
   is the hard tenant-isolation boundary — every query is scoped to the
   caller's organization, and a salesperson's policies further restrict them
   to leads they're assigned to or created, at the database level.
2. `src/lib/permissions/index.ts` mirrors the same role rules in application
   code, used by server actions/pages to decide what to show or allow, and
   by client components for UI (never the actual security boundary — just
   UX).

**Multi-tenancy:** every business table has an `org_id`. There's one
organization in the seed data, but the schema and RLS policies already
assume there could be more.

**Calendly integration boundary:** `src/lib/integrations/scheduling/` defines
a `SchedulingProvider` interface with one implementation (`CalendlyProvider`)
today. The app only ever talks to `getSchedulingProvider(...)` — nothing
else references Calendly by name — so a future provider (or Calendly's real
API/webhooks) can be swapped in without touching lead/meeting code.

## Current scope (V0)

Implemented: manual lead entry, assignment, status pipeline (list + Kanban),
notes, meetings (manually logged, with a Calendly link-out), follow-ups
(today/upcoming/overdue/completed), a full activity timeline per lead, a
dashboard with operational metrics, role-based access (admin/manager/
salesperson) enforced server-side and via RLS, and organization-scoped data
throughout.

Deliberately not built yet (see the project brief for the full list):
Facebook/Instagram/WhatsApp lead capture, Calendly webhooks or API-driven
scheduling, Google Meet integration, call recording/transcripts, AI
summaries or automatic status/follow-up extraction, campaigns, workflows, a
form builder, or advanced reporting. The service/integration boundaries
above exist specifically so these can be added later without a rewrite.

## Known V0 simplifications

- Lead statuses are seeded per-organization and editable only via direct DB
  access today (no settings UI for reordering/renaming pipeline stages yet).
- A lead's `notes` field lives entirely in the `notes` table, not duplicated
  as a column on `leads`.
- Meetings are logged manually by the salesperson after booking through
  Calendly; there's no webhook wiring data back automatically yet.
- Team members are seeded, not self-service invited — there's no invite flow
  in Settings yet.

## Tech stack

Next.js 16 (App Router, Turbopack) · TypeScript · Supabase (Postgres, Auth,
local dev via Docker) · Tailwind CSS v4 · shadcn/ui (on Base UI) · React Hook
Form · Zod · date-fns · Playwright.
