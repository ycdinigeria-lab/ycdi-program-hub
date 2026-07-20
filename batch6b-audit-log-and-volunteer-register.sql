-- ============================================================
-- YCDI Programme Hub - Batch 6b
-- Audit log, and the coordinator's volunteer register
--
-- Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run more than once. Read the Messages panel afterwards.
--
-- BATCH6B-MARKER audit-and-register
--
-- Two things happen here.
--
-- A. An audit log. Until now the hub could tell you what a record says
--    today and nothing about how it got that way. Somebody's role can
--    change, an incident can be closed, a KPI target can be edited, and
--    afterwards there is no honest answer to "who did that and when".
--    That is a governance gap rather than a feature gap: YCDI-GOV and
--    YCDI-SAF both assume decisions are traceable.
--
--    Four things are recorded, and only four:
--      1. Role, chapter and admin-rights changes on a profile.
--      2. Safeguarding actions. Incident raised, status moved, referral
--         made, suspension applied, incident closed, action logged.
--      3. KPI target changes.
--      4. Volunteer status changes, including deactivation.
--
--    Two rules shape the whole design.
--
--    The log is append-only. There is no update policy and no delete
--    policy, and a trigger refuses both outright, so a log that can be
--    tidied up afterwards is not a log.
--
--    The log stores no safeguarding content. It records that incident
--    SG-2026-004 moved from Open to Referred, and who moved it. It does
--    not record the child's account, description, or age band. An audit
--    trail readable by the National Coordinator and admins must not
--    become a second copy of the case file, because the safeguarding
--    tables deliberately exclude admins under YCDI-SAF-004 and copying
--    the contents here would walk straight round that.
--
-- B. The volunteer register. Batch 6a built the volunteer record and
--    gave each person a read-only view of their own. There was no way
--    for a coordinator to put anybody on it, so the tables are empty.
--    This adds the two functions the register screen reads: the list of
--    people in scope with their record attached, and the counts.
--
--    Writing is not done through a function. Batch 6a already gave
--    coordinators insert and update rights on volunteer_records under
--    row security, tested by role-switching, so the screen writes to
--    the table directly and inherits those rules rather than getting a
--    second set of rules that could drift away from the first.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers, re-declared so this file stands on its own
-- ------------------------------------------------------------
create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

create or replace function public.chapter_of_profile(p_profile uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = p_profile
$$;

-- ============================================================
-- A. The audit log
-- ============================================================

-- Names are copied onto the row rather than joined at read time. Two
-- reasons. A person can be renamed, and a log that quietly re-labels a
-- three-year-old entry with today's name is not evidence of anything.
-- And a person can be deleted, at which point a joined name becomes
-- blank and the entry stops meaning anything at all.
create table if not exists public.audit_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),

  actor_id      uuid,          -- no foreign key on purpose, see above
  actor_name    text,
  actor_role    text,

  entity        text not null
                check (entity in ('profile','safeguarding','kpi_target','volunteer')),
  entity_id     text,          -- text, because kpi_targets has a composite key
  chapter_id    uuid,

  subject_id    uuid,
  subject_name  text,

  action        text not null, -- short machine key, e.g. 'role_changed'
  field         text,
  old_value     text,
  new_value     text,
  detail        text
);

comment on table public.audit_log is
  'Append-only record of role and access changes, safeguarding actions, KPI target edits and volunteer status changes. Holds no safeguarding case content by design.';

create index if not exists audit_log_time_idx    on public.audit_log (occurred_at desc);
create index if not exists audit_log_entity_idx  on public.audit_log (entity, occurred_at desc);
create index if not exists audit_log_subject_idx on public.audit_log (subject_id);

-- Append-only, enforced twice.
--
-- Once in row security, by simply never creating an update or a delete
-- policy. And once in a trigger, because row security does not apply to
-- the table owner, and every writer below is a security definer function
-- running as the owner. Without the trigger, a future definer function
-- with a careless line in it could quietly rewrite history.
create or replace function public.audit_log_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The audit log is append-only. Entries cannot be % once written.',
    case tg_op when 'DELETE' then 'deleted' else 'changed' end;
end;
$$;

drop trigger if exists audit_log_no_rewrite on public.audit_log;
create trigger audit_log_no_rewrite
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

-- The row-level trigger above only fires once there is a row to fire on,
-- so `delete from audit_log where id = 999` against a row that does not
-- exist comes back reporting success. Nothing was lost, but somebody
-- reading that output would reasonably conclude the log can be deleted
-- from. This one fires on the attempt itself, whether or not it would
-- have matched anything.
drop trigger if exists audit_log_no_rewrite_stmt on public.audit_log;
create trigger audit_log_no_rewrite_stmt
  before update or delete on public.audit_log
  for each statement execute function public.audit_log_is_append_only();

alter table public.audit_log enable row level security;

drop policy if exists audit_read   on public.audit_log;
drop policy if exists audit_insert on public.audit_log;
drop policy if exists audit_update on public.audit_log;
drop policy if exists audit_delete on public.audit_log;

-- Read: the National Coordinator and admins. Not Regional Coordinators.
-- The log carries national access changes and safeguarding movements
-- across every chapter, and chapter-scoping it would leave a coordinator
-- reading half a sentence.
create policy audit_read on public.audit_log
  for select to authenticated using (
    public.is_admin() or public.dir_role() = 'NC'
  );

-- No insert policy is created. Nothing signed in writes here by hand.
-- Entries arrive only through the triggers below, which run as the table
-- owner and are therefore not subject to row security at all.

grant select on public.audit_log to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

-- One place that writes an entry, so the shape of a row is decided once.
create or replace function public.audit_write(
  p_entity      text,
  p_action      text,
  p_entity_id   text    default null,
  p_subject_id  uuid    default null,
  p_chapter_id  uuid    default null,
  p_field       text    default null,
  p_old         text    default null,
  p_new         text    default null,
  p_detail      text    default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
  v_role  text;
  v_sname text;
begin
  select full_name, role into v_name, v_role from public.profiles where id = v_actor;
  if p_subject_id is not null then
    select full_name into v_sname from public.profiles where id = p_subject_id;
  end if;

  insert into public.audit_log (
    actor_id, actor_name, actor_role,
    entity, entity_id, chapter_id,
    subject_id, subject_name,
    action, field, old_value, new_value, detail
  ) values (
    v_actor,
    -- A change made by a database script or a trigger with nobody signed
    -- in still gets recorded, labelled honestly rather than blamed on
    -- whoever happens to be nearby.
    coalesce(v_name, case when v_actor is null then 'System' else 'Unknown account' end),
    v_role,
    p_entity, p_entity_id, p_chapter_id,
    p_subject_id, v_sname,
    p_action, p_field, p_old, p_new, p_detail
  );
end;
$$;

-- ------------------------------------------------------------
-- A1. Profiles: role, chapter and admin rights
-- ------------------------------------------------------------
-- These three fields decide what every other screen will show a person,
-- so a change to any of them is an access change and belongs in the log
-- whoever made it.
create or replace function public.audit_profile_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old_chapter text;
  v_new_chapter text;
begin
  if tg_op = 'DELETE' then
    perform public.audit_write(
      'profile', 'account_removed', old.id::text, old.id, old.chapter_id,
      null, null, null, old.full_name || ' was removed from the hub.'
    );
    return old;
  end if;

  if new.role is distinct from old.role then
    perform public.audit_write(
      'profile', 'role_changed', new.id::text, new.id, new.chapter_id,
      'role', old.role, new.role, null
    );
  end if;

  if new.chapter_id is distinct from old.chapter_id then
    select name into v_old_chapter from public.chapters where id = old.chapter_id;
    select name into v_new_chapter from public.chapters where id = new.chapter_id;
    perform public.audit_write(
      'profile', 'chapter_changed', new.id::text, new.id, new.chapter_id,
      'chapter', coalesce(v_old_chapter, 'none'), coalesce(v_new_chapter, 'none'), null
    );
  end if;

  if new.is_admin is distinct from old.is_admin then
    perform public.audit_write(
      'profile',
      case when new.is_admin then 'admin_granted' else 'admin_removed' end,
      new.id::text, new.id, new.chapter_id,
      'is_admin', old.is_admin::text, new.is_admin::text, null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after update or delete on public.profiles
  for each row execute function public.audit_profile_change();

-- ------------------------------------------------------------
-- A2. Safeguarding
-- ------------------------------------------------------------
-- Nothing below copies the account, the child description, the age band,
-- the location or the outcome text. Only the reference, the chapter, and
-- what moved. Read the note at the top of this file for why.
create or replace function public.audit_safeguarding_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref text := coalesce(new.reference, new.id::text);
begin
  if tg_op = 'INSERT' then
    perform public.audit_write(
      'safeguarding', 'incident_raised', v_ref, null, new.chapter_id,
      null, null, new.status, 'Scenario: ' || new.scenario
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.audit_write(
      'safeguarding', 'status_changed', v_ref, null, new.chapter_id,
      'status', old.status, new.status, null
    );
  end if;

  if new.accused_suspended is distinct from old.accused_suspended then
    perform public.audit_write(
      'safeguarding',
      case when new.accused_suspended then 'suspension_applied' else 'suspension_lifted' end,
      v_ref, null, new.chapter_id,
      'accused_suspended', old.accused_suspended::text, new.accused_suspended::text, null
    );
  end if;

  if new.referred_at is distinct from old.referred_at and new.referred_at is not null then
    perform public.audit_write(
      'safeguarding', 'referred', v_ref, null, new.chapter_id,
      null, null, null, 'Referred to ' || coalesce(new.referred_to, 'an external agency') || '.'
    );
  end if;

  if new.nc_notified_at is distinct from old.nc_notified_at and new.nc_notified_at is not null then
    perform public.audit_write(
      'safeguarding', 'nc_notified', v_ref, null, new.chapter_id,
      null, null, null, null
    );
  end if;

  if new.closed_at is distinct from old.closed_at and new.closed_at is not null then
    perform public.audit_write(
      'safeguarding', 'incident_closed', v_ref, null, new.chapter_id,
      null, null, null, null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_safeguarding on public.safeguarding_incidents;
create trigger audit_safeguarding
  after insert or update on public.safeguarding_incidents
  for each row execute function public.audit_safeguarding_change();

-- The action label only. The detail field on an incident action is free
-- text written by a coordinator and routinely contains case content.
create or replace function public.audit_incident_action()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref  text;
  v_chap uuid;
begin
  select coalesce(reference, id::text), chapter_id into v_ref, v_chap
  from public.safeguarding_incidents where id = new.incident_id;

  perform public.audit_write(
    'safeguarding', 'action_logged', v_ref, null, v_chap,
    null, null, null, new.action
  );
  return new;
end;
$$;

drop trigger if exists audit_incident_actions on public.incident_actions;
create trigger audit_incident_actions
  after insert on public.incident_actions
  for each row execute function public.audit_incident_action();

-- ------------------------------------------------------------
-- A3. KPI targets
-- ------------------------------------------------------------
-- A target that moves quietly turns a missed year into a met one. The
-- annual figure is the one funders read, so it is the one recorded.
create or replace function public.audit_kpi_target_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  if tg_op = 'DELETE' then
    v_key := old.financial_year::text || ':' || old.kpi_key;
    perform public.audit_write(
      'kpi_target', 'target_removed', v_key, null, null,
      'annual_target', old.annual_target::text, null, null
    );
    return old;
  end if;

  v_key := new.financial_year::text || ':' || new.kpi_key;

  if tg_op = 'INSERT' then
    perform public.audit_write(
      'kpi_target', 'target_set', v_key, null, null,
      'annual_target', null, new.annual_target::text, null
    );
    return new;
  end if;

  if new.annual_target is distinct from old.annual_target then
    perform public.audit_write(
      'kpi_target', 'target_changed', v_key, null, null,
      'annual_target', old.annual_target::text, new.annual_target::text, null
    );
  end if;

  if new.baseline is distinct from old.baseline then
    perform public.audit_write(
      'kpi_target', 'baseline_changed', v_key, null, null,
      'baseline', old.baseline::text, new.baseline::text, null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_kpi_targets on public.kpi_targets;
create trigger audit_kpi_targets
  after insert or update or delete on public.kpi_targets
  for each row execute function public.audit_kpi_target_change();

-- ------------------------------------------------------------
-- A4. Volunteer status, including deactivation
-- ------------------------------------------------------------
create or replace function public.audit_volunteer_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_chap uuid := public.chapter_of_profile(new.profile_id);
begin
  if tg_op = 'INSERT' then
    perform public.audit_write(
      'volunteer', 'record_created', new.id::text, new.profile_id, v_chap,
      'status', null, new.status, null
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.audit_write(
      'volunteer', 'status_changed', new.id::text, new.profile_id, v_chap,
      'status', old.status, new.status,
      case when new.ended_reason is distinct from old.ended_reason then new.ended_reason else null end
    );
  end if;

  if new.mentor_profile_id is distinct from old.mentor_profile_id then
    perform public.audit_write(
      'volunteer', 'mentor_changed', new.id::text, new.profile_id, v_chap,
      'mentor',
      (select full_name from public.profiles where id = old.mentor_profile_id),
      (select full_name from public.profiles where id = new.mentor_profile_id),
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_volunteer_records on public.volunteer_records;
create trigger audit_volunteer_records
  after insert or update on public.volunteer_records
  for each row execute function public.audit_volunteer_change();

-- ============================================================
-- B. The volunteer register
-- ============================================================

-- Everybody the caller is allowed to see, whether or not they have a
-- volunteer record yet.
--
-- People without a record are the point of this function. A register
-- that only lists people already on it gives a coordinator no way to add
-- the next one, and the first run of this screen will be almost entirely
-- people with no record at all.
--
-- Scoping repeats the rule the volunteer_records policies already use:
-- own chapter for a Regional Coordinator, everything for the National
-- Coordinator and admins. It is repeated rather than shared because this
-- function reaches profiles, which everyone can read, so the policy on
-- volunteer_records does not constrain it.
create or replace function public.volunteer_register()
returns table (
  profile_id            uuid,
  full_name             text,
  chapter_id            uuid,
  chapter_name          text,
  hub_role              text,
  record_id             uuid,
  status                text,
  started_on            date,
  ended_on              date,
  ended_reason          text,
  applied_on            date,
  interviewed_on        date,
  references_received_on date,
  safeguarding_declaration_on date,
  orientation_on        date,
  activated_on          date,
  last_contact_on       date,
  certificate_issued_on date,
  availability          text,
  skills                text,
  notes                 text,
  mentor_profile_id     uuid,
  mentor_name           text,
  role_names            text[]
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.chapter_id, ch.name, p.role,
    v.id, v.status, v.started_on, v.ended_on, v.ended_reason,
    v.applied_on, v.interviewed_on, v.references_received_on,
    v.safeguarding_declaration_on, v.orientation_on, v.activated_on,
    v.last_contact_on, v.certificate_issued_on,
    v.availability, v.skills, v.notes,
    v.mentor_profile_id, mp.full_name,
    coalesce(
      (select array_agg(r.name order by r.sort_order)
       from public.volunteer_record_roles vr
       join public.volunteer_roles r on r.id = vr.role_id
       where vr.record_id = v.id),
      array[]::text[]
    )
  from public.profiles p
  left join public.chapters ch on ch.id = p.chapter_id
  left join public.volunteer_records v on v.profile_id = p.id
  left join public.profiles mp on mp.id = v.mentor_profile_id
  where
    public.is_admin()
    or public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and p.chapter_id = public.dir_chapter())
  order by p.full_name
$$;

grant execute on function public.volunteer_register() to authenticated;

-- Counts for the top of the screen. Built from the same function so the
-- headline number and the list underneath can never disagree.
create or replace function public.volunteer_summary()
returns table (
  status       text,
  people       bigint
)
language sql stable security definer set search_path = public as $$
  select coalesce(r.status, 'none') as status, count(*)
  from public.volunteer_register() r
  group by coalesce(r.status, 'none')
$$;

grant execute on function public.volunteer_summary() to authenticated;

-- Who a coordinator may pick as a mentor. Section 5.1 of the Handbook
-- puts mentoring inside the chapter, so this offers active volunteers in
-- the same chapter as the person being edited, and nobody else. It also
-- leaves out the person themselves, which the check constraint would
-- refuse anyway, but refusing after a coordinator has pressed save is a
-- worse way to learn it.
create or replace function public.mentor_candidates(p_for_profile uuid)
returns table (profile_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from public.profiles p
  join public.volunteer_records v on v.profile_id = p.id
  where v.status = 'active'
    and p.id <> p_for_profile
    and p.chapter_id is not distinct from public.chapter_of_profile(p_for_profile)
    and (
      public.is_admin()
      or public.dir_role() = 'NC'
      or (public.dir_role() = 'RC'
          and public.dir_chapter() is not null
          and public.chapter_of_profile(p_for_profile) = public.dir_chapter())
    )
  order by p.full_name
$$;

grant execute on function public.mentor_candidates(uuid) to authenticated;

-- ============================================================
-- Done. What you should see below.
-- ============================================================
do $$
declare
  v_triggers int;
  v_can_write boolean;
begin
  select count(*) into v_triggers
  from pg_trigger
  where tgname in ('audit_profiles','audit_safeguarding','audit_incident_actions',
                   'audit_kpi_targets','audit_volunteer_records',
                   'audit_log_no_rewrite','audit_log_no_rewrite_stmt')
    and not tgisinternal;

  select has_table_privilege('authenticated', 'public.audit_log', 'INSERT') into v_can_write;

  raise notice '---------------------------------------------';
  raise notice 'Audit triggers installed: %  (should be 7)', v_triggers;
  raise notice 'Signed-in accounts can write to the log directly: %', case when v_can_write then 'YES, that is wrong' else 'no, correct' end;
  raise notice 'The log is readable by the National Coordinator and admins only.';
  raise notice 'It records that a safeguarding incident moved, never what the incident says.';
  raise notice 'Volunteer register and summary functions are ready.';
  raise notice '---------------------------------------------';
end $$;
