-- Seed data for local development. Creates one organization, one admin, one
-- manager, three salespeople, the default pipeline statuses, and a realistic
-- spread of leads/notes/meetings/followups/activities so the app is useful
-- the moment you log in. All seed users share the password: password123

-- ---------------------------------------------------------------------------
-- Helper: create a confirmed auth user (local dev only) and return its id.
-- ---------------------------------------------------------------------------
create or replace function seed_user(p_email text, p_password text, p_full_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email),
    'email', now(), now(), now()
  );

  return v_id;
end;
$$;

do $$
declare
  v_org uuid;
  v_admin uuid;
  v_manager uuid;
  v_sp1 uuid; -- salesperson: Jordan
  v_sp2 uuid; -- salesperson: Priya
  v_sp3 uuid; -- salesperson: Marcus

  v_status_new uuid;
  v_status_contacted uuid;
  v_status_meeting_scheduled uuid;
  v_status_meeting_completed uuid;
  v_status_followup uuid;
  v_status_interested uuid;
  v_status_converted uuid;
  v_status_lost uuid;

  v_lead uuid;
  v_lead_ids uuid[] := array[]::uuid[];
  v_names text[][] := array[
    array['Sanjana','Peter'], array['Michael','Chen'], array['Ava','Rodriguez'],
    array['Liam','Johnson'], array['Sofia','Nguyen'], array['Ethan','Williams'],
    array['Grace','Kim'], array['Noah','Patel'], array['Olivia','Brown'],
    array['Lucas','Garcia'], array['Emma','Davis'], array['Mason','Lopez'],
    array['Isabella','Martinez'], array['James','Wilson'], array['Mia','Anderson']
  ];
  v_sources text[] := array['Facebook Ad','Instagram','Referral','Website','Manual','Other'];
  v_statuses uuid[];
  v_assignees uuid[];
  i int;
  v_first text;
  v_last text;
  v_status uuid;
  v_assignee uuid;
begin
  -- Organization -------------------------------------------------------------
  insert into organizations (name, slug, calendly_booking_url)
  values ('Summit Sales Group', 'summit-sales-group', 'https://calendly.com/summit-sales-group/intro-call')
  returning id into v_org;

  -- Users ----------------------------------------------------------------
  v_admin   := seed_user('admin@summitsales.test', 'password123', 'Alex Morgan');
  v_manager := seed_user('manager@summitsales.test', 'password123', 'Taylor Reed');
  v_sp1     := seed_user('jordan@summitsales.test', 'password123', 'Jordan Blake');
  v_sp2     := seed_user('priya@summitsales.test', 'password123', 'Priya Shah');
  v_sp3     := seed_user('marcus@summitsales.test', 'password123', 'Marcus Lee');

  insert into organization_members (org_id, user_id, role) values
    (v_org, v_admin, 'admin'),
    (v_org, v_manager, 'manager'),
    (v_org, v_sp1, 'salesperson'),
    (v_org, v_sp2, 'salesperson'),
    (v_org, v_sp3, 'salesperson');

  -- Pipeline statuses ------------------------------------------------------
  insert into lead_statuses (org_id, key, label, sort_order, is_won, is_lost, is_default) values
    (v_org, 'new', 'New', 10, false, false, true) returning id into v_status_new;
  insert into lead_statuses (org_id, key, label, sort_order) values
    (v_org, 'contacted', 'Contacted', 20) returning id into v_status_contacted;
  insert into lead_statuses (org_id, key, label, sort_order) values
    (v_org, 'meeting_scheduled', 'Meeting Scheduled', 30) returning id into v_status_meeting_scheduled;
  insert into lead_statuses (org_id, key, label, sort_order) values
    (v_org, 'meeting_completed', 'Meeting Completed', 40) returning id into v_status_meeting_completed;
  insert into lead_statuses (org_id, key, label, sort_order) values
    (v_org, 'follow_up', 'Follow-up', 50) returning id into v_status_followup;
  insert into lead_statuses (org_id, key, label, sort_order) values
    (v_org, 'interested', 'Interested', 60) returning id into v_status_interested;
  insert into lead_statuses (org_id, key, label, sort_order, is_won) values
    (v_org, 'converted', 'Converted', 70, true) returning id into v_status_converted;
  insert into lead_statuses (org_id, key, label, sort_order, is_lost) values
    (v_org, 'lost', 'Lost', 80, true) returning id into v_status_lost;

  v_statuses := array[
    v_status_new, v_status_new, v_status_new,
    v_status_contacted, v_status_contacted, v_status_contacted,
    v_status_meeting_scheduled, v_status_meeting_scheduled,
    v_status_meeting_completed,
    v_status_followup, v_status_followup,
    v_status_interested,
    v_status_converted,
    v_status_converted,
    v_status_lost
  ];
  v_assignees := array[v_sp1, v_sp2, v_sp3];

  -- Leads --------------------------------------------------------------------
  for i in 1 .. array_length(v_names, 1) loop
    v_first := v_names[i][1];
    v_last := v_names[i][2];
    v_status := v_statuses[i];
    v_assignee := v_assignees[1 + ((i - 1) % 3)];

    insert into leads (org_id, first_name, last_name, phone, email, source, status_id, assigned_to, created_by, created_at)
    values (
      v_org, v_first, v_last,
      '+1-555-' || lpad((1000 + i)::text, 4, '0'),
      lower(v_first || '.' || v_last || '@example.com'),
      v_sources[1 + ((i - 1) % array_length(v_sources, 1))],
      v_status, v_assignee, v_admin,
      now() - ((array_length(v_names, 1) - i) || ' days')::interval
    )
    returning id into v_lead;

    v_lead_ids := v_lead_ids || v_lead;

    insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at) values
      (v_org, v_lead, v_admin, 'lead_created', 'Lead created', v_first || ' ' || v_last || ' added to the CRM.',
        now() - ((array_length(v_names, 1) - i) || ' days')::interval),
      (v_org, v_lead, v_admin, 'lead_assigned', 'Assigned to salesperson',
        'Lead assigned for follow-up.',
        now() - ((array_length(v_names, 1) - i) || ' days')::interval + interval '5 minutes');

    -- Give the lead a bit of history proportional to how far along it is.
    if v_status in (v_status_contacted, v_status_meeting_scheduled, v_status_meeting_completed,
                    v_status_followup, v_status_interested, v_status_converted, v_status_lost) then
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at) values
        (v_org, v_lead, v_assignee, 'status_changed', 'Status changed: New → Contacted',
          'Initial outreach completed.', now() - ((array_length(v_names, 1) - i) || ' days')::interval + interval '1 day');
      insert into notes (org_id, lead_id, author_id, content) values
        (v_org, v_lead, v_assignee, 'Spoke with ' || v_first || ' — interested in learning more. Sending follow-up info.');
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description) values
        (v_org, v_lead, v_assignee, 'note_created', 'Note added', 'Call summary logged.');
    end if;

    if v_status in (v_status_meeting_scheduled, v_status_meeting_completed, v_status_followup,
                    v_status_interested, v_status_converted) then
      insert into meetings (org_id, lead_id, salesperson_id, scheduled_start, scheduled_end, meeting_type,
                             external_booking_url, meeting_url, status, created_by)
      values (
        v_org, v_lead, v_assignee,
        now() + ((i % 5) - 2 || ' days')::interval + time '15:00',
        now() + ((i % 5) - 2 || ' days')::interval + time '15:30',
        'calendly',
        'https://calendly.com/summit-sales-group/intro-call',
        'https://meet.google.com/abc-defg-hij',
        case when v_status = v_status_meeting_scheduled then 'scheduled' else 'completed' end,
        v_assignee
      );
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description) values
        (v_org, v_lead, v_assignee, 'meeting_scheduled', 'Meeting scheduled', 'Discovery call booked via Calendly.');
      if v_status != v_status_meeting_scheduled then
        insert into activities (org_id, lead_id, actor_id, activity_type, title, description) values
          (v_org, v_lead, v_assignee, 'meeting_completed', 'Meeting completed', 'Discovery call completed.');
      end if;
    end if;

    if v_status in (v_status_followup, v_status_interested) then
      insert into followups (org_id, lead_id, assigned_to, due_date, due_time, description, status, created_by)
      values (
        v_org, v_lead, v_assignee,
        (current_date + ((i % 7) - 3)),
        '10:00',
        'Call ' || v_first || ' to review proposal and next steps.',
        'pending',
        v_assignee
      );
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description) values
        (v_org, v_lead, v_assignee, 'followup_created', 'Follow-up created', 'Follow-up scheduled.');
    end if;

    if v_status = v_status_converted then
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description) values
        (v_org, v_lead, v_assignee, 'status_changed', 'Status changed: Interested → Converted', 'Deal closed.');
    end if;

    if v_status = v_status_lost then
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description) values
        (v_org, v_lead, v_assignee, 'status_changed', 'Status changed: Follow-up → Lost', 'Went with a competitor.');
    end if;
  end loop;

  -- One completed follow-up for realism on the Follow-ups page.
  insert into followups (org_id, lead_id, assigned_to, due_date, due_time, description, status, completed_at, created_by)
  values (v_org, v_lead_ids[1], v_sp1, current_date - 2, '09:00', 'Initial check-in call.', 'completed', now() - interval '2 days', v_sp1);
  insert into activities (org_id, lead_id, actor_id, activity_type, title, description)
  values (v_org, v_lead_ids[1], v_sp1, 'followup_completed', 'Follow-up completed', 'Check-in call completed.');
end $$;

drop function seed_user(text, text, text);
