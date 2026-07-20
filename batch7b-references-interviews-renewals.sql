-- ============================================================
-- YCDI Programme Hub - Batch 7b
-- Reference checks, interview records, and the January renewal list
--
-- Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run more than once. Read the Messages panel afterwards.
--
-- BATCH7B-MARKER references-interviews-renewals
--
-- Batch 7a built the front door. An application now arrives on its own
-- and lands in front of a coordinator. What it could not do was record
-- what happened next, so the two steps that actually decide whether
-- somebody is safe to deploy, the reference call and the interview, were
-- still living in a notebook.
--
-- Nothing here is invented either. YCDI-SAF-005 section 3.3 sets the six
-- reference questions word for word. YCDI-HR-004 section 6 sets the four
-- interview categories and the two-person panel. YCDI-SAF-005 section 3.5
-- sets the 31 January renewal deadline and says what failing it means.
--
-- Four decisions worth reading before the code.
--
-- 1. This does not build a second screening record. Batch 3 already has
--    volunteer_screening, holding reference_one_on, reference_two_on,
--    church_reference_on and interview_on as bare dates with nothing
--    behind them. These tables are what goes behind them, and a trigger
--    stamps those dates once an applicant is linked to a profile. One
--    truth, not two that drift.
--
-- 2. Appointment is gated, other movement is not. A coordinator can
--    shortlist and interview freely. Moving an application to 'appointed'
--    is refused until the references SAF-005 3.1 requires are actually on
--    file, and until any referee concern has been followed up, which 3.3
--    requires in those words. The refusal names the missing piece.
--
-- 3. A written reference the applicant handed in is recorded but does not
--    count. SAF-005 3.3 says written references submitted by the applicant
--    are insufficient as a sole source, so 'written_from_applicant' is a
--    value the form accepts and the counting ignores. Recording reality is
--    better than pretending the call happened.
--
-- 4. Nothing goes inactive by itself on 1 February. The renewal function
--    produces a list, and a second function applies the lapses when the
--    National Coordinator runs it. Batch 3 took the same view about
--    destroying records. A schedule that quietly changes someone's status
--    is a thing you install and then forget you installed.
--
-- Access follows applications, not the unamended policy. Regional
-- Coordinator for their own chapter, National Coordinator, Board
-- Safeguarding Chair. Not admins. Reference notes and interview notes are
-- screening material in the same sense an application is.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers, re-declared so this file stands on its own
-- ------------------------------------------------------------
create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_safeguarding_lead()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_safeguarding_lead from public.profiles where id = auth.uid()), false)
$$;

-- Row security on one table cannot see through to a row on another table
-- it does not own the policy for. A joined check would silently return
-- nothing, which is the shape of bug that costs a whole afternoon. This
-- reaches across as owner and hands back one uuid.
create or replace function public.application_chapter(p_application uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.volunteer_applications where id = p_application
$$;
grant execute on function public.application_chapter(uuid) to authenticated;

-- The single sentence that decides who may see anything in this batch.
create or replace function public.can_see_application(p_application uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.dir_role() = 'NC'
      or public.is_safeguarding_lead()
      or (public.dir_role() = 'RC'
          and public.dir_chapter() is not null
          and public.application_chapter(p_application) = public.dir_chapter())
$$;
grant execute on function public.can_see_application(uuid) to authenticated;

-- ============================================================
-- 1. Reference checks
-- ============================================================
-- The six questions are columns rather than rows in an answers table.
-- They are fixed by policy, they are always all six, and a coordinator
-- filling this in on a phone wants six boxes, not a repeating grid.
create table if not exists public.reference_checks (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.volunteer_applications(id) on delete cascade,

  -- Which of the two referees on the application this is.
  referee_slot   smallint not null check (referee_slot in (1,2)),
  referee_name   text not null,
  referee_contact text,
  referee_is_church_leader boolean not null default false,

  -- SAF-005 3.3: contact by phone or email. A written reference the
  -- applicant brought is recorded honestly and counts for nothing.
  obtained_via   text not null
                 check (obtained_via in ('phone','email','written_from_applicant')),
  checked_on     date not null default current_date,
  checked_by     uuid references public.profiles(id) on delete set null,

  -- The six questions, in the order SAF-005 3.3 sets them.
  q1_known_how_long        text,
  q2_christian_character   text,
  q3_observed_with_youth   text,
  q4_concerns_known        text,
  q5_would_entrust_own     text,
  q6_anything_else         text,

  -- 3.3: any reference who expresses concern, however vaguely, shall be
  -- followed up before the appointment proceeds. Two booleans and a note,
  -- because "followed up" has to be a thing somebody asserts, not a thing
  -- the software infers from an empty box.
  concern_raised boolean not null default false,
  concern_detail text,
  followup_done  boolean not null default false,
  followup_note  text,
  followup_by    uuid references public.profiles(id) on delete set null,
  followup_at    timestamptz,

  created_at     timestamptz not null default now(),

  constraint ref_concern_has_detail check (
    concern_raised is not true or coalesce(btrim(concern_detail),'') <> ''
  ),
  constraint ref_followup_has_note check (
    followup_done is not true or coalesce(btrim(followup_note),'') <> ''
  ),
  -- A follow-up on a reference that raised no concern is nonsense, and
  -- allowing it would let the appointment gate be opened by ticking a box
  -- on the wrong record.
  constraint ref_followup_needs_concern check (
    followup_done is not true or concern_raised is true
  )
);

comment on table public.reference_checks is
  'Reference check notes against the six questions in YCDI-SAF-005 3.3. Screening material under 3.8. Readable by the National Coordinator, the Board Safeguarding Chair, and the Regional Coordinator for the chapter applied to. Not readable by admins.';

create unique index if not exists ref_one_per_slot
  on public.reference_checks (application_id, referee_slot);
create index if not exists ref_by_application
  on public.reference_checks (application_id, checked_on desc);

-- Only phone and email count toward the requirement. Kept as a function
-- rather than repeated inline, so there is one place to change if the
-- policy ever softens.
create or replace function public.reference_counts(p_via text)
returns boolean language sql immutable as $$
  select p_via in ('phone','email')
$$;
grant execute on function public.reference_counts(text) to authenticated;

-- ============================================================
-- 2. Interview records
-- ============================================================
-- HR-004 section 6: four categories, structured questions, and a panel of
-- at least two persons. The panel is an array of names rather than a
-- child table so that "at least two" can be a check constraint the
-- database enforces, instead of a rule the application layer promises to
-- keep. Panel members are often not hub users, so names are the honest
-- unit, with profile ids alongside where they exist.
create table if not exists public.interview_records (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.volunteer_applications(id) on delete cascade,

  held_on        date not null default current_date,
  format         text not null default 'in_person'
                 check (format in ('in_person','video','phone')),

  panel_names       text[] not null,
  panel_profile_ids uuid[],

  -- Category 1: motivation and faith.
  motivation_faith_notes text,
  motivation_faith_score smallint check (motivation_faith_score between 1 and 5),
  -- Category 2: competency.
  competency_notes       text,
  competency_score       smallint check (competency_score between 1 and 5),
  -- Category 3: values, including the disclosure question.
  values_notes           text,
  values_score           smallint check (values_score between 1 and 5),
  -- Category 4: role-specific.
  role_specific_notes    text,
  role_specific_score    smallint check (role_specific_score between 1 and 5),

  recommendation text not null default 'further_interview'
                 check (recommendation in
                   ('appoint','appoint_with_conditions','do_not_appoint','further_interview')),
  conditions     text,

  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),

  -- array_length hands back null rather than zero for an empty array, and
  -- a check constraint treats null as passing, so an interview with
  -- nobody on the panel would have walked straight in. The coalesce is
  -- the whole point of this line.
  constraint interview_panel_of_two check (
    coalesce(array_length(panel_names, 1), 0) >= 2
  ),
  constraint interview_conditions_stated check (
    recommendation <> 'appoint_with_conditions'
    or coalesce(btrim(conditions),'') <> ''
  )
);

comment on table public.interview_records is
  'Interview records structured against the four categories in YCDI-HR-004 section 6. Panels of at least two persons, enforced. Same access as reference checks. Not readable by admins.';

create index if not exists interview_by_application
  on public.interview_records (application_id, held_on desc);

-- ============================================================
-- 3. Who can read and write them
-- ============================================================
alter table public.reference_checks   enable row level security;
alter table public.interview_records  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['reference_checks','interview_records']
  loop
    execute format('drop policy if exists %I_read   on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);

    execute format($f$create policy %I_read on public.%I
      for select to authenticated
      using (public.can_see_application(application_id))$f$, t, t);

    execute format($f$create policy %I_insert on public.%I
      for insert to authenticated
      with check (public.can_see_application(application_id))$f$, t, t);

    execute format($f$create policy %I_update on public.%I
      for update to authenticated
      using (public.can_see_application(application_id))
      with check (public.can_see_application(application_id))$f$, t, t);

    -- Only the National Coordinator removes a screening record, and only
    -- for a mistyped one. The real removal route is the twelve month
    -- purge in 7a, which cascades from the application.
    execute format($f$create policy %I_delete on public.%I
      for delete to authenticated
      using (public.dir_role() = 'NC')$f$, t, t);

    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ============================================================
-- 4. What is still missing before somebody can be appointed
-- ============================================================
-- One function, called by the gate below and by the screen, so the list a
-- coordinator reads and the rule that stops them are the same sentence.
--
-- SAF-005 3.1 by role. A school-contact volunteer needs two references
-- with at least one from a pastor, elder or church leader, and a
-- mandatory interview. An event-only volunteer with no child contact
-- needs one reference and the interview is optional.
create or replace function public.screening_gaps(p_application uuid)
returns table (gap text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_role      text;
  v_counted   int;
  v_church    int;
  v_open      int;
  v_interviews int;
  v_no_go     int;
begin
  if not public.can_see_application(p_application) then
    raise exception 'You cannot see this application.' using errcode = '42501';
  end if;

  select role_sought into v_role
  from public.volunteer_applications where id = p_application;
  if not found then
    raise exception 'That application no longer exists.';
  end if;

  select count(*) into v_counted
  from public.reference_checks
  where application_id = p_application and public.reference_counts(obtained_via);

  select count(*) into v_church
  from public.reference_checks
  where application_id = p_application
    and public.reference_counts(obtained_via)
    and referee_is_church_leader;

  select count(*) into v_open
  from public.reference_checks
  where application_id = p_application
    and concern_raised and not followup_done;

  select count(*) into v_interviews
  from public.interview_records where application_id = p_application;

  -- A panel that said no still stops an appointment, but the newest panel
  -- is the one that speaks. Two interviews and a changed mind is a normal
  -- thing to happen, and the earlier record stays on file rather than
  -- being edited away, so anybody reviewing the decision later can see
  -- both and ask why.
  select count(*) into v_no_go
  from (
    select recommendation
    from public.interview_records
    where application_id = p_application
    order by held_on desc, created_at desc
    limit 1
  ) latest
  where latest.recommendation = 'do_not_appoint';

  if v_role = 'event_only' then
    if v_counted < 1 then
      return query select 'One reference is needed, taken by phone or email.'::text;
    end if;
  else
    if v_counted < 2 then
      return query select
        ('Two references are needed, taken by phone or email. ' ||
         v_counted::text || ' on file.')::text;
    end if;
    if v_church < 1 then
      return query select 'At least one reference must come from a pastor, elder or church leader.'::text;
    end if;
    if v_interviews < 1 then
      return query select 'An interview record is needed for a role involving school or child contact.'::text;
    end if;
  end if;

  if v_open > 0 then
    return query select
      ('A referee raised a concern that has not been followed up. ' ||
       'SAF-005 3.3 requires the follow-up before the appointment proceeds.')::text;
  end if;

  if v_no_go > 0 then
    return query select 'An interview panel recommended not appointing this person.'::text;
  end if;
end;
$$;

grant execute on function public.screening_gaps(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4b. The gate itself
-- ------------------------------------------------------------
-- decide_application came from 7a. It is replaced whole rather than
-- patched, so this file can be run on its own and the version that ends
-- up in the database is the one written here.
--
-- Only 'appointed' is gated. Shortlisting and interviewing move freely,
-- because the point of the screening record is to be filled in during
-- those stages, and a gate on the early steps would just teach people to
-- record the interview after the fact.
create or replace function public.decide_application(
  p_application uuid,
  p_status      text,
  p_note        text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chapter uuid;
  v_role    text := public.dir_role();
  v_gaps    text;
begin
  select chapter_id into v_chapter from public.volunteer_applications where id = p_application;
  if not found then
    raise exception 'That application no longer exists.';
  end if;

  if not (v_role = 'NC' or (v_role = 'RC' and public.dir_chapter() is not null and v_chapter = public.dir_chapter())) then
    raise exception 'You cannot make a decision on this application.' using errcode = '42501';
  end if;

  if p_status not in ('new','shortlisted','interviewing','declined','withdrawn','appointed') then
    raise exception 'Unknown decision: %', p_status;
  end if;

  if p_status = 'appointed' then
    select string_agg(gap, ' ') into v_gaps from public.screening_gaps(p_application);
    if coalesce(btrim(v_gaps),'') <> '' then
      raise exception 'Screening is not complete: %', v_gaps using errcode = '42501';
    end if;
  end if;

  update public.volunteer_applications
  set status = p_status,
      decision_note = coalesce(p_note, decision_note),
      decided_at = case when p_status in ('declined','withdrawn','appointed') then now() else null end,
      decided_by = case when p_status in ('declined','withdrawn','appointed') then auth.uid() else null end
  where id = p_application;
end;
$$;

grant execute on function public.decide_application(uuid, text, text) to authenticated;

-- ============================================================
-- 5. Feeding the Batch 3 screening record
-- ============================================================
-- volunteer_screening has held reference_one_on, reference_two_on,
-- church_reference_on and interview_on since Batch 3, with nothing behind
-- them. This is what fills them in, so the compliance screen the National
-- Coordinator already reads keeps telling the truth without anybody
-- typing the same date twice.
--
-- It runs when an application is linked to a profile, which is the moment
-- an appointed applicant becomes a person in the hub.
create or replace function public.stamp_screening_from_application(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
  v_role    text;
  v_cat     text;
  v_r1      date;
  v_r2      date;
  v_church  date;
  v_int     date;
  v_applied date;
begin
  select linked_profile_id, role_sought, submitted_at::date
    into v_profile, v_role, v_applied
  from public.volunteer_applications where id = p_application;

  if v_profile is null then
    return;
  end if;

  select min(checked_on) filter (where referee_slot = 1),
         min(checked_on) filter (where referee_slot = 2),
         min(checked_on) filter (where referee_is_church_leader)
    into v_r1, v_r2, v_church
  from public.reference_checks
  where application_id = p_application and public.reference_counts(obtained_via);

  select min(held_on) into v_int
  from public.interview_records where application_id = p_application;

  v_cat := case when v_role = 'event_only' then 'event_volunteer' else 'general_volunteer' end;

  insert into public.volunteer_screening (
    profile_id, role_category, application_on,
    reference_one_on, reference_two_on, church_reference_on, interview_on
  ) values (
    v_profile, v_cat, v_applied, v_r1, v_r2, v_church, v_int
  )
  on conflict (profile_id) do update set
    application_on      = coalesce(public.volunteer_screening.application_on, excluded.application_on),
    reference_one_on    = coalesce(excluded.reference_one_on,    public.volunteer_screening.reference_one_on),
    reference_two_on    = coalesce(excluded.reference_two_on,    public.volunteer_screening.reference_two_on),
    church_reference_on = coalesce(excluded.church_reference_on, public.volunteer_screening.church_reference_on),
    interview_on        = coalesce(excluded.interview_on,        public.volunteer_screening.interview_on),
    updated_at          = now();

  -- The six onboarding steps in Batch 6a track the same two events.
  update public.volunteer_records
  set references_received_on = coalesce(references_received_on, coalesce(v_r2, v_r1)),
      interviewed_on         = coalesce(interviewed_on, v_int),
      applied_on             = coalesce(applied_on, v_applied),
      updated_at             = now()
  where profile_id = v_profile;
end;
$$;

grant execute on function public.stamp_screening_from_application(uuid) to authenticated;

create or replace function public.stamp_on_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.linked_profile_id is not null
     and new.linked_profile_id is distinct from old.linked_profile_id then
    perform public.stamp_screening_from_application(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_on_link on public.volunteer_applications;
create trigger trg_stamp_on_link
  after update on public.volunteer_applications
  for each row execute function public.stamp_on_link();

-- ============================================================
-- 6. The 31 January renewal
-- ============================================================
-- SAF-005 3.5. Every active volunteer and staff member renews the
-- Safeguarding Declaration by 31 January. The renewal confirms three
-- things: nothing new to disclose, refresher training completed during
-- the year, and continued commitment to the standards.
--
-- Batch 3 already holds the declarations, one row per person per year,
-- with a unique index enforcing it. Nothing is duplicated here. This is
-- the list of who has not done it and the function that acts on the list.
create or replace function public.renewal_deadline(p_year integer default null)
returns date language sql immutable as $$
  select make_date(coalesce(p_year, extract(year from current_date)::integer), 1, 31)
$$;
grant execute on function public.renewal_deadline(integer) to authenticated;

create or replace function public.declaration_renewals(p_year integer default null)
returns table (
  profile_id      uuid,
  full_name       text,
  role            text,
  chapter_name    text,
  volunteer_status text,
  renewed_on      date,
  training_expires date,
  training_current boolean,
  deadline        date,
  state           text
)
language sql stable security definer set search_path = public as $$
  with y as (select coalesce(p_year, extract(year from current_date)::integer) as yr)
  select
    p.id::uuid,
    p.full_name::text,
    p.role::text,
    c.name::text,
    coalesce(v.status, 'no record')::text,
    d.signed_on::date,
    t.expires_on::date,
    (t.expires_on is not null and t.expires_on >= public.renewal_deadline((select yr from y)))::boolean,
    public.renewal_deadline((select yr from y)),
    (case
       when d.id is not null then 'renewed'
       when current_date <= public.renewal_deadline((select yr from y)) then 'due'
       else 'overdue'
     end)::text
  from public.profiles p
  left join public.chapters c on c.id = p.chapter_id
  left join public.volunteer_records v on v.profile_id = p.id
  left join lateral (
    select sd.id, sd.signed_on
    from public.safeguarding_declarations sd
    where sd.profile_id = p.id and sd.covers_year = (select yr from y)
    limit 1
  ) d on true
  left join lateral (
    select max(st.expires_on) as expires_on
    from public.safeguarding_training st
    where st.profile_id = p.id and st.kind in ('refresher','orientation')
  ) t on true
  where coalesce(v.status, 'active') in ('active','onboarding')
    and (public.dir_role() = 'NC'
         or public.is_safeguarding_lead()
         or (public.dir_role() = 'RC'
             and public.dir_chapter() is not null
             and p.chapter_id = public.dir_chapter()))
  order by
    (case when d.id is not null then 2 else 1 end),
    p.full_name
$$;

grant execute on function public.declaration_renewals(integer) to authenticated;

-- ------------------------------------------------------------
-- 6b. Applying the lapse
-- ------------------------------------------------------------
-- 3.5: failure to renew by the deadline puts the person on inactive
-- status until the declaration is completed. Deliberate, not scheduled,
-- and only after the deadline has actually passed. Running it in December
-- would make everybody inactive for a deadline eleven months away.
create or replace function public.apply_renewal_lapses(p_year integer default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_year integer := coalesce(p_year, extract(year from current_date)::integer);
  v_done int;
begin
  if public.dir_role() is distinct from 'NC' and not public.is_safeguarding_lead() then
    raise exception 'Only the National Coordinator or the Board Safeguarding Chair can run this.'
      using errcode = '42501';
  end if;

  if current_date <= public.renewal_deadline(v_year) then
    raise exception 'The % deadline has not passed yet. It falls on %.',
      v_year, to_char(public.renewal_deadline(v_year), 'DD Mon YYYY');
  end if;

  with lapsed as (
    update public.volunteer_records v
    set status = 'inactive',
        notes = coalesce(nullif(btrim(v.notes),'') || ' | ', '')
                || 'Inactive from ' || to_char(current_date,'DD Mon YYYY')
                || ': safeguarding declaration for ' || v_year::text || ' not renewed.',
        updated_at = now()
    where v.status = 'active'
      and not exists (
        select 1 from public.safeguarding_declarations d
        where d.profile_id = v.profile_id and d.covers_year = v_year
      )
    returning 1
  )
  select count(*) into v_done from lapsed;

  return v_done;
end;
$$;

grant execute on function public.apply_renewal_lapses(integer) to authenticated;

-- ------------------------------------------------------------
-- 6c. Coming back
-- ------------------------------------------------------------
-- 3.5 says inactive "until the declaration is completed", so completing
-- it has to be the thing that brings somebody back. Without this the
-- lapse is a one-way door and somebody ends up editing status by hand.
create or replace function public.reactivate_on_declaration()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.volunteer_records
  set status = 'active', updated_at = now()
  where profile_id = new.profile_id
    and status = 'inactive'
    and new.covers_year >= extract(year from current_date)::integer;
  return new;
end;
$$;

drop trigger if exists trg_reactivate_on_declaration on public.safeguarding_declarations;
create trigger trg_reactivate_on_declaration
  after insert on public.safeguarding_declarations
  for each row execute function public.reactivate_on_declaration();

-- ============================================================
-- 7. The audit log
-- ============================================================
-- No new entity. A reference check and an interview belong to an
-- application, so they are logged as application movements, and the log
-- keeps carrying no case content whatsoever. That is the whole reason
-- admins are allowed to read it, so nothing that follows may ever put a
-- referee's words, a panel's notes, or a disclosure into it.
create or replace function public.audit_screening_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref     text;
  v_chapter uuid;
  v_action  text;
begin
  select reference, chapter_id into v_ref, v_chapter
  from public.volunteer_applications
  where id = coalesce(new.application_id, old.application_id);

  v_action := case tg_table_name
                when 'reference_checks'  then 'reference_recorded'
                when 'interview_records' then 'interview_recorded'
                else 'screening_changed'
              end;

  if tg_op = 'DELETE' then
    perform public.audit_write('application', 'screening_record_deleted', v_ref, null, v_chapter,
                               null, tg_table_name, null, null);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- The only update worth a line is the follow-up on a concern, because
    -- that is the one that unlocks an appointment.
    if tg_table_name = 'reference_checks'
       and new.followup_done and not old.followup_done then
      perform public.audit_write('application', 'reference_concern_followed_up', v_ref, null, v_chapter,
                                 null, null, null, null);
    end if;
    return new;
  end if;

  perform public.audit_write('application', v_action, v_ref, null, v_chapter, null, null, null, null);
  return new;
end;
$$;

drop trigger if exists audit_reference_checks on public.reference_checks;
create trigger audit_reference_checks
  after insert or update or delete on public.reference_checks
  for each row execute function public.audit_screening_change();

drop trigger if exists audit_interview_records on public.interview_records;
create trigger audit_interview_records
  after insert or update or delete on public.interview_records
  for each row execute function public.audit_screening_change();

-- ============================================================
-- Done. What you should see below.
-- ============================================================
do $$
declare
  v_anon_ref  boolean;
  v_anon_int  boolean;
  v_gate      boolean;
  v_deadline  date;
begin
  select has_table_privilege('anon','public.reference_checks','SELECT')  into v_anon_ref;
  select has_table_privilege('anon','public.interview_records','SELECT') into v_anon_int;
  select has_function_privilege('authenticated','public.screening_gaps(uuid)','EXECUTE') into v_gate;
  select public.renewal_deadline() into v_deadline;

  raise notice '---------------------------------------------';
  raise notice 'A stranger can read reference notes: %', case when v_anon_ref then 'YES, that is wrong' else 'no, correct' end;
  raise notice 'A stranger can read interview notes: %', case when v_anon_int then 'YES, that is wrong' else 'no, correct' end;
  raise notice 'The appointment gate is installed: %', case when v_gate then 'yes, correct' else 'NO, that is wrong' end;
  raise notice 'This year the renewal deadline falls on %', to_char(v_deadline, 'DD Mon YYYY');
  raise notice '';
  raise notice 'Reference notes and interview notes are readable by the National';
  raise notice 'Coordinator, the Board Safeguarding Chair, and the Regional';
  raise notice 'Coordinator for the chapter applied to. Not by admins.';
  raise notice '---------------------------------------------';
end $$;
