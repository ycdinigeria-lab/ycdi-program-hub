#!/bin/bash
# BATCH17-MARKER home-and-signals
# Run after:
#   EXTRA="batch1-notifications.sql batch2-participants.sql batch3-safeguarding.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch17-home-and-signals.sql" bash _harness/setup.sh
#
# Proves the three home-screen reads. The one that matters most: a team
# member sees their chapter's totals through chapter_pulse, but still cannot
# open the individual young people those totals are counted from.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444
BTM2=99999999-9999-9999-9999-999999999999

pass=0; fail=0
as()  { su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1; }
raw() { su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi; }
run() {
  local expect="$1" uid="$2" desc="$3" sql="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1); rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$expect" = "DENY" ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $desc"; pass=$((pass+1)); else echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $desc"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $desc"; pass=$((pass+1)); else echo "  XX   REFUSED BUT SHOULD BE ALLOWED: $desc"; echo "$out" | grep -i error | head -1 | sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

BENIN="(select id from chapters where name='Benin')"
LAGOS="(select id from chapters where name='Lagos')"

raw "insert into auth.users (id,email) values ('$BTM2','btm2@ycdi.test');" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values ('$BTM2','Bola BeninTM','TM',$BENIN,false);" >/dev/null

# --- programmes: two active this year, one upcoming, plus a Lagos one -----
P1=eeee0000-0000-0000-0000-000000000001
P2=eeee0000-0000-0000-0000-000000000002
P3=eeee0000-0000-0000-0000-000000000003
LP=eeee0000-0000-0000-0000-00000000000a
raw "insert into public.programs (id,title,chapter_id,status,date) values
  ('$P1','Benin past approved',$BENIN,'Approved',current_date-30),
  ('$P2','Benin live',        $BENIN,'Live',    current_date-10),
  ('$P3','Benin upcoming',    $BENIN,'Pending', current_date+30),
  ('$LP','Lagos approved',    $LAGOS,'Approved',current_date-5);" >/dev/null

# --- young people the RC added, so the team member has no tie to them ------
A=aaaa1111-0000-0000-0000-000000000001
Bp=aaaa1111-0000-0000-0000-000000000002
C=aaaa1111-0000-0000-0000-000000000003
D=aaaa1111-0000-0000-0000-00000000000d
raw "insert into public.participants (id,chapter_id,full_name,age_band,consent_on,created_by) values ('$A',$BENIN,'A Benin','13-15',current_date-2,'$RC') on conflict (id) do nothing;" >/dev/null
raw "insert into public.participants (id,chapter_id,full_name,age_band,consent_on,created_by) values ('$Bp',$BENIN,'B Benin','13-15',current_date-2,'$RC') on conflict (id) do nothing;" >/dev/null
raw "insert into public.participants (id,chapter_id,full_name,age_band,consent_on,created_by) values ('$C',$BENIN,'C Benin','13-15',current_date-2,'$RC') on conflict (id) do nothing;" >/dev/null
raw "insert into public.participants (id,chapter_id,full_name,age_band,consent_on,created_by) values ('$D',$LAGOS,'D Lagos','13-15',current_date-2,'$RC') on conflict (id) do nothing;" >/dev/null

# --- attendance: A and B at P1, A again and C at P2, D at the Lagos one -----
raw "insert into public.participant_attendance (participant_id,program_id) values ('$A','$P1'),('$Bp','$P1'),('$A','$P2'),('$C','$P2'),('$D','$LP');" >/dev/null

# --- the team member mentors two live, one ended --------------------------
M1=bbbb2222-0000-0000-0000-000000000001
M2=bbbb2222-0000-0000-0000-000000000002
M3=bbbb2222-0000-0000-0000-000000000003
raw "insert into public.participants (id,chapter_id,full_name,age_band,consent_on,created_by) values
  ('$M1',$BENIN,'M1','13-15',current_date-2,'$RC'),
  ('$M2',$BENIN,'M2','13-15',current_date-2,'$RC'),
  ('$M3',$BENIN,'M3','13-15',current_date-2,'$RC') on conflict (id) do nothing;" >/dev/null
raw "insert into public.participant_mentors (participant_id,mentor_id,ended_on) values
  ('$M1','$TM',null),('$M2','$TM',null),('$M3','$TM',current_date-1);" >/dev/null

# --- the team member's own submissions -------------------------------------
raw "insert into public.submissions (kind,chapter_id,author_id,title,body,status,submitted_at) values
  ('report',$BENIN,'$TM','r1','x','submitted', now()),
  ('report',$BENIN,'$TM','r2','x','forwarded', now()),
  ('report',$BENIN,'$TM','r3','x','acknowledged', now());" >/dev/null

echo "CHAPTER PULSE: TOTALS A TEAM MEMBER CAN SEE"
want "programmes running now"                    3 "$(as $TM "select programmes_active from chapter_pulse();")"
want "outreaches held this year"                 2 "$(as $TM "select outreaches_year from chapter_pulse();")"
want "young people reached this year, deduped"   3 "$(as $TM "select young_people_year from chapter_pulse();")"
want "programmes coming up"                       1 "$(as $TM "select upcoming from chapter_pulse();")"
want "the Lagos young person is not counted in Benin's total" 3 "$(as $TM "select young_people_year from chapter_pulse();")"

echo
echo "BUT THE REGISTER STAYS CLOSED TO THEM"
want "the team member cannot open the young people behind that total" 0 "$(as $TM "select count(*) from participants where id in ('$A','$Bp','$C');")"
want "the coordinator can still see the whole chapter list"          6 "$(as $RC "select count(*) from participants where chapter_id=$BENIN;")"

echo
echo "MY CONTRIBUTION"
want "reports the team member has filed"          3 "$(as $TM "select reports_filed from my_contribution();")"
want "of those, acknowledged by the NC"           1 "$(as $TM "select reports_acknowledged from my_contribution();")"
want "young people they currently mentor"         2 "$(as $TM "select mentees from my_contribution();")"
want "another team member's tally is their own"   0 "$(as $BTM2 "select reports_filed from my_contribution();")"

echo
echo "QUIET CHAPTERS: FOR THE NC ONLY"
want "the NC sees a row for every chapter"        5 "$(as $NC "select count(*) from quiet_chapters();")"
want "Benin shows as having reported"            active "$(as $NC "select case when last_reported is null then 'quiet' else 'active' end from quiet_chapters() where chapter_name='Benin';")"
want "Lagos shows as quiet"                        quiet "$(as $NC "select case when last_reported is null then 'quiet' else 'active' end from quiet_chapters() where chapter_name='Lagos';")"
want "a team member is shown nothing"              0 "$(as $TM "select count(*) from quiet_chapters();")"
want "an RC is shown nothing"                      0 "$(as $RC "select count(*) from quiet_chapters();")"

echo
echo "THE RC'S NUDGE"
LTM=77777777-7777-7777-7777-777777777777
raw "insert into auth.users (id,email) values ('$LTM','ltm@ycdi.test');" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values ('$LTM','Lola LagosTM','TM',$LAGOS,false);" >/dev/null
run  ALLOW "$RC"    "the chapter RC nudges a team member"          "select public.nudge_member('$TM');"
want "the nudge lands in that team member's notifications"      1 "$(raw "select count(*) from notifications where profile_id='$TM' and kind='nudge';")"
run  DENY  "$TM"    "a team member cannot nudge"                   "select public.nudge_member('$BTM2');"
run  DENY  "$RC"    "an RC cannot nudge into another chapter"      "select public.nudge_member('$LTM');"
run  DENY  "$ADMIN" "even an admin cannot nudge a coordinator"     "select public.nudge_member('$RC');"
run  ALLOW "$ADMIN" "an admin can nudge a team member"             "select public.nudge_member('$BTM2');"

echo
echo "LISTING TEAM MEMBERS TO NUDGE"
want "the RC sees the team members in their chapter"     1 "$(as $RC "select count(*) from chapter_team_members() where id='$TM';")"
want "the list is the RC's own chapter only"             0 "$(as $RC "select count(*) from chapter_team_members() where id='$LTM';")"
want "a team member is shown no list"                    0 "$(as $TM "select count(*) from chapter_team_members();")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
