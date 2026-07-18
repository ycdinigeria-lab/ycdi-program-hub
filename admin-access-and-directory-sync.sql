-- ============================================================
-- YCDI Programme Hub - Admin access & directory auto-sync
-- Paste this whole file into Supabase > SQL Editor and click Run.
--
-- What this does:
--   1. Adds an "admin" flag to profiles, separate from RC/TM/NC.
--      A National Coordinator who isn't flagged admin keeps seeing
--      everything nationally, they just can't change it any more.
--   2. Protects against ending up with zero admins by accident.
--   3. Moves every "only NC can change this" rule this app enforces
--      through direct table policies (documents, categories, prayer
--      notes, announcements, events, the directory) over to "only an
--      admin can change this" instead.
--   4. Wraps sign-up approval and program approval in their own
--      functions, so that permission check lives in one place
--      rather than being copied across policies.
--   5. Makes the Directory follow registration automatically: a card
--      is created the moment someone is approved, linked to their
--      account, and kept in sync if their name or chapter changes
--      later. Existing approved members who don't have a card yet
--      get backfilled once. If someone already has a hand-made card
--      under the same name, it gets linked instead of duplicated.
--   6. Sets the two admins you named.
--
-- IMPORTANT AND HONEST CAVEAT: this script only rewrites the rules
-- for tables this project's own SQL files created (documents,
-- categories, prayer notes, announcements, events, the directory).
-- The original `profiles`, `programs`, `pending_signups` and
-- `chapters` tables were set up before these files existed, and I
-- have not seen how their permissions were originally written. To
-- avoid that gap, sign-up approval and program approval now run
-- through the functions below instead of being written directly by
-- the app, so the admin check happens there regardless of what the
-- underlying table rules say. If you want those original tables
-- fully locked down too, run the check at the bottom of this file
-- and send me what it prints back.
--
-- Safe to run more than once.
-- ============================================================

-- 1. Admin flag and helper --------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- 2. Never allow the last admin to be removed --------------------
create or replace function public.prevent_last_admin_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_admin = true and new.is_admin = false then
    if (select count(*) from public.profiles where is_admin = true) <= 1 then
      raise exception 'At least one admin has to remain. Make someone else admin first.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_admin on public.profiles;
create trigger trg_prevent_last_admin
  before update of is_admin on public.profiles
  for each row execute function public.prevent_last_admin_removal();

-- 3. Directory auto-sync ------------------------------------------
alter table public.directory_members add column if not exists profile_id uuid references public.profiles(id) on delete cascade;

create unique index if not exists directory_members_profile_id_key
  on public.directory_members(profile_id) where profile_id is not null;

create or replace function public._role_title(r text)
  returns text language sql immutable as $$
  select case r
    when 'NC' then 'National Coordinator'
    when 'RC' then 'Regional Coordinator'
    when 'TM' then 'Team Member'
    else r
  end
$$;

-- Fires whenever a profile is created or its name/role/chapter changes.
-- On creation: looks for an existing hand-made card with the exact same
-- name first (so people already seeded by hand, like an existing National
-- Coordinator entry, get linked rather than duplicated) and only creates
-- a fresh card if nothing matches.
-- On update: keeps name and chapter in step. Deliberately leaves the
-- role_title text alone after creation, in case someone has customised
-- it to something more specific than the generic label, an admin can
-- always update it by hand in the Directory.
create or replace function public.sync_directory_on_profile_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_existing uuid;
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
      set profile_id = new.id,
          chapter_id = new.chapter_id,
          email = coalesce(email, v_email),
          updated_at = now()
      where id = v_existing;
    else
      insert into public.directory_members (full_name, role_title, chapter_id, email, profile_id)
      values (new.full_name, public._role_title(new.role), new.chapter_id, v_email, new.id);
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

drop trigger if exists trg_sync_directory on public.profiles;
create trigger trg_sync_directory
  after insert or update of full_name, role, chapter_id on public.profiles
  for each row execute function public.sync_directory_on_profile_change();

-- One-time backfill for anyone already approved who has no card yet.
do $$
declare
  r record;
  v_email text;
  v_existing uuid;
begin
  for r in
    select p.* from public.profiles p
    where not exists (select 1 from public.directory_members d where d.profile_id = p.id)
  loop
    select id into v_existing
    from public.directory_members
    where profile_id is null
      and lower(trim(full_name)) = lower(trim(r.full_name))
    limit 1;

    select email into v_email from auth.users where id = r.id;

    if v_existing is not null then
      update public.directory_members
      set profile_id = r.id, chapter_id = r.chapter_id, email = coalesce(email, v_email), updated_at = now()
      where id = v_existing;
    else
      insert into public.directory_members (full_name, role_title, chapter_id, email, profile_id)
      values (r.full_name, public._role_title(r.role), r.chapter_id, v_email, r.id);
    end if;
  end loop;
end $$;

-- 4. Functions that centralise the admin check ---------------------
-- These run with elevated rights so they don't depend on whatever the
-- underlying table's own rules say, the check happens inside the
-- function itself.

create or replace function public.set_admin(target_id uuid, make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change admin access.';
  end if;
  update public.profiles set is_admin = make_admin where id = target_id;
end;
$$;

create or replace function public.admin_list_profiles()
returns table (id uuid, full_name text, role text, chapter_id uuid, chapter_name text, is_admin boolean, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view this.';
  end if;
  return query
    select p.id, p.full_name, p.role, p.chapter_id, c.name, p.is_admin, u.email
    from public.profiles p
    left join public.chapters c on c.id = p.chapter_id
    left join auth.users u on u.id = p.id
    order by p.full_name;
end;
$$;

create or replace function public.approve_signup(signup_id uuid, new_role text, new_chapter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_signup record;
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
  values (signup_id, v_signup.full_name, new_role, case when new_role = 'NC' then null else new_chapter_id end);
  delete from public.pending_signups where id = signup_id;
end;
$$;

create or replace function public.reject_signup(signup_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reject sign-ups.';
  end if;
  delete from public.pending_signups where id = signup_id;
end;
$$;

create or replace function public.approve_program(program_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve programs.';
  end if;
  update public.programs set status = 'Approved', nc_comment = '' where id = program_id;
end;
$$;

create or replace function public.return_program(program_id uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can return programs.';
  end if;
  update public.programs set status = 'Returned', nc_comment = note where id = program_id;
end;
$$;

grant execute on function public.set_admin(uuid, boolean)               to authenticated;
grant execute on function public.admin_list_profiles()                  to authenticated;
grant execute on function public.approve_signup(uuid, text, uuid)       to authenticated;
grant execute on function public.reject_signup(uuid)                    to authenticated;
grant execute on function public.approve_program(uuid)                  to authenticated;
grant execute on function public.return_program(uuid, text)             to authenticated;

-- 5. Documents & categories (Stage 3): NC-only write becomes admin-only
alter table public.document_categories enable row level security;
drop policy if exists doccat_insert on public.document_categories;
drop policy if exists doccat_update on public.document_categories;
drop policy if exists doccat_delete on public.document_categories;

create policy doccat_insert on public.document_categories for insert to authenticated with check (public.is_admin());
create policy doccat_update on public.document_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy doccat_delete on public.document_categories for delete to authenticated using (public.is_admin());
-- doccat_read is left as it was: a National Coordinator still sees an
-- nc_only category whether or not they're admin, matching your choice.

alter table public.documents enable row level security;
drop policy if exists doc_insert on public.documents;
drop policy if exists doc_update on public.documents;
drop policy if exists doc_delete on public.documents;

create policy doc_insert on public.documents for insert to authenticated with check (public.is_admin());
create policy doc_update on public.documents for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy doc_delete on public.documents for delete to authenticated using (public.is_admin());

drop policy if exists hub_documents_insert on storage.objects;
drop policy if exists hub_documents_update on storage.objects;
drop policy if exists hub_documents_delete on storage.objects;

create policy hub_documents_insert on storage.objects for insert to authenticated with check (bucket_id = 'hub-documents' and public.is_admin());
create policy hub_documents_update on storage.objects for update to authenticated using (bucket_id = 'hub-documents' and public.is_admin());
create policy hub_documents_delete on storage.objects for delete to authenticated using (bucket_id = 'hub-documents' and public.is_admin());

-- 6. Prayer schedule notes (Stage 1)
drop policy if exists prayer_notes_insert on public.prayer_schedule_notes;
drop policy if exists prayer_notes_update on public.prayer_schedule_notes;

create policy prayer_notes_insert on public.prayer_schedule_notes for insert to authenticated with check (public.is_admin());
create policy prayer_notes_update on public.prayer_schedule_notes for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 7. Announcements & events (Stage 2): the National-Coordinator-can-post-
-- to-general-or-any-chapter power becomes admin-only. A Regional
-- Coordinator posting into their own chapter is unaffected.
drop policy if exists ann_insert on public.announcements;
drop policy if exists ann_update on public.announcements;
drop policy if exists ann_delete on public.announcements;

create policy ann_insert on public.announcements for insert to authenticated with check (
  (scope = 'general' and public.is_admin())
  or (scope = 'chapter' and (public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())))
);
create policy ann_update on public.announcements for update to authenticated using (
  public.is_admin() or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
) with check (
  (scope = 'general' and public.is_admin())
  or (scope = 'chapter' and (public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())))
);
create policy ann_delete on public.announcements for delete to authenticated using (
  public.is_admin() or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
);
-- ann_read is unchanged: a National Coordinator still reads every
-- chapter's announcements whether or not they're admin.

drop policy if exists ev_insert on public.events;
drop policy if exists ev_update on public.events;
drop policy if exists ev_delete on public.events;

create policy ev_insert on public.events for insert to authenticated with check (
  (scope = 'general' and public.is_admin())
  or (scope = 'chapter' and (public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())))
);
create policy ev_update on public.events for update to authenticated using (
  public.is_admin() or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
) with check (
  (scope = 'general' and public.is_admin())
  or (scope = 'chapter' and (public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())))
);
create policy ev_delete on public.events for delete to authenticated using (
  public.is_admin() or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
);

-- 8. Directory (final db setup): NC-anywhere power becomes admin-only.
-- A Regional Coordinator editing their own chapter's people is unaffected.
drop policy if exists dir_insert on public.directory_members;
drop policy if exists dir_update on public.directory_members;
drop policy if exists dir_delete on public.directory_members;

create policy dir_insert on public.directory_members for insert to authenticated with check (
  public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
);
create policy dir_update on public.directory_members for update to authenticated using (
  public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
) with check (
  public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
);
create policy dir_delete on public.directory_members for delete to authenticated using (
  public.is_admin() or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
);

-- 9. Set the two admins you named -----------------------------------
do $$
declare
  v_emails text[] := array['christopher.o.olatunji@gmail.com', 'peculiargenius46@gmail.com'];
  v_email text;
  v_uid uuid;
  v_rows int;
begin
  foreach v_email in array v_emails loop
    select id into v_uid from auth.users where lower(email) = lower(v_email);
    if v_uid is null then
      raise notice '% : no account found. They need to sign up in the app first, then run this file again.', v_email;
      continue;
    end if;
    update public.profiles set is_admin = true where id = v_uid;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise notice '% : has an account but has not been approved yet (no profile row). Approve their sign-up first, with any role, then run this file again.', v_email;
    else
      raise notice '% : is now an admin.', v_email;
    end if;
  end loop;
end $$;

-- Done. Check the "Messages" / "Logs" panel under the results for the
-- three lines above, they'll tell you plainly whether each address is
-- fully set up as admin yet or what's still needed.

-- ============================================================
-- Optional: run this separately if you want me to also lock down
-- programs, pending_signups and the base profiles table directly at
-- the database level (belt and suspenders on top of the functions
-- above). Copy the results and send them back.
-- ============================================================
-- select schemaname, tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('programs','reports','pending_signups','profiles','chapters')
-- order by tablename, cmd;
--
-- select relname, relrowsecurity
-- from pg_class
-- where relname in ('programs','reports','pending_signups','profiles','chapters');
