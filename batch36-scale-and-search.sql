-- ======================================================================
-- Batch 36: participants at scale                BATCH36-MARKER scale-sql
--
-- Run this BEFORE deploying the Batch 36 app build.
--
-- Why. Tested against 30,000 participants on a copy of this schema, every
-- read of the participants table took about 3 seconds for the National
-- Coordinator and about 9 seconds for a Regional Coordinator. That was
-- true even of a plain count. The cause was not missing indexes. The read
-- rule called its helper functions with the row's own chapter_id, which
-- makes Postgres run them again for every single row: 30,000 look-ups of
-- "who is signed in and what is their role" per screen.
--
-- What changes. The WHO may read WHAT does not change at all. The same
-- people see the same rows. Only the way the rule is written changes, so
-- the "who is signed in" questions are asked once per query instead of
-- once per row.
--
--   1. Trigram indexes, so "contains this text" searches on name, school
--      and class use an index instead of reading all 30,000 rows.
--   2. my_mentee_ids(): the set of participants the signed-in person
--      currently mentors, worked out once.
--   3. pt_read rewritten. Same five doors as before:
--        admin | National Coordinator | PD seat | RC in own chapter |
--        a team member who added the record or mentors them (own chapter)
--   4. stage_summary() and quiet_participants() rewritten on the same
--      pattern. Same inputs, same columns out, same people counted.
--
-- Insert and update rules are deliberately left alone. They act on one
-- row at a time, so they were never the slow part.
--
-- It is one transaction. If any line fails, nothing is changed.
-- ======================================================================

begin;

-- ----------------------------------------------------------------------
-- 1. Trigram search indexes
-- ----------------------------------------------------------------------
-- Supabase keeps extensions in their own schema. If pg_trgm was already
-- switched on somewhere else, the indexes use whichever schema it is in.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
declare s text;
begin
  select n.nspname into s
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format('create index if not exists participants_name_trgm   on public.participants using gin (full_name   %I.gin_trgm_ops)', s);
  execute format('create index if not exists participants_school_trgm on public.participants using gin (school      %I.gin_trgm_ops)', s);
  execute format('create index if not exists participants_class_trgm  on public.participants using gin (class_level %I.gin_trgm_ops)', s);
end $$;

-- The list is ordered by name with id as the tie-break, so a page never
-- repeats or skips somebody when two people share a name.
create index if not exists participants_name_order on public.participants (full_name, id);

-- ----------------------------------------------------------------------
-- 2. The signed-in person's current mentees, worked out once
-- ----------------------------------------------------------------------
-- Security definer for the same reason owns_participant() is: the mentor
-- table has its own read rule that refers back to participants, and
-- reading it from inside the participants rule as the caller would loop.
create or replace function public.my_mentee_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.participant_id
  from public.participant_mentors m
  where m.mentor_id = auth.uid()
    and m.ended_on is null
$$;

revoke all on function public.my_mentee_ids() from public, anon;
grant execute on function public.my_mentee_ids() to authenticated;

-- ----------------------------------------------------------------------
-- 3. The participants read rule
-- ----------------------------------------------------------------------
-- Before (Batch 13, with can_read_participant as redefined in Batch 20):
--   can_read_participant(chapter_id) or owns_participant(id)
-- which expands to exactly the five clauses below. Each "(select f())"
-- is computed once for the whole query.
drop policy if exists pt_read on public.participants;
create policy pt_read on public.participants
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.dir_role()) = 'NC'
    or (select public.holds_portfolio('PD'))
    or ((select public.dir_role()) = 'RC' and chapter_id = (select public.dir_chapter()))
    or (
      chapter_id = (select public.dir_chapter())
      and (
        created_by = (select auth.uid())
        or id in (select public.my_mentee_ids())
      )
    )
  );

-- ----------------------------------------------------------------------
-- 4a. stage_summary(): same columns, same people, counted in one pass
-- ----------------------------------------------------------------------
create or replace function public.stage_summary(p_chapter uuid default null)
returns table (chapter_id uuid, chapter_name text, stage text, people integer)
language sql stable security definer set search_path = public as $$
  with me as materialized (
    select public.is_admin()              as admin,
           public.dir_role()              as role,
           public.dir_chapter()           as chapter,
           public.holds_portfolio('PD')   as pd
  )
  select p.chapter_id::uuid, c.name::text, p.stage::text, count(*)::integer
  from public.participants p
  join public.chapters c on c.id = p.chapter_id
  cross join me
  where p.active
    and (me.admin or me.role = 'NC' or me.pd
         or (me.role = 'RC' and p.chapter_id = me.chapter))
    and (p_chapter is null or p.chapter_id = p_chapter)
  group by p.chapter_id, c.name, p.stage
$$;

-- ----------------------------------------------------------------------
-- 4b. quiet_participants(): same columns and the same reach as before
-- ----------------------------------------------------------------------
-- Before, it asked "may I see this one?" and "when did this one last
-- have any activity?" separately for every participant. Now the reach is
-- worked out once, and last activity is read from the three activity
-- tables in one grouped pass each.
create or replace function public.quiet_participants(p_days integer default 21)
returns table (
  participant_id   uuid,
  full_name        text,
  chapter_id       uuid,
  mentor_id        uuid,
  mentor_name      text,
  last_activity    timestamptz
)
language sql stable security definer set search_path = public as $$
  with me as materialized (
    select public.is_admin()              as admin,
           public.dir_role()              as role,
           public.dir_chapter()           as chapter,
           public.holds_portfolio('PD')   as pd,
           auth.uid()                     as uid
  ),
  mine as materialized (
    select public.my_mentee_ids() as id
  ),
  seen as (
    select p.id, p.full_name, p.chapter_id
    from public.participants p cross join me
    where p.active
      and (
        me.admin or me.role = 'NC' or me.pd
        or (me.role = 'RC' and p.chapter_id = me.chapter)
        or (p.chapter_id = me.chapter
            and (p.created_by = me.uid or p.id in (select id from mine)))
      )
  ),
  activity as (
    select u.pid, max(u.at) as at
    from (
      select s.participant_id as pid, max(s.moved_on)::timestamptz as at
        from public.participant_stages s where s.participant_id in (select id from seen) group by 1
      union all
      select a.participant_id, max(a.attended_on)::timestamptz
        from public.participant_attendance a where a.participant_id in (select id from seen) group by 1
      union all
      select t.participant_id, max(t.occurred_on)::timestamptz
        from public.participant_touchpoints t where t.participant_id in (select id from seen) group by 1
    ) u
    group by u.pid
  )
  select s.id, s.full_name, s.chapter_id,
         m.mentor_id, prof.full_name,
         coalesce(a.at, 'epoch'::timestamptz)
  from seen s
  left join activity a on a.pid = s.id
  left join public.participant_mentors m
    on m.participant_id = s.id and m.ended_on is null
  left join public.profiles prof
    on prof.id = m.mentor_id
  where coalesce(a.at, 'epoch'::timestamptz) < now() - make_interval(days => p_days)
$$;

commit;
