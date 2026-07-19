-- ============================================================
-- YCDI Programme Hub
-- Batch 4b: participant satisfaction on the post-programme report
--
-- Run this in the Supabase SQL editor BEFORE pushing the Batch 4b code.
-- It is safe to run more than once.
--
-- Why this exists
-- ---------------
-- YCDI-PROG-002 lists "Participant satisfaction score (events)" as a core
-- KPI, target above 80% positive, source "Feedback forms", frequency "per
-- event". The hub had nowhere to put it, so that row of the board's KPI
-- dashboard could never be filled in from the system.
--
-- The design follows the policy rather than inventing something easier.
-- Coordinators already hand out paper feedback forms at events. This
-- records two counts from those forms: how many came back, and how many
-- were positive. The percentage is worked out from those, so it traces
-- back to real forms a person can be asked to produce during an audit.
--
-- It deliberately does NOT ask a coordinator to rate their own event out
-- of five. That number would measure the coordinator's optimism, and a
-- funder would be right to distrust it.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. The two counts
-- ------------------------------------------------------------
alter table public.reports
  add column if not exists feedback_forms_returned integer,
  add column if not exists feedback_positive integer;

comment on column public.reports.feedback_forms_returned is
  'How many participant feedback forms were completed and returned at this programme. Null means none were distributed.';
comment on column public.reports.feedback_positive is
  'Of those returned, how many gave a positive overall rating. Feeds the participant satisfaction KPI in YCDI-PROG-002.';

-- ------------------------------------------------------------
-- 2. Numbers that cannot lie
-- ------------------------------------------------------------
-- More positive responses than forms returned is not a typo worth
-- tolerating: it would quietly push a chapter's satisfaction above 100%
-- and inflate the national figure. The database refuses it outright.
alter table public.reports drop constraint if exists reports_feedback_sane;
alter table public.reports
  add constraint reports_feedback_sane check (
    coalesce(feedback_forms_returned, 0) >= 0
    and coalesce(feedback_positive, 0) >= 0
    and coalesce(feedback_positive, 0) <= coalesce(feedback_forms_returned, 0)
  );

-- ------------------------------------------------------------
-- 3. Reading it back
-- ------------------------------------------------------------
-- One place that knows how satisfaction is calculated, so the app, the
-- exports and anybody querying by hand all get the same answer.
--
-- Programmes where no forms were handed out are left out of the average
-- entirely rather than counted as zero. A programme with no feedback is
-- not a programme nobody enjoyed, and treating it as one would drag the
-- national figure down for no reason.
create or replace function public.satisfaction_summary(
  p_from date default null,
  p_to   date default null
)
returns table (
  chapter_id uuid,
  chapter_name text,
  programmes_with_feedback bigint,
  forms_returned bigint,
  positive bigint,
  satisfaction_pct numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    c.id,
    c.name,
    count(*)::bigint,
    coalesce(sum(r.feedback_forms_returned), 0)::bigint,
    coalesce(sum(r.feedback_positive), 0)::bigint,
    case
      when coalesce(sum(r.feedback_forms_returned), 0) = 0 then null
      else round(
        100.0 * sum(r.feedback_positive) / sum(r.feedback_forms_returned),
        1
      )
    end
  from public.reports r
  join public.programs  p on p.id = r.program_id
  join public.chapters  c on c.id = p.chapter_id
  where coalesce(r.feedback_forms_returned, 0) > 0
    and (p_from is null or p.date >= p_from)
    and (p_to   is null or p.date <= p_to)
  group by c.id, c.name
  order by c.name;
$$;

-- security invoker on purpose. This reads through the caller's own row
-- security rather than around it, so it can never show somebody figures
-- from a chapter they are not allowed to see.

commit;

-- ============================================================
-- Check it worked. Both of these should run without error.
--
--   select column_name from information_schema.columns
--    where table_name = 'reports'
--      and column_name in ('feedback_forms_returned', 'feedback_positive');
--   -- expect 2 rows
--
--   select * from public.satisfaction_summary();
--   -- expect 0 rows until the first report with feedback is filed
-- ============================================================
