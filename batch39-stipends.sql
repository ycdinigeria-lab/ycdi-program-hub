-- ============================================================
-- YCDI Programme Hub
-- Batch 39: Stipends
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
-- Run it after Batches 32 (finance) and 35 (annual budget).
--
-- BATCH39-MARKER stipends
--
-- What this is
-- ------------
-- The record of monthly stipends paid to volunteer leaders. The HR and
-- Volunteer policy (Remuneration Policy, 3.3) says volunteer leaders are
-- not entitled to salaries but may receive approved stipends where
-- budgeted, and the Financial Policy puts stipends under personnel costs.
-- Until now the Hub had a "Stipends" line in the annual budget and no way
-- to record what was actually paid against it.
--
-- Two things are kept:
--   the stipend list   who receives a stipend, how much a month, and from
--                      which month to which. Any existing Hub member can
--                      be added. Amounts differ from person to person.
--   the payments       one record per person per month: the amount, the
--                      day it was paid and the transfer reference.
--
-- As with the rest of finance, the app records money and never moves it.
-- No bank account number is stored, and a payment reference that is just
-- a bare ten-digit number (which is what an account number looks like) is
-- refused.
--
-- A payment is never deleted. A mistaken one is voided with a reason: it
-- stays on the record and drops out of the totals.
--
-- Who can do what
--   Financial Secretary (FIN)   keeps the list and records payments.
--   National Coordinator        reads everything. Keeps the list and
--                               records payments only while the FIN seat
--                               is empty, and records the Financial
--                               Secretary's own stipend if they have one.
--   Board Treasurer (TREAS)     reads everything. Records a stipend for
--                               whoever is running finance at the time,
--                               so that person never pays themselves.
--   Anyone on the list          reads their own entry and their own
--                               payments, and nobody else's.
--   Everyone else, including    nothing.
--   a plain admin and the Deputy
--
-- Nobody adds themselves, sets their own amount, or records their own
-- payment. That holds for the National Coordinator and the Financial
-- Secretary alike.
--
-- Money is whole kobo (bigint), as everywhere in finance.
--
-- What this touches that already exists
--   finance_events      one new column (stipend_id) and the stipend kinds
--   budget_vs_actual()  redefined: actual expenditure now includes
--                       stipends paid for months in the budget year.
--                       Same inputs and outputs, so the budget screen
--                       needs no change to read it.
-- Everything else is new.
-- ============================================================

create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1. Who may do what
-- ------------------------------------------------------------
-- Does this person run finance right now? The FIN holder, or the NC while
-- the FIN seat is empty. (The same rule as finance_is_officer() in Batch
-- 32, asked about any person rather than only the caller.)
create or replace function public.stipend_person_is_officer(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nec_portfolios where portfolio = 'FIN' and profile_id = p_profile)
      or ( exists (select 1 from public.profiles where id = p_profile and role = 'NC')
           and not exists (select 1 from public.nec_portfolios where portfolio = 'FIN') )
$$;
revoke all on function public.stipend_person_is_officer(uuid) from public, anon, authenticated;

-- May the caller manage the stipend of p_profile (add them, change their
-- amount, record or void a payment)? Never their own. Whoever runs finance
-- manages everyone else. The person running finance is covered by the
-- Treasurer, and a Financial Secretary's own stipend also by the NC, the
-- same cover Batch 32 gives their expense claims.
create or replace function public.stipend_can_act(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and p_profile is not null
     and auth.uid() is distinct from p_profile
     and ( public.finance_is_officer()
           or ( coalesce(public.holds_portfolio('TREAS'), false)
                and public.stipend_person_is_officer(p_profile) )
           or ( coalesce(public.dir_role() = 'NC', false)
                and exists (select 1 from public.nec_portfolios
                             where portfolio = 'FIN' and profile_id = p_profile) ) )
$$;

-- May the caller open the stipend screen as a manager at all? Whoever
-- runs finance, and the Treasurer. (Reading needs finance_can_read_all().)
create or replace function public.stipend_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select public.finance_is_officer()
      or coalesce(public.holds_portfolio('TREAS'), false)
      or coalesce(public.dir_role() = 'NC', false)
$$;

grant execute on function public.stipend_can_act(uuid) to authenticated;
grant execute on function public.stipend_can_manage()  to authenticated;

-- ------------------------------------------------------------
-- 2. The stipend list
-- ------------------------------------------------------------
create table if not exists public.stipend_recipients (
  id             uuid primary key default gen_random_uuid(),
  -- The person, while their account exists. The name is kept as well, so
  -- the record still reads correctly if the account is ever removed.
  profile_id     uuid unique references public.profiles(id) on delete set null,
  recipient_name text not null check (btrim(recipient_name) <> '' and char_length(recipient_name) <= 160),
  -- What the stipend is for, e.g. "Regional Coordinator, Benin".
  role_label     text not null check (btrim(role_label) <> '' and char_length(role_label) <= 120),
  monthly_kobo   bigint not null check (monthly_kobo > 0 and monthly_kobo <= 1000000000),
  -- Months are stored as the first day of the month. The end month is
  -- the last month the stipend is paid for; null while it continues.
  start_month    date not null check (extract(day from start_month) = 1),
  end_month      date check (end_month is null or extract(day from end_month) = 1),
  -- Where the approval is written down (a Board or NEC minute, a letter).
  approval_ref   text check (approval_ref is null or char_length(approval_ref) <= 120),
  note           text check (note is null or char_length(note) <= 500),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint stipend_months_in_order check (end_month is null or end_month >= start_month)
);
comment on table public.stipend_recipients is
  'Volunteer leaders who receive a monthly stipend, with the amount and the months it covers. Written only through the stipend functions.';

-- ------------------------------------------------------------
-- 3. The payments
-- ------------------------------------------------------------
create table if not exists public.stipend_payments (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references public.stipend_recipients(id) on delete restrict,
  profile_id     uuid references public.profiles(id) on delete set null,
  recipient_name text not null,
  month          date not null check (extract(day from month) = 1),
  amount_kobo    bigint not null check (amount_kobo > 0 and amount_kobo <= 1000000000),
  paid_on        date not null,
  payment_ref    text not null check (btrim(payment_ref) <> '' and char_length(payment_ref) <= 60),
  note           text check (note is null or char_length(note) <= 500),
  status         text not null default 'paid' check (status in ('paid','voided')),
  void_reason    text check (void_reason is null or char_length(void_reason) <= 500),
  voided_by      uuid references public.profiles(id) on delete set null,
  voided_at      timestamptz,
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint stipend_payment_ref_not_account_number
    check (payment_ref !~ '^\s*[0-9]{10}\s*$'),
  constraint stipend_payment_void_has_reason
    check (status <> 'voided' or (void_reason is not null and btrim(void_reason) <> '' and voided_at is not null))
);
-- One live payment per person per month. A voided one does not count, so
-- a mistake can be voided and the month recorded again properly.
create unique index if not exists stipend_payments_one_per_month
  on public.stipend_payments (recipient_id, month) where status = 'paid';
create index if not exists stipend_payments_month_idx   on public.stipend_payments (month, status);
create index if not exists stipend_payments_profile_idx on public.stipend_payments (profile_id, month desc);

-- ------------------------------------------------------------
-- 4. Stipend history joins the finance ledger
-- ------------------------------------------------------------
alter table public.finance_events add column if not exists stipend_id uuid;
create index if not exists finance_events_stipend_idx on public.finance_events (stipend_id, at);

alter table public.finance_events drop constraint if exists finance_events_kind_check;
alter table public.finance_events add constraint finance_events_kind_check
  check (kind in ('claim_submitted','claim_returned','claim_approved',
                  'claim_rejected','claim_paid','claim_withdrawn',
                  'budget_set','budget_revised',
                  'grant_created','grant_status','grant_edited',
                  'obligation_added','obligation_settled','obligation_waived',
                  'programme_funded','programme_unfunded',
                  'donation_recorded','donation_corrected','donation_acknowledged','donation_voided',
                  'annual_created','annual_submitted','annual_approved','annual_status','annual_line',
                  'stipend_added','stipend_changed','stipend_ended','stipend_paid','stipend_voided'));

create or replace function public.stipend_log(p_kind text, p_stipend uuid, p_amount bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_name text;
begin
  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.finance_events (actor_id, actor_name, kind, stipend_id, amount_kobo, note)
  values (v_actor, coalesce(v_name, case when v_actor is null then 'System' else 'Unknown account' end),
          p_kind, p_stipend, p_amount, left(p_note, 500));
end;
$$;
revoke all on function public.stipend_log(text, uuid, bigint, text) from public, anon, authenticated;

-- Naira for a note in the ledger: 3500000 kobo → '₦35,000'.
create or replace function public.stipend_naira(p_kobo bigint)
returns text language sql immutable set search_path = public as $$
  select '₦' || to_char(p_kobo / 100, 'FM999,999,999,990')
         || case when p_kobo % 100 <> 0 then '.' || lpad((p_kobo % 100)::text, 2, '0') else '' end
$$;

-- ------------------------------------------------------------
-- 5. Reading: row security
-- ------------------------------------------------------------
-- The finance readers (NC, FIN, TREAS) see everything. A person on the
-- list sees their own entry and their own payments. The ledger's existing
-- read policy already lets the finance readers see stipend events.
alter table public.stipend_recipients enable row level security;
alter table public.stipend_payments   enable row level security;
drop policy if exists stipend_recipients_read on public.stipend_recipients;
drop policy if exists stipend_payments_read   on public.stipend_payments;

create policy stipend_recipients_read on public.stipend_recipients
  for select to authenticated using (public.finance_can_read_all() or profile_id = auth.uid());
create policy stipend_payments_read on public.stipend_payments
  for select to authenticated using (public.finance_can_read_all() or profile_id = auth.uid());

revoke all on public.stipend_recipients, public.stipend_payments from anon, authenticated;
grant select on public.stipend_recipients, public.stipend_payments to authenticated;

-- ------------------------------------------------------------
-- 6. Finding someone to add
-- ------------------------------------------------------------
-- Any existing Hub member, searchable by name, with what the screen needs
-- to recognise them: their role, their title in the directory, their
-- chapter, any national seat they hold, and whether they are already on
-- the list. Only the people who manage stipends can search.
create or replace function public.stipend_candidates(p_search text default null)
returns table (
  profile_id uuid, full_name text, role text, role_title text,
  chapter_name text, seats text[], on_list boolean, can_act boolean
) language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search,'')), '');
begin
  if not public.stipend_can_manage() then return; end if;
  return query
  select p.id, p.full_name, p.role,
         (select dm.role_title from public.directory_members dm where dm.profile_id = p.id limit 1),
         ch.name,
         coalesce((select array_agg(np.portfolio order by np.portfolio) from public.nec_portfolios np where np.profile_id = p.id), '{}'::text[]),
         exists (select 1 from public.stipend_recipients r where r.profile_id = p.id),
         public.stipend_can_act(p.id)
    from public.profiles p
    left join public.chapters ch on ch.id = p.chapter_id
   where p.full_name is not null
     and (v_q is null or p.full_name ilike '%' || v_q || '%' or ch.name ilike '%' || v_q || '%')
   order by p.full_name
   limit 60;
end;
$$;

-- ------------------------------------------------------------
-- 7. Writing: the list
-- ------------------------------------------------------------
-- Add someone (p_recipient null, p_profile given) or change an entry
-- (p_recipient given). Months may be any day of the month; they are
-- stored as the first of it. Returns the entry's id.
create or replace function public.save_stipend_recipient(
  p_recipient uuid, p_profile uuid, p_monthly_kobo bigint, p_start_month date,
  p_end_month date default null, p_role_label text default null,
  p_approval_ref text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row   public.stipend_recipients%rowtype;
  v_start date := date_trunc('month', p_start_month)::date;
  v_end   date := case when p_end_month is null then null else date_trunc('month', p_end_month)::date end;
  v_label text := nullif(btrim(coalesce(p_role_label,'')), '');
  v_name  text;
  v_id    uuid;
  v_what  text := '';
begin
  if p_monthly_kobo is null or p_monthly_kobo <= 0 then raise exception 'Give the monthly amount.'; end if;
  if p_monthly_kobo > 1000000000 then raise exception 'That monthly amount is too large.'; end if;
  if v_start is null then raise exception 'Give the month the stipend starts.'; end if;
  if v_end is not null and v_end < v_start then raise exception 'The last month cannot be before the first.'; end if;
  if v_label is null then raise exception 'Say what the stipend is for, for example Regional Coordinator, Benin.'; end if;

  if p_recipient is null then
    if p_profile is null then raise exception 'Choose the person.'; end if;
    select full_name into v_name from public.profiles where id = p_profile;
    if v_name is null then raise exception 'No such member.'; end if;
    if not public.stipend_can_act(p_profile) then
      raise exception 'You cannot add this person to the stipend list. Nobody adds themselves.';
    end if;
    if exists (select 1 from public.stipend_recipients where profile_id = p_profile) then
      raise exception '% is already on the stipend list. Change their entry instead.', v_name;
    end if;
    insert into public.stipend_recipients (profile_id, recipient_name, role_label, monthly_kobo, start_month, end_month,
                                           approval_ref, note, created_by)
    values (p_profile, v_name, v_label, p_monthly_kobo, v_start, v_end,
            nullif(btrim(coalesce(p_approval_ref,'')),''), nullif(btrim(coalesce(p_note,'')),''), auth.uid())
    returning id into v_id;
    perform public.stipend_log('stipend_added', v_id, p_monthly_kobo,
      v_name || ', ' || v_label || ', from ' || to_char(v_start, 'Mon YYYY'));
    perform public.notify_person(p_profile, 'stipend', 'You have been added to the stipend list',
      public.stipend_naira(p_monthly_kobo) || ' a month from ' || to_char(v_start, 'FMMonth YYYY') || '.', 'more', 'finance', v_id);
    return v_id;
  end if;

  select * into v_row from public.stipend_recipients where id = p_recipient for update;
  if not found then raise exception 'No such stipend entry.'; end if;
  if not public.stipend_can_act(v_row.profile_id) then
    raise exception 'You cannot change this stipend. Nobody changes their own.';
  end if;
  if exists (select 1 from public.stipend_payments where recipient_id = p_recipient and status = 'paid'
              and (month < v_start or (v_end is not null and month > v_end))) then
    raise exception 'Payments are already recorded outside those months. Void them first, or widen the months.';
  end if;

  if v_row.monthly_kobo <> p_monthly_kobo then
    v_what := v_what || 'Amount ' || public.stipend_naira(v_row.monthly_kobo) || ' → ' || public.stipend_naira(p_monthly_kobo) || '. ';
  end if;
  if v_row.start_month <> v_start then v_what := v_what || 'Starts ' || to_char(v_start, 'Mon YYYY') || '. '; end if;
  if v_row.end_month is distinct from v_end then
    v_what := v_what || case when v_end is null then 'No end month. ' else 'Ends ' || to_char(v_end, 'Mon YYYY') || '. ' end;
  end if;
  if v_row.role_label <> v_label then v_what := v_what || 'For: ' || v_label || '. '; end if;

  update public.stipend_recipients
     set monthly_kobo = p_monthly_kobo, start_month = v_start, end_month = v_end, role_label = v_label,
         approval_ref = nullif(btrim(coalesce(p_approval_ref,'')),''), note = nullif(btrim(coalesce(p_note,'')),''),
         updated_at = now()
   where id = p_recipient;
  perform public.stipend_log('stipend_changed', p_recipient, p_monthly_kobo,
    v_row.recipient_name || ': ' || coalesce(nullif(btrim(v_what),''), 'details updated'));
  if v_row.monthly_kobo <> p_monthly_kobo then
    perform public.notify_person(v_row.profile_id, 'stipend', 'Your monthly stipend has changed',
      public.stipend_naira(v_row.monthly_kobo) || ' → ' || public.stipend_naira(p_monthly_kobo) || '.', 'more', 'finance', p_recipient);
  end if;
  return p_recipient;
end;
$$;

-- End a stipend after a given month (the last month it is paid for).
create or replace function public.end_stipend(p_recipient uuid, p_last_month date)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.stipend_recipients%rowtype; v_end date := date_trunc('month', p_last_month)::date;
begin
  select * into v_row from public.stipend_recipients where id = p_recipient for update;
  if not found then raise exception 'No such stipend entry.'; end if;
  if not public.stipend_can_act(v_row.profile_id) then raise exception 'You cannot end this stipend.'; end if;
  if v_end is null then raise exception 'Give the last month the stipend is paid for.'; end if;
  if v_end < v_row.start_month then raise exception 'The last month cannot be before the stipend started.'; end if;
  if exists (select 1 from public.stipend_payments where recipient_id = p_recipient and status = 'paid' and month > v_end) then
    raise exception 'Payments are recorded after that month. Void them first, or choose a later month.';
  end if;
  update public.stipend_recipients set end_month = v_end, updated_at = now() where id = p_recipient;
  perform public.stipend_log('stipend_ended', p_recipient, null,
    v_row.recipient_name || ': last month ' || to_char(v_end, 'Mon YYYY'));
end;
$$;

-- ------------------------------------------------------------
-- 8. Writing: payments
-- ------------------------------------------------------------
-- Record the month's stipend as paid. The amount defaults to the monthly
-- rate on the screen; a different amount needs a note saying why.
create or replace function public.record_stipend_payment(
  p_recipient uuid, p_month date, p_amount_kobo bigint, p_paid_on date, p_ref text, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row   public.stipend_recipients%rowtype;
  v_month date := date_trunc('month', p_month)::date;
  v_ref   text := btrim(coalesce(p_ref,''));
  v_note  text := nullif(btrim(coalesce(p_note,'')),'');
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_id    uuid;
begin
  select * into v_row from public.stipend_recipients where id = p_recipient;
  if not found then raise exception 'No such stipend entry.'; end if;
  if not public.stipend_can_act(v_row.profile_id) then
    raise exception 'You cannot record this payment. Nobody records their own stipend.';
  end if;
  if v_month is null then raise exception 'Give the month this payment is for.'; end if;
  if v_month < v_row.start_month or (v_row.end_month is not null and v_month > v_row.end_month) then
    raise exception '% is not on stipend for %.', v_row.recipient_name, to_char(v_month, 'FMMonth YYYY');
  end if;
  if v_month > date_trunc('month', v_today)::date then raise exception 'You cannot record a payment for a month that has not started.'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'Give the amount paid.'; end if;
  if p_amount_kobo > 1000000000 then raise exception 'That amount is too large.'; end if;
  if p_amount_kobo <> v_row.monthly_kobo and (v_note is null or char_length(v_note) < 5) then
    raise exception 'The amount differs from the monthly rate of %. Add a note saying why.', public.stipend_naira(v_row.monthly_kobo);
  end if;
  if p_paid_on is null then raise exception 'Give the day it was paid.'; end if;
  if p_paid_on > v_today then raise exception 'The payment date cannot be in the future.'; end if;
  if v_ref = '' then raise exception 'Give the payment reference.'; end if;
  if v_ref ~ '^[0-9]{10}$' then
    raise exception 'That looks like a bank account number. Give the transfer or receipt reference instead.';
  end if;
  if exists (select 1 from public.stipend_payments where recipient_id = p_recipient and month = v_month and status = 'paid') then
    raise exception '%''s stipend for % is already recorded.', v_row.recipient_name, to_char(v_month, 'FMMonth YYYY');
  end if;

  insert into public.stipend_payments (recipient_id, profile_id, recipient_name, month, amount_kobo, paid_on, payment_ref, note, recorded_by)
  values (p_recipient, v_row.profile_id, v_row.recipient_name, v_month, p_amount_kobo, p_paid_on, v_ref, v_note, auth.uid())
  returning id into v_id;
  perform public.stipend_log('stipend_paid', p_recipient, p_amount_kobo,
    v_row.recipient_name || ', ' || to_char(v_month, 'Mon YYYY') || ', ref ' || v_ref);
  perform public.notify_person(v_row.profile_id, 'stipend', 'Your stipend has been recorded as paid',
    to_char(v_month, 'FMMonth YYYY') || ': ' || public.stipend_naira(p_amount_kobo) || ', paid ' || to_char(p_paid_on, 'FMDD Mon YYYY') || '.',
    'more', 'finance', v_id);
  return v_id;
end;
$$;

-- Void a payment recorded by mistake. It stays on the record, out of the
-- totals, and the month can then be recorded again.
create or replace function public.void_stipend_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.stipend_payments%rowtype; v_reason text := btrim(coalesce(p_reason,''));
begin
  select * into v_pay from public.stipend_payments where id = p_payment for update;
  if not found then raise exception 'No such payment.'; end if;
  if not public.stipend_can_act(v_pay.profile_id) then raise exception 'You cannot void this payment.'; end if;
  if v_pay.status = 'voided' then raise exception 'That payment is already voided.'; end if;
  if char_length(v_reason) < 5 then raise exception 'Give a reason for voiding it (at least 5 characters).'; end if;
  update public.stipend_payments
     set status = 'voided', void_reason = left(v_reason, 500), voided_by = auth.uid(), voided_at = now()
   where id = p_payment;
  perform public.stipend_log('stipend_voided', v_pay.recipient_id, v_pay.amount_kobo,
    v_pay.recipient_name || ', ' || to_char(v_pay.month, 'Mon YYYY') || ': ' || v_reason);
end;
$$;

-- ------------------------------------------------------------
-- 9. Reading: the month and the year
-- ------------------------------------------------------------
-- Everyone on stipend for a given month, with their payment for it if
-- one is recorded. The finance readers only.
create or replace function public.stipend_month_sheet(p_month date)
returns table (
  recipient_id uuid, profile_id uuid, recipient_name text, role_label text, chapter_name text,
  monthly_kobo bigint, payment_id uuid, paid_kobo bigint, paid_on date, payment_ref text,
  payment_note text, can_act boolean
) language plpgsql stable security definer set search_path = public as $$
declare v_month date := date_trunc('month', p_month)::date;
begin
  if not public.finance_can_read_all() then return; end if;
  return query
  select r.id, r.profile_id, r.recipient_name, r.role_label, ch.name, r.monthly_kobo,
         sp.id, sp.amount_kobo, sp.paid_on, sp.payment_ref, sp.note,
         public.stipend_can_act(r.profile_id)
    from public.stipend_recipients r
    left join public.profiles p  on p.id = r.profile_id
    left join public.chapters ch on ch.id = p.chapter_id
    left join public.stipend_payments sp on sp.recipient_id = r.id and sp.month = v_month and sp.status = 'paid'
   where r.start_month <= v_month and (r.end_month is null or r.end_month >= v_month)
   order by r.recipient_name;
end;
$$;

-- The whole list with what the screen needs beside each entry: chapter,
-- whether the caller may act on it, and the last month paid. The finance
-- readers only.
create or replace function public.stipend_list()
returns table (
  recipient_id uuid, profile_id uuid, recipient_name text, role_label text, chapter_name text,
  monthly_kobo bigint, start_month date, end_month date, approval_ref text, note text,
  can_act boolean, last_paid_month date
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.finance_can_read_all() then return; end if;
  return query
  select r.id, r.profile_id, r.recipient_name, r.role_label, ch.name, r.monthly_kobo,
         r.start_month, r.end_month, r.approval_ref, r.note,
         public.stipend_can_act(r.profile_id),
         (select max(sp.month) from public.stipend_payments sp where sp.recipient_id = r.id and sp.status = 'paid')
    from public.stipend_recipients r
    left join public.profiles p  on p.id = r.profile_id
    left join public.chapters ch on ch.id = p.chapter_id
   order by (r.end_month is not null and r.end_month < date_trunc('month', (now() at time zone 'Africa/Lagos'))::date), r.recipient_name;
end;
$$;

-- The year at a glance: what the budget planned for stipends, what the
-- current list commits to for the year, and what has been paid. Planned
-- is the sum of the budget's Stipends lines; paid counts payments for
-- months in the year; committed is each person's monthly rate times the
-- months of the year they are on the list for.
create or replace function public.stipend_year_summary(p_year int)
returns table (
  financial_year int, has_budget boolean, planned_kobo bigint, committed_kobo bigint,
  paid_kobo bigint, paid_count int, recipients int
) language plpgsql stable security definer set search_path = public as $$
declare v_from date := make_date(p_year, 1, 1); v_to date := make_date(p_year, 12, 1);
begin
  if not public.finance_can_read_all() then return; end if;
  return query
  select p_year,
    exists (select 1 from public.annual_budgets b where b.financial_year = p_year),
    coalesce((select sum(bl.planned_kobo) from public.budget_lines bl
               join public.annual_budgets b on b.id = bl.budget_id
              where b.financial_year = p_year and bl.kind = 'expenditure' and bl.category = 'stipends'), 0)::bigint,
    coalesce((select sum(r.monthly_kobo * (
                (extract(year from age(least(coalesce(r.end_month, v_to), v_to), greatest(r.start_month, v_from))) * 12
                 + extract(month from age(least(coalesce(r.end_month, v_to), v_to), greatest(r.start_month, v_from))))::int + 1))
               from public.stipend_recipients r
              where r.start_month <= v_to and (r.end_month is null or r.end_month >= v_from)), 0)::bigint,
    coalesce((select sum(sp.amount_kobo) from public.stipend_payments sp
              where sp.status = 'paid' and sp.month between v_from and v_to), 0)::bigint,
    (select count(*) from public.stipend_payments sp
      where sp.status = 'paid' and sp.month between v_from and v_to)::int,
    (select count(*) from public.stipend_recipients r
      where r.start_month <= v_to and (r.end_month is null or r.end_month >= v_from))::int;
end;
$$;

-- ------------------------------------------------------------
-- 10. The annual budget now counts stipends paid
-- ------------------------------------------------------------
-- As Batch 35, with one addition: actual expenditure includes stipends
-- paid for months in the budget year.
create or replace function public.budget_vs_actual(p_year int)
returns table (
  budget_id uuid, financial_year int, status text, approved_late boolean,
  planned_income_kobo bigint, planned_expenditure_kobo bigint,
  actual_income_kobo bigint, actual_expenditure_kobo bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.budget_can_read() then return; end if;
  return query
  select b.id, b.financial_year, b.status, b.approved_late,
    coalesce((select sum(bl.planned_kobo) from public.budget_lines bl where bl.budget_id = b.id and bl.kind='income'),0)::bigint,
    coalesce((select sum(bl.planned_kobo) from public.budget_lines bl where bl.budget_id = b.id and bl.kind='expenditure'),0)::bigint,
    ( coalesce((select sum(dn.amount_kobo) from public.donations dn where dn.status='active' and extract(year from dn.received_on)=b.financial_year),0)
      + coalesce((select sum(g.awarded_kobo) from public.grants g
                   where g.status in ('awarded','active','reporting','closed')
                     and (g.period_start is null or extract(year from g.period_start) <= b.financial_year)
                     and (g.period_end   is null or extract(year from g.period_end)   >= b.financial_year)),0) )::bigint,
    ( coalesce((select sum(c.amount_kobo) from public.expense_claims c
               where c.status in ('approved','paid')
                 and c.reviewed_at is not null
                 and extract(year from (c.reviewed_at at time zone 'Africa/Lagos'))=b.financial_year),0)
      + coalesce((select sum(sp.amount_kobo) from public.stipend_payments sp
                   where sp.status = 'paid' and extract(year from sp.month) = b.financial_year),0) )::bigint
    from public.annual_budgets b
   where b.financial_year = p_year;
end;
$$;

-- ------------------------------------------------------------
-- 11. Who may call what
-- ------------------------------------------------------------
revoke all on function public.stipend_candidates(text)                                            from public, anon;
revoke all on function public.save_stipend_recipient(uuid, uuid, bigint, date, date, text, text, text) from public, anon;
revoke all on function public.end_stipend(uuid, date)                                              from public, anon;
revoke all on function public.record_stipend_payment(uuid, date, bigint, date, text, text)         from public, anon;
revoke all on function public.void_stipend_payment(uuid, text)                                     from public, anon;
revoke all on function public.stipend_month_sheet(date)                                            from public, anon;
revoke all on function public.stipend_list()                                                       from public, anon;
revoke all on function public.stipend_year_summary(int)                                            from public, anon;
revoke all on function public.stipend_can_act(uuid)                                                from public, anon;
revoke all on function public.stipend_can_manage()                                                 from public, anon;
revoke all on function public.budget_vs_actual(int)                                                from public, anon;

grant execute on function public.stipend_candidates(text)                                            to authenticated;
grant execute on function public.save_stipend_recipient(uuid, uuid, bigint, date, date, text, text, text) to authenticated;
grant execute on function public.end_stipend(uuid, date)                                              to authenticated;
grant execute on function public.record_stipend_payment(uuid, date, bigint, date, text, text)         to authenticated;
grant execute on function public.void_stipend_payment(uuid, text)                                     to authenticated;
grant execute on function public.stipend_month_sheet(date)                                            to authenticated;
grant execute on function public.stipend_list()                                                       to authenticated;
grant execute on function public.stipend_year_summary(int)                                            to authenticated;
grant execute on function public.stipend_can_act(uuid)                                                to authenticated;
grant execute on function public.stipend_can_manage()                                                 to authenticated;
grant execute on function public.budget_vs_actual(int)                                                to authenticated;
