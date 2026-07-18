#!/bin/bash
# Checks the participant rules that YCDI's own policies require, and
# the ones that are easy to break by accident.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444

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
  # Row rules hide rows rather than erroring, so a statement that changed
  # nothing is a refusal. Note "INSERT 0 1" is a SUCCESS: the zero is the
  # oid, not the row count. Only "INSERT 0 0" means nothing went in.
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

echo "CREATING A PARTICIPANT"
run ALLOW "$RC" "coordinator adds a young person in their own chapter" \
  "insert into public.participants (chapter_id, full_name, gender, age_band, class_level, school, consent_on, consent_ref, created_by) values ($BENIN,'Ada Student','Female','13-15','JSS2','Government College Benin', current_date - 3, 'Paper form 2026/014','$RC');"
run DENY "$RC" "coordinator adds somebody to another chapter" \
  "insert into public.participants (chapter_id, full_name, age_band, consent_on) values ($LAGOS,'Not Mine','13-15', current_date);"
run DENY "$TM" "team member adds a participant" \
  "insert into public.participants (chapter_id, full_name, age_band, consent_on) values ($BENIN,'Sneaky','13-15', current_date);"

echo
echo "CONSENT IS A PRECONDITION, NOT A CHECKBOX"
run DENY "$RC" "a participant with no recorded consent date" \
  "insert into public.participants (chapter_id, full_name, age_band) values ($BENIN,'No Consent','13-15');"
run DENY "$RC" "consent dated in the future" \
  "insert into public.participants (chapter_id, full_name, age_band, consent_on) values ($BENIN,'Future Consent','13-15', current_date + 30);"

echo
echo "CONTACT DETAILS FOR MINORS"
run DENY "$RC" "storing a phone number for a 13 to 15 year old" \
  "insert into public.participants (chapter_id, full_name, age_band, consent_on, phone) values ($BENIN,'Minor Phone','13-15', current_date, '+2348000000000');"
run DENY "$RC" "storing an email for a 16 to 17 year old" \
  "insert into public.participants (chapter_id, full_name, age_band, consent_on, email) values ($BENIN,'Minor Email','16-17', current_date, 'child@example.com');"
run ALLOW "$RC" "storing a phone number for an 18 plus participant" \
  "insert into public.participants (chapter_id, full_name, age_band, consent_on, phone) values ($BENIN,'Tertiary Student','18+', current_date, '+2348011111111');"
run DENY "$RC" "adding a phone to an existing minor by editing later" \
  "update public.participants set phone='+2348022222222' where full_name='Ada Student';"

echo
echo "WHO CAN SEE WHOM"
as "$ADMIN" "insert into public.participants (chapter_id, full_name, age_band, consent_on, created_by) values ($LAGOS,'Lagos Youth','16-17', current_date,'$ADMIN');" >/dev/null
want "Benin coordinator sees only Benin"  2 "$(as $RC "select count(*) from public.participants;")"
want "National Coordinator sees everyone" 3 "$(as $NC "select count(*) from public.participants;")"
want "admin sees everyone"                3 "$(as $ADMIN "select count(*) from public.participants;")"
want "team member sees nobody"            0 "$(as $TM "select count(*) from public.participants;")"

echo
echo "THE PATHWAY"
want "everybody starts at Contact" Contact "$(as $RC "select stage from public.participants where full_name='Ada Student';")"
want "history is written from the start" 1 "$(as $RC "select count(*) from public.participant_stages s join public.participants p on p.id=s.participant_id where p.full_name='Ada Student';")"
as "$RC" "select public.move_participant_stage((select id from participants where full_name='Ada Student'),'Connect','Came back to the second meeting');" >/dev/null
want "the current stage moved" Connect "$(as $RC "select stage from public.participants where full_name='Ada Student';")"
want "and the move was recorded"  2 "$(as $RC "select count(*) from public.participant_stages s join public.participants p on p.id=s.participant_id where p.full_name='Ada Student';")"
run DENY "$RC" "moving somebody in another chapter" \
  "select public.move_participant_stage((select id from participants where full_name='Lagos Youth'),'Commit','not mine');"
run DENY "$RC" "an invented stage" \
  "select public.move_participant_stage((select id from participants where full_name='Ada Student'),'Superstar','nope');"
want "movement report counts the real move, not the first record" 1 "$(as $RC "select coalesce(sum(people),0) from public.stage_movement(90);")"

echo
echo "CONSENT BY USAGE"
as "$RC" "insert into public.participant_consents (participant_id, consent_type, granted_by, document_ref, recorded_by) select id,'registration','Mrs Okon (mother)','Paper form 2026/014','$RC' from participants where full_name='Ada Student';" >/dev/null
as "$RC" "insert into public.participant_consents (participant_id, consent_type, granted_by, document_ref, recorded_by) select id,'photo_published','Mrs Okon (mother)','Photo consent 2026/031','$RC' from participants where full_name='Ada Student';" >/dev/null
want "two separate consents on file" 2 "$(as $RC "select count(*) from public.participant_consents c join public.participants p on p.id=c.participant_id where p.full_name='Ada Student';")"
run DENY "$RC" "a second live consent of the same type" \
  "insert into public.participant_consents (participant_id, consent_type) select id,'photo_published' from participants where full_name='Ada Student';"
run DENY "$RC" "an invented consent type" \
  "insert into public.participant_consents (participant_id, consent_type) select id,'billboard' from participants where full_name='Ada Student';"

echo
echo "WITHDRAWAL RAISES SOMETHING TO ACT ON"
want "nothing outstanding yet" 0 "$(as $RC "select count(*) from public.consent_withdrawals_outstanding();")"
as "$RC" "select public.withdraw_participant_consent((select c.id from participant_consents c join participants p on p.id=c.participant_id where p.full_name='Ada Student' and c.consent_type='photo_published'));" >/dev/null
want "the withdrawal appears for action" 1 "$(as $RC "select count(*) from public.consent_withdrawals_outstanding();")"
run ALLOW "$RC" "the same consent can be granted again afterwards" \
  "insert into public.participant_consents (participant_id, consent_type) select id,'photo_published' from participants where full_name='Ada Student';"
want "another chapter's withdrawal is not their problem" 0 "$(as $NC "select count(*) from public.consent_withdrawals_outstanding() where chapter_id = $LAGOS;")"

echo
echo "NOTHING GETS QUIETLY DELETED"
run DENY "$RC" "coordinator deletes a participant"  "delete from public.participants where full_name='Ada Student';"
run DENY "$ADMIN" "admin deletes a participant"     "delete from public.participants where full_name='Ada Student';"
run DENY "$RC" "coordinator deletes a consent trail" "delete from public.participant_consents;"
run ALLOW "$RC" "a participant can be marked inactive instead" \
  "update public.participants set active=false, left_reason='Left the school' where full_name='Tertiary Student';"

echo
echo "ATTENDANCE AND MENTORS"
run ALLOW "$RC" "recording attendance at their own programme" \
  "insert into public.participant_attendance (participant_id, program_id, recorded_by) select p.id,'aaaaaaaa-0000-0000-0000-000000000001','$RC' from participants p where p.full_name='Ada Student';"
run DENY "$TM" "team member records attendance" \
  "insert into public.participant_attendance (participant_id, program_id) select id,'aaaaaaaa-0000-0000-0000-000000000001' from participants where full_name='Ada Student';"
run ALLOW "$RC" "assigning a mentor" \
  "insert into public.participant_mentors (participant_id, mentor_id, assigned_by) select id,'$RC','$RC' from participants where full_name='Ada Student';"
run DENY "$RC" "a second live mentor for the same person" \
  "insert into public.participant_mentors (participant_id, mentor_id) select id,'$TM' from participants where full_name='Ada Student';"

echo
echo "SUMMARY NUMBERS RESPECT THE SAME LIMITS"
want "Benin coordinator's summary covers Benin only" 1 "$(as $RC "select count(distinct chapter_id) from public.stage_summary();")"
want "National Coordinator sees both chapters"       2 "$(as $NC "select count(distinct chapter_id) from public.stage_summary();")"
want "team member's summary is empty"                0 "$(as $TM "select count(*) from public.stage_summary();")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
