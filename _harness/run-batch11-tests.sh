#!/bin/bash
# Batch 11. Volunteer figures on the chapter breakdown.
#
# BATCH11-MARKER harness-tests
#
# Two things are being proved here, and the second matters more than the
# first. That the three new columns agree with the Board table they sit
# under, chapter by chapter and in total. And that adding a security
# definer read to a security invoker function did not quietly widen what
# a Team Member can see, which is the failure this change was most
# likely to cause and the one nobody would notice on screen.
#
# The Team Member assertions are deliberately written against the string
# 'NULL' rather than against 0. An empty cell and a chapter with no
# volunteers are different statements, and a test that accepts either
# would pass through the exact bug worth catching.
#
# Run with the full EXTRA list from batch1 through batch7c plus
# batch11-chapter-volunteers.sql, then:
#   bash _harness/run-batch11-tests.sh

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444
PLAINADMIN=88888888-8888-8888-8888-888888888888

FROM=2026-01-01
TO=2026-12-31

pass=0; fail=0

sql() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1
}
as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
stranger() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role anon; set test.uid = ''; $1\"" 2>&1
}

want() {
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1))
  else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi
}
refused() {
  case "$2" in
    *ERROR*|*"denied"*|*"does not exist"*)
      echo "  ok   $1 (refused)"; pass=$((pass+1)) ;;
    *) echo "  XX   $1: was allowed, got: $2"; fail=$((fail+1)) ;;
  esac
}
lacks() {
  case "$3" in
    *"$2"*) echo "  XX   $1: found '$2' where it should not be"; fail=$((fail+1)) ;;
    *) echo "  ok   $1"; pass=$((pass+1)) ;;
  esac
}

sql "insert into auth.users (id, email) values ('$PLAINADMIN','sysadmin@ycdi.test') on conflict do nothing;" >/dev/null
sql "insert into public.profiles (id, full_name, role, chapter_id, is_admin)
     values ('$PLAINADMIN','Sam Sysadmin','TM',(select id from chapters where name='Benin'), true)
     on conflict (id) do update set is_admin = true, role = 'TM';" >/dev/null

su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -q -f /home/claude/hub/_harness/10c-seed-volunteer-kpis.sql" >/dev/null 2>&1 \
  || { echo "the 7c cast would not load, nothing below this line means anything"; exit 1; }

# One cell out of the breakdown. Nulls come back as the word so a blank
# cell and a zero can be told apart.
cell() { as "$1" "select coalesce($3::text,'NULL') from kpi_chapter_breakdown('$FROM','$TO') where chapter_name='$2';"; }
cellp() { as "$1" "select coalesce($4::text,'NULL') from kpi_chapter_breakdown('$2','$3') where chapter_name='Benin';"; }
window() { sql "update kpi_settings set int_value = $1 where key='volunteer_activity_window_days';" >/dev/null; }

echo "=============================================="
echo " Batch 11: volunteer columns on the chapter breakdown"
echo "=============================================="

echo
echo "-- A. The columns exist and are the right type -------------"

# Two arguments in, fourteen columns out. Eleven from Batch 5b and the
# three added here.
want "the function returns fourteen columns" "14" \
  "$(sql "select array_length(proallargtypes,1) - 2 from pg_proc where proname='kpi_chapter_breakdown';")"

want "and still takes exactly the two date arguments" "2" \
  "$(sql "select pronargs from pg_proc where proname='kpi_chapter_breakdown';")"

want "volunteer_on_books is one of them" "1" \
  "$(sql "select count(*) from unnest((select proargnames from pg_proc where proname='kpi_chapter_breakdown')) n where n='volunteer_on_books';")"

want "volunteer_active is one of them" "1" \
  "$(sql "select count(*) from unnest((select proargnames from pg_proc where proname='kpi_chapter_breakdown')) n where n='volunteer_active';")"

want "volunteer_involved is one of them" "1" \
  "$(sql "select count(*) from unnest((select proargnames from pg_proc where proname='kpi_chapter_breakdown')) n where n='volunteer_involved';")"

want "it is still security invoker, not definer" "f" \
  "$(sql "select prosecdef from pg_proc where proname='kpi_chapter_breakdown';")"

echo
echo "-- B. The National Coordinator sees every chapter ----------"

want "Benin has eight volunteers on the books" "8" "$(cell $NC Benin volunteer_on_books)"
want "six of them are marked active" "6" "$(cell $NC Benin volunteer_active)"
want "two of them left a trace in the record of work" "2" "$(cell $NC Benin volunteer_involved)"

want "Auchi has one on the books" "1" "$(cell $NC Auchi volunteer_on_books)"
want "Auchi's one is marked active" "1" "$(cell $NC Auchi volunteer_active)"
want "and Auchi's one was seen working" "1" "$(cell $NC Auchi volunteer_involved)"

want "a chapter with no volunteers reads zero, not blank" "0" "$(cell $NC Lagos volunteer_on_books)"
want "and zero active rather than blank" "0" "$(cell $NC Lagos volunteer_active)"
want "and zero involved rather than blank" "0" "$(cell $NC Lagos volunteer_involved)"

want "somebody still onboarding is left out of Benin's count" "8" \
  "$(cell $NC Benin volunteer_on_books)"
want "though Benin holds eleven volunteer records in all" "11" \
  "$(sql "select count(*) from volunteer_records vr join profiles p on p.id=vr.profile_id join chapters c on c.id=p.chapter_id where c.name='Benin';")"

want "so three of them are excluded: onboarding, gone before, and starting later" "3" \
  "$(as $NC "select 11 - count(*) from volunteers_on_books('$FROM','$TO') b join profiles p on p.id=b.profile_id join chapters c on c.id=p.chapter_id where c.name='Benin';")"

echo
echo "-- C. It reconciles with the Board table -------------------"

want "the chapter columns add up to the national denominator" "9" \
  "$(as $NC "select sum(volunteer_on_books) from kpi_chapter_breakdown('$FROM','$TO');")"

want "the active total matches the active rate numerator" "7" \
  "$(as $NC "select sum(volunteer_active) from kpi_chapter_breakdown('$FROM','$TO');")"

want "the involved total matches the observed numerator" "3" \
  "$(as $NC "select sum(volunteer_involved) from kpi_chapter_breakdown('$FROM','$TO');")"

want "so the breakdown reproduces the register active rate exactly" "77.8" \
  "$(as $NC "select round(100.0*sum(volunteer_active)/sum(volunteer_on_books),1) from kpi_chapter_breakdown('$FROM','$TO');")"

want "and the observed rate exactly" "33.3" \
  "$(as $NC "select round(100.0*sum(volunteer_involved)/sum(volunteer_on_books),1) from kpi_chapter_breakdown('$FROM','$TO');")"

want "the snapshot has not moved either" "77.8" \
  "$(as $NC "select value::text from kpi_snapshot('$FROM','$TO') where kpi_key='volunteer_active_rate';")"

echo
echo "-- D. A Regional Coordinator sees their own chapter --------"

want "the Benin coordinator gets exactly one row" "1" \
  "$(as $RC "select count(*) from kpi_chapter_breakdown('$FROM','$TO');")"

want "and it is Benin" "Benin" \
  "$(as $RC "select chapter_name from kpi_chapter_breakdown('$FROM','$TO');")"

want "with the same on-books figure the coordinator sees elsewhere" "8" "$(cell $RC Benin volunteer_on_books)"
want "the same active figure" "6" "$(cell $RC Benin volunteer_active)"
want "and the same observed figure" "2" "$(cell $RC Benin volunteer_involved)"

want "Auchi is absent from the coordinator's breakdown entirely" "0" \
  "$(as $RC "select count(*) from kpi_chapter_breakdown('$FROM','$TO') where chapter_name='Auchi';")"

want "asking for the national total returns only their own chapter" "8" \
  "$(as $RC "select sum(volunteer_on_books) from kpi_chapter_breakdown('$FROM','$TO');")"

echo
echo "-- E. A Team Member gets nothing, and gets it as a blank ---"

want "the Team Member still gets their chapter's row" "1" \
  "$(as $TM "select count(*) from kpi_chapter_breakdown('$FROM','$TO');")"

want "on-books is blank, not zero" "NULL" "$(cell $TM Benin volunteer_on_books)"
want "active is blank, not zero" "NULL" "$(cell $TM Benin volunteer_active)"
want "involved is blank, not zero" "NULL" "$(cell $TM Benin volunteer_involved)"

lacks "no volunteer count leaks through as a number anywhere in the row" "8" \
  "$(as $TM "select coalesce(volunteer_on_books::text,'')||coalesce(volunteer_active::text,'')||coalesce(volunteer_involved::text,'') from kpi_chapter_breakdown('$FROM','$TO');")"

# The point of this pair is the difference between them. A programme
# column comes back as a number for a Team Member, because those tables
# have been readable since an early batch and Batch 5b left that alone.
# A volunteer column comes back empty. If a later change ever blanks the
# first or fills the second, one of these two fails.
want "programme columns still come back as numbers for a Team Member" "0" \
  "$(as $TM "select activities::text from kpi_chapter_breakdown('$FROM','$TO') where chapter_name='Benin';")"

want "the coordinator sees a beneficiary the Team Member does not, as before" "1" \
  "$(as $RC "select beneficiaries from kpi_chapter_breakdown('$FROM','$TO') where chapter_name='Benin';")"

want "and summing the volunteer column gives them nothing to infer from" "NULL" \
  "$(as $TM "select coalesce(sum(volunteer_on_books)::text,'NULL') from kpi_chapter_breakdown('$FROM','$TO');")"

want "the definer functions still refuse them directly" "0" \
  "$(as $TM "select count(*) from volunteers_on_books('$FROM','$TO');")"

echo
echo "-- F. Admins and strangers ---------------------------------"

want "an admin who is not a coordinator sees every chapter" "5" \
  "$(as $PLAINADMIN "select count(*) from kpi_chapter_breakdown('$FROM','$TO');")"

want "with Benin's real on-books figure" "8" "$(cell $PLAINADMIN Benin volunteer_on_books)"
want "and Auchi's, which is not their own chapter" "1" "$(cell $PLAINADMIN Auchi volunteer_on_books)"

want "the seeded admin who is also NC sees the same" "9" \
  "$(as $ADMIN "select sum(volunteer_on_books) from kpi_chapter_breakdown('$FROM','$TO');")"

# Security invoker, so a signed-out caller is stopped at the chapters
# table before any volunteer function is reached. Refusal rather than an
# empty set, which is the stronger of the two answers.
refused "a stranger is refused the breakdown outright" \
  "$(stranger "select count(*) from kpi_chapter_breakdown('$FROM','$TO');")"

refused "and cannot sum a volunteer column into existence" \
  "$(stranger "select coalesce(sum(volunteer_on_books)::text,'NULL') from kpi_chapter_breakdown('$FROM','$TO');")"

echo
echo "-- G. The activity window moves the observed column only ---"

window 90
want "a ninety day window drops Benin's observed figure" "1" "$(cell $NC Benin volunteer_involved)"
want "while the register figure stays where it was" "6" "$(cell $NC Benin volunteer_active)"
want "and the denominator does not move" "8" "$(cell $NC Benin volunteer_on_books)"
want "the national observed total drops to match the snapshot" "2" \
  "$(as $NC "select sum(volunteer_involved) from kpi_chapter_breakdown('$FROM','$TO');")"
want "which is the 22.2 the Board table shows" "22.2" \
  "$(as $NC "select value::text from kpi_snapshot('$FROM','$TO') where kpi_key='volunteer_active_rate_observed';")"
window NULL
want "clearing the window puts the observed figure back" "2" "$(cell $NC Benin volunteer_involved)"

echo
echo "-- H. Periods outside the data -----------------------------"

# 2020 is before every dated record in the cast. The one person left is
# Undated Una, whose record has no start date at all. Batch 7c decided
# deliberately that such a record stays on the books rather than being
# dropped out of a funder figure, and this proves that decision carries
# through to the chapter column rather than being quietly reversed here.
want "only the undated record is on the books in 2020" "1" \
  "$(cellp $NC 2020-01-01 2020-12-31 volunteer_on_books)"
want "and it counts as active, because that is what the register says" "1" \
  "$(cellp $NC 2020-01-01 2020-12-31 volunteer_active)"
want "but nobody was seen working in 2020" "0" \
  "$(cellp $NC 2020-01-01 2020-12-31 volunteer_involved)"
want "which agrees with the Board table for the same period" "1" \
  "$(as $NC "select value::text from kpi_snapshot('2020-01-01','2020-12-31') where kpi_key='volunteers_on_books';")"
want "a chapter with nobody at all still reads zero, not blank" "0" \
  "$(as $NC "select coalesce(volunteer_on_books::text,'NULL') from kpi_chapter_breakdown('2020-01-01','2020-12-31') where chapter_name='Auchi';")"
want "a Team Member still gets a blank for the same empty period" "NULL" \
  "$(cellp $TM 2020-01-01 2020-12-31 volunteer_on_books)"

echo
echo "-- I. The eleven original columns are untouched ------------"

# Read off the database rather than hardcoded, the way the Batch 5 and 5b
# suites do it, so these keep meaning something if the seed changes.
want "activities in Benin" \
  "$(sql "select count(*) from programs p join chapters c on c.id=p.chapter_id where c.name='Benin' and p.status='Complete' and p.date between '$FROM' and '$TO';")" \
  "$(cell $NC Benin activities)"
want "schools in Benin" \
  "$(sql "select count(distinct lower(btrim(p.school))) from programs p join chapters c on c.id=p.chapter_id where c.name='Benin' and p.status='Complete' and p.date between '$FROM' and '$TO' and coalesce(btrim(p.school),'') <> '';")" \
  "$(cell $NC Benin schools)"
want "beneficiaries in Benin" \
  "$(sql "select count(distinct pa.participant_id) from participant_attendance pa join programs p on p.id=pa.program_id join chapters c on c.id=p.chapter_id where c.name='Benin' and pa.attended_on between '$FROM' and '$TO';")" \
  "$(cell $NC Benin beneficiaries)"
want "budget in Benin" \
  "$(sql "select coalesce(sum(p.budget),0) from programs p join chapters c on c.id=p.chapter_id where c.name='Benin' and p.status='Complete' and p.date between '$FROM' and '$TO';")" \
  "$(cell $NC Benin budget)"
want "the chapter list still comes back in name order" "Auchi" \
  "$(as $NC "select chapter_name from kpi_chapter_breakdown('$FROM','$TO') limit 1;")"
want "and still returns one row per chapter" "5" \
  "$(as $NC "select count(*) from kpi_chapter_breakdown('$FROM','$TO');")"

echo
echo "=============================================="
echo " passed $pass, failed $fail"
echo "=============================================="
[ "$fail" -eq 0 ]
