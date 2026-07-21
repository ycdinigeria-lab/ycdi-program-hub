#!/bin/bash
# Batch 5b. The KPI report is scoped to the coordinator's own chapter.
#
# BATCH5B-MARKER harness-tests
#
# This is a permissions change, which is the kind that looks correct on
# screen right up until somebody finds out it is not. Every KPI line is
# checked from three sides: the National Coordinator sees the country, the
# Benin coordinator sees Benin and nothing else, and the numbers the Benin
# coordinator gets back are checked against Benin's real totals rather than
# just against "smaller than the national figure".

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

BENIN="(select id from chapters where name='Benin')"
AUCHI="(select id from chapters where name='Auchi')"
F=2026-01-01; T=2026-12-31

echo "=============================================="
echo " Batch 5b: chapter scoping on the KPI report"
echo "=============================================="

# --------------------------------------------------------------
# Seed. Benin and Auchi both have real activity, so "scoped" has
# to mean the right subset rather than simply nothing.
# --------------------------------------------------------------
sql "delete from participant_attendance;" >/dev/null
sql "delete from participants;" >/dev/null
sql "delete from safeguarding_incidents;" >/dev/null
sql "delete from reports;" >/dev/null
sql "delete from programs;" >/dev/null

sql "insert into programs (id, title, chapter_id, status, date, school, budget, students, submitted_by) values
 ('ddddddd5-0000-0000-0000-000000000001','Benin one', $BENIN,'Complete','2026-02-10','Benin Grammar',100000,50,'$RC'),
 ('ddddddd5-0000-0000-0000-000000000002','Benin two', $BENIN,'Complete','2026-03-10','Benin High',   100000,50,'$RC'),
 ('ddddddd5-0000-0000-0000-000000000003','Auchi one', $AUCHI,'Complete','2026-02-11','Auchi Model',  200000,50,'$NC'),
 ('ddddddd5-0000-0000-0000-000000000004','Auchi two', $AUCHI,'Complete','2026-03-11','Auchi Central',200000,50,'$NC');" >/dev/null

sql "insert into reports (program_id, report_date, attendance, actual_expenditure, feedback_forms_returned, feedback_positive) values
 ('ddddddd5-0000-0000-0000-000000000001','2026-02-11', 40, 50000, 10, 9),
 ('ddddddd5-0000-0000-0000-000000000002','2026-03-11', 60, 60000, 10, 7),
 ('ddddddd5-0000-0000-0000-000000000003','2026-02-12',100,150000, 20, 4),
 ('ddddddd5-0000-0000-0000-000000000004','2026-03-12',200,150000, 20, 4);" >/dev/null

# Benin: 100 seats, 110,000 spent of 200,000, 16 of 20 positive = 80.0%
# Auchi: 300 seats, 300,000 spent of 400,000,  8 of 40 positive = 20.0%
# National: 400 seats, 410,000 of 600,000, 24 of 60 = 40.0%
# The two chapters deliberately sit either side of the national figure, so
# a scoping fault cannot hide behind a number that happens to look right.

v()  { as "$NC" "select coalesce(value::text,'NULL') from kpi_snapshot('$F','$T') where kpi_key='$1';"; }
vr() { as "$RC" "select coalesce(value::text,'NULL') from kpi_snapshot('$F','$T') where kpi_key='$1';"; }
vt() { as "$TM" "select coalesce(value::text,'NULL') from kpi_snapshot('$F','$T') where kpi_key='$1';"; }

echo
echo "-- Who is allowed to see the whole country ------------"
want "NC sees all" "t" "$(as "$NC" "select kpi_sees_all();")"
want "admin sees all" "t" "$(as "$ADMIN" "select kpi_sees_all();")"
want "regional coordinator does NOT" "f" "$(as "$RC" "select kpi_sees_all();")"
want "team member does NOT" "f" "$(as "$TM" "select kpi_sees_all();")"

echo
echo "-- Schools reached ------------------------------------"
want "NC sees all four schools" "4" "$(v schools_reached)"
want "Benin RC sees only Benin's two" "2" "$(vr schools_reached)"

echo
echo "-- Activities conducted -------------------------------"
want "NC sees four" "4" "$(v activities_conducted)"
want "Benin RC sees two" "2" "$(vr activities_conducted)"

echo
echo "-- Attendance headcount -------------------------------"
want "NC sees 400 seats" "400" "$(v attendance_headcount)"
want "Benin RC sees Benin's 100, not the national 400" "100" "$(vr attendance_headcount)"

echo
echo "-- Participant satisfaction ---------------------------"
# The scoped figure is deliberately HIGHER than the national one here.
# A fault that returned the national number would look plausible on a
# chapter screen, so the test has to pin the exact value.
want "national satisfaction is 40.0" "40.0" "$(v participant_satisfaction)"
want "Benin RC sees Benin's own 80.0, not 40.0" "80.0" "$(vr participant_satisfaction)"
want "Benin's denominator is 20 forms, not the national 60" "20" \
     "$(as "$RC" "select denominator::text from kpi_snapshot('$F','$T') where kpi_key='participant_satisfaction';")"

echo
echo "-- Budget utilisation ---------------------------------"
want "national utilisation is 68.3" "68.3" "$(v budget_utilisation)"
want "Benin RC sees Benin's own 55.0" "55.0" "$(vr budget_utilisation)"
want "Benin's budget denominator is 200000" "200000" \
     "$(as "$RC" "select denominator::text from kpi_snapshot('$F','$T') where kpi_key='budget_utilisation';")"

echo
echo "-- Chapter breakdown ----------------------------------"
# Read the real number rather than hard-coding one. A test that assumes
# how many chapters exist starts failing the day a chapter is added, and
# then somebody "fixes" it by loosening the assertion.
NCHAP=$(sql "select count(*) from chapters;")
want "NC gets a row per chapter" "$NCHAP" "$(as "$NC" "select count(*) from kpi_chapter_breakdown('$F','$T');")"
want "Benin RC gets exactly one row" "1" "$(as "$RC" "select count(*) from kpi_chapter_breakdown('$F','$T');")"
want "and it is Benin's" "Benin" "$(as "$RC" "select chapter_name from kpi_chapter_breakdown('$F','$T');")"
want "Auchi's row is not returned to the Benin RC at all" "0" \
     "$(as "$RC" "select count(*) from kpi_chapter_breakdown('$F','$T') where chapter_name='Auchi';")"
want "NC can still see Auchi's activity" "2" \
     "$(as "$NC" "select activities::text from kpi_chapter_breakdown('$F','$T') where chapter_name='Auchi';")"

echo
echo "-- The lines that were already correct stay correct ---"
sql "insert into participants (id, chapter_id, full_name, gender, age_band, consent_on, first_contact_on) values
 ('eeeeeeee-0000-0000-0000-000000000001',$BENIN,'Benin Child','Female','13-15','2026-01-10','2026-01-10'),
 ('eeeeeeee-0000-0000-0000-000000000002',$AUCHI,'Auchi Child','Male','13-15','2026-01-10','2026-01-10');" >/dev/null
sql "insert into participant_attendance (participant_id, program_id, attended_on) values
 ('eeeeeeee-0000-0000-0000-000000000001','ddddddd5-0000-0000-0000-000000000001','2026-02-10'),
 ('eeeeeeee-0000-0000-0000-000000000002','ddddddd5-0000-0000-0000-000000000003','2026-02-11');" >/dev/null
want "NC counts both children" "2" "$(v student_beneficiaries)"
want "Benin RC counts only Benin's child" "1" "$(vr student_beneficiaries)"

echo
echo "-- The national chapter count stays national ----------"
# Deliberate. How many chapters YCDI has is an organisational fact, not
# another region's private business, and a coordinator shown "1" would be
# reading a broken number rather than a scoped one.
want "NC sees the chapter count" "$NCHAP" "$(v chapters_active)"
want "RC sees the same chapter count, on purpose" "$NCHAP" "$(vr chapters_active)"
want "and there really is more than one chapter, or the test proves nothing" "yes" \
     "$(sql "select case when count(*) > 1 then 'yes' else 'no' end from chapters;")"

echo
echo "-- Failing closed ------------------------------------"
# A team member has a chapter but no business in this report. They are not
# in the More menu card either, but the database should not be relying on
# that. Belt and braces.
want "team member sees no beneficiaries" "0" "$(vt student_beneficiaries)"
want "team member sees only their own chapter's schools" "2" "$(vt schools_reached)"

echo
echo "-- Nothing was widened by accident --------------------"

# Batch 7c turns the two volunteer placeholders into real figures and
# takes the snapshot from thirteen lines to sixteen. Both states are
# correct, depending on what was loaded, so the expected numbers are
# read off the database rather than written down. Hard-coding thirteen
# here would mean this suite could only ever be run one way.
if [ "$(sql "select count(*) from pg_proc where proname='volunteers_on_books';")" = "1" ]; then
  LINES=16; UNCAPTURED=1; VOLSTATUS=computed
else
  LINES=13; UNCAPTURED=3; VOLSTATUS=not_captured
fi
want "the snapshot returns the RC the same number of lines as anyone else" "$LINES" \
     "$(as "$RC" "select count(*) from kpi_snapshot('$F','$T');")"
want "and declares the same gaps to them" "$UNCAPTURED" \
     "$(as "$RC" "select count(*) from kpi_snapshot('$F','$T') where status='not_captured';")"
want "no not_captured line gained a value" "0" \
     "$(as "$RC" "select count(*) from kpi_snapshot('$F','$T') where status='not_captured' and value is not null;")"
want "headcount is still flagged secondary for the RC" "secondary" \
     "$(as "$RC" "select status from kpi_snapshot('$F','$T') where kpi_key='attendance_headcount';")"

echo
echo "=============================================="
echo " passed $pass, failed $fail"
echo "=============================================="
[ $fail -eq 0 ]
