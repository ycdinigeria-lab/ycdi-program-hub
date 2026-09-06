-- ============================================================
-- YCDI Programme Hub
-- Batch 12: bulk attendance register
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH12-MARKER chapter-attendance
--
-- Why this exists
-- ---------------
-- The deduplicated beneficiary number, the one figure a funder is most
-- likely to read closely, is count(distinct participant_id) from
-- participant_attendance over the year (YCDI-PROG-002, enforced in
-- Batch 5). That table has existed since Batch 2, but nothing in the app
-- ever filled it in bulk. A coordinator could see one young person's
-- attendance history, and could add a single row by hand, but there was
-- no way to sit with a register after an event and mark off who came.
-- So in practice the table stayed thin and the beneficiary number read
-- lower than the truth.
--
-- This batch adds the three database calls behind a proper register
-- screen: list the programmes you may take a register for, load the
-- register for one of them, and save it. No new table. It writes to the
-- Batch 2 participant_attendance table and nothing else.
--
-- Who may do what
-- ---------------
-- Reading a register follows can_read_participant: the National
-- Coordinator and admins see every chapter, a Regional Coordinator sees
-- their own. Saving a register follows can_touch_participant: a Regional
-- Coordinator for their own chapter, and admins. That is the same split
-- already used for adding and editing participants, so the register
-- behaves exactly like the rest of the Participants area. The National
-- Coordinator can look but does not enter chapter data, here as elsewhere.
--
-- The child-table policies from Batch 2 revoke DELETE on
-- participant_attendance from ordinary users on purpose, so that nothing
-- gets quietly wiped. The save below is the one sanctioned place a row
-- comes out again, when somebody is un-ticked. It runs as its owner
-- (security definer), which is why it can delete when the caller cannot.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The programmes a person may take a register for
-- ------------------------------------------------------------
-- Only programmes with a real date, because a register with no date
-- cannot land in a year when the KPI asks for one. present_count lets the
-- screen show, at a glance, which events still have nobody recorded
-- against them. can_record tells the screen whether to offer a Save
-- button or show the register read only.
create or replace function public.attendance_programs()
returns table (
  program_id    uuid,
  title         text,
  program_date  date,
  chapter_id    uuid,
  chapter_name  text,
  status        text,
  present_count integer,
  can_record    boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.title,
    p.date,
    p.chapter_id,
    c.name,
    p.status,
    (select count(*)::integer
       from public.participant_attendance pa
      where pa.program_id = p.id),
    public.can_touch_participant(p.chapter_id)
  from public.programs p
  join public.chapters c on c.id = p.chapter_id
  where p.date is not null
    and public.can_read_participant(p.chapter_id)
  order by p.date desc, p.title;
$$;

-- ------------------------------------------------------------
-- 2. The register for one programme
-- ------------------------------------------------------------
-- Every active participant in the programme's own chapter, each with a
-- flag saying whether they are currently marked present for this
-- programme. One call, so the screen never has to join across two tables
-- whose row rules differ, which on this project returns empty rather than
-- erroring and hides the bug.
create or replace function public.program_register(p_program uuid)
returns table (
  participant_id uuid,
  full_name      text,
  age_band       text,
  gender         text,
  stage          text,
  attended       boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.full_name,
    p.age_band,
    p.gender,
    p.stage,
    (pa.participant_id is not null)
  from public.participants p
  left join public.participant_attendance pa
    on pa.participant_id = p.id
   and pa.program_id = p_program
  where p.active
    and p.chapter_id = (select chapter_id from public.programs where id = p_program)
    and public.can_read_participant(p.chapter_id)
  order by p.full_name;
$$;

-- ------------------------------------------------------------
-- 3. Save the register
-- ------------------------------------------------------------
-- Given a programme, a date, and the list of people who came, this makes
-- the stored register match that list exactly: ticked names are added or
-- their date refreshed, names no longer ticked come out. It returns what
-- it did so the screen can say so plainly rather than leaving the person
-- guessing whether a mass change was intended.
create or replace function public.record_attendance(
  p_program uuid,
  p_date    date,
  p_present uuid[]
)
returns table (present integer, added integer, removed integer)
language plpgsql security definer set search_path = public as $$
declare
  v_chapter uuid;
  v_date    date;
  v_bad     integer;
  v_added   integer := 0;
  v_removed integer := 0;
begin
  if p_program is null then
    raise exception 'No programme was given.';
  end if;

  select chapter_id, date into v_chapter, v_date
  from public.programs where id = p_program;

  if v_chapter is null then
    raise exception 'That programme no longer exists.';
  end if;

  -- The authorisation gate. Admins and the chapter's own Regional
  -- Coordinator only. The National Coordinator reads registers but does
  -- not enter chapter data, the same rule as adding a participant.
  if not public.can_touch_participant(v_chapter) then
    raise exception 'You can only record attendance for your own chapter.';
  end if;

  -- A register needs a date to be worth anything. Fall back to the
  -- programme's own date, then to today, rather than writing a null.
  v_date := coalesce(p_date, v_date, current_date);

  -- An empty list means "nobody came", not "do nothing". Treat a null the
  -- same as an empty array so the delete below still clears the register.
  p_present := coalesce(p_present, array[]::uuid[]);

  -- Nobody from another chapter, and nobody who is not a real, active
  -- participant, can be written in. Without this an id from a chapter the
  -- caller cannot touch could be slipped into the list and recorded.
  select count(*) into v_bad
  from unnest(p_present) as t(pid)
  where not exists (
    select 1 from public.participants p
    where p.id = t.pid
      and p.chapter_id = v_chapter
      and p.active
  );
  if v_bad > 0 then
    raise exception 'One or more of those people are not active participants in this chapter.';
  end if;

  -- Count the genuinely new ones before writing, so the number reported
  -- back is "added", not "ticked".
  select count(*) into v_added
  from unnest(p_present) as t(pid)
  where not exists (
    select 1 from public.participant_attendance pa
    where pa.program_id = p_program
      and pa.participant_id = t.pid
  );

  -- Ticked names: inserted if new, date refreshed if already there. The
  -- primary key (participant_id, program_id) means one row per person per
  -- programme, so this can never double-count anybody.
  insert into public.participant_attendance (participant_id, program_id, attended_on, recorded_by)
  select pid, p_program, v_date, auth.uid()
  from unnest(p_present) as t(pid)
  on conflict (participant_id, program_id)
    do update set attended_on = excluded.attended_on,
                  recorded_by = excluded.recorded_by;

  -- Names no longer ticked come out. This is the only sanctioned delete
  -- on the table.
  with del as (
    delete from public.participant_attendance
    where program_id = p_program
      and not (participant_id = any (p_present))
    returning 1
  )
  select count(*) into v_removed from del;

  return query
    select
      (select count(*)::integer
         from public.participant_attendance
        where program_id = p_program),
      v_added::integer,
      v_removed::integer;
end;
$$;

-- ------------------------------------------------------------
-- 4. Who may call these
-- ------------------------------------------------------------
-- All three are callable by any signed-in user. Each one decides for
-- itself what that user is allowed to see or change, using the same
-- can_read_participant and can_touch_participant checks the rest of the
-- participant area uses. Nothing here widens what a Team Member or an
-- out-of-chapter coordinator can reach.
grant execute on function public.attendance_programs()                    to authenticated;
grant execute on function public.program_register(uuid)                   to authenticated;
grant execute on function public.record_attendance(uuid, date, uuid[])    to authenticated;

comment on function public.record_attendance(uuid, date, uuid[]) is
  'Batch 12. Makes the stored attendance register for a programme match the given list of present participants exactly. Admin or the chapter RC only. Adds or refreshes ticked names, removes un-ticked ones, returns (present, added, removed).';
