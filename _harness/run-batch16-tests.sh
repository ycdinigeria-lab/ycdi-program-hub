#!/bin/bash
# BATCH16-MARKER reporting-chain
# Proves the reporting-chain gate holds from the database side, not just the
# screen. The National Coordinator, running as a plain NC with no admin
# bypass, must never see a submitted report out of a chapter that has an RC.
# The only two ways a report reaches the NC are: the RC forwarded it, or the
# chapter has no RC at all.
#
# Two accounts keep the test honest:
#   Ngozi NC (222) is a pure NC, no admin, so a leak cannot hide behind admin
#   rights the way it would with Ada.
#   Lagos carries no RC in the seed, so it stands as the no-RC chapter without
#   having to strip a coordinator first.

ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin (sees all)
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC (proves the gate)
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin team member (author)
LTM=77777777-7777-7777-7777-777777777777      # Lola, Lagos team member (no RC in Lagos)
BTM2=99999999-9999-9999-9999-999999999999     # a second Benin team member

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
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $desc"; pass=$((pass+1)); else echo "  XX   REFUSED BUT SHOULD BE ALLOWED: $desc"; echo "$out" | grep -i error | head -2 | sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

BENIN="(select id from chapters where name='Benin')"
LAGOS="(select id from chapters where name='Lagos')"

# --- extra accounts the seed does not carry --------------------------------
raw "insert into auth.users (id,email) values ('$LTM','ltm@ycdi.test'),('$BTM2','btm2@ycdi.test');" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values
       ('$LTM','Lola LagosTM','TM',$LAGOS,false),
       ('$BTM2','Bola BeninTM','TM',$BENIN,false);" >/dev/null

# --- fixed submissions, one per state, placed straight into the table so the
#     gate is what is being tested, not the actions that would create them ---
S_DRAFT=cccccccc-0000-0000-0000-000000000001
S_SUB=cccccccc-0000-0000-0000-000000000002
S_FWD=cccccccc-0000-0000-0000-000000000003
S_ACK=cccccccc-0000-0000-0000-000000000004
S_LAGSUB=cccccccc-0000-0000-0000-000000000005
S_BTM2=cccccccc-0000-0000-0000-000000000006

raw "insert into public.submissions (id,kind,chapter_id,author_id,title,body,author_title,author_body,status) values
  ('$S_DRAFT','report',$BENIN,'$TM','d','d',null,null,'draft'),
  ('$S_SUB','report',$BENIN,'$TM','s','s','s','s','submitted'),
  ('$S_FWD','report',$BENIN,'$TM','f','RC EDITED','f','ORIG BODY','forwarded'),
  ('$S_ACK','report',$BENIN,'$TM','a','a','a','a','acknowledged'),
  ('$S_LAGSUB','report',$LAGOS,'$LTM','l','l','l','l','submitted'),
  ('$S_BTM2','report',$BENIN,'$BTM2','b','b','b','b','submitted');" >/dev/null

echo "THE GATE, SEEN BY A PLAIN NATIONAL COORDINATOR"
want "does not see a submitted report from a chapter that has an RC" 0 "$(as $NC "select count(*) from submissions where id='$S_SUB';")"
want "sees a report the RC forwarded"                               1 "$(as $NC "select count(*) from submissions where id='$S_FWD';")"
want "sees a report already acknowledged"                           1 "$(as $NC "select count(*) from submissions where id='$S_ACK';")"
want "sees a submitted report from a chapter with no RC"            1 "$(as $NC "select count(*) from submissions where id='$S_LAGSUB';")"
want "never sees a draft"                                           0 "$(as $NC "select count(*) from submissions where id='$S_DRAFT';")"
want "sees the words the RC forwarded, not the author's snapshot"   "RC EDITED" "$(as $NC "select body from submissions where id='$S_FWD';")"

echo
echo "THE GATE, SEEN BY THE CHAPTER RC"
want "sees a submitted report in their own chapter"                 1 "$(as $RC "select count(*) from submissions where id='$S_SUB';")"
want "sees another team member's submitted report in their chapter" 1 "$(as $RC "select count(*) from submissions where id='$S_BTM2';")"
want "does not see a team member's draft"                           0 "$(as $RC "select count(*) from submissions where id='$S_DRAFT';")"
want "does not reach into another chapter"                          0 "$(as $RC "select count(*) from submissions where id='$S_LAGSUB';")"

echo
echo "THE GATE, SEEN BY THE AUTHOR AND BY AN ADMIN"
want "the author sees their own draft"                              1 "$(as $TM "select count(*) from submissions where id='$S_DRAFT';")"
want "a team member does not see another member's submission"       0 "$(as $TM "select count(*) from submissions where id='$S_BTM2';")"
want "the author sees their report once acknowledged"               1 "$(as $TM "select count(*) from submissions where id='$S_ACK';")"
want "an admin sees the submitted report the NC cannot"             1 "$(as $ADMIN "select count(*) from submissions where id='$S_SUB';")"

echo
echo "NOTHING MOVES ALONG THE CHAIN BY A DIRECT WRITE"
run DENY "$TM" "a team member cannot forward their own report by hand" \
  "update submissions set status='forwarded' where id='$S_SUB';"
run DENY "$TM" "a team member cannot file a draft under another name" \
  "insert into submissions (kind,chapter_id,author_id,status) values ('report',$BENIN,'$NC','draft');"
run ALLOW "$TM" "a team member creates their own draft" \
  "insert into submissions (kind,chapter_id,author_id,status) values ('report',$BENIN,'$TM','draft');"

echo
echo "THE CHAIN, END TO END"
F1=ddddddd0-0000-0000-0000-000000000001
raw "insert into public.submissions (id,kind,chapter_id,author_id,title,body,status) values ('$F1','report',$BENIN,'$TM','flow','by tobi','draft');" >/dev/null
run ALLOW "$TM" "the author submits their draft" "select public.submit_submission('$F1');"
want "the report is now submitted"                    submitted "$(as $ADMIN "select status from submissions where id='$F1';")"
want "submitting snapshots the author's own words"    "by tobi" "$(as $ADMIN "select author_body from submissions where id='$F1';")"
run DENY  "$TM" "a team member cannot forward"        "select public.forward_submission('$F1');"
run DENY  "$NC" "an NC cannot forward another chapter's report" "select public.forward_submission('$F1');"
run ALLOW "$RC" "the chapter RC forwards, editing the body" \
  "select public.forward_submission('$F1', null, 'rewritten by rita', 'looks good');"
want "forwarding keeps the author's snapshot intact"  "by tobi" "$(as $ADMIN "select author_body from submissions where id='$F1';")"
want "forwarding stores the RC's edit as the body"    "rewritten by rita" "$(as $ADMIN "select body from submissions where id='$F1';")"
want "the NC can now see the forwarded report"        1 "$(as $NC "select count(*) from submissions where id='$F1';")"
run ALLOW "$NC" "the NC acknowledges"                 "select public.acknowledge_submission('$F1');"
want "the report is acknowledged"                     acknowledged "$(as $ADMIN "select status from submissions where id='$F1';")"
want "the author sees the acknowledgement land"       1 "$(as $TM "select count(*) from submissions where id='$F1' and status='acknowledged';")"

echo
echo "SENDING A REPORT BACK"
F2=ddddddd0-0000-0000-0000-000000000002
raw "insert into public.submissions (id,kind,chapter_id,author_id,title,body,status) values ('$F2','report',$BENIN,'$TM','flow2','draft body','draft');" >/dev/null
run ALLOW "$TM" "the author submits it"               "select public.submit_submission('$F2');"
run ALLOW "$RC" "the RC returns it with a note"       "select public.return_submission('$F2','please add the numbers');"
want "the report is returned"                         returned "$(as $ADMIN "select status from submissions where id='$F2';")"
want "a returned report does not reach the NC"        0 "$(as $NC "select count(*) from submissions where id='$F2';")"
want "the author sees it come back with the note"     1 "$(as $TM "select count(*) from submissions where id='$F2' and status='returned' and rc_note='please add the numbers';")"
run ALLOW "$TM" "the author can resubmit after a return" "select public.submit_submission('$F2');"

echo
echo "THE NO-RC BRANCH, AND WHO MAY ACKNOWLEDGE"
L2=ddddddd0-0000-0000-0000-000000000003
raw "insert into public.submissions (id,kind,chapter_id,author_id,title,body,status) values ('$L2','report',$LAGOS,'$LTM','lagos flow','x','submitted');" >/dev/null
run ALLOW "$NC" "the NC acknowledges a no-RC chapter's report directly" "select public.acknowledge_submission('$L2');"
run DENY  "$NC" "the NC cannot acknowledge a submitted report from a chapter that has an RC" \
  "select public.acknowledge_submission('$S_SUB');"
run DENY  "$RC" "an RC cannot acknowledge, that is the NC's step"        "select public.acknowledge_submission('$S_FWD');"
run DENY  "$RC" "no one can submit a report that is not theirs"          "select public.submit_submission('$S_DRAFT');"

echo
echo "APPOINTING AN RC, AND THE NO-RC BRANCH CLOSING"
A1=ddddddd0-0000-0000-0000-00000000000a
raw "insert into public.submissions (id,kind,chapter_id,author_id,title,body,status) values ('$A1','report',$LAGOS,'$LTM','before appoint','x','submitted');" >/dev/null
want "before an RC exists, the NC sees a Lagos submitted report"        1 "$(as $NC "select count(*) from submissions where id='$A1';")"
run DENY  "$TM"    "a team member cannot appoint an RC"                  "select public.appoint_rc('$BTM2');"
run DENY  "$RC"    "an RC cannot appoint an RC"                          "select public.appoint_rc('$BTM2');"
run DENY  "$NC"    "a plain NC without admin cannot appoint an RC"       "select public.appoint_rc('$BTM2');"
run DENY  "$ADMIN" "cannot appoint someone attached to no chapter"       "select public.appoint_rc('$NC');"
run ALLOW "$ADMIN" "an admin appoints a team member as their chapter RC" "select public.appoint_rc('$LTM');"
want "the appointed person now holds the RC role"                        RC "$(as $ADMIN "select role from profiles where id='$LTM';")"
want "with an RC in place, the NC no longer sees that submitted report"  0 "$(as $NC "select count(*) from submissions where id='$A1';")"
run ALLOW "$ADMIN" "appointing again is harmless"                        "select public.appoint_rc('$LTM');"
want "a repeat appointment leaves the role unchanged"                    RC "$(as $ADMIN "select role from profiles where id='$LTM';")"

echo
echo "SAVING THROUGH THE APP CALL"
NEWID=$(as $TM "select public.save_submission(null,'report','App draft','body here','Community school','2026-03-01',30,null);")
want "a new draft is filed under the author, in their own chapter, as a draft" 1 "$(as $ADMIN "select count(*) from submissions where id='$NEWID' and author_id='$TM' and status='draft' and place='Community school' and chapter_id=$BENIN;")"
run ALLOW "$TM" "the author edits their own draft"           "select public.save_submission('$NEWID','report','App draft v2','more body','Community school','2026-03-01',35,null);"
want "the edit is stored"                                    35 "$(as $ADMIN "select people_reached from submissions where id='$NEWID';")"
run DENY  "$RC" "no one can edit a draft that is not theirs"  "select public.save_submission('$NEWID','report','tampered','x',null,null,null,null);"
run DENY  "$TM" "a submitted report can no longer be edited"  "select public.save_submission('$S_SUB','report','late edit','x',null,null,null,null);"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
