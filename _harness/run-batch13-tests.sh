#!/bin/bash
# BATCH13-MARKER team-member-participants
# Checks the narrow door a team member gets in Batch 13: they see and work
# with a young person only when they added that record or currently mentor
# them, in their own chapter, and nothing else. Coordinator-only actions
# stay coordinator-only. A team member can record one mentee's attendance
# through the scoped call, but has no direct way onto the attendance table.
#
# Two rules are easy to test for the wrong reason, so they get isolated:
#   - the mentor insert's "mentor_id = auth.uid()" clause is tried on a
#     young person the team member owns but that has NO live mentor, so the
#     one-live-mentor index is not the thing doing the refusing.
#   - assign_mentor's same-chapter check is tried with a mentor who is a
#     valid role (a Lagos team member) in a different chapter, so the role
#     check is not the thing doing the refusing.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444
LTM=77777777-7777-7777-7777-777777777777   # Lagos team member (valid role, wrong chapter)
BNC=88888888-8888-8888-8888-888888888888   # Benin-chapter NC (right chapter, wrong role)

BENIN_PROG=aaaaaaaa-0000-0000-0000-000000000001
BENIN_PROG2=aaaaaaaa-0000-0000-0000-000000000003
LAGOS_PROG=bbbbbbbb-0000-0000-0000-000000000001

pass=0; fail=0

as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
# Superuser, no role set. Only for seeding accounts and cross-chapter
# fixtures that ordinary row rules would, correctly, get in the way of.
raw() {
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
# Two accounts the seed does not carry: a Lagos team member and a Benin NC.
raw "insert into auth.users (id,email) values ('$LTM','ltm@ycdi.test'),('$BNC','bnc@ycdi.test');" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values ('$LTM','Lola LagosTM','TM',$LAGOS,false),('$BNC','Bode BeninNC','NC',$BENIN,false);" >/dev/null

# A dated Benin programme so attendance can land, and a dated Lagos one for
# the cross-chapter check.
as  "$RC" "update public.programs set date='2026-03-04' where id='$BENIN_PROG';" >/dev/null
raw "insert into public.programs (id,title,chapter_id,status,date,submitted_by) values ('$LAGOS_PROG','Lagos outreach',$LAGOS,'Approved','2026-03-05','$LTM');" >/dev/null

# Young people, each put where a specific rule can be seen on its own.
#   Deji  - the team member added and self-mentors        (owns, both ways)
#   Efe   - the team member added, no mentor yet           (owns via created_by only)
#   Femi  - the coordinator added, team member has no tie  (not owned)
#   Gina  - the coordinator added, team member mentors     (owns via live mentor only)
#   Hana  - a Lagos young person                           (another chapter)
as "$TM"    "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($BENIN,'Deji Owned','13-15',current_date-2,'$TM');" >/dev/null
as "$TM"    "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($BENIN,'Efe NoMentor','13-15',current_date-2,'$TM');" >/dev/null
as "$RC"    "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($BENIN,'Femi RCOnly','13-15',current_date-2,'$RC');" >/dev/null
as "$RC"    "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($BENIN,'Gina Mentored','13-15',current_date-2,'$RC');" >/dev/null
as "$ADMIN" "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($LAGOS,'Hana Lagos','16-17',current_date-2,'$ADMIN');" >/dev/null

pid() { as "$ADMIN" "select id from participants where full_name='$1';"; }
DEJI=$(pid 'Deji Owned'); EFE=$(pid 'Efe NoMentor'); FEMI=$(pid 'Femi RCOnly')
GINA=$(pid 'Gina Mentored'); HANA=$(pid 'Hana Lagos')

# Deji self-mentored by the team member. Gina mentored by the team member
# but added by the coordinator, so the coordinator sets that link up.
as "$TM" "insert into participant_mentors (participant_id, mentor_id) values ('$DEJI','$TM');" >/dev/null
as "$RC" "select public.assign_mentor('$GINA','$TM');" >/dev/null

# A mentor link the app would never permit: the Benin team member tied to a
# Lagos young person, forced straight into the table. Ownership must still
# refuse to reach across the chapter line.
raw "insert into participant_mentors (participant_id, mentor_id) values ('$HANA','$TM');" >/dev/null

echo "WHAT A TEAM MEMBER CAN SEE"
want "sees a young person they added"                         1 "$(as $TM "select count(*) from participants where id='$DEJI';")"
want "sees one they added but do not yet mentor"              1 "$(as $TM "select count(*) from participants where id='$EFE';")"
want "sees one they mentor but did not add"                   1 "$(as $TM "select count(*) from participants where id='$GINA';")"
want "does not see a chapter-mate's they neither added nor mentor" 0 "$(as $TM "select count(*) from participants where id='$FEMI';")"
want "does not see another chapter's young person"            0 "$(as $TM "select count(*) from participants where id='$HANA';")"
want "ownership never reaches across chapters, even on a stray link" f "$(as $TM "select public.owns_participant('$HANA');")"
want "sees only their own three, not the whole chapter"       3 "$(as $TM "select count(*) from participants;")"
want "the coordinator still sees the whole Benin list"        4 "$(as $RC "select count(*) from participants where chapter_id=$BENIN;")"
want "the National Coordinator sees the Benin young people"   4 "$(as $NC "select count(*) from participants where chapter_id=$BENIN;")"

echo
echo "ADDING A YOUNG PERSON"
run ALLOW "$TM"   "a team member adds one in their own chapter, under their own name" \
  "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($BENIN,'Ada Added','13-15',current_date-2,'$TM');"
run DENY  "$TM"   "a team member cannot file one under someone else's name" \
  "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($BENIN,'Wrong Name','13-15',current_date-2,'$RC');"
run DENY  "$TM"   "a team member cannot add one in another chapter" \
  "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($LAGOS,'Wrong Chapter','13-15',current_date-2,'$TM');"
run ALLOW "$RC"   "the coordinator still adds freely" \
  "insert into participants (chapter_id,full_name,age_band,consent_on,created_by) values ($BENIN,'RC Added','13-15',current_date-2,'$RC');"

echo
echo "EDITING"
run ALLOW "$TM"   "a team member edits a young person they own" \
  "update participants set school='St Marys' where id='$DEJI';"
run DENY  "$TM"   "a team member cannot edit one they do not own" \
  "update participants set school='St Marys' where id='$FEMI';"

echo
echo "CONSENTS AND STAGES FOLLOW OWNERSHIP"
run ALLOW "$TM"   "a team member records a consent for one they own" \
  "insert into participant_consents (participant_id, consent_type) values ('$DEJI','registration');"
run DENY  "$TM"   "a team member cannot record a consent for one they do not own" \
  "insert into participant_consents (participant_id, consent_type) values ('$FEMI','registration');"
want "reads the stage history of one they own"                1 "$(as $TM "select count(*) from participant_stages where participant_id='$DEJI';")"
want "cannot read the stage history of one they do not own"   0 "$(as $TM "select count(*) from participant_stages where participant_id='$FEMI';")"

echo
echo "MENTOR ROWS"
# The mentor_id = self clause, isolated: Efe is owned but has no live mentor,
# so the one-live-mentor index cannot be what refuses this.
run DENY  "$TM"   "a team member cannot name someone else as mentor, even for one they own" \
  "insert into participant_mentors (participant_id, mentor_id) values ('$EFE','$RC');"
run ALLOW "$TM"   "a team member self-mentors one they added" \
  "insert into participant_mentors (participant_id, mentor_id) values ('$EFE','$TM');"
run DENY  "$TM"   "a team member cannot add a mentor row for one they do not own" \
  "insert into participant_mentors (participant_id, mentor_id) values ('$FEMI','$TM');"

echo
echo "MOVING ALONG THE PATHWAY"
run ALLOW "$TM"   "a team member moves their own mentee along" \
  "select public.move_participant_stage('$DEJI','Connect','moved by the mentor');"
run DENY  "$TM"   "a team member cannot move one they do not own" \
  "select public.move_participant_stage('$FEMI','Connect');"
run ALLOW "$RC"   "the coordinator still moves anyone in the chapter" \
  "select public.move_participant_stage('$FEMI','Connect');"

echo
echo "ASSIGNING AND ENDING A MENTOR, COORDINATOR ONLY"
run DENY  "$TM"   "a team member cannot assign a mentor" \
  "select public.assign_mentor('$GINA','$TM');"
run DENY  "$RC"   "a coordinator cannot assign a mentor from another chapter" \
  "select public.assign_mentor('$GINA','$LTM');"
run DENY  "$RC"   "a coordinator cannot assign a mentor who is neither team member nor coordinator" \
  "select public.assign_mentor('$GINA','$BNC');"
run ALLOW "$RC"   "a coordinator reassigns the mentor" \
  "select public.assign_mentor('$GINA','$RC');"
want "reassigning leaves exactly one live mentor"             1 "$(as $RC "select count(*) from participant_mentors where participant_id='$GINA' and ended_on is null;")"
want "once the mentorship moved on, the old mentor loses ownership" 0 "$(as $TM "select count(*) from participants where id='$GINA';")"
run ALLOW "$RC"   "a coordinator ends the mentorship" \
  "select public.end_mentorship('$GINA');"
want "after ending, no live mentor remains"                   0 "$(as $RC "select count(*) from participant_mentors where participant_id='$GINA' and ended_on is null;")"
run DENY  "$TM"   "a team member cannot end a mentorship, even of their own mentee" \
  "select public.end_mentorship('$DEJI');"

echo
echo "WHO CAN BE PICKED AS A MENTOR"
want "the coordinator is offered the chapter's team member and coordinator" 2 "$(as $RC "select count(*) from public.chapter_mentor_options('$DEJI');")"
want "the National Coordinator is never offered as a mentor" f "$(as $RC "select exists(select 1 from public.chapter_mentor_options('$DEJI') where profile_id='$BNC');")"
want "a team member is offered no options at all"             0 "$(as $TM "select count(*) from public.chapter_mentor_options('$DEJI');")"
want "the options are the young person's own chapter only"    1 "$(as $ADMIN "select count(*) from public.chapter_mentor_options('$HANA');")"

echo
echo "RECORDING ONE MENTEE'S ATTENDANCE"
run ALLOW "$TM"   "a team member records their mentee present" \
  "select public.record_mentee_attendance('$DEJI','$BENIN_PROG', true);"
want "marking present again does not add a second row"        1 "$(as $TM "select public.record_mentee_attendance('$DEJI','$BENIN_PROG', true); select count(*) from participant_attendance where participant_id='$DEJI';" | tail -1)"
run DENY  "$TM"   "a team member cannot write to the attendance table directly" \
  "insert into participant_attendance (participant_id, program_id, attended_on) values ('$DEJI','$BENIN_PROG2', current_date);"
run DENY  "$TM"   "a team member cannot delete an attendance row directly" \
  "delete from participant_attendance where participant_id='$DEJI';"
want "marking absent removes the row and returns false"       f "$(as $TM "select public.record_mentee_attendance('$DEJI','$BENIN_PROG', false);")"
want "after marking absent the row is gone"                   0 "$(as $TM "select count(*) from participant_attendance where participant_id='$DEJI';")"
run DENY  "$TM"   "a team member cannot record for one they do not own" \
  "select public.record_mentee_attendance('$FEMI','$BENIN_PROG', true);"
run DENY  "$TM"   "a team member cannot record against another chapter's programme" \
  "select public.record_mentee_attendance('$DEJI','$LAGOS_PROG', true);"
run ALLOW "$RC"   "a coordinator can also record one young person's attendance" \
  "select public.record_mentee_attendance('$FEMI','$BENIN_PROG', true);"
want "recording one mentee never touches another's row"       1 "$(as $RC "select count(*) from participant_attendance where program_id='$BENIN_PROG';")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
