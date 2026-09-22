# Security

How tenant isolation, authorization, secrets and webhooks are handled, how each
is tested, and what is still a known risk.

## Threat model in one paragraph

Many businesses share one deployment and one database. The worst outcomes are
one tenant reading or changing another's leads, a salesperson exceeding their
role, a leaked provider token, a forged webhook writing leads, and account
takeover. Everything below exists to make those hard *at the database*, not just
in application code.

## Tenant isolation

- **Row Level Security is the boundary.** Every tenant table has `org_id` and RLS
  policies keyed on `current_org_id()` / `current_org_role()` (`security definer`
  functions with a fixed `search_path`). A signed-in user's queries — including
  ones made straight to the Supabase REST API with their JWT — only ever return
  their own org's rows.
- **The org comes from the session, never the request.** `requireSession()`
  resolves it; a browser-supplied `org_id` is never trusted. Related ids a client
  supplies (stage, assignee, contact, lead) are re-validated server-side.
- **Cross-tenant references are impossible to store.** Composite foreign keys
  `(org_id, x_id)` on every child table mean a lead cannot point at another org's
  stage/contact/assignee even when written by the service role (webhook code).
- **Admin client (RLS-bypassing)** is confined to: organization bootstrap,
  credential storage/reads, webhook ingestion, rate limiting, and Auth admin
  calls. Each such query filters `org_id` by hand and has a test.
- **Security-definer helpers** (`find_contact_for_capture`,
  `find_open_opportunity_for_capture`) return only an id/ownership and refuse a
  caller asking about another org.

**Tests** (`tests/integration/tenant-isolation.test.ts`, run as real signed-in
users): 16 tenant tables are queried across orgs; guessed ids return nothing (not
an error that confirms existence); updates/deletes affect zero rows; forged
inserts are rejected; cross-tenant references fail with `23503` even from the
service role; token tables are unreadable to every role; the audit trail is
append-only. The suite was mutation-checked: disabling RLS on `leads` makes it fail.

## Authorization

Three layers, deliberately redundant (see `docs/ARCHITECTURE.md`):

1. Route gate — `proxy.ts` (authenticated or not).
2. Application — `domain/permissions.ts` role × action matrix, enforced in
   services; UI hiding is convenience only.
3. Database — RLS, plus triggers for rules RLS can't express (a salesperson
   reassigning a lead — `leads_guard_assignment`).

| | admin | manager | salesperson |
|---|:-:|:-:|:-:|
| See all leads, tasks, dashboards | ✅ | ✅ | own + unassigned pool |
| Create / log calls / notes / tasks / WhatsApp / meetings on a visible lead | ✅ | ✅ | ✅ |
| Assign / reassign | ✅ | ✅ | claim an unassigned lead only |
| Delete a lead | ✅ | ✅ | ❌ |
| Invite, change roles, deactivate | ✅ | ❌ | ❌ |
| Connect integrations, org settings | ✅ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ |

Invariants: an org always keeps ≥ 1 active admin (demotion/deactivation refused);
admins are made by promotion, never by invitation; nobody can deactivate
themselves.

**Tests:** `tests/unit/domain/permissions.test.ts` (matrix, every role),
`tests/integration/reads-and-dashboards.test.ts` (assignment rules, including the
database refusing a direct API reassign), `team.test.ts`, `capture.test.ts`.

## Secrets

- Provider tokens: stored in tables no client role can read (RLS on, no
  policies, privileges revoked) **and** AES-256-GCM encrypted
  (`INTEGRATION_ENCRYPTION_KEY`). Legacy plaintext rows still decrypt (pass-through)
  and are re-encrypted on next write, so deploying needs no data migration.
- Secrets come only from the environment; `.env.example` has placeholders.
- The logger redacts secret-looking keys at any depth and `access_token=…` /
  `Bearer …` patterns inside strings; errors are logged as name + message only.
- Webhook receipts store no payload; recorded errors are scrubbed.
- Google is granted only the `calendar.events` scope, not the whole calendar.

## Webhooks

Signature checked over the **exact raw bytes** with a constant-time comparison,
*before* parsing or any database write; unsigned/forged input is rejected and
stores nothing. Verification tokens for subscription handshakes; the mock source
returns 404 unless mock providers are enabled. Idempotency and rate limiting as in
`docs/integrations.md`.

## Authentication and sessions

Supabase Auth (email/password), session cookies via `@supabase/ssr`, refreshed
in the proxy. Deactivation uses Auth's ban, so a deactivated user's very next
request fails.

- **Open redirect fixed:** the login `redirectTo` (and `/auth/confirm`'s `next`)
  pass through `safeRedirectPath` — same-origin paths only (`//host`, `/\host`,
  schemes and control characters rejected).
- **Rate limiting** (Postgres-backed, cross-instance): login per IP and per
  account (email hashed in the key), signup per IP (fails closed), password reset
  per IP and per email (fails closed), invitations per org, webhooks per IP/org.
- **Password reset** answers identically whether or not the address has an
  account (no user enumeration); links are one-time and short-lived.
- **Signup** can be closed (`SIGNUP_ENABLED=false`) for a pilot.
- **OAuth state** (Google) is HMAC-signed, tied to org + user, expires in 10
  minutes; the callback re-checks the signed-in admin matches.

## Input validation and output

Zod validates the form-driven server actions and the webhook bodies (the rest
validate in their service); the lead-search box can only
narrow results (PostgREST filter syntax is stripped). Server actions return a
`UserError` message only for expected problems — anything else is logged with
detail and the user sees a generic message, so constraint names and column lists
never reach the browser. Response headers: `X-Frame-Options: DENY`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`;
`X-Powered-By` removed.

CSRF: mutations are Next server actions (origin-checked by the framework) using
SameSite session cookies; there is no cross-origin API and no CORS exposure.

## Known risks and limitations (be honest)

1. **No Content-Security-Policy yet.** Adding one needs nonce plumbing for
   Next's inline scripts; tracked for V1.x.
2. **Encryption key rotation is manual.** The `v1` prefix supports adding `v2`,
   but there is no re-encrypt job. Losing the key means admins must reconnect.
3. **Rate limits are fixed-window** and keyed on `x-forwarded-for`, which a
   client talking to the origin directly can spoof (behind Vercel/a proxy it is
   trustworthy). They slow abuse; they are not identity.
4. **Supabase Auth password policy** is the platform's (minimum length 8 in the
   app). No MFA in V1.
5. **Open sign-up** by default — anyone can create an organization. Set
   `SIGNUP_ENABLED=false` for pilots.
6. **Inbound WhatsApp from strangers is not turned into leads** (deliberate),
   and a customer's `STOP` is honoured, but there is no automated opt-in capture.
7. **Meta long-lived tokens expire** (~60 days); the Integrations page shows
   "failing" with the reason, but there is no proactive refresh.
8. **`supabase/config.toml` allows the local origins** for password-reset
   redirects; production redirect URLs must be added in the hosted project.
9. **Mock providers** are a footgun if enabled in production — they are off by
   default there and labelled everywhere, but the flag is operator-controlled.
10. **Backups/DR** are the Supabase project's; nothing app-specific.
