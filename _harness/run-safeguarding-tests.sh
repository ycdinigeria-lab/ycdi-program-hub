#!/bin/bash
# Safeguarding is the one area where being an admin grants nothing.
# These tests exist mainly to prove that, and to prove the register
# cannot be quietly rewritten after the fact.

NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444
PLAIN=77777777-7777-7777-7777-777777777777

pass=0; fail=0

as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
root() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1
}
want() {
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1))
  else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi
}
run() {
  local expect="$1" uid="$2" desc="$3" sql="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1)
  rc=$?
  # "INSERT 0 1" is success, the zero is an oid. Only "INSERT 0 0" is a refusal.
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

# The seeded admin is also an NC, which would hide the very thing these
# tests are about. Add a plain admin holding no safeguarding role.
root "insert into auth.users (id, email) values ('$PLAIN','plainadmin@ycdi.test') on conflict do nothing;" >/dev/null
root "insert into public.profiles (id, full_name, role, chapter_id, is_admin) values ('$PLAIN','Bola PlainAdmin','TM', $BENIN, true) on conflict do nothing;" >/dev/null

echo "RAISING A CONCERN"
run ALLOW "$RC" "coordinator reports a disclosure in their own chapter" \
  "select public.raise_incident($BENIN,'disclosure', current_date - 1, 'She said her uncle hits her when he drinks. Her words.','Classroom 3','Mrs Eze was in the room');"
run DENY "$RC" "reporting into a chapter that is not theirs" \
  "select public.raise_incident($LAGOS,'disclosure', current_date - 1, 'Something happened');"
run DENY "$RC" "an empty account" \
  "select public.raise_incident($BENIN,'observation', current_date, '   ');"
run DENY "$RC" "an incident dated in the future" \
  "select public.raise_incident($BENIN,'observation', current_date + 5, 'Saw bruising');"
run DENY "$RC" "an allegation with nobody named" \
  "select public.raise_incident($BENIN,'allegation_staff', current_date, 'A volunteer behaved badly');"
want "a reference number was issued" 1 "$(as $RC "select count(*) from public.safeguarding_incidents where reference like 'SG-%';")"

echo
echo "ADMIN IS NOT A SAFEGUARDING ROLE"
want "the Chapter DSO sees it"                  1 "$(as $RC "select count(*) from public.safeguarding_incidents;")"
want "the National Coordinator sees it"         1 "$(as $NC "select count(*) from public.safeguarding_incidents;")"
want "a plain admin sees nothing"               0 "$(as $PLAIN "select count(*) from public.safeguarding_incidents;")"
want "a team member sees nothing"               0 "$(as $TM "select count(*) from public.safeguarding_incidents;")"
want "the plain admin sees no action trail"     0 "$(as $PLAIN "select count(*) from public.incident_actions;")"

echo
echo "THE REPORTER KEEPS THEIR OWN REPORT"
root "update public.safeguarding_incidents set chapter_id = $LAGOS;" >/dev/null
want "moved to another chapter, the reporter still sees it" 1 "$(as $RC "select count(*) from public.safeguarding_incidents;")"
run DENY "$RC" "but cannot rewrite the account once it leaves their chapter" \
  "update public.safeguarding_incidents set account = 'Actually nothing happened';"
root "update public.safeguarding_incidents set chapter_id = $BENIN;" >/dev/null

echo
echo "THE TRAIL IS APPEND ONLY"
want "reporting wrote the first entry" 1 "$(as $RC "select count(*) from public.incident_actions;")"
run DENY "$RC"    "editing an entry in the trail"    "update public.incident_actions set detail = 'changed';"
run DENY "$RC"    "deleting an entry from the trail" "delete from public.incident_actions;"
run DENY "$NC"    "deleting the incident itself"     "delete from public.safeguarding_incidents;"
run DENY "$PLAIN" "a plain admin deleting it"        "delete from public.safeguarding_incidents;"

echo
echo "ESCALATION AND REFERRAL"
run DENY "$TM" "a team member marking the NC notified" \
  "select public.mark_nc_notified((select id from public.safeguarding_incidents limit 1));"
run ALLOW "$RC" "the Chapter DSO marking the NC notified" \
  "select public.mark_nc_notified((select id from public.safeguarding_incidents limit 1));"
want "status moved on" "Under review" "$(as $RC "select status from public.safeguarding_incidents limit 1;")"
want "the trail grew"  2              "$(as $RC "select count(*) from public.incident_actions;")"
run DENY "$RC" "a coordinator referring the matter to the police" \
  "select public.refer_incident((select id from public.safeguarding_incidents limit 1),'Nigeria Police Force');"
run ALLOW "$NC" "the National Coordinator referring it" \
  "select public.refer_incident((select id from public.safeguarding_incidents limit 1),'Nigeria Police Force','Station notified by phone');"
want "referral clears the retention date, so it is kept indefinitely" 0 \
  "$(as $NC "select count(*) from public.safeguarding_incidents where retain_until is not null;")"
run DENY "$RC" "a coordinator closing the concern" \
  "select public.close_incident((select id from public.safeguarding_incidents limit 1),'All fine');"
run DENY "$NC" "closing with no outcome recorded" \
  "select public.close_incident((select id from public.safeguarding_incidents limit 1),'  ');"
run ALLOW "$NC" "the National Coordinator closing it with an outcome" \
  "select public.close_incident((select id from public.safeguarding_incidents limit 1),'Referred to police; school informed; family supported.');"

echo
echo "SCENARIO D SUSPENDS IMMEDIATELY"
as "$RC" "select public.raise_incident($BENIN,'allegation_staff', current_date, 'A parent said a volunteer messaged their daughter privately.', null, null, null, null, '13-15','$TM');" >/dev/null
want "the accused is suspended without anybody deciding" 1 \
  "$(as $RC "select count(*) from public.safeguarding_incidents where scenario='allegation_staff' and accused_suspended;")"
want "and the suspension is in the trail" 1 \
  "$(as $RC "select count(*) from public.incident_actions where action='Accused suspended';")"

echo
echo "RETENTION"
want "a 10 to 12 year old is kept 15 years, not 7" "$(root "select (current_date + interval '15 years')::date;")" \
  "$(root "select public.incident_retention('10-12', current_date);")"
want "a 16 to 17 year old is kept 9 years"          "$(root "select (current_date + interval '9 years')::date;")" \
  "$(root "select public.incident_retention('16-17', current_date);")"
want "an adult gets the 7 year floor"               "$(root "select (current_date + interval '7 years')::date;")" \
  "$(root "select public.incident_retention('18+', current_date);")"

echo
echo "NOTIFICATIONS SAY NOTHING ABOUT THE CHILD"
want "the National Coordinator was told"      2 "$(as $NC "select count(*) from public.notifications where profile_id='$NC' and kind='safeguarding';")"
want "no detail leaked into the notice"       0 "$(as $NC "select count(*) from public.notifications where kind='safeguarding' and (body ilike '%uncle%' or body ilike '%daughter%');")"

echo
echo "SAFEGUARDING LEAD"
run DENY  "$RC"    "a coordinator appointing a safeguarding lead" "select public.set_safeguarding_lead('$RC', true);"
run DENY  "$PLAIN" "a plain admin appointing themselves"          "select public.set_safeguarding_lead('$PLAIN', true);"
run ALLOW "$NC"    "the National Coordinator appointing one"      "select public.set_safeguarding_lead('$PLAIN', true);"
want "the lead now sees the register" 2 "$(as $PLAIN "select count(*) from public.safeguarding_incidents;")"
run DENY "$NC"    "removing the only remaining lead"              "select public.set_safeguarding_lead('$PLAIN', false);"
run DENY "$PLAIN" "setting the flag by editing a profile instead" "update public.profiles set is_safeguarding_lead = true where id = '$RC';"

echo
echo "TRAINING AND DECLARATIONS"
as "$NC" "insert into public.safeguarding_training (profile_id, kind, completed_on, recorded_by) values ('$RC','refresher', current_date - 30, '$NC');" >/dev/null
want "annual training is given an expiry automatically" "$(root "select (current_date - 30 + interval '1 year')::date;")" \
  "$(as $NC "select expires_on from public.safeguarding_training where profile_id='$RC';")"
run DENY "$TM" "a team member recording their own training" \
  "insert into public.safeguarding_training (profile_id, kind, completed_on) values ('$TM','refresher', current_date);"
as "$NC" "insert into public.safeguarding_declarations (profile_id, kind, signed_on, covers_year, recorded_by) values ('$RC','renewal', current_date, extract(year from current_date), '$NC');" >/dev/null
run DENY "$NC" "two declarations for one person in one year" \
  "insert into public.safeguarding_declarations (profile_id, kind, signed_on, covers_year) values ('$RC','renewal', current_date, extract(year from current_date));"
run DENY "$NC" "editing a signed declaration afterwards" \
  "update public.safeguarding_declarations set signed_on = current_date - 400;"

echo
echo "WHO IS ACTUALLY CLEARED"
want "not cleared while the screening file is empty" f "$(as $NC "select public.screening_complete('$RC');")"
as "$NC" "insert into public.volunteer_screening (profile_id, role_category, application_on, reference_one_on, reference_two_on, church_reference_on, background_decl_on, interview_on, orientation_on, recorded_by) values ('$RC','regional_coordinator', current_date - 400, current_date - 395, current_date - 395, current_date - 390, current_date - 390, current_date - 385, current_date - 380, '$NC');" >/dev/null
want "cleared once everything is on file" t "$(as $NC "select public.screening_complete('$RC');")"
want "only that one person is cleared"    1 "$(as $NC "select count(*) from public.safeguarding_compliance() where cleared;")"
run DENY "$RC" "a coordinator starting a screening file" \
  "insert into public.volunteer_screening (profile_id, role_category) values ('$TM','general_volunteer');"
want "a coordinator sees no screening files" 0 "$(as $RC "select count(*) from public.volunteer_screening;")"
want "a team member sees none either"        0 "$(as $TM "select count(*) from public.volunteer_screening;")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
