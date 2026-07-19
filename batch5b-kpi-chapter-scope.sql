-- ============================================================
-- YCDI Programme Hub
-- Batch 5b: the KPI report only shows a coordinator their own chapter
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH5B-MARKER kpi-chapter-scope
--
-- Why this is needed
-- ------------------
-- The `programs` and `reports` tables have been readable by every signed-in
-- person since an earlier batch. Their row security policy is literally
-- `true`. That was a deliberate decision at the time and it is left alone
-- here, because those tables are read all over the hub and changing them
-- would quietly alter half a dozen screens nobody asked about.
--
-- What it means, though, is that six lines of the KPI dashboard were
-- national for everybody: schools reached, activities conducted, total
-- attendance, satisfaction, budget utilisation, and the chapter
-- breakdown. A Regional Coordinator opening the report saw every
-- chapter's figures.
--
-- Three lines were already correct and are untouched here:
--   student_beneficiaries      scoped by the participants policy
--   safeguarding_resolution    scoped by can_see_incident()
--   safeguarding_overdue       same
-- They were right because those tables were locked down properly when
-- they were built. This brings the rest into line.
--
-- The National Coordinator and admins still see everything.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Who sees the whole country
-- ------------------------------------------------------------
-- security definer so it can read the caller's own profile row without
-- depending on whatever the profiles policy happens to allow. It answers
-- one yes-or-no question about the person asking and leaks nothing else.
create or replace function public.kpi_sees_all()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(public.dir_role() = 'NC', false) or coalesce(public.is_admin(), false)
$$;

comment on function public.kpi_sees_all() is
  'True for the National Coordinator and admins. Everyone else sees only their own chapter in the KPI report.';

-- A note on what happens to somebody with neither: dir_chapter() returns
-- null, the comparison below is null, and null is not true, so they are
-- shown nothing rather than everything. Failing closed is the point.

-- ------------------------------------------------------------
-- 2. The snapshot, scoped
-- ------------------------------------------------------------
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
  -- never both and never a percentage it calculated itself.
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
    -- there and reported, which is what status 'Complete' means.
    -- Names are trimmed and case-folded so "Ogbomoso Grammar School" and
    -- "ogbomoso grammar school " are one school, not two.
    select
      1 as sort_order, 'schools_reached' as kpi_key,
      'Total schools reached' as label,
      null::numeric as numerator, null::numeric as denominator,
      (select count(distinct lower(btrim(p.school)))
         from public.programs p
        where p.status = 'Complete'
          and p.date between p_from and p_to
          and coalesce(btrim(p.school), '') <> ''
          and (public.kpi_sees_all() or p.chapter_id = public.dir_chapter()))::numeric as direct_value,
      'count' as unit, 'computed' as status,
      'Distinct schools with a completed, reported programme. Typed school names vary in spelling, so treat this as close rather than exact.' as note

    union all

    -- 2. Student beneficiaries, deduplicated.
    -- THE rule from YCDI-PROG-002. count(distinct participant_id), never
    -- a count of attendance rows. Already limited to the caller's own
    -- chapter by the participants policy, so no extra filter here.
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
    select
      3, 'attendance_headcount',
      'Total attendance recorded across all programmes (NOT deduplicated)',
      null, null,
      (select coalesce(sum(r.attendance), 0)
         from public.reports r
         join public.programs p on p.id = r.program_id
        where p.date between p_from and p_to
          and (public.kpi_sees_all() or p.chapter_id = public.dir_chapter()))::numeric,
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
          and p.date between p_from and p_to
          and (public.kpi_sees_all() or p.chapter_id = public.dir_chapter()))::numeric,
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

    -- 6. Chapters. Left national on purpose, for everybody.
    -- How many chapters YCDI has is an organisational fact, not another
    -- region's private business, and a coordinator seeing "1" here would
    -- be reading a broken number rather than a scoped one.
    select
      7, 'chapters_active',
      'Active chapters (national)',
      null, null,
      (select count(*) from public.chapters)::numeric,
      'count', 'computed',
      'National figure, shown to everyone. YCDI-PROG-002 baseline is 6 chapters, with one new chapter every two years.'

    union all

    select
      8, 'chapters_opened',
      'New chapters opened in the period',
      null, null,
      (select count(*) from public.chapters c
        where c.opened_on between p_from and p_to
          and (public.kpi_sees_all() or c.id = public.dir_chapter()))::numeric,
      'count', 'secondary',
      'Counts only chapters with an opening date recorded. Existing chapters have no date on file, so this reads zero until those are filled in.'

    union all

    -- 7. Participant satisfaction.
    -- Programmes where no feedback forms were handed out are left out
    -- entirely rather than counted as zero.
    select
      9, 'participant_satisfaction',
      'Participant satisfaction score (events)',
      (select coalesce(sum(r.feedback_positive), 0)
         from public.reports r
         join public.programs p on p.id = r.program_id
        where p.date between p_from and p_to
          and coalesce(r.feedback_forms_returned, 0) > 0
          and (public.kpi_sees_all() or p.chapter_id = public.dir_chapter()))::numeric,
      (select coalesce(sum(r.feedback_forms_returned), 0)
         from public.reports r
         join public.programs p on p.id = r.program_id
        where p.date between p_from and p_to
          and coalesce(r.feedback_forms_returned, 0) > 0
          and (public.kpi_sees_all() or p.chapter_id = public.dir_chapter()))::numeric,
      null,
      'percent', 'computed',
      'Positive replies as a share of forms returned. Programmes where no forms were distributed are excluded, not counted as zero.'

    union all

    -- 8. Safeguarding resolution inside 30 days.
    -- Already limited by can_see_incident(), so no extra filter here.
    -- The denominator is incidents REPORTED in the period, so one still
    -- open counts against the rate rather than vanishing from it.
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
          and p.date between p_from and p_to
          and (public.kpi_sees_all() or p.chapter_id = public.dir_chapter()))::numeric,
      (select coalesce(sum(p.budget), 0)
         from public.programs p
        where p.status = 'Complete'
          and p.date between p_from and p_to
          and (public.kpi_sees_all() or p.chapter_id = public.dir_chapter()))::numeric,
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
  'Core KPI dashboard figures for a date range. YCDI-PROG-002. Scoped to the caller''s own chapter unless they are the National Coordinator or an admin.';

-- ------------------------------------------------------------
-- 3. The chapter breakdown, scoped
-- ------------------------------------------------------------
-- A Regional Coordinator now gets one row, their own. Previously they got
-- a row per chapter with everybody else's programme figures filled in.
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
  where public.kpi_sees_all() or c.id = public.dir_chapter()
  order by c.name;
$$;

comment on function public.kpi_chapter_breakdown(date, date) is
  'Per-chapter KPI figures. A Regional Coordinator sees only their own chapter; the National Coordinator and admins see all.';

commit;

-- ============================================================
-- Check it worked.
--
--   select public.kpi_sees_all();
--   -- true if you are the NC or an admin, false otherwise
--
--   select kpi_key, value from public.kpi_snapshot('2026-01-01','2026-12-31');
--   -- as the NC: national figures
--   -- as a Regional Coordinator: their own chapter only, except the
--   --   'Active chapters (national)' line, which stays national on purpose
--
--   select chapter_name from public.kpi_chapter_breakdown('2026-01-01','2026-12-31');
--   -- as a Regional Coordinator: exactly one row, their own chapter
-- ============================================================
