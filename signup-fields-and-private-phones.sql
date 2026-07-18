-- ============================================================
-- YCDI Programme Hub - richer sign-up + private phone numbers
-- Paste this whole file into Supabase > SQL Editor and click Run.
--
-- Two things happen here.
--
-- A. The sign-up request form grows. As well as full name, someone
--    asking for access now tells you their chapter, phone number,
--    what they do, who referred them, and who their chapter
--    coordinator is. All of it shows on the approval card so you're
--    deciding with something to go on instead of a bare name.
--
-- B. Phone numbers move out of the directory table into their own
--    table that only admins and Regional Coordinators can read.
--    Hiding the field in the app alone would not have been real
--    privacy, since anyone signed in can query the directory table
--    directly. Existing numbers are carried across, then the old
--    column is removed so there's only one copy.
--
-- Safe to run more than once. Read the Results panel afterwards.
-- ============================================================

-- Helpers, re-declared so this file stands on its own.
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

-- ------------------------------------------------------------
-- A. Sign-up request fields
-- ------------------------------------------------------------
alter table public.pending_signups add column if not exists phone            text;
alter table public.pending_signups add column if not exists chapter_id       uuid references public.chapters(id) on delete set null;
alter table public.pending_signups add column if not exists role_title       text;
alter table public.pending_signups add column if not exists referred_by      text;
alter table public.pending_signups add column if not exists coordinator_name text;

-- ------------------------------------------------------------
-- B. Phone numbers in their own table
-- ------------------------------------------------------------
create table if not exists public.directory_contacts (
  member_id  uuid primary key references public.directory_members(id) on delete cascade,
  phone      text,
  updated_at timestamptz not null default now()
);

-- Carry across anything already stored, then drop the old column so
-- there is only ever one copy of a number.
do $$
declare moved int := 0;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_members' and column_name = 'phone'
  ) then
    execute $mig$
      insert into public.directory_contacts (member_id, phone)
      select id, phone from public.directory_members
      where phone is not null and btrim(phone) <> ''
      on conflict (member_id) do update set phone = excluded.phone, updated_at = now()
    $mig$;
    get diagnostics moved = row_count;
    execute 'alter table public.directory_members drop column phone';
    raise notice 'Moved % phone number(s) into the private table and removed the old column.', moved;
  else
    raise notice 'Phone column already moved. Nothing to do.';
  end if;
end $$;

alter table public.directory_contacts enable row level security;

drop policy if exists dircontact_read   on public.directory_contacts;
drop policy if exists dircontact_insert on public.directory_contacts;
drop policy if exists dircontact_update on public.directory_contacts;
drop policy if exists dircontact_delete on public.directory_contacts;

-- Only admins and Regional Coordinators can see phone numbers at all.
-- A Team Member or an ordinary National Coordinator gets nothing back,
-- not a blank, the rows simply are not there for them.
create policy dircontact_read on public.directory_contacts
  for select to authenticated using (
    public.is_admin() or public.dir_role() = 'RC'
  );

-- Writing follows the same rule as editing the card itself: admins
-- anywhere, Regional Coordinators only within their own chapter.
create policy dircontact_insert on public.directory_contacts
  for insert to authenticated with check (
    public.is_admin()
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
    or exists (
      select 1 from public.directory_members m
      where m.id = directory_contacts.member_id
        and public.dir_role() = 'RC'
        and m.chapter_id = public.dir_chapter()
    )
  ) with check (
    public.is_admin()
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

-- ------------------------------------------------------------
-- C. Approval carries the submitted details through
-- ------------------------------------------------------------
-- The profile insert fires the directory trigger, which creates the
-- card. Straight after, this fills in the title they gave and files
-- their phone number in the private table.
create or replace function public.approve_signup(signup_id uuid, new_role text, new_chapter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_signup record;
  v_member uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve sign-ups.';
  end if;

  select * into v_signup from public.pending_signups where id = signup_id;
  if v_signup is null then
    raise exception 'That sign-up request no longer exists.';
  end if;
  if new_role not in ('RC','TM','NC') then
    raise exception 'Unrecognised role.';
  end if;
  if new_role in ('RC','TM') and new_chapter_id is null then
    raise exception 'A chapter is required for that role.';
  end if;

  insert into public.profiles (id, full_name, role, chapter_id)
  values (
    signup_id,
    v_signup.full_name,
    new_role,
    case when new_role = 'NC' then null else new_chapter_id end
  );

  select id into v_member from public.directory_members where profile_id = signup_id;

  if v_member is not null then
    if v_signup.role_title is not null and btrim(v_signup.role_title) <> '' then
      update public.directory_members
      set role_title = btrim(v_signup.role_title), updated_at = now()
      where id = v_member;
    end if;

    if v_signup.phone is not null and btrim(v_signup.phone) <> '' then
      insert into public.directory_contacts (member_id, phone)
      values (v_member, btrim(v_signup.phone))
      on conflict (member_id) do update set phone = excluded.phone, updated_at = now();
    end if;
  end if;

  delete from public.pending_signups where id = signup_id;
end;
$$;

grant execute on function public.approve_signup(uuid, text, uuid) to authenticated;

do $$ begin
  raise notice 'Sign-up fields added, phone numbers made private, approval now carries the details through.';
end $$;

-- Done.
