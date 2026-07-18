-- ============================================================
-- YCDI Programme Hub - Stage 3 addition
-- Paste this into Supabase > SQL Editor and click Run.
--
-- This adds:
--   document_categories  - the groups documents sit under
--   documents            - the documents themselves
--   hub-documents        - a private storage bucket for the files
--
-- Rules that get enforced:
--   * Everyone signed in sees normal categories and their documents.
--   * A category marked nc_only is invisible to everyone except the
--     National Coordinator, and so is everything inside it.
--   * Only the National Coordinator can create, rename or delete
--     categories, or upload and remove documents.
--   * Deleting a category deletes its documents with it.
--
-- Safe to run more than once.
-- ============================================================

-- Re-declare the helper so this file stands on its own.
create or replace function public.dir_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 1. Tables ---------------------------------------------------
create table if not exists public.document_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  nc_only     boolean not null default false,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.document_categories(id) on delete cascade,
  title       text not null,
  description text,
  file_path   text not null,
  file_name   text,
  file_size   bigint,
  file_type   text,
  cover_path  text,
  created_by  uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists documents_category_idx on public.documents(category_id);

-- 2. Category permissions -------------------------------------
alter table public.document_categories enable row level security;

drop policy if exists doccat_read   on public.document_categories;
drop policy if exists doccat_insert on public.document_categories;
drop policy if exists doccat_update on public.document_categories;
drop policy if exists doccat_delete on public.document_categories;

create policy doccat_read on public.document_categories
  for select to authenticated using (
    nc_only = false or public.dir_role() = 'NC'
  );

create policy doccat_insert on public.document_categories
  for insert to authenticated with check (public.dir_role() = 'NC');

create policy doccat_update on public.document_categories
  for update to authenticated using (public.dir_role() = 'NC')
  with check (public.dir_role() = 'NC');

create policy doccat_delete on public.document_categories
  for delete to authenticated using (public.dir_role() = 'NC');

-- 3. Document permissions -------------------------------------
-- A document is readable only if its category is readable. The subquery
-- runs under the reader's own permissions, so a restricted category
-- simply isn't there for them and neither is anything inside it.
alter table public.documents enable row level security;

drop policy if exists doc_read   on public.documents;
drop policy if exists doc_insert on public.documents;
drop policy if exists doc_update on public.documents;
drop policy if exists doc_delete on public.documents;

create policy doc_read on public.documents
  for select to authenticated using (
    exists (
      select 1 from public.document_categories c
      where c.id = documents.category_id
        and (c.nc_only = false or public.dir_role() = 'NC')
    )
  );

create policy doc_insert on public.documents
  for insert to authenticated with check (public.dir_role() = 'NC');

create policy doc_update on public.documents
  for update to authenticated using (public.dir_role() = 'NC')
  with check (public.dir_role() = 'NC');

create policy doc_delete on public.documents
  for delete to authenticated using (public.dir_role() = 'NC');

-- 4. Storage bucket -------------------------------------------
-- Private, same as prayer-manual and member-photos. The app hands out
-- one-hour signed links rather than public URLs.
insert into storage.buckets (id, name, public)
values ('hub-documents', 'hub-documents', false)
on conflict (id) do nothing;

update storage.buckets set public = false where id = 'hub-documents';

drop policy if exists hub_documents_read   on storage.objects;
drop policy if exists hub_documents_insert on storage.objects;
drop policy if exists hub_documents_update on storage.objects;
drop policy if exists hub_documents_delete on storage.objects;

create policy hub_documents_read on storage.objects
  for select to authenticated using (bucket_id = 'hub-documents');

create policy hub_documents_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'hub-documents' and public.dir_role() = 'NC'
  );

create policy hub_documents_update on storage.objects
  for update to authenticated using (
    bucket_id = 'hub-documents' and public.dir_role() = 'NC'
  );

create policy hub_documents_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'hub-documents' and public.dir_role() = 'NC'
  );

-- 5. Seed the three categories already agreed ------------------
-- Only inserts if a category of that name isn't already there, so
-- re-running this won't create duplicates.
insert into public.document_categories (name, description, nc_only, sort_order)
select v.name, v.description, v.nc_only, v.sort_order
from (values
  ('Spiritual Growth Resources', 'Devotionals, study guides and prayer material.', false, 10),
  ('Operational Documents',      'Templates, forms and guides for running chapter work.', false, 20),
  ('Governance and Legal',       'Constitution, registration papers and board records.', true, 30)
) as v(name, description, nc_only, sort_order)
where not exists (
  select 1 from public.document_categories c where c.name = v.name
);

-- Want more categories seeded? Add lines to the block above in the same
-- shape, or just create them inside the app under More > Documents >
-- Categories. Both do the same thing.

-- Done.
