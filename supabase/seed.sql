-- Demo data for local development and design-partner evaluation.
--
-- One organization ("Summit Sales Group", an education consultancy in India,
-- IST timezone) with an admin, a manager and three salespeople, the V1
-- pipeline, and ~20 leads spread across every stage, with calls, follow-ups
-- (overdue / due today / upcoming), meetings and Meta-ad attribution — enough
-- that every screen has something meaningful on it the first time you log in.
--
-- All seed users share the password: password123
-- The org id is random per reset; tests look it up by slug 'summit-sales-group'.

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

-- ---------------------------------------------------------------------------
-- The demo leads, one row each. `rep`: 0 = unassigned, 1..3 = salesperson.
-- `fu_day`/`mt_day` are days from today in org time (null = none).
-- ---------------------------------------------------------------------------
create temp table _demo_leads (
  first_name text, last_name text, phone text, email text, source text,
  stage text, rep int, priority text, value numeric, campaign text,
  days_ago int, contacted boolean, call_outcome text,
  fu_day int, fu_time time, mt_day int, lost_reason text
) on commit drop;

insert into _demo_leads values
  -- Fresh from Meta ads, nobody has touched them (the "needs first contact" queue)
  ('Ananya',   'Iyer',      '+919820010001', 'ananya.iyer@example.com',  'Facebook Ad', 'new_lead',        0, 'high',   450000, 'UK Masters - Sept Intake', 0,  false, null, null, null, null, null),
  ('Rohan',    'Mehta',     '+919820010002', null,                       'Instagram',   'new_lead',        1, 'medium', 300000, 'Canada PR Webinar',        0,  false, null, null, null, null, null),
  ('Kavya',    'Nair',      '+919820010003', 'kavya.nair@example.com',   'Facebook Ad', 'new_lead',        2, 'medium', null,   'UK Masters - Sept Intake', 1,  false, null, null, null, null, null),
  ('Arjun',    'Reddy',     '+919820010004', null,                       'Facebook Ad', 'contact_needed',  3, 'high',   600000, 'Australia Study Visa',     1,  false, null, null, null, null, null),
  ('Sneha',    'Kulkarni',  '+919820010005', 'sneha.k@example.com',      'Instagram',   'contact_needed',  1, 'low',    null,   'Canada PR Webinar',        2,  false, null, null, null, null, null),
  -- Being worked
  ('Vikram',   'Singh',     '+919820010006', 'vikram.singh@example.com', 'Facebook Ad', 'contacted',       1, 'medium', 350000, 'UK Masters - Sept Intake', 3,  true,  'no_answer',            -1, '11:00', null, null),
  ('Meera',    'Joshi',     '+919820010007', null,                       'Referral',    'contacted',       2, 'medium', null,   null,                       4,  true,  'follow_up',            -1, '16:00', null, null),
  ('Aditya',   'Verma',     '+919820010008', 'aditya.v@example.com',     'Website',     'contacted',       3, 'low',    200000, null,                       4,  true,  'no_answer',            -2, null,    null, null),
  ('Ishita',   'Bansal',    '+919820010009', 'ishita.b@example.com',     'Facebook Ad', 'interested',      2, 'high',   750000, 'Australia Study Visa',     6,  true,  'connected_interested', 0, '17:30', null, null),
  ('Karan',    'Malhotra',  '+919820010010', null,                       'Instagram',   'interested',      1, 'medium', 400000, 'Canada PR Webinar',        7,  true,  'connected_interested', 0, '23:00', null, null),
  ('Pooja',    'Desai',     '+919820010011', 'pooja.desai@example.com',  'Facebook Ad', 'interested',      3, 'high',   520000, 'UK Masters - Sept Intake', 8,  true,  'connected_interested', -1, '12:00', null, null),
  ('Nikhil',   'Rao',       '+919820010012', 'nikhil.rao@example.com',   'Referral',    'meeting_scheduled', 1, 'high', 680000, null,                       9,  true,  'meeting',              null, null,  0,    null),
  ('Divya',    'Pillai',    '+919820010013', 'divya.p@example.com',      'Facebook Ad', 'meeting_scheduled', 2, 'medium', 300000, 'UK Masters - Sept Intake', 10, true, 'meeting',            null, null,  1,    null),
  ('Sameer',   'Khan',      '+919820010014', null,                       'Instagram',   'meeting_completed', 3, 'medium', 450000, 'Canada PR Webinar',      12, true,  'connected_interested', 1, '15:00', -1,   null),
  ('Tanvi',    'Shah',      '+919820010015', 'tanvi.shah@example.com',   'Facebook Ad', 'payment_pending', 2, 'high',   800000, 'Australia Study Visa',    14, true,  'connected_interested', 0, '14:00', -3,   null),
  -- Closed
  ('Rahul',    'Gupta',     '+919820010016', 'rahul.gupta@example.com',  'Referral',    'won',             1, 'high',   900000, null,                       20, true,  'connected_interested', null, null, -6,   null),
  ('Neha',     'Agarwal',   '+919820010017', 'neha.a@example.com',       'Facebook Ad', 'won',             3, 'medium', 500000, 'UK Masters - Sept Intake', 25, true,  'connected_interested', null, null, -9,   null),
  ('Manish',   'Tiwari',    '+919820010018', null,                       'Website',     'lost',            2, 'low',    250000, null,                       18, true,  'not_interested',       null, null, null, 'Not interested'),
  ('Simran',   'Kaur',      '+919820010019', 'simran.kaur@example.com',  'Instagram',   'lost',            1, 'medium', 300000, 'Canada PR Webinar',        22, true,  'no_answer',            null, null, null, 'No response');

do $$
declare
  v_org uuid;
  v_pipeline uuid;
  v_admin uuid;
  v_manager uuid;
  v_reps uuid[];
  v_today date := (now() at time zone 'Asia/Kolkata')::date;

  v_stage record;

  r record;
  v_contact uuid;
  v_lead uuid;
  v_stage_id uuid;
  v_assignee uuid;
  v_created timestamptz;
  v_is_meta boolean;
  v_rep_name text;
  v_conversation uuid;
begin
  -- Organization -------------------------------------------------------------
  insert into organizations (name, slug, calendly_booking_url, timezone, default_country, currency)
  values ('Summit Sales Group', 'summit-sales-group', 'https://calendly.com/summit-sales-group/intro-call',
          'Asia/Kolkata', 'IN', 'INR')
  returning id into v_org;

  insert into pipelines (org_id, name, is_default) values (v_org, 'Sales Pipeline', true)
  returning id into v_pipeline;

  -- Users ----------------------------------------------------------------
  v_admin   := seed_user('admin@summitsales.test', 'password123', 'Alex Morgan');
  v_manager := seed_user('manager@summitsales.test', 'password123', 'Taylor Reed');
  v_reps := array[
    seed_user('jordan@summitsales.test', 'password123', 'Jordan Blake'),
    seed_user('priya@summitsales.test', 'password123', 'Priya Shah'),
    seed_user('marcus@summitsales.test', 'password123', 'Marcus Lee')
  ];

  insert into organization_members (org_id, user_id, role) values
    (v_org, v_admin, 'admin'),
    (v_org, v_manager, 'manager'),
    (v_org, v_reps[1], 'salesperson'),
    (v_org, v_reps[2], 'salesperson'),
    (v_org, v_reps[3], 'salesperson');

  -- V1 pipeline ------------------------------------------------------------
  -- Stage semantics are the flags (is_default / is_won / is_lost), not the labels.
  for v_stage in
    select * from (values
      ('new_lead',           'New Lead',           10, true,  false, false),
      ('contact_needed',     'Contact Needed',     20, false, false, false),
      ('contacted',          'Contacted',          30, false, false, false),
      ('interested',         'Interested',         40, false, false, false),
      ('meeting_scheduled',  'Meeting Scheduled',  50, false, false, false),
      ('meeting_completed',  'Meeting Completed',  60, false, false, false),
      ('payment_pending',    'Payment Pending',    70, false, false, false),
      ('won',                'Won',                80, false, true,  false),
      ('lost',               'Lost',               90, false, false, true)
    ) as t(key, label, sort_order, is_default, is_won, is_lost)
  loop
    insert into lead_statuses (org_id, pipeline_id, key, label, sort_order, is_default, is_won, is_lost)
    values (v_org, v_pipeline, v_stage.key, v_stage.label, v_stage.sort_order,
            v_stage.is_default, v_stage.is_won, v_stage.is_lost);
  end loop;

  -- WhatsApp message templates ----------------------------------------------
  -- In production these are authored and approved in Meta Business Manager and
  -- synced in. These demo ones let the mock WhatsApp adapter be exercised
  -- immediately; a real sync replaces them.
  insert into whatsapp_templates (org_id, template_id, name, language, category, status, body_text, variable_count) values
    (v_org, 'demo-welcome-intro', 'welcome_intro', 'en', 'MARKETING', 'APPROVED',
     'Hi {{1}}, thanks for your interest in Summit Sales Group! When is a good time for a quick call?', 1),
    (v_org, 'demo-meeting-reminder', 'meeting_reminder', 'en', 'UTILITY', 'APPROVED',
     'Hi {{1}}, a quick reminder that we are meeting on {{2}}. See you then!', 2),
    (v_org, 'demo-follow-up', 'follow_up_check_in', 'en', 'MARKETING', 'APPROVED',
     'Hi {{1}}, just checking in — do you have any questions about the programme?', 1);

  -- Contacts, opportunities and their history ----------------------------------
  for r in select * from _demo_leads loop
    v_created := now() - make_interval(days => r.days_ago);
    v_is_meta := r.campaign is not null;
    v_assignee := case when r.rep = 0 then null else v_reps[r.rep] end;
    v_rep_name := case r.rep when 1 then 'Jordan' when 2 then 'Priya' when 3 then 'Marcus' else null end;
    select id into v_stage_id from lead_statuses where org_id = v_org and key = r.stage;

    insert into contacts (
      org_id, first_name, last_name, phone, phone_normalized, email, email_normalized,
      source, tags, created_by, created_at
    ) values (
      v_org, r.first_name, r.last_name, r.phone, r.phone, r.email, lower(r.email),
      r.source,
      case when v_is_meta then array['meta-ad'] else '{}'::text[] end,
      case when v_is_meta then null else v_admin end,
      v_created
    ) returning id into v_contact;

    insert into leads (
      org_id, contact_id, pipeline_id, status_id, source, assigned_to, created_by,
      priority, value, lost_reason, first_contacted_at, external_provider, external_id, created_at
    ) values (
      v_org, v_contact, v_pipeline, v_stage_id, r.source, v_assignee,
      case when v_is_meta then null else v_admin end,
      r.priority, r.value, r.lost_reason,
      case when r.contacted then v_created + interval '2 hours' else null end,
      case when v_is_meta then 'meta' else null end,
      case when v_is_meta then 'seed-leadgen-' || r.phone else null end,
      v_created
    ) returning id into v_lead;

    insert into lead_inquiries (org_id, contact_id, lead_id, source, external_provider, external_id, created_at)
    values (v_org, v_contact, v_lead, r.source,
            case when v_is_meta then 'meta' else null end,
            case when v_is_meta then 'seed-leadgen-' || r.phone else null end,
            v_created);

    -- Timeline: creation, then assignment.
    if v_is_meta then
      insert into meta_lead_attribution (
        lead_id, org_id, leadgen_id, form_name, campaign_id, campaign_name, ad_name, platform, meta_created_time
      ) values (
        v_lead, v_org, 'seed-leadgen-' || r.phone, r.campaign || ' — Lead Form',
        'cmp-' || substr(md5(r.campaign), 1, 8), r.campaign, r.campaign || ' / Creative A',
        case when r.source = 'Instagram' then 'ig' else 'fb' end, v_created
      );
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
      values (v_org, v_lead, null, 'lead_imported_from_ads', 'Imported from Meta Ads',
              r.first_name || ' ' || r.last_name || ' submitted "' || r.campaign || '".', v_created);
    else
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
      values (v_org, v_lead, v_admin, 'lead_created', 'Lead created',
              r.first_name || ' ' || r.last_name || ' was added to the CRM.', v_created);
    end if;

    if v_assignee is not null then
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
      values (v_org, v_lead, v_manager, 'lead_assigned', 'Assigned to salesperson',
              'Lead assigned to ' || v_rep_name || '.', v_created + interval '5 minutes');
    end if;

    -- A call, for anyone who has been contacted.
    if r.contacted then
      insert into call_logs (org_id, lead_id, contact_id, caller_id, outcome, duration_seconds, notes, called_at)
      values (v_org, v_lead, v_contact, v_assignee, r.call_outcome,
              case when r.call_outcome = 'no_answer' then 0 else 240 end,
              case r.call_outcome
                when 'no_answer' then 'Rang out, will retry.'
                when 'connected_interested' then 'Discussed options and budget. Keen to proceed.'
                when 'meeting' then 'Agreed to a discovery meeting.'
                when 'not_interested' then 'Not looking right now.'
                else 'Asked to be called back.'
              end,
              v_created + interval '2 hours');
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
      values (v_org, v_lead, v_assignee, 'call_logged', 'Call: ' ||
              case r.call_outcome
                when 'connected_interested' then 'Connected / Interested'
                when 'no_answer' then 'No answer'
                when 'follow_up' then 'Follow up'
                when 'meeting' then 'Meeting'
                when 'not_interested' then 'Not interested'
                else 'Wrong number'
              end, null, v_created + interval '2 hours');
    end if;

    if r.stage not in ('new_lead', 'contact_needed') then
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
      values (v_org, v_lead, v_assignee, 'status_changed', 'Stage changed: New Lead → Contacted',
              null, v_created + interval '2 hours 5 minutes');
    end if;

    -- Pending follow-up (overdue / today / upcoming depending on fu_day).
    if r.fu_day is not null then
      insert into followups (org_id, lead_id, assigned_to, due_date, due_time, description, status, type, created_by)
      values (v_org, v_lead, v_assignee, v_today + r.fu_day, r.fu_time,
              'Call ' || r.first_name || ' to discuss next steps.', 'pending', 'call', v_assignee);
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
      values (v_org, v_lead, v_assignee, 'followup_created', 'Follow-up created', 'Call to discuss next steps.',
              v_created + interval '2 hours 10 minutes');
    end if;

    -- Meeting (past = completed, today/future = scheduled).
    if r.mt_day is not null then
      insert into meetings (
        org_id, lead_id, salesperson_id, scheduled_start, scheduled_end, meeting_url, status, created_by
      ) values (
        v_org, v_lead, v_assignee,
        ((v_today + r.mt_day) + time '15:00') at time zone 'Asia/Kolkata',
        ((v_today + r.mt_day) + time '15:30') at time zone 'Asia/Kolkata',
        'https://meet.google.com/abc-defg-hij',
        case when r.mt_day < 0 then 'completed' else 'scheduled' end,
        v_assignee
      );
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
      values (v_org, v_lead, v_assignee, 'meeting_scheduled', 'Meeting scheduled', 'Discovery meeting booked.',
              v_created + interval '3 hours');
      if r.mt_day < 0 then
        insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at)
        values (v_org, v_lead, v_assignee, 'meeting_completed', 'Meeting completed', 'Discovery meeting held.',
                now() - make_interval(days => -r.mt_day));
      end if;
    end if;

    if r.stage = 'won' then
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description)
      values (v_org, v_lead, v_assignee, 'status_changed', 'Stage changed: Payment Pending → Won', 'Enrolment confirmed.');
    elsif r.stage = 'lost' then
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description)
      values (v_org, v_lead, v_assignee, 'status_changed', 'Stage changed: Contacted → Lost', r.lost_reason);
    end if;

    -- One lead with a live WhatsApp conversation: we messaged, they replied an hour
    -- ago, so the 24-hour reply window is open in the demo.
    if r.first_name = 'Ishita' then
      insert into conversations (org_id, contact_id, last_inbound_at, last_message_at)
      values (v_org, v_contact, now() - interval '1 hour', now() - interval '1 hour')
      returning id into v_conversation;

      insert into whatsapp_messages (
        org_id, lead_id, conversation_id, direction, message_type, template_name, language, rendered_body,
        to_phone, wa_message_id, status, sent_by, created_at
      ) values (
        v_org, v_lead, v_conversation, 'outbound', 'template', 'welcome_intro', 'en',
        'Hi Ishita, thanks for your interest in Summit Sales Group! When is a good time for a quick call?',
        r.phone, 'demo.out.1', 'read', v_assignee, now() - interval '3 hours'
      );
      insert into whatsapp_messages (
        org_id, lead_id, conversation_id, direction, message_type, rendered_body,
        from_phone, wa_message_id, status, created_at
      ) values (
        v_org, v_lead, v_conversation, 'inbound', 'text',
        'Hi! Yes, I can talk after 5 pm today. Could you also share the fee structure?',
        r.phone, 'demo.in.1', 'received', now() - interval '1 hour'
      );
      insert into activities (org_id, lead_id, actor_id, activity_type, title, description, created_at) values
        (v_org, v_lead, v_assignee, 'whatsapp_sent', 'WhatsApp sent: welcome_intro',
         'Hi Ishita, thanks for your interest in Summit Sales Group! When is a good time for a quick call?',
         now() - interval '3 hours'),
        (v_org, v_lead, null, 'whatsapp_received', 'WhatsApp reply from Ishita',
         'Hi! Yes, I can talk after 5 pm today. Could you also share the fee structure?',
         now() - interval '1 hour');
    end if;

    if r.contacted and r.call_outcome = 'connected_interested' and r.stage not in ('won', 'lost') then
      insert into notes (org_id, lead_id, author_id, content)
      values (v_org, v_lead, v_assignee, 'Spoke with ' || r.first_name || ' — interested. Sending brochure and fee details on WhatsApp.');
    end if;
  end loop;
end $$;

drop function seed_user(text, text, text);
