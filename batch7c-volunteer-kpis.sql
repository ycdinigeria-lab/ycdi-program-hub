-- ============================================================
-- YCDI Programme Hub
-- Batch 7c: the two volunteer KPIs the hub can now answer honestly
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH7C-MARKER volunteer-kpis
--
-- What this is for
-- ----------------
-- YCDI-PROG-002 asks for three volunteer figures. Two of them became
-- answerable once Batch 6b put a real volunteer register in the hub and
-- Batch 7a and 7b filled it from the recruitment process:
--
--   volunteer_active_rate    % of registered volunteers active
--   volunteer_retention      year-on-year retention
--
-- The third, participant satisfaction against volunteers, still has no
-- data behind it and is left exactly as it was. Nothing here estimates
-- anything.
--
-- Both KPIs were 'not_captured' placeholders in Batch 5b. They become
-- real here, and four supporting lines are added beside them so nobody
-- reads one number without the number that qualifies it.
--
-- Two figures, not one
-- --------------------
-- The headline active rate is the register figure: how many people on
-- the books carry status 'active'. That is what the 70% target in
-- PROG-002 was written against, word for word, so it is what gets
-- measured against the target.
--
-- Underneath it sits an observed figure: how many of those same people
-- actually left a trace in the system during the period. It is not a
-- better number and it does not replace the first one. It is a second
-- opinion, and the gap between the two is the useful part. A wide gap
-- means the register has gone stale, not that the work stopped.
--
-- What counts as a trace
-- ----------------------
-- Three things only:
--   1. recording attendance for a young person
--   2. moving a young person through a stage
--   3. holding an open mentoring link
--
-- Signing the annual safeguarding declaration and completing training
-- are deliberately NOT counted. Somebody can sign in January and never
-- be seen again, and counting that would inflate the observed figure
-- until it stopped being a second opinion at all.
--
-- A limitation to state out loud
-- ------------------------------
-- participant_attendance is keyed on (participant, programme). A
-- volunteer running the same programme every week for a term produces
-- one row per young person, dated the first time. So involvement is
-- reliable as a yes or no across a year and weak as a measure of
-- recency. The note text on the line says so, because a figure that
-- explains itself in the Board pack is worth more than one that needs
-- somebody in the room to explain it.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Settings, so the window can move without a rebuild
-- ------------------------------------------------------------
-- By default the observed figure looks across the whole reporting
-- period, which is what an annual funder return wants. Some months from
-- now somebody may want a rolling figure instead, and that should be a
-- setting rather than a new deployment.
create table if not exists public.kpi_settings (
  key        text primary key,
  int_value  int,
  note       text,
  updated_at timestamptz not null default now()
);

comment on table public.kpi_settings is
  'Small numeric settings behind the KPI report. One row per setting. Set by the National Coordinator or an admin.';

insert into public.kpi_settings (key, int_value, note) values
  ('volunteer_activity_window_days', null,
   'How many days back from the end of the reporting period the observed activity figure looks. Null means the whole period, which is what an annual return wants. Set it to 90 for a rolling quarter.')
on conflict (key) do nothing;

alter table public.kpi_settings enable row level security;

-- Read for everybody signed in, exactly like kpi_targets. A coordinator
-- who cannot see the window has no way of knowing what the observed
-- figure beside their name is actually measuring.
drop policy if exists kpi_settings_read   on public.kpi_settings;
drop policy if exists kpi_settings_write  on public.kpi_settings;
drop policy if exists kpi_settings_update on public.kpi_settings;
drop policy if exists kpi_settings_delete on public.kpi_settings;

create policy kpi_settings_read on public.kpi_settings
  for select to authenticated
  using (true);

create policy kpi_settings_write on public.kpi_settings
  for insert to authenticated
  with check (public.dir_role() = 'NC' or public.is_admin());

create policy kpi_settings_update on public.kpi_settings
  for update to authenticated
  using (public.dir_role() = 'NC' or public.is_admin())
  with check (public.dir_role() = 'NC' or public.is_admin());

create policy kpi_settings_delete on public.kpi_settings
  for delete to authenticated
  using (public.dir_role() = 'NC' or public.is_admin());

-- Reading one setting from inside a KPI function. Security definer so a
-- coordinator gets the same window the National Coordinator is looking
-- at, rather than a null that quietly turns their rolling figure into a
-- whole-period one.
create or replace function public.kpi_setting_int(p_key text)
  returns int
  language sql
  stable
  security definer
  set search_path = public
as $$
  select int_value from public.kpi_settings where key = p_key
$$;

comment on function public.kpi_setting_int(text) is
  'One integer setting from kpi_settings. Returns null if the setting is absent or unset.';

grant execute on function public.kpi_setting_int(text) to authenticated;

-- ------------------------------------------------------------
-- 1b. Who is allowed to see volunteer figures at all
-- ------------------------------------------------------------
-- Deliberately NOT the same test the rest of the KPI report uses.
-- kpi_sees_all() plus a chapter match is right for programme figures,
-- because programs and reports have been readable by every signed-in
-- person since an early batch and Batch 5b left that alone on purpose.
--
-- The volunteer register is not like that. Batch 6a locked
-- volunteer_records to the person themselves, admins, the National
-- Coordinator, and a Regional Coordinator inside their own chapter, and
-- Batch 6b repeated exactly that rule in volunteer_register(). A Team
-- Member gets nothing there, on purpose.
--
-- These KPI functions are security definer, so they walk straight past
-- that policy. If they used the looser programme test, a Team Member
-- would be able to work out how many volunteers their chapter has and
-- how many are active, which is precisely what 6a decided they should
-- not have. So the register rule is repeated here rather than the
-- programme one, and a Team Member gets a blank rather than a figure.
create or replace function public.kpi_volunteer_chapter_ok(p_chapter uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(public.is_admin(), false)
      or coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.dir_role() = 'RC'
                  and public.dir_chapter() is not null
                  and p_chapter = public.dir_chapter(), false)
$$;

comment on function public.kpi_volunteer_chapter_ok(uuid) is
  'Whether the caller may see volunteer figures for the given chapter. Mirrors the volunteer_records read policy from Batch 6a, not the looser programme scope used elsewhere in the KPI report.';

grant execute on function public.kpi_volunteer_chapter_ok(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. Who was on the books during the period
-- ------------------------------------------------------------
-- The denominator for both KPIs. Everybody who held a volunteer record
-- that overlapped the period at all, whatever state it is in today.
--
-- Two exclusions, both deliberate:
--   'onboarding'  somebody part-way through the six steps of PROG-002
--                 section 2.1 has not started, and counting them as an
--                 inactive volunteer would punish a chapter for
--                 recruiting.
--   left already  a record closed before the period opened belongs to
--                 last year's return, not this one.
--
-- A record with no start date stays in. It is on the books; nobody
-- knowing when it opened is a data quality problem, not grounds for
-- dropping a person out of a funder figure.
--
-- Security definer, with the access test applied explicitly rather
-- than leaning on row security. A KPI that silently returns a smaller
-- number because a policy blocked a join is worse than one that errors,
-- because nobody notices.
create or replace function public.volunteers_on_books(
  p_from date,
  p_to   date
)
returns table (
  profile_id uuid,
  chapter_id uuid,
  started_on date,
  ended_on   date,
  status     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    vr.profile_id,
    pr.chapter_id,
    vr.started_on,
    vr.ended_on,
    vr.status
  from public.volunteer_records vr
  join public.profiles pr on pr.id = vr.profile_id
  where vr.status <> 'onboarding'
    and (vr.started_on is null or vr.started_on <= p_to)
    and (vr.ended_on   is null or vr.ended_on   >= p_from)
    and public.kpi_volunteer_chapter_ok(pr.chapter_id)
$$;

comment on function public.volunteers_on_books(date, date) is
  'Volunteer records overlapping the period, excluding onboarding and anyone who had already left before it opened. Scoped to the caller''s own chapter unless they are the National Coordinator or an admin.';

grant execute on function public.volunteers_on_books(date, date) to authenticated;

-- ------------------------------------------------------------
-- 3. Who actually left a trace
-- ------------------------------------------------------------
-- The numerator for the observed figure. Three traces, unioned and
-- deduplicated. Each arm guards against a null recorder, because an
-- attendance row imported without one says nothing about who was there
-- and would otherwise union in a null and count as somebody.
--
-- Scoped by chapter the same way volunteers_on_books is. It makes no
-- difference to any published figure, because this set is always
-- intersected with the one above, but it stops the function answering
-- "is this person active" about somebody in another chapter when called
-- on its own.
create or replace function public.volunteers_involved(
  p_from date,
  p_to   date
)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    -- The window can shorten the period but never reach outside it.
    -- greatest() is doing the real work here: a 365 day window on a
    -- one quarter report must not start pulling in last year.
    select
      case
        when public.kpi_setting_int('volunteer_activity_window_days') is null
          then p_from
        else greatest(p_from,
                      p_to - public.kpi_setting_int('volunteer_activity_window_days'))
      end as w_from,
      p_to as w_to
  ),
  traces as (
    -- 1. Recorded a young person's attendance.
    select pa.recorded_by as pid
      from public.participant_attendance pa, w
     where pa.recorded_by is not null
       and pa.attended_on between w.w_from and w.w_to

    union

    -- 2. Moved a young person through a stage.
    select ps.recorded_by
      from public.participant_stages ps, w
     where ps.recorded_by is not null
       and ps.moved_on between w.w_from and w.w_to

    union

    -- 3. Held a mentoring link that was open at some point in the
    --    window. A link is a state, not an event, so it is tested for
    --    overlap rather than for a date falling inside the window.
    --    Somebody mentoring the same young person for two years should
    --    not vanish from the figures in year two.
    select pm.mentor_id
      from public.participant_mentors pm, w
     where pm.mentor_id is not null
       and pm.assigned_on <= w.w_to
       and (pm.ended_on is null or pm.ended_on >= w.w_from)
  )
  select distinct t.pid
    from traces t
    join public.profiles pr on pr.id = t.pid
   where public.kpi_volunteer_chapter_ok(pr.chapter_id)
$$;

comment on function public.volunteers_involved(date, date) is
  'Volunteers who recorded attendance, moved a participant stage, or held an open mentoring link within the activity window. Deliberately excludes signing the annual declaration and completing training.';

grant execute on function public.volunteers_involved(date, date) to authenticated;

-- ------------------------------------------------------------
-- 4. Retention, by cohort
-- ------------------------------------------------------------
-- Two cohorts, reported separately and never added together. Somebody
-- who was already volunteering when the year opened and somebody who
-- joined in October are answering different questions, and a strong
-- autumn recruitment push should not be able to drag the headline down.
--
-- Measured on dates, not on status. `status` is a snapshot of today and
-- cannot answer a question about last December: a volunteer who left in
-- March and was reinstated in November reads as 'active' now, which
-- tells the 2026 return nothing. ended_on can be asked about any date.
--
-- A record with no start date is in neither cohort. It is still on the
-- books and still counts in the active rate, but it cannot be placed on
-- one side or the other of the period opening, and guessing is how a
-- funder figure becomes fiction.
create or replace function public.volunteer_retention_cohort(
  p_from   date,
  p_to     date,
  p_cohort text
)
returns table (
  profile_id uuid,
  retained   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.profile_id,
    (b.ended_on is null or b.ended_on > p_to) as retained
  from public.volunteers_on_books(p_from, p_to) b
  where b.started_on is not null
    and case p_cohort
          when 'continuing' then b.started_on < p_from
          when 'new'        then b.started_on between p_from and p_to
          -- An unrecognised cohort name returns nobody rather than
          -- everybody. Failing to an empty set shows up as a blank line
          -- in the Board pack. Failing to the full set shows up as a
          -- number somebody believes.
          else false
        end
$$;

comment on function public.volunteer_retention_cohort(date, date, text) is
  'Retention for one cohort. p_cohort is ''continuing'' (started before the period) or ''new'' (started during it). Retained means the record was still open at the end of the period.';

grant execute on function public.volunteer_retention_cohort(date, date, text) to authenticated;

commit;

-- ============================================================
-- 5. The snapshot, rebuilt whole
-- ============================================================
-- Replaced entire rather than patched, the same way Batch 7b replaced
-- decide_application. The two placeholder lines become real, four
-- supporting lines join them, and every other line is carried over from
-- Batch 5b word for word with a new sort order.
--
-- Note for anybody reading the numbering: src/lib/kpi.js keys off
-- kpi_key and status and never off sort_order, so renumbering costs
-- nothing. The keys volunteer_active_rate and volunteer_retention are
-- kept exactly as they were, because kpi_targets already carries the
-- 2026 targets of 70 and 60 against those names and a rename would
-- silently orphan both.
--
-- Percentages are still worked out in one place at the top from each
-- line's numerator and denominator. A line never supplies a percentage
-- it calculated itself.
-- ============================================================

begin;

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

    -- 3. Raw headcount, kept separate on purpose.
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

    -- 4. Programme activities conducted.
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

    -- 5. Volunteer active rate, the register figure. THE KPI LINE.
    -- Measured the way PROG-002 words it: what share of the people on
    -- the books are marked active. Compared against the 70% target.
    select
      5, 'volunteer_active_rate',
      'Volunteer active rate (% of registered volunteers active)',
      (select count(*) from public.volunteers_on_books(p_from, p_to) b
        where b.status = 'active')::numeric,
      (select count(*) from public.volunteers_on_books(p_from, p_to))::numeric,
      null,
      'percent', 'computed',
      'From the volunteer register. Anyone still onboarding is left out, and so is anyone who had already left before the period opened. This reads the status recorded on each record, so it is only as current as the register itself. Read it next to the observed figure below.'

    union all

    -- 6. The same question asked of the record of work done.
    select
      6, 'volunteer_active_rate_observed',
      'Volunteer active rate, observed from recorded work',
      (select count(*) from public.volunteers_on_books(p_from, p_to) b
        where b.profile_id in (select i.profile_id
                                 from public.volunteers_involved(p_from, p_to) i))::numeric,
      (select count(*) from public.volunteers_on_books(p_from, p_to))::numeric,
      null,
      'percent', 'secondary',
      'The same denominator, but counting only volunteers who recorded attendance, moved a participant stage, or held an open mentoring link. Signing the annual declaration does not count. Attendance is stored once per volunteer per programme, so this is dependable as a yes or no across a year and weak as a measure of recency. A wide gap against the line above means the register is out of date, not that the work stopped.'

    union all

    -- 7. The denominator, shown rather than left to be inferred.
    select
      7, 'volunteers_on_books',
      'Volunteers on the books during the period',
      null, null,
      (select count(*) from public.volunteers_on_books(p_from, p_to))::numeric,
      'count', 'secondary',
      'The denominator behind both active rate lines. Everyone whose volunteer record overlapped the period, whatever state it is in now, excluding onboarding.'

    union all

    -- 8. Retention, continuing volunteers. THE KPI LINE.
    select
      8, 'volunteer_retention',
      'Volunteer retention rate (year-on-year)',
      (select count(*) from public.volunteer_retention_cohort(p_from, p_to, 'continuing') c
        where c.retained)::numeric,
      (select count(*) from public.volunteer_retention_cohort(p_from, p_to, 'continuing'))::numeric,
      null,
      'percent', 'computed',
      'Volunteers who were already serving when the period opened and were still serving at the end of it. Worked out from start and end dates rather than from current status, so it answers the question for the period being reported and not for today. Volunteers who joined during the period are counted separately below. A blank means nobody was in this cohort, which is not the same as nobody staying.'

    union all

    -- 9. Retention, new starters. Kept apart on purpose.
    select
      9, 'volunteer_retention_new',
      'Retention of volunteers who joined during the period',
      (select count(*) from public.volunteer_retention_cohort(p_from, p_to, 'new') c
        where c.retained)::numeric,
      (select count(*) from public.volunteer_retention_cohort(p_from, p_to, 'new'))::numeric,
      null,
      'percent', 'secondary',
      'New starters only, held apart from the headline so a strong recruitment drive late in the year cannot drag it down. Somebody who joined in November and is still on the books counts as retained here, which is a much shorter test than the line above and should not be read as the same thing.'

    union all

    -- 10. Chapters. Left national on purpose, for everybody.
    select
      10, 'chapters_active',
      'Active chapters (national)',
      null, null,
      (select count(*) from public.chapters)::numeric,
      'count', 'computed',
      'National figure, shown to everyone. YCDI-PROG-002 baseline is 6 chapters, with one new chapter every two years.'

    union all

    select
      11, 'chapters_opened',
      'New chapters opened in the period',
      null, null,
      (select count(*) from public.chapters c
        where c.opened_on between p_from and p_to
          and (public.kpi_sees_all() or c.id = public.dir_chapter()))::numeric,
      'count', 'secondary',
      'Counts only chapters with an opening date recorded. Existing chapters have no date on file, so this reads zero until those are filled in.'

    union all

    -- 12. Participant satisfaction.
    select
      12, 'participant_satisfaction',
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

    -- 13. Safeguarding resolution inside 30 days.
    select
      13, 'safeguarding_resolution',
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

    -- 14. The number the Board actually has to act on.
    select
      14, 'safeguarding_overdue',
      'Safeguarding incidents still open beyond 30 days',
      null, null,
      (select count(*) from public.safeguarding_incidents i
        where i.status <> 'Closed'
          and (current_date - i.reported_on) > 30)::numeric,
      'count', 'secondary',
      'Live figure as at today, not confined to the reporting period. Anything above zero needs an answer at the meeting.'

    union all

    -- 15. Financial resource utilisation.
    select
      15, 'budget_utilisation',
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

    -- 16. Annual report published. A Board record, not a hub record.
    select
      16, 'annual_report_published',
      'Annual report produced and published (by 31 March)',
      null, null, null,
      'yesno', 'not_captured',
      'Held in Board records. The hub has no field for it.'

  ) s
  order by s.sort_order;
$$;

comment on function public.kpi_snapshot(date, date) is
  'Core KPI dashboard figures for a date range. YCDI-PROG-002. Scoped to the caller''s own chapter unless they are the National Coordinator or an admin. Sixteen lines as of Batch 7c, of which one is still not captured.';

commit;

-- ============================================================
-- Check it worked.
--
--   select count(*) from public.kpi_snapshot('2026-01-01','2026-12-31');
--   -- 16
--
--   select kpi_key, numerator, denominator, value, status
--     from public.kpi_snapshot('2026-01-01','2026-12-31')
--    where kpi_key like 'volunteer%';
--   -- five lines: the two KPI lines, the observed figure, the head
--   --   count on the books, and new starter retention
--
--   select kpi_key from public.kpi_snapshot('2026-01-01','2026-12-31')
--    where status = 'not_captured';
--   -- annual_report_published, and nothing else
--
-- To switch the observed figure to a rolling quarter:
--
--   update public.kpi_settings
--      set int_value = 90, updated_at = now()
--    where key = 'volunteer_activity_window_days';
--
-- To put it back to the whole period:
--
--   update public.kpi_settings
--      set int_value = null, updated_at = now()
--    where key = 'volunteer_activity_window_days';
--
-- The register figure does not move when the window changes. Only the
-- observed one does. If both move, something is wrong.
-- ============================================================
