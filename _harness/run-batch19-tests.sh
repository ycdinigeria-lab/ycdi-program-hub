#!/bin/bash
# BATCH19-MARKER vc-access
# Proves the Volunteer Coordinator seat grants read reach and no handling.
# A VC holder who is otherwise a plain Team Member must be able to see the
# compliance surface and the incident register nationally, but must NOT be
# able to handle an incident (update it or add an action). A Team Member
# with no seat must see none of it.
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin team member -> given VC
BTM2=99999999-9999-9999-9999-999999999999     # a second Benin team member, no seat

pass=0; fail=0
as()  { su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1; }
raw() { su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted [$2] got [$3]"; fail=$((fail+1)); fi; }
run() {
  local expect="$1" uid="$2" desc="$3" sql="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1); rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$expect" = "DENY" ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $desc"; pass=$((pass+1)); else echo "  XX   ALLOWED but should refuse: $desc"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $desc"; pass=$((pass+1)); else echo "  XX   REFUSED but should allow: $desc"; echo "$out"|grep -i error|head -1|sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

echo "Batch 19 — VC access"

# Give Tobi the VC seat; leave the second TM with none.
raw "delete from public.nec_portfolios where portfolio='VC';" >/dev/null
raw "select public.set_portfolio('$TM','VC',true);" >/dev/null   # run as NC/admin context in your harness if set_portfolio guards on it

# --- the compliance surface opens to VC --------------------------------
want "VC can_see_screening"          "t" "$(as "$TM"   "select public.can_see_screening();"        | tail -1)"
want "non-seat TM cannot"            "f" "$(as "$BTM2" "select public.can_see_screening();"        | tail -1)"
run ALLOW "$TM"  "VC reads the compliance dashboard" "select count(*) from public.safeguarding_compliance();"
run ALLOW "$TM"  "VC reads the volunteer register"   "select count(*) from public.volunteer_register();"
run ALLOW "$TM"  "VC reads overdue incidents"        "select count(*) from public.incidents_overdue();"

# --- incident register: VC reads, does not handle ----------------------
run ALLOW "$TM"  "VC reads the incident register"    "select count(*) from public.safeguarding_incidents;"
run ALLOW "$TM"  "VC reads incident actions"         "select count(*) from public.incident_actions;"
# handling stays shut: pick any incident and prove VC cannot touch it
INC=$(raw "select id from public.safeguarding_incidents limit 1;")
if [ -n "$INC" ]; then
  run DENY "$TM" "VC cannot update an incident"      "update public.safeguarding_incidents set status='Closed' where id='$INC';"
  run DENY "$TM" "VC cannot add an incident action"  "insert into public.incident_actions (incident_id, taken_by, note) values ('$INC','$TM','x');"
fi

# --- volunteer records: read yes, write no -----------------------------
run ALLOW "$TM" "VC reads a volunteer record"        "select count(*) from public.volunteer_records;"
run DENY  "$TM" "VC cannot edit a volunteer record"  "update public.volunteer_records set notes='x' where profile_id='$BTM2';"

# --- the non-seat TM stays out -----------------------------------------
want "non-seat TM sees no incidents (RLS)" "0" "$(as "$BTM2" "select count(*) from public.safeguarding_incidents where reported_by <> '$BTM2';" | tail -1)"

# --- clearing the seat closes the door again ---------------------------
raw "select public.set_portfolio('$TM','VC',false);" >/dev/null
want "seat cleared -> screening shut" "f" "$(as "$TM" "select public.can_see_screening();" | tail -1)"

echo ""; echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
