-- ============================================================
-- BATCH 41: explicit table grants (Supabase Data API change, 30 Oct 2026)
-- ============================================================
-- From 30 Oct 2026 Supabase stops auto-granting Data API access on NEW
-- tables in public. Tables that exist keep their rights. This batch makes
-- the repo say, in writing, what the live database already holds, so a
-- rebuild (new project, preview branch, local reset) does not depend on
-- Supabase's old defaults.
--
-- Source of truth: the grants audit run on the live project on 20 Oct 2026
-- (70 public tables, RLS on for all of them).
--
-- TWO PARTS, and they behave differently:
--
--   PART A  Restates what authenticated and service_role already hold.
--           Select/insert/update/delete only. On the live project this
--           changes nothing (every grant below is already in place).
--
--   PART B  Takes everything away from the anon role, on every table,
--           then gives anon back INSERT on client_errors (the crash log
--           takes reports from signed-out screens, policy cerr_insert).
--           This is the one real change. The Hub has no signed-out table
--           reads, so nothing the app does should notice. RLS was already
--           refusing anon; this removes the second lock being left open.
--
-- Safe to run twice. Tables that do not exist yet in a given database
-- (a rebuild from the repo is missing some, see the note in the Hub memo
-- about batches 24 to 27 and 30) are skipped with a notice, not an error.
--
-- NOT touched on purpose: TRUNCATE, TRIGGER and REFERENCES rights that
-- authenticated and service_role still hold from the old defaults. The
-- Data API cannot use them. Say the word if you want them stripped too.
--
-- ROLLBACK for Part B (puts anon back exactly as audited, not recommended):
--   grant all on all tables in schema public to anon;
--   (then re-run the batch-specific revokes you want to keep)
-- ============================================================

begin;

-- ---------- PART A: restate authenticated + service_role --------------
do $$
declare r record;
begin
  for r in select * from (values
    ('announcement_comments'      , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('announcement_reactions'     , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('announcements'              , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('annual_budgets'             , 'select'                        , 'select, insert, update, delete'),
    ('audience_contacts'          , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('audit_log'                  , 'select'                        , 'select, insert, update, delete'),
    ('budget_lines'               , 'select'                        , 'select, insert, update, delete'),
    ('channel_members'            , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('channel_reads'              , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('channels'                   , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('chapters'                   , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('client_errors'              , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('content_items'              , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('data_breaches'              , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('data_subject_requests'      , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('directory_contacts'         , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('directory_members'          , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('document_categories'        , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('documents'                  , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('donations'                  , 'select'                        , 'select, insert, update, delete'),
    ('email_campaign_recipients'  , ''                              , 'select, insert, update, delete'),
    ('email_campaigns'            , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('email_outbox'               , 'select'                        , 'select, insert, update, delete'),
    ('email_providers'            , 'select, update'                , 'select, insert, update, delete'),
    ('email_senders'              , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('email_suppressions'         , 'select'                        , 'select, insert, update, delete'),
    ('events'                     , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('expense_claims'             , 'select'                        , 'select, insert, update, delete'),
    ('expense_receipts'           , 'select'                        , 'select, insert, update, delete'),
    ('finance_budgets'            , 'select'                        , 'select, insert, update, delete'),
    ('finance_events'             , 'select'                        , 'select, insert, update, delete'),
    ('grant_obligations'          , 'select'                        , 'select, insert, update, delete'),
    ('grants'                     , 'select'                        , 'select, insert, update, delete'),
    ('guardian_accounts'          , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('incident_actions'           , 'select, insert'                , 'select, insert, update, delete'),
    ('interview_records'          , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('kpi_settings'               , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('kpi_targets'                , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('messages'                   , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('nec_portfolios'             , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('notification_prefs'         , 'select'                        , 'select, insert, update, delete'),
    ('notifications'              , 'select'                        , 'select, insert, update, delete'),
    ('participant_accounts'       , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('participant_attendance'     , 'select, insert, update'        , 'select, insert, update, delete'),
    ('participant_consents'       , 'select, insert, update'        , 'select, insert, update, delete'),
    ('participant_dm_messages'    , 'select, insert, update'        , 'select, insert, update, delete'),
    ('participant_guardians'      , 'select, insert, update'        , 'select, insert, update, delete'),
    ('participant_mentors'        , 'select, insert, update'        , 'select, insert, update, delete'),
    ('participant_stages'         , 'select, insert, update'        , 'select, insert, update, delete'),
    ('participant_touchpoints'    , 'select, insert, update'        , 'select, insert, update, delete'),
    ('participants'               , 'select, insert, update'        , 'select, insert, update, delete'),
    ('pending_signups'            , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('prayer_chapters'            , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('prayer_parts'               , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('prayer_schedule_notes'      , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('profiles'                   , 'select, insert, delete'        , 'select, insert, update, delete'),
    ('programs'                   , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('reference_checks'           , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('reports'                    , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('safeguarding_declarations'  , 'select, insert'                , 'select, insert, update, delete'),
    ('safeguarding_incidents'     , 'select, insert, update'        , 'select, insert, update, delete'),
    ('safeguarding_training'      , 'select, insert'                , 'select, insert, update, delete'),
    ('stipend_payments'           , 'select'                        , 'select, insert, update, delete'),
    ('stipend_recipients'         , 'select'                        , 'select, insert, update, delete'),
    ('submissions'                , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('volunteer_applications'     , 'select, delete'                , 'select, insert, update, delete'),
    ('volunteer_record_roles'     , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('volunteer_records'          , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('volunteer_roles'            , 'select, insert, update, delete', 'select, insert, update, delete'),
    ('volunteer_screening'        , 'select, insert, update'        , 'select, insert, update, delete')
  ) as v(tbl, auth_privs, svc_privs)
  loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'batch41: public.% not found, skipped', r.tbl;
      continue;
    end if;
    if r.auth_privs <> '' then
      execute format('grant %s on public.%I to authenticated', r.auth_privs, r.tbl);
    end if;
    if r.svc_privs <> '' then
      execute format('grant %s on public.%I to service_role', r.svc_privs, r.tbl);
    end if;
  end loop;
end $$;

-- ---------- PART B: anon gets nothing, except the crash log -----------
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;

do $$
begin
  if to_regclass('public.client_errors') is not null then
    grant insert on public.client_errors to anon;
  end if;
end $$;

commit;

-- ---------- check (read-only): anon should now show only client_errors ----
-- select table_name, string_agg(privilege_type, ', ') as anon_rights
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'anon'
-- group by table_name order by table_name;
