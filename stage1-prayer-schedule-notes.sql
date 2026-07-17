-- ============================================================
-- YCDI Programme Hub - Stage 1 addition
-- Paste this into Supabase > SQL Editor and click Run.
--
-- This adds ONE new table: prayer_schedule_notes. It holds the
-- editable "first Saturday of every month" style notes that now
-- sit next to each meeting on the Prayer Calendar tab.
--
-- Safe to run more than once. It only ever moves things toward
-- the final state and never duplicates data.
-- ============================================================

create table if not exists public.prayer_schedule_notes (
  meeting_key text primary key,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.prayer_schedule_notes enable row level security;

drop policy if exists prayer_notes_read   on public.prayer_schedule_notes;
drop policy if exists prayer_notes_insert on public.prayer_schedule_notes;
drop policy if exists prayer_notes_update on public.prayer_schedule_notes;

-- Everyone signed in can see the schedule notes.
create policy prayer_notes_read on public.prayer_schedule_notes
  for select to authenticated using (true);

-- Only the National Coordinator can add or change a schedule note.
-- Uses the same dir_role() helper the Directory feature already set up.
create policy prayer_notes_insert on public.prayer_schedule_notes
  for insert to authenticated with check (public.dir_role() = 'NC');

create policy prayer_notes_update on public.prayer_schedule_notes
  for update to authenticated using (public.dir_role() = 'NC') with check (public.dir_role() = 'NC');

-- Done.
