-- ============================================================
-- YCDI Programme Hub - Stage 2 addition
-- Paste this into Supabase > SQL Editor and click Run.
--
-- This adds two new tables:
--   announcements  - notices, general or per-chapter
--   events         - calendar entries, general or per-chapter
--
-- Rules that get enforced:
--   * Everyone signed in sees general notices and events.
--   * Chapter notices and events are seen only by that chapter,
--     plus the National Coordinator, who sees everything.
--   * General ones can only be posted by the National Coordinator.
--   * Chapter ones can be posted by the National Coordinator or by
--     that chapter's own Regional Coordinator.
--   * Team Members can read but not post.
--
-- Safe to run more than once.
-- ============================================================

-- Re-declare the two helper functions so this file stands on its own.
-- (They already exist from the directory setup; this just makes sure.)
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

-- 1. Tables ---------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  scope       text not null default 'general',   -- 'general' | 'chapter'
  chapter_id  uuid references public.chapters(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  event_date  date not null,
  event_time  text,
  location    text,
  scope       text not null default 'general',   -- 'general' | 'chapter'
  chapter_id  uuid references public.chapters(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Announcements permissions --------------------------------
alter table public.announcements enable row level security;

drop policy if exists ann_read   on public.announcements;
drop policy if exists ann_insert on public.announcements;
drop policy if exists ann_update on public.announcements;
drop policy if exists ann_delete on public.announcements;

create policy ann_read on public.announcements
  for select to authenticated using (
    scope = 'general'
    or public.dir_role() = 'NC'
    or (scope = 'chapter' and chapter_id = public.dir_chapter())
  );

create policy ann_insert on public.announcements
  for insert to authenticated with check (
    (scope = 'general' and public.dir_role() = 'NC')
    or (scope = 'chapter' and (
          public.dir_role() = 'NC'
          or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
       ))
  );

create policy ann_update on public.announcements
  for update to authenticated using (
    public.dir_role() = 'NC'
    or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  ) with check (
    (scope = 'general' and public.dir_role() = 'NC')
    or (scope = 'chapter' and (
          public.dir_role() = 'NC'
          or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
       ))
  );

create policy ann_delete on public.announcements
  for delete to authenticated using (
    public.dir_role() = 'NC'
    or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  );

-- 3. Events permissions ---------------------------------------
alter table public.events enable row level security;

drop policy if exists ev_read   on public.events;
drop policy if exists ev_insert on public.events;
drop policy if exists ev_update on public.events;
drop policy if exists ev_delete on public.events;

create policy ev_read on public.events
  for select to authenticated using (
    scope = 'general'
    or public.dir_role() = 'NC'
    or (scope = 'chapter' and chapter_id = public.dir_chapter())
  );

create policy ev_insert on public.events
  for insert to authenticated with check (
    (scope = 'general' and public.dir_role() = 'NC')
    or (scope = 'chapter' and (
          public.dir_role() = 'NC'
          or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
       ))
  );

create policy ev_update on public.events
  for update to authenticated using (
    public.dir_role() = 'NC'
    or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  ) with check (
    (scope = 'general' and public.dir_role() = 'NC')
    or (scope = 'chapter' and (
          public.dir_role() = 'NC'
          or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
       ))
  );

create policy ev_delete on public.events
  for delete to authenticated using (
    public.dir_role() = 'NC'
    or (scope = 'chapter' and public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
  );

-- Done.
