-- ============================================================
-- Batch 38 — a Team Member can submit a concept note; it goes to
-- their chapter's Regional Coordinator first, not straight to the
-- National Coordinator.
--
-- The RC gets three moves on a note sitting in "RC Review":
--   - Decline (a reason is required; the note is dead — the team
--     member starts a fresh concept note, this one never comes back)
--   - Return with a comment (goes back to the team member to revise
--     and resubmit; comes back to "RC Review", not to the RC's inbox
--     for the NC)
--   - Revise and forward to the NC (the RC may edit the note
--     themselves, then it becomes a normal "Pending" note and goes
--     through the existing Batch 37 gate and approval-level rules
--     exactly as an RC's own submission always has)
--
-- This assumes every chapter that has team members submitting concept
-- notes also has an RC appointed. A chapter with no RC yet is not
-- handled specially here — its team members should hold off (or an
-- admin should submit for them) until an RC is in place. If that
-- turns out to matter in practice, it's a small, separate follow-up:
-- Batch 16 already has a chapter_has_rc() helper built for exactly
-- this kind of no-RC fallback on the reports side.
--
-- What this does NOT change: an RC's own submission still goes
-- straight to Pending, exactly as before. The Level 3/4/5 approval
-- gate, the concept-note completeness gate, and the NC's Approve /
-- Return with Comment screen are all untouched — this batch only adds
-- the step in front of them for a team member's note.
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. One new column. "rc_comment" carries either the RC's decline
--    reason or their return-with-comment note — never both at once,
--    since a note can only be declined or returned, not both — the
--    same way nc_comment already carries the NC's one comment.
-- ------------------------------------------------------------
alter table public.programs
  add column if not exists rc_comment text;

-- Note: no CHECK constraint exists on programs.status, so the three
-- new values below ('RC Review', 'RC Returned', 'Declined') need no
-- ALTER CONSTRAINT step.

-- ------------------------------------------------------------
-- 2. Widen who can submit. A Team Member can now insert a concept
--    note for their own chapter, same as an RC always could. Updating
--    is widened only for the team member's own submitted note, so a
--    team member still cannot touch anyone else's.
-- ------------------------------------------------------------
drop policy if exists prog_insert on public.programs;
create policy prog_insert on public.programs
  for insert to authenticated with check (
    public.is_admin()
    or (public.dir_role() in ('RC', 'TM') and chapter_id = public.dir_chapter())
  );

drop policy if exists prog_update on public.programs;
create policy prog_update on public.programs
  for update to authenticated using (
    public.is_admin()
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
    or (public.dir_role() = 'TM' and chapter_id = public.dir_chapter() and submitted_by = auth.uid())
  ) with check (
    public.is_admin()
    or (public.dir_role() = 'RC' and chapter_id = public.dir_chapter())
    or (public.dir_role() = 'TM' and chapter_id = public.dir_chapter() and submitted_by = auth.uid())
  );

-- ------------------------------------------------------------
-- 3. Where a new note lands is decided here, server-side, from the
--    submitter's real role — never trusted from the client, since
--    the RLS check above only confirms the chapter, not the status
--    the app happened to send.
-- ------------------------------------------------------------
create or replace function public.set_initial_program_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if public.dir_role() = 'TM' then
    new.status := 'RC Review';
  else
    -- An RC's own submission, exactly as before this batch.
    new.status := 'Pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_initial_program_status on public.programs;
create trigger trg_set_initial_program_status
  before insert on public.programs
  for each row execute function public.set_initial_program_status();

-- ------------------------------------------------------------
-- 4. The transition rules. A team member may only resubmit a note
--    an RC sent back, and only that. An RC may decline or return a
--    note sitting in RC Review (a reason is required either way), or
--    edit it and forward it on to Pending for the NC. Everything an
--    admin or an NC could already do is unchanged.
-- ------------------------------------------------------------
create or replace function public.guard_program_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  v_role := public.dir_role();

  -- The team member who submitted this note: the only door open to
  -- them is revising and resubmitting a note their RC sent back.
  if v_role = 'TM' and old.submitted_by = auth.uid() then
    if old.status <> 'RC Returned' then
      raise exception 'This concept note is not open for changes right now.';
    end if;
    if new.status is distinct from old.status and new.status <> 'RC Review' then
      raise exception 'A team member may only resubmit a returned concept note back for review.';
    end if;
    if new.rc_comment is distinct from old.rc_comment then
      raise exception 'Only a Regional Coordinator can set the review comment.';
    end if;
    if new.nc_comment is distinct from old.nc_comment then
      raise exception 'Only an admin can leave a review comment.';
    end if;
    return new;
  end if;

  -- From here on, RLS already guarantees the caller is either this
  -- chapter's RC or has no write access at all, so this covers the
  -- RC's own submissions, the RC acting on a team member's note, and
  -- the RC's existing resubmit-to-NC and mark-Complete moves.
  if new.status is distinct from old.status then
    if old.status = 'RC Review' and new.status in ('Declined', 'RC Returned') then
      if coalesce(btrim(new.rc_comment), '') = '' then
        raise exception 'A reason is required to % a concept note.',
          case when new.status = 'Declined' then 'decline' else 'return' end;
      end if;
    elsif new.status = 'Pending'
       or (new.status = 'Complete' and old.status in ('Approved', 'Live'))
    then
      null;
    else
      raise exception 'Only an admin can move a programme to %.', new.status;
    end if;
  end if;

  if new.nc_comment is distinct from old.nc_comment then
    raise exception 'Only an admin can leave a review comment.';
  end if;

  if new.rc_comment is distinct from old.rc_comment then
    if not (
      v_role = 'RC' and new.chapter_id = public.dir_chapter()
      and old.status = 'RC Review' and new.status in ('Declined', 'RC Returned', 'Pending')
    ) then
      raise exception 'Only this chapter''s Regional Coordinator can set the review comment, when acting on a submitted note.';
    end if;
  end if;

  return new;
end;
$$;

-- trg_guard_program_status already exists (before update, from
-- Batch 0b) and points at this function by name, so replacing the
-- function body above is all that's needed here.

-- ============================================================
-- End of Batch 38.
-- ============================================================
