-- ============================================================
-- YCDI Programme Hub
-- Batch 24: participant touchpoints and the quiet-participant nudge
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH24-MARKER participant-touchpoints
--
-- What this is
-- ------------
-- Two small additions to Participants & Discipleship, built to close the
-- gap between a school visit and the next one:
--
--   1. participant_touchpoints. A log of what a mentor shared or
--      discussed with a participant: a compendium unit sent, a
--      conversation, a visit. This is the engagement trail that the
--      old "assign content, log it" idea from the wider brainstorm
--      actually needed, minus everything that idea assumed about a
--      teen-facing app.
--
--   2. quiet_participants(). The participant-level twin of Batch 17's
--      quiet_chapters(): it surfaces active participants nobody has
--      logged activity against in a while, so a contact from a school
--      visit doesn't just go cold unnoticed. A daily job pushes a
--      summary to each mentor through the existing notification bell
--      (notify_person, same as nudge_member in Batch 17).
--
-- What this deliberately does not do
-- -----------------------------------
-- It does not add a channel to a participant. It does not store a
-- participant's phone or email (Batch 2 already refuses that for any
-- minor age band, per YCDI-LEG). It does not let a participant log
-- in. Every row here is staff activity about a participant, recorded
-- by a mentor, never a message the participant receives directly.
-- Anything that reaches a minor still goes through a parent, a
-- guardian, or a school channel, offline, exactly as it does today.
--
-- Who may use it
--   A mentor reads and writes touchpoints for participants they own
--   (owns_participant, Batch 13). An RC/NC reads touchpoints across
--   their scope, same as they already read participants
--   (can_read_participant, Batch 2). quiet_participants() returns
--   only what the caller is already allowed to see.
--
-- Additive throughout. One new table, one new function, one new
-- scheduled job. It alters nothing that already exists.
-- ============================================================

-- ------------------------------------------------------------
-- 1. participant_touchpoints
-- ------------------------------------------------------------
create table if not exists public.participant_touchpoints (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  mentor_id      uuid not null references public.profiles(id) on delete cascade,
  kind           text not null default 'content'
                   check (kind in ('content','conversation','visit')),

  -- Free-text reference to a compendium unit, e.g. 'IE-03'. Not a
  -- foreign key: the compendium lives outside this database today,
  -- so this stays a plain code rather than an invented relation.
  unit_ref       text,

  note           text,
  occurred_on    date not null default current_date,
  created_at     timestamptz not null default now()
);

create index if not exists participant_touchpoints_participant_idx
  on public.participant_touchpoints(participant_id, occurred_on desc);

create index if not exists participant_touchpoints_mentor_idx
  on public.participant_touchpoints(mentor_id, occurred_on desc);

alter table public.participant_touchpoints enable row level security;

drop policy if exists pth_read  on public.participant_touchpoints;
drop policy if exists pth_write on public.participant_touchpoints;

create policy pth_read on public.participant_touchpoints
  for select to authenticated
  using (
    public.owns_participant(participant_id)
    or exists (
      select 1 from public.participants p
      where p.id = participant_id
        and public.can_read_participant(p.chapter_id)
    )
  );

-- A mentor logs a touchpoint only against a participant they own, and
-- only under their own name, same shape as the pt_write check in
-- Batch 13 for filing a new participant.
create policy pth_write on public.participant_touchpoints
  for insert to authenticated
  with check (
    mentor_id = auth.uid()
    and public.owns_participant(participant_id)
  );

revoke delete on public.participant_touchpoints from authenticated;
grant select, insert on public.participant_touchpoints to authenticated;

-- ------------------------------------------------------------
-- 2. Last-activity per participant
-- ------------------------------------------------------------
-- The most recent of: a stage move, an attendance, or a touchpoint.
-- Logging any one of these is what resets a participant's "quiet"
-- clock; nothing here is a new activity type, this just reads the
-- three that already exist (two of them predate this batch).
create or replace function public.participant_last_activity(p_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce((select max(moved_on)::timestamptz
              from public.participant_stages where participant_id = p_id), 'epoch'),
    coalesce((select max(attended_on)::timestamptz
              from public.participant_attendance where participant_id = p_id), 'epoch'),
    coalesce((select max(occurred_on)::timestamptz
              from public.participant_touchpoints where participant_id = p_id), 'epoch')
  )
$$;

grant execute on function public.participant_last_activity(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. quiet_participants()
-- ------------------------------------------------------------
-- The participant-level twin of quiet_chapters() (Batch 17). Scoped
-- to what the caller can already see: their own participants if a
-- mentor, their chapter's or all of them for RC/NC/admin, exactly
-- the same reach can_read_participant already grants elsewhere.
--
-- p_days: how long since the last activity counts as quiet. Default
-- 21 (three weeks), a working assumption, not a policy figure, easy
-- to change per call or make a chapter setting later.
create or replace function public.quiet_participants(p_days integer default 21)
returns table (
  participant_id   uuid,
  full_name        text,
  chapter_id       uuid,
  mentor_id        uuid,
  mentor_name      text,
  last_activity    timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.chapter_id,
    m.mentor_id, prof.full_name,
    public.participant_last_activity(p.id)
  from public.participants p
  left join public.participant_mentors m
    on m.participant_id = p.id and m.ended_on is null
  left join public.profiles prof
    on prof.id = m.mentor_id
  where p.active
    and (public.owns_participant(p.id) or public.can_read_participant(p.chapter_id))
    and public.participant_last_activity(p.id) < now() - make_interval(days => p_days)
$$;

grant execute on function public.quiet_participants(integer) to authenticated;

-- ------------------------------------------------------------
-- 4. Daily nudge to each mentor
-- ------------------------------------------------------------
-- One notification per mentor per day, summarising how many of
-- their participants have gone quiet, through the same bell
-- nudge_member already uses (Batch 17). Security definer so it can
-- see across chapters to fan the notifications out; each mentor
-- still only ever sees their own notification.
create or replace function public.notify_quiet_participants()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select m.mentor_id, count(*) as n
    from public.participants p
    join public.participant_mentors m
      on m.participant_id = p.id and m.ended_on is null
    where p.active
      and public.participant_last_activity(p.id) < now() - interval '21 days'
    group by m.mentor_id
  loop
    perform public.notify_person(
      r.mentor_id, 'quiet_participants', 'Contacts going quiet',
      r.n || ' of your participants have had no logged contact in three weeks.',
      'participants', null, null);
  end loop;
end $$;

-- Runs at 06:00 UTC (07:00 Lagos), right after the existing daily
-- digest. If pg_cron is not enabled on the project this block does
-- nothing and the rest of the file still works.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ycdi-quiet-participants')
      where exists (select 1 from cron.job where jobname = 'ycdi-quiet-participants');
    perform cron.schedule('ycdi-quiet-participants', '5 6 * * *',
      'select public.notify_quiet_participants();');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
