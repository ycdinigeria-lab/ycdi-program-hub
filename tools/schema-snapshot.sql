-- ======================================================================
-- tools/schema-snapshot.sql                         BATCH36-MARKER snapshot
--
-- Reads the LIVE database and writes out, as SQL, what is actually there:
-- tables, their constraints, row level security, policies, indexes,
-- triggers, views, functions and grants.
--
-- Why this exists. The repo and the live project have drifted apart:
-- Batch 30 (email campaign sending) is live but its SQL file was never
-- committed. This recovers the real definitions rather than a guess at
-- them. It also gives a record the project could be rebuilt from.
--
-- It only READS. It creates nothing, changes nothing, and touches no
-- personal data: it reads the catalogue (the database's description of
-- itself), never a table's rows.
--
-- HOW TO RUN IT (no command line needed)
--   1. Supabase dashboard > SQL Editor > New query.
--   2. Paste in ONE of the two queries below (A or B), not the whole file.
--   3. Run. You get one row with one cell called "snapshot".
--   4. Export the result as CSV (the export/download button above the
--      results) and attach the file in the chat. Claude turns it into a
--      clean .sql file for the repo.
--   Query A is small and is the one needed now. Query B is the whole
--   database and is worth running once as a baseline.
--
-- The output is a RECORD of what is live. Do not run the output back
-- against the live project.
-- ======================================================================


-- ----------------------------------------------------------------------
-- QUERY A: Batch 30 recovery (email campaign sending)
-- Copy from here down to the first "end of query A" line.
-- ----------------------------------------------------------------------
with params as (
  select array[
    -- tables
    'email_campaigns','email_campaign_recipients','email_providers','email_senders',
    -- functions
    'approve_campaign','campaign_allowance','campaign_progress','cancel_campaign',
    'claim_campaign_batch','record_batch_results','record_delivery_event',
    'record_unsubscribe','release_batch','return_campaign','start_campaign',
    'submit_campaign','audience_segment_recipients'
  ]::text[] as only
),
tbl as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, params
  where n.nspname = 'public' and c.relkind in ('r','p')
    and (params.only is null or c.relname = any(params.only))
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
fn as (
  select p.oid, p.proname, p.proacl,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace, params
  where n.nspname = 'public' and p.prokind in ('f','p')
    and (params.only is null or p.proname = any(params.only))
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
parts as (
  -- 1. enum types used in public
  select 10 as sec, t.typname::text as k,
    'do $e$ begin create type public.' || quote_ident(t.typname) || ' as enum (' ||
    (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid) ||
    '); exception when duplicate_object then null; end $e$;' as ddl
  from pg_type t join pg_namespace n on n.oid = t.typnamespace, params
  where n.nspname = 'public' and t.typtype = 'e' and params.only is null
  union all
  -- 2. tables, columns, and every constraint except foreign keys
  -- sequences behind serial/bigserial columns, before the tables use them
  select 15, c.relname,
    'create sequence if not exists public.' || quote_ident(c.relname) || ';'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, params
  where n.nspname = 'public' and c.relkind = 'S'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('i','e'))
    and (params.only is null or exists (
          select 1 from pg_depend d join pg_class t on t.oid = d.refobjid
          where d.objid = c.oid and d.deptype = 'a' and t.relname = any(params.only)))
  union all
  -- which column owns each sequence, once the tables exist
  select 25, c.relname,
    'alter sequence public.' || quote_ident(c.relname) || ' owned by public.' ||
    quote_ident(t.relname) || '.' || quote_ident(a.attname) || ';'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_depend d on d.objid = c.oid and d.deptype = 'a' and d.classid = 'pg_class'::regclass
  join pg_class t on t.oid = d.refobjid
  join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
  join tbl on tbl.oid = t.oid
  where n.nspname = 'public' and c.relkind = 'S'
  union all
  select 20, tbl.relname,
    'create table if not exists public.' || quote_ident(tbl.relname) || E' (\n' ||
    coalesce((select string_agg('  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) ||
        case when a.attidentity = 'a' then ' generated always as identity'
             when a.attidentity = 'd' then ' generated by default as identity' else '' end ||
        case when a.attgenerated = 's' then ' generated always as (' || pg_get_expr(d.adbin, d.adrelid) || ') stored'
             when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end ||
        case when a.attnotnull then ' not null' else '' end,
        E',\n' order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = tbl.oid and a.attnum > 0 and not a.attisdropped), '') ||
    coalesce((select E',\n' || string_agg('  constraint ' || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid),
        E',\n' order by case con.contype when 'p' then 1 when 'u' then 2 when 'x' then 3 else 4 end, con.conname)
      from pg_constraint con where con.conrelid = tbl.oid and con.contype in ('p','u','c','x')), '') ||
    E'\n);'
  from tbl
  union all
  -- 3. foreign keys, after every table exists
  select 30, tbl.relname || '.' || con.conname,
    'alter table public.' || quote_ident(tbl.relname) || ' add constraint ' || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid) || ';'
  from tbl join pg_constraint con on con.conrelid = tbl.oid and con.contype = 'f'
  union all
  -- 4. functions (bodies are not checked on the way in, see header line)
  select 40, fn.sig, pg_get_functiondef(fn.oid) || ';'
  from fn
  union all
  -- 5. views
  select 50, c.relname,
    'create or replace view public.' || quote_ident(c.relname) || E' as\n' || pg_get_viewdef(c.oid, true)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, params
  where n.nspname = 'public' and c.relkind = 'v' and params.only is null
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  union all
  -- 6. row level security switches
  select 60, tbl.relname,
    'alter table public.' || quote_ident(tbl.relname) || ' enable row level security;' ||
    case when tbl.relforcerowsecurity then E'\nalter table public.' || quote_ident(tbl.relname) || ' force row level security;' else '' end
  from tbl where tbl.relrowsecurity
  union all
  -- 7. policies
  select 70, pol.tablename || '.' || pol.policyname,
    'create policy ' || quote_ident(pol.policyname) || ' on public.' || quote_ident(pol.tablename) ||
    ' as ' || lower(pol.permissive) || ' for ' || lower(pol.cmd) ||
    ' to ' || array_to_string(pol.roles, ', ') ||
    coalesce(E'\n  using (' || pol.qual || ')', '') ||
    coalesce(E'\n  with check (' || pol.with_check || ')', '') || ';'
  from pg_policies pol join tbl on tbl.relname = pol.tablename
  where pol.schemaname = 'public'
  union all
  -- 8. indexes that are not already made by a constraint above
  select 80, i.indexname, i.indexdef || ';'
  from pg_indexes i join tbl on tbl.relname = i.tablename
  where i.schemaname = 'public'
    and not exists (select 1 from pg_constraint con
                    where con.conindid = (quote_ident(i.schemaname) || '.' || quote_ident(i.indexname))::regclass)
  union all
  -- 9. triggers
  select 90, tbl.relname || '.' || tg.tgname, pg_get_triggerdef(tg.oid, true) || ';'
  from tbl join pg_trigger tg on tg.tgrelid = tbl.oid and not tg.tgisinternal
  union all
  -- 10. table grants, stated in full so the record is exact
  select 100, tbl.relname,
    'revoke all on public.' || quote_ident(tbl.relname) || ' from public, anon, authenticated;' ||
    coalesce((select string_agg(E'\ngrant ' || g.privs || ' on public.' || quote_ident(tbl.relname) || ' to ' || g.who || ';', '' order by g.who)
      from (select case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as who,
                   string_agg(lower(x.privilege_type), ', ' order by x.privilege_type) as privs
            from aclexplode(tbl.relacl) x
            where x.grantee = 0 or x.grantee::regrole::text in ('anon','authenticated')
            group by 1) g), '')
  from tbl
  union all
  -- 11. function grants
  select 110, fn.sig,
    'revoke all on function public.' || fn.sig || ' from public, anon, authenticated;' ||
    coalesce((select string_agg(E'\ngrant execute on function public.' || fn.sig || ' to ' ||
                case when x.grantee = 0 then 'public' else x.grantee::regrole::text end || ';', '' order by x.grantee)
      from aclexplode(coalesce(fn.proacl, acldefault('f', (select proowner from pg_proc where oid = fn.oid)))) x
      where x.privilege_type = 'EXECUTE'
        and (x.grantee = 0 or x.grantee::regrole::text in ('anon','authenticated'))), '')
  from fn
)
select
  E'-- Schema snapshot taken ' || to_char(now() at time zone 'Africa/Lagos', 'YYYY-MM-DD HH24:MI') || E' (Lagos)\n' ||
  E'-- A record of what is live. Do not run it against the live project.\n' ||
  E'set check_function_bodies = off;\n\n' ||
  coalesce(string_agg(ddl, E'\n\n' order by sec, k),
           '-- Nothing matched. None of the named tables or functions exist in this project.') as snapshot
from parts;
-- end of query A


-- ----------------------------------------------------------------------
-- QUERY B: the whole public schema
-- Identical to query A except for the one line marked CHANGED.
-- Copy from here down to "end of query B".
-- ----------------------------------------------------------------------
with params as (
  select null::text[] as only    -- CHANGED: no list means everything
),
tbl as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, params
  where n.nspname = 'public' and c.relkind in ('r','p')
    and (params.only is null or c.relname = any(params.only))
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
fn as (
  select p.oid, p.proname, p.proacl,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace, params
  where n.nspname = 'public' and p.prokind in ('f','p')
    and (params.only is null or p.proname = any(params.only))
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
parts as (
  select 10 as sec, t.typname::text as k,
    'do $e$ begin create type public.' || quote_ident(t.typname) || ' as enum (' ||
    (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid) ||
    '); exception when duplicate_object then null; end $e$;' as ddl
  from pg_type t join pg_namespace n on n.oid = t.typnamespace, params
  where n.nspname = 'public' and t.typtype = 'e' and params.only is null
  union all
  -- sequences behind serial/bigserial columns, before the tables use them
  select 15, c.relname,
    'create sequence if not exists public.' || quote_ident(c.relname) || ';'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, params
  where n.nspname = 'public' and c.relkind = 'S'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('i','e'))
    and (params.only is null or exists (
          select 1 from pg_depend d join pg_class t on t.oid = d.refobjid
          where d.objid = c.oid and d.deptype = 'a' and t.relname = any(params.only)))
  union all
  -- which column owns each sequence, once the tables exist
  select 25, c.relname,
    'alter sequence public.' || quote_ident(c.relname) || ' owned by public.' ||
    quote_ident(t.relname) || '.' || quote_ident(a.attname) || ';'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_depend d on d.objid = c.oid and d.deptype = 'a' and d.classid = 'pg_class'::regclass
  join pg_class t on t.oid = d.refobjid
  join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
  join tbl on tbl.oid = t.oid
  where n.nspname = 'public' and c.relkind = 'S'
  union all
  select 20, tbl.relname,
    'create table if not exists public.' || quote_ident(tbl.relname) || E' (\n' ||
    coalesce((select string_agg('  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) ||
        case when a.attidentity = 'a' then ' generated always as identity'
             when a.attidentity = 'd' then ' generated by default as identity' else '' end ||
        case when a.attgenerated = 's' then ' generated always as (' || pg_get_expr(d.adbin, d.adrelid) || ') stored'
             when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end ||
        case when a.attnotnull then ' not null' else '' end,
        E',\n' order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = tbl.oid and a.attnum > 0 and not a.attisdropped), '') ||
    coalesce((select E',\n' || string_agg('  constraint ' || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid),
        E',\n' order by case con.contype when 'p' then 1 when 'u' then 2 when 'x' then 3 else 4 end, con.conname)
      from pg_constraint con where con.conrelid = tbl.oid and con.contype in ('p','u','c','x')), '') ||
    E'\n);'
  from tbl
  union all
  select 30, tbl.relname || '.' || con.conname,
    'alter table public.' || quote_ident(tbl.relname) || ' add constraint ' || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid) || ';'
  from tbl join pg_constraint con on con.conrelid = tbl.oid and con.contype = 'f'
  union all
  select 40, fn.sig, pg_get_functiondef(fn.oid) || ';'
  from fn
  union all
  select 50, c.relname,
    'create or replace view public.' || quote_ident(c.relname) || E' as\n' || pg_get_viewdef(c.oid, true)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, params
  where n.nspname = 'public' and c.relkind = 'v' and params.only is null
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  union all
  select 60, tbl.relname,
    'alter table public.' || quote_ident(tbl.relname) || ' enable row level security;' ||
    case when tbl.relforcerowsecurity then E'\nalter table public.' || quote_ident(tbl.relname) || ' force row level security;' else '' end
  from tbl where tbl.relrowsecurity
  union all
  select 70, pol.tablename || '.' || pol.policyname,
    'create policy ' || quote_ident(pol.policyname) || ' on public.' || quote_ident(pol.tablename) ||
    ' as ' || lower(pol.permissive) || ' for ' || lower(pol.cmd) ||
    ' to ' || array_to_string(pol.roles, ', ') ||
    coalesce(E'\n  using (' || pol.qual || ')', '') ||
    coalesce(E'\n  with check (' || pol.with_check || ')', '') || ';'
  from pg_policies pol join tbl on tbl.relname = pol.tablename
  where pol.schemaname = 'public'
  union all
  select 80, i.indexname, i.indexdef || ';'
  from pg_indexes i join tbl on tbl.relname = i.tablename
  where i.schemaname = 'public'
    and not exists (select 1 from pg_constraint con
                    where con.conindid = (quote_ident(i.schemaname) || '.' || quote_ident(i.indexname))::regclass)
  union all
  select 90, tbl.relname || '.' || tg.tgname, pg_get_triggerdef(tg.oid, true) || ';'
  from tbl join pg_trigger tg on tg.tgrelid = tbl.oid and not tg.tgisinternal
  union all
  select 100, tbl.relname,
    'revoke all on public.' || quote_ident(tbl.relname) || ' from public, anon, authenticated;' ||
    coalesce((select string_agg(E'\ngrant ' || g.privs || ' on public.' || quote_ident(tbl.relname) || ' to ' || g.who || ';', '' order by g.who)
      from (select case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as who,
                   string_agg(lower(x.privilege_type), ', ' order by x.privilege_type) as privs
            from aclexplode(tbl.relacl) x
            where x.grantee = 0 or x.grantee::regrole::text in ('anon','authenticated')
            group by 1) g), '')
  from tbl
  union all
  select 110, fn.sig,
    'revoke all on function public.' || fn.sig || ' from public, anon, authenticated;' ||
    coalesce((select string_agg(E'\ngrant execute on function public.' || fn.sig || ' to ' ||
                case when x.grantee = 0 then 'public' else x.grantee::regrole::text end || ';', '' order by x.grantee)
      from aclexplode(coalesce(fn.proacl, acldefault('f', (select proowner from pg_proc where oid = fn.oid)))) x
      where x.privilege_type = 'EXECUTE'
        and (x.grantee = 0 or x.grantee::regrole::text in ('anon','authenticated'))), '')
  from fn
)
select
  E'-- Schema snapshot taken ' || to_char(now() at time zone 'Africa/Lagos', 'YYYY-MM-DD HH24:MI') || E' (Lagos)\n' ||
  E'-- A record of what is live. Do not run it against the live project.\n' ||
  E'set check_function_bodies = off;\n\n' ||
  coalesce(string_agg(ddl, E'\n\n' order by sec, k),
           '-- Nothing matched. None of the named tables or functions exist in this project.') as snapshot
from parts;
-- end of query B


-- ----------------------------------------------------------------------
-- OPTIONAL QUERY C: scheduled jobs (only if pg_cron is switched on).
-- If this errors with "relation cron.job does not exist", pg_cron is
-- off and the daily digest and quiet-participant nudges are not running.
-- That is worth knowing too.
-- ----------------------------------------------------------------------
-- select jobname, schedule, command, active from cron.job order by jobname;
