#!/bin/bash
# Batch 7b. Reference checks, interview records, the January renewal.
#
# BATCH7B-MARKER harness-tests
#
# Three things are being proved here. That screening notes are as closed
# as the application they belong to, admins included. That the appointment
# gate refuses for the reason SAF-005 actually gives rather than for a
# reason that happens to be convenient. And that the renewal list and the
# lapse it triggers behave on the calendar, not on wishful thinking.
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
#          batch7b-references-interviews-renewals.sql" bash _harness/setup.sh
#   bash _harness/run-batch7b-tests.sh

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

# The seeded "Ada Admin" carries role NC as well as the admin flag, so an
# assertion against it proves nothing about the flag on its own. Every
# access decision in this batch turns on what a plain admin can reach.
PLAINADMIN=88888888-8888-8888-8888-888888888888
sql "insert into auth.users (id, email) values ('$PLAINADMIN','sysadmin@ycdi.test') on conflict do nothing;" >/dev/null
sql "insert into public.profiles (id, full_name, role, chapter_id, is_admin)
     values ('$PLAINADMIN','Sam Sysadmin','TM',(select id from chapters where name='Benin'), true)
     on conflict (id) do update set is_admin = true, role = 'TM';" >/dev/null

# The Board Safeguarding Chair, who is neither NC nor a coordinator and
# whose access comes from the flag alone.
CHAIR=99999999-9999-9999-9999-999999999999
sql "insert into auth.users (id, email) values ('$CHAIR','chair@ycdi.test') on conflict do nothing;" >/dev/null
sql "insert into public.profiles (id, full_name, role, chapter_id, is_safeguarding_lead)
     values ('$CHAIR','Bola Chair','TM',(select id from chapters where name='Auchi'), true)
     on conflict (id) do update set is_safeguarding_lead = true, role = 'TM';" >/dev/null

BENIN=$(sql "select id from chapters where name='Benin';")
AUCHI=$(sql "select id from chapters where name='Auchi';")

form() {
  local email="$1"; local chapter="$2"; local role="${3:-school_contact}"
  echo "{\\\"full_name\\\":\\\"Grace Adeyemi\\\",\\\"email\\\":\\\"$email\\\",\\\"chapter_id\\\":\\\"$chapter\\\",\\\"role_sought\\\":\\\"$role\\\",\\\"referee1_name\\\":\\\"Pastor Sam\\\",\\\"referee1_is_church_leader\\\":true,\\\"referee2_name\\\":\\\"Ada Nwosu\\\",\\\"faith_statement\\\":\\\"A private testimony.\\\",\\\"has_disclosure\\\":false,\\\"consent_references\\\":true}"
}

# One reference check, written the way a coordinator would after a call.
refcheck() {
  local app="$1"; local slot="$2"; local via="$3"; local church="$4"
  echo "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via, referee_is_church_leader, q1_known_how_long, q2_christian_character, q5_would_entrust_own) values ('$app', $slot, 'Referee $slot', '$via', $church, 'Six years, home fellowship.', 'Yes, steady and known.', 'Yes, without hesitation.');"
}

echo "=============================================="
echo " Batch 7b: references, interviews, renewals"
echo "=============================================="

stranger "select public.submit_volunteer_application('$(form grace@example.com $BENIN)'::jsonb);" >/dev/null
stranger "select public.submit_volunteer_application('$(form auchi.person@example.com $AUCHI)'::jsonb);" >/dev/null
stranger "select public.submit_volunteer_application('$(form eventonly@example.com $BENIN event_only)'::jsonb);" >/dev/null

APP=$(sql "select id from volunteer_applications where email='grace@example.com';")
AUCHI_APP=$(sql "select id from volunteer_applications where email='auchi.person@example.com';")
EVENT_APP=$(sql "select id from volunteer_applications where email='eventonly@example.com';")

echo
echo "-- A. Who can put a reference note on file ------------------"

as $RC "$(refcheck $APP 1 phone true)" >/dev/null
want "the coordinator for the chapter can record one" "1" \
  "$(sql "select count(*) from reference_checks where application_id='$APP';")"

refused "and not on another chapter's applicant" \
  "$(as $RC "$(refcheck $AUCHI_APP 1 phone true)")"

refused "a stranger cannot read reference notes" \
  "$(stranger "select count(*) from reference_checks;")"

refused "nor write one" \
  "$(stranger "$(refcheck $APP 2 phone false)")"

want "an admin who is not a coordinator reads none" "0" \
  "$(as $PLAINADMIN "select count(*) from reference_checks;")"

want "a Team Member reads none either" "0" \
  "$(as $TM "select count(*) from reference_checks;")"

lacks "and the referee's words are not reachable by an admin" "without hesitation" \
  "$(as $PLAINADMIN "select coalesce(string_agg(q5_would_entrust_own,' '),'') from reference_checks;")"

want "the Board Safeguarding Chair reads them without being a coordinator" "1" \
  "$(as $CHAIR "select count(*) from reference_checks;")"

want "the National Coordinator reads them" "1" \
  "$(as $NC "select count(*) from reference_checks;")"

echo
echo "-- B. What the reference record refuses to hold -------------"

refused "a third referee slot, when the form only has two" \
  "$(as $NC "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via) values ('$APP', 3, 'Extra', 'phone');")"

refused "two notes against the same referee slot" \
  "$(as $NC "$(refcheck $APP 1 phone true)")"

refused "a way of getting the reference that is not phone, email or written" \
  "$(as $NC "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via) values ('$APP', 2, 'X', 'heard_it_around');")"

refused "a concern with nothing written against it" \
  "$(as $NC "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via, concern_raised) values ('$APP', 2, 'X', 'phone', true);")"

refused "a follow-up ticked on a reference that raised no concern" \
  "$(as $NC "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via, followup_done, followup_note) values ('$APP', 2, 'X', 'phone', true, 'All fine');")"

echo
echo "-- C. The appointment gate ----------------------------------"

# One reference on file, and SAF-005 3.1 asks for two on a school-contact
# role. This is the state most applications sit in for a week.
R=$(as $RC "select public.decide_application('$APP','appointed');")
refused "appointing on one reference is refused" "$R"
contains "and the refusal says which piece is missing" "Two references are needed" "$R"

as $RC "select public.decide_application('$APP','shortlisted');" >/dev/null
want "but shortlisting is not gated, because that is when the work happens" "shortlisted" \
  "$(sql "select status from volunteer_applications where id='$APP';")"

as $RC "$(refcheck $APP 2 email false)" >/dev/null
R=$(as $RC "select public.decide_application('$APP','appointed');")
contains "with two references but no interview, the interview is named" "An interview record is needed" "$R"

as $RC "insert into interview_records (application_id, panel_names, motivation_faith_notes, recommendation) values ('$APP', array['Rita RC','Ngozi NC'], 'Clear about why.', 'appoint');" >/dev/null
as $RC "select public.decide_application('$APP','appointed');" >/dev/null
want "with both on file, the appointment goes through" "appointed" \
  "$(sql "select status from volunteer_applications where id='$APP';")"

echo
echo "-- D. A written reference the applicant brought in ----------"

# SAF-005 3.3 says a written reference submitted by the applicant is not
# sufficient as a sole source. It is recorded, and it does not count.
sql "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via) values ('$EVENT_APP', 1, 'Letter on file', 'written_from_applicant');" >/dev/null
R=$(as $NC "select public.decide_application('$EVENT_APP','appointed');")
refused "an event volunteer with only a handed-in letter is refused" "$R"
contains "and the refusal asks for phone or email" "phone or email" "$R"

sql "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via) values ('$EVENT_APP', 2, 'Called him', 'phone');" >/dev/null
as $NC "select public.decide_application('$EVENT_APP','appointed');" >/dev/null
want "an event-only role needs one real reference and no interview" "appointed" \
  "$(sql "select status from volunteer_applications where id='$EVENT_APP';")"

echo
echo "-- E. A referee who raised a concern ------------------------"

sql "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via, referee_is_church_leader, concern_raised, concern_detail) values ('$AUCHI_APP', 1, 'Pastor Eze', 'phone', true, true, 'Vague hesitation about temper.');" >/dev/null
sql "insert into reference_checks (application_id, referee_slot, referee_name, obtained_via) values ('$AUCHI_APP', 2, 'Second referee', 'email');" >/dev/null
sql "insert into interview_records (application_id, panel_names, recommendation) values ('$AUCHI_APP', array['Ngozi NC','Bola Chair'], 'appoint');" >/dev/null

R=$(as $NC "select public.decide_application('$AUCHI_APP','appointed');")
refused "an unfollowed concern blocks the appointment" "$R"
contains "and it cites the rule that says so" "3.3" "$R"

as $NC "update reference_checks set followup_done = true, followup_note = 'Spoke to him again, settled.', followup_at = now() where application_id='$AUCHI_APP' and concern_raised;" >/dev/null
as $NC "select public.decide_application('$AUCHI_APP','appointed');" >/dev/null
want "once followed up, it proceeds" "appointed" \
  "$(sql "select status from volunteer_applications where id='$AUCHI_APP';")"

echo
echo "-- F. Interview records --------------------------------------"

refused "a panel of one is refused, HR-004 section 6" \
  "$(as $NC "insert into interview_records (application_id, panel_names) values ('$EVENT_APP', array['Only Me']);")"

refused "a panel of nobody is refused too" \
  "$(as $NC "insert into interview_records (application_id, panel_names) values ('$EVENT_APP', array[]::text[]);")"

refused "a score of six on a five point scale" \
  "$(as $NC "insert into interview_records (application_id, panel_names, competency_score) values ('$EVENT_APP', array['A','B'], 6);")"

refused "an appointment with conditions and no conditions written" \
  "$(as $NC "insert into interview_records (application_id, panel_names, recommendation) values ('$EVENT_APP', array['A','B'], 'appoint_with_conditions');")"

want "an admin reads no interview notes" "0" \
  "$(as $PLAINADMIN "select count(*) from interview_records;")"

# A panel that said no is a stop, but not a permanent one. The newest
# interview is the one that counts, and the old record stays on file.
sql "insert into interview_records (application_id, panel_names, recommendation, held_on) values ('$EVENT_APP', array['A','B'], 'do_not_appoint', current_date);" >/dev/null
sql "update volunteer_applications set status='shortlisted', decided_at=null, decided_by=null where id='$EVENT_APP';" >/dev/null
contains "the most recent panel recommending against blocks appointment" "recommended not appointing" \
  "$(as $NC "select public.decide_application('$EVENT_APP','appointed');")"

sql "insert into interview_records (application_id, panel_names, recommendation, held_on) values ('$EVENT_APP', array['A','C'], 'appoint', current_date + 14);" >/dev/null
as $NC "select public.decide_application('$EVENT_APP','appointed');" >/dev/null
want "a later panel that says yes overrides the earlier no" "appointed" \
  "$(sql "select status from volunteer_applications where id='$EVENT_APP';")"

want "and the earlier refusal is still on file, not edited away" "2" \
  "$(sql "select count(*) from interview_records where application_id='$EVENT_APP';")"

# Ordering is the whole rule here, so it has to be tested backwards too.
# Without the order by, whichever row came back first would decide.
sql "insert into interview_records (application_id, panel_names, recommendation, held_on) values ('$EVENT_APP', array['A','D'], 'do_not_appoint', current_date + 30);" >/dev/null
sql "update volunteer_applications set status='shortlisted', decided_at=null, decided_by=null where id='$EVENT_APP';" >/dev/null
contains "and a newer no after a yes blocks it again" "recommended not appointing" \
  "$(as $NC "select public.decide_application('$EVENT_APP','appointed');")"

echo
echo "-- G. Feeding the Batch 3 screening record -------------------"

# The dates in volunteer_screening have been empty since Batch 3. Linking
# an appointed applicant to a profile is what fills them.
NEWBIE=77777777-7777-7777-7777-777777777777
sql "insert into auth.users (id, email) values ('$NEWBIE','grace@example.com') on conflict do nothing;" >/dev/null
sql "insert into public.profiles (id, full_name, role, chapter_id) values ('$NEWBIE','Grace Adeyemi','TM','$BENIN') on conflict (id) do nothing;" >/dev/null
sql "insert into public.volunteer_records (profile_id, status) values ('$NEWBIE','onboarding') on conflict (profile_id) do nothing;" >/dev/null

want "nothing is stamped before the link is made" "0" \
  "$(sql "select count(*) from volunteer_screening where profile_id='$NEWBIE';")"

as $NC "update volunteer_applications set linked_profile_id='$NEWBIE' where id='$APP';" >/dev/null

want "linking creates the screening record" "1" \
  "$(sql "select count(*) from volunteer_screening where profile_id='$NEWBIE';")"
want "with both reference dates carried across" "1" \
  "$(sql "select case when reference_one_on is not null and reference_two_on is not null then 1 else 0 end from volunteer_screening where profile_id='$NEWBIE';")"
want "and the church reference date" "1" \
  "$(sql "select case when church_reference_on is not null then 1 else 0 end from volunteer_screening where profile_id='$NEWBIE';")"
want "and the interview date" "1" \
  "$(sql "select case when interview_on is not null then 1 else 0 end from volunteer_screening where profile_id='$NEWBIE';")"
want "the six onboarding steps in Batch 6a learn the same two dates" "1" \
  "$(sql "select case when references_received_on is not null and interviewed_on is not null then 1 else 0 end from volunteer_records where profile_id='$NEWBIE';")"

echo
echo "-- H. The 31 January renewal ---------------------------------"

want "the deadline is the 31st of January" "01-31" \
  "$(sql "select to_char(public.renewal_deadline(2026),'MM-DD');")"

sql "update volunteer_records set status='active' where profile_id='$NEWBIE';" >/dev/null

want "somebody with no declaration this year appears on the list" "1" \
  "$(as $NC "select count(*) from declaration_renewals() where profile_id='$NEWBIE';")"

want "a Team Member cannot read the renewal list" "0" \
  "$(as $TM "select count(*) from declaration_renewals();")"

want "an admin who is not a coordinator cannot either" "0" \
  "$(as $PLAINADMIN "select count(*) from declaration_renewals();")"

want "the coordinator sees their own chapter" "1" \
  "$(as $RC "select count(*) from declaration_renewals() where profile_id='$NEWBIE';")"

refused "the lapse cannot be applied before the deadline has passed" \
  "$(as $NC "select public.apply_renewal_lapses(extract(year from current_date)::int + 1);")"

refused "and a Team Member cannot apply it at all" \
  "$(as $TM "select public.apply_renewal_lapses(2020);")"

# 2020 is safely past, so the deadline check cannot be the thing carrying
# this test. Everybody active without a 2020 declaration should lapse.
BEFORE=$(sql "select count(*) from volunteer_records where status='active';")
GONE=$(as $NC "select public.apply_renewal_lapses(2020);")
want "the National Coordinator can apply the lapse for a year gone by" "$BEFORE" "$GONE"
want "and the person is now inactive" "inactive" \
  "$(sql "select status from volunteer_records where profile_id='$NEWBIE';")"
contains "with the reason written on the record" "not renewed" \
  "$(sql "select notes from volunteer_records where profile_id='$NEWBIE';")"

# 3.5 says inactive "until the declaration is completed", so completing it
# has to be what brings somebody back.
sql "insert into safeguarding_declarations (profile_id, kind, signed_on, covers_year) values ('$NEWBIE','renewal', current_date, extract(year from current_date)::int);" >/dev/null
want "signing this year's declaration brings them back" "active" \
  "$(sql "select status from volunteer_records where profile_id='$NEWBIE';")"

want "and they now read as renewed on the list" "renewed" \
  "$(as $NC "select state from declaration_renewals() where profile_id='$NEWBIE';")"

# An old declaration is not a renewal. Without the year check this would
# reactivate somebody on a five year old signature.
sql "update volunteer_records set status='inactive' where profile_id='$NEWBIE';" >/dev/null
sql "insert into safeguarding_declarations (profile_id, kind, signed_on, covers_year) values ('$NEWBIE','initial', '2019-03-01', 2019);" >/dev/null
want "a declaration from years ago does not reactivate anybody" "inactive" \
  "$(sql "select status from volunteer_records where profile_id='$NEWBIE';")"

echo
echo "-- I. The audit log ------------------------------------------"

want "a reference check being recorded is logged" "1" \
  "$(sql "select case when count(*) > 0 then 1 else 0 end from audit_log where action='reference_recorded';")"

want "so is an interview" "1" \
  "$(sql "select case when count(*) > 0 then 1 else 0 end from audit_log where action='interview_recorded';")"

want "and the follow-up that unlocked an appointment" "1" \
  "$(sql "select case when count(*) > 0 then 1 else 0 end from audit_log where action='reference_concern_followed_up';")"

ALL=$(sql "select coalesce(string_agg(coalesce(detail,'')||' '||coalesce(old_value,'')||' '||coalesce(new_value,'')||' '||coalesce(entity_id,''),' '),'') from audit_log;")
lacks "the referee's words are not in the log" "without hesitation" "$ALL"
lacks "nor the concern that was raised" "temper" "$ALL"
lacks "nor the panel's notes" "Clear about why" "$ALL"
lacks "nor the applicant's faith statement" "private testimony" "$ALL"

want "a coordinator still cannot read the log" "0" \
  "$(as $RC "select count(*) from audit_log;")"

echo
echo "-- J. Nothing else moved -------------------------------------"

want "the safeguarding register still refuses an admin" "0" \
  "$(as $PLAINADMIN "select count(*) from safeguarding_incidents;")"

want "the volunteer register still refuses a Team Member" "0" \
  "$(as $TM "select count(*) from volunteer_register();")"

refused "a stranger still cannot read the staff list" \
  "$(stranger "select count(*) from profiles;")"

refused "the audit log is still append-only" \
  "$(sql "update audit_log set action='rewritten';")"

echo
echo "=============================================="
echo " passed: $pass   failed: $fail"
echo "=============================================="
[ "$fail" -eq 0 ] || exit 1
