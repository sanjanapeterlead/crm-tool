-- ============================================================================
-- Reset: keep exactly one organization (and its structure) and one user,
-- delete every other organization, user, lead, contact and integration
-- connection.
--
-- HOW TO RUN
--   1. Supabase dashboard → your project → SQL Editor → New query.
--   2. Fill in keep_email below with the account you're keeping.
--   3. Read through the DELETE list once — it's every table this app writes to.
--   4. Run the whole script as one query (it's wrapped in a transaction: if
--      anything goes wrong it rolls back automatically, nothing is left half done).
--   5. Then go to Authentication → Users in the dashboard and delete any user
--      that isn't the one you kept (raw SQL against auth.users is skipped on
--      purpose here — Supabase manages sessions/identities alongside it, and
--      the dashboard/Admin API is the supported way to remove a user cleanly).
--
-- THIS IS IRREVERSIBLE. If you're on a plan with backups/PITR, taking one
-- first (Database → Backups) costs nothing and means "reset" is undoable.
--
-- WHAT SURVIVES: the organizations row itself, its pipelines and pipeline
-- stages (lead_statuses) — i.e. your CRM configuration — plus the kept user's
-- profile and membership. Every lead, contact, activity, call, WhatsApp
-- message/conversation, meeting, follow-up, audit event, webhook receipt and
-- integration connection (Meta/WhatsApp/Google) is deleted, in every org.
-- ============================================================================

begin;

do $$
declare
  keep_email  text := 'PUT-YOUR-EMAIL-HERE';
  keep_org_id  uuid;
  keep_user_id uuid;
begin
  select id into keep_user_id from auth.users where lower(email) = lower(keep_email);
  if keep_user_id is null then
    raise exception 'No auth user found with email %. Nothing was changed.', keep_email;
  end if;

  select org_id into keep_org_id from organization_members where user_id = keep_user_id limit 1;
  if keep_org_id is null then
    raise exception 'User % has no organization membership. Nothing was changed.', keep_email;
  end if;

  perform set_config('app.keep_org_id', keep_org_id::text, false);
  perform set_config('app.keep_user_id', keep_user_id::text, false);

  raise notice 'Keeping organization % and user % (%)', keep_org_id, keep_user_id, keep_email;
end $$;

-- ---- 1. Every OTHER organization — cascades its entire data tree in one go.
delete from organizations where id <> current_setting('app.keep_org_id')::uuid;

-- ---- 2. The kept organization's own leads and everything hanging off a lead
--         (notes, meetings + attendees, followups, activities, call_logs,
--          meta_lead_attribution, whatsapp_messages, lead_inquiries).
delete from leads where org_id = current_setting('app.keep_org_id')::uuid;

-- ---- 3. Contacts — safe now that no lead references them; cascades
--         conversations (and any remaining whatsapp_messages under them).
delete from contacts where org_id = current_setting('app.keep_org_id')::uuid;

-- ---- 4. Everything else scoped directly to the org (no lead/contact link).
delete from audit_events               where org_id = current_setting('app.keep_org_id')::uuid;
delete from webhook_receipts           where org_id = current_setting('app.keep_org_id')::uuid;
delete from integration_health         where org_id = current_setting('app.keep_org_id')::uuid;
delete from meta_webhook_events        where org_id = current_setting('app.keep_org_id')::uuid;
delete from meta_backfill_jobs         where org_id = current_setting('app.keep_org_id')::uuid;
delete from meta_lead_forms            where org_id = current_setting('app.keep_org_id')::uuid;
delete from meta_page_tokens           where org_id = current_setting('app.keep_org_id')::uuid;
delete from meta_pages                 where org_id = current_setting('app.keep_org_id')::uuid;
delete from meta_user_tokens           where org_id = current_setting('app.keep_org_id')::uuid;
delete from meta_connections           where org_id = current_setting('app.keep_org_id')::uuid;
delete from whatsapp_templates         where org_id = current_setting('app.keep_org_id')::uuid;
delete from whatsapp_available_numbers where org_id = current_setting('app.keep_org_id')::uuid;
delete from whatsapp_user_tokens       where org_id = current_setting('app.keep_org_id')::uuid;
delete from whatsapp_connections       where org_id = current_setting('app.keep_org_id')::uuid;
delete from calendar_tokens            where org_id = current_setting('app.keep_org_id')::uuid;
delete from calendar_connections       where org_id = current_setting('app.keep_org_id')::uuid;

-- ---- 5. Any other member of the kept org besides the kept user.
delete from organization_members
  where org_id = current_setting('app.keep_org_id')::uuid
    and user_id <> current_setting('app.keep_user_id')::uuid;

-- Not touched: organizations (the row), pipelines, lead_statuses, the kept
-- user's profile/membership, rate_limits (just abuse counters, not your data).

commit;

-- ---- Verify -----------------------------------------------------------------
-- Run these separately, after the commit above, to confirm the result:
--   select count(*) from organizations;        -- should be 1
--   select count(*) from leads;                -- should be 0
--   select count(*) from contacts;             -- should be 0
--   select count(*) from organization_members; -- should be 1
-- Then remove any other row under Authentication → Users in the dashboard.
