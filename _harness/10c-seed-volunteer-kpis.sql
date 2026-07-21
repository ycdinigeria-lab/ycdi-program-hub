-- Harness only. Never run this against Supabase.
--
-- BATCH7C-MARKER harness-seed
--
-- The cast for the volunteer KPI tests. Twelve volunteer records, and
-- every one of them sits on a boundary, because the middle of a range
-- has never broken anything. The reporting period throughout is the
-- whole of 2026.
--
--   b0000000-...-01  Vera Veteran    continuing, retained, involved
--   b0000000-...-02  Silas Silent    on the register, no trace all year
--   b0000000-...-03  Ify Inactive    signed a declaration and nothing else
--   b0000000-...-04  Wale Withdrew   left mid-year, trace in 2025 only
--   b0000000-...-05  Nkechi New      new cohort, retained, moved a stage
--   b0000000-...-06  Bode Briefly    new cohort, not retained
--   b0000000-...-07  Ola Onboarding  excluded entirely
--   b0000000-...-08  Gone Before     left before the period opened
--   b0000000-...-09  Undated Una     on the books, in neither cohort
--   b0000000-...-10  Future Femi     starts after the period closes
--   b0000000-...-11  Eve Exactly     ended on the last day of the period
--   c0000000-...-01  Auchi Ada       open mentoring link, tests scoping

set test.uid = '';

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000001', 'vera@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000002', 'silas@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000003', 'ify@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000004', 'wale@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000005', 'nkechi@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000006', 'bode@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000007', 'ola@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000008', 'gone@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000009', 'una@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000010', 'femi@ycdi.test'),
  ('b0000000-0000-0000-0000-000000000011', 'eve@ycdi.test'),
  ('c0000000-0000-0000-0000-000000000001', 'ada.auchi@ycdi.test')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, chapter_id, is_admin) values
  ('b0000000-0000-0000-0000-000000000001','Vera Veteran',  'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000002','Silas Silent',  'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000003','Ify Inactive',  'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000004','Wale Withdrew', 'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000005','Nkechi New',    'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000006','Bode Briefly',  'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000007','Ola Onboarding','TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000008','Gone Before',   'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000009','Undated Una',   'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000010','Future Femi',   'TM',(select id from public.chapters where name='Benin'),false),
  ('b0000000-0000-0000-0000-000000000011','Eve Exactly',   'TM',(select id from public.chapters where name='Benin'),false),
  ('c0000000-0000-0000-0000-000000000001','Auchi Ada',     'TM',(select id from public.chapters where name='Auchi'),false)
on conflict (id) do nothing;

-- The register itself. status, started_on and ended_on are the three
-- columns every figure in Batch 7c is built out of.
insert into public.volunteer_records (profile_id, status, started_on, ended_on) values
  ('b0000000-0000-0000-0000-000000000001','active',     date '2025-01-10', null),
  ('b0000000-0000-0000-0000-000000000002','active',     date '2025-06-01', null),
  ('b0000000-0000-0000-0000-000000000003','inactive',   date '2024-03-01', null),
  ('b0000000-0000-0000-0000-000000000004','withdrawn',  date '2024-01-01', date '2026-05-20'),
  ('b0000000-0000-0000-0000-000000000005','active',     date '2026-03-01', null),
  ('b0000000-0000-0000-0000-000000000006','active',     date '2026-04-01', date '2026-08-01'),
  ('b0000000-0000-0000-0000-000000000007','onboarding', null,              null),
  ('b0000000-0000-0000-0000-000000000008','removed',    date '2023-01-01', date '2025-11-30'),
  ('b0000000-0000-0000-0000-000000000009','active',     null,              null),
  ('b0000000-0000-0000-0000-000000000010','active',     date '2027-01-01', null),
  ('b0000000-0000-0000-0000-000000000011','active',     date '2025-01-01', date '2026-12-31'),
  ('c0000000-0000-0000-0000-000000000001','active',     date '2024-01-01', null)
on conflict (profile_id) do nothing;

-- Two young people, one per chapter. created_by is left null on purpose.
-- The trigger on participants writes a first row of stage history using
-- created_by as the recorder, so a null there gives a stage row dated
-- inside the reporting period with no recorder against it. That row is
-- doing a job: it is the case that proves a stage change with nobody
-- named on it cannot turn into an active volunteer.
insert into public.participants
  (id, chapter_id, full_name, age_band, stage, first_contact_on, consent_on, created_by)
values
  ('dddddddd-0000-0000-0000-000000000001',
   (select id from public.chapters where name='Benin'),
   'Blessing Benin', '13-15', 'Contact', date '2026-02-01', date '2026-01-15', null),
  ('dddddddd-0000-0000-0000-000000000002',
   (select id from public.chapters where name='Auchi'),
   'Amaka Auchi', '16-17', 'Contact', date '2026-02-01', date '2026-01-15', null)
on conflict (id) do nothing;

-- Trace 1, attendance.
-- Vera inside the period. Wale a year earlier, so he is on the books but
-- shows no sign of life in 2026. And one row with no recorder at all.
insert into public.participant_attendance
  (participant_id, program_id, attended_on, recorded_by)
values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   date '2026-03-15','b0000000-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003',
   date '2025-07-01','b0000000-0000-0000-0000-000000000004'),
  ('dddddddd-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002',
   date '2026-06-01', null)
on conflict (participant_id, program_id) do nothing;

-- Trace 2, stage moves.
-- Nkechi's is late in the year on purpose, so it survives a ninety day
-- window when Vera's March attendance does not. Vera gets one as well,
-- which gives her two traces of two different kinds. She must still
-- count once, and that is what makes the deduplication testable rather
-- than merely present.
insert into public.participant_stages
  (participant_id, stage, moved_on, note, recorded_by)
select v.pid::uuid, v.stage, v.moved, 'Seeded for Batch 7c', v.rec::uuid
from (values
  ('dddddddd-0000-0000-0000-000000000001','Connect', date '2026-11-10',
   'b0000000-0000-0000-0000-000000000005'),
  ('dddddddd-0000-0000-0000-000000000001','Commit',  date '2026-03-20',
   'b0000000-0000-0000-0000-000000000001')
) as v(pid, stage, moved, rec)
where not exists (
  select 1 from public.participant_stages ps
   where ps.recorded_by = v.rec::uuid and ps.moved_on = v.moved
);

-- Trace 3, mentoring links.
-- Ada's has been open since 2024 and has no end date, which is the point:
-- a link is a state, so she counts in 2026 without anything happening in
-- 2026. Bode's closed in December 2025, so he does not.
--
-- Guarded with not exists rather than on conflict. The unique index on
-- this table only covers links with no end date, so a closed link is not
-- a conflict and would quietly insert again on every rerun.
insert into public.participant_mentors
  (participant_id, mentor_id, assigned_on, ended_on)
select v.pid::uuid, v.mentor::uuid, v.assigned, v.ended
from (values
  ('dddddddd-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001',
   date '2024-01-01', null::date),
  ('dddddddd-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006',
   date '2025-06-01', date '2025-12-01')
) as v(pid, mentor, assigned, ended)
where not exists (
  select 1 from public.participant_mentors pm
   where pm.mentor_id = v.mentor::uuid
);
