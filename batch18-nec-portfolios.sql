-- ============================================================
-- YCDI Programme Hub
-- Batch 18: NEC portfolios and accountability
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH18-MARKER nec-portfolios
--
-- What this is
-- ------------
-- The governance amendment (YCDI-GOV-007-A1) folds the unassigned
-- national duties into the seven NEC seats rather than inventing new
-- ones. This gives the app a way to record who holds each seat, so a
-- screen can show whose duty a thing is and a reminder can reach the
-- right person instead of landing on the National Coordinator every
-- time.
--
-- A seat is a label and a routing target. It grants nothing. Whoever
-- holds the Deputy or Secretary seat keeps exactly the access their own
-- role and admin flag already give them. That is deliberate: the whole
-- RLS layer under this stays keyed on NC, RC, TM and is_admin, and none
-- of it moves. So this batch cannot widen anyone's reach, only name a
-- responsibility and point a notification at it.
--
-- Safeguarding is the one to read carefully. The Volunteer Coordinator
-- seat below owns safeguarding *compliance administration*, the chasing
-- of screening, training and declarations. It does NOT touch incident
-- handling, which stays on is_safeguarding_lead and its own row rules
-- from Batch 3. Two different things, kept apart on purpose, exactly as
-- the amendment asks.
--
-- One holder per seat. One person may hold more than one seat, which is
-- what the amendment expects before the assistants arrive. Assigning a
-- seat to somebody moves it off whoever held it before.
--
-- Everything here is additive. It creates one table and its helpers. It
-- does not alter any existing table, column or policy.
-- ============================================================

-- ---- the seven codes, in one place -------------------------------------
-- DNC   Deputy National Coordinator   (Partnerships & Fundraising)
-- SEC   National Secretary            (Digital custodianship & data protection)
-- FIN   National Financial Secretary  (Donor records & grant financial reporting)
-- PD    National Programmes Director   (Spiritual formation, curriculum, M&E)
-- VC    National Volunteer Coordinator (Safeguarding compliance administration)
-- COMMS National Communications Officer (Alumni network communication)
--
-- NC is a role on profiles already, not a seat handed out here, so it is
-- not in this list.

-- ---- 1. the register of who holds what --------------------------------
create table if not exists public.nec_portfolios (
  portfolio   text not null primary key
                check (portfolio in ('DNC','SEC','FIN','PD','VC','COMMS')),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null
);

comment on table public.nec_portfolios is
  'Who holds each NEC seat (YCDI-GOV-007-A1). A label and a routing target, not an access grant. One holder per seat; a person may hold several.';

-- portfolio is the primary key, so a seat has at most one holder. A
-- person holding two seats is two rows, which is allowed.

-- ---- 2. reading it -----------------------------------------------------
-- Who holds which seat is not sensitive. It is governance the whole team
-- should be able to see, the same way profiles are already readable to
-- every signed in account. Writes do not go through a policy at all;
-- they go through set_portfolio below, so there is no write policy here
-- and direct inserts or deletes are refused.
alter table public.nec_portfolios enable row level security;

drop policy if exists nec_portfolios_read on public.nec_portfolios;
create policy nec_portfolios_read on public.nec_portfolios
  for select to authenticated using (true);

-- ---- 3. the caller's own seats (for the screen) -----------------------
create or replace function public.holds_portfolio(code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nec_portfolios
    where profile_id = auth.uid() and portfolio = code
  )
$$;

-- ---- 4. who to notify --------------------------------------------------
-- The holder of a seat, or nobody if the seat is empty.
create or replace function public.portfolio_holder(code text)
returns uuid language sql stable security definer set search_path = public as $$
  select profile_id from public.nec_portfolios where portfolio = code
$$;

-- The holder of a seat, falling back to a National Coordinator when the
-- seat has not been filled, so a duty is never routed into the void. This
-- is the one to call from a notification.
create or replace function public.portfolio_holder_or_nc(code text)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select profile_id from public.nec_portfolios where portfolio = code),
    (select id from public.profiles where role = 'NC' order by id limit 1)
  )
$$;

-- ---- 5. assigning a seat ----------------------------------------------
-- Only a National Coordinator or an admin may move a seat. Assigning a
-- seat to somebody takes it off whoever held it, because a seat has one
-- occupant. The target may be any active member; the seat gives them no
-- new access, so there is no tier to check.
create or replace function public.set_portfolio(target uuid, code text, assign boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.dir_role() <> 'NC' and not public.is_admin() then
    raise exception 'Only a National Coordinator or an admin can assign NEC portfolios.';
  end if;
  if code not in ('DNC','SEC','FIN','PD','VC','COMMS') then
    raise exception 'Unknown portfolio code: %', code;
  end if;
  if assign then
    if not exists (select 1 from public.profiles where id = target) then
      raise exception 'No such member.';
    end if;
    -- A seat has one holder. Moving it off the previous occupant is the
    -- assignment, so this is an upsert on the seat, not on the person.
    insert into public.nec_portfolios (portfolio, profile_id, assigned_by)
    values (code, target, auth.uid())
    on conflict (portfolio)
      do update set profile_id = excluded.profile_id,
                    assigned_at = now(),
                    assigned_by = excluded.assigned_by;
  else
    delete from public.nec_portfolios where portfolio = code and profile_id = target;
  end if;
end;
$$;

grant execute on function public.holds_portfolio(text)          to authenticated;
grant execute on function public.portfolio_holder(text)         to authenticated;
grant execute on function public.portfolio_holder_or_nc(text)   to authenticated;
grant execute on function public.set_portfolio(uuid, text, boolean) to authenticated;

-- ---- 6. routing an existing reminder to a seat ------------------------
-- Illustration, not a rewrite. Where a duty in the amendment now has an
-- owner, an existing notify_person(...) call is repointed from the NC to
-- the seat holder. This is the shape every repoint takes:
--
--   perform public.notify_person(
--     public.portfolio_holder_or_nc('VC'),          -- Volunteer Coordinator
--     'compliance_due',
--     'Screening and declarations need chasing',
--     'Three chapters are behind on annual declarations.',
--     'more', 'renewals', null);
--
-- The seats and the reminders they should carry:
--   VC     compliance chasing on screening, training, declarations
--   PD     the nudge that funder data is being captured at source (M&E)
--   SEC    a data-subject request or a retention date coming due
--   DNC    a grant deadline or MOU review (once that record exists)
--   FIN    a grant financial return falling due
--   COMMS  alumni contact upkeep (once that list exists)
--
-- Only VC, PD and SEC have anything to route today. The other three wait
-- until their records exist, which is a later batch, if at all.

-- ============================================================
-- End of Batch 18.
-- ============================================================
