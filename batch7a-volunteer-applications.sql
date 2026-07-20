-- ============================================================
-- YCDI Programme Hub - Batch 7a
-- The volunteer application form and what happens to it
--
-- Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run more than once. Read the Messages panel afterwards.
--
-- BATCH7A-MARKER applications
--
-- Batch 6b gave coordinators a register and a six-step onboarding path
-- taken from the Volunteer Handbook, section 2.1. Step one of those six
-- is "Application", and until now there was no way for an application to
-- arrive except a coordinator typing one in. This is the front door.
--
-- The fields are not invented. YCDI-SAF-005 section 3.2 sets out what an
-- application for a role involving children has to capture, and every
-- column below traces to a line in it.
--
-- Three decisions worth reading before the code.
--
-- 1. The form is open without signing in. Volunteers do not have hub
--    accounts before they apply, and making them create one first loses
--    people at the worst possible moment. That means one door in the hub
--    that anybody on the internet can push on, so nothing here is a
--    table insert policy. Submission goes through a single function that
--    decides the shape of the row, and the table itself stays shut.
--
-- 2. Regional Coordinators can read the application and, in 7b, the
--    reference notes for their own chapter. That is a departure from
--    YCDI-SAF-005 section 3.8, which limits screening records to the
--    National Coordinator, the Board Safeguarding Chair and the Board
--    Chair. It is a deliberate one, decided on the grounds that the
--    coordinator conducts the interview under YCDI-HR-003 section 2.1
--    and cannot do that blind. SAF-005 needs a matching amendment.
--
-- 3. Admins cannot read applications. An application carries a
--    declaration of convictions, cautions and prior safeguarding
--    concerns, which makes it screening material rather than personnel
--    data. Admin is a technical flag that gets handed to whoever keeps
--    the system running, and it is already excluded from safeguarding
--    cases for the same reason.
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

-- ============================================================
-- 1. The application
-- ============================================================
create table if not exists public.volunteer_applications (
  id                uuid primary key default gen_random_uuid(),
  reference         text unique,
  submitted_at      timestamptz not null default now(),

  -- Which screening standard applies. SAF-005 section 3.1 asks for two
  -- references and a mandatory interview where there is school or child
  -- contact, and one reference with an optional interview where there is
  -- not. Storing the answer rather than guessing it later means the
  -- register can say what is genuinely outstanding.
  role_sought       text not null default 'school_contact'
                    check (role_sought in ('school_contact','event_only')),
  chapter_id        uuid references public.chapters(id) on delete set null,

  -- 3.2, identity and contact
  full_name         text not null,
  date_of_birth     date,
  phone             text,
  email             text,
  home_address      text,
  address_since     text,

  -- 3.2, background
  occupation        text,
  employment_history text,
  youth_experience  text,

  -- 3.2, church
  church_name       text,
  church_location   text,
  pastor_name       text,
  pastor_contact    text,

  -- 3.2, two referees, at least one a pastor, elder or church leader
  referee1_name     text,
  referee1_relationship text,
  referee1_contact  text,
  referee1_is_church_leader boolean not null default false,
  referee2_name     text,
  referee2_relationship text,
  referee2_contact  text,
  referee2_is_church_leader boolean not null default false,

  -- 3.2, faith and motivation
  faith_statement   text,
  motivation        text,

  -- 3.2, disclosure. The declaration itself is the point, not the
  -- answer: an applicant who discloses honestly is not disqualified,
  -- and one who leaves it blank has not made the declaration at all.
  disclosure_made   boolean not null default false,
  has_disclosure    boolean,
  disclosure_detail text,

  -- 3.2, consent to contact referees and run checks. Not optional, and
  -- enforced rather than merely asked for.
  consent_references boolean not null default false,

  status            text not null default 'new'
                    check (status in ('new','shortlisted','interviewing','declined','withdrawn','appointed')),
  decided_at        timestamptz,
  decided_by        uuid references public.profiles(id) on delete set null,
  decision_note     text,

  -- Filled in once an appointed applicant has a hub account, so the
  -- application and the volunteer record can be read as one story.
  linked_profile_id uuid references public.profiles(id) on delete set null,

  coordinator_notes text,

  constraint app_consent_given check (consent_references = true),
  constraint app_declaration_made check (disclosure_made = true),
  constraint app_disclosure_has_detail check (
    has_disclosure is not true or coalesce(btrim(disclosure_detail),'') <> ''
  ),
  constraint app_decision_recorded check (
    status not in ('declined','withdrawn','appointed') or decided_at is not null
  )
);

comment on table public.volunteer_applications is
  'Volunteer applications submitted through the public form. Screening material under YCDI-SAF-005 3.8. Readable by the National Coordinator and by the Regional Coordinator for the chapter applied to. Not readable by admins.';

create index if not exists app_chapter_idx  on public.volunteer_applications (chapter_id, submitted_at desc);
create index if not exists app_status_idx   on public.volunteer_applications (status, submitted_at desc);
create index if not exists app_email_idx    on public.volunteer_applications (lower(email), submitted_at desc);

-- A reference somebody can quote down a phone line, which "the one from
-- Tuesday" is not.
create or replace function public.application_reference()
returns text language sql stable as $$
  select 'VA-' || to_char(now(), 'YYYY') || '-' ||
         lpad((
           select (count(*) + 1)::text
           from public.volunteer_applications
           where submitted_at >= date_trunc('year', now())
         ), 4, '0')
$$;

-- ------------------------------------------------------------
-- 2. Who can read one
-- ------------------------------------------------------------
alter table public.volunteer_applications enable row level security;

drop policy if exists app_read   on public.volunteer_applications;
drop policy if exists app_write  on public.volunteer_applications;
drop policy if exists app_insert on public.volunteer_applications;
drop policy if exists app_delete on public.volunteer_applications;

create policy app_read on public.volunteer_applications
  for select to authenticated using (
    public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and chapter_id = public.dir_chapter())
  );

-- Coordinators move an application along. They do not get to edit what
-- the applicant wrote, so the columns they may touch are granted rather
-- than the whole row.
create policy app_write on public.volunteer_applications
  for update to authenticated using (
    public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and chapter_id = public.dir_chapter())
  ) with check (
    public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and chapter_id = public.dir_chapter())
  );

-- Only the National Coordinator deletes, and mostly for junk. Real
-- applications are destroyed on the twelve month rule in SAF-005 3.8,
-- which is the job below rather than a button.
create policy app_delete on public.volunteer_applications
  for delete to authenticated using (public.dir_role() = 'NC');

revoke all on public.volunteer_applications from anon;
revoke all on public.volunteer_applications from authenticated;
grant select, delete on public.volunteer_applications to authenticated;
grant update (status, decided_at, decided_by, decision_note, coordinator_notes, linked_profile_id, chapter_id)
  on public.volunteer_applications to authenticated;

-- No insert right for anybody, signed in or not. The only way a row
-- appears is the function below.

-- ------------------------------------------------------------
-- 3. Submitting one, from a page with no sign-in behind it
-- ------------------------------------------------------------
--
-- On rate limiting, plainly. PostgREST does not hand the caller's IP
-- address to the database, so this cannot count attempts per person.
-- What it can do is refuse a repeat from the same email address, which
-- stops the ordinary accident of somebody pressing submit four times,
-- and cap a single chapter's hourly intake so a flood is contained
-- rather than unlimited. A determined attacker with many addresses would
-- still get through. The real backstop is that the National Coordinator
-- can delete junk and that Supabase applies its own limits above this.
--
-- The hourly cap is deliberately set well above anything real recruitment
-- produces. A cap tight enough to stop an attacker would also be tight
-- enough for one attacker to lock a whole chapter out of applying, which
-- would be doing their work for them.
create or replace function public.submit_volunteer_application(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email    text := lower(btrim(coalesce(payload->>'email','')));
  v_chapter  uuid;
  v_ref      text;
  v_id       uuid;
  v_recent   int;
begin
  if coalesce(btrim(payload->>'full_name'),'') = '' then
    raise exception 'A name is needed.' using errcode = 'check_violation';
  end if;
  if v_email = '' then
    raise exception 'An email address is needed, so we can reply.' using errcode = 'check_violation';
  end if;
  if coalesce((payload->>'consent_references')::boolean, false) is not true then
    raise exception 'YCDI cannot proceed without your consent to contact your referees.' using errcode = 'check_violation';
  end if;

  begin
    v_chapter := nullif(payload->>'chapter_id','')::uuid;
  exception when others then
    v_chapter := null;
  end;

  select count(*) into v_recent
  from public.volunteer_applications
  where lower(email) = v_email
    and submitted_at > now() - interval '24 hours';
  if v_recent >= 2 then
    raise exception 'We already have an application from this email address today. Please give us a little time to read it.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_recent
  from public.volunteer_applications
  where chapter_id is not distinct from v_chapter
    and submitted_at > now() - interval '1 hour';
  if v_recent >= 40 then
    raise exception 'This chapter has taken a lot of applications in the last hour. Please try again shortly.'
      using errcode = 'check_violation';
  end if;

  v_ref := public.application_reference();

  insert into public.volunteer_applications (
    reference, role_sought, chapter_id,
    full_name, date_of_birth, phone, email, home_address, address_since,
    occupation, employment_history, youth_experience,
    church_name, church_location, pastor_name, pastor_contact,
    referee1_name, referee1_relationship, referee1_contact, referee1_is_church_leader,
    referee2_name, referee2_relationship, referee2_contact, referee2_is_church_leader,
    faith_statement, motivation,
    disclosure_made, has_disclosure, disclosure_detail,
    consent_references
  ) values (
    v_ref,
    coalesce(nullif(payload->>'role_sought',''), 'school_contact'),
    v_chapter,
    btrim(payload->>'full_name'),
    nullif(payload->>'date_of_birth','')::date,
    nullif(btrim(payload->>'phone'),''),
    v_email,
    nullif(btrim(payload->>'home_address'),''),
    nullif(btrim(payload->>'address_since'),''),
    nullif(btrim(payload->>'occupation'),''),
    nullif(btrim(payload->>'employment_history'),''),
    nullif(btrim(payload->>'youth_experience'),''),
    nullif(btrim(payload->>'church_name'),''),
    nullif(btrim(payload->>'church_location'),''),
    nullif(btrim(payload->>'pastor_name'),''),
    nullif(btrim(payload->>'pastor_contact'),''),
    nullif(btrim(payload->>'referee1_name'),''),
    nullif(btrim(payload->>'referee1_relationship'),''),
    nullif(btrim(payload->>'referee1_contact'),''),
    coalesce((payload->>'referee1_is_church_leader')::boolean, false),
    nullif(btrim(payload->>'referee2_name'),''),
    nullif(btrim(payload->>'referee2_relationship'),''),
    nullif(btrim(payload->>'referee2_contact'),''),
    coalesce((payload->>'referee2_is_church_leader')::boolean, false),
    nullif(btrim(payload->>'faith_statement'),''),
    nullif(btrim(payload->>'motivation'),''),
    true,
    coalesce((payload->>'has_disclosure')::boolean, false),
    nullif(btrim(payload->>'disclosure_detail'),''),
    true
  )
  returning id into v_id;

  -- The applicant gets the reference back and nothing else. Handing back
  -- the row would let anybody on the internet read whatever the database
  -- filled in, which is a habit worth not starting.
  return jsonb_build_object('reference', v_ref);
end;
$$;

revoke all on function public.submit_volunteer_application(jsonb) from public;
grant execute on function public.submit_volunteer_application(jsonb) to anon, authenticated;

-- The form needs a chapter list before anybody has signed in, and the
-- chapters table is not readable to a stranger. This hands back the two
-- fields the dropdown needs and nothing else.
create or replace function public.public_chapter_list()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, name from public.chapters order by name
$$;

revoke all on function public.public_chapter_list() from public;
grant execute on function public.public_chapter_list() to anon, authenticated;

-- ------------------------------------------------------------
-- 3b. Shutting a window that was already open
-- ------------------------------------------------------------
-- Found while testing this batch, and not caused by it.
--
-- The `anon` role, meaning anybody holding the publishable key, which is
-- everybody, since it ships in the browser bundle, could read every row
-- of profiles and chapters. Names, roles and chapter assignments for the
-- whole organisation, without signing in. It was reachable before today
-- by anyone who thought to ask; this batch did not create it, it just
-- made somebody look.
--
-- The fix is the grant rather than the policy. Postgres checks table
-- privileges before it ever gets to row security, so taking the grant
-- away closes the door whatever the policies happen to be called, and
-- does not depend on matching a policy name that might differ between
-- this project and the harness.
--
-- Nothing signed out needs either table. The login screen does not read
-- them, and the application form gets its chapter list from the function
-- above, which hands back two columns and nothing else.
revoke all on public.profiles from anon;
revoke all on public.chapters from anon;

-- ------------------------------------------------------------
-- 4. Moving one along
-- ------------------------------------------------------------
-- Status, who decided, and when, recorded together so a decision cannot
-- be half made. Going straight to the table would let the status move
-- with decided_at left empty, which the check constraint would refuse
-- and the coordinator would have to puzzle out.
create or replace function public.decide_application(
  p_application uuid,
  p_status      text,
  p_note        text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chapter uuid;
  v_role    text := public.dir_role();
begin
  select chapter_id into v_chapter from public.volunteer_applications where id = p_application;
  if not found then
    raise exception 'That application no longer exists.';
  end if;

  if not (v_role = 'NC' or (v_role = 'RC' and public.dir_chapter() is not null and v_chapter = public.dir_chapter())) then
    raise exception 'You cannot make a decision on this application.' using errcode = '42501';
  end if;

  if p_status not in ('new','shortlisted','interviewing','declined','withdrawn','appointed') then
    raise exception 'Unknown decision: %', p_status;
  end if;

  update public.volunteer_applications
  set status = p_status,
      decision_note = coalesce(p_note, decision_note),
      decided_at = case when p_status in ('declined','withdrawn','appointed') then now() else null end,
      decided_by = case when p_status in ('declined','withdrawn','appointed') then auth.uid() else null end
  where id = p_application;
end;
$$;

grant execute on function public.decide_application(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Reading them
-- ------------------------------------------------------------
create or replace function public.application_summary()
returns table (status text, applications bigint)
language sql stable security invoker set search_path = public as $$
  select status, count(*)
  from public.volunteer_applications
  group by status
$$;

grant execute on function public.application_summary() to authenticated;

-- ------------------------------------------------------------
-- 6. The twelve month rule
-- ------------------------------------------------------------
-- SAF-005 3.8: application records for people not appointed are kept for
-- twelve months and then destroyed. This is the function that does it.
-- It is not on a timer, because a scheduled job that silently deletes
-- records is a bad thing to install and forget. Run it deliberately, or
-- attach it to pg_cron later once somebody owns the decision.
create or replace function public.purge_old_applications()
returns int language plpgsql security definer set search_path = public as $$
declare v_gone int;
begin
  if public.dir_role() is distinct from 'NC' then
    raise exception 'Only the National Coordinator can run this.' using errcode = '42501';
  end if;

  with removed as (
    delete from public.volunteer_applications
    where status in ('declined','withdrawn')
      and decided_at < now() - interval '12 months'
    returning 1
  )
  select count(*) into v_gone from removed;

  return v_gone;
end;
$$;

grant execute on function public.purge_old_applications() to authenticated;

-- ------------------------------------------------------------
-- 7. The audit log learns a fifth kind of entry
-- ------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_entity_check;
alter table public.audit_log add constraint audit_log_entity_check
  check (entity in ('profile','safeguarding','kpi_target','volunteer','application'));

-- As with safeguarding, what is recorded is that an application moved
-- and who moved it. Not what the applicant wrote, and never the
-- disclosure, which is the single most sensitive line on the form.
create or replace function public.audit_application_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write(
      'application', 'application_received', new.reference, null, new.chapter_id,
      null, null, new.status, null
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.audit_write(
      'application', 'application_deleted', old.reference, null, old.chapter_id,
      null, old.status, null, null
    );
    return old;
  end if;

  if new.status is distinct from old.status then
    perform public.audit_write(
      'application', 'application_decided', new.reference, null, new.chapter_id,
      'status', old.status, new.status, null
    );
  end if;

  if new.linked_profile_id is distinct from old.linked_profile_id and new.linked_profile_id is not null then
    perform public.audit_write(
      'application', 'application_linked', new.reference, new.linked_profile_id, new.chapter_id,
      null, null, null, null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_applications on public.volunteer_applications;
create trigger audit_applications
  after insert or update or delete on public.volunteer_applications
  for each row execute function public.audit_application_change();

-- ============================================================
-- Done. What you should see below.
-- ============================================================
do $$
declare
  v_anon_select boolean;
  v_anon_insert boolean;
  v_can_submit  boolean;
begin
  select has_table_privilege('anon','public.volunteer_applications','SELECT') into v_anon_select;
  select has_table_privilege('anon','public.volunteer_applications','INSERT') into v_anon_insert;
  select has_function_privilege('anon','public.submit_volunteer_application(jsonb)','EXECUTE') into v_can_submit;

  raise notice '---------------------------------------------';
  raise notice 'A stranger can submit the form: %', case when v_can_submit then 'yes, correct' else 'NO, that is wrong' end;
  raise notice 'A stranger can read applications: %', case when v_anon_select then 'YES, that is wrong' else 'no, correct' end;
  raise notice 'A stranger can write to the table directly: %', case when v_anon_insert then 'YES, that is wrong' else 'no, correct' end;
  raise notice 'Applications are readable by the National Coordinator and by the';
  raise notice 'Regional Coordinator for the chapter applied to. Not by admins.';
  raise notice '---------------------------------------------';
end $$;
