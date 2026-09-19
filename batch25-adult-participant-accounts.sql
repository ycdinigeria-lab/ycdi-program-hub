-- ============================================================
-- YCDI Programme Hub
-- Batch 25: direct contact for 18+ participants
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH25-MARKER adult-participant-accounts
--
-- What this is
-- ------------
-- Standard 2 (YCDI-SAF-001) rules out private adult-to-minor
-- communication, and Batch 2 enforces that in the database: contact
-- details are refused for anyone under 18. That restriction does not
-- apply to tertiary (18+) participants; YCDI-LEG already permits
-- holding their contact details. This batch gives an 18+ participant
-- who wants it a real, narrow account: a login that can see exactly
-- one thing, a direct-message thread with their assigned mentor.
--
-- It deliberately does NOT reuse the profiles / NC-RC-TM role model.
-- That model carries broad internal visibility, KPI data, other
-- participants' records, safeguarding material. A participant account
-- is a different kind of thing and gets its own narrow tables, so
-- there is no path from "logged in as a participant" to anything
-- else in the Hub.
--
-- What this migration covers, and what it doesn't
-- -------------------------------------------------
-- Covered here: the schema, the hard 18+ gate, consent, and RLS.
-- NOT covered here, and not doable in plain SQL: actually creating
-- the Supabase Auth user and sending the invite. That's a server-side
-- call to the Supabase Admin API (an Edge Function, typically
-- `auth.admin.inviteUserByEmail` or a phone-OTP equivalent), issued
-- by a mentor or RC action in the app. This migration assumes that
-- step produces an auth.users row and hands this file's functions
-- that user's id to link up. Flagging this so the migration isn't
-- mistaken for the whole feature.
--
-- The 18+ gate, enforced twice
-- -----------------------------
-- Once at the moment an account is linked (link_participant_account,
-- below), and again as a standing trigger on participant_accounts
-- itself, so a row can never exist for a non-18+ participant even if
-- something bypasses the function. Belt and braces on purpose: this
-- is the one table in the whole schema that must never, under any
-- code path, end up holding a minor's row.
--
-- Additive throughout. New tables, a new consent type, their RLS. It
-- alters nothing that already exists.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend the consent vocabulary
-- ------------------------------------------------------------
-- A participant needs their own explicit consent to be given a login
-- and a direct line to their mentor. This is a separate consent from
-- 'registration', granular on purpose, matching how Batch 2 already
-- treats photo/testimony/video consent as distinct from registration.
alter table public.participant_consents
  drop constraint if exists participant_consents_consent_type_check;

alter table public.participant_consents
  add constraint participant_consents_consent_type_check
  check (consent_type in
    ('registration','photo_published','testimony_named','video','direct_contact'));

-- ------------------------------------------------------------
-- 2. participant_accounts — the link between a participant and a login
-- ------------------------------------------------------------
create table if not exists public.participant_accounts (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  auth_user_id   uuid not null unique,  -- the auth.users row created by the invite step
  invited_by     uuid not null references public.profiles(id) on delete restrict,
  invited_on     date not null default current_date,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- The standing gate: no row here may ever point at a non-18+
-- participant, checked fresh at insert/update against the
-- participants table, not trusted to whatever called this.
create or replace function public.enforce_adult_participant_account()
returns trigger language plpgsql as $$
declare v_band text;
begin
  select age_band into v_band from public.participants where id = new.participant_id;
  if v_band is distinct from '18+' then
    raise exception 'Participant accounts may only be linked for 18+ participants.';
  end if;
  if not exists (
    select 1 from public.participant_consents
    where participant_id = new.participant_id
      and consent_type = 'direct_contact'
      and withdrawn_on is null
  ) then
    raise exception 'Direct-contact consent must be recorded before an account can be linked.';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_adult_participant_account on public.participant_accounts;
create trigger trg_enforce_adult_participant_account
  before insert or update on public.participant_accounts
  for each row execute function public.enforce_adult_participant_account();

-- Called after the Edge Function has created the auth.users row and
-- the mentor/RC has recorded direct_contact consent. Kept as a
-- function, not a bare insert, so the two are always done together
-- and the trigger above always has both to check.
create or replace function public.link_participant_account(
  p_participant_id uuid,
  p_auth_user_id   uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.can_touch_participant(
            (select chapter_id from public.participants where id = p_participant_id))
          or public.owns_participant(p_participant_id)) then
    raise exception 'Not authorised to link an account for this participant.';
  end if;

  insert into public.participant_accounts (participant_id, auth_user_id, invited_by)
  values (p_participant_id, p_auth_user_id, auth.uid())
  on conflict (participant_id) do update
    set auth_user_id = excluded.auth_user_id, active = true;
end $$;

grant execute on function public.link_participant_account(uuid, uuid) to authenticated;

-- A participant's own auth.uid(), resolved back to their
-- participant_id, or null if they have no linked active account.
create or replace function public.my_participant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select participant_id from public.participant_accounts
  where auth_user_id = auth.uid() and active
$$;

grant execute on function public.my_participant_id() to authenticated;

alter table public.participant_accounts enable row level security;

drop policy if exists pa_staff_read on public.participant_accounts;
create policy pa_staff_read on public.participant_accounts
  for select to authenticated
  using (public.owns_participant(participant_id) or public.can_read_participant(
    (select chapter_id from public.participants where id = participant_id)));

-- ------------------------------------------------------------
-- 3. participant_dm_messages — the one thread a participant account can see
-- ------------------------------------------------------------
-- Deliberately separate from channels/channel_members (Batch 4's
-- messaging), not an extension of it, so a participant account has
-- no path into any staff channel, ever.
create table if not exists public.participant_dm_messages (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  mentor_id      uuid not null references public.profiles(id) on delete cascade,
  sender         text not null check (sender in ('mentor','participant')),
  body           text not null check (char_length(body) between 1 and 2000),
  created_at     timestamptz not null default now()
);

create index if not exists participant_dm_participant_idx
  on public.participant_dm_messages(participant_id, created_at desc);

alter table public.participant_dm_messages enable row level security;

-- The mentor side: only the assigned, currently-active mentor for
-- this participant, same ownership rule used everywhere else
-- (participant_mentors.ended_on is null).
create or replace function public.is_active_mentor(p_participant_id uuid, p_mentor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participant_mentors
    where participant_id = p_participant_id
      and mentor_id = p_mentor_id
      and ended_on is null
  )
$$;

grant execute on function public.is_active_mentor(uuid, uuid) to authenticated;

drop policy if exists pdm_mentor_rw on public.participant_dm_messages;
create policy pdm_mentor_rw on public.participant_dm_messages
  for all to authenticated
  using (public.is_active_mentor(participant_id, auth.uid()))
  with check (
    public.is_active_mentor(participant_id, auth.uid())
    and sender = 'mentor' and mentor_id = auth.uid()
  );

-- The participant side: only their own linked account, only their
-- own thread, only messages sent as themselves.
drop policy if exists pdm_participant_rw on public.participant_dm_messages;
create policy pdm_participant_rw on public.participant_dm_messages
  for all to authenticated
  using (participant_id = public.my_participant_id())
  with check (
    participant_id = public.my_participant_id()
    and sender = 'participant'
  );

revoke delete on public.participant_dm_messages from authenticated;
grant select, insert on public.participant_dm_messages to authenticated;

-- ------------------------------------------------------------
-- 4. Notify the mentor on a new message from a participant
-- ------------------------------------------------------------
create or replace function public.notify_on_participant_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare p_name text;
begin
  if new.sender = 'participant' then
    select full_name into p_name from public.participants where id = new.participant_id;
    perform public.notify_person(
      new.mentor_id, 'participant_message', 'New message',
      coalesce(p_name, 'A participant') || ' sent you a message.',
      'participants', null, new.participant_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_participant_message on public.participant_dm_messages;
create trigger trg_notify_participant_message
  after insert on public.participant_dm_messages
  for each row execute function public.notify_on_participant_message();
