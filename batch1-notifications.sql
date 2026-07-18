-- ============================================================
-- YCDI Programme Hub
-- Batch 1, part one: in-app notifications
-- ============================================================
-- Run this in the Supabase SQL editor before pushing the code
-- that goes with it. The app expects these tables to exist.
--
-- What this builds:
--   A notifications table, one row per person per thing that
--   happened, and triggers that write those rows automatically
--   when something actually happens on the database. Nothing in
--   the app decides whether to notify, so a notification can't
--   go missing because a screen forgot to send one.
--
-- Events covered:
--   - somebody requests an account          -> every admin
--   - a programme is submitted              -> every admin
--   - a programme is approved               -> whoever submitted it
--   - a programme is returned               -> whoever submitted it
--   - a sign-up is approved                 -> the new member
--   - a message is posted                   -> everyone in that channel
--
-- Not covered, deliberately: a rejected sign-up. That person has
-- no profile, so there is nowhere in the app to put the notice.
-- It has to be an email, which is part two.
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The table
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  link_section text,
  link_view    text,
  ref_id       uuid,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

-- The bell asks two questions constantly: what are my unread ones,
-- and how many. Both are answered by this index.
create index if not exists notifications_person_unread
  on public.notifications(profile_id, read_at, created_at desc);

-- ------------------------------------------------------------
-- 2. Permissions
-- ------------------------------------------------------------
-- You can read your own notifications and nothing else. Nobody
-- writes to this table by hand, including admins. Rows only ever
-- arrive through the triggers below, which run with elevated
-- rights, so there is deliberately no insert or update policy.

alter table public.notifications enable row level security;

drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications
  for select to authenticated using (profile_id = auth.uid());

revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

-- ------------------------------------------------------------
-- 3. The one place a notification gets written
-- ------------------------------------------------------------
create or replace function public.notify_person(
  target       uuid,
  p_kind       text,
  p_title      text,
  p_body       text default null,
  p_section    text default null,
  p_view       text default null,
  p_ref        uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target is null then
    return;
  end if;
  -- No point telling somebody about a thing they just did themselves.
  if target = auth.uid() then
    return;
  end if;
  insert into public.notifications (profile_id, kind, title, body, link_section, link_view, ref_id)
  values (target, p_kind, left(p_title, 200), left(p_body, 500), p_section, p_view, p_ref);
end;
$$;

create or replace function public.notify_admins(
  p_kind    text,
  p_title   text,
  p_body    text default null,
  p_section text default null,
  p_view    text default null,
  p_ref     uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where is_admin loop
    perform public.notify_person(r.id, p_kind, p_title, p_body, p_section, p_view, p_ref);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 4. Somebody asks for an account
-- ------------------------------------------------------------
create or replace function public.notify_new_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins(
    'signup_request',
    'New sign-up request',
    coalesce(new.full_name, 'Someone') || ' has asked to join and is waiting for approval.',
    'programmes', null, new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_new_signup on public.pending_signups;
create trigger trg_notify_new_signup
  after insert on public.pending_signups
  for each row execute function public.notify_new_signup();

-- ------------------------------------------------------------
-- 5. Their account is approved
-- ------------------------------------------------------------
-- A profile row only ever appears through approve_signup, so its
-- arrival is the approval.

create or replace function public.notify_signup_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (profile_id, kind, title, body, link_section)
  values (new.id, 'signup_approved', 'Your account has been approved',
          'Welcome to the YCDI Programme Hub. You can start using it now.', 'programmes');
  return new;
end;
$$;

drop trigger if exists trg_notify_signup_approved on public.profiles;
create trigger trg_notify_signup_approved
  after insert on public.profiles
  for each row execute function public.notify_signup_approved();

-- ------------------------------------------------------------
-- 6. Programmes
-- ------------------------------------------------------------
create or replace function public.notify_program_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chapter text;
begin
  if new.status is distinct from 'Pending' then
    return new;
  end if;
  select name into v_chapter from public.chapters where id = new.chapter_id;
  perform public.notify_admins(
    'program_submitted',
    'Concept note submitted',
    coalesce(v_chapter, 'A chapter') || ' submitted "' || coalesce(new.title, 'a programme') || '" for review.',
    'programmes', null, new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_program_submitted on public.programs;
create trigger trg_notify_program_submitted
  after insert on public.programs
  for each row execute function public.notify_program_submitted();

create or replace function public.notify_program_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chapter text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select name into v_chapter from public.chapters where id = new.chapter_id;

  if new.status = 'Approved' then
    perform public.notify_person(new.submitted_by, 'program_approved',
      'Programme approved',
      '"' || coalesce(new.title, 'Your programme') || '" has been approved. You can go ahead.',
      'programmes', null, new.id);

  elsif new.status = 'Returned' then
    perform public.notify_person(new.submitted_by, 'program_returned',
      'Programme returned for changes',
      coalesce(nullif(new.nc_comment, ''), 'Changes were requested before this can be approved.'),
      'programmes', null, new.id);

  elsif new.status = 'Pending' then
    -- A returned programme sent back up for another look.
    perform public.notify_admins('program_submitted',
      'Concept note resubmitted',
      coalesce(v_chapter, 'A chapter') || ' resubmitted "' || coalesce(new.title, 'a programme') || '".',
      'programmes', null, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_program_status on public.programs;
create trigger trg_notify_program_status
  after update of status on public.programs
  for each row execute function public.notify_program_status();

-- ------------------------------------------------------------
-- 7. Messages
-- ------------------------------------------------------------
-- One notification per channel rather than one per message. If you
-- already have an unread notice about a channel, a second message
-- in the same channel doesn't add another. Otherwise a busy General
-- channel becomes a reason to ignore the bell entirely.

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind    text;
  v_chapter uuid;
  v_name    text;
  v_sender  text;
  r         record;
begin
  select kind, chapter_id, name into v_kind, v_chapter, v_name
  from public.channels where id = new.channel_id;

  select full_name into v_sender from public.profiles where id = new.sender_id;

  for r in
    select p.id from public.profiles p
    where p.id <> new.sender_id
      and (
        v_kind = 'general'
        or (v_kind = 'chapter' and (p.chapter_id = v_chapter or p.is_admin or p.role = 'NC'))
        or (v_kind = 'dm' and exists (
              select 1 from public.channel_members m
              where m.channel_id = new.channel_id and m.profile_id = p.id))
      )
  loop
    -- Skip anyone who hasn't cleared their last notice for this channel.
    if not exists (
      select 1 from public.notifications n
      where n.profile_id = r.id
        and n.kind = 'message'
        and n.ref_id = new.channel_id
        and n.read_at is null
    ) then
      insert into public.notifications (profile_id, kind, title, body, link_section, link_view, ref_id)
      values (r.id, 'message',
              case when v_kind = 'dm'
                   then 'Message from ' || coalesce(v_sender, 'a member')
                   else 'New message in ' || coalesce(v_name, 'a channel') end,
              left(coalesce(new.body, ''), 140),
              'more', 'messaging', new.channel_id);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- ------------------------------------------------------------
-- 8. What the app calls
-- ------------------------------------------------------------
create or replace function public.unread_notification_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.notifications
  where profile_id = auth.uid() and read_at is null
$$;

create or replace function public.my_notifications(max_rows integer default 30)
returns table (
  id           uuid,
  kind         text,
  title        text,
  body         text,
  link_section text,
  link_view    text,
  ref_id       uuid,
  created_at   timestamptz,
  read_at      timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id::uuid, n.kind::text, n.title::text, n.body::text,
         n.link_section::text, n.link_view::text, n.ref_id::uuid,
         n.created_at::timestamptz, n.read_at::timestamptz
  from public.notifications n
  where n.profile_id = auth.uid()
  order by n.created_at desc
  limit least(coalesce(max_rows, 30), 100)
$$;

create or replace function public.mark_notification_read(notification_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where id = notification_id and profile_id = auth.uid() and read_at is null
$$;

create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where profile_id = auth.uid() and read_at is null
$$;

-- Old read notices are not worth keeping forever.
create or replace function public.prune_notifications()
returns void language sql security definer set search_path = public as $$
  delete from public.notifications
  where read_at is not null and read_at < now() - interval '60 days'
$$;

grant execute on function public.unread_notification_count()          to authenticated;
grant execute on function public.my_notifications(integer)            to authenticated;
grant execute on function public.mark_notification_read(uuid)         to authenticated;
grant execute on function public.mark_all_notifications_read()        to authenticated;

-- notify_person and notify_admins are only ever called by the triggers
-- above, never by the app, so they are not granted to anybody.
revoke execute on function public.notify_person(uuid, text, text, text, text, text, uuid) from public, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, text, uuid)       from public, authenticated;
