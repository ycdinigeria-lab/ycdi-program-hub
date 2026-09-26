-- ============================================================
-- YCDI Programme Hub
-- Batch 33: Grants and restricted funds
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
-- Run it after Batch 32 (finance), which it builds on.
--
-- BATCH33-MARKER grants
--
-- What this is
-- ------------
-- The second half of finance. Batch 32 handles money going out (expense
-- claims against a programme budget). This handles money coming in that
-- carries strings: grants. It records each grant, its funder, the amount,
-- the period, whether the money is restricted and to what, the reporting
-- and compliance deadlines that come with it, and which programmes it
-- pays for, so a grant shows what has been allocated, spent and what is
-- left, drawn from the same claims the rest of finance already tracks.
--
-- This is also where the Deputy National Coordinator seat gains its first
-- access. The seat's duty is partnerships and fundraising (YCDI-GOV-007-A1),
-- which is where grants come from, so the seat that brings a grant in is
-- the seat that keeps its record. Batch 18 anticipated exactly this.
--
-- Who can do what
--   Deputy National Coordinator (DNC seat), Financial Secretary (FIN
--     seat), National Coordinator: create and edit grants, move a grant
--     through its stages, add and settle reporting deadlines, and name
--     which programme a grant funds.
--   Board Treasurer (TREAS seat): reads everything. Changes nothing.
--   Regional Coordinator: reads a grant only where it funds a programme
--     in their own chapter, so a coordinator can see the strings on money
--     spent in their chapter, and no further.
--   Everyone else, a plain admin included: no access. The admin flag is a
--     technical one and this, like donor data and claims, does not name it.
--
-- The National Coordinator can act whether or not the FIN and DNC seats
-- are filled, so grant work is never stuck waiting for a seat.
--
-- Money is whole kobo (bigint), as in Batch 32. Nothing here moves money;
-- it records awards, allocations and deadlines. Bank details are not stored.
--
-- What this touches that already exists
--   finance_events    one new column (grant_id) and a wider kind list, so
--                     grant history sits in the same ledger as claims
--   finance_budgets   one new column (grant_id): which grant funds a
--                     programme's budget. No existing column or policy moves.
--   finance_events_read  redefined, carrying its Batch 32 logic plus a
--                     clause for grant history. Additive.
-- Everything else is new.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers re-declared, so this file stands on its own
-- ------------------------------------------------------------
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1. Who may read grants, and who may manage them
-- ------------------------------------------------------------
-- Read the whole grants register: NC, and the DNC, FIN or TREAS seats.
-- Deliberately not is_admin(), the same call Batches 29 and 32 made for
-- donor data and claims.
create or replace function public.grants_can_read_all()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('DNC'), false)
      or coalesce(public.holds_portfolio('FIN'), false)
      or coalesce(public.holds_portfolio('TREAS'), false)
$$;

-- Manage grants: NC, and the DNC or FIN seats. The Treasurer reads only.
create or replace function public.grants_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('DNC'), false)
      or coalesce(public.holds_portfolio('FIN'), false)
$$;

grant execute on function public.grants_can_read_all() to authenticated;
grant execute on function public.grants_can_manage()   to authenticated;

-- ------------------------------------------------------------
-- 2. The grants register
-- ------------------------------------------------------------
create table if not exists public.grants (
  id            uuid primary key default gen_random_uuid(),
  grant_no      bigint generated always as identity,
  reference     text check (reference is null or char_length(reference) <= 80),
  title         text not null check (btrim(title) <> '' and char_length(title) <= 160),
  -- The funder, linked to an Audience contact when there is one, and
  -- always named directly so the grant reads on its own.
  funder_id     uuid references public.audience_contacts(id) on delete set null,
  funder_name   text not null check (btrim(funder_name) <> '' and char_length(funder_name) <= 160),
  purpose       text check (purpose is null or char_length(purpose) <= 2000),
  -- Restricted money may be spent only on what it was given for. That
  -- restriction has to be written down, so a restricted grant must carry
  -- the text that says what it is restricted to.
  is_restricted boolean not null default true,
  restrictions  text check (restrictions is null or char_length(restrictions) <= 2000),
  awarded_kobo  bigint not null check (awarded_kobo >= 0 and awarded_kobo <= 1000000000000),
  currency      text not null default 'NGN' check (currency = 'NGN'),
  period_start  date,
  period_end    date,
  status        text not null default 'prospect'
                  check (status in ('prospect','applied','awarded','active','reporting','closed','declined')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint grants_period_order       check (period_start is null or period_end is null or period_end >= period_start),
  constraint grants_restricted_has_text check (not is_restricted or (restrictions is not null and btrim(restrictions) <> ''))
);
comment on table public.grants is
  'Grants and restricted funds. Amounts in kobo. Nothing here moves money; it records awards, their strings and their deadlines.';
create index if not exists grants_status_idx on public.grants (status, period_end);
create index if not exists grants_funder_idx on public.grants (funder_id);

-- ------------------------------------------------------------
-- 3. Reporting and compliance deadlines
-- ------------------------------------------------------------
create table if not exists public.grant_obligations (
  id           uuid primary key default gen_random_uuid(),
  grant_id     uuid not null references public.grants(id) on delete cascade,
  kind         text not null
                 check (kind in ('narrative_report','financial_report','acquittal','milestone','renewal','audit','other')),
  title        text not null check (btrim(title) <> '' and char_length(title) <= 160),
  due_date     date not null,
  status       text not null default 'pending'
                 check (status in ('pending','submitted','done','waived')),
  completed_on date,
  note         text check (note is null or char_length(note) <= 1000),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A settled obligation records the day it was settled; a pending one
  -- has no such day. "Overdue" is not stored, it is read off due_date and
  -- the clock, so it can never drift out of date.
  constraint grant_obl_settled_has_date
    check ((status in ('submitted','done')) = (completed_on is not null) or status in ('pending','waived'))
);
create index if not exists grant_obl_grant_idx on public.grant_obligations (grant_id, due_date);
create index if not exists grant_obl_due_idx   on public.grant_obligations (status, due_date);

-- ------------------------------------------------------------
-- 4. Which grant funds a programme
-- ------------------------------------------------------------
-- One column on the budget Batch 32 already holds. A programme's budget
-- may name the grant paying for it, so spend on that programme (the
-- claims from Batch 32) rolls up to the grant. One grant per programme
-- here; co-funding a single programme from two grants is a later change,
-- not this batch.
alter table public.finance_budgets
  add column if not exists grant_id uuid references public.grants(id) on delete set null;
create index if not exists finance_budgets_grant_idx on public.finance_budgets (grant_id);

-- ------------------------------------------------------------
-- 5. The record: grant history joins the finance ledger
-- ------------------------------------------------------------
-- Batch 32's finance_events already records the life of every claim and
-- budget, append-only, guarded by a trigger. Grant history belongs in the
-- same ledger rather than a second one, so this widens it: one new column
-- to say which grant a line is about, and the new kinds a grant produces.
alter table public.finance_events
  add column if not exists grant_id uuid;
create index if not exists finance_events_grant_idx on public.finance_events (grant_id, at);

alter table public.finance_events drop constraint if exists finance_events_kind_check;
alter table public.finance_events add constraint finance_events_kind_check
  check (kind in ('claim_submitted','claim_returned','claim_approved',
                  'claim_rejected','claim_paid','claim_withdrawn',
                  'budget_set','budget_revised',
                  'grant_created','grant_status','grant_edited',
                  'obligation_added','obligation_settled','obligation_waived',
                  'programme_funded','programme_unfunded'));

-- One writer for a grant line, mirroring finance_log.
create or replace function public.grant_log(
  p_kind text, p_grant uuid, p_programme uuid, p_amount bigint, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
begin
  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.finance_events (actor_id, actor_name, kind, grant_id, programme_id, amount_kobo, note)
  values (v_actor,
          coalesce(v_name, case when v_actor is null then 'System' else 'Unknown account' end),
          p_kind, p_grant, p_programme, p_amount, left(p_note, 500));
end;
$$;
revoke all on function public.grant_log(text, uuid, uuid, bigint, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. Reading: row security
-- ------------------------------------------------------------
-- May this person see this grant? A national reader, or a Regional
-- Coordinator where the grant funds a programme in their own chapter.
create or replace function public.grant_can_see(p_grant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.grants_can_read_all()
      or exists (
        select 1
          from public.finance_budgets fb
          join public.programs p on p.id = fb.programme_id
         where fb.grant_id = p_grant
           and public.dir_role() = 'RC'
           and p.chapter_id = public.dir_chapter() )
$$;
grant execute on function public.grant_can_see(uuid) to authenticated;

alter table public.grants            enable row level security;
alter table public.grant_obligations enable row level security;

drop policy if exists grants_read      on public.grants;
drop policy if exists grant_obl_read   on public.grant_obligations;

create policy grants_read on public.grants
  for select to authenticated using (
    public.grants_can_read_all()
    or ( public.dir_role() = 'RC' and exists (
          select 1 from public.finance_budgets fb
            join public.programs p on p.id = fb.programme_id
           where fb.grant_id = grants.id and p.chapter_id = public.dir_chapter() ) )
  );

create policy grant_obl_read on public.grant_obligations
  for select to authenticated using (public.grant_can_see(grant_id));

-- No write policy on either table, and the grants below take the write
-- rights away as well, so a direct insert, update or delete from the app
-- is refused twice over. Every change goes through a function.
revoke all on public.grants, public.grant_obligations from anon, authenticated;
grant select on public.grants, public.grant_obligations to authenticated;
revoke all on sequence public.grants_grant_no_seq from anon, authenticated;

-- Redefine the finance ledger's read policy: its Batch 32 logic, plus a
-- clause so grant history is visible to whoever may see the grant.
drop policy if exists finance_events_read on public.finance_events;
create policy finance_events_read on public.finance_events
  for select to authenticated using (
    public.finance_can_read_all()
    or (claim_id is not null and public.finance_can_see_claim(claim_id))
    or (grant_id is not null and public.grant_can_see(grant_id))
  );

-- ------------------------------------------------------------
-- 7. Writing: the grant functions
-- ------------------------------------------------------------
-- Create or edit a grant. p_id null creates one. Returns the id.
create or replace function public.save_grant(
  p_id uuid, p_title text, p_funder_name text, p_awarded_kobo bigint,
  p_is_restricted boolean, p_restrictions text default null, p_funder_id uuid default null,
  p_reference text default null, p_purpose text default null,
  p_period_start date default null, p_period_end date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception 'Give the grant a title.'; end if;
  if char_length(p_title) > 160 then raise exception 'The title is too long (160 characters at most).'; end if;
  if p_funder_name is null or btrim(p_funder_name) = '' then raise exception 'Name the funder.'; end if;
  if p_awarded_kobo is null or p_awarded_kobo < 0 then raise exception 'The amount cannot be negative.'; end if;
  if p_awarded_kobo > 1000000000000 then raise exception 'That amount is beyond what this records.'; end if;
  if p_is_restricted and (p_restrictions is null or btrim(p_restrictions) = '') then
    raise exception 'Restricted money needs a note saying what it is restricted to.';
  end if;
  if p_period_start is not null and p_period_end is not null and p_period_end < p_period_start then
    raise exception 'The end of the period cannot be before the start.';
  end if;
  if p_funder_id is not null and not exists (select 1 from public.audience_contacts where id = p_funder_id) then
    raise exception 'That funder contact does not exist.';
  end if;

  if p_id is null then
    insert into public.grants (reference, title, funder_id, funder_name, purpose,
                               is_restricted, restrictions, awarded_kobo, period_start, period_end, created_by)
    values (nullif(btrim(coalesce(p_reference,'')),''), btrim(p_title), p_funder_id, btrim(p_funder_name),
            nullif(btrim(coalesce(p_purpose,'')),''), p_is_restricted,
            case when p_is_restricted then btrim(p_restrictions) else nullif(btrim(coalesce(p_restrictions,'')),'') end,
            p_awarded_kobo, p_period_start, p_period_end, auth.uid())
    returning id into v_id;
    perform public.grant_log('grant_created', v_id, null, p_awarded_kobo, btrim(p_title) || ' — ' || btrim(p_funder_name));
    return v_id;
  end if;

  if not exists (select 1 from public.grants where id = p_id) then raise exception 'No such grant.'; end if;
  update public.grants
     set reference = nullif(btrim(coalesce(p_reference,'')),''),
         title = btrim(p_title), funder_id = p_funder_id, funder_name = btrim(p_funder_name),
         purpose = nullif(btrim(coalesce(p_purpose,'')),''),
         is_restricted = p_is_restricted,
         restrictions = case when p_is_restricted then btrim(p_restrictions) else nullif(btrim(coalesce(p_restrictions,'')),'') end,
         awarded_kobo = p_awarded_kobo, period_start = p_period_start, period_end = p_period_end,
         updated_at = now()
   where id = p_id;
  perform public.grant_log('grant_edited', p_id, null, p_awarded_kobo, 'Details updated');
  return p_id;
end;
$$;

-- Move a grant through its stages, in the order they really happen.
create or replace function public.set_grant_status(p_grant uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text; v_note text := nullif(btrim(coalesce(p_note,'')),'');
begin
  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;
  if p_status not in ('prospect','applied','awarded','active','reporting','closed','declined') then
    raise exception 'Unknown grant status.';
  end if;
  select status into v_old from public.grants where id = p_grant for update;
  if not found then raise exception 'No such grant.'; end if;
  if v_old = p_status then return; end if;
  -- A grant that has been closed or declined is finished. Reopening it
  -- would rewrite history, so it is not allowed; record a new grant if a
  -- funder comes back.
  if v_old in ('closed','declined') then
    raise exception 'A % grant cannot be reopened. Record a new grant instead.', v_old;
  end if;
  update public.grants set status = p_status, updated_at = now() where id = p_grant;
  perform public.grant_log('grant_status', p_grant, null, null, v_old || ' → ' || p_status || coalesce(': ' || v_note, ''));
end;
$$;

-- Add a reporting or compliance deadline to a grant.
create or replace function public.add_obligation(
  p_grant uuid, p_kind text, p_title text, p_due date, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_funder text;
begin
  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;
  if p_kind not in ('narrative_report','financial_report','acquittal','milestone','renewal','audit','other') then
    raise exception 'Unknown obligation kind.';
  end if;
  if p_title is null or btrim(p_title) = '' then raise exception 'Give the deadline a title.'; end if;
  if p_due is null then raise exception 'Set a due date.'; end if;
  select funder_name into v_funder from public.grants where id = p_grant;
  if v_funder is null then raise exception 'No such grant.'; end if;
  insert into public.grant_obligations (grant_id, kind, title, due_date, note, created_by)
  values (p_grant, p_kind, btrim(p_title), p_due, nullif(btrim(coalesce(p_note,'')),''), auth.uid())
  returning id into v_id;
  perform public.grant_log('obligation_added', p_grant, null, null, btrim(p_title) || ' due ' || p_due::text);
  return v_id;
end;
$$;

-- Settle a deadline: it was submitted, or done, or is being waived. A
-- settlement records the day; a waiver records why.
create or replace function public.settle_obligation(p_obl uuid, p_status text, p_on date default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_grant uuid; v_title text; v_note text := nullif(btrim(coalesce(p_note,'')),'');
begin
  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;
  if p_status not in ('submitted','done','waived','pending') then raise exception 'Unknown obligation status.'; end if;
  select grant_id, title into v_grant, v_title from public.grant_obligations where id = p_obl for update;
  if v_grant is null then raise exception 'No such deadline.'; end if;
  if p_status = 'waived' and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Say why the deadline is being waived.';
  end if;
  if p_status in ('submitted','done') then
    update public.grant_obligations
       set status = p_status, completed_on = coalesce(p_on, (now() at time zone 'Africa/Lagos')::date),
           note = coalesce(v_note, note), updated_at = now()
     where id = p_obl;
    perform public.grant_log('obligation_settled', v_grant, null, null, v_title || ' — ' || p_status);
  elsif p_status = 'waived' then
    update public.grant_obligations set status = 'waived', completed_on = null, note = v_note, updated_at = now() where id = p_obl;
    perform public.grant_log('obligation_waived', v_grant, null, null, v_title || ' — ' || v_note);
  else -- pending: reopen a settled one
    update public.grant_obligations set status = 'pending', completed_on = null, updated_at = now() where id = p_obl;
  end if;
end;
$$;

-- Remove a deadline that should not have been added. Only while pending,
-- and the removal is recorded.
create or replace function public.remove_obligation(p_obl uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_grant uuid; v_title text; v_status text;
begin
  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;
  select grant_id, title, status into v_grant, v_title, v_status from public.grant_obligations where id = p_obl;
  if v_grant is null then raise exception 'No such deadline.'; end if;
  if v_status <> 'pending' then raise exception 'Only a deadline that is still pending can be removed. Waive it instead.'; end if;
  delete from public.grant_obligations where id = p_obl;
  perform public.grant_log('obligation_waived', v_grant, null, null, v_title || ' — removed');
end;
$$;

-- Name the grant that funds a programme's budget, or clear it. Passing a
-- null grant unlinks. The programme must already have an approved budget.
create or replace function public.set_programme_grant(p_programme uuid, p_grant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_status text; v_title text;
begin
  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;
  select grant_id into v_old from public.finance_budgets where programme_id = p_programme for update;
  if not found then raise exception 'That programme has no approved budget to fund.'; end if;
  if p_grant is not null then
    select status, title into v_status, v_title from public.grants where id = p_grant;
    if v_status is null then raise exception 'No such grant.'; end if;
    if v_status not in ('awarded','active','reporting') then
      raise exception 'A grant can fund a programme only once it is awarded, active or reporting.';
    end if;
  end if;
  if v_old is not distinct from p_grant then return; end if;
  update public.finance_budgets set grant_id = p_grant where programme_id = p_programme;
  if p_grant is not null then
    perform public.grant_log('programme_funded', p_grant, p_programme, null, coalesce(v_title,'') );
  else
    perform public.grant_log('programme_unfunded', v_old, p_programme, null, null);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 8. Reading: the numbers
-- ------------------------------------------------------------
-- Every grant the caller may see, with what it funds and what has been
-- spent from it. Kobo throughout.
--   allocated = the budgets of the programmes this grant funds
--   committed = approved, not yet paid, on those programmes
--   paid      = paid, on those programmes
--   remaining = awarded - (committed + paid)
--   over_allocated = the budgets allocated exceed the award
create or replace function public.grant_summary()
returns table (
  grant_id uuid, grant_no bigint, reference text, title text, funder_name text,
  is_restricted boolean, status text, period_start date, period_end date,
  awarded_kobo bigint, allocated_kobo bigint, committed_kobo bigint, paid_kobo bigint,
  remaining_kobo bigint, over_allocated boolean, programmes int,
  obligations_open int, obligations_overdue int
) language sql stable security definer set search_path = public as $$
  with visible as (
    select g.* from public.grants g
     where public.grants_can_read_all()
        or ( public.dir_role() = 'RC' and exists (
              select 1 from public.finance_budgets fb join public.programs p on p.id = fb.programme_id
               where fb.grant_id = g.id and p.chapter_id = public.dir_chapter()) )
  ),
  -- Allocation is summed from the budgets alone. Spend is summed from the
  -- claims in its own aggregate. Doing both in one join would multiply a
  -- programme's budget by the number of claims sitting against it.
  alloc as (
    select fb.grant_id,
           count(*) as programmes,
           coalesce(sum(fb.approved_kobo), 0) as allocated
      from public.finance_budgets fb
     where fb.grant_id is not null
     group by fb.grant_id
  ),
  spend as (
    select fb.grant_id,
           coalesce(sum(c.amount_kobo) filter (where c.status = 'approved'), 0) as committed,
           coalesce(sum(c.amount_kobo) filter (where c.status = 'paid'), 0) as paid
      from public.finance_budgets fb
      join public.expense_claims c on c.programme_id = fb.programme_id
     where fb.grant_id is not null
     group by fb.grant_id
  ),
  obl as (
    select grant_id,
           count(*) filter (where status = 'pending') as open,
           count(*) filter (where status = 'pending' and due_date < (now() at time zone 'Africa/Lagos')::date) as overdue
      from public.grant_obligations group by grant_id
  )
  select v.id, v.grant_no, v.reference, v.title, v.funder_name, v.is_restricted, v.status,
         v.period_start, v.period_end, v.awarded_kobo,
         coalesce(a.allocated,0)::bigint, coalesce(s.committed,0)::bigint, coalesce(s.paid,0)::bigint,
         (v.awarded_kobo - coalesce(s.committed,0) - coalesce(s.paid,0))::bigint,
         (coalesce(a.allocated,0) > v.awarded_kobo),
         coalesce(a.programmes,0)::int,
         coalesce(o.open,0)::int, coalesce(o.overdue,0)::int
    from visible v
    left join alloc a on a.grant_id = v.id
    left join spend s on s.grant_id = v.id
    left join obl o   on o.grant_id = v.id
   order by case v.status when 'active' then 0 when 'reporting' then 1 when 'awarded' then 2
                          when 'applied' then 3 when 'prospect' then 4 when 'closed' then 5 else 6 end,
            v.period_end nulls last, v.title
$$;

-- The top line for the grants screen: totals across grants the caller may
-- see, split by restricted and unrestricted, and the deadlines that need
-- attention. Managers and readers only.
create or replace function public.grant_overview()
returns table (
  active_grants int, restricted_kobo bigint, unrestricted_kobo bigint,
  awarded_kobo bigint, spent_kobo bigint,
  obligations_open int, obligations_overdue int, obligations_due_soon int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.grants_can_read_all() then return; end if;
  return query
  with active as (
    select g.id, g.awarded_kobo as amt, g.is_restricted as restricted
      from public.grants g where g.status in ('awarded','active','reporting')
  ),
  spend as (
    select coalesce(sum(c.amount_kobo) filter (where c.status in ('approved','paid')), 0) as spent
      from public.finance_budgets fb
      join public.grants g on g.id = fb.grant_id
      left join public.expense_claims c on c.programme_id = fb.programme_id
     where g.status in ('awarded','active','reporting')
  )
  select
    (select count(*) from active)::int,
    (select coalesce(sum(a.amt),0) from active a where a.restricted)::bigint,
    (select coalesce(sum(a.amt),0) from active a where not a.restricted)::bigint,
    (select coalesce(sum(a.amt),0) from active a)::bigint,
    (select spend.spent from spend)::bigint,
    (select count(*) from public.grant_obligations where status = 'pending')::int,
    (select count(*) from public.grant_obligations where status = 'pending'
       and due_date < (now() at time zone 'Africa/Lagos')::date)::int,
    (select count(*) from public.grant_obligations where status = 'pending'
       and due_date >= (now() at time zone 'Africa/Lagos')::date
       and due_date <= (now() at time zone 'Africa/Lagos')::date + 14)::int;
end;
$$;

-- The approved programmes a grant manager may choose from when saying
-- which programme a grant funds, with the grant (if any) that funds each
-- now. This is its own function because a grant manager is not necessarily
-- a finance reader: the Deputy seat manages grants but is not in
-- finance_can_read_all(), so this hands it just the programme list it
-- needs without opening the claims tables to it.
create or replace function public.grant_fundable_programmes()
returns table (
  programme_id uuid, title text, chapter_id uuid, chapter_name text,
  programme_date date, status text, approved_kobo bigint, grant_id uuid, grant_title text
) language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.chapter_id, ch.name, p.date, p.status,
         b.approved_kobo, b.grant_id, g.title
    from public.finance_budgets b
    join public.programs p on p.id = b.programme_id
    left join public.chapters ch on ch.id = p.chapter_id
    left join public.grants g on g.id = b.grant_id
   where public.grants_can_manage()
   order by p.date desc nulls last, p.title
$$;
grant execute on function public.grant_fundable_programmes() to authenticated;

-- ------------------------------------------------------------
-- 9. Who may call what
-- ------------------------------------------------------------
revoke all on function public.save_grant(uuid, text, text, bigint, boolean, text, uuid, text, text, date, date) from public, anon;
revoke all on function public.set_grant_status(uuid, text, text)                    from public, anon;
revoke all on function public.add_obligation(uuid, text, text, date, text)          from public, anon;
revoke all on function public.settle_obligation(uuid, text, date, text)             from public, anon;
revoke all on function public.remove_obligation(uuid)                               from public, anon;
revoke all on function public.set_programme_grant(uuid, uuid)                        from public, anon;
revoke all on function public.grant_summary()                                       from public, anon;
revoke all on function public.grant_overview()                                      from public, anon;
revoke all on function public.grant_fundable_programmes()                           from public, anon;

grant execute on function public.save_grant(uuid, text, text, bigint, boolean, text, uuid, text, text, date, date) to authenticated;
grant execute on function public.set_grant_status(uuid, text, text)                    to authenticated;
grant execute on function public.add_obligation(uuid, text, text, date, text)          to authenticated;
grant execute on function public.settle_obligation(uuid, text, date, text)             to authenticated;
grant execute on function public.remove_obligation(uuid)                               to authenticated;
grant execute on function public.set_programme_grant(uuid, uuid)                        to authenticated;
grant execute on function public.grant_summary()                                       to authenticated;
grant execute on function public.grant_overview()                                      to authenticated;
