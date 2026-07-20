#!/bin/bash
# Batch 7a. The volunteer application form.
#
# BATCH7A-MARKER harness-tests
#
# This batch opens a door in the hub that anybody on the internet can
# push on, so the tests are written from outside first. Everything in
# section A is what a stranger can do, and almost all of it should fail.
#
# Run with:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch6b-audit-log-and-volunteer-register.sql \
#          batch7a-volunteer-applications.sql" _harness/setup.sh
#   bash _harness/run-batch7a-tests.sh

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444

pass=0; fail=0

sql() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1
}
as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
# Nobody signed in and no account at all, which is what the form is used
# from. This is the one that matters most in this batch.
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

# The shared seed's "Ada Admin" holds role NC as well as the admin flag,
# so testing against it proves nothing about the flag on its own. Every
# decision in this batch turns on what a plain admin can reach, so the
# suite makes one: a Team Member carrying is_admin and nothing else.
PLAINADMIN=88888888-8888-8888-8888-888888888888
sql "insert into auth.users (id, email) values ('$PLAINADMIN','sysadmin@ycdi.test') on conflict do nothing;" >/dev/null
sql "insert into public.profiles (id, full_name, role, chapter_id, is_admin)
     values ('$PLAINADMIN','Sam Sysadmin','TM',(select id from chapters where name='Benin'), true)
     on conflict (id) do update set is_admin = true, role = 'TM';" >/dev/null

BENIN=$(sql "select id from chapters where name='Benin';")
AUCHI=$(sql "select id from chapters where name='Auchi';")

# A complete application, as JSON, since that is how it arrives.
form() {
  local email="$1"; local chapter="$2"; local role="${3:-school_contact}"
  echo "{\\\"full_name\\\":\\\"Grace Adeyemi\\\",\\\"email\\\":\\\"$email\\\",\\\"phone\\\":\\\"08030000000\\\",\\\"chapter_id\\\":\\\"$chapter\\\",\\\"role_sought\\\":\\\"$role\\\",\\\"church_name\\\":\\\"Living Faith\\\",\\\"referee1_name\\\":\\\"Pastor Sam\\\",\\\"referee1_contact\\\":\\\"0803111\\\",\\\"referee1_is_church_leader\\\":true,\\\"referee2_name\\\":\\\"Ada Nwosu\\\",\\\"referee2_contact\\\":\\\"ada@x.com\\\",\\\"faith_statement\\\":\\\"A private testimony.\\\",\\\"motivation\\\":\\\"To serve.\\\",\\\"has_disclosure\\\":false,\\\"consent_references\\\":true}"
}

echo "=============================================="
echo " Batch 7a: the volunteer application form"
echo "=============================================="

echo
echo "-- A. What a stranger can do --------------------------------"

R=$(stranger "select public.submit_volunteer_application('$(form grace@example.com $BENIN)'::jsonb);")
contains "a stranger can submit the form, which is the point" "VA-" "$R"

want "and it landed" "1" "$(sql "select count(*) from volunteer_applications;")"

refused "a stranger cannot read applications back" \
  "$(stranger "select count(*) from volunteer_applications;")"

refused "nor write to the table directly, bypassing the function" \
  "$(stranger "insert into volunteer_applications (full_name, consent_references, disclosure_made) values ('Forged', true, true);")"

refused "nor change one" \
  "$(stranger "update volunteer_applications set status='appointed';")"

refused "nor delete one" \
  "$(stranger "delete from volunteer_applications;")"

# This one was open before this batch and is closed by it. Anybody
# holding the publishable key, which ships in the browser bundle, could
# read every name, role and chapter in the organisation without signing
# in.
refused "nor read the whole staff list without signing in" \
  "$(stranger "select count(*) from profiles;")"

refused "nor the chapter table directly" \
  "$(stranger "select count(*) from chapters;")"

# Row security answers this one by handing back nothing rather than by
# complaining, which is a different shape of safe and worth asserting as
# what it is instead of forcing it to look like a refusal.
want "and the safeguarding register gives a stranger nothing" "0" \
  "$(stranger "select count(*) from safeguarding_incidents;")"

refused "nor decide on an application" \
  "$(stranger "select public.decide_application((select id from volunteer_applications limit 1), 'appointed');")"

refused "nor purge the whole table under the retention rule" \
  "$(stranger "select public.purge_old_applications();")"

want "a stranger can list chapters, because the form needs the dropdown" "1" \
  "$(stranger "select case when count(*) > 0 then 1 else 0 end from public.public_chapter_list();")"

want "and the chapter list function hands back exactly two columns" "2" \
  "$(sql "select count(*) from information_schema.routines r
          join information_schema.parameters pa on pa.specific_name = r.specific_name
          where r.routine_name = 'public_chapter_list' and pa.parameter_mode = 'OUT';")"

echo
echo "-- B. What the form refuses to accept -----------------------"

refused "an application with no name" \
  "$(stranger "select public.submit_volunteer_application('{\\\"email\\\":\\\"a@b.com\\\",\\\"consent_references\\\":true}'::jsonb);")"

refused "an application with no email, because we could not reply" \
  "$(stranger "select public.submit_volunteer_application('{\\\"full_name\\\":\\\"X\\\",\\\"consent_references\\\":true}'::jsonb);")"

refused "an application with consent withheld" \
  "$(stranger "select public.submit_volunteer_application('{\\\"full_name\\\":\\\"X\\\",\\\"email\\\":\\\"x@y.com\\\",\\\"consent_references\\\":false}'::jsonb);")"

refused "a yes on the declaration with nothing written against it" \
  "$(stranger "select public.submit_volunteer_application('{\\\"full_name\\\":\\\"X\\\",\\\"email\\\":\\\"x2@y.com\\\",\\\"consent_references\\\":true,\\\"has_disclosure\\\":true}'::jsonb);")"

want "none of those left anything behind" "1" \
  "$(sql "select count(*) from volunteer_applications;")"

echo
echo "-- C. Pressing submit four times ----------------------------"

stranger "select public.submit_volunteer_application('$(form grace@example.com $BENIN)'::jsonb);" >/dev/null
refused "a third from the same address inside a day is refused" \
  "$(stranger "select public.submit_volunteer_application('$(form grace@example.com $BENIN)'::jsonb);")"

R=$(stranger "select public.submit_volunteer_application('$(form GRACE@EXAMPLE.COM $BENIN)'::jsonb);")
refused "and changing the capitals does not get round it" "$R"

R=$(stranger "select public.submit_volunteer_application('$(form someone.else@example.com $BENIN)'::jsonb);")
contains "but a different person can still apply" "VA-" "$R"

echo
echo "-- D. Who can read an application ---------------------------"

want "the National Coordinator reads all of them" "3" \
  "$(as $NC "select count(*) from volunteer_applications;")"

want "a Regional Coordinator reads their own chapter's" "3" \
  "$(as $RC "select count(*) from volunteer_applications;")"

stranger "select public.submit_volunteer_application('$(form auchi.person@example.com $AUCHI)'::jsonb);" >/dev/null
want "and not another chapter's" "3" \
  "$(as $RC "select count(*) from volunteer_applications;")"
want "while the National Coordinator sees that one too" "4" \
  "$(as $NC "select count(*) from volunteer_applications;")"

# The decision from this session, written down as a test so that a later
# change to the policy has to come past it.
want "an admin who is not a coordinator reads none of them" "0" \
  "$(as $PLAINADMIN "select count(*) from volunteer_applications;")"

want "a Team Member reads none either" "0" \
  "$(as $TM "select count(*) from volunteer_applications;")"

lacks "and the faith statement is not reachable by an admin" "private testimony" \
  "$(as $PLAINADMIN "select coalesce(string_agg(faith_statement,' '),'') from volunteer_applications;")"

echo
echo "-- E. Moving one along --------------------------------------"

APP=$(sql "select id from volunteer_applications where email='grace@example.com' order by submitted_at limit 1;")

as $RC "select public.decide_application('$APP','shortlisted');" >/dev/null
want "a coordinator can shortlist their own chapter's applicant" "shortlisted" \
  "$(sql "select status from volunteer_applications where id='$APP';")"

want "and shortlisting is not treated as a final decision" "" \
  "$(sql "select coalesce(decided_at::text,'') from volunteer_applications where id='$APP';")"

# Changed by Batch 7b. Appointing is now gated on the references and the
# interview SAF-005 3.1 requires, so this test puts them on file first.
# Without 7b loaded these two statements fail against tables that do not
# exist yet, which is harmless: the 7a version of decide_application does
# not look at them and the appointment goes through either way. The gate
# itself is tested in run-batch7b-tests.sh section C.
as $RC "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via, referee_is_church_leader) values ('$APP',1,'Pastor Sam','phone',true),('$APP',2,'Ada Nwosu','email',false);" >/dev/null 2>&1
as $RC "insert into interview_records (application_id, panel_names, recommendation) values ('$APP', array['Rita RC','Ngozi NC'], 'appoint');" >/dev/null 2>&1

as $RC "select public.decide_application('$APP','appointed','Strong interview.');" >/dev/null
want "appointing records who decided" "Rita RC" \
  "$(sql "select p.full_name from volunteer_applications a join profiles p on p.id=a.decided_by where a.id='$APP';")"
want "and when" "1" \
  "$(sql "select case when decided_at is not null then 1 else 0 end from volunteer_applications where id='$APP';")"

AUCHI_APP=$(sql "select id from volunteer_applications where email='auchi.person@example.com';")
refused "a coordinator cannot decide on another chapter's applicant" \
  "$(as $RC "select public.decide_application('$AUCHI_APP','declined','no');")"

refused "and neither can an admin" \
  "$(as $PLAINADMIN "select public.decide_application('$AUCHI_APP','declined','no');")"

refused "a made-up decision is refused rather than stored" \
  "$(as $NC "select public.decide_application('$APP','hired_immediately');")"

echo
echo "-- F. What a coordinator may and may not change -------------"

as $RC "update volunteer_applications set coordinator_notes='Called her Tuesday.' where id='$APP';" >/dev/null
want "notes can be added" "Called her Tuesday." \
  "$(sql "select coordinator_notes from volunteer_applications where id='$APP';")"

# The applicant's own words are evidence. A review that can quietly edit
# what was submitted is not a review of anything.
refused "but what the applicant wrote cannot be edited" \
  "$(as $RC "update volunteer_applications set faith_statement='Something else entirely' where id='$APP';")"

refused "nor the disclosure they made" \
  "$(as $RC "update volunteer_applications set has_disclosure=false where id='$APP';")"

refused "nor their referees" \
  "$(as $RC "update volunteer_applications set referee1_name='A friend' where id='$APP';")"

blocked "a Team Member cannot touch an application at all" \
  "$(as $TM "update volunteer_applications set status='appointed' where id='$APP' returning 1;")"

blocked "and cannot delete one" \
  "$(as $TM "delete from volunteer_applications where id='$APP' returning 1;")"

blocked "an admin cannot delete one either" \
  "$(as $PLAINADMIN "delete from volunteer_applications where id='$APP' returning 1;")"

echo
echo "-- G. The audit log ------------------------------------------"

want "an application arriving is recorded" "4" \
  "$(sql "select count(*) from audit_log where action='application_received';")"

want "and a decision on it" "1" \
  "$(sql "select count(*) from audit_log where action='application_decided' and new_value='appointed';")"

want "by reference, so it can be found again" "1" \
  "$(sql "select case when entity_id like 'VA-%' then 1 else 0 end from audit_log where action='application_decided' and new_value='appointed';")"

ALL=$(sql "select coalesce(string_agg(coalesce(detail,'')||' '||coalesce(old_value,'')||' '||coalesce(new_value,''),' '),'') from audit_log where entity='application';")
lacks "the applicant's faith statement is not in the log" "private testimony" "$ALL"
lacks "nor their email address" "grace@example.com" "$ALL"

want "a Regional Coordinator still cannot read the log" "0" \
  "$(as $RC "select count(*) from audit_log;")"

echo
echo "-- H. The twelve month rule ---------------------------------"

DECL=$(sql "select id from volunteer_applications where email='someone.else@example.com';")
as $NC "select public.decide_application('$DECL','declined','Not this time.');" >/dev/null
sql "update volunteer_applications set decided_at = now() - interval '13 months' where id='$DECL';" >/dev/null

refused "a coordinator cannot run the purge" \
  "$(as $RC "select public.purge_old_applications();")"

want "the National Coordinator can, and it removes the old declined one" "1" \
  "$(as $NC "select public.purge_old_applications();")"

# Ageing the appointed one as well, which is the whole point. Left at
# today's date it survives the purge because of its date, and the test
# would pass even if the status check were deleted. Mutation testing
# caught exactly that, so the record is pushed back past the deadline and
# has to survive on the status rule alone.
sql "update volunteer_applications set decided_at = now() - interval '5 years' where status='appointed';" >/dev/null
as $NC "select public.purge_old_applications();" >/dev/null
want "an appointed application survives the purge however old it is" "1" \
  "$(sql "select count(*) from volunteer_applications where status='appointed';")"

want "and a recent declined application is not swept up with it" "0" \
  "$(as $NC "select public.purge_old_applications();")"

echo
echo "-- I. Nothing else moved ------------------------------------"

want "the volunteer register still refuses a Team Member" "0" \
  "$(as $TM "select count(*) from volunteer_register();")"

want "the safeguarding register still refuses an admin" "0" \
  "$(as $PLAINADMIN "select count(*) from safeguarding_incidents;")"

refused "and the audit log is still append-only" \
  "$(sql "update audit_log set action='rewritten';")"

echo
echo "=============================================="
echo " passed: $pass   failed: $fail"
echo "=============================================="
[ "$fail" -eq 0 ] || exit 1
