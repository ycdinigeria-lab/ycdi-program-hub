#!/bin/bash
# Batch 7c. The two volunteer KPIs, and the register they are built on.
#
# BATCH7C-MARKER harness-tests
#
# Three things are being proved here. That the denominator holds exactly
# the people who were on the books during the period and nobody else,
# tested on every boundary rather than in the comfortable middle. That
# the observed figure counts work done and refuses to count a signature.
# And that retention answers a question about the period being reported
# rather than about today, which is the whole reason it reads dates
# instead of status.
#
# Run with:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch6b-audit-log-and-volunteer-register.sql \
#          batch7a-volunteer-applications.sql \
#          batch7b-references-interviews-renewals.sql \
#          batch7c-volunteer-kpis.sql" bash _harness/setup.sh
#   bash _harness/run-batch7c-tests.sh
#
# The 7c cast cannot go in EXTRA, because setup.sh loads EXTRA before
# 10-seed.sql and the cast needs the chapters and programmes that seed
# creates. It is loaded here instead.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444

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
    *ERROR*|*"denied"*|*"violates"*|*"does not exist"*)
      echo "  ok   $1 (refused)"; pass=$((pass+1)) ;;
    *) echo "  XX   $1: was allowed, got: $2"; fail=$((fail+1)) ;;
  esac
}
blocked() {
  if [ -z "$2" ]; then echo "  ok   $1 (nothing changed)"; pass=$((pass+1))
  else echo "  XX   $1: it went through, got: $2"; fail=$((fail+1)); fi
}
contains() {
  case "$3" in
    *"$2"*) echo "  ok   $1"; pass=$((pass+1)) ;;
    *) echo "  XX   $1: wanted something containing '$2', got: $3"; fail=$((fail+1)) ;;
  esac
}
lacks() {
  case "$3" in
    *"$2"*) echo "  XX   $1: found '$2' where it should not be"; fail=$((fail+1)) ;;
    *) echo "  ok   $1"; pass=$((pass+1)) ;;
  esac
}

# Seeded "Ada Admin" carries role NC as well as the admin flag, so an
# assertion against it proves nothing about the flag on its own.
PLAINADMIN=88888888-8888-8888-8888-888888888888
sql "insert into auth.users (id, email) values ('$PLAINADMIN','sysadmin@ycdi.test') on conflict do nothing;" >/dev/null
sql "insert into public.profiles (id, full_name, role, chapter_id, is_admin)
     values ('$PLAINADMIN','Sam Sysadmin','TM',(select id from chapters where name='Benin'), true)
     on conflict (id) do update set is_admin = true, role = 'TM';" >/dev/null

# The cast.
su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -q -f /home/claude/hub/_harness/10c-seed-volunteer-kpis.sql" >/dev/null 2>&1 \
  || { echo "the 7c cast would not load, nothing below this line means anything"; exit 1; }

# Shorthand for reading one line out of the snapshot.
snap() { as "$1" "select coalesce(value::text,'NULL') from kpi_snapshot('$FROM','$TO') where kpi_key='$2';"; }
snapn() { as "$1" "select coalesce(numerator::text,'NULL')||'/'||coalesce(denominator::text,'NULL') from kpi_snapshot('$FROM','$TO') where kpi_key='$2';"; }
names() { as "$1" "select coalesce(string_agg(p.full_name,', ' order by p.full_name),'') from volunteers_involved('$FROM','$TO') i join profiles p on p.id=i.profile_id;"; }

window() { sql "update kpi_settings set int_value = $1 where key='volunteer_activity_window_days';" >/dev/null; }

echo "=============================================="
echo " Batch 7c: volunteer active rate and retention"
echo "=============================================="

echo
echo "-- A. Who is on the books ----------------------------------"

want "the National Coordinator counts everyone across both chapters" "9" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO');")"

want "the Benin coordinator counts only Benin" "8" \
  "$(as $RC "select count(*) from volunteers_on_books('$FROM','$TO');")"

want "somebody still onboarding is not on the books" "0" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000007';")"

want "somebody who left before the period opened is not on the books" "0" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000008';")"

want "somebody who starts after it closes is not on the books" "0" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000010';")"

want "somebody who left part way through the year still counts" "1" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000004';")"

want "a record with no start date is still on the books" "1" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000009';")"

want "a record ending on the very last day of the period counts" "1" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000011';")"

want "the day somebody left is the boundary, not the day before" "0" \
  "$(as $NC "select count(*) from volunteers_on_books('2026-05-21','$TO') where profile_id='b0000000-0000-0000-0000-000000000004';")"

want "and the day itself is inside" "1" \
  "$(as $NC "select count(*) from volunteers_on_books('2026-05-20','$TO') where profile_id='b0000000-0000-0000-0000-000000000004';")"

want "an inactive record is on the books, it just is not active" "1" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000003';")"

# The start boundary. Nobody in the cast starts on 31 December, so
# without a period that ends on somebody's first day this comparison is
# never actually exercised and a < would pass unnoticed.
want "starting on the very last day of the period still counts" "1" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','2026-03-01') where profile_id='b0000000-0000-0000-0000-000000000005';")"

want "and starting the day after it closes does not" "0" \
  "$(as $NC "select count(*) from volunteers_on_books('$FROM','2026-02-28') where profile_id='b0000000-0000-0000-0000-000000000005';")"

echo
echo "-- B. What counts as having done something -----------------"

want "three volunteers left a trace in 2026" "3" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO');")"

want "and they are the three we expect" "Auchi Ada, Nkechi New, Vera Veteran" \
  "$(names $NC)"

want "recording attendance counts" "1" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000001';")"

want "moving a participant through a stage counts" "1" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000005';")"

want "an open mentoring link counts even with nothing logged that year" "1" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='c0000000-0000-0000-0000-000000000001';")"

want "a mentoring link closed before the period does not count" "0" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000006';")"

want "a register taken last year does not count as this year's work" "0" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000004';")"

want "being on the register with nothing behind it counts for nothing" "0" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000002';")"

want "signing the annual declaration is not activity" "0" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000003';")"

want "an attendance row with nobody named on it invents nobody" "3" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO');")"

# Vera recorded attendance in March and moved a stage in March. Two
# traces, two different tables, one volunteer. If the deduplication went
# missing she would be counted twice and the observed rate would read
# 44.4 rather than 33.3, which is the sort of error that looks like good
# news.
want "Vera left two traces of two different kinds" "2" \
  "$(sql "select (select count(*) from participant_attendance where recorded_by='b0000000-0000-0000-0000-000000000001') + (select count(*) from participant_stages where recorded_by='b0000000-0000-0000-0000-000000000001');")"

want "and is still counted once" "1" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO') where profile_id='b0000000-0000-0000-0000-000000000001';")"

want "the Benin coordinator sees only the Benin two" "2" \
  "$(as $RC "select count(*) from volunteers_involved('$FROM','$TO');")"

lacks "and Auchi's mentor is not among them" "Auchi Ada" "$(names $RC)"

echo
echo "-- C. The two active rates ---------------------------------"

want "the register figure for the whole country" "77.8" "$(snap $NC volunteer_active_rate)"
want "built from seven active out of nine on the books" "7/9" "$(snapn $NC volunteer_active_rate)"
want "the observed figure sits well below it" "33.3" "$(snap $NC volunteer_active_rate_observed)"
want "on the same denominator, which is the point" "3/9" "$(snapn $NC volunteer_active_rate_observed)"
want "and the denominator is published in its own right" "9" "$(snap $NC volunteers_on_books)"

want "the Benin coordinator gets Benin's register figure" "75.0" "$(snap $RC volunteer_active_rate)"
want "and Benin's observed figure" "25.0" "$(snap $RC volunteer_active_rate_observed)"

echo
echo "-- D. Retention --------------------------------------------"

want "four of six continuing volunteers stayed" "4/6" "$(snapn $NC volunteer_retention)"
want "which is the headline retention figure" "66.7" "$(snap $NC volunteer_retention)"
want "new starters are reported apart from it" "1/2" "$(snapn $NC volunteer_retention_new)"
want "at their own rate" "50.0" "$(snap $NC volunteer_retention_new)"

want "leaving on the last day of the period is not retention" "f" \
  "$(as $NC "select retained from volunteer_retention_cohort('$FROM','$TO','continuing') where profile_id='b0000000-0000-0000-0000-000000000011';")"

want "leaving the day after it closes is" "t" \
  "$(as $NC "select retained from volunteer_retention_cohort('$FROM','2026-12-30','continuing') where profile_id='b0000000-0000-0000-0000-000000000011';")"

want "a record with no start date is in neither cohort" "0" \
  "$(as $NC "select count(*) from volunteer_retention_cohort('$FROM','$TO','continuing') where profile_id='b0000000-0000-0000-0000-000000000009';")"

want "nor the new one" "0" \
  "$(as $NC "select count(*) from volunteer_retention_cohort('$FROM','$TO','new') where profile_id='b0000000-0000-0000-0000-000000000009';")"

want "somebody who joined during the period is not counted as continuing" "0" \
  "$(as $NC "select count(*) from volunteer_retention_cohort('$FROM','$TO','continuing') where profile_id='b0000000-0000-0000-0000-000000000005';")"

want "an unrecognised cohort name returns nobody, not everybody" "0" \
  "$(as $NC "select count(*) from volunteer_retention_cohort('$FROM','$TO','everybody');")"

# The cohort boundary, tested against 2025 because Eve started on the
# first day of that year. Somebody who started on the day the period
# opened did not carry over from the year before, so they belong to the
# new cohort and nowhere else. Without this the comparison could be <=
# and every test above would still pass.
want "starting on the opening day is not continuing" "0" \
  "$(as $NC "select count(*) from volunteer_retention_cohort('2025-01-01','2025-12-31','continuing') where profile_id='b0000000-0000-0000-0000-000000000011';")"

want "it is a new start" "1" \
  "$(as $NC "select count(*) from volunteer_retention_cohort('2025-01-01','2025-12-31','new') where profile_id='b0000000-0000-0000-0000-000000000011';")"

want "an inactive volunteer who never left still counts as retained" "t" \
  "$(as $NC "select retained from volunteer_retention_cohort('$FROM','$TO','continuing') where profile_id='b0000000-0000-0000-0000-000000000003';")"

want "a period with nobody in the cohort gives a blank, not a nought" "NULL" \
  "$(as $NC "select coalesce(value::text,'NULL') from kpi_snapshot('2020-01-01','2020-12-31') where kpi_key='volunteer_retention';")"

want "and the blank is an empty denominator, not a missing numerator" "0/0" \
  "$(as $NC "select coalesce(numerator::text,'NULL')||'/'||coalesce(denominator::text,'NULL') from kpi_snapshot('2020-01-01','2020-12-31') where kpi_key='volunteer_retention';")"

echo
echo "-- E. The activity window ----------------------------------"

window 90
want "a ninety day window drops the March register" "2" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO');")"
want "leaving November's stage move and the open mentoring link" "Auchi Ada, Nkechi New" \
  "$(names $NC)"
want "the observed figure falls with it" "22.2" "$(snap $NC volunteer_active_rate_observed)"
want "and the register figure does not move at all" "77.8" "$(snap $NC volunteer_active_rate)"
want "nor does retention" "66.7" "$(snap $NC volunteer_retention)"

window 3650
want "a window longer than the period cannot reach outside it" "3" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO');")"
lacks "so last year's register still does not count" "Wale Withdrew" "$(names $NC)"

window 1
want "a one day window leaves only the states, not the events" "1" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO');")"

window null
want "clearing the setting puts the whole period back" "3" \
  "$(as $NC "select count(*) from volunteers_involved('$FROM','$TO');")"

echo
echo "-- F. Who may move the window ------------------------------"

want "everybody signed in can read what it is set to" "1" \
  "$(as $TM "select count(*) from kpi_settings where key='volunteer_activity_window_days';")"

blocked "a coordinator cannot change it" \
  "$(as $RC "update kpi_settings set int_value=30 where key='volunteer_activity_window_days' returning 1;")"

blocked "nor a Team Member" \
  "$(as $TM "update kpi_settings set int_value=30 where key='volunteer_activity_window_days' returning 1;")"

blocked "nor delete it" \
  "$(as $RC "delete from kpi_settings where key='volunteer_activity_window_days' returning 1;")"

want "and after all that it is still unset" "NULL" \
  "$(sql "select coalesce(int_value::text,'NULL') from kpi_settings where key='volunteer_activity_window_days';")"

contains "the National Coordinator can change it" "1" \
  "$(as $NC "update kpi_settings set int_value=45 where key='volunteer_activity_window_days' returning 1;")"

contains "so can an admin who is not a coordinator" "1" \
  "$(as $PLAINADMIN "update kpi_settings set int_value=null where key='volunteer_activity_window_days' returning 1;")"

# anon holds a select grant on kpi_settings, exactly as it does on
# kpi_targets, and row security is what closes it rather than the grant.
# Mirroring kpi_targets was the requirement, so this asserts the fact
# that matters: a stranger reads nothing out of it.
want "a stranger reads nothing out of the settings" "0" \
  "$(stranger "select count(*) from kpi_settings;")"

want "and cannot see the settings any more than the targets beside them" "0" \
  "$(stranger "select count(*) from kpi_targets;")"

echo
echo "-- G. The shape of the report ------------------------------"

want "sixteen lines" "16" \
  "$(as $NC "select count(*) from kpi_snapshot('$FROM','$TO');")"

want "one of them is still not captured" "1" \
  "$(as $NC "select count(*) from kpi_snapshot('$FROM','$TO') where status='not_captured';")"

want "and it is the annual report" "annual_report_published" \
  "$(as $NC "select kpi_key from kpi_snapshot('$FROM','$TO') where status='not_captured';")"

want "the sort order has no gaps and no repeats" "16" \
  "$(as $NC "select count(distinct sort_order) from kpi_snapshot('$FROM','$TO');")"

want "no key appears twice" "16" \
  "$(as $NC "select count(distinct kpi_key) from kpi_snapshot('$FROM','$TO');")"

want "the two KPI keys targets are already set against are unchanged" "volunteer_active_rate,volunteer_retention" \
  "$(as $NC "select string_agg(kpi_key,',' order by kpi_key) from kpi_snapshot('$FROM','$TO') where kpi_key in ('volunteer_active_rate','volunteer_retention') and status='computed';")"

want "the supporting lines are marked secondary so no target is hung on them" "3" \
  "$(as $NC "select count(*) from kpi_snapshot('$FROM','$TO') where kpi_key in ('volunteer_active_rate_observed','volunteers_on_books','volunteer_retention_new') and status='secondary';")"

want "the lines Batch 5b already computed are still computed" "6" \
  "$(as $NC "select count(*) from kpi_snapshot('$FROM','$TO') where status='computed' and kpi_key in ('schools_reached','student_beneficiaries','activities_conducted','chapters_active','participant_satisfaction','safeguarding_resolution');")"

want "budget utilisation is still flagged partial" "partial" \
  "$(as $NC "select status from kpi_snapshot('$FROM','$TO') where kpi_key='budget_utilisation';")"

contains "the observed line says out loud why it is not the headline" "register is out of date" \
  "$(as $NC "select note from kpi_snapshot('$FROM','$TO') where kpi_key='volunteer_active_rate_observed';")"

contains "and warns that attendance is stored once per programme" "once per volunteer per programme" \
  "$(as $NC "select note from kpi_snapshot('$FROM','$TO') where kpi_key='volunteer_active_rate_observed';")"

want "no line supplies a percentage it worked out itself" "0" \
  "$(as $NC "select count(*) from kpi_snapshot('$FROM','$TO') where unit='percent' and value is not null and (numerator is null or denominator is null);")"

echo
echo "-- H. Volunteer figures are not for everybody ---------------"

want "a Team Member gets nothing off the register" "0" \
  "$(as $TM "select count(*) from volunteers_on_books('$FROM','$TO');")"

want "so the active rate is blank for them rather than wrong" "NULL" \
  "$(snap $TM volunteer_active_rate)"

want "and retention too" "NULL" "$(snap $TM volunteer_retention)"

want "a Team Member cannot name an active volunteer either" "0" \
  "$(as $TM "select count(*) from volunteers_involved('$FROM','$TO');")"

# The national chapter count, not the beneficiary count. Batch 2 already
# shuts Team Members out of participant data on purpose, so a nought
# there would prove nothing about Batch 7c either way.
want "but the national line they were always allowed still works" "5" \
  "$(as $TM "select coalesce(value::text,'NULL') from kpi_snapshot('$FROM','$TO') where kpi_key='chapters_active';")"

want "an admin who is not a coordinator sees the whole country" "9" \
  "$(as $PLAINADMIN "select count(*) from volunteers_on_books('$FROM','$TO');")"

want "a stranger gets nothing" "0" \
  "$(stranger "select count(*) from volunteers_on_books('$FROM','$TO');")"

want "and cannot name a volunteer" "0" \
  "$(stranger "select count(*) from volunteers_involved('$FROM','$TO');")"

want "the Benin coordinator cannot reach an Auchi volunteer by asking for them" "0" \
  "$(as $RC "select count(*) from volunteers_on_books('$FROM','$TO') where profile_id='c0000000-0000-0000-0000-000000000001';")"

echo
echo "=============================================="
echo " passed $pass, failed $fail"
echo "=============================================="
[ "$fail" -eq 0 ]
