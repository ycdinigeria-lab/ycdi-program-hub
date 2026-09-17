-- ============================================================
-- YCDI Programme Hub
-- Batch 22: the data protection register
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH22-MARKER dp-register
--
-- What this is
-- ------------
-- The National Secretary's data-protection module (YCDI-GOV-007-A1 seat,
-- YCDI-LEG-003 duties). Batch 21 gave the SEC seat reach over records that
-- already existed. This builds the thing that did not exist: the register
-- the Data Protection Policy assumes but the hub never held.
--
-- It covers the two duties in LEG-003 that run on a clock, the two places
-- a database earns its keep over a filing cabinet:
--
--   1. Data subject requests. Every person whose data YCDI holds may ask
--      to see it, correct it, erase it, restrict or object to its use,
--      take it elsewhere, or withdraw consent (LEG-003 2.5). All but the
--      last carry a 30-day answer. This logs each request and counts the
--      clock down so none is missed.
--
--   2. Personal data breaches. The five-step response in LEG-003 2.6: the
--      NC assesses within 24 hours, notifies NITDA within 72 hours where
--      the risk is high, takes remedial action, and files a written
--      report that is retained. This holds that record and flags what is
--      still owed.
--
-- The Record of Processing Activities and the Records Retention Schedule
-- (LEG-004) are reference inventories, not clock-driven workflows. They
-- are the register's second half and come in their own batch; this one
-- does not touch them.
--
-- Who may use it
--   The National Coordinator (the Data Controller under LEG-003 2.3), the
--   SEC seat (data-protection custodianship), and admins. Not RC, not a
--   plain team member. A data subject exercises a right by written request
--   to the NC, offline; the register is the staff-side record of that, so
--   there is no per-subject self-service here.
--
-- A note kept on purpose
--   Neither table holds the breached or requested content itself. A breach
--   row records that a breach happened, how bad, whether NITDA was told,
--   and what was done, not the data that leaked. Where a breach or a
--   request touches a safeguarding case, the case stays in the
--   safeguarding tables behind their own wall (Batch 3), exactly as the
--   audit log keeps out of case content. The register points at a matter;
--   it does not copy it.
--
-- Additive throughout. Two new tables, their helpers and their row rules.
-- It alters nothing that already exists.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers, re-declared so this file stands on its own
-- ------------------------------------------------------------
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Who operates the register. The Controller, the Secretary's seat, admins.
create or replace function public.can_use_dp_register()
  returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.dir_role() = 'NC'
      or public.holds_portfolio('SEC')
$$;
grant execute on function public.can_use_dp_register() to authenticated;

-- ============================================================
-- A. Data subject requests
-- ============================================================
create table if not exists public.data_subject_requests (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique,
  subject_name   text not null,
  subject_contact text,
  request_type   text not null
                   check (request_type in
                     ('access','rectification','erasure','restrict',
                      'object','portability','withdraw_consent')),
  channel        text check (channel in ('written','verbal')),
  received_on    date not null default current_date,
  -- The answer is due 30 days on, except a consent withdrawal, which takes
  -- effect immediately (LEG-003 2.5). Generated from the row so it can
  -- never drift from received_on.
  due_on         date generated always as (
                   case when request_type = 'withdraw_consent'
                        then received_on
                        else received_on + 30 end
                 ) stored,
  status         text not null default 'received'
                   check (status in ('received','in_progress','completed','refused')),
  outcome        text,
  handled_by     uuid references public.profiles(id) on delete set null,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists dsr_status_idx on public.data_subject_requests (status, due_on);

-- Reference DSR-YYYY-NNN, per year, mirroring the incident stamp.
create or replace function public.stamp_dsr()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  if new.reference is null then
    select count(*) + 1 into v_seq
    from public.data_subject_requests
    where date_part('year', received_on) = date_part('year', new.received_on);
    new.reference := 'DSR-' || to_char(new.received_on, 'YYYY') || '-' || lpad(v_seq::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dsr_stamp on public.data_subject_requests;
create trigger dsr_stamp
  before insert or update on public.data_subject_requests
  for each row execute function public.stamp_dsr();

-- ============================================================
-- B. Personal data breaches
-- ============================================================
create table if not exists public.data_breaches (
  id                 uuid primary key default gen_random_uuid(),
  reference          text unique,
  discovered_on      date not null default current_date,
  reported_to_nc_on  date,                 -- step 1
  nc_assessed_on     date,                 -- step 2, target: within 24h
  high_risk          boolean,              -- step 2 finding
  nitda_notified_on  date,                 -- step 3, target: within 72h if high risk
  subjects_notified_on date,               -- step 3
  nature             text,                 -- what happened, in brief; not the leaked data
  remedial_action    text,                 -- step 4
  report_filed       boolean not null default false,  -- step 5
  status             text not null default 'open'
                       check (status in ('open','contained','notified','closed')),
  handled_by         uuid references public.profiles(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists breach_status_idx on public.data_breaches (status, discovered_on desc);

create or replace function public.stamp_breach()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  if new.reference is null then
    select count(*) + 1 into v_seq
    from public.data_breaches
    where date_part('year', discovered_on) = date_part('year', new.discovered_on);
    new.reference := 'BR-' || to_char(new.discovered_on, 'YYYY') || '-' || lpad(v_seq::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists breach_stamp on public.data_breaches;
create trigger breach_stamp
  before insert or update on public.data_breaches
  for each row execute function public.stamp_breach();

-- ============================================================
-- C. Row rules
-- ============================================================
-- Read, insert and update belong to whoever operates the register.
-- Delete is held to admins alone: a filed breach must be retained
-- (LEG-003 2.6), so an operator corrects a row rather than removing it,
-- and only a system-level hand can clear a genuine mis-entry.
alter table public.data_subject_requests enable row level security;

drop policy if exists dsr_read   on public.data_subject_requests;
drop policy if exists dsr_insert on public.data_subject_requests;
drop policy if exists dsr_update on public.data_subject_requests;
drop policy if exists dsr_delete on public.data_subject_requests;

create policy dsr_read   on public.data_subject_requests
  for select to authenticated using (public.can_use_dp_register());
create policy dsr_insert on public.data_subject_requests
  for insert to authenticated with check (public.can_use_dp_register());
create policy dsr_update on public.data_subject_requests
  for update to authenticated
  using (public.can_use_dp_register()) with check (public.can_use_dp_register());
create policy dsr_delete on public.data_subject_requests
  for delete to authenticated using (public.is_admin());

alter table public.data_breaches enable row level security;

drop policy if exists breach_read   on public.data_breaches;
drop policy if exists breach_insert on public.data_breaches;
drop policy if exists breach_update on public.data_breaches;
drop policy if exists breach_delete on public.data_breaches;

create policy breach_read   on public.data_breaches
  for select to authenticated using (public.can_use_dp_register());
create policy breach_insert on public.data_breaches
  for insert to authenticated with check (public.can_use_dp_register());
create policy breach_update on public.data_breaches
  for update to authenticated
  using (public.can_use_dp_register()) with check (public.can_use_dp_register());
create policy breach_delete on public.data_breaches
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.data_subject_requests to authenticated;
grant select, insert, update, delete on public.data_breaches to authenticated;

-- ============================================================
-- D. What still needs doing
-- ============================================================
-- Open requests, soonest deadline first, with the clock. A negative
-- days_left means the 30-day answer is already late.
create or replace function public.dsr_needing_action()
returns table (
  id           uuid,
  reference    text,
  subject_name text,
  request_type text,
  received_on  date,
  due_on       date,
  days_left    integer,
  status       text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.reference, r.subject_name, r.request_type,
         r.received_on, r.due_on,
         (r.due_on - current_date)::integer,
         r.status
  from public.data_subject_requests r
  where public.can_use_dp_register()
    and r.status in ('received','in_progress')
  order by r.due_on
$$;
grant execute on function public.dsr_needing_action() to authenticated;

-- Open breaches with the step that is still owed. Targets are read at day
-- granularity, which is what a hand-filled register carries: assessment is
-- due the day after discovery, NITDA within three days of discovery where
-- the risk is high.
create or replace function public.breaches_needing_action()
returns table (
  id            uuid,
  reference     text,
  discovered_on date,
  days_open     integer,
  what_is_owed  text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.reference, b.discovered_on,
         (current_date - b.discovered_on)::integer,
         (case
            when b.nc_assessed_on is null and current_date > b.discovered_on
              then 'NC assessment overdue'
            when b.nc_assessed_on is null
              then 'Awaiting NC assessment'
            when b.high_risk and b.nitda_notified_on is null and current_date > b.discovered_on + 3
              then 'NITDA notification overdue'
            when b.high_risk and b.nitda_notified_on is null
              then 'NITDA notification pending'
            when not b.report_filed
              then 'Breach report not filed'
            else 'In progress'
          end)::text
  from public.data_breaches b
  where public.can_use_dp_register()
    and b.status <> 'closed'
  order by b.discovered_on
$$;
grant execute on function public.breaches_needing_action() to authenticated;

-- A small pulse for a home or reports panel.
create or replace function public.dp_pulse()
returns table (
  open_requests    integer,
  overdue_requests integer,
  open_breaches    integer,
  breaches_to_file integer
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.data_subject_requests
       where status in ('received','in_progress'))::integer,
    (select count(*) from public.data_subject_requests
       where status in ('received','in_progress') and due_on < current_date)::integer,
    (select count(*) from public.data_breaches where status <> 'closed')::integer,
    (select count(*) from public.data_breaches
       where status <> 'closed' and report_filed = false)::integer
  where public.can_use_dp_register()
$$;
grant execute on function public.dp_pulse() to authenticated;

-- ============================================================
-- End of Batch 22.
-- ============================================================
