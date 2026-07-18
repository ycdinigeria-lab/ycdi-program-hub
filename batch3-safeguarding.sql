-- ============================================================
-- YCDI Programme Hub
-- Batch 3: safeguarding
-- ============================================================
-- Run this in the Supabase SQL editor before pushing the code
-- that goes with it.
--
-- Built to YCDI-SAF-001 (Child Protection Policy), YCDI-SAF-004
-- (Abuse Reporting Procedures) and YCDI-SAF-005 (Volunteer and
-- Staff Screening Procedures).
--
-- READ THIS BEFORE RUNNING.
--
-- Access here does NOT follow the rest of the app. Everywhere else,
-- an admin sees everything. The Abuse Reporting Procedures limit
-- safeguarding records to four people: the person who reported the
-- concern, the relevant Designated Safeguarding Officers, the
-- National Coordinator, and the Board Safeguarding Committee Chair.
--
-- So in this file:
--   being an admin grants nothing
--   a Regional Coordinator is the Chapter DSO, own chapter only
--   a National Coordinator is the Operational DSO, sees all
--   the Board Safeguarding Chair is marked by a separate flag
--   the reporter keeps access to their own report
--
-- Retention, per policy:
--   incidents, seven years or until the child turns 25, whichever
--   is longer; referred to police or NAPTIP, kept indefinitely;
--   screening records, seven years after service ends.
--
-- Age is stored as a band, not a birth date, so "until 25" cannot be
-- worked out exactly. This assumes the youngest age in the band,
-- which always keeps the record longer rather than shorter.
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Designated Safeguarding Officers
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists is_safeguarding_lead boolean not null default false;

comment on column public.profiles.is_safeguarding_lead is
  'Board Safeguarding Committee Chair. Sees every safeguarding record. Not the same as is_admin.';

create or replace function public.is_safeguarding_lead()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_safeguarding_lead from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.set_safeguarding_lead(target uuid, make_lead boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.dir_role() <> 'NC' then
    raise exception 'Only a National Coordinator can appoint a safeguarding lead.';
  end if;
  if not make_lead
     and coalesce((select is_safeguarding_lead from public.profiles where id = target), false)
     and (select count(*) from public.profiles where is_safeguarding_lead) <= 1 then
    raise exception 'There must always be at least one safeguarding lead.';
  end if;
  -- The guard below refuses hand edits of this column. This flag says
  -- the change is coming from here, and it lasts only for the length of
  -- this transaction, so it cannot be left switched on.
  perform set_config('ycdi.sg_lead_change', 'on', true);
  update public.profiles set is_safeguarding_lead = make_lead where id = target;
  perform set_config('ycdi.sg_lead_change', 'off', true);
end;
$$;

grant execute on function public.is_safeguarding_lead()               to authenticated;
grant execute on function public.set_safeguarding_lead(uuid, boolean) to authenticated;

-- The profiles guard from batch0b blocks non-admins changing privileged
-- columns. Teach it about this one, which nobody may set by hand.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_admin is distinct from old.is_admin
       or new.chapter_id is distinct from old.chapter_id then
      raise exception 'You cannot change your own role, chapter or admin access.';
    end if;
  end if;
  if new.is_safeguarding_lead is distinct from old.is_safeguarding_lead
     and coalesce(current_setting('ycdi.sg_lead_change', true), 'off') <> 'on' then
    raise exception 'Safeguarding lead is set through the safeguarding screen, not by editing a profile.';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. The incident register
-- ------------------------------------------------------------
create table if not exists public.safeguarding_incidents (
  id                uuid primary key default gen_random_uuid(),
  reference         text unique,
  chapter_id        uuid not null references public.chapters(id) on delete restrict,

  -- The five scenarios from the Abuse Reporting Procedures.
  scenario          text not null check (scenario in (
                      'disclosure',        -- A, a child tells someone
                      'observation',       -- B, a volunteer sees signs
                      'third_party',       -- C, someone else reports
                      'allegation_staff',  -- D, against a YCDI person
                      'immediate_danger'   -- E, emergency
                    )),

  occurred_on       date not null,
  reported_on       date not null default current_date,
  reported_by       uuid not null references public.profiles(id) on delete restrict,

  account           text not null,
  location          text,
  others_present    text,

  participant_id    uuid references public.participants(id) on delete set null,
  child_description text,
  child_age_band    text check (child_age_band in ('10-12','13-15','16-17','18+')),

  person_accused    uuid references public.profiles(id) on delete set null,
  accused_suspended boolean not null default false,

  status            text not null default 'Open'
                      check (status in ('Open','Under review','Referred','Closed')),

  nc_notified_at    timestamptz,
  referred_to       text,
  referred_at       timestamptz,
  emergency_called  boolean not null default false,

  outcome           text,
  closed_at         timestamptz,
  closed_by         uuid references public.profiles(id) on delete set null,

  retain_until      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists incidents_by_chapter
  on public.safeguarding_incidents(chapter_id, status, reported_on desc);

-- Every step taken, in order. Append only. This is the trail the Board
-- asks for afterwards, so it must not be quietly editable.
create table if not exists public.incident_actions (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.safeguarding_incidents(id) on delete cascade,
  action      text not null,
  detail      text,
  taken_by    uuid references public.profiles(id) on delete set null,
  taken_at    timestamptz not null default now()
);

create index if not exists incident_actions_order
  on public.incident_actions(incident_id, taken_at);

-- ------------------------------------------------------------
-- 3. Reference number and retention, worked out on the way in
-- ------------------------------------------------------------
create or replace function public.incident_retention(p_band text, p_reported date)
returns date language sql immutable set search_path = public as $$
  select greatest(
    (p_reported + interval '7 years')::date,
    (p_reported + make_interval(years => greatest(25 - case p_band
        when '10-12' then 10
        when '13-15' then 13
        when '16-17' then 16
        when '18+'   then 18
        else 10 end, 0)))::date
  )
$$;

create or replace function public.stamp_incident()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  if new.reference is null then
    select count(*) + 1 into v_seq
    from public.safeguarding_incidents
    where date_part('year', reported_on) = date_part('year', new.reported_on);
    new.reference := 'SG-' || to_char(new.reported_on, 'YYYY') || '-' || lpad(v_seq::text, 3, '0');
  end if;

  new.retain_until := public.incident_retention(
    coalesce(new.child_age_band,
             (select age_band from public.participants where id = new.participant_id)),
    new.reported_on);

  -- Once referred to the police or NAPTIP the record is kept
  -- indefinitely, so no retention date is set at all.
  if new.referred_at is not null then
    new.retain_until := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_stamp_incident on public.safeguarding_incidents;
create trigger trg_stamp_incident
  before insert or update on public.safeguarding_incidents
  for each row execute function public.stamp_incident();

-- ------------------------------------------------------------
-- 4. Who may see an incident
-- ------------------------------------------------------------
create or replace function public.can_see_incident(p_chapter uuid, p_reporter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_reporter = auth.uid()
      or public.dir_role() = 'NC'
      or public.is_safeguarding_lead()
      or (public.dir_role() = 'RC' and p_chapter = public.dir_chapter())
$$;

create or replace function public.can_raise_incident(p_chapter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- Standard 7 requires same-day reporting by any personnel, so this
  -- deliberately does not narrow who may raise a concern.
  select auth.uid() is not null
     and (public.dir_role() = 'NC' or p_chapter = public.dir_chapter())
$$;

create or replace function public.is_incident_dso(p_chapter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.dir_role() = 'NC'
      or public.is_safeguarding_lead()
      or (public.dir_role() = 'RC' and p_chapter = public.dir_chapter())
$$;

grant execute on function public.can_see_incident(uuid, uuid) to authenticated;
grant execute on function public.can_raise_incident(uuid)     to authenticated;
grant execute on function public.is_incident_dso(uuid)        to authenticated;

alter table public.safeguarding_incidents enable row level security;
alter table public.incident_actions       enable row level security;

drop policy if exists sg_read   on public.safeguarding_incidents;
drop policy if exists sg_write  on public.safeguarding_incidents;
drop policy if exists sg_update on public.safeguarding_incidents;

create policy sg_read on public.safeguarding_incidents
  for select to authenticated using (public.can_see_incident(chapter_id, reported_by));

create policy sg_write on public.safeguarding_incidents
  for insert to authenticated
  with check (reported_by = auth.uid() and public.can_raise_incident(chapter_id));

-- Only the DSOs update a record. A reporter can read their own report
-- but cannot rewrite the account after the fact.
create policy sg_update on public.safeguarding_incidents
  for update to authenticated
  using (public.is_incident_dso(chapter_id))
  with check (public.is_incident_dso(chapter_id));

revoke delete on public.safeguarding_incidents from authenticated;

create or replace function public.incident_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.safeguarding_incidents i
    where i.id = p_id and public.can_see_incident(i.chapter_id, i.reported_by))
$$;
grant execute on function public.incident_visible(uuid) to authenticated;

drop policy if exists ia_read  on public.incident_actions;
drop policy if exists ia_write on public.incident_actions;

create policy ia_read on public.incident_actions
  for select to authenticated using (public.incident_visible(incident_id));

create policy ia_write on public.incident_actions
  for insert to authenticated
  with check (taken_by = auth.uid() and public.incident_visible(incident_id));

revoke update, delete on public.incident_actions from authenticated;

-- ------------------------------------------------------------
-- 5. Raising and moving an incident
-- ------------------------------------------------------------
create or replace function public.notify_safeguarding(p_title text, p_body text, p_ref uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- Deliberately vague. This lands on a phone somebody else may be
  -- holding, so it says a concern exists and nothing about the child.
  for r in select id from public.profiles where role = 'NC' or is_safeguarding_lead loop
    perform public.notify_person(r.id, 'safeguarding', p_title, p_body, 'more', 'safeguarding', p_ref);
  end loop;
end;
$$;

revoke execute on function public.notify_safeguarding(text, text, uuid) from public, authenticated;

create or replace function public.raise_incident(
  p_chapter        uuid,
  p_scenario       text,
  p_occurred_on    date,
  p_account        text,
  p_location       text default null,
  p_others_present text default null,
  p_participant    uuid default null,
  p_child_desc     text default null,
  p_child_band     text default null,
  p_accused        uuid default null,
  p_emergency      boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_chapter text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if not public.can_raise_incident(p_chapter) then
    raise exception 'You can only report a concern in your own chapter.';
  end if;
  if coalesce(trim(p_account), '') = '' then
    raise exception 'An account of what happened is required.';
  end if;
  if p_occurred_on > current_date then
    raise exception 'The date cannot be in the future.';
  end if;
  if p_scenario = 'allegation_staff' and p_accused is null then
    raise exception 'An allegation against a YCDI person must name who it concerns.';
  end if;

  insert into public.safeguarding_incidents (
    chapter_id, scenario, occurred_on, reported_by, account, location,
    others_present, participant_id, child_description, child_age_band,
    person_accused, emergency_called, accused_suspended)
  values (
    p_chapter, p_scenario, p_occurred_on, auth.uid(), p_account, p_location,
    p_others_present, p_participant, p_child_desc, p_child_band,
    p_accused, coalesce(p_emergency, false),
    -- Scenario D suspends the accused from activities involving children
    -- immediately, before anybody assesses anything.
    p_scenario = 'allegation_staff')
  returning id into v_id;

  insert into public.incident_actions (incident_id, action, detail, taken_by)
  values (v_id, 'Concern reported', 'Logged in the register.', auth.uid());

  if p_scenario = 'allegation_staff' then
    insert into public.incident_actions (incident_id, action, detail, taken_by)
    values (v_id, 'Accused suspended',
            'Suspended from all activities involving children with immediate effect, per Scenario D.',
            auth.uid());
  end if;

  select name into v_chapter from public.chapters where id = p_chapter;

  perform public.notify_safeguarding(
    'Safeguarding concern logged',
    'A concern has been reported in ' || coalesce(v_chapter, 'a chapter')
    || '. Open the register. The National Coordinator must be notified within 24 hours.',
    v_id);

  return v_id;
end;
$$;

create or replace function public.log_incident_action(
  p_incident uuid,
  p_action   text,
  p_detail   text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.incident_visible(p_incident) then
    raise exception 'You do not have access to that record.';
  end if;
  insert into public.incident_actions (incident_id, action, detail, taken_by)
  values (p_incident, p_action, nullif(p_detail, ''), auth.uid());
end;
$$;

create or replace function public.mark_nc_notified(p_incident uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_chapter uuid;
begin
  select chapter_id into v_chapter from public.safeguarding_incidents where id = p_incident;
  if v_chapter is null or not public.is_incident_dso(v_chapter) then
    raise exception 'Only a safeguarding officer can update that record.';
  end if;
  update public.safeguarding_incidents
     set nc_notified_at = coalesce(nc_notified_at, now()),
         status = case when status = 'Open' then 'Under review' else status end
   where id = p_incident;
  perform public.log_incident_action(p_incident, 'National Coordinator notified', null);
end;
$$;

create or replace function public.refer_incident(p_incident uuid, p_authority text, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.dir_role() <> 'NC' and not public.is_safeguarding_lead() then
    raise exception 'Only the National Coordinator or the Board Safeguarding Chair can refer a matter externally.';
  end if;
  if coalesce(trim(p_authority), '') = '' then
    raise exception 'Name the authority the matter was referred to.';
  end if;
  update public.safeguarding_incidents
     set referred_to = p_authority, referred_at = now(), status = 'Referred'
   where id = p_incident;
  perform public.log_incident_action(p_incident, 'Referred to ' || p_authority, p_detail);
end;
$$;

create or replace function public.close_incident(p_incident uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.dir_role() <> 'NC' and not public.is_safeguarding_lead() then
    raise exception 'Only the National Coordinator or the Board Safeguarding Chair can close a concern.';
  end if;
  if coalesce(trim(p_outcome), '') = '' then
    raise exception 'Record the outcome before closing.';
  end if;
  update public.safeguarding_incidents
     set status = 'Closed', outcome = p_outcome, closed_at = now(), closed_by = auth.uid()
   where id = p_incident;
  perform public.log_incident_action(p_incident, 'Closed', p_outcome);
end;
$$;

-- The clocks the policy sets: National Coordinator within 24 hours,
-- and the M&E framework's expectation of resolution within 30 days.
create or replace function public.incidents_overdue()
returns table (
  id            uuid,
  reference     text,
  chapter_name  text,
  scenario      text,
  reported_on   date,
  hours_waiting integer,
  what_is_late  text
)
language sql stable security definer set search_path = public as $$
  select i.id::uuid, i.reference::text, c.name::text, i.scenario::text, i.reported_on::date,
         (extract(epoch from (now() - i.created_at)) / 3600)::integer,
         (case when i.nc_notified_at is null
               then 'National Coordinator not yet notified'
               else 'Open beyond 30 days' end)::text
  from public.safeguarding_incidents i
  join public.chapters c on c.id = i.chapter_id
  where public.can_see_incident(i.chapter_id, i.reported_by)
    and i.status <> 'Closed'
    and ((i.nc_notified_at is null and i.created_at < now() - interval '24 hours')
      or i.created_at < now() - interval '30 days')
  order by i.created_at
$$;

grant execute on function public.raise_incident(uuid, text, date, text, text, text, uuid, text, text, uuid, boolean) to authenticated;
grant execute on function public.log_incident_action(uuid, text, text) to authenticated;
grant execute on function public.mark_nc_notified(uuid)                to authenticated;
grant execute on function public.refer_incident(uuid, text, text)      to authenticated;
grant execute on function public.close_incident(uuid, text)            to authenticated;
grant execute on function public.incidents_overdue()                   to authenticated;
grant execute on function public.incident_retention(text, date)        to authenticated;

grant select, insert, update on public.safeguarding_incidents to authenticated;
grant select, insert         on public.incident_actions       to authenticated;

-- ------------------------------------------------------------
-- 6. Training, declarations and screening
-- ------------------------------------------------------------
-- The part that fails in most organisations is not the policy, it is
-- the expiry dates nobody watches.

create table if not exists public.safeguarding_training (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('orientation','refresher','dso_specialist')),
  completed_on date not null,
  expires_on   date,
  delivered_by text,
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists training_by_person
  on public.safeguarding_training(profile_id, kind, completed_on desc);

-- Refresher and DSO specialist training are annual, so they lapse a
-- year after completion unless a date is given.
create or replace function public.stamp_training()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.expires_on is null and new.kind in ('refresher','dso_specialist') then
    new.expires_on := (new.completed_on + interval '1 year')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_training on public.safeguarding_training;
create trigger trg_stamp_training
  before insert or update on public.safeguarding_training
  for each row execute function public.stamp_training();

create table if not exists public.safeguarding_declarations (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('initial','renewal')),
  signed_on    date not null,
  covers_year  integer not null,
  document_ref text,
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create unique index if not exists declaration_one_per_year
  on public.safeguarding_declarations(profile_id, covers_year);

create table if not exists public.volunteer_screening (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  role_category       text not null check (role_category in
                        ('trustee','nec','regional_coordinator','general_volunteer',
                         'event_volunteer','paid_staff','consultant')),
  application_on      date,
  reference_one_on    date,
  reference_two_on    date,
  church_reference_on date,
  background_decl_on  date,
  interview_on        date,
  orientation_on      date,
  service_ended_on    date,
  notes               text,
  recorded_by         uuid references public.profiles(id) on delete set null,
  updated_at          timestamptz not null default now()
);

-- What the Screening Procedures require, by role category. Event
-- volunteers with no child contact need one reference rather than two,
-- and consultants only need a declaration where there is child contact.
create or replace function public.screening_complete(p_profile uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  y integer := extract(year from current_date);
begin
  select * into s from public.volunteer_screening where profile_id = p_profile;
  if s is null then return false; end if;

  if s.application_on is null or s.background_decl_on is null or s.orientation_on is null then
    return false;
  end if;
  if s.reference_one_on is null then
    return false;
  end if;
  if s.role_category not in ('event_volunteer','consultant') and s.reference_two_on is null then
    return false;
  end if;
  if s.role_category in ('trustee','nec','regional_coordinator','general_volunteer','paid_staff')
     and s.church_reference_on is null then
    return false;
  end if;

  if not exists (select 1 from public.safeguarding_declarations
                 where profile_id = p_profile and covers_year = y) then
    return false;
  end if;

  if not exists (select 1 from public.safeguarding_training
                 where profile_id = p_profile
                   and kind in ('refresher','orientation')
                   and (expires_on is null or expires_on >= current_date)) then
    return false;
  end if;

  return true;
end;
$$;

-- The single screen a National Coordinator should look at once a month.
create or replace function public.safeguarding_compliance()
returns table (
  profile_id       uuid,
  full_name        text,
  role             text,
  chapter_name     text,
  role_category    text,
  cleared          boolean,
  declaration_year integer,
  training_expires date,
  problem          text
)
language sql stable security definer set search_path = public as $$
  select
    p.id::uuid,
    p.full_name::text,
    p.role::text,
    c.name::text,
    s.role_category::text,
    public.screening_complete(p.id),
    (select max(d.covers_year) from public.safeguarding_declarations d
      where d.profile_id = p.id)::integer,
    (select max(t.expires_on) from public.safeguarding_training t
      where t.profile_id = p.id and t.kind in ('refresher','orientation'))::date,
    (case
       when s.profile_id is null then 'No screening record started'
       when not exists (select 1 from public.safeguarding_declarations d
                        where d.profile_id = p.id
                          and d.covers_year = extract(year from current_date))
            then 'Annual declaration not renewed'
       when not exists (select 1 from public.safeguarding_training t
                        where t.profile_id = p.id
                          and t.kind in ('refresher','orientation')
                          and (t.expires_on is null or t.expires_on >= current_date))
            then 'Training lapsed'
       when not public.screening_complete(p.id) then 'Screening incomplete'
       else null
     end)::text
  from public.profiles p
  left join public.chapters c on c.id = p.chapter_id
  left join public.volunteer_screening s on s.profile_id = p.id
  where coalesce(s.service_ended_on, current_date + 1) > current_date
    and (public.dir_role() = 'NC'
         or public.is_safeguarding_lead()
         or (public.dir_role() = 'RC' and p.chapter_id = public.dir_chapter()))
  order by public.screening_complete(p.id), p.full_name
$$;

alter table public.safeguarding_training     enable row level security;
alter table public.safeguarding_declarations enable row level security;
alter table public.volunteer_screening       enable row level security;

-- Screening files are limited to the National Coordinator and the Board
-- Safeguarding Chair. A Regional Coordinator sees training and
-- declarations for their own chapter, because they chase the renewals,
-- but not the screening file itself.
create or replace function public.can_see_screening()
returns boolean language sql stable security definer set search_path = public as $$
  select public.dir_role() = 'NC' or public.is_safeguarding_lead()
$$;
grant execute on function public.can_see_screening() to authenticated;

create or replace function public.person_chapter(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = p_id
$$;
grant execute on function public.person_chapter(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['safeguarding_training','safeguarding_declarations']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$create policy %I_read on public.%I for select to authenticated using (
        profile_id = auth.uid()
        or public.can_see_screening()
        or (public.dir_role() = 'RC'
            and public.person_chapter(profile_id) = public.dir_chapter()))$f$, t, t);
    execute format($f$create policy %I_write on public.%I for insert to authenticated with check (
        public.can_see_screening()
        or (public.dir_role() = 'RC'
            and public.person_chapter(profile_id) = public.dir_chapter()))$f$, t, t);
    execute format('revoke update, delete on public.%I from authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
  end loop;
end;
$$;

drop policy if exists vs_read   on public.volunteer_screening;
drop policy if exists vs_write  on public.volunteer_screening;
drop policy if exists vs_update on public.volunteer_screening;

create policy vs_read on public.volunteer_screening
  for select to authenticated using (public.can_see_screening());
create policy vs_write on public.volunteer_screening
  for insert to authenticated with check (public.can_see_screening());
create policy vs_update on public.volunteer_screening
  for update to authenticated
  using (public.can_see_screening()) with check (public.can_see_screening());

revoke delete on public.volunteer_screening from authenticated;
grant select, insert, update on public.volunteer_screening to authenticated;

grant execute on function public.screening_complete(uuid)  to authenticated;
grant execute on function public.safeguarding_compliance() to authenticated;

-- ------------------------------------------------------------
-- 7. Records past their retention
-- ------------------------------------------------------------
-- Nothing is destroyed automatically. The policy requires secure
-- destruction after the retention period, and that is a decision a
-- person makes and records, not something a schedule does quietly.

create or replace function public.records_due_destruction()
returns table (reference text, chapter_name text, reported_on date, retain_until date)
language sql stable security definer set search_path = public as $$
  select i.reference::text, c.name::text, i.reported_on::date, i.retain_until::date
  from public.safeguarding_incidents i
  join public.chapters c on c.id = i.chapter_id
  where i.retain_until is not null
    and i.retain_until < current_date
    and (public.dir_role() = 'NC' or public.is_safeguarding_lead())
  order by i.retain_until
$$;

grant execute on function public.records_due_destruction() to authenticated;
