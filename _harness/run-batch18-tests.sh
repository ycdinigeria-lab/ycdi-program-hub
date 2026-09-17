#!/bin/bash
# BATCH18-MARKER nec-portfolios
# Proves the NEC portfolio register behaves from the database side:
#   - only an NC or admin can assign a seat
#   - a seat has one holder; assigning it moves it off the previous holder
#   - one person may hold more than one seat
#   - removing a seat leaves it empty and routing falls back to the NC
#   - a plain member cannot forge a seat by writing the table directly
#   - the seat grants no access (a TM with a seat still reads as a TM)
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC (no admin)
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin team member

pass=0; fail=0

as()  { su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1; }
raw() { su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi; }
run() {
  local expect="$1" uid="$2" desc="$3" sql="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1); rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$expect" = "DENY" ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $desc"; pass=$((pass+1)); else echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $desc"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $desc"; pass=$((pass+1)); else echo "  XX   REFUSED BUT SHOULD BE ALLOWED: $desc"; echo "$out" | grep -i error | head -2 | sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

echo "Batch 18 — NEC portfolios"

# Clean slate for repeat runs.
raw "delete from public.nec_portfolios;" >/dev/null

# --- who may assign ----------------------------------------------------
run ALLOW "$NC"    "NC assigns the Deputy seat to Rita"        "select public.set_portfolio('$RC','DNC',true);"
run ALLOW "$ADMIN" "admin assigns the Secretary seat to Tobi" "select public.set_portfolio('$TM','SEC',true);"
run DENY  "$RC"    "an RC cannot assign a seat"                "select public.set_portfolio('$TM','PD',true);"
run DENY  "$TM"    "a TM cannot assign a seat"                 "select public.set_portfolio('$TM','PD',true);"

# --- one holder per seat; assigning moves it ---------------------------
raw "select public.set_portfolio('$RC','PD',true);" >/dev/null   # Rita holds PD
raw "select public.set_portfolio('$TM','PD',true);" >/dev/null   # move PD to Tobi
want "PD has exactly one holder" "1" "$(raw "select count(*) from public.nec_portfolios where portfolio='PD';")"
want "PD moved to Tobi"          "$TM" "$(raw "select profile_id from public.nec_portfolios where portfolio='PD';")"

# --- one person may hold several seats ---------------------------------
raw "select public.set_portfolio('$TM','VC',true);" >/dev/null   # Tobi now holds SEC, PD and VC
want "Tobi holds three seats" "3" "$(raw "select count(*) from public.nec_portfolios where profile_id='$TM';")"

# --- routing and fallback ---------------------------------------------
want "holder(SEC) is Tobi"        "$TM" "$(raw "select public.portfolio_holder('SEC');")"
raw "delete from public.nec_portfolios where portfolio='SEC';" >/dev/null
want "empty SEC routes to an NC"  "$NC" "$(raw "set test.uid='$NC'; select public.portfolio_holder_or_nc('SEC');" | tail -1)"

# --- a member cannot forge a seat by writing the table -----------------
run DENY "$TM" "TM cannot insert a seat row directly"  "insert into public.nec_portfolios(portfolio,profile_id) values ('FIN','$TM');"
run DENY "$TM" "TM cannot delete a seat row directly"  "delete from public.nec_portfolios where portfolio='PD';"

# --- the seat grants nothing ------------------------------------------
want "Tobi with seats still reads as TM" "TM" "$(as "$TM" "select public.dir_role();" | tail -1)"

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
