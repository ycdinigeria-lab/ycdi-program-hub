-- ============================================================
-- YCDI Programme Hub
-- Batch 19: access grant for the Volunteer Coordinator seat (VC)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH19-MARKER vc-access
--
-- What this is
-- ------------
-- The first of the seat grants. Whoever holds the VC seat (Batch 18) now
-- gets the national reach the Volunteer Coordinator's duty needs, and
-- nothing wider. Every change here is additive: it adds
-- "or public.holds_portfolio('VC')" to a filter that already lets the
-- National Coordinator, the safeguarding lead or a chapter RC through. No
-- existing access is removed, and a person who holds no seat is unaffected.
--
-- What VC gets
--   - the safeguarding compliance dashboard, nationally
--   - screening records, training completion and annual declarations,
--     read and write (this is the chasing the seat exists to do)
--   - the volunteer register across every chapter
--   - read of the incident register and its action log
--   - read of overdue incidents
--
-- What VC does NOT get, on purpose
--   - incident handling. Creating, updating or adding actions to an
--     incident still runs through the reporter, the chapter DSO, the NC
--     and the Board Safeguarding Chair. VC can see an incident and its
--     history; it cannot investigate one. This keeps the separation the
--     governance amendment insists on: the seat that recruits volunteers
--     is not the seat that investigates them. The handling helpers
--     (is_incident_dso, ia_write, sg_update) are deliberately untouched.
--   - editing volunteer records. VC reads the register; the record
--     itself is still written by the RC, the NC or an admin.
--
-- Adding another seat later
--   When PD, SEC or the rest get their modules, their grant is the same
--   shape: add "or public.holds_portfolio('<CODE>')" to the filters on
--   the tables and functions that seat owns, in its own batch, tested on
--   its own. This file is the template for that.
--
-- Additive throughout. It redefines four functions and four policies,
-- each carrying its original logic plus the one VC clause. It creates no
-- new table.
-- ============================================================

-- ---- 1. compliance surface: screening, training, declarations ---------
-- can_see_screening() gates the screening file, training records and the
-- declarations table. Widening it here is most of VC's job in one line.
create or replace function public.can_see_screening()
returns boolean language sql stable security definer set search_path = public as $$
  select public.dir_role() = 'NC'
      or public.is_safeguarding_lead()
      or public.holds_portfolio('VC')
$$;
grant execute on function public.can_see_screening() to authenticated;

-- ---- 2. the compliance dashboard (national for VC) --------------------
create or replace function public.safeguarding_compliance()
returns table (
  profile_id       uuid,
  full_name        text,
  role             text,
  chapter_name     text,
  role_category    text,
  cleared          boolean,
  declaration_year integer,
  training_expires date,
  problem          text
)
language sql stable security definer set search_path = public as $$
  select
    p.id::uuid,
    p.full_name::text,
    p.role::text,
    c.name::text,
    s.role_category::text,
    public.screening_complete(p.id),
    (select max(d.covers_year) from public.safeguarding_declarations d
      where d.profile_id = p.id)::integer,
    (select max(t.expires_on) from public.safeguarding_training t
      where t.profile_id = p.id and t.kind in ('refresher','orientation'))::date,
    (case
       when s.profile_id is null then 'No screening record started'
       when not exists (select 1 from public.safeguarding_declarations d
                        where d.profile_id = p.id
                          and d.covers_year = extract(year from current_date))
            then 'Annual declaration not renewed'
       when not exists (select 1 from public.safeguarding_training t
                        where t.profile_id = p.id
                          and t.kind in ('refresher','orientation')
                          and (t.expires_on is null or t.expires_on >= current_date))
            then 'Training lapsed'
       when not public.screening_complete(p.id) then 'Screening incomplete'
       else null
     end)::text
  from public.profiles p
  left join public.chapters c on c.id = p.chapter_id
  left join public.volunteer_screening s on s.profile_id = p.id
  where coalesce(s.service_ended_on, current_date + 1) > current_date
    and (public.dir_role() = 'NC'
         or public.is_safeguarding_lead()
         or public.holds_portfolio('VC')
         or (public.dir_role() = 'RC' and p.chapter_id = public.dir_chapter()))
  order by public.screening_complete(p.id), p.full_name
$$;

-- ---- 3. overdue incidents (read for VC) -------------------------------
create or replace function public.incidents_overdue()
returns table (
  id            uuid,
  reference     text,
  chapter_name  text,
  scenario      text,
  reported_on   date,
  hours_waiting integer,
  what_is_late  text
)
language sql stable security definer set search_path = public as $$
  select i.id::uuid, i.reference::text, c.name::text, i.scenario::text, i.reported_on::date,
         (extract(epoch from (now() - i.created_at)) / 3600)::integer,
         (case when i.nc_notified_at is null
               then 'National Coordinator not yet notified'
               else 'Open beyond 30 days' end)::text
  from public.safeguarding_incidents i
  join public.chapters c on c.id = i.chapter_id
  where (public.can_see_incident(i.chapter_id, i.reported_by) or public.holds_portfolio('VC'))
    and i.status <> 'Closed'
    and ((i.nc_notified_at is null and i.created_at < now() - interval '24 hours')
      or i.created_at < now() - interval '30 days')
  order by i.created_at
$$;

-- ---- 4. the volunteer register, across chapters -----------------------
create or replace function public.volunteer_register()
returns table (
  profile_id            uuid,
  full_name             text,
  chapter_id            uuid,
  chapter_name          text,
  hub_role              text,
  record_id             uuid,
  status                text,
  started_on            date,
  ended_on              date,
  ended_reason          text,
  applied_on            date,
  interviewed_on        date,
  references_received_on date,
  safeguarding_declaration_on date,
  orientation_on        date,
  activated_on          date,
  last_contact_on       date,
  certificate_issued_on date,
  availability          text,
  skills                text,
  notes                 text,
  mentor_profile_id     uuid,
  mentor_name           text,
  role_names            text[]
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.chapter_id, ch.name, p.role,
    v.id, v.status, v.started_on, v.ended_on, v.ended_reason,
    v.applied_on, v.interviewed_on, v.references_received_on,
    v.safeguarding_declaration_on, v.orientation_on, v.activated_on,
    v.last_contact_on, v.certificate_issued_on,
    v.availability, v.skills, v.notes,
    v.mentor_profile_id, mp.full_name,
    coalesce(
      (select array_agg(r.name order by r.sort_order)
       from public.volunteer_record_roles vr
       join public.volunteer_roles r on r.id = vr.role_id
       where vr.record_id = v.id),
      array[]::text[]
    )
  from public.profiles p
  left join public.chapters ch on ch.id = p.chapter_id
  left join public.volunteer_records v on v.profile_id = p.id
  left join public.profiles mp on mp.id = v.mentor_profile_id
  where
    public.is_admin()
    or public.dir_role() = 'NC'
    or public.holds_portfolio('VC')
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and p.chapter_id = public.dir_chapter())
  order by p.full_name
$$;

-- ---- 5. read of the incident register and its actions -----------------
-- VC reads incidents and their action log. It is granted straight on the
-- read policies, NOT through can_see_incident(), because ia_write is
-- built on can_see_incident and widening that would let VC write actions,
-- which is handling. Read here, handling left alone.
drop policy if exists sg_read on public.safeguarding_incidents;
create policy sg_read on public.safeguarding_incidents
  for select to authenticated
  using (public.can_see_incident(chapter_id, reported_by) or public.holds_portfolio('VC'));

drop policy if exists ia_read on public.incident_actions;
create policy ia_read on public.incident_actions
  for select to authenticated
  using (public.incident_visible(incident_id) or public.holds_portfolio('VC'));

-- ---- 6. read of individual volunteer records --------------------------
-- The register list comes from the function above; opening one record
-- reads the table, so VC needs the row too. Read only: insert and update
-- stay with the RC, NC and admin.
drop policy if exists volrec_read on public.volunteer_records;
create policy volrec_read on public.volunteer_records
  for select to authenticated using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.dir_role() = 'NC'
    or public.holds_portfolio('VC')
    or (public.dir_role() = 'RC'
        and public.dir_chapter() is not null
        and public.chapter_of_profile(profile_id) = public.dir_chapter())
  );

drop policy if exists volrecrole_read on public.volunteer_record_roles;
create policy volrecrole_read on public.volunteer_record_roles
  for select to authenticated using (
    exists (
      select 1 from public.volunteer_records v
      where v.id = volunteer_record_roles.record_id
        and (
          v.profile_id = auth.uid()
          or public.is_admin()
          or public.dir_role() = 'NC'
          or public.holds_portfolio('VC')
          or (public.dir_role() = 'RC'
              and public.dir_chapter() is not null
              and public.chapter_of_profile(v.profile_id) = public.dir_chapter())
        )
    )
  );

-- ============================================================
-- End of Batch 19.
-- ============================================================
