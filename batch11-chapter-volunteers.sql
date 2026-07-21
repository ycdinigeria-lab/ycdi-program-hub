-- ============================================================
-- YCDI Programme Hub
-- Batch 11: volunteer figures on the chapter breakdown
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH11-MARKER chapter-volunteers
--
-- Why this exists
-- ---------------
-- Batch 7c put two volunteer lines on the Board table and a panel above
-- it that reads the distance between them. When that distance is in the
-- middle band, the wording tells the reader that a chapter by chapter
-- check would show whether the problem is one chapter or all of them.
--
-- It would not. kpi_chapter_breakdown returns programme figures only.
-- There is no volunteer column anywhere in it, so the Chapters tab could
-- not answer the question the Board table had just sent the reader to
-- ask. That is a promise the software did not keep, which is worse than
-- saying nothing, and it is the main thing this batch fixes.
--
-- The scoping problem, and how it is handled
-- ------------------------------------------
-- kpi_chapter_breakdown is security invoker. The volunteer functions
-- from Batch 7c are security definer, because they have to read the
-- register past a policy that would otherwise empty them.
--
-- Calling a definer function from an invoker one hands the caller
-- whatever the definer function decides to give them. So the guard has
-- to live inside the definer function, keyed on the chapter, not in the
-- invoker function's row filter. It already does:
-- volunteers_on_books and volunteers_involved both call
-- kpi_volunteer_chapter_ok(chapter) row by row, and that helper repeats
-- the Batch 6a register rule rather than the looser programme rule used
-- for the rest of the KPI report. A Team Member gets an empty set from
-- both, whatever they call.
--
-- Nothing here loosens that. The volunteer columns are built from those
-- two functions and nothing else, so the tighter rule travels with the
-- data instead of being re-implemented beside it.
--
-- One addition. Because those functions return an empty set rather than
-- an error, a Team Member counting rows would get 0, and 0 in a column
-- headed "on the books" reads as a fact about the chapter rather than as
-- a fact about the reader's permissions. So the three volunteer columns
-- are wrapped in an explicit kpi_volunteer_chapter_ok test and return
-- null, which the screen and the CSV both render as a dash. A chapter
-- that genuinely has no volunteers still shows 0, and those two states
-- stay tellable apart.
--
-- What changes
-- ------------
--   kpi_chapter_breakdown  gains volunteer_on_books, volunteer_active
--                          and volunteer_involved. The eleven existing
--                          columns are unchanged, in the same order,
--                          with the same definitions.
--
-- Nothing else in the database is touched. No new table, no new policy,
-- no change to any function Batch 7c shipped.
--
-- The return type is changing, so the function has to be dropped rather
-- than replaced. That is why the drop is here and why it names the
-- argument types exactly.
-- ============================================================

begin;

drop function if exists public.kpi_chapter_breakdown(date, date);

create function public.kpi_chapter_breakdown(
  p_from date,
  p_to   date
)
returns table (
  chapter_id            uuid,
  chapter_name          text,
  activities            bigint,
  schools               bigint,
  beneficiaries         bigint,
  attendance_headcount  bigint,
  forms_returned        bigint,
  feedback_positive     bigint,
  satisfaction_pct      numeric,
  budget                numeric,
  spent                 numeric,
  volunteer_on_books    bigint,
  volunteer_active      bigint,
  volunteer_involved    bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  -- Both set-returning functions are evaluated once here rather than
  -- once per chapter per column. They are already scoped, so what comes
  -- back is only what this caller is allowed to see.
  with vb as (
    select b.profile_id, b.chapter_id, b.status
      from public.volunteers_on_books(p_from, p_to) b
  ),
  vi as (
    select i.profile_id
      from public.volunteers_involved(p_from, p_to) i
  )
  select
    c.id,
    c.name,
    (select count(*) from public.programs p
      where p.chapter_id = c.id and p.status = 'Complete'
        and p.date between p_from and p_to)::bigint,
    (select count(distinct lower(btrim(p.school))) from public.programs p
      where p.chapter_id = c.id and p.status = 'Complete'
        and p.date between p_from and p_to
        and coalesce(btrim(p.school), '') <> '')::bigint,
    (select count(distinct pa.participant_id)
       from public.participant_attendance pa
       join public.programs p on p.id = pa.program_id
      where p.chapter_id = c.id
        and pa.attended_on between p_from and p_to)::bigint,
    (select coalesce(sum(r.attendance), 0) from public.reports r
       join public.programs p on p.id = r.program_id
      where p.chapter_id = c.id and p.date between p_from and p_to)::bigint,
    (select coalesce(sum(r.feedback_forms_returned), 0) from public.reports r
       join public.programs p on p.id = r.program_id
      where p.chapter_id = c.id and p.date between p_from and p_to
        and coalesce(r.feedback_forms_returned, 0) > 0)::bigint,
    (select coalesce(sum(r.feedback_positive), 0) from public.reports r
       join public.programs p on p.id = r.program_id
      where p.chapter_id = c.id and p.date between p_from and p_to
        and coalesce(r.feedback_forms_returned, 0) > 0)::bigint,
    (select case when coalesce(sum(r.feedback_forms_returned), 0) = 0 then null
                 else round(100.0 * sum(r.feedback_positive)
                                  / sum(r.feedback_forms_returned), 1) end
       from public.reports r
       join public.programs p on p.id = r.program_id
      where p.chapter_id = c.id and p.date between p_from and p_to
        and coalesce(r.feedback_forms_returned, 0) > 0),
    (select coalesce(sum(p.budget), 0) from public.programs p
      where p.chapter_id = c.id and p.status = 'Complete'
        and p.date between p_from and p_to)::numeric,
    (select coalesce(sum(r.actual_expenditure), 0) from public.reports r
       join public.programs p on p.id = r.program_id
      where p.chapter_id = c.id and p.status = 'Complete'
        and p.date between p_from and p_to)::numeric,

    -- The denominator behind both active rate lines, for this chapter.
    -- Null rather than zero when the caller is not permitted volunteer
    -- figures here, so a blocked reader is never handed a number that
    -- looks like an answer.
    case when public.kpi_volunteer_chapter_ok(c.id)
         then (select count(*) from vb where vb.chapter_id = c.id)::bigint
         else null end,

    -- Marked active on the register. Same rule as the KPI line: the
    -- status recorded on the record, nothing inferred.
    case when public.kpi_volunteer_chapter_ok(c.id)
         then (select count(*) from vb
                where vb.chapter_id = c.id and vb.status = 'active')::bigint
         else null end,

    -- Seen in the record of work. Intersected with the same chapter's
    -- on-books set, so somebody who moved chapter mid-year is counted
    -- where their record sits and not twice.
    case when public.kpi_volunteer_chapter_ok(c.id)
         then (select count(*) from vb
                where vb.chapter_id = c.id
                  and vb.profile_id in (select vi.profile_id from vi))::bigint
         else null end

  from public.chapters c
  where public.kpi_sees_all() or c.id = public.dir_chapter()
  order by c.name;
$$;

comment on function public.kpi_chapter_breakdown(date, date) is
  'Per-chapter KPI figures including volunteer counts. A Regional Coordinator sees only their own chapter; the National Coordinator and admins see all. The three volunteer columns are null, not zero, for anyone the Batch 6a register rule does not permit.';

grant execute on function public.kpi_chapter_breakdown(date, date) to authenticated;

commit;

-- ============================================================
-- Check it worked.
--
--   select chapter_name, volunteer_on_books, volunteer_active,
--          volunteer_involved
--     from public.kpi_chapter_breakdown('2026-01-01','2026-12-31');
--
--   -- as the National Coordinator or an admin: every chapter, with
--   --   figures. Chapters with no volunteers show 0.
--   -- as a Regional Coordinator: one row, their own, with figures.
--   -- as a Team Member: one row, their own chapter's programme figures,
--   --   and three empty volunteer cells.
--
-- The three columns should reconcile with the Board table. Summed
-- across every chapter, volunteer_active over volunteer_on_books is the
-- volunteer active rate, and volunteer_involved over volunteer_on_books
-- is the observed rate.
-- ============================================================
