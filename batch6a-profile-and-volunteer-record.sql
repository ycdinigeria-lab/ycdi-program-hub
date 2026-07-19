-- ============================================================
-- YCDI Programme Hub - Batch 6a
-- Self-service profile editing, contact privacy, volunteer record
--
-- Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run more than once. Read the Messages panel afterwards.
--
-- BATCH6A-MARKER profile-and-volunteer-record
--
-- Four things happen here.
--
-- A. Email addresses move out of the directory card into the private
--    contacts table, next to phone numbers. Until now any signed-in
--    person could read every email address in YCDI, because the field
--    sat on a table everybody can read. Hiding it in the app would not
--    have been privacy, only decoration.
--
-- B. Who can see contact details changes. The old rule was: admins and
--    Regional Coordinators see every phone number in the country, and
--    Team Members and the National Coordinator see none. The new rule
--    is: you see contact details for people in your own chapter, plus
--    the National Coordinator and admins see everyone. Regional
--    Coordinators therefore lose national reach and keep their own
--    chapter. Team Members gain their own chapter. This is a
--    deliberate change, decided by Godfrey, not an accident.
--
-- C. People can edit their own profile. Name, bio, photo, phone, and a
--    switch to hide their phone number from everyone. Role and chapter
--    stay locked to admins, because those two fields decide what a
--    person can read across safeguarding, participants and KPIs, so
--    letting someone change their own would let them change their own
--    access. Editing runs through a function rather than an open row
--    policy, because a row policy cannot stop somebody sending a
--    chapter change straight to the API and skipping the screen.
--
-- D. The volunteer record arrives. Fields come from the YCDI Volunteer
--    Handbook, YCDI-HR-003: the ten volunteer roles in section 1.2,
--    the six onboarding steps in 2.1, mentoring and pastoral contact
--    from 5.1 and 5.4, certificate of service from 5.2, and the
--    ending-of-service states in section 6. Safeguarding training and
--    the annual declaration are deliberately NOT duplicated here;
--    Batch 3 already holds those and one copy of a safeguarding record
--    is safer than two.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers, re-declared so this file stands on its own
-- ------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

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

-- The directory card belonging to whoever is signed in. Security definer
-- so it can be used inside policies without the policy having to read
-- directory_members, which would make the policy depend on itself.
create or replace function public.my_member_id()
  returns uuid language sql stable security definer set search_path = public as $$
  select id from public.directory_members where profile_id = auth.uid()
$$;

-- The chapter a given profile belongs to. Used by the volunteer record
-- policies. Security definer for the same reason as above.
create or replace function public.chapter_of_profile(p_profile uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = p_profile
$$;

-- ============================================================
-- A. Email joins phone in the private contacts table
-- ============================================================
alter table public.directory_contacts add column if not exists email        text;
alter table public.directory_contacts add column if not exists phone_hidden boolean not null default false;

-- Carry across whatever is already on the cards, then remove the old
-- column so there is only ever one copy of an address.
do $$
declare moved int := 0;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_members' and column_name = 'email'
  ) then
    insert into public.directory_contacts (member_id, email)
    select id, btrim(email) from public.directory_members
    where email is not null and btrim(email) <> ''
    on conflict (member_id) do update
      set email = coalesce(public.directory_contacts.email, excluded.email),
          updated_at = now();
    get diagnostics moved = row_count;
    alter table public.directory_members drop column email;
    raise notice 'Moved % email address(es) into the private table and removed the old column.', moved;
  else
    raise notice 'Email column already moved. Nothing to do.';
  end if;
end $$;

-- The two places that used to write an email onto the card have to write
-- it into the private table instead, or new members would arrive with no
-- address at all.
create or replace function public.sync_directory_on_profile_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_existing uuid;
  v_member uuid;
begin
  if tg_op = 'INSERT' then
    select id into v_existing
    from public.directory_members
    where profile_id is null
      and lower(trim(full_name)) = lower(trim(new.full_name))
    limit 1;

    select email into v_email from auth.users where id = new.id;

    if v_existing is not null then
      update public.directory_members
      set profile_id = new.id, chapter_id = new.chapter_id, updated_at = now()
      where id = v_existing;
      v_member := v_existing;
    else
      insert into public.directory_members (full_name, role_title, chapter_id, profile_id)
      values (new.full_name, public._role_title(new.role), new.chapter_id, new.id)
      returning id into v_member;
    end if;

    if v_member is not null and v_email is not null then
      insert into public.directory_contacts (member_id, email)
      values (v_member, v_email)
      on conflict (member_id) do update
        set email = coalesce(public.directory_contacts.email, excluded.email),
            updated_at = now();
    end if;

  elsif tg_op = 'UPDATE' then
    update public.directory_members
    set full_name = new.full_name,
        chapter_id = new.chapter_id,
        updated_at = now()
    where profile_id = new.id;
  end if;

  return new;
end;
$$;

-- ============================================================
-- B. Who can see contact details
-- ============================================================
-- The table itself is closed down to the owner and admins. Everyone
-- reads through the function below instead, because row security can
-- only decide whether a whole row comes back, and what is needed here
-- is finer than that: a person whose phone is hidden should still show
-- an email address to their own chapter.
alter table public.directory_contacts enable row level security;

drop policy if exists dircontact_read   on public.directory_contacts;
drop policy if exists dircontact_insert on public.directory_contacts;
drop policy if exists dircontact_update on public.directory_contacts;
drop policy if exists dircontact_delete on public.directory_contacts;

create policy dircontact_read on public.directory_contacts
  for select to authenticated using (
    public.is_admin() or member_id = public.my_member_id()
  );

create policy dircontact_insert on public.directory_contacts
  for insert to authenticated with check (
    public.is_admin()
    or member_id = public.my_member_id()
    or exists (
      select 1 from public.directory_members m
      where m.id = directory_contacts.member_id
        and public.dir_role() = 'RC'
        and m.chapter_id = public.dir_chapter()
    )
  );

create policy dircontact_update on public.directory_contacts
  for update to authenticated using (
    public.is_admin()
    or member_id = public.my_member_id()
    or exists (
      select 1 from public.directory_members m
      where m.id = directory_contacts.member_id
        and public.dir_role() = 'RC'
        and m.chapter_id = public.dir_chapter()
    )
  ) with check (
    public.is_admin()
    or member_id = public.my_member_id()
    or exists (
      select 1 from public.directory_members m
      where m.id = directory_contacts.member_id
        and public.dir_role() = 'RC'
        and m.chapter_id = public.dir_chapter()
    )
  );

create policy dircontact_delete on public.directory_contacts
  for delete to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.directory_members m
      where m.id = directory_contacts.member_id
        and public.dir_role() = 'RC'
        and m.chapter_id = public.dir_chapter()
    )
  );

-- What the Directory screen actually reads.
--
-- Rules, in the order they are applied:
--   your own card        -> you always see your own details
--   admin or NC          -> every chapter
--   anyone else          -> their own chapter only, and only if they
--                           have a chapter at all
--   phone marked hidden  -> the phone comes back empty for everybody
--                           except the person themselves. Including
--                           admins. A switch that says "hide from
--                           everyone" and then quietly does not is
--                           worse than no switch.
create or replace function public.directory_contacts_visible()
returns table (member_id uuid, phone text, email text)
language sql stable security definer set search_path = public as $$
  select
    c.member_id,
    case
      when m.profile_id = auth.uid() then c.phone
      when c.phone_hidden then null
      else c.phone
    end as phone,
    c.email
  from public.directory_contacts c
  join public.directory_members m on m.id = c.member_id
  where
    m.profile_id = auth.uid()
    or public.is_admin()
    or public.dir_role() = 'NC'
    or (public.dir_chapter() is not null and m.chapter_id = public.dir_chapter())
$$;

grant execute on function public.directory_contacts_visible() to authenticated;

-- ============================================================
-- C. Editing your own profile
-- ============================================================
-- Everything a person is allowed to change about themselves goes
-- through this one function. Role and chapter are absent from the
-- argument list on purpose, so there is no version of this call that
-- can move somebody into another chapter or make them a coordinator.
--
-- Passing null for an argument leaves that field alone. Passing an
-- empty string clears it. Those are different on purpose: the screen
-- sends every field every time, but a caller updating one thing
-- should not have to resend the rest.
create or replace function public.update_my_profile(
  p_full_name    text default null,
  p_bio          text default null,
  p_photo_url    text default null,
  p_phone        text default null,
  p_phone_hidden boolean default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_name   text;
begin
  if auth.uid() is null then
    raise exception 'You have to be signed in to change your profile.';
  end if;

  select id into v_member from public.directory_members where profile_id = auth.uid();

  if p_full_name is not null then
    v_name := btrim(p_full_name);
    if v_name = '' then
      raise exception 'A name is needed.';
    end if;
    if length(v_name) > 120 then
      raise exception 'That name is too long.';
    end if;
    -- The directory trigger picks this up and keeps the card in step.
    update public.profiles set full_name = v_name where id = auth.uid();
  end if;

  if v_member is null then
    -- No card yet. Nothing else here has anywhere to go, and silently
    -- doing nothing would look like a save that worked.
    if p_bio is not null or p_photo_url is not null or p_phone is not null or p_phone_hidden is not null then
      raise exception 'Your directory card has not been created yet. Ask an admin to check your account.';
    end if;
    return;
  end if;

  if p_bio is not null or p_photo_url is not null then
    update public.directory_members
    set bio        = case when p_bio is null then bio
                          when btrim(p_bio) = '' then null
                          else btrim(p_bio) end,
        photo_url  = case when p_photo_url is null then photo_url
                          when btrim(p_photo_url) = '' then null
                          else btrim(p_photo_url) end,
        updated_at = now()
    where id = v_member;
  end if;

  if p_phone is not null or p_phone_hidden is not null then
    insert into public.directory_contacts (member_id, phone, phone_hidden)
    values (
      v_member,
      case when p_phone is null or btrim(p_phone) = '' then null else btrim(p_phone) end,
      coalesce(p_phone_hidden, false)
    )
    on conflict (member_id) do update
      set phone = case when p_phone is null then public.directory_contacts.phone
                       when btrim(p_phone) = '' then null
                       else btrim(p_phone) end,
          phone_hidden = coalesce(p_phone_hidden, public.directory_contacts.phone_hidden),
          updated_at = now();
  end if;
end;
$$;

grant execute on function public.update_my_profile(text, text, text, text, boolean) to authenticated;

-- Reads back everything about yourself in one call, including the
-- fields nobody else can see.
create or replace function public.my_profile_card()
returns table (
  member_id    uuid,
  full_name    text,
  role_title   text,
  chapter_id   uuid,
  chapter_name text,
  bio          text,
  photo_url    text,
  phone        text,
  email        text,
  phone_hidden boolean
)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name, m.role_title, m.chapter_id, ch.name,
         m.bio, m.photo_url, c.phone, c.email, coalesce(c.phone_hidden, false)
  from public.directory_members m
  left join public.chapters ch on ch.id = m.chapter_id
  left join public.directory_contacts c on c.member_id = m.id
  where m.profile_id = auth.uid()
$$;

grant execute on function public.my_profile_card() to authenticated;

-- Photos. Uploading was admin and Regional Coordinator only, which is
-- right for editing somebody else's card and wrong for your own face.
-- A person may now write into a folder named after their own account id
-- and nowhere else. Existing photos sit at the top level and keep
-- working, since reading was never restricted.
drop policy if exists member_photos_insert on storage.objects;
drop policy if exists member_photos_update on storage.objects;

create policy member_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'member-photos'
    and (
      public.is_admin()
      or public.dir_role() = 'RC'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy member_photos_update on storage.objects
  for update to authenticated using (
    bucket_id = 'member-photos'
    and (
      public.is_admin()
      or public.dir_role() = 'RC'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  ) with check (
    bucket_id = 'member-photos'
    and (
      public.is_admin()
      or public.dir_role() = 'RC'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- ============================================================
-- D. The volunteer record
-- ============================================================
-- D1. The ten roles from YCDI-HR-003 section 1.2, as a list rather than
-- free text, so that "School Visitor" and "school visits" do not end up
-- as two different things in a report. Kept in a table rather than a
-- check constraint so a new role can be added without a migration.
create table if not exists public.volunteer_roles (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  description      text,
  primary_location text,
  sort_order       int  not null default 100,
  is_active        boolean not null default true
);

insert into public.volunteer_roles (name, description, primary_location, sort_order)
select v.name, v.description, v.primary_location, v.sort_order
from (values
  ('School Visitor',         'Leads school fellowships, devotionals, and outreach visits', 'Schools, all chapters',      10),
  ('Event Organizer',        'Coordinates logistics for conferences, retreats, and programmes', 'Chapter and national events', 20),
  ('Facilitator / Speaker',  'Leads workshops, seminars, and teaching sessions', 'Programmes and conferences',          30),
  ('Graphic Designer',       'Creates visual content for programmes and campaigns', 'Remote or national',               40),
  ('Social Media Creator',   'Manages and creates content for YCDI''s online platforms', 'Remote or national',           50),
  ('Course Creator',         'Develops educational and discipleship content', 'Remote or national',                     60),
  ('Counsellor / Mentor',    'Provides personal mentoring to students and youth', 'Schools and chapter programmes',     70),
  ('Website Manager',        'Maintains and updates YCDI''s digital platforms', 'Remote or national',                   80),
  ('Administrative Support', 'Assists with records, correspondence, and logistics', 'National or chapter offices',      90),
  ('Regional Coordinator',   'Leads all operations of a YCDI chapter', 'Chapter headquarters',                         100)
) as v(name, description, primary_location, sort_order)
where not exists (select 1 from public.volunteer_roles r where r.name = v.name);

alter table public.volunteer_roles enable row level security;
drop policy if exists volrole_read  on public.volunteer_roles;
drop policy if exists volrole_write on public.volunteer_roles;

create policy volrole_read on public.volunteer_roles
  for select to authenticated using (true);
create policy volrole_write on public.volunteer_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- D2. One record per person.
--
-- The six dates in the middle are the six onboarding steps in section
-- 2.1 of the Handbook. They are dates rather than tick boxes because a
-- date tells you somebody has been waiting at step four since March,
-- and a tick box tells you nothing at all.
create table if not exists public.volunteer_records (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null unique references public.profiles(id) on delete cascade,

  -- Section 6: ending volunteer service. 'onboarding' covers somebody
  -- part-way through the six steps and not yet activated.
  status        text not null default 'onboarding'
                check (status in ('onboarding','active','inactive','withdrawn','suspended','removed')),

  started_on    date,
  ended_on      date,
  ended_reason  text,

  -- Section 2.1, the six steps, in order.
  applied_on                 date,
  interviewed_on             date,
  references_received_on     date,
  safeguarding_declaration_on date,
  orientation_on             date,
  activated_on               date,

  -- Sections 5.1 and 5.4: mentoring and pastoral contact.
  mentor_profile_id uuid references public.profiles(id) on delete set null,
  last_contact_on   date,

  -- Right person, right seat.
  availability text,
  skills       text,

  -- Section 5.2: certificate of service after twelve months.
  certificate_issued_on date,

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A record cannot claim to have ended before it started, and cannot be
-- closed without a date. Checked here rather than in the screen, because
-- the screen is not the only thing that will ever write to this table.
alter table public.volunteer_records drop constraint if exists volrec_dates_sane;
alter table public.volunteer_records add constraint volrec_dates_sane check (
  (ended_on is null or started_on is null or ended_on >= started_on)
  and (status not in ('withdrawn','removed') or ended_on is not null)
);

-- Nobody mentors themselves.
alter table public.volunteer_records drop constraint if exists volrec_mentor_not_self;
alter table public.volunteer_records add constraint volrec_mentor_not_self check (
  mentor_profile_id is null or mentor_profile_id <> profile_id
);

create index if not exists volunteer_records_status_idx on public.volunteer_records(status);
create index if not exists volunteer_records_mentor_idx on public.volunteer_records(mentor_profile_id);

create table if not exists public.volunteer_record_roles (
  record_id uuid not null references public.volunteer_records(id) on delete cascade,
  role_id   uuid not null references public.volunteer_roles(id)   on delete cascade,
  primary key (record_id, role_id)
);

-- D3. Who can see and change a volunteer record.
--
-- Reading: yourself, your own chapter's coordinator, the National
-- Coordinator, and admins. A Team Member cannot browse other people's
-- service history, which is closer to an HR file than to a directory
-- card.
--
-- Writing: coordinators, NC and admins. Deliberately not the person
-- themselves, because dates of interview, orientation and activation
-- are things the organisation records about a volunteer, not things a
-- volunteer asserts about themselves. The two fields a person may
-- change about their own record, availability and skills, go through
-- the function below instead.
alter table public.volunteer_records      enable row level security;
alter table public.volunteer_record_roles enable row level security;

drop policy if exists volrec_read   on public.volunteer_records;
drop policy if exists volrec_insert on public.volunteer_records;
drop policy if exists volrec_update on public.volunteer_records;
drop policy if exists volrec_delete on public.volunteer_records;

create policy volrec_read on public.volunteer_records
  for select to authenticated using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and public.chapter_of_profile(profile_id) = public.dir_chapter())
  );

create policy volrec_insert on public.volunteer_records
  for insert to authenticated with check (
    public.is_admin()
    or public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and public.chapter_of_profile(profile_id) = public.dir_chapter())
  );

create policy volrec_update on public.volunteer_records
  for update to authenticated using (
    public.is_admin()
    or public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and public.chapter_of_profile(profile_id) = public.dir_chapter())
  ) with check (
    public.is_admin()
    or public.dir_role() = 'NC'
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and public.chapter_of_profile(profile_id) = public.dir_chapter())
  );

create policy volrec_delete on public.volunteer_records
  for delete to authenticated using (public.is_admin());

drop policy if exists volrecrole_read   on public.volunteer_record_roles;
drop policy if exists volrecrole_write  on public.volunteer_record_roles;

create policy volrecrole_read on public.volunteer_record_roles
  for select to authenticated using (
    exists (
      select 1 from public.volunteer_records v
      where v.id = volunteer_record_roles.record_id
        and (
          v.profile_id = auth.uid()
          or public.is_admin()
          or public.dir_role() = 'NC'
          or (public.dir_role() = 'RC'
              and public.dir_chapter() is not null
              and public.chapter_of_profile(v.profile_id) = public.dir_chapter())
        )
    )
  );

create policy volrecrole_write on public.volunteer_record_roles
  for all to authenticated using (
    exists (
      select 1 from public.volunteer_records v
      where v.id = volunteer_record_roles.record_id
        and (
          public.is_admin()
          or public.dir_role() = 'NC'
          or (public.dir_role() = 'RC'
              and public.dir_chapter() is not null
              and public.chapter_of_profile(v.profile_id) = public.dir_chapter())
        )
    )
  ) with check (
    exists (
      select 1 from public.volunteer_records v
      where v.id = volunteer_record_roles.record_id
        and (
          public.is_admin()
          or public.dir_role() = 'NC'
          or (public.dir_role() = 'RC'
              and public.dir_chapter() is not null
              and public.chapter_of_profile(v.profile_id) = public.dir_chapter())
        )
    )
  );

-- D4. The two fields a volunteer may keep up to date themselves.
create or replace function public.update_my_volunteer_details(
  p_availability text default null,
  p_skills       text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'You have to be signed in.';
  end if;

  insert into public.volunteer_records (profile_id, availability, skills)
  values (
    auth.uid(),
    case when p_availability is null or btrim(p_availability) = '' then null else btrim(p_availability) end,
    case when p_skills is null or btrim(p_skills) = '' then null else btrim(p_skills) end
  )
  on conflict (profile_id) do update
    set availability = case when p_availability is null then public.volunteer_records.availability
                            when btrim(p_availability) = '' then null
                            else btrim(p_availability) end,
        skills       = case when p_skills is null then public.volunteer_records.skills
                            when btrim(p_skills) = '' then null
                            else btrim(p_skills) end,
        updated_at   = now();
end;
$$;

grant execute on function public.update_my_volunteer_details(text, text) to authenticated;

-- D5. Your own record, read back with role names attached.
create or replace function public.my_volunteer_record()
returns table (
  id                    uuid,
  status                text,
  started_on            date,
  ended_on              date,
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
  mentor_name           text,
  role_names            text[]
)
language sql stable security definer set search_path = public as $$
  select v.id, v.status, v.started_on, v.ended_on,
         v.applied_on, v.interviewed_on, v.references_received_on,
         v.safeguarding_declaration_on, v.orientation_on, v.activated_on,
         v.last_contact_on, v.certificate_issued_on,
         v.availability, v.skills,
         mp.full_name,
         coalesce(
           (select array_agg(r.name order by r.sort_order)
            from public.volunteer_record_roles vr
            join public.volunteer_roles r on r.id = vr.role_id
            where vr.record_id = v.id),
           array[]::text[]
         )
  from public.volunteer_records v
  left join public.profiles mp on mp.id = v.mentor_profile_id
  where v.profile_id = auth.uid()
$$;

grant execute on function public.my_volunteer_record() to authenticated;

-- ============================================================
-- Done. What you should see below.
-- ============================================================
do $$
declare
  v_roles int;
  v_email_gone boolean;
begin
  select count(*) into v_roles from public.volunteer_roles;
  select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_members' and column_name = 'email'
  ) into v_email_gone;

  raise notice '---------------------------------------------';
  raise notice 'Volunteer roles available: %  (should be 10 or more)', v_roles;
  raise notice 'Email moved off the public card: %', case when v_email_gone then 'yes' else 'NO, something went wrong' end;
  raise notice 'Contact details are now: own chapter, plus NC and admins.';
  raise notice 'Regional Coordinators no longer see other chapters phone numbers.';
  raise notice 'A hidden phone number is hidden from admins too. That is deliberate.';
  raise notice '---------------------------------------------';
end $$;
