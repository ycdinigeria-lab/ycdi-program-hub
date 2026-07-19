#!/bin/bash
# Batch 5. The funder and Board KPI export.
#
# BATCH5-MARKER harness-tests
#
# The one test that matters more than the rest is the deduplication rule.
# YCDI-PROG-002 says a student who attends three sessions is ONE
# beneficiary for the year. This suite seeds exactly that situation and
# checks the number that comes back is people and not attendance rows,
# because getting it wrong inflates every figure YCDI hands a funder and
# nobody would notice from looking at the screen.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444

pass=0; fail=0

as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
sql() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1
}
want() {
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1))
  else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi
}
run() {
  local expect="$1" uid="$2" desc="$3" stmt="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $stmt\"" 2>&1)
  rc=$?
  # Row rules hide rows instead of erroring, so a statement that changed
  # nothing is a refusal. "INSERT 0 1" is a SUCCESS, the zero is an oid.
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
AUCHI="(select id from chapters where name='Auchi')"
Q1F=2026-01-01; Q1T=2026-03-31
YRF=2026-01-01; YRT=2026-12-31

echo "=============================================="
echo " Batch 5: KPI exports"
echo "=============================================="

# --------------------------------------------------------------
# Seed. Superuser, so row rules are out of the way while we set up.
# --------------------------------------------------------------
# The suite writes 2027 and 2028 targets to test who is allowed to. Clear
# them first, or a second run fails on the primary key and looks like a
# permission fault when it is only leftovers.
sql "delete from kpi_targets where financial_year in (2027, 2028);" >/dev/null
sql "delete from participant_attendance;" >/dev/null
sql "delete from participants;" >/dev/null
sql "delete from safeguarding_incidents;" >/dev/null
sql "delete from reports;" >/dev/null
sql "delete from programs;" >/dev/null

# Four completed Benin programmes and one completed Auchi one. Note the
# two spellings of the same school, which must fold to one.
# The Pending programme must not appear anywhere: it never ran.
sql "insert into programs (id, title, chapter_id, status, date, school, budget, students, submitted_by) values
 ('bbbbbbb5-0000-0000-0000-000000000001','Benin Jan',  $BENIN,'Complete','2026-01-15','Ogbomoso Grammar School',100000,50,'$RC'),
 ('bbbbbbb5-0000-0000-0000-000000000002','Benin Feb',  $BENIN,'Complete','2026-02-20','  ogbomoso grammar school ',100000,50,'$RC'),
 ('bbbbbbb5-0000-0000-0000-000000000003','Benin Mar',  $BENIN,'Complete','2026-03-10','Ilesha High School',100000,50,'$RC'),
 ('bbbbbbb5-0000-0000-0000-000000000004','Benin Apr',  $BENIN,'Complete','2026-04-05','Ilesha High School',100000,50,'$RC'),
 ('bbbbbbb5-0000-0000-0000-000000000005','Benin never',$BENIN,'Pending', '2026-03-15','Never Ran School',999999,50,'$RC'),
 ('bbbbbbb5-0000-0000-0000-000000000006','Auchi Feb',  $AUCHI,'Complete','2026-02-01','Auchi Model School',50000,50,'$NC');" >/dev/null

# Reports. Two carry feedback forms, two carry none at all (null, not zero).
sql "insert into reports (program_id, report_date, attendance, actual_expenditure, feedback_forms_returned, feedback_positive) values
 ('bbbbbbb5-0000-0000-0000-000000000001','2026-01-16',60,90000,20,18),
 ('bbbbbbb5-0000-0000-0000-000000000002','2026-02-21',50,80000,null,null),
 ('bbbbbbb5-0000-0000-0000-000000000003','2026-03-11',40,70000,10,5),
 ('bbbbbbb5-0000-0000-0000-000000000006','2026-02-02',30,20000,null,null);" >/dev/null

# Three young people. S1 is the whole point of this suite: she comes to
# three separate programmes inside Q1.
sql "insert into participants (id, chapter_id, full_name, gender, age_band, consent_on, first_contact_on) values
 ('cccccccc-0000-0000-0000-000000000001',$BENIN,'Sade Repeat','Female','13-15','2026-01-10','2026-01-10'),
 ('cccccccc-0000-0000-0000-000000000002',$BENIN,'Bola Once','Female','16-17','2026-01-10','2026-01-10'),
 ('cccccccc-0000-0000-0000-000000000003',$BENIN,'Chidi Later','Male','16-17','2026-01-10','2026-01-10'),
 ('cccccccc-0000-0000-0000-000000000004',$AUCHI,'Ese Auchi','Female','13-15','2026-01-10','2026-01-10');" >/dev/null

sql "insert into participant_attendance (participant_id, program_id, attended_on) values
 ('cccccccc-0000-0000-0000-000000000001','bbbbbbb5-0000-0000-0000-000000000001','2026-01-15'),
 ('cccccccc-0000-0000-0000-000000000001','bbbbbbb5-0000-0000-0000-000000000002','2026-02-20'),
 ('cccccccc-0000-0000-0000-000000000001','bbbbbbb5-0000-0000-0000-000000000003','2026-03-10'),
 ('cccccccc-0000-0000-0000-000000000002','bbbbbbb5-0000-0000-0000-000000000001','2026-01-15'),
 ('cccccccc-0000-0000-0000-000000000003','bbbbbbb5-0000-0000-0000-000000000004','2026-04-05'),
 ('cccccccc-0000-0000-0000-000000000004','bbbbbbb5-0000-0000-0000-000000000006','2026-02-01');" >/dev/null

# Safeguarding. One closed on day 30, one on day 31, one still open.
sql "insert into safeguarding_incidents (chapter_id, scenario, occurred_on, reported_on, reported_by, account, status, closed_at) values
 ($BENIN,'observation','2026-01-04','2026-01-05','$RC','Closed on day thirty','Closed','2026-02-04'),
 ($BENIN,'observation','2026-01-04','2026-01-05','$RC','Closed on day thirty-one','Closed','2026-02-05'),
 ($BENIN,'observation','2026-01-31','2026-02-01','$RC','Still open','Open',null);" >/dev/null

v() { as "$NC" "select coalesce(value::text,'NULL') from kpi_snapshot('$1','$2') where kpi_key='$3';"; }

echo
echo "-- The deduplication rule (YCDI-PROG-002) ---------------"
want "Q1 beneficiaries counts PEOPLE, not attendance rows" "3" "$(v $Q1F $Q1T student_beneficiaries)"
want "there really are 5 attendance rows behind those 3 people" "5" \
     "$(sql "select count(*) from participant_attendance pa where pa.attended_on between '$Q1F' and '$Q1T';")"
want "one student at three programmes is one beneficiary" "1" \
     "$(sql "select count(distinct participant_id) from participant_attendance where participant_id='cccccccc-0000-0000-0000-000000000001' and attended_on between '$Q1F' and '$Q1T';")"
want "full year picks up the Q2 student too" "4" "$(v $YRF $YRT student_beneficiaries)"

echo
echo "-- Headcount is kept separate and is not the KPI --------"
want "Q1 headcount is seats, so much larger" "180" "$(v $Q1F $Q1T attendance_headcount)"
want "headcount is flagged as secondary, never a KPI line" "secondary" \
     "$(as "$NC" "select status from kpi_snapshot('$Q1F','$Q1T') where kpi_key='attendance_headcount';")"
want "the two figures genuinely differ (180 vs 3)" "different" \
     "$(as "$NC" "select case when (select value from kpi_snapshot('$Q1F','$Q1T') where kpi_key='attendance_headcount') = (select value from kpi_snapshot('$Q1F','$Q1T') where kpi_key='student_beneficiaries') then 'same' else 'different' end;")"

echo
echo "-- Schools reached -------------------------------------"
want "Q1 schools folds spelling and spacing to 3" "3" "$(v $Q1F $Q1T schools_reached)"
want "the Pending programme's school is not counted" "0" \
     "$(as "$NC" "select count(*) from programs where school='Never Ran School' and status='Complete';")"
want "full year adds no new school (Apr repeats Ilesha)" "3" "$(v $YRF $YRT schools_reached)"

echo
echo "-- Activities conducted --------------------------------"
want "Q1 counts only completed programmes" "4" "$(v $Q1F $Q1T activities_conducted)"
want "full year counts five" "5" "$(v $YRF $YRT activities_conducted)"

echo
echo "-- Date range boundaries are inclusive -----------------"
want "a programme on the first day of the range is in" "1" \
     "$(v 2026-01-15 2026-01-15 activities_conducted)"
want "a programme on the last day of the range is in" "1" \
     "$(v 2026-01-01 2026-01-15 activities_conducted)"
want "the day before the range excludes it" "0" \
     "$(v 2026-01-01 2026-01-14 activities_conducted)"
# Attendance needs its own boundary check. Two students attended on
# 15 January, so a range ending exactly that day must still include them.
# Without this, a range that quietly excluded its own last day would go
# unnoticed and undercount every quarter.
want "attendance on the final day of the range is counted" "2" \
     "$(v 2026-01-01 2026-01-15 student_beneficiaries)"
want "attendance on the first day of the range is counted" "2" \
     "$(v 2026-01-15 2026-01-15 student_beneficiaries)"
want "the day before that attendance excludes it" "0" \
     "$(v 2026-01-01 2026-01-14 student_beneficiaries)"

echo
echo "-- Participant satisfaction ----------------------------"
# (18+5) positive out of (20+10) returned = 76.7%. The two programmes with
# no forms handed out are left out entirely rather than dragged in as zeros.
want "Q1 satisfaction is 76.7, not diluted by the no-form nights" "76.7" "$(v $Q1F $Q1T participant_satisfaction)"
want "numerator is the positive replies only" "23" \
     "$(as "$NC" "select numerator::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='participant_satisfaction';")"
want "denominator is only the forms actually returned" "30" \
     "$(as "$NC" "select denominator::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='participant_satisfaction';")"
# Prove the point: counted as zeros it would read far lower.
want "counting no-form nights as zero would have read 46.0" "46.0" \
     "$(sql "select round(100.0*23/50,1);")"
want "a period with no feedback at all returns null, not zero" "NULL" \
     "$(v 2026-06-01 2026-06-30 participant_satisfaction)"
# If a coordinator types 0 rather than leaving it blank, that programme
# must still not drag the chapter down. Belt and braces: the app writes
# null, the query filters, and sum() ignores nulls anyway.
sql "update reports set feedback_forms_returned = 0, feedback_positive = 0
      where program_id = 'bbbbbbb5-0000-0000-0000-000000000002';" >/dev/null
want "a zero-form report does not move the score" "76.7" "$(v $Q1F $Q1T participant_satisfaction)"
sql "update reports set feedback_forms_returned = null, feedback_positive = null
      where program_id = 'bbbbbbb5-0000-0000-0000-000000000002';" >/dev/null

echo
echo "-- Safeguarding resolution -----------------------------"
want "closed on day 30 counts, day 31 does not, open counts against" "33.3" "$(v $Q1F $Q1T safeguarding_resolution)"
want "denominator is incidents REPORTED, not incidents closed" "3" \
     "$(as "$NC" "select denominator::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='safeguarding_resolution';")"
want "no incidents reported gives null, not a flattering 100" "NULL" \
     "$(v 2026-06-01 2026-06-30 safeguarding_resolution)"
want "the still-open incident shows on the overdue line" "1" "$(v $Q1F $Q1T safeguarding_overdue)"
# Assert the numerator too, not just the percentage it produces. A fault
# in the 30-day rule shows up here first, and a percentage on its own can
# hide one.
want "exactly one incident met the 30-day rule" "1" \
     "$(as "$NC" "select numerator::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='safeguarding_resolution';")"
want "the day-31 closure is not in the numerator" "2" \
     "$(sql "select count(*) from safeguarding_incidents where status='Closed';")"

echo
echo "-- Budget utilisation ----------------------------------"
# 260,000 spent against 350,000 budgeted on completed Q1 programmes.
want "Q1 utilisation is 74.3" "74.3" "$(v $Q1F $Q1T budget_utilisation)"
want "spend is read from the report, not from programs.spent" "260000" \
     "$(as "$NC" "select numerator::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='budget_utilisation';")"
want "the Pending programme's 999,999 budget is excluded" "350000" \
     "$(as "$NC" "select denominator::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='budget_utilisation';")"
want "utilisation is flagged partial, never presented as the full rate" "partial" \
     "$(as "$NC" "select status from kpi_snapshot('$Q1F','$Q1T') where kpi_key='budget_utilisation';")"

echo
echo "-- The gaps are declared, not invented -----------------"
want "exactly three KPIs come back not_captured" "3" \
     "$(as "$NC" "select count(*) from kpi_snapshot('$Q1F','$Q1T') where status='not_captured';")"
want "every not_captured line has a null value" "0" \
     "$(as "$NC" "select count(*) from kpi_snapshot('$Q1F','$Q1T') where status='not_captured' and value is not null;")"
want "volunteer active rate is one of them" "not_captured" \
     "$(as "$NC" "select status from kpi_snapshot('$Q1F','$Q1T') where kpi_key='volunteer_active_rate';")"
want "volunteer retention is another" "not_captured" \
     "$(as "$NC" "select status from kpi_snapshot('$Q1F','$Q1T') where kpi_key='volunteer_retention';")"
want "the snapshot returns all thirteen lines" "13" \
     "$(as "$NC" "select count(*) from kpi_snapshot('$Q1F','$Q1T');")"
want "every line carries a note explaining itself" "0" \
     "$(as "$NC" "select count(*) from kpi_snapshot('$Q1F','$Q1T') where coalesce(note,'')='';")"

echo
echo "-- Row security: what is shared and what is not --------"
# Programme and report rows have been readable by every signed-in person
# since an earlier batch (policy qual is literally `true`). So the
# programme-derived KPIs read the same for everyone, by existing design.
# Participant rows are NOT: they are restricted by chapter. That is the
# line that carries children's data, and it is the one that has to hold.
want "NC sees all three Q1 schools" "3" "$(v $Q1F $Q1T schools_reached)"
want "RC sees the same schools, because programmes are national" "3" \
     "$(as "$RC" "select value::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='schools_reached';")"
want "RC sees the same activity count, same reason" "4" \
     "$(as "$RC" "select value::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='activities_conducted';")"

# The one that matters.
want "NC counts beneficiaries across both chapters" "3" "$(v $Q1F $Q1T student_beneficiaries)"
want "Benin RC counts only Benin's children, not Auchi's" "2" \
     "$(as "$RC" "select value::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='student_beneficiaries';")"
want "team member is shown no beneficiaries at all" "0" \
     "$(as "$TM" "select value::text from kpi_snapshot('$Q1F','$Q1T') where kpi_key='student_beneficiaries';")"
want "Benin RC sees no beneficiaries on Auchi's breakdown row" "0" \
     "$(as "$RC" "select beneficiaries::text from kpi_chapter_breakdown('$Q1F','$Q1T') where chapter_name='Auchi';")"
want "NC does see Auchi's beneficiary on the breakdown" "1" \
     "$(as "$NC" "select beneficiaries::text from kpi_chapter_breakdown('$Q1F','$Q1T') where chapter_name='Auchi';")"

echo "-- Targets are a national decision ---------------------"
run ALLOW "$NC"  "NC reads the targets"        "select count(*) from kpi_targets;"
run ALLOW "$RC"  "RC reads the targets"        "select count(*) from kpi_targets;"
run DENY  "$RC"  "RC sets a target"            "insert into kpi_targets (financial_year, kpi_key, annual_target) values (2027,'schools_reached',99);"
run DENY  "$TM"  "team member sets a target"   "insert into kpi_targets (financial_year, kpi_key, annual_target) values (2027,'schools_reached',99);"
run ALLOW "$NC"  "NC sets a target"            "insert into kpi_targets (financial_year, kpi_key, annual_target) values (2027,'schools_reached',12);"
run DENY  "$RC"  "RC lowers the NC's target"   "update kpi_targets set annual_target = 1 where financial_year=2027 and kpi_key='schools_reached';"
run ALLOW "$NC"  "NC edits their own target"   "update kpi_targets set annual_target = 14 where financial_year=2027 and kpi_key='schools_reached';"
run DENY  "$RC"  "RC deletes a target"         "delete from kpi_targets where financial_year=2027;"
run ALLOW "$ADMIN" "admin sets a target"       "insert into kpi_targets (financial_year, kpi_key, annual_target) values (2028,'schools_reached',15);"
want "the policy targets were seeded for 2026" "6" \
     "$(sql "select count(*) from kpi_targets where financial_year=2026;")"
want "satisfaction target came from the policy, not a guess" "80" \
     "$(sql "select annual_target::text from kpi_targets where financial_year=2026 and kpi_key='participant_satisfaction';")"
want "safeguarding target is 100, as the policy states" "100" \
     "$(sql "select annual_target::text from kpi_targets where financial_year=2026 and kpi_key='safeguarding_resolution';")"

echo
echo "-- Chapter opening dates ------------------------------"
want "opened_on exists and starts empty for existing chapters" "0" \
     "$(sql "select count(*) from chapters where opened_on is not null;")"
want "so new chapters opened reads zero rather than guessing" "0" "$(v $YRF $YRT chapters_opened)"

echo
echo "=============================================="
echo " passed $pass, failed $fail"
echo "=============================================="
[ $fail -eq 0 ]
