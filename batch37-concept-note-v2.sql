-- ============================================================
-- Batch 37 — Concept Note aligned to the Programme Operations
-- Manual v2.0 (Needs Identification, Strategic Alignment, delivery
-- format, M&E indicators, digital safeguarding, and the Level
-- 3/4/5 approval thresholds from the Financial Policy Manual).
--
-- Additive only. Every new column is nullable so every concept note
-- already in the database (Approved, Live, Complete, or sitting
-- Pending or Returned) stays exactly as it is; the app shows those
-- older notes with the new fields blank rather than breaking them.
--
-- What this batch does NOT do, deliberately:
--   - It does not touch the finance module. finance_snapshot_budget
--     still fires off programs.budget and programs.status exactly as
--     Batch 32 left it; approval_level is a display/approval-gate
--     concern only, and never feeds a finance calculation.
--   - It does not wire the Board Treasurer's TREAS seat to this.
--     Godfrey chose the simpler route: the National Coordinator ticks
--     "Treasurer concurrence received" themselves when approving a
--     Level 4 note, rather than the Treasurer countersigning in the
--     app. If that changes later, that is a separate, deliberate
--     batch, same as the note left in batch20 about PD/approval.
--   - It does not gate every edit to a programme. The Needs
--     Identification / Strategic Alignment / delivery-format checks
--     only run on a genuine (re)submission: a brand new concept note,
--     or a Returned note being resubmitted into Pending. An admin
--     correcting a field on an already-approved programme, or the
--     ordinary Approve/Return/Complete transitions, are untouched.
--     An admin is exempt from the gate entirely, same pattern as
--     guard_program_status in Batch 0b, so NC/PD data fixes and the
--     test seed keep working without having to backfill every field.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New columns on public.programs
-- ------------------------------------------------------------
alter table public.programs
  add column if not exists age_range               text,
  add column if not exists geographic_scope         text,
  add column if not exists delivery_format          text not null default 'Physical',
  add column if not exists format_reasoning         text,
  add column if not exists needs_evidence           text,
  add column if not exists needs_gap                text,
  add column if not exists needs_beneficiary_voice  text,
  add column if not exists needs_alternative        text,
  add column if not exists align_reach              text,
  add column if not exists align_roots              text,
  add column if not exists align_resources          text,
  add column if not exists align_raise              text,
  add column if not exists align_reputation         text,
  add column if not exists me_indicators            text,
  add column if not exists activities_schedule      text,
  add column if not exists cost_lines               text,
  add column if not exists permission_requirements  text,
  add column if not exists digital_safeguarding     text,
  add column if not exists approval_level           int,
  add column if not exists treasurer_concurrence    boolean not null default false,
  add column if not exists treasurer_name           text,
  add column if not exists treasurer_concurrence_date date,
  add column if not exists board_minute_ref         text,
  add column if not exists board_approval_date      date;

alter table public.programs drop constraint if exists programs_geographic_scope_check;
alter table public.programs add constraint programs_geographic_scope_check
  check (geographic_scope is null or geographic_scope in ('Chapter','Regional','National'));

alter table public.programs drop constraint if exists programs_delivery_format_check;
alter table public.programs add constraint programs_delivery_format_check
  check (delivery_format in ('Physical','Virtual','Hybrid'));

alter table public.programs drop constraint if exists programs_align_reach_check;
alter table public.programs add constraint programs_align_reach_check
  check (align_reach is null or align_reach in ('Strong','Partial','None'));
alter table public.programs drop constraint if exists programs_align_roots_check;
alter table public.programs add constraint programs_align_roots_check
  check (align_roots is null or align_roots in ('Strong','Partial','None'));
alter table public.programs drop constraint if exists programs_align_resources_check;
alter table public.programs add constraint programs_align_resources_check
  check (align_resources is null or align_resources in ('Strong','Partial','None'));
alter table public.programs drop constraint if exists programs_align_raise_check;
alter table public.programs add constraint programs_align_raise_check
  check (align_raise is null or align_raise in ('Strong','Partial','None'));
alter table public.programs drop constraint if exists programs_align_reputation_check;
alter table public.programs add constraint programs_align_reputation_check
  check (align_reputation is null or align_reputation in ('Strong','Partial','None'));

-- ------------------------------------------------------------
-- 2. Approval level, from the budget, per section 1.15
--    Level 3: NC alone, up to N500,000
--    Level 4: NC + Board Treasurer concurrence, N500,001-N2,000,000
--    Level 5: Board approval (date + minute reference), above N2,000,000
-- ------------------------------------------------------------
create or replace function public.program_approval_level(p_budget numeric)
returns int language sql immutable as $$
  select case
    when p_budget is null or p_budget <= 500000 then 3
    when p_budget <= 2000000 then 4
    else 5
  end
$$;

grant execute on function public.program_approval_level(numeric) to authenticated;

create or replace function public.set_program_approval_level()
returns trigger language plpgsql as $$
begin
  new.approval_level := public.program_approval_level(new.budget);
  return new;
end;
$$;

drop trigger if exists trg_set_program_approval_level on public.programs;
create trigger trg_set_program_approval_level
  before insert or update of budget on public.programs
  for each row execute function public.set_program_approval_level();

-- Backfill the level for every programme already in the table.
update public.programs set approval_level = public.program_approval_level(budget);

-- ------------------------------------------------------------
-- 3. The concept-note gate (section 1.5, 1.6, 1.14)
--    Fires on a genuine (re)submission only: a brand new note, or a
--    Returned note being resubmitted into Pending. Admins are exempt,
--    matching guard_program_status.
-- ------------------------------------------------------------
create or replace function public.guard_concept_note_gate()
returns trigger language plpgsql as $$
declare
  v_none_count int;
begin
  if public.is_admin() then
    return new;
  end if;

  if TG_OP = 'UPDATE' and not (new.status = 'Pending' and old.status is distinct from 'Pending') then
    return new;
  end if;

  if coalesce(btrim(new.needs_evidence), '') = ''
     or coalesce(btrim(new.needs_gap), '') = ''
     or coalesce(btrim(new.needs_beneficiary_voice), '') = ''
     or coalesce(btrim(new.needs_alternative), '') = ''
  then
    raise exception 'The Needs Identification Checklist must be answered in full before a concept note can be submitted.';
  end if;

  if new.align_reach is null or new.align_roots is null or new.align_resources is null
     or new.align_raise is null or new.align_reputation is null
  then
    raise exception 'The Strategic Priority alignment rating (REACH, ROOTS, RESOURCES, RAISE, REPUTATION) must be completed before a concept note can be submitted.';
  end if;

  v_none_count :=
      (new.align_reach = 'None')::int + (new.align_roots = 'None')::int
    + (new.align_resources = 'None')::int + (new.align_raise = 'None')::int
    + (new.align_reputation = 'None')::int;
  if v_none_count >= 3 then
    raise exception 'This concept note rates None on % of the five strategic priorities. Per section 1.6 it should be strengthened before submission.', v_none_count;
  end if;

  if new.delivery_format is null then
    raise exception 'Delivery format (Physical, Virtual or Hybrid) is required.';
  end if;

  if new.delivery_format <> 'Physical' and coalesce(btrim(new.digital_safeguarding), '') = '' then
    raise exception 'A digital safeguarding plan is required for a virtual or hybrid programme.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_concept_note_gate on public.programs;
create trigger trg_guard_concept_note_gate
  before insert or update of status on public.programs
  for each row execute function public.guard_concept_note_gate();

-- ------------------------------------------------------------
-- 4. approve_program / return_program, carrying the Level 4/5
--    sign-off. The old single-argument approve_program is replaced;
--    everywhere it's called with just the id, the new defaults cover it.
-- ------------------------------------------------------------
drop function if exists public.approve_program(uuid);

create or replace function public.approve_program(
  program_id uuid,
  p_treasurer_concurrence boolean default null,
  p_treasurer_name text default null,
  p_board_minute_ref text default null,
  p_board_approval_date date default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.programs;
  v_level int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve programs.';
  end if;

  select * into v_row from public.programs where id = program_id;
  if v_row is null then
    raise exception 'Programme not found.';
  end if;

  v_level := public.program_approval_level(v_row.budget);

  if v_level = 4 and coalesce(p_treasurer_concurrence, v_row.treasurer_concurrence, false) is not true then
    raise exception 'This is a Level 4 programme (N500,001-N2,000,000). Confirm Board Treasurer concurrence before approving.';
  end if;

  if v_level = 5 and (
       coalesce(p_board_minute_ref, v_row.board_minute_ref) is null
    or coalesce(p_board_approval_date, v_row.board_approval_date) is null
  ) then
    raise exception 'This is a Level 5 programme (above N2,000,000, or a new programme line, chapter launch, or digital platform commitment). Record the Board approval date and minute reference before approving.';
  end if;

  update public.programs set
    status = 'Approved',
    nc_comment = '',
    treasurer_concurrence = coalesce(p_treasurer_concurrence, v_row.treasurer_concurrence, false),
    treasurer_name = coalesce(p_treasurer_name, v_row.treasurer_name),
    treasurer_concurrence_date = case
      when coalesce(p_treasurer_concurrence, v_row.treasurer_concurrence, false)
        then coalesce(v_row.treasurer_concurrence_date, (now() at time zone 'Africa/Lagos')::date)
      else v_row.treasurer_concurrence_date
    end,
    board_minute_ref = coalesce(p_board_minute_ref, v_row.board_minute_ref),
    board_approval_date = coalesce(p_board_approval_date, v_row.board_approval_date)
  where id = program_id;
end;
$$;

grant execute on function public.approve_program(uuid, boolean, text, text, date) to authenticated;

-- A returned note has its sign-off cleared: the RC may change the
-- budget on resubmission, which can move it to a different level, so a
-- stale tick or a stale Board reference must not carry forward.
create or replace function public.return_program(program_id uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can return programs.';
  end if;
  update public.programs set
    status = 'Returned',
    nc_comment = note,
    treasurer_concurrence = false,
    treasurer_name = null,
    treasurer_concurrence_date = null,
    board_minute_ref = null,
    board_approval_date = null
  where id = program_id;
end;
$$;

grant execute on function public.return_program(uuid, text) to authenticated;

-- ============================================================
-- End of Batch 37.
-- ============================================================
