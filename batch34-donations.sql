-- ============================================================
-- YCDI Programme Hub
-- Batch 34: Donations (money coming in)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
-- Run it after Batch 32 (finance) and Batch 29 (audience contacts).
--
-- BATCH34-MARKER donations
--
-- What this is
-- ------------
-- The income side of finance. Batch 32 records money going out (claims),
-- Batch 33 records grants (income with strings). This records the gifts:
-- what a donor gave, when, how, and whether it was for anything in
-- particular. It gives the Financial Secretary a donor record and the
-- Treasurer and the Board a real income figure, instead of a number
-- reconstructed from a spreadsheet every March.
--
-- The seat duties decide who does what. The Financial Secretary's seat
-- (FIN) owns donor records and financial reporting, so FIN and the
-- National Coordinator record and manage donations. The Deputy's seat
-- (DNC) owns partnerships and fundraising, so the Deputy reads the giving
-- their fundraising brings in, but does not keep the record. The Treasurer
-- (TREAS) reads. A plain admin sees nothing, the same call every donor
-- surface has made since Batch 29, because donor data is confidential
-- (YCDI-STR-004 2.3).
--
-- A donation is never deleted. A mistake is corrected, and the change is
-- recorded; a gift entered that never arrived is voided, which keeps it in
-- the record but out of every total. Audit integrity is not optional
-- for money a donor entrusted.
--
-- Money is whole kobo (bigint), as everywhere in finance. Nothing here
-- moves money; it records what was received. No bank account number is
-- stored: a reference that is a bare ten-digit number is refused, the same
-- guard the claims payment reference carries.
--
-- What this touches that already exists
--   finance_events   one new column (donation_id) and the donation kinds,
--                    so a gift's history sits in the same ledger as the rest
-- Everything else is new.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers, re-declared so this file stands on its own
-- ------------------------------------------------------------
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1. Who may read donations, and who may record them
-- ------------------------------------------------------------
-- Read: NC, and the FIN, DNC or TREAS seats. Not is_admin().
create or replace function public.donations_can_read()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('FIN'), false)
      or coalesce(public.holds_portfolio('DNC'), false)
      or coalesce(public.holds_portfolio('TREAS'), false)
$$;

-- Manage (record, correct, acknowledge, void): NC and the FIN seat. The
-- Deputy reads their fundraising results but does not keep the records;
-- the Treasurer reads only.
create or replace function public.donations_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('FIN'), false)
$$;

grant execute on function public.donations_can_read()   to authenticated;
grant execute on function public.donations_can_manage() to authenticated;

-- ------------------------------------------------------------
-- 2. The donations
-- ------------------------------------------------------------
create table if not exists public.donations (
  id            uuid primary key default gen_random_uuid(),
  donation_no   bigint generated always as identity,
  donor_id      uuid references public.audience_contacts(id) on delete set null,
  -- Always named, so a gift reads on its own even from a donor who is not
  -- in the contacts list. "Anonymous" is a fine name.
  donor_name    text not null check (btrim(donor_name) <> '' and char_length(donor_name) <= 160),
  amount_kobo   bigint not null check (amount_kobo > 0 and amount_kobo <= 100000000000),
  received_on   date not null,
  method        text not null
                  check (method in ('transfer','cash','cheque','card','online','in_kind','other')),
  -- A payment reference or teller number. Never a bank account number: a
  -- bare ten-digit number is refused below, as on a claim's payment.
  reference     text check (reference is null or char_length(reference) <= 60),
  -- General income, or restricted to a stated purpose.
  designation   text not null default 'general' check (designation in ('general','restricted')),
  restricted_to text check (restricted_to is null or char_length(restricted_to) <= 300),
  -- The fundraising moment it belongs to, if any (YCDI's donor calendar).
  campaign      text check (campaign is null or campaign in
                  ('january_launch','easter_mission','may_donor_night','back_to_school','year_end','impact_report','general')),
  acknowledged     boolean not null default false,
  acknowledged_on  date,
  status        text not null default 'active' check (status in ('active','voided')),
  void_reason   text check (void_reason is null or char_length(void_reason) <= 300),
  note          text check (note is null or char_length(note) <= 1000),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint donations_restricted_has_text
    check (designation <> 'restricted' or (restricted_to is not null and btrim(restricted_to) <> '')),
  constraint donations_ack_has_date
    check (acknowledged = (acknowledged_on is not null)),
  constraint donations_void_has_reason
    check (status <> 'voided' or (void_reason is not null and btrim(void_reason) <> '')),
  constraint donations_ref_not_account_number
    check (reference is null or reference !~ '^\s*[0-9]{10}\s*$')
);
comment on table public.donations is
  'Gifts received. Amounts in kobo. Never deleted: a mistake is corrected, a gift that never arrived is voided. Nothing here moves money.';
create index if not exists donations_donor_idx    on public.donations (donor_id, received_on desc);
create index if not exists donations_received_idx on public.donations (received_on desc);
create index if not exists donations_campaign_idx on public.donations (campaign, received_on);

-- ------------------------------------------------------------
-- 3. A gift's history joins the finance ledger
-- ------------------------------------------------------------
alter table public.finance_events add column if not exists donation_id uuid;
create index if not exists finance_events_donation_idx on public.finance_events (donation_id, at);

alter table public.finance_events drop constraint if exists finance_events_kind_check;
alter table public.finance_events add constraint finance_events_kind_check
  check (kind in ('claim_submitted','claim_returned','claim_approved',
                  'claim_rejected','claim_paid','claim_withdrawn',
                  'budget_set','budget_revised',
                  'grant_created','grant_status','grant_edited',
                  'obligation_added','obligation_settled','obligation_waived',
                  'programme_funded','programme_unfunded',
                  'donation_recorded','donation_corrected','donation_acknowledged','donation_voided'));

create or replace function public.donation_log(
  p_kind text, p_donation uuid, p_amount bigint, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_name text;
begin
  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.finance_events (actor_id, actor_name, kind, donation_id, amount_kobo, note)
  values (v_actor, coalesce(v_name, case when v_actor is null then 'System' else 'Unknown account' end),
          p_kind, p_donation, p_amount, left(p_note, 500));
end;
$$;
revoke all on function public.donation_log(text, uuid, bigint, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Reading: row security
-- ------------------------------------------------------------
alter table public.donations enable row level security;
drop policy if exists donations_read on public.donations;
create policy donations_read on public.donations
  for select to authenticated using (public.donations_can_read());

-- The ledger's read policy gains a donation clause, carrying its earlier
-- logic. A gift's history is visible to whoever may read donations.
drop policy if exists finance_events_read on public.finance_events;
create policy finance_events_read on public.finance_events
  for select to authenticated using (
    public.finance_can_read_all()
    or (claim_id is not null and public.finance_can_see_claim(claim_id))
    or (grant_id is not null and public.grant_can_see(grant_id))
    or (donation_id is not null and public.donations_can_read())
  );

-- No write policy, and the grants below strip the write rights, so a
-- direct insert, update or delete is refused twice over.
revoke all on public.donations from anon, authenticated;
grant select on public.donations to authenticated;
revoke all on sequence public.donations_donation_no_seq from anon, authenticated;

-- ------------------------------------------------------------
-- 5. Writing: the donation functions
-- ------------------------------------------------------------
-- Record a gift. Returns its id.
create or replace function public.record_donation(
  p_donor_name text, p_amount_kobo bigint, p_received_on date, p_method text,
  p_donor_id uuid default null, p_reference text default null,
  p_designation text default 'general', p_restricted_to text default null,
  p_campaign text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ref text := nullif(btrim(coalesce(p_reference,'')),'');
begin
  if not public.donations_can_manage() then raise exception 'You cannot record donations.'; end if;
  if p_donor_name is null or btrim(p_donor_name) = '' then raise exception 'Name the donor (or write Anonymous).'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'The amount must be more than zero.'; end if;
  if p_amount_kobo > 100000000000 then raise exception 'That amount is beyond what this records.'; end if;
  if p_received_on is null then raise exception 'Say when it was received.'; end if;
  if p_received_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The date received cannot be in the future.'; end if;
  if p_method not in ('transfer','cash','cheque','card','online','in_kind','other') then raise exception 'Choose how it was given.'; end if;
  if p_designation not in ('general','restricted') then raise exception 'Unknown designation.'; end if;
  if p_designation = 'restricted' and (p_restricted_to is null or btrim(p_restricted_to) = '') then
    raise exception 'A restricted gift needs a note saying what it is restricted to.';
  end if;
  if p_campaign is not null and p_campaign not in
     ('january_launch','easter_mission','may_donor_night','back_to_school','year_end','impact_report','general') then
    raise exception 'Unknown campaign.';
  end if;
  if v_ref is not null and v_ref ~ '^[0-9]{10}$' then
    raise exception 'That looks like a bank account number. Enter the transfer reference instead. The Hub does not store account numbers.';
  end if;
  if p_donor_id is not null and not exists (select 1 from public.audience_contacts where id = p_donor_id) then
    raise exception 'That donor contact does not exist.';
  end if;

  insert into public.donations (donor_id, donor_name, amount_kobo, received_on, method, reference,
                                designation, restricted_to, campaign, note, created_by)
  values (p_donor_id, btrim(p_donor_name), p_amount_kobo, p_received_on, p_method, v_ref,
          p_designation, case when p_designation = 'restricted' then btrim(p_restricted_to) else nullif(btrim(coalesce(p_restricted_to,'')),'') end,
          p_campaign, nullif(btrim(coalesce(p_note,'')),''), auth.uid())
  returning id into v_id;
  perform public.donation_log('donation_recorded', v_id, p_amount_kobo, btrim(p_donor_name));
  return v_id;
end;
$$;

-- Correct a gift already recorded. Same rules as recording; the change is
-- logged. A voided gift cannot be corrected.
create or replace function public.correct_donation(
  p_id uuid, p_donor_name text, p_amount_kobo bigint, p_received_on date, p_method text,
  p_donor_id uuid default null, p_reference text default null,
  p_designation text default 'general', p_restricted_to text default null,
  p_campaign text default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_old bigint; v_ref text := nullif(btrim(coalesce(p_reference,'')),'');
begin
  if not public.donations_can_manage() then raise exception 'You cannot manage donations.'; end if;
  select status, amount_kobo into v_status, v_old from public.donations where id = p_id for update;
  if v_status is null then raise exception 'No such donation.'; end if;
  if v_status = 'voided' then raise exception 'A voided donation cannot be corrected.'; end if;
  if p_donor_name is null or btrim(p_donor_name) = '' then raise exception 'Name the donor (or write Anonymous).'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'The amount must be more than zero.'; end if;
  if p_amount_kobo > 100000000000 then raise exception 'That amount is beyond what this records.'; end if;
  if p_received_on is null or p_received_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'Give a valid date received.'; end if;
  if p_method not in ('transfer','cash','cheque','card','online','in_kind','other') then raise exception 'Choose how it was given.'; end if;
  if p_designation = 'restricted' and (p_restricted_to is null or btrim(p_restricted_to) = '') then
    raise exception 'A restricted gift needs a note saying what it is restricted to.';
  end if;
  if p_campaign is not null and p_campaign not in
     ('january_launch','easter_mission','may_donor_night','back_to_school','year_end','impact_report','general') then
    raise exception 'Unknown campaign.';
  end if;
  if v_ref is not null and v_ref ~ '^[0-9]{10}$' then
    raise exception 'That looks like a bank account number. Enter the transfer reference instead.';
  end if;
  if p_donor_id is not null and not exists (select 1 from public.audience_contacts where id = p_donor_id) then
    raise exception 'That donor contact does not exist.';
  end if;

  update public.donations
     set donor_id = p_donor_id, donor_name = btrim(p_donor_name), amount_kobo = p_amount_kobo,
         received_on = p_received_on, method = p_method, reference = v_ref,
         designation = p_designation,
         restricted_to = case when p_designation = 'restricted' then btrim(p_restricted_to) else nullif(btrim(coalesce(p_restricted_to,'')),'') end,
         campaign = p_campaign, note = nullif(btrim(coalesce(p_note,'')),''), updated_at = now()
   where id = p_id;
  perform public.donation_log('donation_corrected', p_id, p_amount_kobo,
    case when v_old is distinct from p_amount_kobo then 'Amount ' || v_old || ' → ' || p_amount_kobo || ' kobo' else 'Details corrected' end);
end;
$$;

-- Mark that a gift was acknowledged (a thank-you, a receipt), or clear it.
create or replace function public.acknowledge_donation(p_id uuid, p_on date default null, p_acknowledged boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.donations_can_manage() then raise exception 'You cannot manage donations.'; end if;
  select status into v_status from public.donations where id = p_id for update;
  if v_status is null then raise exception 'No such donation.'; end if;
  if v_status = 'voided' then raise exception 'A voided donation cannot be acknowledged.'; end if;
  if p_acknowledged then
    if p_on is not null and p_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The acknowledgement date cannot be in the future.'; end if;
    update public.donations set acknowledged = true, acknowledged_on = coalesce(p_on, (now() at time zone 'Africa/Lagos')::date), updated_at = now() where id = p_id;
    perform public.donation_log('donation_acknowledged', p_id, null, 'Acknowledged');
  else
    update public.donations set acknowledged = false, acknowledged_on = null, updated_at = now() where id = p_id;
  end if;
end;
$$;

-- Void a gift that never arrived, or was entered in error. It stays in the
-- record, out of every total. A reason is required.
create or replace function public.void_donation(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_amt bigint; v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if not public.donations_can_manage() then raise exception 'You cannot manage donations.'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Say why the donation is being voided.'; end if;
  select status, amount_kobo into v_status, v_amt from public.donations where id = p_id for update;
  if v_status is null then raise exception 'No such donation.'; end if;
  if v_status = 'voided' then raise exception 'That donation is already voided.'; end if;
  update public.donations set status = 'voided', void_reason = v_reason, updated_at = now() where id = p_id;
  perform public.donation_log('donation_voided', p_id, v_amt, v_reason);
end;
$$;

-- ------------------------------------------------------------
-- 6. Reading: the numbers
-- ------------------------------------------------------------
-- The donor tier bands (YCDI-STR-004 2.1), applied to a year's giving from
-- a donor. In kobo: Friend < 20,000; Supporter 20,000–99,999;
-- Partner 100,000–499,999; Champion 500,000+.
create or replace function public.donor_tier_for(p_kobo bigint)
returns text language sql immutable as $$
  select case
    when p_kobo >= 50000000 then 'champion'
    when p_kobo >= 10000000 then 'partner'
    when p_kobo >=  2000000 then 'supporter'
    when p_kobo >         0 then 'friend'
    else null end
$$;
grant execute on function public.donor_tier_for(bigint) to authenticated;

-- Giving by donor over a financial year (1 January to 31 December of
-- p_year), active gifts only, with the tier that giving earns. Readers
-- only. A gift with no linked contact is grouped under its written name.
create or replace function public.donation_by_donor(p_year int default null)
returns table (
  donor_id uuid, donor_name text, gifts int, total_kobo bigint,
  last_gift date, tier text, acknowledged_all boolean
) language sql stable security definer set search_path = public as $$
  with yr as (select coalesce(p_year, extract(year from (now() at time zone 'Africa/Lagos')::date))::int as y)
  select d.donor_id, min(d.donor_name), count(*)::int, sum(d.amount_kobo)::bigint,
         max(d.received_on), public.donor_tier_for(sum(d.amount_kobo)::bigint),
         bool_and(d.acknowledged)
    from public.donations d, yr
   where public.donations_can_read()
     and d.status = 'active'
     and extract(year from d.received_on) = yr.y
   group by d.donor_id, coalesce(d.donor_id::text, lower(btrim(d.donor_name)))
   order by sum(d.amount_kobo) desc
$$;

-- The top line for the donations screen: this year's income, by method and
-- by restriction, the count still to be acknowledged, and last year's total
-- for a comparison. Readers only.
create or replace function public.donation_overview(p_year int default null)
returns table (
  year int, gifts int, total_kobo bigint, restricted_kobo bigint, unrestricted_kobo bigint,
  online_kobo bigint, unacknowledged int, donors int, last_year_total_kobo bigint
) language plpgsql stable security definer set search_path = public as $$
declare v_year int := coalesce(p_year, extract(year from (now() at time zone 'Africa/Lagos')::date))::int;
begin
  if not public.donations_can_read() then return; end if;
  return query
  select v_year,
    (select count(*) from public.donations where status='active' and extract(year from received_on)=v_year)::int,
    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and extract(year from received_on)=v_year)::bigint,
    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and designation='restricted' and extract(year from received_on)=v_year)::bigint,
    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and designation='general' and extract(year from received_on)=v_year)::bigint,
    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and method in ('online','card') and extract(year from received_on)=v_year)::bigint,
    (select count(*) from public.donations where status='active' and not acknowledged and extract(year from received_on)=v_year)::int,
    (select count(distinct coalesce(donor_id::text, lower(btrim(donor_name)))) from public.donations where status='active' and extract(year from received_on)=v_year)::int,
    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and extract(year from received_on)=v_year-1)::bigint;
end;
$$;

-- ------------------------------------------------------------
-- 7. Who may call what
-- ------------------------------------------------------------
revoke all on function public.record_donation(text, bigint, date, text, uuid, text, text, text, text, text) from public, anon;
revoke all on function public.correct_donation(uuid, text, bigint, date, text, uuid, text, text, text, text, text) from public, anon;
revoke all on function public.acknowledge_donation(uuid, date, boolean)   from public, anon;
revoke all on function public.void_donation(uuid, text)                    from public, anon;
revoke all on function public.donation_by_donor(int)                       from public, anon;
revoke all on function public.donation_overview(int)                       from public, anon;

grant execute on function public.record_donation(text, bigint, date, text, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.correct_donation(uuid, text, bigint, date, text, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.acknowledge_donation(uuid, date, boolean)   to authenticated;
grant execute on function public.void_donation(uuid, text)                    to authenticated;
grant execute on function public.donation_by_donor(int)                       to authenticated;
grant execute on function public.donation_overview(int)                       to authenticated;
