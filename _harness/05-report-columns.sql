-- Harness only. Never run this against Supabase.
--
-- BATCH5-MARKER harness-report-columns
--
-- The mock in 00-supabase-mock.sql gives `reports` four columns, which was
-- enough while the tests were about permissions. Batch 5 reads attendance,
-- expenditure and school figures out of that table, so the mock has to
-- carry them too or the KPI functions cannot be tested at all.
--
-- These match the columns the live table already has, created when the
-- post-programme report form was built. Nothing here changes production.

alter table public.reports
  add column if not exists attendance          integer default 0,
  add column if not exists male_count          integer default 0,
  add column if not exists female_count        integer default 0,
  add column if not exists schools_represented text,
  add column if not exists volunteers_deployed integer default 0,
  add column if not exists budget_approved     numeric default 0,
  add column if not exists actual_expenditure  numeric default 0;

-- The live `programs` table carries the school the programme was held at
-- and the money. The mock has both already, so nothing to add there.
