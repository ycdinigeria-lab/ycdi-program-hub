#!/bin/bash
# BATCH21-MARKER sec-access
# Proves the SEC seat grant from the database side:
#   - a plain team member who holds SEC can manage the ordinary document
#     library and read the audit log
#   - the same seat is walled from the National-Coordinator-only folder:
#     it cannot see, create in, edit, delete from, or drop the nc_only
#     "Governance and Legal" category
#   - the same person without the seat is shut out of all of it
#   - the seat changes nothing about the person's own role
#
# Categories are looked up by name, since the Stage 3 seed gives them
# random ids. The ordinary category used is "Operational Documents"
# (nc_only = false) and the walled one is "Governance and Legal"
# (nc_only = true), both seeded by stage3-documents.sql.
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin team member — will hold SEC

OPEN_CAT="(select id from public.document_categories where name='Operational Documents' limit 1)"
GOV_CAT="(select id from public.document_categories where name='Governance and Legal' limit 1)"

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2 got $3"; fail=$((fail+1)); fi; }
run(){ # expect uid desc sql
  local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid='$2'; $4\"" 2>&1); rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$1" = DENY ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $3"; pass=$((pass+1)); else echo "  XX   ALLOWED but should refuse: $3"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $3"; pass=$((pass+1)); else echo "  XX   REFUSED but should allow: $3"; echo "$out"|grep -i error|head -1|sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

echo "Batch 21 — SEC seat access"

# Clean slate for repeat runs.
raw "delete from public.documents where title like 'B21 %';" >/dev/null

# Resolve the nc_only category id as owner (past RLS). Passing it as a
# literal below means the insert-DENY tests the write-guard itself, not
# merely SEC's inability to see the category. This is the case that
# matters: a seat-holder who already knows the governance folder's id.
GOV_ID=$(raw "select id from public.document_categories where name='Governance and Legal' limit 1;")

# Give Tobi (a plain TM) the SEC seat.
raw "select public.set_portfolio('$TM','SEC',true);" >/dev/null

# --- with the seat: the ordinary library opens --------------------------
run ALLOW "$TM" "SEC creates a document in an ordinary category" \
  "insert into public.documents(category_id,title,file_path) values ($OPEN_CAT,'B21 guide','files/b21.pdf');"
run ALLOW "$TM" "SEC creates an ordinary category" \
  "insert into public.document_categories(name,nc_only) values ('B21 Templates',false);"
run ALLOW "$TM" "SEC reads the audit log" "select 1 from public.audit_log limit 1;"
run ALLOW "$TM" "SEC writes to the documents bucket" \
  "insert into storage.objects(bucket_id,name) values ('hub-documents','files/b21x.pdf');"

# --- with the seat: the governance folder stays shut --------------------
run DENY "$TM" "SEC cannot create a document in the nc_only folder (id known)" \
  "insert into public.documents(category_id,title,file_path) values ('$GOV_ID','B21 board','files/b21b.pdf');"
run DENY "$TM" "SEC cannot create an nc_only category" \
  "insert into public.document_categories(name,nc_only) values ('B21 Secret',true);"
run DENY "$TM" "SEC cannot delete the nc_only category" \
  "delete from public.document_categories where name='Governance and Legal';"

# Seed a governance document as owner (bypasses RLS) to test update/delete.
raw "insert into public.documents(category_id,title,file_path) values ($GOV_CAT,'B21 governance doc','files/b21g.pdf');" >/dev/null
want "SEC cannot even see a governance document" "0" \
  "$(as "$TM" "select count(*) from public.documents where title='B21 governance doc';")"
run DENY "$TM" "SEC cannot edit a governance document" \
  "update public.documents set title='B21 tampered' where title='B21 governance doc';"
run DENY "$TM" "SEC cannot delete a governance document" \
  "delete from public.documents where title='B21 governance doc';"

# --- the seat grants no role change -------------------------------------
want "SEC holder still reads as TM" "TM" "$(as "$TM" "select public.dir_role();")"

# --- remove the seat: everything closes ---------------------------------
raw "select public.set_portfolio('$TM','SEC',false);" >/dev/null
run DENY "$TM" "plain TM cannot create a document" \
  "insert into public.documents(category_id,title,file_path) values ($OPEN_CAT,'B21 nope','files/n.pdf');"
run DENY "$TM" "plain TM cannot create a category" \
  "insert into public.document_categories(name,nc_only) values ('B21 Nope',false);"
want "plain TM reads no audit rows" "0" "$(as "$TM" "select count(*) from public.audit_log;")"
run DENY "$TM" "plain TM cannot write the documents bucket" \
  "insert into storage.objects(bucket_id,name) values ('hub-documents','files/n2.pdf');"

# Tidy the governance test row.
raw "delete from public.documents where title in ('B21 governance doc','B21 board');" >/dev/null
raw "delete from public.document_categories where name in ('B21 Templates','B21 Secret','B21 Nope');" >/dev/null

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
