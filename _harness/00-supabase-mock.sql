-- Local stand-in for the parts of Supabase the scripts depend on.
-- Only exists to validate the migration files, never shipped.

-- Roles live at cluster level, so they survive dropping the database.
do $$
begin
  create role anon;
exception when duplicate_object then null; end $$;
do $$
begin
  create role authenticated;
exception when duplicate_object then null; end $$;
do $$
begin
  create role service_role;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists storage;

-- Supabase exposes the signed-in account id this way. Here it comes from
-- a session variable so tests can pretend to be different people.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table auth.users (
  id    uuid primary key,
  email varchar(255)
);

create table public.chapters (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Deliberately reproduces the old constraint that blocked Team Members,
-- so the fix for it gets exercised.
create table public.profiles (
  id         uuid primary key,
  full_name  text,
  role       text check (role in ('NC','RC')),
  chapter_id uuid references public.chapters(id)
);

create table public.pending_signups (
  id         uuid primary key,
  email      text,
  full_name  text,
  created_at timestamptz default now()
);

create table public.programs (
  id                uuid primary key default gen_random_uuid(),
  title             text,
  chapter_id        uuid references public.chapters(id),
  type              text,
  date              date,
  students          int default 0,
  school            text,
  objectives        text,
  budget            numeric default 0,
  spent             numeric default 0,
  safeguarding_lead text,
  facilitators      text,
  status            text default 'Pending',
  nc_comment        text,
  submitted_by      uuid,
  created_at        timestamptz default now()
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid unique references public.programs(id) on delete cascade,
  report_date date,
  created_at  timestamptz default now()
);

create table public.prayer_parts    (id uuid primary key default gen_random_uuid(), title text);
create table public.prayer_chapters (id uuid primary key default gen_random_uuid(), title text);

create table storage.buckets (
  id     text primary key,
  name   text,
  public boolean default false
);

create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text
);

insert into storage.buckets (id, name, public) values ('prayer-manual', 'prayer-manual', true);

-- Supabase grants broadly by default; the scripts narrow it from there.
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema public  to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant all on all tables in schema auth    to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- Seed data
insert into public.chapters (name) values ('Benin'), ('Auchi'), ('Ondo'), ('Osun'), ('Lagos');

-- ------------------------------------------------------------
-- The exact starting state reported by the live database, so the
-- lockdown script is tested against what it will really meet,
-- including whether its DROP statements match the real names.
-- ------------------------------------------------------------
alter table public.chapters        enable row level security;
alter table public.pending_signups enable row level security;
alter table public.profiles        enable row level security;
alter table public.programs        enable row level security;
alter table public.reports         enable row level security;

create policy "Anyone can read chapters" on public.chapters
  for select using (true);

create policy "nc delete" on public.pending_signups
  for delete using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'NC'));
create policy "nc select all" on public.pending_signups
  for select using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'NC'));
create policy "self insert" on public.pending_signups
  for insert with check (auth.uid() = id);
create policy "self select" on public.pending_signups
  for select using (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Users can read all profiles" on public.profiles
  for select using (true);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "nc insert profiles for others" on public.profiles
  for insert with check (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.role = 'NC'));

create policy "Authenticated users can insert programs" on public.programs
  for insert with check (true);
create policy "Authenticated users can read programs" on public.programs
  for select using (true);
create policy "Authenticated users can update programs" on public.programs
  for update using (true);

create policy "Authenticated users can insert reports" on public.reports
  for insert with check (true);
create policy "Authenticated users can read reports" on public.reports
  for select using (true);
