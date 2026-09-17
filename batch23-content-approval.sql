-- ============================================================
-- YCDI Programme Hub
-- Batch 23: the content approval workflow (Communications seat)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH23-MARKER content-approval
--
-- What this is
-- ------------
-- The Communications Officer's module, folded into the Hub rather than
-- built as a separate app. It is the fourth seat grant in the same line
-- as VC (Batch 19), PD (Batch 20) and SEC (Batch 21): the COMMS seat was
-- reserved back in Batch 18 and this is where it earns its access. It
-- also builds the thing that did not exist, the queue where a post is
-- drafted, checked and cleared before it goes out under the YCDI name.
--
-- It follows the approval table in YCDI-COM (Communications and Media),
-- not a looser one-size chain. That table sets two routes by where the
-- post comes from:
--
--   Chapter post   — prepared by the Regional Coordinator,
--                     approved by the Communications Officer.
--   National post  — prepared by the Communications Officer,
--                     approved by the National Coordinator.
--
-- So the Communications Officer is the approver for chapter content and
-- the author of national content, and the National Coordinator signs off
-- that national content. Two tiers, one table.
--
-- The gate lives here, in the row rules, not on the screen. Whichever
-- account is signed in, the rules decide what it may draft, submit,
-- return or approve. A National Coordinator running a raw query still
-- cannot approve a chapter post, because that is the Communications
-- Officer's to clear, exactly as the Batch 16 reporting chain keeps a
-- forwarded report out of the wrong hands.
--
-- One safeguard, kept from the reporting chain. If the COMMS seat sits
-- empty, chapter posts would have nobody to clear them and would stall.
-- Where the seat is empty, and only then, the National Coordinator stands
-- in as the approver for chapter posts, so content is never stuck waiting
-- on a seat nobody holds. The moment the seat is filled, that fallback
-- closes and the Communications Officer is the approver again.
--
-- The life of a post
--   draft      the author's, private to them until they submit it
--   submitted  in the approver's queue
--   returned   sent back with a note; the author edits and resubmits
--   approved   cleared, ready to publish
--   published  posted; the author or approver marks it done, which is
--              only so the queue does not fill with things already out
--
-- Every status move past the author's own draft runs through a function
-- below, each one checking who the caller is before it moves anything.
-- Direct writes cannot walk a post along the chain.
--
-- Additive throughout. One new table, its helpers, its row rules and the
-- chain functions. It alters nothing that already exists.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers, re-declared so this file stands on its own
-- ------------------------------------------------------------
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Is the Communications seat held by anybody right now? The whole basis
-- of the no-COMMS fallback, so it reads only from the seat table, which a
-- team member cannot touch (Batch 18 gates set_portfolio to NC/admin).
create or replace function public.comms_seat_filled()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nec_portfolios where portfolio = 'COMMS')
$$;
grant execute on function public.comms_seat_filled() to authenticated;

-- Given a post's origin, is the caller its approver?
--   national -> the National Coordinator
--   chapter  -> the Communications Officer, or the National Coordinator
--               only while the COMMS seat is empty
-- It does not depend on which chapter: COMMS is a national seat and
-- clears every chapter's posts.
create or replace function public.reviews_content(p_origin text)
  returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_origin = 'national' then public.dir_role() = 'NC'
    when p_origin = 'chapter'  then
         public.holds_portfolio('COMMS')
      or (not public.comms_seat_filled() and public.dir_role() = 'NC')
    else false
  end
$$;
grant execute on function public.reviews_content(text) to authenticated;

-- ------------------------------------------------------------
-- 1. The table
-- ------------------------------------------------------------
create table if not exists public.content_items (
  id            uuid primary key default gen_random_uuid(),
  origin        text not null check (origin in ('chapter','national')),
  -- The chapter a chapter post belongs to; null for a national post. The
  -- pairing is held below by a check so the two can never disagree.
  chapter_id    uuid references public.chapters(id),
  author_id     uuid not null references public.profiles(id),
  title         text,
  body          text,                       -- the caption / copy itself
  channel       text,                       -- where it will go: Instagram, WhatsApp, website, newsletter...
  -- The content pillar from YCDI-COM 2.4, so the mix can be seen at a
  -- glance. Optional, and held to the six named pillars when set.
  pillar        text check (pillar is null or pillar in
                  ('impact','biblical','program','leadership','behind_scenes','cta')),
  -- A link to, or a note about, the intended image or video. The brand
  -- asset library is a later slice; for now this carries the visual by
  -- reference so the approver can see what is meant to go with the words.
  visual_note   text,
  scheduled_for date,                        -- the proposed publish date
  status        text not null default 'draft'
                  check (status in ('draft','submitted','returned','approved','published')),
  review_note   text,                        -- the approver's note when returning or clearing
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A chapter post names its chapter; a national post never does.
  constraint content_origin_chapter_ck check (
    (origin = 'chapter'  and chapter_id is not null)
    or (origin = 'national' and chapter_id is null)
  )
);

create index if not exists content_status_idx  on public.content_items (status, scheduled_for);
create index if not exists content_author_idx  on public.content_items (author_id);
create index if not exists content_chapter_idx on public.content_items (chapter_id, status);

-- Keep updated_at honest on every write.
create or replace function public.touch_content()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists content_touch on public.content_items;
create trigger content_touch
  before update on public.content_items
  for each row execute function public.touch_content();

-- ------------------------------------------------------------
-- 2. Row rules
-- ------------------------------------------------------------
alter table public.content_items enable row level security;

-- Read. The author always sees their own. The approver sees the posts
-- that are theirs to clear, once those leave draft: the Communications
-- Officer sees chapter posts, the National Coordinator sees national
-- posts (and chapter posts too, but only while the COMMS seat is empty,
-- through reviews_content). A draft stays private to its author until
-- submitted, the same line the reporting chain holds.
drop policy if exists content_read on public.content_items;
create policy content_read on public.content_items for select to authenticated using (
     public.is_admin()
  or author_id = auth.uid()
  or (status <> 'draft' and public.reviews_content(origin))
);

-- Insert. A chapter post is the RC's, for their own chapter. A national
-- post is the Communications Officer's. Admin may seed either, for
-- support. Everything starts as a draft; the chain functions move it on.
drop policy if exists content_insert on public.content_items;
create policy content_insert on public.content_items for insert to authenticated with check (
  status = 'draft'
  and author_id = auth.uid()
  and (
        public.is_admin()
     or (origin = 'chapter'
         and public.dir_role() = 'RC'
         and chapter_id = public.dir_chapter())
     or (origin = 'national'
         and public.holds_portfolio('COMMS'))
  )
);

-- Update by hand only while it is the author's to hold: a draft, or a
-- post returned to them. Every other move is a function below.
drop policy if exists content_update on public.content_items;
create policy content_update on public.content_items for update to authenticated
  using      ( author_id = auth.uid() and status in ('draft','returned') )
  with check ( author_id = auth.uid() and status in ('draft','returned') );

-- Delete only a draft, only your own. Once submitted, a post has been
-- seen and is no longer the author's to erase.
drop policy if exists content_delete on public.content_items;
create policy content_delete on public.content_items for delete to authenticated
  using ( author_id = auth.uid() and status = 'draft' );

grant select, insert, update, delete on public.content_items to authenticated;

-- ------------------------------------------------------------
-- 3. The chain
--    Each is security definer so it can move a row the caller could not
--    move by hand, and each checks the caller first.
-- ------------------------------------------------------------

-- The author sends a draft (or a returned post) up to its approver.
create or replace function public.submit_content(item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = item_id;
  if not found then raise exception 'no such content item'; end if;
  if c.author_id <> auth.uid() then raise exception 'that is not your content'; end if;
  if c.status not in ('draft','returned') then
    raise exception 'only a draft or a returned post can be submitted';
  end if;
  update public.content_items
     set status = 'submitted', submitted_at = now()
   where id = item_id;

  -- Tell the approver it is waiting. A chapter post goes to the COMMS
  -- holder, or the NC if the seat is empty; a national post to the NC.
  if c.origin = 'chapter' then
    perform public.notify_person(
      public.portfolio_holder_or_nc('COMMS'),
      'content_submitted',
      'A post is waiting for review',
      coalesce(c.title, 'Untitled post'),
      'more', 'content', item_id);
  else
    perform public.notify_person(
      (select id from public.profiles where role = 'NC' order by id limit 1),
      'content_submitted',
      'A national post is waiting for review',
      coalesce(c.title, 'Untitled post'),
      'more', 'content', item_id);
  end if;
end $$;

-- The approver sends a submitted post back with a note.
create or replace function public.return_content(item_id uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = item_id;
  if not found then raise exception 'no such content item'; end if;
  if not (public.is_admin() or public.reviews_content(c.origin)) then
    raise exception 'this post is not yours to review';
  end if;
  if c.status <> 'submitted' then
    raise exception 'only a submitted post can be returned';
  end if;
  update public.content_items
     set status = 'returned', review_note = note, reviewed_at = now()
   where id = item_id;
  perform public.notify_person(
    c.author_id, 'content_returned',
    'A post was sent back for changes',
    coalesce(c.title, 'Untitled post'),
    'more', 'content', item_id);
end $$;

-- The approver clears a submitted post. From here it is ready to publish.
create or replace function public.approve_content(item_id uuid, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = item_id;
  if not found then raise exception 'no such content item'; end if;
  if not (public.is_admin() or public.reviews_content(c.origin)) then
    raise exception 'this post is not yours to review';
  end if;
  if c.status <> 'submitted' then
    raise exception 'only a submitted post can be approved';
  end if;
  update public.content_items
     set status = 'approved', review_note = coalesce(note, review_note), reviewed_at = now()
   where id = item_id;
  perform public.notify_person(
    c.author_id, 'content_approved',
    'A post was cleared to publish',
    coalesce(c.title, 'Untitled post'),
    'more', 'content', item_id);
end $$;

-- Marking an approved post as published. Either the author or the
-- approver can, since either may be the one who actually posts it. This
-- only tidies the queue; it records that the thing went out, nothing more.
create or replace function public.publish_content(item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = item_id;
  if not found then raise exception 'no such content item'; end if;
  if not (public.is_admin()
          or c.author_id = auth.uid()
          or public.reviews_content(c.origin)) then
    raise exception 'this post is not yours to publish';
  end if;
  if c.status <> 'approved' then
    raise exception 'only an approved post can be marked published';
  end if;
  update public.content_items
     set status = 'published', published_at = now()
   where id = item_id;
end $$;

grant execute on function
  public.submit_content(uuid),
  public.return_content(uuid, text),
  public.approve_content(uuid, text),
  public.publish_content(uuid)
  to authenticated;

-- ============================================================
-- End of Batch 23.
-- ============================================================
