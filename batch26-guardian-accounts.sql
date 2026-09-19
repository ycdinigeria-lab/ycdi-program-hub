-- ============================================================
-- YCDI Programme Hub
-- Batch 26: guardian accounts (Track 2 of the parent/guardian route)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH26-MARKER guardian-accounts
--
-- What this is
-- ------------
-- Track 2 of the guardian-mediated route agreed after the safeguarding
-- conversation on the youth follow-up module. Track 1 (a mentor manually
-- relaying the Contact log to a parent through an existing channel,
-- WhatsApp, a call, in person) needs no schema and isn't part of this
-- batch. This is what Track 1 graduates into once it's shown real
-- demand: a guardian gets their own login, read-only, to see what's
-- been logged for their child.
--
-- Three points were settled before this was written, each recorded in
-- the feature spec's safeguarding brief:
--   - Content visibility: a guardian sees everything logged, no
--     filtering by compendium cluster.
--   - Relationship model: one guardian record per participant. A
--     person who guards two YCDI siblings gets two separate accounts,
--     one per participant, not one combined view. Documented
--     simplification, not an oversight.
--   - Legal basis for storing a guardian's contact details under
--     YCDI-LEG: settled (recorded in the brief; the actual documented
--     basis lives with whoever owns that policy, not in this file).
--
-- Deliberately scoped to minors only
-- -----------------------------------
-- A guardian account may only be linked for a participant in a minor
-- age band (is_minor_band() = true, from Batch 2). An 18+ participant
-- already has their own account and their own consent-driven contact
-- (Batch 25); giving a guardian full visibility into an adult's
-- activity log without that adult's own consent is a different
-- privacy question entirely, about the adult's own data, not a
-- minor-protection one, and is not decided here. If YCDI later wants
-- a guardian view for an 18+ participant, that needs the participant's
-- own consent, not just the guardian's, and its own migration.
--
-- Still no channel to the minor
-- -------------------------------
-- This does not touch the Standard 2 line Batch 25 already drew. The
-- guardian is the one with the login; the minor still has no account,
-- no messaging, nothing. Read-only, one-way, guardian to their own
-- view of the log, nothing back to the mentor and nothing to the
-- minor through this table.
--
-- What this migration does not cover
-- -------------------------------------
-- Same as Batch 25: the Supabase Auth user and the invite itself are
-- not plain SQL. A guardian-invite Netlify Function, parallel to
-- invite-participant-account.mjs, is the next piece, not part of this
-- file.
--
-- Additive throughout. New tables, a new consent type, their RLS. It
-- alters nothing that already exists.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend the consent vocabulary again
-- ------------------------------------------------------------
alter table public.participant_consents
  drop constraint if exists participant_consents_consent_type_check;

alter table public.participant_consents
  add constraint participant_consents_consent_type_check
  check (consent_type in
    ('registration','photo_published','testimony_named','video','direct_contact','guardian_digest'));

-- ------------------------------------------------------------
-- 2. participant_guardians — the parent/guardian's own contact details
-- ------------------------------------------------------------
-- New personal data about someone who is not YCDI's participant. Kept
-- in its own table rather than folded into participants, so it is
-- never accidentally swept up by anything scoped to the participant
-- record itself, and so it can be governed, exported or deleted on
-- its own if the guardian ever exercises their own data rights.
create table if not exists public.participant_guardians (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  full_name      text not null,
  relationship   text,  -- free text: "mother", "father", "guardian", as given
  phone          text,
  email          text,
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (phone is not null or email is not null)
);

alter table public.participant_guardians enable row level security;

drop policy if exists pg_staff_rw on public.participant_guardians;
create policy pg_staff_rw on public.participant_guardians
  for all to authenticated
  using (public.owns_participant(participant_id) or public.can_touch_participant(
    (select chapter_id from public.participants where id = participant_id)))
  with check (public.owns_participant(participant_id) or public.can_touch_participant(
    (select chapter_id from public.participants where id = participant_id)));

revoke delete on public.participant_guardians from authenticated;
grant select, insert, update on public.participant_guardians to authenticated;

-- ------------------------------------------------------------
-- 3. guardian_accounts — the link between a guardian and a login
-- ------------------------------------------------------------
create table if not exists public.guardian_accounts (
  guardian_id    uuid primary key references public.participant_guardians(id) on delete cascade,
  auth_user_id   uuid not null unique,
  invited_by     uuid not null references public.profiles(id) on delete restrict,
  invited_on     date not null default current_date,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- The standing gate, checked fresh against the participant every time,
-- same shape as Batch 25's enforce_adult_participant_account: minor
-- band required (the inverse of Batch 25's check), and guardian_digest
-- consent required and not withdrawn.
create or replace function public.enforce_guardian_account()
returns trigger language plpgsql as $$
declare v_participant_id uuid; v_band text;
begin
  select participant_id into v_participant_id
    from public.participant_guardians where id = new.guardian_id;

  select age_band into v_band from public.participants where id = v_participant_id;

  if not public.is_minor_band(v_band) then
    raise exception 'Guardian accounts are for minor participants; an 18+ participant has their own direct-contact account instead.';
  end if;

  if not exists (
    select 1 from public.participant_consents
    where participant_id = v_participant_id
      and consent_type = 'guardian_digest'
      and withdrawn_on is null
  ) then
    raise exception 'Guardian-digest consent must be recorded before a guardian account can be linked.';
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_guardian_account on public.guardian_accounts;
create trigger trg_enforce_guardian_account
  before insert or update on public.guardian_accounts
  for each row execute function public.enforce_guardian_account();

create or replace function public.link_guardian_account(
  p_guardian_id  uuid,
  p_auth_user_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_participant_id uuid;
begin
  select participant_id into v_participant_id
    from public.participant_guardians where id = p_guardian_id;

  if v_participant_id is null then
    raise exception 'No such guardian record.';
  end if;

  if not (public.is_admin() or public.can_touch_participant(
            (select chapter_id from public.participants where id = v_participant_id))
          or public.owns_participant(v_participant_id)) then
    raise exception 'Not authorised to link an account for this guardian.';
  end if;

  insert into public.guardian_accounts (guardian_id, auth_user_id, invited_by)
  values (p_guardian_id, p_auth_user_id, auth.uid())
  on conflict (guardian_id) do update
    set auth_user_id = excluded.auth_user_id, active = true;
end $$;

grant execute on function public.link_guardian_account(uuid, uuid) to authenticated;

-- A guardian's own auth.uid(), resolved to the participant they can
-- see, or null if they have no linked active account.
create or replace function public.my_guardian_participant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select g.participant_id
  from public.guardian_accounts ga
  join public.participant_guardians g on g.id = ga.guardian_id
  where ga.auth_user_id = auth.uid() and ga.active
$$;

grant execute on function public.my_guardian_participant_id() to authenticated;

alter table public.guardian_accounts enable row level security;

drop policy if exists ga_staff_read on public.guardian_accounts;
create policy ga_staff_read on public.guardian_accounts
  for select to authenticated
  using (exists (
    select 1 from public.participant_guardians g
    where g.id = guardian_id
      and (public.owns_participant(g.participant_id) or public.can_read_participant(
        (select chapter_id from public.participants where id = g.participant_id)))
  ));

-- ------------------------------------------------------------
-- 4. Guardian read access to the touchpoint log
-- ------------------------------------------------------------
-- One additional policy on the table Batch 24 already created. Read
-- only, never insert, never update. A guardian sees everything logged
-- for their child, per the settled content-visibility decision, no
-- per-row filtering by kind or unit_ref.
drop policy if exists pth_guardian_read on public.participant_touchpoints;
create policy pth_guardian_read on public.participant_touchpoints
  for select to authenticated
  using (participant_id = public.my_guardian_participant_id());

-- A guardian may also want the shape of the journey, not just the
-- touchpoints, same access as this specific participant only.
drop policy if exists ps_guardian_read on public.participant_stages;
create policy ps_guardian_read on public.participant_stages
  for select to authenticated
  using (participant_id = public.my_guardian_participant_id());
