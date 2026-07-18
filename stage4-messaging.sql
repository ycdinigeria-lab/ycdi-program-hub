-- ============================================================
-- YCDI Programme Hub - Stage 4: Messaging
-- Paste this whole file into Supabase > SQL Editor and click Run.
--
-- What this creates:
--   channels          - one General channel, one per chapter, plus
--                       a private one for each pair of people talking
--   channel_members   - who is in a direct message
--   messages          - the messages themselves
--   channel_reads     - how far each person has read, for unread counts
--
-- Who can see what:
--   General      - everyone signed in
--   Chapter      - that chapter's own people, plus admins
--   Direct       - the two people in it, and nobody else. Not admins
--                  either. See the note further down about this.
--
-- Chapter channels are created automatically, both for the chapters
-- you already have and for any you add later. Renaming a chapter
-- renames its channel.
--
-- Safe to run more than once.
-- ============================================================

-- Helpers, re-declared so this file stands on its own.
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
create table if not exists public.channels (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('general', 'chapter', 'dm')),
  name       text,
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Only ever one General channel, and only ever one per chapter.
create unique index if not exists channels_one_general
  on public.channels((kind)) where kind = 'general';
create unique index if not exists channels_one_per_chapter
  on public.channels(chapter_id) where kind = 'chapter';

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (channel_id, profile_id)
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_time_idx
  on public.messages(channel_id, created_at desc);

create table if not exists public.channel_reads (
  channel_id   uuid not null references public.channels(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

-- ------------------------------------------------------------
-- 2. One rule about who can be in a channel, used everywhere
-- ------------------------------------------------------------
-- Runs with elevated rights so it can look inside the channels table
-- without tripping over that table's own rules.
create or replace function public.can_access_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case (select kind from public.channels where id = cid)
    when 'general' then true
    when 'chapter' then
      (select chapter_id from public.channels where id = cid) = public.dir_chapter()
      or public.is_admin()
    when 'dm' then
      exists (
        select 1 from public.channel_members m
        where m.channel_id = cid and m.profile_id = auth.uid()
      )
    else false
  end
$$;

-- ------------------------------------------------------------
-- 3. Permissions
-- ------------------------------------------------------------
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;
alter table public.channel_reads   enable row level security;

drop policy if exists ch_read on public.channels;
create policy ch_read on public.channels
  for select to authenticated using (public.can_access_channel(id));
-- Channels are never created from the app directly. General and chapter
-- ones are made by trigger, direct ones by the function below, so there
-- is deliberately no insert, update or delete policy here.

drop policy if exists chm_read on public.channel_members;
create policy chm_read on public.channel_members
  for select to authenticated using (public.can_access_channel(channel_id));

drop policy if exists msg_read   on public.messages;
drop policy if exists msg_insert on public.messages;
drop policy if exists msg_delete on public.messages;

create policy msg_read on public.messages
  for select to authenticated using (public.can_access_channel(channel_id));

create policy msg_insert on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and public.can_access_channel(channel_id)
  );

-- You can always remove your own message. An admin can remove anyone's,
-- but only in General and chapter channels, never inside a direct message.
create policy msg_delete on public.messages
  for delete to authenticated using (
    sender_id = auth.uid()
    or (
      public.is_admin()
      and (select kind from public.channels where id = messages.channel_id) <> 'dm'
    )
  );

drop policy if exists rd_read   on public.channel_reads;
drop policy if exists rd_insert on public.channel_reads;
drop policy if exists rd_update on public.channel_reads;

create policy rd_read on public.channel_reads
  for select to authenticated using (profile_id = auth.uid());
create policy rd_insert on public.channel_reads
  for insert to authenticated with check (profile_id = auth.uid());
create policy rd_update on public.channel_reads
  for update to authenticated using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ------------------------------------------------------------
-- 4. General and chapter channels, created and kept in step
-- ------------------------------------------------------------
insert into public.channels (kind, name)
select 'general', 'General'
where not exists (select 1 from public.channels where kind = 'general');

create or replace function public.ensure_chapter_channel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.channels (kind, name, chapter_id)
    values ('chapter', new.name || ' Chapter', new.id)
    on conflict do nothing;
  elsif tg_op = 'UPDATE' and new.name is distinct from old.name then
    update public.channels
    set name = new.name || ' Chapter'
    where kind = 'chapter' and chapter_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_chapter_channel on public.chapters;
create trigger trg_ensure_chapter_channel
  after insert or update of name on public.chapters
  for each row execute function public.ensure_chapter_channel();

-- Catch up the chapters that already exist.
insert into public.channels (kind, name, chapter_id)
select 'chapter', c.name || ' Chapter', c.id
from public.chapters c
where not exists (
  select 1 from public.channels ch where ch.kind = 'chapter' and ch.chapter_id = c.id
);

-- ------------------------------------------------------------
-- 5. Starting a direct message
-- ------------------------------------------------------------
-- Finds the existing private channel between you and someone else, or
-- makes one. Returns the channel id either way.
create or replace function public.start_dm(other_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;
  if other_id = me then
    raise exception 'You cannot start a conversation with yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'That person is not a member.';
  end if;

  select c.id into cid
  from public.channels c
  where c.kind = 'dm'
    and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.profile_id = me)
    and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.profile_id = other_id)
    and (select count(*) from public.channel_members m where m.channel_id = c.id) = 2
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into public.channels (kind) values ('dm') returning id into cid;
  insert into public.channel_members (channel_id, profile_id) values (cid, me), (cid, other_id);
  return cid;
end;
$$;

-- ------------------------------------------------------------
-- 6. The channel list, with previews and unread counts
-- ------------------------------------------------------------
-- Doing this in one query keeps the app from firing a request per
-- channel every time the list loads.
create or replace function public.my_channels()
returns table (
  id          uuid,
  kind        text,
  name        text,
  chapter_id  uuid,
  other_id    uuid,
  other_name  text,
  last_body   text,
  last_at     timestamptz,
  unread      integer
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  return query
  with mine as (
    select c.* from public.channels c
    where c.kind = 'general'
       or (c.kind = 'chapter' and (c.chapter_id = public.dir_chapter() or public.is_admin()))
       or (c.kind = 'dm' and exists (
             select 1 from public.channel_members m
             where m.channel_id = c.id and m.profile_id = me))
  ),
  last_msg as (
    select distinct on (m.channel_id)
      m.channel_id, m.body, m.created_at
    from public.messages m
    where m.channel_id in (select mine.id from mine)
    order by m.channel_id, m.created_at desc
  ),
  partner as (
    select m.channel_id, p.id as pid, p.full_name as pname
    from public.channel_members m
    join public.profiles p on p.id = m.profile_id
    where m.channel_id in (select mine.id from mine where mine.kind = 'dm')
      and m.profile_id <> me
  )
  select
    mine.id::uuid,
    mine.kind::text,
    coalesce(mine.name, partner.pname, 'Conversation')::text,
    mine.chapter_id::uuid,
    partner.pid::uuid,
    partner.pname::text,
    last_msg.body::text,
    last_msg.created_at::timestamptz,
    (
      select count(*)::integer from public.messages m2
      where m2.channel_id = mine.id
        and m2.sender_id <> me
        and m2.created_at > coalesce(
          (select r.last_read_at from public.channel_reads r
           where r.channel_id = mine.id and r.profile_id = me),
          '-infinity'::timestamptz)
    )
  from mine
  left join last_msg on last_msg.channel_id = mine.id
  left join partner  on partner.channel_id  = mine.id
  order by last_msg.created_at desc nulls last, mine.kind, coalesce(mine.name, partner.pname);
end;
$$;

-- Who you can start a conversation with. Goes through a function so it
-- doesn't depend on how the profiles table itself is locked down.
create or replace function public.messageable_people()
returns table (id uuid, full_name text, role text, chapter_name text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  return query
    select p.id::uuid, p.full_name::text, p.role::text, c.name::text
    from public.profiles p
    left join public.chapters c on c.id = p.chapter_id
    where p.id <> auth.uid()
    order by p.full_name;
end;
$$;

-- Sender names for the messages on screen.
create or replace function public.channel_messages(cid uuid, limit_n integer default 200)
returns table (
  id          uuid,
  sender_id   uuid,
  sender_name text,
  body        text,
  created_at  timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_channel(cid) then
    raise exception 'You do not have access to that conversation.';
  end if;
  return query
    select m.id::uuid, m.sender_id::uuid, p.full_name::text, m.body::text, m.created_at::timestamptz
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    where m.channel_id = cid
    order by m.created_at desc
    limit greatest(1, least(limit_n, 500));
end;
$$;

create or replace function public.mark_channel_read(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_channel(cid) then
    return;
  end if;
  insert into public.channel_reads (channel_id, profile_id, last_read_at)
  values (cid, auth.uid(), now())
  on conflict (channel_id, profile_id)
  do update set last_read_at = now();
end;
$$;

grant execute on function public.start_dm(uuid)                    to authenticated;
grant execute on function public.my_channels()                     to authenticated;
grant execute on function public.messageable_people()              to authenticated;
grant execute on function public.channel_messages(uuid, integer)   to authenticated;
grant execute on function public.mark_channel_read(uuid)           to authenticated;
grant execute on function public.can_access_channel(uuid)          to authenticated;

-- ------------------------------------------------------------
-- 7. Live updates
-- ------------------------------------------------------------
-- Lets new messages appear without refreshing. If this fails, the app
-- still works, it just falls back to checking every few seconds.
do $$
begin
  alter publication supabase_realtime add table public.messages;
  raise notice 'Live updates switched on for messages.';
exception
  when duplicate_object then raise notice 'Live updates were already on.';
  when others then raise notice 'Could not switch on live updates (%). The app will check periodically instead.', sqlerrm;
end $$;

do $$ begin raise notice 'Messaging is ready.'; end $$;

-- Done.
