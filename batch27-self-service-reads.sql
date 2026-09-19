-- ============================================================
-- YCDI Programme Hub
-- Batch 27: narrow reads for the participant and guardian welcome screens
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH27-MARKER self-service-reads
--
-- Why this exists
-- ----------------
-- Neither Batch 25 nor Batch 26 gave a participant or guardian account
-- any way to read their own participants row, or a mentor's name.
-- pt_read (Batch 2/13) has no clause for either account type, and this
-- repo's profiles table has no SELECT policy defined anywhere in the
-- tracked migrations, its access rules predate these numbered batches
-- and aren't visible from here. Rather than guess at that and add a
-- table-level policy that would combine with whatever is already
-- there, this batch gives each account type its own narrow,
-- security-definer function: exactly the fields the welcome screen
-- needs, nothing else, regardless of what profiles' own policy turns
-- out to be. This keeps the "narrow account, sees one thing" promise
-- structurally true rather than dependent on a table's history nobody
-- currently holding this file can see.
--
-- Additive throughout. New functions only. Nothing existing is altered.
-- ============================================================

create or replace function public.participant_self_summary()
returns table (full_name text, age_band text, chapter_name text)
language sql stable security definer set search_path = public as $$
  select p.full_name, p.age_band, c.name
  from public.participants p
  left join public.chapters c on c.id = p.chapter_id
  where p.id = public.my_participant_id()
$$;

grant execute on function public.participant_self_summary() to authenticated;

create or replace function public.participant_mentor_name()
returns text language sql stable security definer set search_path = public as $$
  select prof.full_name
  from public.participant_mentors m
  join public.profiles prof on prof.id = m.mentor_id
  where m.participant_id = public.my_participant_id()
    and m.ended_on is null
  limit 1
$$;

grant execute on function public.participant_mentor_name() to authenticated;

create or replace function public.guardian_child_summary()
returns table (full_name text, age_band text, stage text, chapter_name text)
language sql stable security definer set search_path = public as $$
  select p.full_name, p.age_band, p.stage, c.name
  from public.participants p
  left join public.chapters c on c.id = p.chapter_id
  where p.id = public.my_guardian_participant_id()
$$;

grant execute on function public.guardian_child_summary() to authenticated;
