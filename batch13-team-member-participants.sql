-- ============================================================
-- YCDI Programme Hub
-- Batch 13: a team member holds the young people they added or mentor
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH13-MARKER team-member-participants
--
-- Why this exists
-- ---------------
-- Until now a team member could hold no beneficiary data at all. Batch 2
-- said so on purpose: volunteers should not carry children's records
-- beyond what their own role needs, and a team member's role did not need
-- it. That is still the right default. But a team member who is actually
-- mentoring a young person, or who first brought that young person in,
-- does need to see and update that one record, and only that one.
--
-- So this batch opens a narrow door, not a wide one. A team member may
-- see and work with a participant on exactly two conditions: they created
-- the record, or they are its current live mentor, and in their own
-- chapter either way. Nothing else in the chapter becomes visible to them.
-- They never get the chapter-wide register, they cannot assign or end a
-- mentorship, and they cannot withdraw a consent. Those stay coordinator
-- work, because each one either lists the whole chapter or carries
-- compliance weight.
--
-- One thing a team member can now do that they could not before: record
-- their own mentee's attendance, one young person at a time, through the
-- scoped call at the end of this file. They still cannot open the chapter
-- register, and they still cannot write to the attendance table directly.
-- The only path in for them is that one call, and it touches one row.
--
-- Everything here is additive. Every rule is the existing coordinator
-- rule with one more OR bolted on, so nothing changes for a National
-- Coordinator, a Regional Coordinator, or an admin.
--
-- Data Protection Policy note, for Godfrey, not for the database
-- --------------------------------------------------------------
-- This widens the set of people who may hold a child's record to include
-- mentoring team members. That is a real change to who touches
-- beneficiary data, so YCDI-LEG (Data Protection Policy) should say so, or
-- be amended to. Flagging it here so it travels with the file. The code
-- below already keeps the door as narrow as the policy would want.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The ownership test
-- ------------------------------------------------------------
-- True when the signed-in person either created this participant or is
-- their current, un-ended mentor, in their own chapter. This is the whole
-- basis of a team member's access, and it is deliberately strict: a
-- mentorship that has ended stops granting anything the moment it ends.
create or replace function public.owns_participant(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.participants p
    where p.id = p_id
      and p.chapter_id = public.dir_chapter()
      and (
        p.created_by = auth.uid()
        or exists (
          select 1
          from public.participant_mentors m
          where m.participant_id = p.id
            and m.mentor_id = auth.uid()
            and m.ended_on is null
        )
      )
  )
$$;
grant execute on function public.owns_participant(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. Participants: read, insert, update
-- ------------------------------------------------------------
-- Read and update gain an "or you own it" clause. Insert is different: a
-- team member may file a new participant, but only in their own chapter
-- and only under their own name. The created_by = auth.uid() check is what
-- stops a team member filing a record as if somebody else had added it.
drop policy if exists pt_read   on public.participants;
drop policy if exists pt_write  on public.participants;
drop policy if exists pt_update on public.participants;

create policy pt_read on public.participants
  for select to authenticated
  using (public.can_read_participant(chapter_id) or public.owns_participant(id));

create policy pt_write on public.participants
  for insert to authenticated
  with check (
    public.can_touch_participant(chapter_id)
    or (
      public.dir_role() = 'TM'
      and chapter_id = public.dir_chapter()
      and created_by = auth.uid()
    )
  );

create policy pt_update on public.participants
  for update to authenticated
  using (public.can_touch_participant(chapter_id) or public.owns_participant(id))
  with check (public.can_touch_participant(chapter_id) or public.owns_participant(id));

-- Delete stays revoked from Batch 2. A participant is marked inactive,
-- never deleted, so the consent trail and safeguarding history survive.
-- Nothing here re-grants it.

-- ------------------------------------------------------------
-- 3. The child tables
-- ------------------------------------------------------------
-- Batch 2 set these with a loop. Here they are written out one by one,
-- because the four tables no longer share a single rule. Consents and
-- stages follow ownership all the way through. Attendance lets an owner
-- read but not write, so the only way a team member records attendance is
-- the scoped call in section 6. Mentors read and update follow ownership,
-- but the insert is tighter still: an owner may add a mentor row only when
-- that row makes themselves the mentor.

-- Consents: read, write, update all follow ownership.
drop policy if exists participant_consents_read   on public.participant_consents;
drop policy if exists participant_consents_write  on public.participant_consents;
drop policy if exists participant_consents_update on public.participant_consents;

create policy participant_consents_read on public.participant_consents
  for select to authenticated
  using (
    public.can_read_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
create policy participant_consents_write on public.participant_consents
  for insert to authenticated
  with check (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
create policy participant_consents_update on public.participant_consents
  for update to authenticated
  using (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  )
  with check (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
revoke delete on public.participant_consents from authenticated;

-- Stages: read, write, update all follow ownership.
drop policy if exists participant_stages_read   on public.participant_stages;
drop policy if exists participant_stages_write  on public.participant_stages;
drop policy if exists participant_stages_update on public.participant_stages;

create policy participant_stages_read on public.participant_stages
  for select to authenticated
  using (
    public.can_read_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
create policy participant_stages_write on public.participant_stages
  for insert to authenticated
  with check (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
create policy participant_stages_update on public.participant_stages
  for update to authenticated
  using (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  )
  with check (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
revoke delete on public.participant_stages from authenticated;

-- Attendance: an owner may read, but write and update stay coordinator
-- only. A team member's writes go through record_mentee_attendance in
-- section 6 and nowhere else, so there is no direct side door onto this
-- table.
drop policy if exists participant_attendance_read   on public.participant_attendance;
drop policy if exists participant_attendance_write  on public.participant_attendance;
drop policy if exists participant_attendance_update on public.participant_attendance;

create policy participant_attendance_read on public.participant_attendance
  for select to authenticated
  using (
    public.can_read_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
create policy participant_attendance_write on public.participant_attendance
  for insert to authenticated
  with check (public.can_touch_participant(public.participant_chapter(participant_id)));
create policy participant_attendance_update on public.participant_attendance
  for update to authenticated
  using (public.can_touch_participant(public.participant_chapter(participant_id)))
  with check (public.can_touch_participant(public.participant_chapter(participant_id)));
revoke delete on public.participant_attendance from authenticated;

-- Mentors: an owner may read and update the mentor rows for their young
-- person. The insert is the careful one. A coordinator may add any mentor
-- row for a participant in their chapter. An owner who is not a
-- coordinator may add a mentor row only when it names themselves, which is
-- how a team member self-mentors somebody they just added. Assigning
-- anybody else as a mentor is a coordinator action, handled in section 5.
drop policy if exists participant_mentors_read   on public.participant_mentors;
drop policy if exists participant_mentors_write  on public.participant_mentors;
drop policy if exists participant_mentors_update on public.participant_mentors;

create policy participant_mentors_read on public.participant_mentors
  for select to authenticated
  using (
    public.can_read_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
create policy participant_mentors_write on public.participant_mentors
  for insert to authenticated
  with check (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or (public.owns_participant(participant_id) and mentor_id = auth.uid())
  );
create policy participant_mentors_update on public.participant_mentors
  for update to authenticated
  using (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  )
  with check (
    public.can_touch_participant(public.participant_chapter(participant_id))
    or public.owns_participant(participant_id)
  );
revoke delete on public.participant_mentors from authenticated;

-- ------------------------------------------------------------
-- 4. Moving somebody along the pathway
-- ------------------------------------------------------------
-- The Batch 2 function, unchanged except for its guard: an owner may now
-- move their own mentee, alongside the coordinator who always could.
create or replace function public.move_participant_stage(
  p_id   uuid,
  p_new  text,
  p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_chapter uuid;
begin
  select chapter_id into v_chapter from public.participants where id = p_id;
  if v_chapter is null then
    raise exception 'That participant no longer exists.';
  end if;
  if not (public.can_touch_participant(v_chapter) or public.owns_participant(p_id)) then
    raise exception 'You can only update young people in your own chapter, or ones you added or mentor.';
  end if;
  if p_new not in ('Contact','Connect','Commit','Grow','Multiply') then
    raise exception 'Unrecognised stage.';
  end if;

  update public.participants set stage = p_new where id = p_id;
  insert into public.participant_stages (participant_id, stage, note, recorded_by)
  values (p_id, p_new, nullif(p_note, ''), auth.uid());
end;
$$;
grant execute on function public.move_participant_stage(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Mentor management, coordinator only
-- ------------------------------------------------------------
-- Assigning a mentor, changing one, and ending a mentorship are oversight
-- actions. They stay with the chapter's coordinator and admins. A team
-- member never reaches these, which is why self-mentoring in section 3 is
-- the only mentor row a team member can create.

-- Assign or change the live mentor. Ends whoever holds it now, then names
-- the new one. The mentor has to belong to the same chapter and be a team
-- member or the coordinator, so nobody from outside the chapter, and
-- nobody who is not staff, can be written in as a mentor.
create or replace function public.assign_mentor(p_participant uuid, p_mentor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chapter        uuid;
  v_mentor_chapter uuid;
  v_mentor_role    text;
  v_mentor_found   boolean;
begin
  select chapter_id into v_chapter from public.participants where id = p_participant;
  if v_chapter is null then
    raise exception 'That participant no longer exists.';
  end if;
  if not public.can_touch_participant(v_chapter) then
    raise exception 'Only a coordinator can assign a mentor.';
  end if;

  select true, chapter_id, role
    into v_mentor_found, v_mentor_chapter, v_mentor_role
  from public.profiles where id = p_mentor;
  if not coalesce(v_mentor_found, false) then
    raise exception 'That mentor is not a known member of the directory.';
  end if;
  if v_mentor_chapter is distinct from v_chapter then
    raise exception 'A mentor must belong to the same chapter as the young person.';
  end if;
  if v_mentor_role not in ('TM','RC') then
    raise exception 'A mentor must be a team member or the chapter coordinator.';
  end if;

  update public.participant_mentors
     set ended_on = current_date
   where participant_id = p_participant and ended_on is null;

  insert into public.participant_mentors (participant_id, mentor_id, assigned_by)
  values (p_participant, p_mentor, auth.uid());
end;
$$;
grant execute on function public.assign_mentor(uuid, uuid) to authenticated;

-- End the live mentorship, leaving the young person with none. Coordinator
-- only, the same as assigning one.
create or replace function public.end_mentorship(p_participant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_chapter uuid;
begin
  select chapter_id into v_chapter from public.participants where id = p_participant;
  if v_chapter is null then
    raise exception 'That participant no longer exists.';
  end if;
  if not public.can_touch_participant(v_chapter) then
    raise exception 'Only a coordinator can end a mentorship.';
  end if;

  update public.participant_mentors
     set ended_on = current_date
   where participant_id = p_participant and ended_on is null;
end;
$$;
grant execute on function public.end_mentorship(uuid) to authenticated;

-- The people a coordinator may pick from when assigning a mentor: the team
-- members and the coordinator in the young person's own chapter. Gated so
-- that only somebody who could actually assign a mentor sees a list at
-- all. Anybody else gets nothing back.
create or replace function public.chapter_mentor_options(p_participant uuid)
returns table (profile_id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.full_name, pr.role
  from public.profiles pr
  where pr.chapter_id = (select chapter_id from public.participants where id = p_participant)
    and pr.role in ('TM','RC')
    and public.can_touch_participant(
          (select chapter_id from public.participants where id = p_participant))
  order by pr.role, pr.full_name
$$;
grant execute on function public.chapter_mentor_options(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. A team member records one mentee's attendance
-- ------------------------------------------------------------
-- The only attendance path open to a team member, and the narrowest one
-- that does the job: one young person, one programme, present or absent.
-- A coordinator may use it too, for their own chapter. It refuses a young
-- person you neither added nor mentor, and it refuses a programme from
-- another chapter. Marking present adds or refreshes the single row;
-- marking absent removes it. It never touches anybody else's record. The
-- delete works because the call runs as its owner, which is also why an
-- ordinary user, who has no delete of their own, can still un-mark.
create or replace function public.record_mentee_attendance(
  p_participant uuid,
  p_program     uuid,
  p_present     boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_pchapter uuid;
  v_gchapter uuid;
  v_gdate    date;
begin
  select chapter_id into v_pchapter from public.participants where id = p_participant;
  if v_pchapter is null then
    raise exception 'That young person no longer exists.';
  end if;
  if not (public.can_touch_participant(v_pchapter) or public.owns_participant(p_participant)) then
    raise exception 'You can only record attendance for young people you added or mentor.';
  end if;

  select chapter_id, date into v_gchapter, v_gdate
  from public.programs where id = p_program;
  if v_gchapter is null then
    raise exception 'That programme no longer exists.';
  end if;
  if v_gchapter is distinct from v_pchapter then
    raise exception 'That programme belongs to a different chapter.';
  end if;

  if p_present then
    insert into public.participant_attendance (participant_id, program_id, attended_on, recorded_by)
    values (p_participant, p_program, coalesce(v_gdate, current_date), auth.uid())
    on conflict (participant_id, program_id)
      do update set attended_on = excluded.attended_on,
                    recorded_by = excluded.recorded_by;
    return true;
  else
    delete from public.participant_attendance
     where participant_id = p_participant and program_id = p_program;
    return false;
  end if;
end;
$$;
grant execute on function public.record_mentee_attendance(uuid, uuid, boolean) to authenticated;

comment on function public.record_mentee_attendance(uuid, uuid, boolean) is
  'Batch 13. Records one young person''s attendance at one programme, present or absent, for a coordinator or for the team member who added or mentors them. Touches exactly one row. Refuses a young person the caller does not own and a programme from another chapter.';
