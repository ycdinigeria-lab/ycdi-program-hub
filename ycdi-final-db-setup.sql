-- ============================================================
-- YCDI Programme Hub - final database setup (one file)
-- Paste this whole file into Supabase > SQL Editor and click Run.
--
-- This is safe to run even if you have run the earlier directory
-- or privacy scripts already. It only ever moves things toward the
-- final state, it never duplicates data and never opens anything
-- back up. If in doubt, just run it once.
-- ============================================================

-- 1. Directory table ------------------------------------------
create table if not exists public.directory_members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  role_title  text,
  chapter_id  uuid references public.chapters(id) on delete set null,
  email       text,
  phone       text,
  bio         text,
  photo_url   text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Helpers that read the signed-in person's role and chapter -
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

-- 3. Directory permission rules -------------------------------
alter table public.directory_members enable row level security;

drop policy if exists dir_read   on public.directory_members;
drop policy if exists dir_insert on public.directory_members;
drop policy if exists dir_update on public.directory_members;
drop policy if exists dir_delete on public.directory_members;

create policy dir_read on public.directory_members
  for select to authenticated using (true);

create policy dir_insert on public.directory_members
  for insert to authenticated with check (
    public.dir_role() = 'NC'
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  );

create policy dir_update on public.directory_members
  for update to authenticated using (
    public.dir_role() = 'NC'
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  ) with check (
    public.dir_role() = 'NC'
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  );

create policy dir_delete on public.directory_members
  for delete to authenticated using (
    public.dir_role() = 'NC'
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  );

-- 4. Member photos: private bucket, signed links only ----------
insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;
update storage.buckets set public = false where id = 'member-photos';

drop policy if exists "member photos read"   on storage.objects;
drop policy if exists member_photos_read       on storage.objects;
drop policy if exists "member photos upload" on storage.objects;
drop policy if exists "member photos change" on storage.objects;

create policy member_photos_read on storage.objects
  for select to authenticated using (bucket_id = 'member-photos');
create policy "member photos upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'member-photos');
create policy "member photos change" on storage.objects
  for update to authenticated using (bucket_id = 'member-photos');

-- 5. Prayer manual text: signed-in users only -----------------
alter table public.prayer_parts    enable row level security;
alter table public.prayer_chapters enable row level security;

drop policy if exists "prayer_parts public read"    on public.prayer_parts;
drop policy if exists "prayer_chapters public read" on public.prayer_chapters;
drop policy if exists prayer_parts_read              on public.prayer_parts;
drop policy if exists prayer_chapters_read            on public.prayer_chapters;

create policy prayer_parts_read on public.prayer_parts
  for select to authenticated using (true);
create policy prayer_chapters_read on public.prayer_chapters
  for select to authenticated using (true);

-- 6. Prayer manual PDFs: private bucket, signed links only -----
update storage.buckets set public = false where id = 'prayer-manual';

drop policy if exists "prayer manual public read" on storage.objects;
drop policy if exists prayer_manual_read           on storage.objects;

create policy prayer_manual_read on storage.objects
  for select to authenticated using (bucket_id = 'prayer-manual');

-- 7. Seed leadership and coordinators (only if directory empty) -
insert into public.directory_members (full_name, role_title, chapter_id, bio)
select v.full_name, v.role_title,
       (select id from public.chapters where name = v.chapter_name limit 1),
       v.bio
from (values
  ($$Dr. Donatus M. Egbonim$$, $$Founder & International Coordinator$$, null::text,
    $$Founder of YCDI and its International Coordinator, holding the overall vision and spiritual direction of the ministry.$$),
  ($$Olatunji Christopher Oshiobughie$$, $$National Coordinator$$, null,
    $$National Coordinator, overseeing YCDI's programmes, coordinators and chapters across Nigeria.$$),
  ($$Ifeoma Chukwu$$, $$National Financial Secretary$$, null,
    $$National Financial Secretary, responsible for YCDI's financial records, budgets and reporting.$$),
  ($$George Djhorba$$, $$Regional Coordinator$$, $$Benin$$,
    $$Regional Coordinator for the Benin chapter, leading local outreach, discipleship and volunteers.$$),
  ($$Azuyumele Evans$$, $$Regional Coordinator$$, $$Auchi$$,
    $$Regional Coordinator for the Auchi chapter, leading local outreach, discipleship and volunteers.$$),
  ($$Abisere Caleb$$, $$Regional Coordinator$$, $$Ondo$$,
    $$Regional Coordinator for the Ondo chapter, leading local outreach, discipleship and volunteers.$$),
  ($$Abiodun Israel$$, $$Regional Coordinator$$, $$Osun$$,
    $$Regional Coordinator for the Osun chapter, leading local outreach, discipleship and volunteers.$$),
  ($$Tunde Godfrey$$, $$Regional Coordinator$$, $$Lagos$$,
    $$Regional Coordinator for the Lagos chapter, leading local outreach, discipleship and volunteers.$$)
) as v(full_name, role_title, chapter_name, bio)
where not exists (select 1 from public.directory_members);

-- Done.
