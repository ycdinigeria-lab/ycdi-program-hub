#!/bin/bash
# BATCH22-MARKER dp-register
# Proves the data protection register from the database side:
#   - the SEC seat, the NC and admins can log and update requests and
#     breaches; an RC and a plain team member cannot see or touch either
#   - the 30-day request clock is generated, and immediate for a consent
#     withdrawal
#   - a filed breach cannot be deleted by the SEC seat (retention); only
#     an admin may delete
#   - the attention lists surface what is overdue
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin team member — will hold SEC

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

echo "Batch 22 — data protection register"

# Clean slate for repeat runs.
raw "delete from public.data_subject_requests where subject_name like 'B22 %';" >/dev/null
raw "delete from public.data_breaches where nature like 'B22 %';" >/dev/null
raw "select public.set_portfolio('$TM','SEC',true);" >/dev/null

# --- who may write ------------------------------------------------------
run ALLOW "$TM" "SEC logs a subject access request" \
  "insert into public.data_subject_requests(subject_name,request_type,channel) values ('B22 Chidi','access','written');"
run ALLOW "$NC" "NC logs a breach" \
  "insert into public.data_breaches(nature,high_risk) values ('B22 laptop lost',true);"
run DENY "$RC" "an RC cannot log a request" \
  "insert into public.data_subject_requests(subject_name,request_type) values ('B22 Ada','access');"

# --- the 30-day clock is generated -------------------------------------
raw "insert into public.data_subject_requests(subject_name,request_type,received_on) values ('B22 clocktest','access','2026-03-01');" >/dev/null
want "access request due 30 days on" "2026-03-31" \
  "$(raw "select due_on from public.data_subject_requests where subject_name='B22 clocktest';")"
raw "insert into public.data_subject_requests(subject_name,request_type,received_on) values ('B22 withdraw','withdraw_consent','2026-03-01');" >/dev/null
want "consent withdrawal is immediate" "2026-03-01" \
  "$(raw "select due_on from public.data_subject_requests where subject_name='B22 withdraw';")"

# --- reference is stamped ----------------------------------------------
want "request got a DSR reference" "true" \
  "$(raw "select (reference like 'DSR-%')::text from public.data_subject_requests where subject_name='B22 clocktest';")"

# --- retention: SEC updates but cannot delete a breach -----------------
raw "insert into public.data_breaches(nature,report_filed) values ('B22 keep me',true);" >/dev/null
run ALLOW "$TM" "SEC updates a breach (records the fix)" \
  "update public.data_breaches set remedial_action='reset passwords' where nature='B22 keep me';"
run DENY  "$TM" "SEC cannot delete a filed breach" \
  "delete from public.data_breaches where nature='B22 keep me';"
run ALLOW "$ADMIN" "admin may delete a mis-entered breach" \
  "delete from public.data_breaches where nature='B22 keep me';"

# --- read walls ---------------------------------------------------------
want "SEC sees the register" "true" "$(as "$TM" "select (count(*) > 0)::text from public.data_subject_requests;")"
want "RC sees no requests"   "0" "$(as "$RC" "select count(*) from public.data_subject_requests;")"
want "RC sees no breaches"   "0" "$(as "$RC" "select count(*) from public.data_breaches;")"

# --- attention lists work ----------------------------------------------
raw "insert into public.data_subject_requests(subject_name,request_type,received_on,status) values ('B22 overdue','access','2026-01-01','received');" >/dev/null
want "overdue request shows negative days_left" "true" \
  "$(as "$TM" "select (days_left < 0)::text from public.dsr_needing_action() where subject_name='B22 overdue';")"

# --- remove the seat: plain TM is shut out -----------------------------
raw "select public.set_portfolio('$TM','SEC',false);" >/dev/null
want "plain TM sees no requests" "0" "$(as "$TM" "select count(*) from public.data_subject_requests;")"
run DENY "$TM" "plain TM cannot log a request" \
  "insert into public.data_subject_requests(subject_name,request_type) values ('B22 Nope','access');"
want "plain TM pulse is empty" "" "$(as "$TM" "select open_requests from public.dp_pulse();")"

# tidy
raw "delete from public.data_subject_requests where subject_name like 'B22 %';" >/dev/null
raw "delete from public.data_breaches where nature like 'B22 %';" >/dev/null

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
