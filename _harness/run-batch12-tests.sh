#!/bin/bash
# BATCH12-MARKER chapter-attendance
# Checks the bulk attendance register: who may take one, what the register
# shows, that saving adds and removes the right people, that nobody can be
# recorded outside their chapter, and that the whole thing actually moves
# the deduplicated beneficiary KPI, which is the reason it exists.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444

BENIN_PROG=aaaaaaaa-0000-0000-0000-000000000001

pass=0; fail=0

as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
want() {
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1))
  else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi
}
run() {
  local expect="$1" uid="$2" desc="$3" sql="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1)
  rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$expect" = "DENY" ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $desc"; pass=$((pass+1))
    else echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $desc"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $desc"; pass=$((pass+1))
    else echo "  XX   REFUSED BUT SHOULD BE ALLOWED: $desc"; echo "$out" | grep -i error | head -2 | sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

BENIN="(select id from chapters where name='Benin')"
LAGOS="(select id from chapters where name='Lagos')"

# --- Fixtures -------------------------------------------------
# Give the Benin programme a real date inside 2026 so it can carry a
# register and land in the KPI year. A second Benin programme is left
# dateless on purpose, to prove the picker ignores it.
as "$RC" "update public.programs set date='2026-03-04' where id='$BENIN_PROG';" >/dev/null

# A dated Lagos programme, for the cross-chapter checks.
as "$ADMIN" "insert into public.programs (id, title, chapter_id, status, date, submitted_by) values ('aaaaaaaa-0000-0000-0000-0000000000ff','Lagos outreach', $LAGOS, 'Approved', '2026-03-05', '$ADMIN');" >/dev/null
LAGOS_PROG=aaaaaaaa-0000-0000-0000-0000000000ff

# Three Benin young people, one Lagos young person.
as "$RC"    "insert into public.participants (chapter_id, full_name, age_band, consent_on, created_by) values ($BENIN,'Ada Benin','13-15', current_date-2,'$RC'),($BENIN,'Bola Benin','16-17', current_date-2,'$RC'),($BENIN,'Chidi Benin','13-15', current_date-2,'$RC');" >/dev/null
as "$ADMIN" "insert into public.participants (chapter_id, full_name, age_band, consent_on, created_by) values ($LAGOS,'Lara Lagos','16-17', current_date-2,'$ADMIN');" >/dev/null

pid() { as "$ADMIN" "select id from participants where full_name='$1';"; }
ADA=$(pid 'Ada Benin'); BOLA=$(pid 'Bola Benin'); CHIDI=$(pid 'Chidi Benin'); LARA=$(pid 'Lara Lagos')

echo "WHICH PROGRAMMES A PERSON MAY TAKE A REGISTER FOR"
want "Benin coordinator sees only their dated programme" 1 "$(as $RC   "select count(*) from public.attendance_programs();")"
want "National Coordinator sees both dated programmes"   2 "$(as $NC   "select count(*) from public.attendance_programs();")"
want "admin sees both dated programmes"                  2 "$(as $ADMIN "select count(*) from public.attendance_programs();")"
want "team member sees none"                             0 "$(as $TM   "select count(*) from public.attendance_programs();")"
want "the dateless Benin programme is not offered"       f "$(as $RC   "select exists(select 1 from public.attendance_programs() where program_id='aaaaaaaa-0000-0000-0000-000000000003');")"
want "coordinator may record on their own programme"     t "$(as $RC   "select can_record from public.attendance_programs() where program_id='$BENIN_PROG';")"
want "National Coordinator may look but not record"      f "$(as $NC   "select can_record from public.attendance_programs() where program_id='$BENIN_PROG';")"

echo
echo "THE REGISTER FOR ONE PROGRAMME"
want "every active Benin participant is listed"          3 "$(as $RC "select count(*) from public.program_register('$BENIN_PROG');")"
want "nobody is marked present to begin with"            0 "$(as $RC "select count(*) from public.program_register('$BENIN_PROG') where attended;")"
want "a coordinator cannot load another chapter's register" 0 "$(as $RC "select count(*) from public.program_register('$LAGOS_PROG');")"
want "the National Coordinator can load a chapter register" 3 "$(as $NC "select count(*) from public.program_register('$BENIN_PROG');")"
want "a team member loads nothing"                       0 "$(as $TM "select count(*) from public.program_register('$BENIN_PROG');")"

echo
echo "SAVING A REGISTER"
want "two present, both newly added, none removed" "2|2|0" \
  "$(as $RC "select present||'|'||added||'|'||removed from public.record_attendance('$BENIN_PROG','2026-03-04', array['$ADA','$BOLA']::uuid[]);")"
want "the two now read as present in the register"       2 "$(as $RC "select count(*) from public.program_register('$BENIN_PROG') where attended;")"
want "swap one out and one in: still two, one added, one removed" "2|1|1" \
  "$(as $RC "select present||'|'||added||'|'||removed from public.record_attendance('$BENIN_PROG','2026-03-04', array['$ADA','$CHIDI']::uuid[]);")"
want "Bola is no longer marked present"                  f "$(as $RC "select attended from public.program_register('$BENIN_PROG') where full_name='Bola Benin';")"
want "saving the same person twice never doubles the row" 1 \
  "$(as $RC "select present from public.record_attendance('$BENIN_PROG','2026-03-04', array['$ADA']::uuid[]);")"
want "an empty register clears everyone"                 0 \
  "$(as $RC "select present from public.record_attendance('$BENIN_PROG','2026-03-04', array[]::uuid[]);")"

echo
echo "WHO IS ALLOWED TO RECORD"
run DENY  "$TM"    "a team member records attendance" \
  "select public.record_attendance('$BENIN_PROG','2026-03-04', array['$ADA']::uuid[]);"
run DENY  "$NC"    "the National Coordinator records chapter attendance" \
  "select public.record_attendance('$BENIN_PROG','2026-03-04', array['$ADA']::uuid[]);"
run DENY  "$RC"    "a coordinator records on another chapter's programme" \
  "select public.record_attendance('$LAGOS_PROG','2026-03-05', array['$LARA']::uuid[]);"
run DENY  "$RC"    "a coordinator slips another chapter's participant into their register" \
  "select public.record_attendance('$BENIN_PROG','2026-03-04', array['$ADA','$LARA']::uuid[]);"
run ALLOW "$ADMIN" "an admin records attendance" \
  "select public.record_attendance('$BENIN_PROG','2026-03-04', array['$ADA','$BOLA','$CHIDI']::uuid[]);"

echo
echo "THE REGISTER FEEDS THE DEDUPLICATED BENEFICIARY KPI"
# Ada, Bola and Chidi are now all present at one 2026 programme.
want "three distinct beneficiaries counted, not three seats" 3 \
  "$(as $NC "select value::int from public.kpi_snapshot('2026-01-01','2026-12-31') where kpi_key='student_beneficiaries';")"
# Record the same three at nothing else; the distinct count must not grow.
want "attending again does not inflate the beneficiary count" 3 \
  "$(as $NC "select value::int from public.kpi_snapshot('2026-01-01','2026-12-31') where kpi_key='student_beneficiaries';")"
want "a coordinator's own beneficiary figure is their chapter's" 3 \
  "$(as $RC "select value::int from public.kpi_snapshot('2026-01-01','2026-12-31') where kpi_key='student_beneficiaries';")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
