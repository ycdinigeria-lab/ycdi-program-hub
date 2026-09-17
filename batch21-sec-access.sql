-- ============================================================
-- YCDI Programme Hub
-- Batch 21: access grant for the National Secretary seat (SEC)
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- BATCH21-MARKER sec-access
--
-- What this is
-- ------------
-- The third seat grant, same shape as Batch 19 (VC) and Batch 20 (PD).
-- Whoever holds the SEC seat (Batch 18) gets the reach the National
-- Secretary's duty needs, and nothing wider. Every change is additive: it
-- adds "or public.holds_portfolio('SEC')" to a filter that already lets an
-- admin (and, for the audit log, the National Coordinator) through. No
-- existing access is removed, and a person holding no seat is unaffected.
--
-- The Secretary's seat is "digital custodianship and data protection".
-- Two existing surfaces map to that, and both are granted here.
--
-- What SEC gets
--   1. The documents library, read and write. The Secretary maintains the
--      folder structure and publishes into it. This is the seat's real
--      day job, and YCDI-LEG-004 2.2 names the Secretary as the keeper of
--      that structure. SEC can create, rename and remove categories, and
--      upload, edit and delete documents.
--   2. The audit log, read. The trail of who changed what is a record, and
--      records are the Secretary's ground. SEC joins the National
--      Coordinator and admins as a reader. It stays read only for
--      everyone; nothing writes to that table by hand.
--
-- What SEC does NOT get, on purpose
--   - the National-Coordinator-only document folder. The "Governance and
--     Legal" category is marked nc_only: constitution, board records,
--     registration papers. It is invisible to everyone but the NC, and it
--     stays that way. SEC's write clauses below are guarded so the seat
--     can manage every ordinary category but cannot see, edit, or drop
--     the nc_only one, nor flip an ordinary category into nc_only. If you
--     decide the Secretary should hold the governance folder too, that is
--     a deliberate change to make on its own, not a side effect of this.
--   - anything in the audit log beyond reading it. It is append-only for
--     everyone, SEC included. The log already holds no safeguarding case
--     content by design (Batch 6b), so SEC reading it sees that an
--     incident moved and who moved it, never the case itself, which is
--     the same limited view an admin already has.
--
-- The data-protection register (records of processing, data-subject
-- requests, breach reports, retention schedule) is a separate, new build,
-- not part of this grant. There is no table to gate yet, so there is
-- nothing to widen here. That batch comes next, on its own.
--
-- Additive throughout. It redefines nine policies, each carrying its
-- original logic plus the one SEC clause. It creates no table.
-- ============================================================

-- ---- 1. document categories: write for SEC, minus the nc_only folder ---
-- The guard "nc_only = false" keeps the governance folder out of SEC's
-- reach on every write. On insert and on the new row of an update it also
-- stops SEC minting or converting a category into nc_only.
drop policy if exists doccat_insert on public.document_categories;
create policy doccat_insert on public.document_categories
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.holds_portfolio('SEC') and nc_only = false)
  );

drop policy if exists doccat_update on public.document_categories;
create policy doccat_update on public.document_categories
  for update to authenticated
  using (
    public.is_admin()
    or (public.holds_portfolio('SEC') and nc_only = false)
  )
  with check (
    public.is_admin()
    or (public.holds_portfolio('SEC') and nc_only = false)
  );

drop policy if exists doccat_delete on public.document_categories;
create policy doccat_delete on public.document_categories
  for delete to authenticated
  using (
    public.is_admin()
    or (public.holds_portfolio('SEC') and nc_only = false)
  );

-- doccat_read is left untouched: an nc_only category is still visible only
-- to the National Coordinator, so SEC never even sees the governance
-- folder to act on it. The write guard above is the second lock.

-- ---- 2. documents: write for SEC, gated by the parent category ---------
-- A document's sensitivity comes from its category, so each SEC clause
-- checks the parent is not nc_only. On update the check runs on both the
-- old and the new category_id, so SEC cannot move a document into the
-- governance folder either.
drop policy if exists doc_insert on public.documents;
create policy doc_insert on public.documents
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.holds_portfolio('SEC')
      and exists (
        select 1 from public.document_categories c
        where c.id = documents.category_id and c.nc_only = false
      )
    )
  );

drop policy if exists doc_update on public.documents;
create policy doc_update on public.documents
  for update to authenticated
  using (
    public.is_admin()
    or (
      public.holds_portfolio('SEC')
      and exists (
        select 1 from public.document_categories c
        where c.id = documents.category_id and c.nc_only = false
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.holds_portfolio('SEC')
      and exists (
        select 1 from public.document_categories c
        where c.id = documents.category_id and c.nc_only = false
      )
    )
  );

drop policy if exists doc_delete on public.documents;
create policy doc_delete on public.documents
  for delete to authenticated
  using (
    public.is_admin()
    or (
      public.holds_portfolio('SEC')
      and exists (
        select 1 from public.document_categories c
        where c.id = documents.category_id and c.nc_only = false
      )
    )
  );

-- ---- 3. the storage bucket: write for SEC ------------------------------
-- Storage objects carry no category link the policy can read, so the
-- nc_only wall cannot be enforced here at the row level. It does not need
-- to be: SEC cannot see an nc_only document row (section 2 and the read
-- policy), so it never learns the storage path of a governance file
-- through the app. The wall holds one layer up. What this grants is the
-- ability to upload and replace the files behind ordinary documents,
-- which the seat needs to publish them.
drop policy if exists hub_documents_insert on storage.objects;
create policy hub_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hub-documents'
    and (public.is_admin() or public.holds_portfolio('SEC'))
  );

drop policy if exists hub_documents_update on storage.objects;
create policy hub_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'hub-documents'
    and (public.is_admin() or public.holds_portfolio('SEC'))
  );

drop policy if exists hub_documents_delete on storage.objects;
create policy hub_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hub-documents'
    and (public.is_admin() or public.holds_portfolio('SEC'))
  );

-- ---- 4. the audit log: read for SEC ------------------------------------
-- Adds SEC to the reader set. No insert, update or delete policy is
-- touched: the log stays append-only, written only by the Batch 6b
-- triggers running as the table owner.
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select to authenticated
  using (
    public.is_admin()
    or public.dir_role() = 'NC'
    or public.holds_portfolio('SEC')
  );

-- ============================================================
-- End of Batch 21.
-- ============================================================
