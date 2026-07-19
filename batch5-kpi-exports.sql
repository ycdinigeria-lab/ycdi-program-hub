-- ============================================================
-- YCDI Programme Hub
-- Batch 5: funder and Board KPI exports
--
-- Run this in the Supabase SQL editor BEFORE pushing the Batch 5 code.
-- It is safe to run more than once.
--
-- BATCH5-MARKER kpi-exports
--
-- What this is for
-- ----------------
-- YCDI-PROG-002 sets out a ten-line Core KPI Dashboard, and YCDI-PROG-003
-- Template 2 sets out the table the National Coordinator puts in front of
-- the Board every quarter: KPI, Q Target, Q Actual, YTD Target, YTD
-- Actual, Variance, Status. Until now every one of those cells was filled
-- in by hand from paper. This makes the Actual columns come out of the
-- system that already holds the data.
--
-- Three things this deliberately does NOT do
-- ------------------------------------------
-- 1. It does not invent the two volunteer KPIs. Volunteer active rate and
--    retention both need a volunteer register with history, which lives in
--    a separate app that is still on mock data. They come back marked
--    'not_captured' with a null value. A gap a funder can see is honest.
--    A number nobody can trace is not.
--
-- 2. It does not calculate targets. Most of the policy targets read
--    "10% increase year-on-year" or "per approved work plan", and the hub
--    has neither a prior-year baseline nor a copy of the work plan. So
--    targets are entered once a year by the NC into kpi_targets below.
--
-- 3. It does not count attendance rows as people. YCDI-PROG-002 is
--    explicit under Data Quality Standards: a student who attends three
--    school fellowship sessions counts as ONE beneficiary for the year,
--    not three. That rule is enforced here, in the query, so it cannot be
--    undone by whoever builds the next screen.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. When each chapter opened
-- ------------------------------------------------------------
-- "Chapter expansion (new chapters opened)" cannot be answered by a table
-- that only knows a chapter's name. This adds the missing date. It is
-- left null for the chapters that already exist, because nobody should
-- back-fill founding dates from memory and then hand them to a funder.
-- Fill them in when the real dates are to hand. From here on, new
-- chapters can record it at the point of creation.
alter table public.chapters
  add column if not exists opened_on date;

comment on column public.chapters.opened_on is
  'Date this chapter formally opened. Null means the date was never recorded, not that the chapter is new.';

-- ------------------------------------------------------------
-- 2. Where the targets live
-- ------------------------------------------------------------
-- One row per KPI per financial year. Quarterly targets are stored
-- separately rather than derived by dividing the annual figure by four,
-- because school terms are not four equal quarters and a coordinator
-- planning around them knows better than arithmetic does.
create table if not exists public.kpi_targets (
  financial_year int    not null check (financial_year between 2017 and 2100),
  kpi_key        text   not null,
  baseline       numeric,
  annual_target  numeric,
  q1_target      numeric,
  q2_target      numeric,
  q3_target      numeric,
  q4_target      numeric,
  note           text,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (financial_year, kpi_key)
);

comment on table public.kpi_targets is
  'Annual and quarterly KPI targets, entered by the National Coordinator from the approved work plan. YCDI-PROG-002.';

alter table public.kpi_targets enable row level security;

-- Everybody signed in can read the targets. A coordinator who cannot see
-- the target has no way of knowing whether their chapter is behind.
drop policy if exists kpi_targets_read   on public.kpi_targets;
drop policy if exists kpi_targets_write  on public.kpi_targets;
drop policy if exists kpi_targets_update on public.kpi_targets;
drop policy if exists kpi_targets_delete on public.kpi_targets;

create policy kpi_targets_read on public.kpi_targets
  for select to authenticated
  using (true);

-- Setting the target is a national decision taken from the Board-approved
-- work plan, so a chapter coordinator cannot quietly lower their own bar.
create policy kpi_targets_write on public.kpi_targets
  for insert to authenticated
  with check (public.dir_role() = 'NC' or public.is_admin());

create policy kpi_targets_update on public.kpi_targets
  for update to authenticated
  using (public.dir_role() = 'NC' or public.is_admin())
  with check (public.dir_role() = 'NC' or public.is_admin());

create policy kpi_targets_delete on public.kpi_targets
  for delete to authenticated
  using (public.dir_role() = 'NC' or public.is_admin());

-- ------------------------------------------------------------
-- 3. The snapshot
-- ------------------------------------------------------------
-- One call returns every line of the dashboard for a date range. The
-- client asks twice, once for the quarter and once for the year to date,
-- and lays the two beside each other to make Template 2.
--
-- security invoker, on purpose. This reads through the caller's own row
-- security rather than around it. A Regional Coordinator running the
-- export gets their own chapter's figures, the National Coordinator gets
-- everything, and neither of them had to be trusted to filter it.
--
-- status column:
--   'computed'      the number comes from hub data and can be evidenced
--   'partial'       the number is real but the denominator is incomplete
--   'not_captured'  the hub does not hold this yet, value is null
--   'secondary'     supporting figure, not a KPI line in its own right
create or replace function public.kpi_snapshot(
  p_from date,
  p_to   date
)
returns table (
  sort_order  int,
  kpi_key     text,
  label       text,
  numerator   numeric,
  denominator numeric,
  value       numeric,
  unit        text,
  status      text,
  note        text
)
language sql
security invoker
stable
set search_path = public
as $$
  -- Every percentage on this dashboard is worked out in exactly one
  -- place, here, from the numerator and denominator each line hands up.
  -- Each line supplies either a straight count or a pair of figures,
  -- never both and never a percentage it calculated itself. Writing the
  -- rule twice is how a numerator and a percentage quietly stop agreeing
  -- with each other, and nobody notices until a funder adds them up.
  select
    s.sort_order,
    s.kpi_key,
    s.label,
    s.numerator,
    s.denominator,
    case
      when s.unit = 'percent' then
        case when coalesce(s.denominator, 0) = 0 then null
             else round(100.0 * s.numerator / s.denominator, 1) end
      else s.direct_value
    end,
    s.unit,
    s.status,
    s.note
  from (

    -- 1. Schools reached.
    -- A school counts as reached when a programme was actually delivered
    -- there and reported, which is what status 'Complete' means. A
    -- programme that ran but whose report has not been filed does not
    -- count yet. That is deliberate: it keeps the figure to things that
    -- can be evidenced, and it gives coordinators a reason to file.
    -- Names are trimmed and case-folded so "Ogbomoso Grammar School" and
    -- "ogbomoso grammar school " are one school, not two.
    select
      1 as sort_order, 'schools_reached' as kpi_key,
      'Total schools reached across all chapters' as label,
      null::numeric as numerator, null::numeric as denominator,
      (select count(distinct lower(btrim(p.school)))
         from public.programs p
        where p.status = 'Complete'
          and p.date between p_from and p_to
          and coalesce(btrim(p.school), '') <> '')::numeric as direct_value,
      'count' as unit, 'computed' as status,
      'Distinct schools with a completed, reported programme. Typed school names vary in spelling, so treat this as close rather than exact.' as note

    union all

    -- 2. Student beneficiaries, deduplicated.
    -- THE rule from YCDI-PROG-002. count(distinct participant_id), never
    -- a count of attendance rows. One young person who came to every
    -- session all year is one beneficiary.
    select
      2, 'student_beneficiaries',
      'Total student beneficiaries (deduplicated)',
      null, null,
      (select count(distinct pa.participant_id)
         from public.participant_attendance pa
        where pa.attended_on between p_from and p_to)::numeric,
      'count', 'computed',
      'Distinct young people with at least one attendance recorded in the period. A student at three sessions counts once, per YCDI-PROG-002.'

    union all

    -- 2b. Raw headcount, kept separate on purpose.
    -- The sum of the attendance figures typed into post-programme
    -- reports. It is bigger than the line above and always will be,
    -- because it counts seats rather than people. It is here so nobody
    -- has to go hunting for it, and labelled so nobody hands it to a
    -- funder by accident.
    select
      3, 'attendance_headcount',
      'Total attendance recorded across all programmes (NOT deduplicated)',
      null, null,
      (select coalesce(sum(r.attendance), 0)
         from public.reports r
         join public.programs p on p.id = r.program_id
        where p.date between p_from and p_to)::numeric,
      'count', 'secondary',
      'Seats, not people. The same student appears once per event attended. Not the beneficiary KPI and must not be reported as one.'

    union all

    -- 3. Programme activities conducted.
    select
      4, 'activities_conducted',
      'Number of program activities conducted',
      null, null,
      (select count(*)
         from public.programs p
        where p.status = 'Complete'
          and p.date between p_from and p_to)::numeric,
      'count', 'computed',
      'Programmes delivered and reported in the period.'

    union all

    -- 4. Volunteer active rate. Not held here.
    select
      5, 'volunteer_active_rate',
      'Volunteer active rate (% of registered volunteers active)',
      null, null, null,
      'percent', 'not_captured',
      'Needs a volunteer register with activity history. That lives in the HR system, not the hub.'

    union all

    -- 5. Volunteer retention. Not held here either.
    select
      6, 'volunteer_retention',
      'Volunteer retention rate (year-on-year)',
      null, null, null,
      'percent', 'not_captured',
      'Needs two consecutive years of volunteer register data. Not available in the hub.'

    union all

    -- 6. Chapters. A point-in-time figure, so taken as it stands rather
    -- than confined to the period.
    select
      7, 'chapters_active',
      'Active chapters',
      null, null,
      (select count(*) from public.chapters)::numeric,
      'count', 'computed',
      'Total chapters on the system. Baseline in YCDI-PROG-002 is 6, with one new chapter every two years.'

    union all

    select
      8, 'chapters_opened',
      'New chapters opened in the period',
      null, null,
      (select count(*) from public.chapters c
        where c.opened_on between p_from and p_to)::numeric,
      'count', 'secondary',
      'Counts only chapters with an opening date recorded. Existing chapters have no date on file, so this reads zero until those are filled in.'

    union all

    -- 7. Participant satisfaction.
    -- Programmes where no feedback forms were handed out are left out
    -- entirely rather than counted as zero. A night nobody printed forms
    -- is not a night nobody enjoyed.
    select
      9, 'participant_satisfaction',
      'Participant satisfaction score (events)',
      (select coalesce(sum(r.feedback_positive), 0)
         from public.reports r
         join public.programs p on p.id = r.program_id
        where p.date between p_from and p_to
          and coalesce(r.feedback_forms_returned, 0) > 0)::numeric,
      (select coalesce(sum(r.feedback_forms_returned), 0)
         from public.reports r
         join public.programs p on p.id = r.program_id
        where p.date between p_from and p_to
          and coalesce(r.feedback_forms_returned, 0) > 0)::numeric,
      null,
      'percent', 'computed',
      'Positive replies as a share of forms returned. Programmes where no forms were distributed are excluded, not counted as zero.'

    union all

    -- 8. Safeguarding resolution inside 30 days.
    -- The denominator is incidents REPORTED in the period, so one that is
    -- still open counts against the rate rather than vanishing from it. A
    -- rate calculated only across closed cases would read 100% while
    -- cases sat open for a year.
    select
      10, 'safeguarding_resolution',
      'Safeguarding incidents reported and resolved within 30 days',
      (select count(*) from public.safeguarding_incidents i
        where i.reported_on between p_from and p_to
          and i.status = 'Closed'
          and i.closed_at is not null
          and (i.closed_at::date - i.reported_on) <= 30)::numeric,
      (select count(*) from public.safeguarding_incidents i
        where i.reported_on between p_from and p_to)::numeric,
      null,
      'percent', 'computed',
      'Target is 100%. Incidents still open count against the rate rather than being left out of it. Null means none were reported, which is not the same as 100%.'

    union all

    -- 8b. The number the Board actually has to act on.
    select
      11, 'safeguarding_overdue',
      'Safeguarding incidents still open beyond 30 days',
      null, null,
      (select count(*) from public.safeguarding_incidents i
        where i.status <> 'Closed'
          and (current_date - i.reported_on) > 30)::numeric,
      'count', 'secondary',
      'Live figure as at today, not confined to the reporting period. Anything above zero needs an answer at the meeting.'

    union all

    -- 9. Financial resource utilisation.
    -- Marked partial, and it matters why. The policy KPI is spend against
    -- the whole approved annual budget. The hub only knows programme
    -- budgets, so this is programme spend against programme budget. A
    -- real number about a smaller thing.
    -- Spend is read from the post-programme report rather than from
    -- programs.spent, because programs.spent is shown by the app but
    -- never written to.
    select
      12, 'budget_utilisation',
      'Financial resource utilization rate (programme budgets only)',
      (select coalesce(sum(r.actual_expenditure), 0)
         from public.reports r
         join public.programs p on p.id = r.program_id
        where p.status = 'Complete'
          and p.date between p_from and p_to)::numeric,
      (select coalesce(sum(p.budget), 0)
         from public.programs p
        where p.status = 'Complete'
          and p.date between p_from and p_to)::numeric,
      null,
      'percent', 'partial',
      'Programme spend against programme budget. The policy KPI is spend against the whole approved annual budget, which the hub does not hold. Do not present this as the full utilisation rate without saying so.'

    union all

    -- 10. Annual report published. A Board record, not a hub record.
    select
      13, 'annual_report_published',
      'Annual report produced and published (by 31 March)',
      null, null, null,
      'yesno', 'not_captured',
      'Held in Board records. The hub has no field for it.'

  ) s
  order by s.sort_order;
$$;

comment on function public.kpi_snapshot(date, date) is
  'Core KPI dashboard figures for a date range. YCDI-PROG-002. Security invoker, so it reads through the caller''s own row security.';

-- ------------------------------------------------------------
-- 4. The same thing, split by chapter
-- ------------------------------------------------------------
-- The national line is what goes to the Board. This is what tells the
-- National Coordinator which chapter the national line is being carried
-- by, and which one needs a phone call.
create or replace function public.kpi_chapter_breakdown(
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
  spent                 numeric
)
language sql
security invoker
stable
set search_path = public
as $$
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
        and p.date between p_from and p_to)::numeric
  from public.chapters c
  order by c.name;
$$;

comment on function public.kpi_chapter_breakdown(date, date) is
  'Per-chapter KPI figures for a date range. Security invoker, so a Regional Coordinator sees only their own chapter.';

commit;

-- ============================================================
-- Seed the targets the policy states outright
-- ------------------------------------------------------------
-- Four of the ten KPIs have a fixed target written into YCDI-PROG-002
-- rather than one derived from a work plan. Those are inserted here so
-- the National Coordinator is not typing them from memory. The rest are
-- left empty on purpose, because guessing a target and printing it in a
-- Board paper is worse than leaving the cell blank.
--
-- Change 2026 below if you are setting up a different year. Re-running
-- this will not overwrite a target somebody has already edited.
-- ============================================================

insert into public.kpi_targets (financial_year, kpi_key, annual_target,
                                q1_target, q2_target, q3_target, q4_target, note)
values
  (2026, 'volunteer_active_rate',    70,  70,  70,  70,  70,
   'YCDI-PROG-002: above 70%.'),
  (2026, 'volunteer_retention',      60,  null, null, null, 60,
   'YCDI-PROG-002: above 60%, measured annually.'),
  (2026, 'participant_satisfaction', 80,  80,  80,  80,  80,
   'YCDI-PROG-002: above 80% positive.'),
  (2026, 'safeguarding_resolution', 100, 100, 100, 100, 100,
   'YCDI-PROG-002: 100% resolved within 30 days.'),
  (2026, 'budget_utilisation',       85,  85,  85,  85,  85,
   'YCDI-PROG-002: above 85% of approved budget.'),
  (2026, 'chapters_active',           6,  null, null, null, 6,
   'YCDI-PROG-002 baseline is 6 chapters, one new chapter every two years.')
on conflict (financial_year, kpi_key) do nothing;

-- ============================================================
-- Check it worked. All four should run without error.
--
--   select column_name from information_schema.columns
--    where table_name = 'chapters' and column_name = 'opened_on';
--   -- expect 1 row
--
--   select count(*) from public.kpi_targets where financial_year = 2026;
--   -- expect 6
--
--   select kpi_key, label, value, status from public.kpi_snapshot('2026-01-01','2026-12-31');
--   -- expect 13 rows, three of them with status not_captured and a null value
--
--   select chapter_name, activities, beneficiaries from public.kpi_chapter_breakdown('2026-01-01','2026-12-31');
--   -- expect one row per chapter you are allowed to see
-- ============================================================
