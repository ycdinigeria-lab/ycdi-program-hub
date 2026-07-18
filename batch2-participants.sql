-- ============================================================
-- YCDI Programme Hub
-- Batch 2: participants and discipleship tracking
-- ============================================================
-- Run this in the Supabase SQL editor before pushing the code
-- that goes with it.
--
-- This is built to YCDI's own written policy, not to guesswork.
-- The rules it enforces, and where they come from:
--
--   YCDI-LEG (Data Protection Policy)
--     - beneficiary data is limited to what the policy lists
--     - contact details for participants in tertiary education only
--     - parental or guardian consent required before any personally
--       identifiable information about an under-18 is collected
--     - consent must be documented and may be withdrawn at any time
--     - data minimisation: nothing collected "just in case"
--
--   YCDI-SAF-001 (Child Protection Policy)
--     - Standard 2, no private adult-to-minor communication, so
--       participants are deliberately not connected to messaging
--     - Standard 3, no photography or publication without documented
--       parental consent, recorded here by usage type
--     - image and story consent is granular, not a single yes/no
--     - withdrawal of consent requires removal within five working days
--     - safeguarding records are kept separately, so they are NOT in
--       this file. That is Batch 3, with tighter access again.
--
-- Age is stored as a band, not a date of birth. The policy permits a
-- date of birth; a band is enough for discipleship work and carries
-- less risk if the data ever leaks.
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Participants
-- ------------------------------------------------------------
create table if not exists public.participants (
  id               uuid primary key default gen_random_uuid(),
  chapter_id       uuid not null references public.chapters(id) on delete restrict,
  full_name        text not null,
  gender           text check (gender in ('Male','Female')),
  age_band         text not null check (age_band in ('10-12','13-15','16-17','18+')),
  class_level      text,
  school           text,
  stage            text not null default 'Contact'
                     check (stage in ('Contact','Connect','Commit','Grow','Multiply')),
  first_contact_on date not null default current_date,

  -- Contact details are permitted only for participants in tertiary
  -- education, per the Data Protection Policy. The trigger below
  -- refuses them for anybody in a minor age band.
  phone            text,
  email            text,

  -- No participant exists without documented parental or guardian
  -- consent behind it. This column is not null on purpose: the
  -- policy makes the consent a precondition, so the database does
  -- the same rather than trusting a form to remember.
  consent_on       date not null,
  consent_ref      text,

  active           boolean not null default true,
  left_reason      text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists participants_by_chapter on public.participants(chapter_id, active, full_name);
create index if not exists participants_by_stage   on public.participants(chapter_id, stage);

create or replace function public.is_minor_band(band text)
returns boolean language sql immutable as $$
  select band is distinct from '18+'
$$;

-- Enforces the two rules that are easy to break by accident.
create or replace function public.guard_participant()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_minor_band(new.age_band) then
    if new.phone is not null and new.phone <> '' then
      raise exception 'Phone numbers may not be stored for participants under 18. YCDI Data Protection Policy allows contact details for tertiary participants only.';
    end if;
    if new.email is not null and new.email <> '' then
      raise exception 'Email addresses may not be stored for participants under 18. YCDI Data Protection Policy allows contact details for tertiary participants only.';
    end if;
  end if;

  if new.consent_on > current_date then
    raise exception 'Consent cannot be dated in the future.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_participant on public.participants;
create trigger trg_guard_participant
  before insert or update on public.participants
  for each row execute function public.guard_participant();

-- ------------------------------------------------------------
-- 2. Consent, by usage
-- ------------------------------------------------------------
-- The image and story consent framework in YCDI-SAF-001 is a table of
-- usage types, each needing its own documentation. This mirrors it.
--
--   registration        general safeguarding consent at registration,
--                       covers group event photos with no identifying
--                       detail, and anonymous testimony
--   photo_published     an individual photograph in a report or on
--                       social media, signed form on file
--   testimony_named     testimony published with name and photo,
--                       signed and reviewed by the National Coordinator
--   video               video recording used in communications

create table if not exists public.participant_consents (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  consent_type   text not null check (consent_type in
                   ('registration','photo_published','testimony_named','video')),
  granted_on     date not null default current_date,
  granted_by     text,
  document_ref   text,
  nc_reviewed_by uuid references public.profiles(id) on delete set null,
  withdrawn_on   date,
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create unique index if not exists participant_consent_one_live
  on public.participant_consents(participant_id, consent_type)
  where withdrawn_on is null;

create index if not exists participant_consents_withdrawn
  on public.participant_consents(withdrawn_on) where withdrawn_on is not null;

-- Anything published under a withdrawn consent has to come down within
-- five working days. This is what the app puts in front of somebody.
create or replace function public.consent_withdrawals_outstanding()
returns table (
  participant_id uuid,
  full_name      text,
  chapter_id     uuid,
  consent_type   text,
  withdrawn_on   date,
  days_since     integer
)
language sql stable security definer set search_path = public as $$
  select p.id::uuid, p.full_name::text, p.chapter_id::uuid,
         c.consent_type::text, c.withdrawn_on::date,
         (current_date - c.withdrawn_on)::integer
  from public.participant_consents c
  join public.participants p on p.id = c.participant_id
  where c.withdrawn_on is not null
    and c.withdrawn_on > current_date - 30
    and c.consent_type in ('photo_published','testimony_named','video')
    and (public.is_admin() or public.dir_role() = 'NC' or p.chapter_id = public.dir_chapter())
  order by c.withdrawn_on
$$;

-- ------------------------------------------------------------
-- 3. Where somebody is on the pathway, and how they got there
-- ------------------------------------------------------------
create table if not exists public.participant_stages (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  stage          text not null check (stage in ('Contact','Connect','Commit','Grow','Multiply')),
  moved_on       date not null default current_date,
  note           text,
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists participant_stages_history
  on public.participant_stages(participant_id, moved_on desc);

-- The first row of history is written when the participant is created,
-- so a record never starts with a blank past.
create or replace function public.seed_participant_stage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.participant_stages (participant_id, stage, moved_on, note, recorded_by)
  values (new.id, new.stage, new.first_contact_on, 'First recorded', new.created_by);
  return new;
end;
$$;

drop trigger if exists trg_seed_participant_stage on public.participants;
create trigger trg_seed_participant_stage
  after insert on public.participants
  for each row execute function public.seed_participant_stage();

-- ------------------------------------------------------------
-- 4. Attendance
-- ------------------------------------------------------------
create table if not exists public.participant_attendance (
  participant_id uuid not null references public.participants(id) on delete cascade,
  program_id     uuid not null references public.programs(id) on delete cascade,
  attended_on    date not null default current_date,
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (participant_id, program_id)
);

create index if not exists attendance_by_program on public.participant_attendance(program_id);

-- ------------------------------------------------------------
-- 5. Mentors
-- ------------------------------------------------------------
-- A named link only. All contact still happens through supervised
-- channels, per Standard 2, which is why there is deliberately no
-- route from here into messaging.

create table if not exists public.participant_mentors (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  mentor_id      uuid not null references public.profiles(id) on delete cascade,
  assigned_on    date not null default current_date,
  ended_on       date,
  assigned_by    uuid references public.profiles(id) on delete set null
);

create unique index if not exists participant_mentor_one_live
  on public.participant_mentors(participant_id)
  where ended_on is null;

-- ------------------------------------------------------------
-- 6. Who can see and do what
-- ------------------------------------------------------------
-- Regional Coordinators see their own chapter and nothing else.
-- National Coordinators and admins see everywhere.
-- Team Members see nothing at all, because the Data Protection Policy
-- says volunteers should not hold beneficiary data beyond what their
-- own role requires, and a Team Member's role does not require it.

create or replace function public.can_see_participants()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.dir_role() in ('NC','RC')
$$;

create or replace function public.can_touch_participant(p_chapter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.dir_role() = 'RC' and p_chapter = public.dir_chapter())
$$;

create or replace function public.can_read_participant(p_chapter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.dir_role() = 'NC'
      or (public.dir_role() = 'RC' and p_chapter = public.dir_chapter())
$$;

grant execute on function public.can_see_participants()       to authenticated;
grant execute on function public.can_read_participant(uuid)   to authenticated;
grant execute on function public.can_touch_participant(uuid)  to authenticated;

alter table public.participants           enable row level security;
alter table public.participant_consents   enable row level security;
alter table public.participant_stages     enable row level security;
alter table public.participant_attendance enable row level security;
alter table public.participant_mentors    enable row level security;

drop policy if exists pt_read   on public.participants;
drop policy if exists pt_write  on public.participants;
drop policy if exists pt_update on public.participants;
drop policy if exists pt_delete on public.participants;

create policy pt_read on public.participants
  for select to authenticated using (public.can_read_participant(chapter_id));

create policy pt_write on public.participants
  for insert to authenticated with check (public.can_touch_participant(chapter_id));

create policy pt_update on public.participants
  for update to authenticated
  using (public.can_touch_participant(chapter_id))
  with check (public.can_touch_participant(chapter_id));

-- Nobody deletes a participant from the app. Records are marked
-- inactive instead, because a deletion also deletes the consent trail
-- and the safeguarding history that hangs off it.
revoke delete on public.participants from authenticated;

-- The child tables follow whatever the participant allows.
create or replace function public.participant_chapter(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.participants where id = p_id
$$;
grant execute on function public.participant_chapter(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['participant_consents','participant_stages','participant_attendance','participant_mentors']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format($f$create policy %I_read on public.%I for select to authenticated
                      using (public.can_read_participant(public.participant_chapter(participant_id)))$f$, t, t);
    execute format($f$create policy %I_write on public.%I for insert to authenticated
                      with check (public.can_touch_participant(public.participant_chapter(participant_id)))$f$, t, t);
    execute format($f$create policy %I_update on public.%I for update to authenticated
                      using (public.can_touch_participant(public.participant_chapter(participant_id)))
                      with check (public.can_touch_participant(public.participant_chapter(participant_id)))$f$, t, t);
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 7. What the app calls
-- ------------------------------------------------------------
create or replace function public.move_participant_stage(
  p_id   uuid,
  p_new  text,
  p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_chapter uuid;
begin
  select chapter_id into v_chapter from public.participants where id = p_id;
  if v_chapter is null then
    raise exception 'That participant no longer exists.';
  end if;
  if not public.can_touch_participant(v_chapter) then
    raise exception 'You can only update participants in your own chapter.';
  end if;
  if p_new not in ('Contact','Connect','Commit','Grow','Multiply') then
    raise exception 'Unrecognised stage.';
  end if;

  update public.participants set stage = p_new where id = p_id;
  insert into public.participant_stages (participant_id, stage, note, recorded_by)
  values (p_id, p_new, nullif(p_note, ''), auth.uid());
end;
$$;

create or replace function public.withdraw_participant_consent(consent_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_chapter uuid;
begin
  select p.chapter_id into v_chapter
  from public.participant_consents c
  join public.participants p on p.id = c.participant_id
  where c.id = consent_id;

  if v_chapter is null then
    raise exception 'That consent record no longer exists.';
  end if;
  if not public.can_touch_participant(v_chapter) then
    raise exception 'You can only update participants in your own chapter.';
  end if;

  update public.participant_consents
     set withdrawn_on = current_date
   where id = consent_id and withdrawn_on is null;
end;
$$;

-- The numbers the chapter dashboards and, later, the funder reports need.
create or replace function public.stage_summary(p_chapter uuid default null)
returns table (chapter_id uuid, chapter_name text, stage text, people integer)
language sql stable security definer set search_path = public as $$
  select p.chapter_id::uuid, c.name::text, p.stage::text, count(*)::integer
  from public.participants p
  join public.chapters c on c.id = p.chapter_id
  where p.active
    and public.can_read_participant(p.chapter_id)
    and (p_chapter is null or p.chapter_id = p_chapter)
  group by p.chapter_id, c.name, p.stage
$$;

-- Movement over a window, which is the question a static count can
-- never answer: is anybody actually progressing.
create or replace function public.stage_movement(days_back integer default 90)
returns table (chapter_name text, moved_to text, people integer)
language sql stable security definer set search_path = public as $$
  select c.name::text, s.stage::text, count(distinct s.participant_id)::integer
  from public.participant_stages s
  join public.participants p on p.id = s.participant_id
  join public.chapters c on c.id = p.chapter_id
  where s.moved_on > current_date - greatest(coalesce(days_back, 90), 1)
    and s.note is distinct from 'First recorded'
    and public.can_read_participant(p.chapter_id)
  group by c.name, s.stage
$$;

grant execute on function public.move_participant_stage(uuid, text, text)  to authenticated;
grant execute on function public.withdraw_participant_consent(uuid)        to authenticated;
grant execute on function public.stage_summary(uuid)                       to authenticated;
grant execute on function public.stage_movement(integer)                   to authenticated;
grant execute on function public.consent_withdrawals_outstanding()         to authenticated;

grant select, insert, update on public.participants           to authenticated;
grant select, insert, update on public.participant_consents   to authenticated;
grant select, insert, update on public.participant_stages     to authenticated;
grant select, insert, update on public.participant_attendance to authenticated;
grant select, insert, update on public.participant_mentors    to authenticated;
