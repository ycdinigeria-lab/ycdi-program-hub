-- ============================================================
-- YCDI Programme Hub
-- Chapter channels: visible to every National Coordinator
-- ============================================================
-- Run this in the Supabase SQL editor after stage4-messaging.sql.
--
-- What changes:
--   Before, a chapter channel could only be seen by people in that
--   chapter, plus admins. A National Coordinator based at national
--   level (no chapter of their own) saw only General and their DMs.
--
--   After this, anyone with the NC role sees every chapter channel,
--   which matches how announcements, documents and programmes
--   already work for NCs.
--
-- What does NOT change:
--   Direct messages stay private to the two people in them. Admins
--   cannot read them and neither can NCs.
--
-- One thing to know: seeing a channel and posting in it use the same
-- rule, so an NC can also post in any chapter channel. They still
-- cannot delete other people's messages unless they are an admin.
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The one rule about who can be in a channel
-- ------------------------------------------------------------
-- Every policy on channels, channel_members and messages leans on
-- this function, so widening it here widens all of them together.

create or replace function public.can_access_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case (select kind from public.channels where id = cid)
    when 'general' then true
    when 'chapter' then
      (select chapter_id from public.channels where id = cid) = public.dir_chapter()
      or public.is_admin()
      or public.dir_role() = 'NC'
    when 'dm' then
      exists (
        select 1 from public.channel_members m
        where m.channel_id = cid and m.profile_id = auth.uid()
      )
    else false
  end
$$;

-- ------------------------------------------------------------
-- 2. The channel list the app reads
-- ------------------------------------------------------------
-- Same widening, applied to the list that feeds the Messaging screen
-- so the new channels actually appear rather than just being readable.

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
       or (c.kind = 'chapter' and (
             c.chapter_id = public.dir_chapter()
             or public.is_admin()
             or public.dir_role() = 'NC'))
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

grant execute on function public.can_access_channel(uuid) to authenticated;
grant execute on function public.my_channels() to authenticated;
