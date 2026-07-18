-- ============================================================
-- YCDI Programme Hub - Batch 0
-- Paste this whole file into Supabase > SQL Editor and click Run.
--
-- Two parts:
--
--   1. A crash log. When the app breaks for someone, it records what
--      happened, on which page, for which account. Admins can read it
--      inside the app under More > Manage Admins > Crash log.
--
--   2. At the very bottom, a read-only query that reports what the
--      older tables actually enforce. It changes nothing. Run it,
--      copy the whole result table, and send it to me.
--
-- Safe to run more than once.
-- ============================================================

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ------------------------------------------------------------
-- 1. Crash log
-- ------------------------------------------------------------
create table if not exists public.client_errors (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references public.profiles(id) on delete set null,
  full_name       text,
  message         text not null check (length(message) <= 2000),
  stack           text check (stack is null or length(stack) <= 8000),
  component_stack text check (component_stack is null or length(component_stack) <= 8000),
  page            text check (page is null or length(page) <= 300),
  user_agent      text check (user_agent is null or length(user_agent) <= 500),
  app_version     text check (app_version is null or length(app_version) <= 40),
  created_at      timestamptz not null default now()
);

create index if not exists client_errors_time_idx on public.client_errors(created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists cerr_insert on public.client_errors;
drop policy if exists cerr_read   on public.client_errors;
drop policy if exists cerr_delete on public.client_errors;

-- Anyone using the app can file a crash report, including someone who
-- is not signed in yet, because a crash on the sign-in screen is
-- exactly the kind that would otherwise lock everybody out silently.
-- The length limits above are what keep this from being a dumping
-- ground. Nobody except an admin can read any of it back.
create policy cerr_insert on public.client_errors
  for insert to authenticated, anon with check (true);

create policy cerr_read on public.client_errors
  for select to authenticated using (public.is_admin());

create policy cerr_delete on public.client_errors
  for delete to authenticated using (public.is_admin());

-- Keeps the log from growing forever. Admins can also clear it in the app.
create or replace function public.prune_client_errors()
returns void language sql security definer set search_path = public as $$
  delete from public.client_errors where created_at < now() - interval '90 days';
$$;

grant execute on function public.prune_client_errors() to authenticated;

do $$ begin raise notice 'Crash log ready.'; end $$;

-- ============================================================
-- 2. READ-ONLY CHECK. Run this, copy the whole result, send it to me.
--    It changes nothing at all.
-- ============================================================
select 'A. Row security' as section,
       c.relname::text   as item,
       case when c.relrowsecurity
            then 'ON'
            else 'OFF - this table has no row rules at all'
       end               as detail
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('programs', 'reports', 'pending_signups', 'profiles', 'chapters')

union all

select 'B. Rules',
       p.tablename || ' / ' || p.policyname || '  [' || p.cmd || ']',
       'USING: '  || coalesce(p.qual, '-') ||
       '   CHECK: ' || coalesce(p.with_check, '-')
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in ('programs', 'reports', 'pending_signups', 'profiles', 'chapters')

order by 1, 2;
