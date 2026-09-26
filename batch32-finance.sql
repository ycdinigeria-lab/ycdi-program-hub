-- ============================================================
-- YCDI Programme Hub
-- Batch 32: Finance (programme budgets, expense claims, receipts)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH32-MARKER finance
--
-- What this is
-- ------------
-- The Hub's first finance module. It picks up where the concept note
-- leaves off: a programme that has been approved carries the budget
-- figure from its concept note, and money spent against it is claimed
-- back through the Hub, checked against a receipt, and approved by the
-- Financial Secretary.
--
-- The app records money. It never moves it. There is no payment step
-- here, only a note that a payment was made (a reference and a date).
-- Bank account numbers are not stored anywhere in this batch, and a
-- payment reference that is just a bare ten-digit number (which is what
-- an account number looks like) is refused.
--
-- Who can do what
--   Any signed-in member   writes and submits their own claims, and
--                          sees their own claims and nothing else.
--   Everyone else          sees a claim only once it has been sent up. A
--                          draft, and the receipts on it, are private to
--                          the person writing it.
--   Regional Coordinator   also reads every claim and budget in their
--                          own chapter. Read only.
--   FIN seat               (National Financial Secretary) reads
--                          everything, approves, returns or rejects
--                          claims, records payment, and revises a
--                          programme budget.
--   TREAS seat             (Board Treasurer, new in this batch) reads
--                          everything. Changes nothing.
--   National Coordinator   reads everything. Approves only when the
--                          FIN seat is empty, or when the FIN holder is
--                          the person who made the claim.
--   Plain admin            nothing. The admin flag is a technical one
--                          and the finance policy does not name it, the
--                          same call Batch 29 made for donor data.
--
-- Nobody approves their own claim. That holds for the National
-- Coordinator and for the Financial Secretary alike.
--
-- Every change to a claim goes through a function below. The tables
-- themselves accept no writes from a signed-in user, so there is no
-- direct insert, update or delete to get wrong or get around.
--
-- Money is stored as whole kobo (bigint), never as a decimal, so sums
-- do not drift.
--
-- What this touches that already exists
--   nec_portfolios       one extra allowed seat code, TREAS
--   set_portfolio()      redefined to accept TREAS, otherwise unchanged
--   programs             one new trigger that copies the budget at
--                        approval. No column or policy on programs moves.
-- Everything else is new.
-- ============================================================

-- ------------------------------------------------------------
-- 0. The Board Treasurer seat
-- ------------------------------------------------------------
-- The Treasurer is a Board role, not an NEC seat, but the seat register
-- is the one place the Hub records who holds a named responsibility, and
-- a seat grants access only through the policies that name it. Keeping
-- the Treasurer in the same register means the same screen assigns it.
alter table public.nec_portfolios drop constraint if exists nec_portfolios_portfolio_check;
alter table public.nec_portfolios add constraint nec_portfolios_portfolio_check
  check (portfolio in ('DNC','SEC','FIN','PD','VC','COMMS','TREAS'));

create or replace function public.set_portfolio(target uuid, code text, assign boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.dir_role() <> 'NC' and not public.is_admin() then
    raise exception 'Only a National Coordinator or an admin can assign NEC portfolios.';
  end if;
  if code not in ('DNC','SEC','FIN','PD','VC','COMMS','TREAS') then
    raise exception 'Unknown portfolio code: %', code;
  end if;
  if assign then
    if not exists (select 1 from public.profiles where id = target) then
      raise exception 'No such member.';
    end if;
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
grant execute on function public.set_portfolio(uuid, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 1. Who may do what
-- ------------------------------------------------------------
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

-- May this person read every claim and budget? NC, FIN or TREAS.
-- Deliberately not is_admin().
create or replace function public.finance_can_read_all()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('FIN'), false)
      or coalesce(public.holds_portfolio('TREAS'), false)
$$;

-- Is this person the officer who runs finance right now? The FIN holder;
-- or the National Coordinator while nobody holds the FIN seat, so money
-- is never stuck waiting for a seat to be filled.
create or replace function public.finance_is_officer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.holds_portfolio('FIN'), false)
      or ( coalesce(public.dir_role() = 'NC', false)
           and not exists (select 1 from public.nec_portfolios where portfolio = 'FIN') )
$$;

-- May this person decide a claim made by p_claimant? Never their own.
-- The FIN holder decides everyone else's. The National Coordinator
-- decides when the seat is empty, and also decides the FIN holder's own
-- claims, so that person is not marking their own homework.
create or replace function public.finance_can_review(p_claimant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and auth.uid() is distinct from p_claimant
     and ( public.finance_is_officer()
           or ( coalesce(public.dir_role() = 'NC', false)
                and exists (select 1 from public.nec_portfolios
                             where portfolio = 'FIN' and profile_id = p_claimant) ) )
$$;

grant execute on function public.finance_can_read_all()       to authenticated;
grant execute on function public.finance_is_officer()         to authenticated;
grant execute on function public.finance_can_review(uuid)     to authenticated;

-- ------------------------------------------------------------
-- 2. Programme budgets
-- ------------------------------------------------------------
-- The concept note carries a single budget figure in naira. When a
-- programme is approved that figure is copied here in kobo and frozen.
-- Editing the concept note afterwards (a Regional Coordinator can edit
-- their own programme) does not move the figure finance holds. Only
-- revise_programme_budget() below changes it, and that leaves a record.
create table if not exists public.finance_budgets (
  programme_id  uuid primary key references public.programs(id) on delete cascade,
  approved_kobo bigint not null check (approved_kobo >= 0),
  source        text   not null default 'concept_note'
                  check (source in ('concept_note','revised')),
  set_at        timestamptz not null default now(),
  set_by        uuid references public.profiles(id) on delete set null
);
comment on table public.finance_budgets is
  'The budget finance holds for an approved programme, in kobo. Copied from the concept note at approval; changed only by revise_programme_budget().';

-- ------------------------------------------------------------
-- 3. Expense claims
-- ------------------------------------------------------------
create table if not exists public.expense_claims (
  id              uuid primary key default gen_random_uuid(),
  claim_no        bigint generated always as identity,
  claimant_id     uuid references public.profiles(id) on delete set null,
  claimant_name   text not null,
  -- The claimant's chapter at the time. Null for a national officer with
  -- no chapter, which makes it a national claim.
  chapter_id      uuid references public.chapters(id) on delete set null,
  programme_id    uuid references public.programs(id) on delete set null,
  category        text not null
                    check (category in ('transport','venue','materials','printing',
                                        'refreshments','data_airtime','honoraria_gifts','other')),
  title           text not null check (btrim(title) <> '' and char_length(title) <= 120),
  description     text check (description is null or char_length(description) <= 1000),
  amount_kobo     bigint not null check (amount_kobo > 0 and amount_kobo <= 5000000000),
  incurred_on     date not null,
  -- A claim goes up with a receipt, or with a written reason why there is
  -- none. The reason is shown to the reviewer.
  no_receipt_reason text check (no_receipt_reason is null or char_length(no_receipt_reason) <= 500),
  status          text not null default 'draft'
                    check (status in ('draft','submitted','returned','approved','rejected','paid','withdrawn')),
  submitted_at    timestamptz,
  -- The reimbursement clock: thirty days from the day a complete claim
  -- goes up (YCDI-FIN). It restarts if a claim is sent back and mended.
  due_by          date,
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or char_length(review_note) <= 500),
  over_budget     boolean not null default false,
  paid_on         date,
  payment_ref     text check (payment_ref is null or char_length(payment_ref) <= 60),
  paid_by         uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint expense_claims_paid_has_ref
    check (status <> 'paid' or (paid_on is not null and payment_ref is not null)),
  constraint expense_claims_ref_not_account_number
    check (payment_ref is null or payment_ref !~ '^\s*[0-9]{10}\s*$'),
  constraint expense_claims_submitted_has_clock
    check (status not in ('submitted','approved','paid') or (submitted_at is not null and due_by is not null))
);
create index if not exists expense_claims_claimant_idx  on public.expense_claims (claimant_id, created_at desc);
create index if not exists expense_claims_chapter_idx   on public.expense_claims (chapter_id, status);
create index if not exists expense_claims_programme_idx on public.expense_claims (programme_id, status);
create index if not exists expense_claims_queue_idx     on public.expense_claims (status, due_by);

-- ------------------------------------------------------------
-- 4. Receipts
-- ------------------------------------------------------------
create table if not exists public.expense_receipts (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.expense_claims(id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (btrim(file_name) <> '' and char_length(file_name) <= 200),
  uploaded_by  uuid references public.profiles(id) on delete set null,
  uploaded_at  timestamptz not null default now()
);
create index if not exists expense_receipts_claim_idx on public.expense_receipts (claim_id);

-- ------------------------------------------------------------
-- 5. The record of what happened
-- ------------------------------------------------------------
-- Append-only, the same idea as the audit log, and for the same reason:
-- every writer here is a security definer function that runs as the
-- table owner, so row security would not stop a careless line rewriting
-- history. The trigger does.
create table if not exists public.finance_events (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_name   text,
  kind         text not null
                 check (kind in ('claim_submitted','claim_returned','claim_approved',
                                 'claim_rejected','claim_paid','claim_withdrawn',
                                 'budget_set','budget_revised')),
  claim_id     uuid,
  programme_id uuid,
  chapter_id   uuid,
  amount_kobo  bigint,
  note         text
);
create index if not exists finance_events_claim_idx on public.finance_events (claim_id, at);
create index if not exists finance_events_time_idx  on public.finance_events (at desc);

create or replace function public.finance_events_are_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The finance record is append-only. Entries cannot be % once written.',
    case tg_op when 'DELETE' then 'deleted' else 'changed' end;
end;
$$;

drop trigger if exists finance_events_no_rewrite on public.finance_events;
create trigger finance_events_no_rewrite
  before update or delete on public.finance_events
  for each row execute function public.finance_events_are_append_only();

drop trigger if exists finance_events_no_rewrite_stmt on public.finance_events;
create trigger finance_events_no_rewrite_stmt
  before update or delete on public.finance_events
  for each statement execute function public.finance_events_are_append_only();

create or replace function public.finance_log(
  p_kind text, p_claim uuid, p_programme uuid, p_chapter uuid, p_amount bigint, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
begin
  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.finance_events (actor_id, actor_name, kind, claim_id, programme_id, chapter_id, amount_kobo, note)
  values (v_actor,
          coalesce(v_name, case when v_actor is null then 'System' else 'Unknown account' end),
          p_kind, p_claim, p_programme, p_chapter, p_amount, left(p_note, 500));
end;
$$;

-- ------------------------------------------------------------
-- 6. Reading: row security
-- ------------------------------------------------------------
-- One helper for "may this person see this claim", so the claim, its
-- receipts, its history and the receipt files all agree.
create or replace function public.finance_can_see_claim(p_claim uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.expense_claims c
     where c.id = p_claim
       and ( c.claimant_id = auth.uid()
             -- Anybody else sees a claim only once it has been sent up at
             -- least once. A draft is the claimant's own work in progress.
             or ( c.submitted_at is not null
                  and ( public.finance_can_read_all()
                        or ( public.dir_role() = 'RC'
                             and c.chapter_id is not null
                             and c.chapter_id = public.dir_chapter() ) ) ) )
  )
$$;
grant execute on function public.finance_can_see_claim(uuid) to authenticated;

alter table public.finance_budgets  enable row level security;
alter table public.expense_claims   enable row level security;
alter table public.expense_receipts enable row level security;
alter table public.finance_events   enable row level security;

drop policy if exists finance_budgets_read  on public.finance_budgets;
drop policy if exists expense_claims_read   on public.expense_claims;
drop policy if exists expense_receipts_read on public.expense_receipts;
drop policy if exists finance_events_read   on public.finance_events;

create policy finance_budgets_read on public.finance_budgets
  for select to authenticated using (
    public.finance_can_read_all()
    or ( public.dir_role() = 'RC'
         and exists (select 1 from public.programs p
                      where p.id = programme_id and p.chapter_id = public.dir_chapter()) )
  );

create policy expense_claims_read on public.expense_claims
  for select to authenticated using (
    claimant_id = auth.uid()
    or ( submitted_at is not null
         and ( public.finance_can_read_all()
               or ( public.dir_role() = 'RC' and chapter_id is not null and chapter_id = public.dir_chapter() ) ) )
  );

create policy expense_receipts_read on public.expense_receipts
  for select to authenticated using (public.finance_can_see_claim(claim_id));

create policy finance_events_read on public.finance_events
  for select to authenticated using (
    public.finance_can_read_all()
    or (claim_id is not null and public.finance_can_see_claim(claim_id))
  );

-- No write policy exists on any of the four, and the grants below take
-- the rights away as well, so a direct insert, update or delete from the
-- app is refused twice over. Everything goes through the functions.
revoke all on public.finance_budgets, public.expense_claims,
              public.expense_receipts, public.finance_events from anon, authenticated;
grant select on public.finance_budgets, public.expense_claims,
                public.expense_receipts, public.finance_events to authenticated;

-- Supabase hands out sequence rights by default too. The record's counter
-- and the claim number are only ever advanced by the functions below,
-- which run as the owner, so nobody signed in needs them.
revoke all on sequence public.finance_events_id_seq      from anon, authenticated;
revoke all on sequence public.expense_claims_claim_no_seq from anon, authenticated;

-- ------------------------------------------------------------
-- 7. Copying the budget at approval
-- ------------------------------------------------------------
create or replace function public.finance_snapshot_budget()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kobo bigint;
  v_had  boolean;
begin
  if new.status not in ('Approved','Live','Complete') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_kobo := round(coalesce(new.budget, 0) * 100)::bigint;
  select exists (select 1 from public.finance_budgets where programme_id = new.id) into v_had;

  if not v_had then
    insert into public.finance_budgets (programme_id, approved_kobo, source, set_by)
    values (new.id, v_kobo, 'concept_note', auth.uid());
    perform public.finance_log('budget_set', null, new.id, new.chapter_id, v_kobo, 'Copied from the approved concept note');
  else
    -- A programme sent back, corrected and approved again picks up the
    -- corrected figure, but only while no money has been claimed against
    -- it and nobody has revised it by hand.
    update public.finance_budgets b
       set approved_kobo = v_kobo, set_at = now(), set_by = auth.uid()
     where b.programme_id = new.id
       and b.source = 'concept_note'
       and b.approved_kobo is distinct from v_kobo
       and not exists (select 1 from public.expense_claims c
                        where c.programme_id = new.id
                          and c.status in ('submitted','approved','paid'));
    if found then
      perform public.finance_log('budget_set', null, new.id, new.chapter_id, v_kobo, 'Updated at re-approval of the concept note');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_snapshot_budget_trg on public.programs;
create trigger finance_snapshot_budget_trg
  after insert or update of status on public.programs
  for each row execute function public.finance_snapshot_budget();

-- Programmes already approved before this batch existed.
insert into public.finance_budgets (programme_id, approved_kobo, source)
select p.id, round(coalesce(p.budget, 0) * 100)::bigint, 'concept_note'
  from public.programs p
 where p.status in ('Approved','Live','Complete')
on conflict (programme_id) do nothing;

-- ------------------------------------------------------------
-- 8. Writing: the claim functions
-- ------------------------------------------------------------
-- Create or edit a claim. p_id null creates a draft. A claim can be
-- edited only by its owner and only while it is a draft or has been sent
-- back. Returns the claim id.
create or replace function public.save_claim(
  p_id uuid, p_title text, p_category text, p_amount_kobo bigint, p_incurred_on date,
  p_programme uuid default null, p_description text default null, p_no_receipt_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_name    text;
  v_chapter uuid;
  v_claim   public.expense_claims%rowtype;
  v_id      uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select full_name, chapter_id into v_name, v_chapter from public.profiles where id = v_me;
  if v_name is null and not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'No member account found.';
  end if;

  if p_title is null or btrim(p_title) = '' then raise exception 'Give the claim a title.'; end if;
  if char_length(p_title) > 120 then raise exception 'The title is too long (120 characters at most).'; end if;
  if p_category is null or p_category not in ('transport','venue','materials','printing','refreshments','data_airtime','honoraria_gifts','other') then
    raise exception 'Choose a category.';
  end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'The amount must be more than zero.'; end if;
  if p_amount_kobo > 5000000000 then raise exception 'The amount is over the ₦50,000,000 limit for a single claim.'; end if;
  if p_incurred_on is null then raise exception 'Say when the money was spent.'; end if;
  if p_incurred_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The spend date cannot be in the future.'; end if;
  if p_description is not null and char_length(p_description) > 1000 then raise exception 'The description is too long (1000 characters at most).'; end if;
  if p_no_receipt_reason is not null and char_length(p_no_receipt_reason) > 500 then raise exception 'The reason is too long (500 characters at most).'; end if;

  if p_programme is not null then
    if not exists (select 1 from public.finance_budgets where programme_id = p_programme) then
      raise exception 'That programme has no approved budget yet.';
    end if;
    if v_chapter is null or not exists (select 1 from public.programs where id = p_programme and chapter_id = v_chapter) then
      raise exception 'You can only claim against a programme in your own chapter.';
    end if;
  end if;

  if p_id is null then
    insert into public.expense_claims
      (claimant_id, claimant_name, chapter_id, programme_id, category, title, description,
       amount_kobo, incurred_on, no_receipt_reason)
    values
      (v_me, coalesce(v_name, 'Member'), v_chapter, p_programme, p_category, btrim(p_title),
       nullif(btrim(coalesce(p_description, '')), ''), p_amount_kobo, p_incurred_on,
       nullif(btrim(coalesce(p_no_receipt_reason, '')), ''))
    returning id into v_id;
    return v_id;
  end if;

  select * into v_claim from public.expense_claims where id = p_id;
  if not found or v_claim.claimant_id is distinct from v_me then
    raise exception 'That claim is not yours to edit.';
  end if;
  if v_claim.status not in ('draft','returned') then
    raise exception 'A claim can be edited only while it is a draft or has been sent back.';
  end if;
  update public.expense_claims
     set programme_id = p_programme, category = p_category, title = btrim(p_title),
         description = nullif(btrim(coalesce(p_description, '')), ''),
         amount_kobo = p_amount_kobo, incurred_on = p_incurred_on,
         no_receipt_reason = nullif(btrim(coalesce(p_no_receipt_reason, '')), ''),
         updated_at = now()
   where id = p_id;
  return p_id;
end;
$$;

-- Register a receipt file that has already been uploaded to the private
-- finance-receipts bucket. The file must sit under the claim's own
-- folder, and must really exist in storage.
create or replace function public.add_receipt(p_claim uuid, p_path text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_claim public.expense_claims%rowtype;
  v_id    uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_claim from public.expense_claims where id = p_claim;
  if not found or v_claim.claimant_id is distinct from v_me then
    raise exception 'That claim is not yours to add a receipt to.';
  end if;
  if v_claim.status not in ('draft','returned') then
    raise exception 'Receipts can be added only while a claim is a draft or has been sent back.';
  end if;
  if p_path is null or left(p_path, char_length(p_claim::text) + 1) <> p_claim::text || '/' then
    raise exception 'The receipt is not in this claim''s folder.';
  end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'The receipt needs a file name.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'finance-receipts' and name = p_path) then
    raise exception 'That file has not finished uploading. Try again.';
  end if;
  if (select count(*) from public.expense_receipts where claim_id = p_claim) >= 5 then
    raise exception 'A claim can carry five receipts at most.';
  end if;
  insert into public.expense_receipts (claim_id, storage_path, file_name, uploaded_by)
  values (p_claim, p_path, left(btrim(p_name), 200), v_me)
  returning id into v_id;
  return v_id;
end;
$$;

-- Remove a receipt record. Returns the storage path so the app can delete
-- the file itself.
create or replace function public.remove_receipt(p_receipt uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_rec public.expense_receipts%rowtype;
  v_claim public.expense_claims%rowtype;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_rec from public.expense_receipts where id = p_receipt;
  if not found then raise exception 'No such receipt.'; end if;
  select * into v_claim from public.expense_claims where id = v_rec.claim_id;
  if v_claim.claimant_id is distinct from v_me then raise exception 'That receipt is not yours to remove.'; end if;
  if v_claim.status not in ('draft','returned') then
    raise exception 'Receipts can be removed only while a claim is a draft or has been sent back.';
  end if;
  delete from public.expense_receipts where id = p_receipt;
  return v_rec.storage_path;
end;
$$;

-- Tell whoever decides this claim that it is waiting. The FIN holder,
-- unless the claim is theirs, in which case every National Coordinator.
create or replace function public.finance_notify_reviewers(p_claim uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_claimant uuid;
  v_holder   uuid;
  r          record;
begin
  select claimant_id into v_claimant from public.expense_claims where id = p_claim;
  v_holder := public.portfolio_holder('FIN');
  if v_holder is not null and v_holder is distinct from v_claimant then
    perform public.notify_person(v_holder, 'finance_claim', p_title, p_body, 'more', 'finance', p_claim);
  else
    for r in select id from public.profiles where role = 'NC' and id is distinct from v_claimant loop
      perform public.notify_person(r.id, 'finance_claim', p_title, p_body, 'more', 'finance', p_claim);
    end loop;
  end if;
end;
$$;

create or replace function public.submit_claim(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_claim public.expense_claims%rowtype;
  v_files int;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_claim from public.expense_claims where id = p_claim for update;
  if not found or v_claim.claimant_id is distinct from v_me then
    raise exception 'That claim is not yours to submit.';
  end if;
  if v_claim.status not in ('draft','returned') then
    raise exception 'Only a draft or a claim that was sent back can be submitted.';
  end if;
  select count(*) into v_files from public.expense_receipts where claim_id = p_claim;
  if v_files = 0 and (v_claim.no_receipt_reason is null or char_length(btrim(v_claim.no_receipt_reason)) < 10) then
    raise exception 'Attach a receipt, or write a reason there is none (at least 10 characters).';
  end if;
  if v_claim.programme_id is not null
     and not exists (select 1 from public.finance_budgets where programme_id = v_claim.programme_id) then
    raise exception 'That programme has no approved budget.';
  end if;

  update public.expense_claims
     set status = 'submitted',
         submitted_at = now(),
         due_by = (now() at time zone 'Africa/Lagos')::date + 30,
         reviewed_by = null, reviewed_at = null, review_note = null, over_budget = false,
         updated_at = now()
   where id = p_claim;

  perform public.finance_log('claim_submitted', p_claim, v_claim.programme_id, v_claim.chapter_id, v_claim.amount_kobo,
    case when v_files = 0 then 'No receipt: ' || btrim(v_claim.no_receipt_reason) else null end);
  perform public.finance_notify_reviewers(p_claim, 'An expense claim is waiting', left(v_claim.title, 120));
end;
$$;

create or replace function public.withdraw_claim(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_claim public.expense_claims%rowtype;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_claim from public.expense_claims where id = p_claim for update;
  if not found or v_claim.claimant_id is distinct from v_me then
    raise exception 'That claim is not yours to withdraw.';
  end if;
  if v_claim.status not in ('draft','submitted','returned') then
    raise exception 'A claim that has been approved, paid or rejected cannot be withdrawn.';
  end if;
  update public.expense_claims set status = 'withdrawn', updated_at = now() where id = p_claim;
  if v_claim.status = 'submitted' then
    perform public.finance_log('claim_withdrawn', p_claim, v_claim.programme_id, v_claim.chapter_id, v_claim.amount_kobo, null);
  end if;
end;
$$;

-- Decide a submitted claim: 'approve', 'return' (back to the claimant to
-- mend and resubmit) or 'reject' (final). A return or a rejection needs a
-- note. An approval that takes the programme over its approved budget
-- needs a note as well, and the claim is flagged.
create or replace function public.review_claim(p_claim uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_claim  public.expense_claims%rowtype;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_budget bigint;
  v_used   bigint;
  v_over   boolean := false;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if p_decision not in ('approve','return','reject') then raise exception 'Unknown decision.'; end if;
  select * into v_claim from public.expense_claims where id = p_claim for update;
  if not found then raise exception 'No such claim.'; end if;
  if not public.finance_can_review(v_claim.claimant_id) then
    raise exception 'You cannot decide this claim.';
  end if;
  if v_claim.status <> 'submitted' then
    raise exception 'Only a submitted claim can be decided.';
  end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'The note is too long (500 characters at most).'; end if;
  if p_decision in ('return','reject') and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Say why, so the claimant knows what to do next.';
  end if;

  if p_decision = 'approve' and v_claim.programme_id is not null then
    select approved_kobo into v_budget from public.finance_budgets where programme_id = v_claim.programme_id;
    select coalesce(sum(amount_kobo), 0) into v_used
      from public.expense_claims
     where programme_id = v_claim.programme_id and status in ('approved','paid') and id <> p_claim;
    if v_budget is null then raise exception 'That programme has no approved budget.'; end if;
    if v_used + v_claim.amount_kobo > v_budget then
      if v_note is null or char_length(v_note) < 10 then
        raise exception 'This takes the programme over its approved budget. Write a note (at least 10 characters) saying why it is approved.';
      end if;
      v_over := true;
    end if;
  end if;

  update public.expense_claims
     set status = case p_decision when 'approve' then 'approved' when 'return' then 'returned' else 'rejected' end,
         reviewed_by = v_me, reviewed_at = now(), review_note = v_note, over_budget = v_over,
         updated_at = now()
   where id = p_claim;

  perform public.finance_log(
    case p_decision when 'approve' then 'claim_approved' when 'return' then 'claim_returned' else 'claim_rejected' end,
    p_claim, v_claim.programme_id, v_claim.chapter_id, v_claim.amount_kobo,
    case when v_over then 'Over budget. ' || coalesce(v_note, '') else v_note end);

  perform public.notify_person(
    v_claim.claimant_id, 'finance_claim',
    case p_decision when 'approve' then 'Your expense claim was approved'
                    when 'return'  then 'Your expense claim was sent back'
                    else 'Your expense claim was not approved' end,
    left(v_claim.title, 120), 'more', 'finance', p_claim);
end;
$$;

-- Record that an approved claim has been paid. Reference and date only.
create or replace function public.mark_claim_paid(p_claim uuid, p_ref text, p_paid_on date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_claim public.expense_claims%rowtype;
  v_ref   text := btrim(coalesce(p_ref, ''));
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_claim from public.expense_claims where id = p_claim for update;
  if not found then raise exception 'No such claim.'; end if;
  if not public.finance_can_review(v_claim.claimant_id) then
    raise exception 'You cannot record payment on this claim.';
  end if;
  if v_claim.status <> 'approved' then raise exception 'Only an approved claim can be marked paid.'; end if;
  if v_ref = '' then raise exception 'Enter the payment reference.'; end if;
  if char_length(v_ref) > 60 then raise exception 'The payment reference is too long (60 characters at most).'; end if;
  if v_ref ~ '^[0-9]{10}$' then
    raise exception 'That looks like a bank account number. Enter the transfer reference instead. The Hub does not store account numbers.';
  end if;
  if p_paid_on is null then raise exception 'Enter the date it was paid.'; end if;
  if p_paid_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The payment date cannot be in the future.'; end if;
  if p_paid_on < (v_claim.reviewed_at at time zone 'Africa/Lagos')::date then
    raise exception 'The payment date cannot be before the claim was approved.';
  end if;

  update public.expense_claims
     set status = 'paid', paid_on = p_paid_on, payment_ref = v_ref, paid_by = v_me, updated_at = now()
   where id = p_claim;
  perform public.finance_log('claim_paid', p_claim, v_claim.programme_id, v_claim.chapter_id, v_claim.amount_kobo, v_ref);
  perform public.notify_person(v_claim.claimant_id, 'finance_claim', 'Your expense claim was paid',
                               left(v_claim.title, 120), 'more', 'finance', p_claim);
end;
$$;

-- Change the budget finance holds for a programme. The officer only, with
-- a reason, and never below what has already been approved or paid.
create or replace function public.revise_programme_budget(p_programme uuid, p_new_kobo bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old     bigint;
  v_claimed bigint;
  v_chapter uuid;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not public.finance_is_officer() then raise exception 'Only the Financial Secretary can revise a budget.'; end if;
  if p_new_kobo is null or p_new_kobo < 0 then raise exception 'The budget cannot be negative.'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Give a reason (at least 10 characters).'; end if;
  if char_length(v_reason) > 300 then raise exception 'The reason is too long (300 characters at most).'; end if;
  select approved_kobo into v_old from public.finance_budgets where programme_id = p_programme for update;
  if not found then raise exception 'That programme has no approved budget.'; end if;
  select coalesce(sum(amount_kobo), 0) into v_claimed
    from public.expense_claims where programme_id = p_programme and status in ('approved','paid');
  if p_new_kobo < v_claimed then
    raise exception 'The budget cannot go below what has already been approved or paid against it.';
  end if;
  select chapter_id into v_chapter from public.programs where id = p_programme;
  update public.finance_budgets
     set approved_kobo = p_new_kobo, source = 'revised', set_at = now(), set_by = auth.uid()
   where programme_id = p_programme;
  perform public.finance_log('budget_revised', null, p_programme, v_chapter, p_new_kobo,
    'From ' || v_old || ' to ' || p_new_kobo || ' kobo. ' || v_reason);
end;
$$;

-- ------------------------------------------------------------
-- 9. Reading: the numbers the screen shows
-- ------------------------------------------------------------
-- Budget against spend for every programme the caller may see: all of
-- them for NC, FIN and TREAS; their own chapter's for a Regional
-- Coordinator; nothing for anyone else.
--   committed = approved, not yet paid
--   paid      = paid
--   pending   = submitted, waiting for a decision
--   reported  = the spend figure in the post-programme report, in kobo,
--               shown next to the claims so a gap is visible
create or replace function public.finance_programme_summary()
returns table (
  programme_id uuid, title text, chapter_id uuid, chapter_name text, programme_date date,
  status text, approved_kobo bigint, committed_kobo bigint, paid_kobo bigint,
  pending_kobo bigint, remaining_kobo bigint, reported_kobo bigint
) language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.chapter_id, ch.name, p.date, p.status,
         b.approved_kobo,
         coalesce(sum(c.amount_kobo) filter (where c.status = 'approved'), 0)::bigint,
         coalesce(sum(c.amount_kobo) filter (where c.status = 'paid'), 0)::bigint,
         coalesce(sum(c.amount_kobo) filter (where c.status = 'submitted'), 0)::bigint,
         (b.approved_kobo - coalesce(sum(c.amount_kobo) filter (where c.status in ('approved','paid')), 0))::bigint,
         round(coalesce(p.spent, 0) * 100)::bigint
    from public.finance_budgets b
    join public.programs p on p.id = b.programme_id
    left join public.chapters ch on ch.id = p.chapter_id
    left join public.expense_claims c on c.programme_id = p.id
   where public.finance_can_read_all()
      or (public.dir_role() = 'RC' and p.chapter_id = public.dir_chapter())
   group by p.id, p.title, p.chapter_id, ch.name, p.date, p.status, b.approved_kobo, p.spent
   order by p.date desc nulls last, p.title
$$;

-- The top line for the Treasurer, the Financial Secretary and the NC.
create or replace function public.finance_overview()
returns table (
  approved_kobo bigint, committed_kobo bigint, paid_kobo bigint, pending_kobo bigint,
  waiting_count bigint, overdue_count bigint, due_soon_count bigint, over_budget_count bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  -- An aggregate with no rows still returns one row of zeros, and the
  -- budget total below is read past row security, so the door is shut
  -- here rather than in a where clause.
  if not public.finance_can_read_all() then
    return;
  end if;
  return query
  select
    (select coalesce(sum(b.approved_kobo), 0) from public.finance_budgets b)::bigint,
    coalesce(sum(c.amount_kobo) filter (where c.status = 'approved'), 0)::bigint,
    coalesce(sum(c.amount_kobo) filter (where c.status = 'paid'), 0)::bigint,
    coalesce(sum(c.amount_kobo) filter (where c.status = 'submitted'), 0)::bigint,
    count(*) filter (where c.status = 'submitted'),
    count(*) filter (where c.status = 'submitted' and c.due_by < (now() at time zone 'Africa/Lagos')::date),
    count(*) filter (where c.status = 'submitted'
                       and c.due_by >= (now() at time zone 'Africa/Lagos')::date
                       and c.due_by <= (now() at time zone 'Africa/Lagos')::date + 7),
    count(*) filter (where c.over_budget and c.status in ('approved','paid'))
  from public.expense_claims c;
end;
$$;

-- ------------------------------------------------------------
-- 10. Receipt files: a private bucket, guarded by the claim
-- ------------------------------------------------------------
-- A file lives at <claim id>/<file name>. Whoever may see the claim may
-- read its receipts. Only the claimant may add or remove one, and only
-- while the claim is a draft or has been sent back.
create or replace function public.finance_claim_from_path(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return ((string_to_array(p_name, '/'))[1])::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.finance_can_touch_receipt_file(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.expense_claims c
     where c.id = public.finance_claim_from_path(p_name)
       and c.claimant_id = auth.uid()
       and c.status in ('draft','returned')
  )
$$;
grant execute on function public.finance_claim_from_path(text)        to authenticated;
grant execute on function public.finance_can_touch_receipt_file(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('finance-receipts', 'finance-receipts', false)
on conflict (id) do update set public = false;

-- Supabase's bucket table can also cap size and type. The local test
-- database does not have those columns, so this only runs where they exist.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$
      update storage.buckets
         set file_size_limit = 5242880,
             allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
       where id = 'finance-receipts'
    $q$;
  end if;
end $$;

drop policy if exists finance_receipts_read   on storage.objects;
drop policy if exists finance_receipts_insert on storage.objects;
drop policy if exists finance_receipts_update on storage.objects;
drop policy if exists finance_receipts_delete on storage.objects;

create policy finance_receipts_read on storage.objects
  for select to authenticated using (
    bucket_id = 'finance-receipts'
    and public.finance_can_see_claim(public.finance_claim_from_path(name))
  );
create policy finance_receipts_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'finance-receipts' and public.finance_can_touch_receipt_file(name)
  );
create policy finance_receipts_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'finance-receipts' and public.finance_can_touch_receipt_file(name)
  );
-- No update policy: a receipt is replaced by removing it and adding another.

-- ------------------------------------------------------------
-- 11. Who may call what
-- ------------------------------------------------------------
-- Functions are callable by everyone unless told otherwise, including a
-- signed-out visitor. Every one of these also checks auth.uid(), but the
-- door is closed here as well.
revoke all on function public.save_claim(uuid, text, text, bigint, date, uuid, text, text) from public, anon;
revoke all on function public.add_receipt(uuid, text, text)                               from public, anon;
revoke all on function public.remove_receipt(uuid)                                        from public, anon;
revoke all on function public.submit_claim(uuid)                                          from public, anon;
revoke all on function public.withdraw_claim(uuid)                                        from public, anon;
revoke all on function public.review_claim(uuid, text, text)                              from public, anon;
revoke all on function public.mark_claim_paid(uuid, text, date)                           from public, anon;
revoke all on function public.revise_programme_budget(uuid, bigint, text)                 from public, anon;
revoke all on function public.finance_programme_summary()                                 from public, anon;
revoke all on function public.finance_overview()                                          from public, anon;
revoke all on function public.finance_notify_reviewers(uuid, text, text)                  from public, anon, authenticated;
revoke all on function public.finance_log(text, uuid, uuid, uuid, bigint, text)           from public, anon, authenticated;
revoke all on function public.finance_snapshot_budget()                                   from public, anon, authenticated;

grant execute on function public.save_claim(uuid, text, text, bigint, date, uuid, text, text) to authenticated;
grant execute on function public.add_receipt(uuid, text, text)                               to authenticated;
grant execute on function public.remove_receipt(uuid)                                        to authenticated;
grant execute on function public.submit_claim(uuid)                                          to authenticated;
grant execute on function public.withdraw_claim(uuid)                                        to authenticated;
grant execute on function public.review_claim(uuid, text, text)                              to authenticated;
grant execute on function public.mark_claim_paid(uuid, text, date)                           to authenticated;
grant execute on function public.revise_programme_budget(uuid, bigint, text)                 to authenticated;
grant execute on function public.finance_programme_summary()                                 to authenticated;
grant execute on function public.finance_overview()                                          to authenticated;
