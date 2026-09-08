-- ============================================================
-- YCDI Programme Hub
-- Batch 17: the reads behind the redesigned home screens
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH17-MARKER home-and-signals
--
-- Three read-only calls, no new tables, nothing altered.
--
--   chapter_pulse()    a team member's own chapter as plain totals, never
--                      a list of names. This is the line that lets a team
--                      member see their chapter moving without opening the
--                      register. It returns counts and only counts, so it
--                      cannot leak a child's record even though it reads
--                      across the chapter to add them up.
--
--   my_contribution()  what the signed-in person has put in: reports filed,
--                      how many of those the NC has acknowledged, and how
--                      many young people they currently mentor.
--
--   quiet_chapters()   for the NC and admins only, the last time each
--                      chapter filed anything, so the ones that have gone
--                      quiet are easy to see. Everyone else gets nothing.
--
-- "This year" means since 1 January. There is no term calendar in the
-- database to hang a term on, so the year is the honest window. Change the
-- date floor here if a real term boundary is ever added.
-- ============================================================

-- A team member's own chapter, as totals. dir_chapter() is the caller's
-- own chapter, so there is no chapter argument to point somewhere else.
create or replace function public.chapter_pulse()
returns table (programmes_active int, outreaches_year int, young_people_year int, upcoming int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int
       from public.programs p
      where p.chapter_id = public.dir_chapter()
        and p.status in ('Approved','Live')),
    (select count(*)::int
       from public.programs p
      where p.chapter_id = public.dir_chapter()
        and p.date >= date_trunc('year', current_date)::date
        and p.date <= current_date),
    (select count(distinct pa.participant_id)::int
       from public.participant_attendance pa
       join public.programs p on p.id = pa.program_id
      where p.chapter_id = public.dir_chapter()
        and p.date >= date_trunc('year', current_date)::date),
    (select count(*)::int
       from public.programs p
      where p.chapter_id = public.dir_chapter()
        and p.date > current_date)
$$;

-- What the signed-in person has put in. Counts their own rows only.
create or replace function public.my_contribution()
returns table (reports_filed int, reports_acknowledged int, mentees int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.submissions s
      where s.author_id = auth.uid()),
    (select count(*)::int from public.submissions s
      where s.author_id = auth.uid() and s.status = 'acknowledged'),
    (select count(*)::int from public.participant_mentors m
      where m.mentor_id = auth.uid() and m.ended_on is null)
$$;

-- When each chapter last filed a report. NC and admins only; everyone else
-- gets an empty result because the where clause is false for them, which
-- fails closed rather than open.
create or replace function public.quiet_chapters()
returns table (chapter_id uuid, chapter_name text, last_reported timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name,
    (select max(s.submitted_at)
       from public.submissions s
      where s.chapter_id = c.id and s.submitted_at is not null)
  from public.chapters c
  where public.dir_role() = 'NC' or coalesce(public.is_admin(), false)
  order by c.name
$$;

grant execute on function
  public.chapter_pulse(),
  public.my_contribution(),
  public.quiet_chapters()
  to authenticated;

-- ---- the RC's nudge ---------------------------------------------------
-- A gentle prompt to a team member in the RC's own chapter who has gone
-- quiet. It goes through notify_person, so it lands in the same bell as
-- everything else. Only the chapter's own RC or an admin may send one, and
-- only to a team member, so it cannot be turned on people in other chapters
-- or on coordinators.
create or replace function public.nudge_member(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.profiles; me_name text;
begin
  select * into t from public.profiles where id = target;
  if not found then raise exception 'no such person'; end if;
  if not (coalesce(public.is_admin(), false)
          or (public.dir_role() = 'RC' and public.dir_chapter() = t.chapter_id)) then
    raise exception 'only this chapter''s RC can nudge a team member';
  end if;
  if t.role <> 'TM' then
    raise exception 'you can only nudge a team member';
  end if;
  select full_name into me_name from public.profiles where id = auth.uid();
  perform public.notify_person(
    target, 'nudge', 'A note from your RC',
    coalesce(me_name, 'Your RC') || ' would love to hear how things are going. When you have a moment, file a report of your latest outreach.',
    'reports', null, null);
end $$;

grant execute on function public.nudge_member(uuid) to authenticated;

-- The team members in the caller's own chapter, so an RC can pick one to
-- nudge. RC or admin only, own chapter only; anyone else gets an empty list.
create or replace function public.chapter_team_members()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role = 'TM'
    and p.chapter_id = public.dir_chapter()
    and (public.dir_role() = 'RC' or coalesce(public.is_admin(), false))
  order by p.full_name
$$;

grant execute on function public.chapter_team_members() to authenticated;
