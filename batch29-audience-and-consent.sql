-- ============================================================
-- YCDI Programme Hub
-- Batch 29: the audience (who can be emailed, and who must not be)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH29-MARKER audience-and-consent
--
-- What this is
-- ------------
-- The first stage of email campaigns. Nothing in this batch sends an
-- email. It builds the two things a campaign must be able to trust
-- before it is allowed to send anything:
--
--   1. audience_contacts. The people outside the Hub that YCDI writes
--      to: donors, funders, church and school partners, alumni. The
--      Hub has never held these people, so there was nothing to send
--      to. Each contact records the lawful basis YCDI holds their
--      details on (YCDI-LEG-003 section 2.1), and where the contact
--      came from.
--
--   2. email_suppressions. The do-not-email list. One row per address
--      that must never receive a campaign: someone who unsubscribed,
--      an address that bounced, a complaint, or a manual stop. It is a
--      separate table from the contacts on purpose. If a contact is
--      later deleted (a data-subject erasure request) or entered
--      again by mistake, the stop must survive it, so the block is
--      kept against the address itself.
--
-- It also adds audience_segment_counts(), which says how many people
-- each segment would reach and how many are blocked. That is the same
-- question the sending stage will ask before it sends.
--
-- Who may use it
-- --------------
-- YCDI-STR-004 section 2.3: donor data is strictly confidential and
-- accessible only to the National Coordinator, the Communications
-- Officer and the Financial Secretary. So:
--
--   read    National Coordinator, COMMS seat, FIN seat
--   write   National Coordinator, COMMS seat
--
-- The admin flag opens nothing here. It is a technical flag that ends
-- up on whoever keeps the system running, and the policy does not name
-- that person.
--
-- Two policy points built into the data
-- -------------------------------------
--   * A donor must carry a tier. Champions and Partners are meant to
--     get personal contact (YCDI-STR-004 section 2.1), so the segment
--     counts keep them, in-kind donors and grant funders out of the
--     broadcast segments by default. A donor with no tier could be
--     swept into a mass email by accident, so the table refuses one.
--   * Only adults are held here. Under-18 participants and their
--     guardians are deliberately not part of this audience: a
--     newsletter is a different purpose from the one they gave their
--     details for (YCDI-LEG-003 purpose limitation).
--
-- Additive throughout. New tables, functions and row rules. It alters
-- nothing that already exists. It reads directory_members,
-- directory_contacts and volunteer_records (Batch 6a) and the NEC
-- seat helpers (Batch 18).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers, re-declared so this file stands on its own
-- ------------------------------------------------------------
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- May this person look at the audience? NC, or the COMMS or FIN seat.
-- Deliberately not is_admin(): see the header.
create or replace function public.can_read_audience()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('COMMS'), false)
      or coalesce(public.holds_portfolio('FIN'), false)
$$;
grant execute on function public.can_read_audience() to authenticated;

-- May this person change it? NC, or the COMMS seat. FIN reads only.
create or replace function public.can_manage_audience()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('COMMS'), false)
$$;
grant execute on function public.can_manage_audience() to authenticated;

-- ------------------------------------------------------------
-- 1. audience_contacts
-- ------------------------------------------------------------
create table if not exists public.audience_contacts (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null check (btrim(full_name) <> ''),
  -- Always stored lower-case and trimmed (see the trigger below), so
  -- one address is one row and the do-not-email list matches it exactly.
  email         text not null unique
                  check (email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  organisation  text,
  category      text not null
                  check (category in ('donor','funder','church_partner','school_partner','alumni','other')),
  -- YCDI-STR-004 section 2.1. Required for a donor, refused for anyone else.
  donor_tier    text
                  check (donor_tier is null or donor_tier in ('champion','partner','supporter','friend','in_kind')),
  chapter_id    uuid references public.chapters(id) on delete set null,
  source        text,
  -- YCDI-LEG-003 section 2.1 lists the bases YCDI relies on for donors
  -- and partners. Which one applies is a judgment for whoever owns that
  -- policy; the table only insists that one is recorded.
  lawful_basis  text not null
                  check (lawful_basis in ('consent','contract','legitimate_interest')),
  basis_note    text,
  basis_recorded_on date not null default current_date,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint audience_tier_matches_category_ck
    check ((category = 'donor') = (donor_tier is not null))
);

create index if not exists audience_contacts_category_idx
  on public.audience_contacts (category, donor_tier);

create or replace function public.audience_normalise()
returns trigger language plpgsql as $$
begin
  new.email     := lower(btrim(new.email));
  new.full_name := btrim(new.full_name);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists audience_normalise_trg on public.audience_contacts;
create trigger audience_normalise_trg
  before insert or update on public.audience_contacts
  for each row execute function public.audience_normalise();

alter table public.audience_contacts enable row level security;

drop policy if exists audience_read   on public.audience_contacts;
drop policy if exists audience_insert on public.audience_contacts;
drop policy if exists audience_update on public.audience_contacts;
drop policy if exists audience_delete on public.audience_contacts;

create policy audience_read on public.audience_contacts
  for select to authenticated using (public.can_read_audience());

create policy audience_insert on public.audience_contacts
  for insert to authenticated
  with check (public.can_manage_audience() and created_by = auth.uid());

create policy audience_update on public.audience_contacts
  for update to authenticated
  using (public.can_manage_audience())
  with check (public.can_manage_audience());

-- A contact can be deleted (an erasure request). Their stop, if they
-- had one, is kept in email_suppressions and is not touched.
create policy audience_delete on public.audience_contacts
  for delete to authenticated using (public.can_manage_audience());

grant select, insert, update, delete on public.audience_contacts to authenticated;

-- ------------------------------------------------------------
-- 2. email_suppressions, the do-not-email list
-- ------------------------------------------------------------
create table if not exists public.email_suppressions (
  email       text primary key
                check (email = lower(btrim(email))),
  reason      text not null
                check (reason in ('unsubscribed','bounced','complaint','manual')),
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;

drop policy if exists suppress_read on public.email_suppressions;
create policy suppress_read on public.email_suppressions
  for select to authenticated using (public.can_read_audience());

-- Read only from the app. A stop is added through suppress_email() (or,
-- later, by the unsubscribe link and the provider's bounce and complaint
-- notices, which use the server key) and is never edited or removed by a
-- signed-in user. Withdrawal has immediate effect (YCDI-LEG-003 2.5), so
-- there is deliberately no button that undoes one.
revoke all on public.email_suppressions from authenticated;
grant select on public.email_suppressions to authenticated;

create or replace function public.suppress_email(
  p_email  text,
  p_reason text default 'unsubscribed',
  p_note   text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.can_manage_audience() then
    raise exception 'The do-not-email list is managed by the National Coordinator and the Communications seat.';
  end if;
  if e = '' or position('@' in e) = 0 then
    raise exception 'That is not an email address.';
  end if;
  if p_reason not in ('unsubscribed','bounced','complaint','manual') then
    raise exception 'Unknown reason.';
  end if;
  -- Already stopped: keep the original record, and its original reason.
  insert into public.email_suppressions (email, reason, note, created_by)
  values (e, p_reason, p_note, auth.uid())
  on conflict (email) do nothing;
end $$;

grant execute on function public.suppress_email(text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. Segment counts
-- ------------------------------------------------------------
-- How many people each segment would reach, and how many are blocked
-- by the do-not-email list. Counts only; it never returns an address.
--
-- People in the Hub: a person with a Hub login and an email in the
-- private contacts table.
-- People outside: audience_contacts.
--
-- broadcast_default says whether the segment is meant to receive mass
-- email. False for Champions, Partners, in-kind donors and grant
-- funders, who YCDI-STR-004 gives personal contact.
create or replace function public.audience_segment_counts()
returns table (
  segment           text,
  label             text,
  kind              text,
  broadcast_default boolean,
  emailable         integer,
  blocked           integer
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.can_read_audience() then
    raise exception 'The audience is for the National Coordinator and the Communications and Finance seats.';
  end if;

  return query
  with pairs as (
    select 'team_all'::text as seg, dc.email as em
      from public.directory_members dm
      join public.directory_contacts dc on dc.member_id = dm.id
      join public.profiles pr on pr.id = dm.profile_id
     where nullif(btrim(dc.email), '') is not null
    union all
    select 'team_rcs', dc.email
      from public.directory_members dm
      join public.directory_contacts dc on dc.member_id = dm.id
      join public.profiles pr on pr.id = dm.profile_id
     where nullif(btrim(dc.email), '') is not null and pr.role = 'RC'
    union all
    select 'volunteers_active', dc.email
      from public.directory_members dm
      join public.directory_contacts dc on dc.member_id = dm.id
      join public.volunteer_records vr on vr.profile_id = dm.profile_id
     where nullif(btrim(dc.email), '') is not null and vr.status = 'active'
    union all
    select case
             when ac.category = 'donor' and ac.donor_tier in ('champion','partner','in_kind') then 'donors_personal'
             when ac.category = 'donor' then 'donors_broadcast'
             when ac.category = 'funder' then 'funders'
             when ac.category = 'church_partner' then 'church_partners'
             when ac.category = 'school_partner' then 'school_partners'
             when ac.category = 'alumni' then 'alumni'
             else 'other_contacts'
           end, ac.email
      from public.audience_contacts ac
  ),
  scored as (
    select p.seg, lower(btrim(p.em)) as em,
           exists (select 1 from public.email_suppressions s
                    where s.email = lower(btrim(p.em))) as is_blocked
      from pairs p
  )
  select d.seg, d.lbl, d.knd, d.brd,
         (count(distinct sc.em) filter (where not sc.is_blocked))::integer,
         (count(distinct sc.em) filter (where sc.is_blocked))::integer
    from (values
      ('team_all',          'Everyone with a Hub login',                'hub',     true,  1),
      ('team_rcs',          'Regional Coordinators',                    'hub',     true,  2),
      ('volunteers_active', 'Active volunteers',                        'hub',     true,  3),
      ('donors_broadcast',  'Supporters and Friends (donors)',          'outside', true,  4),
      ('donors_personal',   'Champions, Partners and in-kind donors',   'outside', false, 5),
      ('funders',           'Grant funders',                            'outside', false, 6),
      ('church_partners',   'Church partners',                          'outside', true,  7),
      ('school_partners',   'School partners',                          'outside', true,  8),
      ('alumni',            'Alumni',                                   'outside', true,  9),
      ('other_contacts',    'Other contacts',                           'outside', true, 10)
    ) as d(seg, lbl, knd, brd, ord)
    left join scored sc on sc.seg = d.seg
   group by d.seg, d.lbl, d.knd, d.brd, d.ord
   order by d.ord;
end $$;

grant execute on function public.audience_segment_counts() to authenticated;

-- ============================================================
-- End of Batch 29.
-- ============================================================
