-- ============================================================
-- Batch 40: concept note rolled back to the pre-Batch-37 form.
--
-- The app goes back to the three-step concept note (Program details,
-- People and safeguarding, Review and submit). Batch 38's Team Member
-- to Regional Coordinator review chain stays exactly as it is.
--
-- What this does:
--   1. Removes the Batch 37 submission gate (the trigger that blocks a
--      new or resubmitted concept note unless the Needs Identification
--      answers, the five priority ratings and the delivery format
--      checks are in place). Without this, the old three-step form
--      would be rejected at submission, because it never sends those
--      fields.
--   2. Puts approve_program and return_program back to their original
--      one-purpose versions. The Batch 37 approve_program refuses to
--      approve a Level 4 or Level 5 programme unless Treasurer
--      concurrence or a Board minute reference is supplied, and the old
--      screen has nowhere to enter either.
--
-- What this deliberately leaves alone:
--   - Every column Batch 37 added to public.programs, and all the data
--     in them. They are nullable, nothing reads them after this, and
--     dropping them would destroy the answers on any concept note that
--     was already submitted through the five-step form. Those notes
--     keep their data; the old screens simply do not show it.
--   - The approval_level column and its trigger. It is computed from
--     the budget and feeds nothing else, so it is harmless to leave.
--   - Everything from Batch 38 (RC Review, RC Returned, Declined,
--     rc_comment, the TM insert rights, set_initial_program_status,
--     the Batch 38 guard_program_status) and everything from Batch 39.
--   - The finance module. finance_snapshot_budget still fires off
--     programs.budget and programs.status exactly as before.
--
-- Run this in the Supabase SQL editor BEFORE deploying the app build.
-- Safe to run more than once.
--
-- To go forward to the five-step form again later, re-deploy
-- batch37-concept-note-v2.sql (it is written to be re-run) together
-- with the Batch 37 app files.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Remove the Batch 37 concept-note gate
-- ------------------------------------------------------------
drop trigger if exists trg_guard_concept_note_gate on public.programs;
drop function if exists public.guard_concept_note_gate();

-- ------------------------------------------------------------
-- 2. Restore the original approve_program / return_program
-- ------------------------------------------------------------
drop function if exists public.approve_program(uuid, boolean, text, text, date);

create or replace function public.approve_program(program_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve programs.';
  end if;
  update public.programs set status = 'Approved', nc_comment = '' where id = program_id;
end;
$$;

create or replace function public.return_program(program_id uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can return programs.';
  end if;
  update public.programs set status = 'Returned', nc_comment = note where id = program_id;
end;
$$;

grant execute on function public.approve_program(uuid) to authenticated;
grant execute on function public.return_program(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3. Check afterwards (read-only). Both lines should say what is
--    written beside them.
-- ------------------------------------------------------------
-- select count(*) as gate_triggers_left   -- expect 0
--   from pg_trigger where tgname = 'trg_guard_concept_note_gate';
-- select pg_get_function_arguments(oid)   -- expect: program_id uuid
--   from pg_proc where proname = 'approve_program' and pronamespace = 'public'::regnamespace;

-- ============================================================
-- End of Batch 40.
-- ============================================================
