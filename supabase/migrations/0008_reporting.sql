-- Reporting aggregates for the owner/manager dashboard.
--
-- These are plain SQL functions run with the CALLER's privileges (the default,
-- SECURITY INVOKER), so Row Level Security still applies inside them: a
-- function can never return a row the caller couldn't have selected directly.
-- Aggregating in the database (instead of selecting every lead into the app)
-- keeps the numbers exact — PostgREST silently caps a plain select at its
-- max-rows setting, which would quietly under-count a busy org.

-- Leads per pipeline stage (open and closed) — drives the pipeline counts.
create function dashboard_stage_counts(p_org uuid)
returns table (stage_id uuid, lead_count bigint)
language sql
stable
as $$
  select l.status_id, count(*)
  from leads l
  where l.org_id = p_org
  group by l.status_id;
$$;

-- Where leads created since `p_from` came from, and how many of them were won.
create function dashboard_source_breakdown(p_org uuid, p_from timestamptz)
returns table (source text, lead_count bigint, won_count bigint)
language sql
stable
as $$
  select l.source, count(*), count(*) filter (where s.is_won)
  from leads l
  join lead_statuses s on s.id = l.status_id
  where l.org_id = p_org and l.created_at >= p_from
  group by l.source
  order by count(*) desc, l.source;
$$;

-- One row per active team member: their workload right now, and what they did
-- since `p_from`. "Overdue" uses the same rule as src/lib/domain/due.ts: a
-- follow-up with a time is overdue once that instant passes in the org's
-- timezone; one without a time is overdue from the next midnight.
create function dashboard_rep_activity(p_org uuid, p_from timestamptz)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role text,
  open_leads bigint,
  uncontacted bigint,
  calls bigint,
  followups_completed bigint,
  overdue_followups bigint,
  meetings_completed bigint
)
language sql
stable
as $$
  select
    m.user_id,
    p.full_name,
    p.email,
    m.role,
    (select count(*) from leads l
       join lead_statuses s on s.id = l.status_id
      where l.org_id = p_org and l.assigned_to = m.user_id and not s.is_won and not s.is_lost),
    (select count(*) from leads l
       join lead_statuses s on s.id = l.status_id
      where l.org_id = p_org and l.assigned_to = m.user_id and not s.is_won and not s.is_lost
        and l.first_contacted_at is null),
    (select count(*) from call_logs c
      where c.org_id = p_org and c.caller_id = m.user_id and c.called_at >= p_from),
    (select count(*) from followups f
      where f.org_id = p_org and f.assigned_to = m.user_id and f.status = 'completed'
        and f.completed_at >= p_from),
    (select count(*) from followups f
       join organizations o on o.id = f.org_id
      where f.org_id = p_org and f.assigned_to = m.user_id and f.status = 'pending'
        and (case when f.due_time is null then (f.due_date + 1)::timestamp else (f.due_date + f.due_time) end)
              at time zone o.timezone < now()),
    (select count(*) from meetings mt
      where mt.org_id = p_org and mt.salesperson_id = m.user_id and mt.status = 'completed'
        and mt.scheduled_start >= p_from)
  from organization_members m
  join profiles p on p.id = m.user_id
  where m.org_id = p_org and m.is_active
  order by 7 desc, p.full_name;
$$;

-- Callable by signed-in users (RLS narrows what they get) and the service role.
revoke all on function dashboard_stage_counts(uuid) from public, anon;
revoke all on function dashboard_source_breakdown(uuid, timestamptz) from public, anon;
revoke all on function dashboard_rep_activity(uuid, timestamptz) from public, anon;
grant execute on function dashboard_stage_counts(uuid) to authenticated, service_role;
grant execute on function dashboard_source_breakdown(uuid, timestamptz) to authenticated, service_role;
grant execute on function dashboard_rep_activity(uuid, timestamptz) to authenticated, service_role;
