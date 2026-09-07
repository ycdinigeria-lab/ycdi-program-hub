-- ============================================================
-- YCDI Programme Hub - Batch 15
-- Reactions and comments on announcements.
--
-- Paste this into Supabase > SQL Editor and click Run.
-- Safe to run more than once (idempotent).
--
-- What this adds:
--   announcement_reactions  - one row per person per reaction on an
--                             announcement. Fixed set of five reactions,
--                             stored as short codes, drawn as emoji in the app:
--                               like = 👍  love = ❤️  pray = 🙏
--                               fire = 🔥  celebrate = 🎉
--   announcement_comments   - a comment thread under each announcement.
--
-- The rule that matters:
--   Reactions and comments follow the announcement's OWN visibility.
--   If you can see the announcement, you can react and comment on it and
--   read what others said. A chapter notice stays inside that chapter;
--   a general notice is open to everyone signed in. The National
--   Coordinator sees everything, exactly as with the announcement itself.
--
--   You can always remove your own reaction and delete your own comment.
--   The National Coordinator and admins can delete any comment, so the
--   organisation keeps a moderation hand even though it should rarely be
--   needed.
--
-- Note: participants (the young people) are not users of this hub, so this
-- is entirely between staff and volunteers.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Visibility helper
--    Mirrors the announcements SELECT policy in one place so the
--    comment and reaction rules cannot drift away from it. Security
--    definer so it can read the announcement row regardless of the
--    caller, which also keeps the policies simple and join-free.
-- ------------------------------------------------------------
create or replace function public.can_see_announcement(a_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.announcements a
    where a.id = a_id
      and (
        a.scope = 'general'
        or public.dir_role() = 'NC'
        or (a.scope = 'chapter' and a.chapter_id = public.dir_chapter())
      )
  )
$$;

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
create table if not exists public.announcement_reactions (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reaction        text not null,
  created_at      timestamptz not null default now(),
  constraint announcement_reactions_kind_ck
    check (reaction in ('like', 'love', 'pray', 'fire', 'celebrate')),
  constraint announcement_reactions_unique
    unique (announcement_id, user_id, reaction)
);
create index if not exists idx_ann_react_announcement
  on public.announcement_reactions (announcement_id);

create table if not exists public.announcement_comments (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  created_by      uuid references public.profiles(id) on delete set null,
  author_name     text,
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ann_comment_announcement
  on public.announcement_comments (announcement_id, created_at);

-- ------------------------------------------------------------
-- 2. Row level security: reactions
-- ------------------------------------------------------------
alter table public.announcement_reactions enable row level security;

drop policy if exists ann_react_select on public.announcement_reactions;
create policy ann_react_select on public.announcement_reactions
  for select to authenticated
  using (public.can_see_announcement(announcement_id));

drop policy if exists ann_react_insert on public.announcement_reactions;
create policy ann_react_insert on public.announcement_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_see_announcement(announcement_id)
  );

-- A reaction is add or remove, never edited, so there is no update policy.
drop policy if exists ann_react_delete on public.announcement_reactions;
create policy ann_react_delete on public.announcement_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. Row level security: comments
-- ------------------------------------------------------------
alter table public.announcement_comments enable row level security;

drop policy if exists ann_comment_select on public.announcement_comments;
create policy ann_comment_select on public.announcement_comments
  for select to authenticated
  using (public.can_see_announcement(announcement_id));

drop policy if exists ann_comment_insert on public.announcement_comments;
create policy ann_comment_insert on public.announcement_comments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_see_announcement(announcement_id)
  );

-- Comments are delete-only, never edited, so there is no update policy.
drop policy if exists ann_comment_delete on public.announcement_comments;
create policy ann_comment_delete on public.announcement_comments
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.dir_role() = 'NC'
    or public.is_admin()
  );

-- ------------------------------------------------------------
-- 4. Realtime not required; the app reloads on its own actions.
-- ------------------------------------------------------------
