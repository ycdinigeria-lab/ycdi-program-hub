-- ============================================================
-- YCDI Programme Hub
-- Batch 16: the reporting chain, team member up to RC up to NC
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH16-MARKER reporting-chain
--
-- What this is
-- ------------
-- A team member writes a report or a concept note. It stays a private
-- draft until they submit it. On submit it goes to one place, the RC of
-- their own chapter. The RC can send it back with a note, acknowledge it,
-- or acknowledge and pass it up to the National Coordinator. Nothing
-- reaches the NC until the RC has acknowledged it.
--
-- One exception, and only one. Where a chapter has no active RC, a
-- submitted report reaches the NC directly, so a team member in a
-- chapter without a coordinator is never left unheard. The NC appoints
-- an RC later (that control ships next), and from then on new reports
-- route through them.
--
-- The gate lives here, in the row rules, not in the screen. A National
-- Coordinator running a raw query still cannot pull a submitted report
-- out of a chapter that has an RC. The only two ways a report becomes
-- visible to the NC are: the RC forwarded it, or the chapter has no RC.
--
-- Who an RC is, and who an NC is, is read from the profiles table. A
-- team member cannot change their own role, chapter or admin flag (the
-- Batch 3 and Batch 0b triggers block that), and role changes for other
-- people run through controlled functions, so the gate cannot be forged
-- from below by pretending a chapter has no RC or pretending to be an NC.
--
-- Everything here is additive. It creates one new table and its own
-- helpers and functions. It does not alter any existing table or policy.
-- ============================================================

-- ---- small helpers, so the rules read plainly -------------------------
-- These read the caller's own row. profiles is readable to every signed
-- in account already, so no elevated rights are needed.

create or replace function public.me_role()
returns text language sql stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.me_chapter()
returns uuid language sql stable as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

create or replace function public.me_is_admin()
returns boolean language sql stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Does a chapter currently have an active RC? This is the whole basis of
-- the no-RC branch, so it reads only from the coordinator assignment on
-- profiles, which a team member cannot touch.
create or replace function public.chapter_has_rc(cid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles
     where role = 'RC' and chapter_id = cid
  )
$$;

-- ---- the table --------------------------------------------------------

create table if not exists public.submissions (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('report','concept_note')),
  chapter_id      uuid not null references public.chapters(id),
  author_id       uuid not null references public.profiles(id),
  title           text,
  body            text,
  -- The author's own words, snapshotted at submit. The RC edits title and
  -- body when forwarding, but these two never change, so there is always a
  -- record of what the volunteer wrote next to what the RC sent up.
  author_title    text,
  author_body     text,
  program_id      uuid references public.programs(id),
  people_reached  int,
  held_on         date,
  status          text not null default 'draft'
                    check (status in ('draft','submitted','returned','forwarded','acknowledged')),
  rc_note         text,
  submitted_at    timestamptz,
  forwarded_at    timestamptz,
  acknowledged_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists submissions_chapter_status_idx
  on public.submissions (chapter_id, status);
create index if not exists submissions_author_idx
  on public.submissions (author_id);

alter table public.submissions enable row level security;

-- ---- the gate, and who can see what -----------------------------------

drop policy if exists sub_read on public.submissions;
create policy sub_read on public.submissions for select using (
     public.me_is_admin()                                  -- admin sees all
  or author_id = auth.uid()                                -- the author, always
  or (                                                     -- the chapter's RC, once it leaves draft
        public.me_role() = 'RC'
    and chapter_id = public.me_chapter()
    and status <> 'draft'
     )
  or (                                                     -- the NC, through the gate only
        public.me_role() = 'NC'
    and (
          status in ('forwarded','acknowledged')           -- branch 1: the RC sent it up
       or ( status = 'submitted'                            -- branch 2: no RC to send it
            and not public.chapter_has_rc(chapter_id) )
        )
     )
);

-- ---- write lockdown ---------------------------------------------------
-- The author manages their own row while it is a draft or has been
-- returned to them. Every status change beyond that runs through the
-- functions below, which carry the rules. Direct writes cannot move a
-- report along the chain.

drop policy if exists sub_insert on public.submissions;
create policy sub_insert on public.submissions for insert with check (
      author_id = auth.uid()
  and chapter_id = public.me_chapter()
  and status = 'draft'
);

drop policy if exists sub_update on public.submissions;
create policy sub_update on public.submissions for update
  using  ( author_id = auth.uid() and status in ('draft','returned') )
  with check ( author_id = auth.uid() and status in ('draft','returned') );

drop policy if exists sub_delete on public.submissions;
create policy sub_delete on public.submissions for delete
  using ( author_id = auth.uid() and status = 'draft' );

-- ---- chain actions ----------------------------------------------------
-- Each one is security definer so it can move a row the caller could not
-- move by hand, but each checks who the caller is before it does anything.

-- The author sends their draft (or a returned report) up to the RC. Their
-- words are snapshotted here.
create or replace function public.submit_submission(sub_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  select * into r from public.submissions where id = sub_id;
  if not found then raise exception 'no such submission'; end if;
  if r.author_id <> auth.uid() then raise exception 'that is not your submission'; end if;
  if r.status not in ('draft','returned') then
    raise exception 'only a draft or a returned report can be submitted';
  end if;
  update public.submissions
     set status       = 'submitted',
         author_title = title,
         author_body  = body,
         submitted_at = now(),
         updated_at   = now()
   where id = sub_id;
end $$;

-- The chapter's RC sends a submitted report back to its author with a note.
create or replace function public.return_submission(sub_id uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  select * into r from public.submissions where id = sub_id;
  if not found then raise exception 'no such submission'; end if;
  if not (public.me_is_admin()
          or (public.me_role() = 'RC' and r.chapter_id = public.me_chapter())) then
    raise exception 'only this chapter''s RC can return a report';
  end if;
  if r.status <> 'submitted' then
    raise exception 'only a submitted report can be returned';
  end if;
  update public.submissions
     set status = 'returned', rc_note = note, updated_at = now()
   where id = sub_id;
end $$;

-- The chapter's RC acknowledges a submitted report and passes it up,
-- editing the title or body first if they choose. The author's snapshot
-- is left untouched.
create or replace function public.forward_submission(
  sub_id uuid, edited_title text default null,
  edited_body text default null, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  select * into r from public.submissions where id = sub_id;
  if not found then raise exception 'no such submission'; end if;
  if not (public.me_is_admin()
          or (public.me_role() = 'RC' and r.chapter_id = public.me_chapter())) then
    raise exception 'only this chapter''s RC can forward a report';
  end if;
  if r.status <> 'submitted' then
    raise exception 'only a submitted report can be forwarded';
  end if;
  update public.submissions
     set title        = coalesce(edited_title, title),
         body         = coalesce(edited_body, body),
         rc_note      = coalesce(note, rc_note),
         status       = 'forwarded',
         forwarded_at = now(),
         updated_at   = now()
   where id = sub_id;
end $$;

-- The NC acknowledges. Normally that is a forwarded report. Where a
-- chapter has no RC, the NC acknowledges the submitted report directly,
-- standing in for the missing coordinator. Acknowledgement then shows
-- back down the chain, because the author and the RC can already see
-- their own and their chapter's rows.
create or replace function public.acknowledge_submission(sub_id uuid, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  select * into r from public.submissions where id = sub_id;
  if not found then raise exception 'no such submission'; end if;
  if not (public.me_is_admin() or public.me_role() = 'NC') then
    raise exception 'only the National Coordinator can acknowledge a report';
  end if;
  if not ( r.status = 'forwarded'
           or (r.status = 'submitted' and not public.chapter_has_rc(r.chapter_id)) ) then
    raise exception 'this report has not reached the National Coordinator yet';
  end if;
  update public.submissions
     set status          = 'acknowledged',
         rc_note         = coalesce(note, rc_note),
         acknowledged_at = now(),
         updated_at      = now()
   where id = sub_id;
end $$;

grant execute on function
  public.submit_submission(uuid),
  public.return_submission(uuid, text),
  public.forward_submission(uuid, text, text, text),
  public.acknowledge_submission(uuid, text)
  to authenticated;

-- ---- appointing an RC -------------------------------------------------
-- Turns an existing team member into their chapter's RC. Once a chapter
-- has an RC, its submitted reports stop reaching the NC directly and start
-- routing through that coordinator instead, because chapter_has_rc() now
-- returns true for them.
--
-- Only an admin may do this, which matches the profiles guard exactly: the
-- guard already lets only an admin change a person's role. Because the
-- caller is an admin, the guard passes the change through with no need to
-- weaken it. A National Coordinator who also holds admin (the person
-- running the hub) can therefore appoint; a plain NC cannot, by design.
create or replace function public.appoint_rc(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can appoint a Regional Coordinator.';
  end if;
  select * into t from public.profiles where id = target;
  if not found then raise exception 'no such person'; end if;
  if t.chapter_id is null then
    raise exception 'This person is not attached to a chapter, so they cannot coordinate one.';
  end if;
  if t.role = 'RC' then
    return;  -- already an RC, leave it alone
  end if;
  update public.profiles set role = 'RC' where id = target;
end $$;

grant execute on function public.appoint_rc(uuid) to authenticated;

-- ---- a place field, and a save call the app uses --------------------
-- The app never hands over a chapter or an author id. This call sets both
-- from the signed-in account, so a team member cannot file under another
-- name or into another chapter even if the request were tampered with. It
-- creates a draft when sub_id is null, or edits an existing draft or
-- returned report that belongs to the caller.
alter table public.submissions add column if not exists place text;

create or replace function public.save_submission(
  sub_id           uuid,
  p_kind           text,
  p_title          text,
  p_body           text,
  p_place          text default null,
  p_held_on        date default null,
  p_people_reached int  default null,
  p_program_id     uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.submissions; new_id uuid;
begin
  if p_kind not in ('report','concept_note') then
    raise exception 'a submission is either a report or a concept note';
  end if;
  if sub_id is null then
    insert into public.submissions
      (kind, chapter_id, author_id, title, body, place, held_on, people_reached, program_id, status)
    values
      (p_kind, public.me_chapter(), auth.uid(), p_title, p_body, p_place, p_held_on, p_people_reached, p_program_id, 'draft')
    returning id into new_id;
    return new_id;
  end if;
  select * into r from public.submissions where id = sub_id;
  if not found then raise exception 'no such submission'; end if;
  if r.author_id <> auth.uid() then raise exception 'that is not your submission'; end if;
  if r.status not in ('draft','returned') then
    raise exception 'only a draft or a returned report can be edited';
  end if;
  update public.submissions
     set kind = p_kind, title = p_title, body = p_body, place = p_place,
         held_on = p_held_on, people_reached = p_people_reached,
         program_id = p_program_id, updated_at = now()
   where id = sub_id;
  return sub_id;
end $$;

grant execute on function
  public.save_submission(uuid, text, text, text, text, date, int, uuid)
  to authenticated;
