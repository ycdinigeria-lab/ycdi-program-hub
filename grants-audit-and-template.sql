-- ============================================================
-- YCDI Programme Hub: Supabase grants audit + template
-- Why: from 30 Oct 2026 Supabase stops auto-granting Data API access
-- on NEW tables in the public schema. Existing tables keep what they have.
-- Source: supabase.com/changelog/45329
--
-- PART 1 is read-only. Run it in the SQL Editor any time. It changes nothing.
-- PART 2 is the block to paste into every new batch from now on.
-- PART 3 is OPTIONAL: lets you rehearse the new behaviour before 30 Oct.
-- ============================================================


-- ------------------------------------------------------------
-- PART 1. Audit (read-only)
-- Shows every table in public, whether RLS is on, and which of the
-- three API roles currently hold table-level rights.
-- Keep the result as your record of what is live today.
-- ------------------------------------------------------------
select
  c.relname                                         as table_name,
  c.relrowsecurity                                  as rls_on,
  coalesce(string_agg(distinct case when g.grantee = 'anon'          then g.privilege_type end, ', '), '') as anon,
  coalesce(string_agg(distinct case when g.grantee = 'authenticated' then g.privilege_type end, ', '), '') as authenticated,
  coalesce(string_agg(distinct case when g.grantee = 'service_role'  then g.privilege_type end, ', '), '') as service_role
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join information_schema.role_table_grants g
       on g.table_schema = 'public'
      and g.table_name   = c.relname
      and g.grantee in ('anon', 'authenticated', 'service_role')
where c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;

-- Anything showing rls_on = false with rights granted to anon or authenticated
-- deserves a look. Anything granted to anon at all deserves a reason.


-- ------------------------------------------------------------
-- PART 2. Template for every new table (paste into the same batch file)
-- Hub convention already used in batches 32 to 35 and 39: revoke first,
-- then grant only what the app really needs. Keep doing that.
-- Replace public.your_table. Delete the lines you do not need.
-- ------------------------------------------------------------

-- alter table public.your_table enable row level security;
--
-- revoke all on public.your_table from anon, authenticated;     -- clean slate
--
-- -- Signed-in people. Match this to your policies:
-- --   read-only table (writes go through security-definer functions):
-- grant select on public.your_table to authenticated;
-- --   table the app writes to directly:
-- -- grant select, insert, update on public.your_table to authenticated;
-- --   never grant delete unless a policy and a real need exist.
--
-- -- Only if a Netlify function (service-role key) touches this table:
-- -- grant select, insert, update, delete on public.your_table to service_role;
--
-- -- anon: leave it out. The Hub has no public table reads. Public forms
-- -- (volunteer application) go through a function with its own execute grant.
--
-- -- Only if the table has a serial / identity column that authenticated
-- -- inserts into directly (new sequence rights are no longer automatic either):
-- -- grant usage on sequence public.your_table_id_seq to authenticated;


-- ------------------------------------------------------------
-- PART 3. OPTIONAL rehearsal (the exact opt-in Supabase publishes)
-- Run this ONLY if you want to see the new behaviour now instead of on
-- 30 Oct. It flips the default for tables created AFTER you run it.
-- Existing tables are not touched. Do not run it in the middle of a batch.
-- ------------------------------------------------------------

-- alter default privileges for role postgres in schema public
--   revoke select, insert, update, delete on tables from anon, authenticated, service_role;
--
-- alter default privileges for role postgres in schema public
--   revoke usage, select on sequences from anon, authenticated, service_role;
