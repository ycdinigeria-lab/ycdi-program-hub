-- ============================================================
-- YCDI Programme Hub - Batch 0, part 2: closing the old tables
-- Paste this whole file into Supabase > SQL Editor and click Run.
--
-- The check you ran turned up three real problems on the tables that
-- predate this work. In plain terms:
--
--   1. Anyone signing up could create their own profile row and put
--      whatever role they liked in it, including National Coordinator
--      and admin. Approval could be skipped entirely.
--
--   2. Anyone already signed in could edit their own profile row, and
--      nothing stopped them editing the role and admin columns. So any
--      member could make themselves an admin.
--
--   3. Any signed-in person could update any programme at all, from any
--      chapter, including setting one to Approved. The approval
--      functions were being applied in the app but could be walked
--      straight past.
--
-- Also fixed: the reports table had no update rule, so re-submitting a
-- report for the same programme would have failed. Nobody has hit it
-- yet because no report has been logged twice.
--
-- After this, roles and admin access can only change through the
-- functions built for it, and only an admin can drive them.
--
-- Safe to run more than once.
-- ============================================================

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
-- 1. profiles: stop people promoting themselves
-- ------------------------------------------------------------

-- Self-creating a profile is what approval is for. Approved accounts
-- are created by approve_signup, which checks admin access first.
drop policy if exists "Users can insert own profile"   on public.profiles;
drop policy if exists "nc insert profiles for others"  on public.profiles;

-- Reading everyone stays as it was. Names and roles are meant to be
-- visible across the hub.

-- Editing your own row stays possible, but only your own row, and from
-- here only your own name. The column grants below are what enforce
-- that, and the trigger after them is a second lock in case those
-- grants are ever loosened by hand.
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists profiles_update_self           on public.profiles;

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- No signed-in user means this is the SQL editor or the service key,
  -- which are already full-trust. Leave those alone so setup scripts and
  -- the dashboard keep working.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only an admin can change someone''s role.';
    end if;
    if new.is_admin is distinct from old.is_admin then
      raise exception 'Only an admin can change admin access.';
    end if;
    if new.chapter_id is distinct from old.chapter_id then
      raise exception 'Only an admin can change someone''s chapter.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ------------------------------------------------------------
-- 2. programs: writing limited to the chapter that owns it
-- ------------------------------------------------------------
drop policy if exists "Authenticated users can insert programs" on public.programs;
drop policy if exists "Authenticated users can update programs" on public.programs;
drop policy if exists "Authenticated users can read programs"   on public.programs;
drop policy if exists prog_read   on public.programs;
drop policy if exists prog_insert on public.programs;
drop policy if exists prog_update on public.programs;
drop policy if exists prog_delete on public.programs;

-- Reading everything nationally is deliberate and stays.
create policy prog_read on public.programs
  for select to authenticated using (true);

create policy prog_insert on public.programs
  for insert to authenticated with check (
    public.is_admin()
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  );

create policy prog_update on public.programs
  for update to authenticated using (
    public.is_admin()
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  ) with check (
    public.is_admin()
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  );

create policy prog_delete on public.programs
  for delete to authenticated using (public.is_admin());

-- A coordinator can edit their own chapter's programme, but approving it
-- is not theirs to do. This allows only the status changes that belong to
-- a coordinator: submitting or resubmitting, and marking one complete
-- once the report is in. Everything else is an admin decision.
create or replace function public.guard_program_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (
      new.status = 'Pending'
      or (new.status = 'Complete' and old.status in ('Approved', 'Live'))
    ) then
      raise exception 'Only an admin can move a programme to %.', new.status;
    end if;
  end if;

  if new.nc_comment is distinct from old.nc_comment then
    raise exception 'Only an admin can leave a review comment.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_program_status on public.programs;
create trigger trg_guard_program_status
  before update on public.programs
  for each row execute function public.guard_program_status();

-- ------------------------------------------------------------
-- 3. reports: same ownership rule, plus the missing update rule
-- ------------------------------------------------------------
drop policy if exists "Authenticated users can insert reports" on public.reports;
drop policy if exists "Authenticated users can read reports"   on public.reports;
drop policy if exists rep_read   on public.reports;
drop policy if exists rep_insert on public.reports;
drop policy if exists rep_update on public.reports;
drop policy if exists rep_delete on public.reports;

create policy rep_read on public.reports
  for select to authenticated using (true);

create policy rep_insert on public.reports
  for insert to authenticated with check (
    public.is_admin()
    or exists (
      select 1 from public.programs p
      where p.id = reports.program_id
        and public.dir_role() = 'RC'
        and p.chapter_id = public.dir_chapter()
    )
  );

-- The app saves reports with an upsert, so without this a second save
-- for the same programme fails.
create policy rep_update on public.reports
  for update to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.programs p
      where p.id = reports.program_id
        and public.dir_role() = 'RC'
        and p.chapter_id = public.dir_chapter()
    )
  ) with check (
    public.is_admin()
    or exists (
      select 1 from public.programs p
      where p.id = reports.program_id
        and public.dir_role() = 'RC'
        and p.chapter_id = public.dir_chapter()
    )
  );

create policy rep_delete on public.reports
  for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 4. pending_signups: admin, not National Coordinator
-- ------------------------------------------------------------
-- These still pointed at the old role check, so a National Coordinator
-- who is not an admin could read and delete sign-up requests by going
-- round the app.
drop policy if exists "nc select all" on public.pending_signups;
drop policy if exists "nc delete"     on public.pending_signups;
drop policy if exists ps_admin_select on public.pending_signups;
drop policy if exists ps_admin_delete on public.pending_signups;

create policy ps_admin_select on public.pending_signups
  for select to authenticated using (public.is_admin());

create policy ps_admin_delete on public.pending_signups
  for delete to authenticated using (public.is_admin());

-- "self insert" and "self select" stay exactly as they are. Someone
-- signing up needs to file their own request and see that it went in.

-- ------------------------------------------------------------
-- 5. chapters: admins can now manage these from the app
-- ------------------------------------------------------------
-- Reading was already open, which is right. There was no way to add a
-- chapter at all except through the Supabase dashboard. Adding one now
-- also creates its messaging channel automatically.
drop policy if exists ch_admin_insert on public.chapters;
drop policy if exists ch_admin_update on public.chapters;
drop policy if exists ch_admin_delete on public.chapters;

create policy ch_admin_insert on public.chapters
  for insert to authenticated with check (public.is_admin());
create policy ch_admin_update on public.chapters
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ch_admin_delete on public.chapters
  for delete to authenticated using (public.is_admin());

do $$ begin
  raise notice 'Old tables closed. Roles and admin access can now only change through the admin functions.';
end $$;

-- ============================================================
-- Run this afterwards to confirm. Everything in the result should
-- read the way you expect, and nothing should say USING: true for
-- an insert, update or delete.
-- ============================================================
-- select tablename, policyname, cmd,
--        'USING: ' || coalesce(qual,'-') || '   CHECK: ' || coalesce(with_check,'-') as rule
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('programs','reports','pending_signups','profiles','chapters')
-- order by tablename, cmd, policyname;
