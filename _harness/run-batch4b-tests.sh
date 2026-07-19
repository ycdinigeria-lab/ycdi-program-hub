#!/bin/bash
# Batch 4b. Two things:
#   1. Participant satisfaction on the post-programme report, and the
#      figure the funder exports will be built on.
#   2. The database side of resubmitting a returned programme, which the
#      front end now uses for the first time.

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
run() {
  local expect="$1" uid="$2" desc="$3" stmt="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $stmt\"" 2>&1)
  rc=$?
  # Row rules hide rows instead of erroring, so a statement that changed
  # nothing is a refusal. "INSERT 0 1" is a SUCCESS, the zero is an oid.
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
AUCHI="(select id from chapters where name='Auchi')"

# A clean slate of programmes to hang feedback on.
sql "delete from reports;" >/dev/null
sql "insert into programs (id, title, chapter_id, status, date, students, submitted_by)
     values ('aaaaaaa1-0000-0000-0000-000000000001','Benin feedback A',$BENIN,'Complete','2026-02-10',50,'$RC'),
            ('aaaaaaa1-0000-0000-0000-000000000002','Benin feedback B',$BENIN,'Complete','2026-05-10',50,'$RC'),
            ('aaaaaaa1-0000-0000-0000-000000000003','Benin no forms',  $BENIN,'Complete','2026-05-11',50,'$RC'),
            ('aaaaaaa1-0000-0000-0000-000000000004','Auchi feedback',  $AUCHI,'Complete','2026-05-12',50,'$NC');" >/dev/null

echo "THE NUMBERS CANNOT LIE"
run DENY "$ADMIN" "more positive replies than forms returned" \
  "insert into reports (program_id, feedback_forms_returned, feedback_positive) values ('aaaaaaa1-0000-0000-0000-000000000001', 10, 11);"
run DENY "$ADMIN" "a negative count of forms" \
  "insert into reports (program_id, feedback_forms_returned, feedback_positive) values ('aaaaaaa1-0000-0000-0000-000000000001', -5, 0);"
run DENY "$ADMIN" "positive replies with no forms recorded at all" \
  "insert into reports (program_id, feedback_forms_returned, feedback_positive) values ('aaaaaaa1-0000-0000-0000-000000000001', null, 4);"
run ALLOW "$ADMIN" "40 of 50 positive" \
  "insert into reports (program_id, feedback_forms_returned, feedback_positive) values ('aaaaaaa1-0000-0000-0000-000000000001', 50, 40);"
run ALLOW "$ADMIN" "every reply positive" \
  "insert into reports (program_id, feedback_forms_returned, feedback_positive) values ('aaaaaaa1-0000-0000-0000-000000000002', 30, 30);"
run ALLOW "$ADMIN" "a report with no feedback section filled in at all" \
  "insert into reports (program_id) values ('aaaaaaa1-0000-0000-0000-000000000003');"

echo
echo "THE FIGURE A FUNDER WOULD SEE"
want "Benin satisfaction across both programmes" "87.5" \
  "$(as "$ADMIN" "select satisfaction_pct from satisfaction_summary() where chapter_name='Benin';")"
want "forms counted, not programmes" "80" \
  "$(as "$ADMIN" "select forms_returned from satisfaction_summary() where chapter_name='Benin';")"

# 70 of 80 is 87.5%. If the programme with no forms were counted as a zero
# it would come out as 58.3%, and a chapter would be punished in front of a
# funder for a night nobody handed out paper.
want "a programme with no forms is left out, not counted as zero" "2" \
  "$(as "$ADMIN" "select programmes_with_feedback from satisfaction_summary() where chapter_name='Benin';")"
want "a chapter with no feedback at all does not appear" "0" \
  "$(as "$ADMIN" "select count(*) from satisfaction_summary() where chapter_name='Auchi';")"

echo
echo "REPORTING PERIODS"
want "the quarter to March sees only the February programme" "80.0" \
  "$(as "$ADMIN" "select satisfaction_pct from satisfaction_summary('2026-01-01','2026-03-31') where chapter_name='Benin';")"
want "the quarter to June sees only the May programme" "100.0" \
  "$(as "$ADMIN" "select satisfaction_pct from satisfaction_summary('2026-04-01','2026-06-30') where chapter_name='Benin';")"
want "a period with nothing in it returns nothing rather than zero" "0" \
  "$(as "$ADMIN" "select count(*) from satisfaction_summary('2020-01-01','2020-12-31');")"

echo
echo "WHO CAN SEE WHOSE NUMBERS"
run ALLOW "$ADMIN" "an admin records feedback" \
  "update reports set feedback_forms_returned = 20, feedback_positive = 18 where program_id = 'aaaaaaa1-0000-0000-0000-000000000003';"
run ALLOW "$RC" "a coordinator records feedback for their own chapter" \
  "update reports set feedback_forms_returned = 22, feedback_positive = 19 where program_id = 'aaaaaaa1-0000-0000-0000-000000000001';"
run DENY "$RC" "a coordinator records feedback for a chapter that is not theirs" \
  "update reports set feedback_forms_returned = 99, feedback_positive = 99 where program_id = 'aaaaaaa1-0000-0000-0000-000000000004';"
run DENY "$TM" "a team member records feedback" \
  "update reports set feedback_forms_returned = 5, feedback_positive = 5 where program_id = 'aaaaaaa1-0000-0000-0000-000000000001';"

echo
echo "RESUBMITTING A RETURNED PROGRAMME"
sql "update programs set status='Returned', nc_comment='Add the safeguarding lead.' where id='aaaaaaa1-0000-0000-0000-000000000001';" >/dev/null

run ALLOW "$RC" "a coordinator revises their own returned programme and sends it back up" \
  "update programs set title='Benin feedback A revised', safeguarding_lead='Rita RC', status='Pending' where id='aaaaaaa1-0000-0000-0000-000000000001';"
want "it is Pending again" "Pending" \
  "$(as "$RC" "select status from programs where id='aaaaaaa1-0000-0000-0000-000000000001';")"

# The front end must not send nc_comment on a resubmit. This is the test
# that says why: the database refuses it, and would reject the whole save
# along with the coordinator's edits.
sql "update programs set status='Returned' where id='aaaaaaa1-0000-0000-0000-000000000001';" >/dev/null
run DENY "$RC" "a coordinator quietly deletes the comment that was left on it" \
  "update programs set status='Pending', nc_comment='' where id='aaaaaaa1-0000-0000-0000-000000000001';"
run DENY "$RC" "a coordinator approves their own programme instead of resubmitting" \
  "update programs set status='Approved' where id='aaaaaaa1-0000-0000-0000-000000000001';"
run DENY "$RC" "a coordinator resubmits another chapter's programme" \
  "update programs set status='Pending' where id='aaaaaaa1-0000-0000-0000-000000000004';"
run DENY "$TM" "a team member resubmits anything" \
  "update programs set status='Pending' where id='aaaaaaa1-0000-0000-0000-000000000001';"

want "the review comment survived every attempt to remove it" "Add the safeguarding lead." \
  "$(sql "select nc_comment from programs where id='aaaaaaa1-0000-0000-0000-000000000001';")"

echo
echo "THE NATIONAL COORDINATOR IS TOLD"
sql "delete from notifications;" >/dev/null
sql "update programs set status='Returned' where id='aaaaaaa1-0000-0000-0000-000000000001';" >/dev/null
as "$RC" "update programs set status='Pending' where id='aaaaaaa1-0000-0000-0000-000000000001';" >/dev/null
want "a resubmit raises a notification" "1" \
  "$(sql "select count(*) from notifications where kind='program_submitted' and title='Concept note resubmitted';")"

echo
echo "  passed $pass, failed $fail"
[ $fail -eq 0 ] || exit 1
