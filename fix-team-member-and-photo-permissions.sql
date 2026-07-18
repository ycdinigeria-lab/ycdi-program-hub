-- ============================================================
-- YCDI Programme Hub - two fixes
-- Paste this whole file into Supabase > SQL Editor and click Run.
--
--   1. Lets you approve someone as a Team Member. The profiles table
--      has an old rule on it that only ever expected RC and NC, so
--      anything else is rejected. This widens it to allow TM.
--
--   2. Stops any signed-in member from uploading or replacing photos
--      on directory cards. Only an admin, or a Regional Coordinator,
--      can do that now.
--
-- Safe to run more than once. Read the Results panel underneath after
-- running, it prints what it found and changed.
-- ============================================================

-- Make this file stand on its own, in case it gets run before the
-- admin script or out of order.
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1. Allow "TM" as a role
-- ------------------------------------------------------------
-- Finds whatever rule is currently sitting on the role column, prints
-- it so you have a record of it, removes it, then puts back one that
-- accepts all three roles. If the printed old rule mentions anything
-- other than the role values, send it to me before going further.
do $$
declare
  c record;
  found boolean := false;
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    found := true;
    raise notice 'Found existing rule "%" defined as: %', c.conname, c.def;
    execute format('alter table public.profiles drop constraint %I', c.conname);
    raise notice 'Removed "%".', c.conname;
  end loop;

  if not found then
    raise notice 'No existing rule found on the role column. If approving a Team Member still fails after this, the error is coming from somewhere else, send me the exact message.';
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('NC', 'RC', 'TM'));

do $$ begin raise notice 'Role rule is now: NC, RC or TM all accepted.'; end $$;

-- ------------------------------------------------------------
-- 2. Member photos: only admins and Regional Coordinators
-- ------------------------------------------------------------
-- Reading stays open to everyone signed in, since a directory card is
-- no use without its photo. Writing is what gets closed off. This
-- matches the rule already on the directory cards themselves.
drop policy if exists "member photos upload" on storage.objects;
drop policy if exists "member photos change" on storage.objects;
drop policy if exists "member photos remove" on storage.objects;
drop policy if exists member_photos_insert   on storage.objects;
drop policy if exists member_photos_update   on storage.objects;
drop policy if exists member_photos_delete   on storage.objects;

create policy member_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'member-photos'
    and (public.is_admin() or public.dir_role() = 'RC')
  );

create policy member_photos_update on storage.objects
  for update to authenticated using (
    bucket_id = 'member-photos'
    and (public.is_admin() or public.dir_role() = 'RC')
  ) with check (
    bucket_id = 'member-photos'
    and (public.is_admin() or public.dir_role() = 'RC')
  );

create policy member_photos_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'member-photos' and public.is_admin()
  );

do $$ begin raise notice 'Member photos: only admins and Regional Coordinators can upload or replace. Deleting is admin only.'; end $$;

-- Done.
