-- ============================================================
-- YCDI Programme Hub
-- Batch 35: The annual budget cycle
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
-- Run it after Batches 32 (finance), 33 (grants) and 34 (donations),
-- whose numbers it measures the year against.
--
-- BATCH35-MARKER annual-budget
--
-- What this is
-- ------------
-- The year's plan, and the year against it. A financial year gets a
-- budget: planned income and planned expenditure, line by line, prepared
-- by the Financial Secretary, approved by the Board before the year
-- starts (YCDI-FIN, thirty days ahead), and then watched through the year
-- as the real numbers come in. The real numbers are the ones the rest of
-- finance already holds: donations received (Batch 34), grant income
-- (Batch 33), and expense claims approved and paid (Batch 32). So this
-- adds the plan and reads the actuals; it invents no new money.
--
-- Who can do what
--   Financial Secretary (FIN), National Coordinator: prepare a budget,
--     write its lines, and submit it for the Board.
--   National Coordinator, Board Treasurer (TREAS): record the Board's
--     approval, with the minute reference, and move a year to active or
--     closed. Approval is a Board act, and the Treasurer carries the
--     Board's finance role, so it does not sit with the Financial
--     Secretary who prepared it.
--   Deputy (DNC): reads, since income planning is fundraising's business.
--   Regional Coordinator: reads the expenditure lines for their own
--     chapter, so a chapter knows its allocation, and no further.
--   A plain admin: nothing, as with every finance surface.
--
-- One budget per financial year. A budget is approved before it can go
-- active; the day it was approved is recorded, and an approval that lands
-- after the year has already begun is flagged as late rather than refused,
-- because a late budget is a fact to record, not one to hide.
--
-- Money is whole kobo (bigint), as everywhere in finance.
--
-- What this touches that already exists
--   finance_events   one new column (budget_id) and the budget kinds
-- Everything else is new.
-- ============================================================

create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.dir_chapter()
  returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1. Who may do what
-- ------------------------------------------------------------
-- Read the budget: NC, and the FIN, TREAS or DNC seats.
create or replace function public.budget_can_read()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('FIN'), false)
      or coalesce(public.holds_portfolio('TREAS'), false)
      or coalesce(public.holds_portfolio('DNC'), false)
$$;

-- Prepare a budget and write its lines: NC and the FIN seat.
create or replace function public.budget_can_prepare()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('FIN'), false)
$$;

-- Approve on the Board's behalf, and move a year active or closed: NC and
-- the TREAS seat. Deliberately not the FIN seat that prepared it.
create or replace function public.budget_can_approve()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.holds_portfolio('TREAS'), false)
$$;

grant execute on function public.budget_can_read()    to authenticated;
grant execute on function public.budget_can_prepare() to authenticated;
grant execute on function public.budget_can_approve() to authenticated;

-- ------------------------------------------------------------
-- 2. The annual budget, one per financial year
-- ------------------------------------------------------------
create table if not exists public.annual_budgets (
  id             uuid primary key default gen_random_uuid(),
  financial_year int not null unique check (financial_year between 2020 and 2100),
  title          text check (title is null or char_length(title) <= 160),
  status         text not null default 'draft'
                   check (status in ('draft','submitted','board_approved','active','closed')),
  prepared_by    uuid references public.profiles(id) on delete set null,
  submitted_at   timestamptz,
  approved_by    uuid references public.profiles(id) on delete set null,
  approved_on    date,
  board_minute   text check (board_minute is null or char_length(board_minute) <= 120),
  approved_late  boolean not null default false,
  notes          text check (notes is null or char_length(notes) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- An approved (or later) budget carries the day and the minute that
  -- approved it. A draft or a submitted one does not.
  constraint annual_budget_approved_has_record
    check (status in ('draft','submitted')
           or (approved_on is not null and board_minute is not null and btrim(board_minute) <> ''))
);
comment on table public.annual_budgets is
  'One budget per financial year. Planned income and expenditure sit in budget_lines; the actuals are read from donations, grants and claims.';

-- ------------------------------------------------------------
-- 3. The lines: planned income and expenditure
-- ------------------------------------------------------------
create table if not exists public.budget_lines (
  id           uuid primary key default gen_random_uuid(),
  budget_id    uuid not null references public.annual_budgets(id) on delete cascade,
  kind         text not null check (kind in ('income','expenditure')),
  category     text not null
                 check (category in ('donations','grants','events','other_income',
                                     'programmes','safeguarding','training','stipends',
                                     'admin','travel','equipment','other_expenditure')),
  label        text not null check (btrim(label) <> '' and char_length(label) <= 160),
  planned_kobo bigint not null check (planned_kobo >= 0 and planned_kobo <= 1000000000000),
  -- A line may belong to a chapter, or be organisation-wide (null).
  chapter_id   uuid references public.chapters(id) on delete set null,
  note         text check (note is null or char_length(note) <= 500),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists budget_lines_budget_idx  on public.budget_lines (budget_id, kind);
create index if not exists budget_lines_chapter_idx on public.budget_lines (chapter_id);

-- ------------------------------------------------------------
-- 4. Budget history joins the finance ledger
-- ------------------------------------------------------------
alter table public.finance_events add column if not exists budget_id uuid;
create index if not exists finance_events_budget_idx on public.finance_events (budget_id, at);

alter table public.finance_events drop constraint if exists finance_events_kind_check;
alter table public.finance_events add constraint finance_events_kind_check
  check (kind in ('claim_submitted','claim_returned','claim_approved',
                  'claim_rejected','claim_paid','claim_withdrawn',
                  'budget_set','budget_revised',
                  'grant_created','grant_status','grant_edited',
                  'obligation_added','obligation_settled','obligation_waived',
                  'programme_funded','programme_unfunded',
                  'donation_recorded','donation_corrected','donation_acknowledged','donation_voided',
                  'annual_created','annual_submitted','annual_approved','annual_status','annual_line'));

create or replace function public.annual_log(p_kind text, p_budget uuid, p_amount bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_name text;
begin
  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.finance_events (actor_id, actor_name, kind, budget_id, amount_kobo, note)
  values (v_actor, coalesce(v_name, case when v_actor is null then 'System' else 'Unknown account' end),
          p_kind, p_budget, p_amount, left(p_note, 500));
end;
$$;
revoke all on function public.annual_log(text, uuid, bigint, text) from public, anon, authenticated;

-- May this person see this budget's chapter-scoped detail? A national
-- reader, or the Regional Coordinator of a chapter the budget has a line for.
create or replace function public.budget_can_see(p_budget uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.budget_can_read()
      or exists (select 1 from public.budget_lines l
                  where l.budget_id = p_budget
                    and public.dir_role() = 'RC'
                    and l.chapter_id = public.dir_chapter())
$$;
grant execute on function public.budget_can_see(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Reading: row security
-- ------------------------------------------------------------
alter table public.annual_budgets enable row level security;
alter table public.budget_lines   enable row level security;
drop policy if exists annual_budgets_read on public.annual_budgets;
drop policy if exists budget_lines_read   on public.budget_lines;

create policy annual_budgets_read on public.annual_budgets
  for select to authenticated using (public.budget_can_see(id));

-- A national reader sees every line. A Regional Coordinator sees only the
-- expenditure lines for their own chapter, so a chapter knows its
-- allocation without seeing the whole national plan.
create policy budget_lines_read on public.budget_lines
  for select to authenticated using (
    public.budget_can_read()
    or ( public.dir_role() = 'RC' and kind = 'expenditure' and chapter_id = public.dir_chapter() )
  );

revoke all on public.annual_budgets, public.budget_lines from anon, authenticated;
grant select on public.annual_budgets, public.budget_lines to authenticated;

drop policy if exists finance_events_read on public.finance_events;
create policy finance_events_read on public.finance_events
  for select to authenticated using (
    public.finance_can_read_all()
    or (claim_id is not null and public.finance_can_see_claim(claim_id))
    or (grant_id is not null and public.grant_can_see(grant_id))
    or (donation_id is not null and public.donations_can_read())
    or (budget_id is not null and public.budget_can_read())
  );

-- ------------------------------------------------------------
-- 6. Writing: the budget functions
-- ------------------------------------------------------------
-- Start a budget for a year. Returns its id. One per year.
create or replace function public.create_annual_budget(p_year int, p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.budget_can_prepare() then raise exception 'You cannot prepare a budget.'; end if;
  if p_year is null or p_year < 2020 or p_year > 2100 then raise exception 'Give a valid financial year.'; end if;
  if exists (select 1 from public.annual_budgets where financial_year = p_year) then
    raise exception 'A budget for % already exists.', p_year;
  end if;
  insert into public.annual_budgets (financial_year, title, prepared_by)
  values (p_year, nullif(btrim(coalesce(p_title,'')),''), auth.uid())
  returning id into v_id;
  perform public.annual_log('annual_created', v_id, null, p_year::text);
  return v_id;
end;
$$;

-- Add or change a line. p_line null adds one. Only while the budget is a
-- draft or has been sent back to draft; an approved budget is fixed.
create or replace function public.save_budget_line(
  p_line uuid, p_budget uuid, p_kind text, p_category text, p_label text,
  p_planned_kobo bigint, p_chapter uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_status text; v_id uuid; v_bud uuid;
begin
  if not public.budget_can_prepare() then raise exception 'You cannot write budget lines.'; end if;
  if p_line is null then
    select status into v_status from public.annual_budgets where id = p_budget;
    if v_status is null then raise exception 'No such budget.'; end if;
    v_bud := p_budget;
  else
    select l.budget_id, b.status into v_bud, v_status from public.budget_lines l join public.annual_budgets b on b.id = l.budget_id where l.id = p_line;
    if v_bud is null then raise exception 'No such line.'; end if;
  end if;
  if v_status <> 'draft' then raise exception 'Lines can be changed only while the budget is a draft.'; end if;
  if p_kind not in ('income','expenditure') then raise exception 'A line is income or expenditure.'; end if;
  if p_category not in ('donations','grants','events','other_income','programmes','safeguarding','training','stipends','admin','travel','equipment','other_expenditure') then
    raise exception 'Unknown category.';
  end if;
  if p_label is null or btrim(p_label) = '' then raise exception 'Give the line a label.'; end if;
  if p_planned_kobo is null or p_planned_kobo < 0 then raise exception 'The planned amount cannot be negative.'; end if;
  if p_chapter is not null and not exists (select 1 from public.chapters where id = p_chapter) then raise exception 'No such chapter.'; end if;

  if p_line is null then
    insert into public.budget_lines (budget_id, kind, category, label, planned_kobo, chapter_id, note, created_by)
    values (v_bud, p_kind, p_category, btrim(p_label), p_planned_kobo, p_chapter, nullif(btrim(coalesce(p_note,'')),''), auth.uid())
    returning id into v_id;
    perform public.annual_log('annual_line', v_bud, p_planned_kobo, 'Added: ' || btrim(p_label));
    return v_id;
  end if;
  update public.budget_lines
     set kind = p_kind, category = p_category, label = btrim(p_label), planned_kobo = p_planned_kobo,
         chapter_id = p_chapter, note = nullif(btrim(coalesce(p_note,'')),''), updated_at = now()
   where id = p_line;
  perform public.annual_log('annual_line', v_bud, p_planned_kobo, 'Changed: ' || btrim(p_label));
  return p_line;
end;
$$;

-- Remove a line, only while the budget is a draft.
create or replace function public.remove_budget_line(p_line uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_bud uuid; v_label text;
begin
  if not public.budget_can_prepare() then raise exception 'You cannot write budget lines.'; end if;
  select l.budget_id, b.status, l.label into v_bud, v_status, v_label
    from public.budget_lines l join public.annual_budgets b on b.id = l.budget_id where l.id = p_line;
  if v_bud is null then raise exception 'No such line.'; end if;
  if v_status <> 'draft' then raise exception 'Lines can be removed only while the budget is a draft.'; end if;
  delete from public.budget_lines where id = p_line;
  perform public.annual_log('annual_line', v_bud, null, 'Removed: ' || v_label);
end;
$$;

-- Send a draft to the Board. It needs at least one line.
create or replace function public.submit_annual_budget(p_budget uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.budget_can_prepare() then raise exception 'You cannot submit a budget.'; end if;
  select status into v_status from public.annual_budgets where id = p_budget for update;
  if v_status is null then raise exception 'No such budget.'; end if;
  if v_status <> 'draft' then raise exception 'Only a draft can be submitted.'; end if;
  if not exists (select 1 from public.budget_lines where budget_id = p_budget) then
    raise exception 'A budget needs at least one line before it goes to the Board.';
  end if;
  update public.annual_budgets set status = 'submitted', submitted_at = now(), updated_at = now() where id = p_budget;
  perform public.annual_log('annual_submitted', p_budget, null, null);
end;
$$;

-- Record the Board's decision. 'approve' needs a minute reference and a
-- date; approval after the year has begun is flagged late. 'return' sends
-- it back to draft for changes.
create or replace function public.decide_annual_budget(p_budget uuid, p_decision text, p_minute text default null, p_on date default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_year int; v_minute text := nullif(btrim(coalesce(p_minute,'')),''); v_on date; v_late boolean;
begin
  if not public.budget_can_approve() then raise exception 'You cannot record the Board decision.'; end if;
  if p_decision not in ('approve','return') then raise exception 'Unknown decision.'; end if;
  select status, financial_year into v_status, v_year from public.annual_budgets where id = p_budget for update;
  if v_status is null then raise exception 'No such budget.'; end if;
  if v_status <> 'submitted' then raise exception 'Only a submitted budget can be decided.'; end if;
  if p_decision = 'return' then
    update public.annual_budgets set status = 'draft', submitted_at = null, updated_at = now() where id = p_budget;
    perform public.annual_log('annual_status', p_budget, null, 'Returned to draft');
    return;
  end if;
  if v_minute is null then raise exception 'Record the Board minute reference.'; end if;
  v_on := coalesce(p_on, (now() at time zone 'Africa/Lagos')::date);
  if v_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The approval date cannot be in the future.'; end if;
  -- The Board should approve before the year starts (YCDI-FIN). Approval
  -- on or after 1 January of the budget year is recorded as late.
  v_late := v_on >= make_date(v_year, 1, 1);
  update public.annual_budgets
     set status = 'board_approved', approved_by = auth.uid(), approved_on = v_on,
         board_minute = v_minute, approved_late = v_late, updated_at = now()
   where id = p_budget;
  perform public.annual_log('annual_approved', p_budget, null,
    'Minute ' || v_minute || case when v_late then ' (approved late)' else '' end);
end;
$$;

-- Move an approved budget to active (the year is running), or close it.
create or replace function public.set_annual_status(p_budget uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.budget_can_approve() then raise exception 'You cannot change the budget status.'; end if;
  if p_status not in ('active','closed') then raise exception 'A budget is set active or closed here.'; end if;
  select status into v_old from public.annual_budgets where id = p_budget for update;
  if v_old is null then raise exception 'No such budget.'; end if;
  if p_status = 'active' and v_old <> 'board_approved' then raise exception 'Only a board-approved budget can be made active.'; end if;
  if p_status = 'closed' and v_old not in ('active','board_approved') then raise exception 'Only an approved or active budget can be closed.'; end if;
  update public.annual_budgets set status = p_status, updated_at = now() where id = p_budget;
  perform public.annual_log('annual_status', p_budget, null, v_old || ' → ' || p_status);
end;
$$;

-- ------------------------------------------------------------
-- 7. Reading: the plan against the year
-- ------------------------------------------------------------
-- The budget for a year with its planned totals and the actuals to date.
-- Actual income: donations received in the year (Batch 34) plus grant
-- money awarded whose period covers the year (Batch 33, counted once).
-- Actual expenditure: claims approved and paid in the year (Batch 32).
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
    coalesce((select sum(c.amount_kobo) from public.expense_claims c
               where c.status in ('approved','paid')
                 and c.reviewed_at is not null
                 and extract(year from (c.reviewed_at at time zone 'Africa/Lagos'))=b.financial_year),0)::bigint
    from public.annual_budgets b
   where b.financial_year = p_year;
end;
$$;

-- A budget's lines against actuals, grouped by category, for the detail
-- view. A national reader sees all; a Regional Coordinator sees only their
-- own chapter's expenditure lines (the read policy already narrows this).
create or replace function public.budget_line_actuals(p_budget uuid)
returns table (
  line_id uuid, kind text, category text, label text, chapter_id uuid,
  chapter_name text, planned_kobo bigint
) language sql stable security definer set search_path = public as $$
  select l.id, l.kind, l.category, l.label, l.chapter_id, ch.name, l.planned_kobo
    from public.budget_lines l
    left join public.chapters ch on ch.id = l.chapter_id
   where l.budget_id = p_budget
     and ( public.budget_can_read()
           or ( public.dir_role() = 'RC' and l.kind = 'expenditure' and l.chapter_id = public.dir_chapter() ) )
   order by l.kind, l.category, l.label
$$;

-- ------------------------------------------------------------
-- 8. Who may call what
-- ------------------------------------------------------------
revoke all on function public.create_annual_budget(int, text)                                   from public, anon;
revoke all on function public.save_budget_line(uuid, uuid, text, text, text, bigint, uuid, text) from public, anon;
revoke all on function public.remove_budget_line(uuid)                                           from public, anon;
revoke all on function public.submit_annual_budget(uuid)                                         from public, anon;
revoke all on function public.decide_annual_budget(uuid, text, text, date)                       from public, anon;
revoke all on function public.set_annual_status(uuid, text)                                      from public, anon;
revoke all on function public.budget_vs_actual(int)                                              from public, anon;
revoke all on function public.budget_line_actuals(uuid)                                          from public, anon;

grant execute on function public.create_annual_budget(int, text)                                   to authenticated;
grant execute on function public.save_budget_line(uuid, uuid, text, text, text, bigint, uuid, text) to authenticated;
grant execute on function public.remove_budget_line(uuid)                                           to authenticated;
grant execute on function public.submit_annual_budget(uuid)                                         to authenticated;
grant execute on function public.decide_annual_budget(uuid, text, text, date)                       to authenticated;
grant execute on function public.set_annual_status(uuid, text)                                      to authenticated;
grant execute on function public.budget_vs_actual(int)                                              to authenticated;
grant execute on function public.budget_line_actuals(uuid)                                          to authenticated;
