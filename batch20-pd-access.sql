-- ============================================================
-- YCDI Programme Hub
-- Batch 20: access grant for the National Programmes Director seat (PD)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH20-MARKER pd-access
--
-- What this is
-- ------------
-- The second seat grant, same shape as Batch 19. Whoever holds the PD
-- seat (Batch 18) gets the national reach the Programmes Director's duty
-- needs for monitoring and evaluation, and nothing wider. Every change is
-- additive: it adds "or public.holds_portfolio('PD')" to a filter that
-- already lets the National Coordinator, an admin or a chapter RC through.
-- No existing access is removed, and a person holding no seat is
-- unaffected.
--
-- What PD gets
--   - the participant dataset across every chapter, read only: the M&E
--     source data. Widening can_read_participant() cascades to every
--     participant table (consents, stages, attendance, mentors), because
--     they all gate through it.
--   - the Participants section itself opens (can_see_participants).
--   - the KPI and M&E report, nationally (kpi_sees_all).
--
-- What PD does NOT get, on purpose
--   - programme approval. approve_program and return_program stay
--     admin-only. PD designs and delivers programmes and reports on them,
--     so letting the same seat approve them would be signing off its own
--     work. This is the separation the governance amendment points at when
--     it says the Board must see raw programme data, not the Director's
--     summary. If you decide PD should approve, that is a separate,
--     deliberate change, and the amendment should be updated to match.
--   - writing participant or attendance data. The amendment's point is
--     that chapters capture at source; PD reads what they capture.
--     can_touch_participant() is deliberately untouched.
--   - setting KPI targets. That stays with the National Coordinator.
--
-- Programme reading needed no grant: prog_read is already national for
-- every signed-in account, so PD sees every chapter's programmes already.
--
-- Curriculum ownership (Rooted and Rising) is content, not a database
-- permission, so there is nothing to grant for it here.
--
-- Additive throughout. It redefines three boolean gate functions, each
-- carrying its original logic plus the one PD clause. It creates no table
-- and touches no write path.
-- ============================================================

-- ---- 1. the participant dataset, national read (M&E source) -----------
-- Every participant table reads through can_read_participant(chapter).
-- One clause here reaches all of them, read only.
create or replace function public.can_read_participant(p_chapter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.dir_role() = 'NC'
      or public.holds_portfolio('PD')
      or (public.dir_role() = 'RC' and p_chapter = public.dir_chapter())
$$;
grant execute on function public.can_read_participant(uuid) to authenticated;

-- ---- 2. open the Participants section for PD --------------------------
create or replace function public.can_see_participants()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.dir_role() in ('NC','RC')
      or public.holds_portfolio('PD')
$$;
grant execute on function public.can_see_participants() to authenticated;

-- ---- 3. the KPI and M&E report, national -----------------------------
create or replace function public.kpi_sees_all()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dir_role() = 'NC', false)
      or coalesce(public.is_admin(), false)
      or public.holds_portfolio('PD')
$$;

-- Note on the write side, left alone on purpose:
--   can_touch_participant()   participant and attendance writes  -> chapters
--   approve_program / return_program                             -> admin
--   kpi target setting                                           -> NC
-- Each stays as it was. This batch only widens reads.

-- ============================================================
-- End of Batch 20.
-- ============================================================
