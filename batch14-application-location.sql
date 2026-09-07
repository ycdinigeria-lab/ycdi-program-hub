-- ============================================================
-- YCDI Programme Hub
-- Batch 14: where an applicant lives, on the public volunteer form
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH14-MARKER application-location
--
-- What this does
-- --------------
-- Adds a country and a state to the public volunteer application, both
-- held as plain text, and teaches the submit function to store them. That
-- is the whole database change. Two nullable columns and one function, no
-- new access rules: an application is still written only through
-- submit_volunteer_application, still readable only by the National
-- Coordinator and the chapter's own Regional Coordinator, exactly as before.
--
-- The other half of Batch 14, letting an admin add a chapter from the app,
-- needs no database change at all. Admins were given the right to add,
-- rename and remove chapters in the early lock-down migration, and a
-- trigger already gives every new chapter its messaging channel. That half
-- is a screen catching up to a permission that has been sitting unused.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Two more columns on the application
-- ------------------------------------------------------------
alter table public.volunteer_applications add column if not exists country text;
alter table public.volunteer_applications add column if not exists state   text;

-- ------------------------------------------------------------
-- 2. The submit function, with the two new fields read in
-- ------------------------------------------------------------
-- The same function as Batch 7a, unchanged except that it now reads
-- country and state out of the payload and stores them. Everything else,
-- the required-field checks, the repeat-email guard, the hourly chapter
-- cap, the reference number, is exactly as it was.
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
    country, state,
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
    nullif(btrim(payload->>'country'),''),
    nullif(btrim(payload->>'state'),''),
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

  return jsonb_build_object('reference', v_ref);
end;
$$;

revoke all on function public.submit_volunteer_application(jsonb) from public;
grant execute on function public.submit_volunteer_application(jsonb) to anon, authenticated;
