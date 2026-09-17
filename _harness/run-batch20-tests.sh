#!/bin/bash
# BATCH20-MARKER pd-access
# Proves the PD seat grant from the database side:
#   - a plain team member who holds PD gains national read of participants,
#     the participants gate, and the KPI report
#   - the same person without the seat is shut out of all three
#   - PD does NOT gain participant write (capture stays with chapters)
#   - PD does NOT gain programme approval (stays admin)
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin team member — will hold PD

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2 got $3"; fail=$((fail+1)); fi; }
run(){ # expect uid desc sql
  local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid='$2'; $4\"" 2>&1); rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE|INSERT) 0'; then rc=1; fi
  if [ "$1" = DENY ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $3"; pass=$((pass+1)); else echo "  XX   ALLOWED but should refuse: $3"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $3"; pass=$((pass+1)); else echo "  XX   REFUSED but should allow: $3"; echo "$out"|grep -i error|head -1|sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

echo "Batch 20 — PD seat access"

# Give Tobi (a plain TM) the PD seat.
raw "select public.set_portfolio('$TM','PD',true);" >/dev/null

# --- with the seat: the three reads open --------------------------------
want "PD holder can_see_participants" "t" "$(as "$TM" "select public.can_see_participants();")"
want "PD holder can_read_participant (any chapter)" "t" "$(as "$TM" "select public.can_read_participant(gen_random_uuid());")"
want "PD holder kpi_sees_all" "t" "$(as "$TM" "select public.kpi_sees_all();")"

# --- write and approval stay shut ---------------------------------------
want "PD holder cannot touch participants" "f" "$(as "$TM" "select public.can_touch_participant(gen_random_uuid());")"
run DENY "$TM" "PD holder cannot approve a programme" "select public.approve_program(gen_random_uuid());"

# --- remove the seat: everything closes ---------------------------------
raw "select public.set_portfolio('$TM','PD',false);" >/dev/null
want "plain TM can_see_participants" "f" "$(as "$TM" "select public.can_see_participants();")"
want "plain TM can_read_participant" "f" "$(as "$TM" "select public.can_read_participant(gen_random_uuid());")"
want "plain TM kpi_sees_all" "f" "$(as "$TM" "select public.kpi_sees_all();")"

# --- the seat changes nothing about the person's own role ---------------
raw "select public.set_portfolio('$TM','PD',true);" >/dev/null
want "PD holder still reads as TM" "TM" "$(as "$TM" "select public.dir_role();")"
raw "select public.set_portfolio('$TM','PD',false);" >/dev/null

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
