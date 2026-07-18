#!/bin/bash
# Checks that notifications actually get written, go to the right
# people, and can't be read or forged by anybody else.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444
NEW=55555555-5555-5555-5555-555555555555

pass=0; fail=0

as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}

want() {
  local desc="$1" expect="$2" got="$3"
  if [ "$expect" = "$got" ]; then
    echo "  ok   $desc ($got)"; pass=$((pass+1))
  else
    echo "  XX   $desc: wanted $expect, got $got"; fail=$((fail+1))
  fi
}

deny() {
  local desc="$1" uid="$2" sql="$3"
  local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1)
  rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE|INSERT) 0'; then rc=1; fi
  if [ $rc -ne 0 ]; then
    echo "  ok   refused: $desc"; pass=$((pass+1))
  else
    echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $desc"; fail=$((fail+1))
  fi
}

count() { as "$1" "select count(*) from public.notifications where profile_id='$1' and kind='$2';"; }

echo "SIGN-UP REQUESTS"
want "admin told about the waiting sign-up" 2 "$(count $ADMIN signup_request)"
want "non-admin NC not told"                0 "$(count $NC signup_request)"
want "team member not told"                 0 "$(count $TM signup_request)"

echo
echo "PROGRAMME SUBMITTED"
as "$RC" "insert into public.programs (title, chapter_id, status, submitted_by) values ('Benin outreach',(select id from chapters where name='Benin'),'Pending','$RC');" >/dev/null
want "admin told a concept note arrived" 1 "$(as $ADMIN "select count(*) from public.notifications where profile_id='$ADMIN' and kind='program_submitted' and ref_id=(select id from programs where title='Benin outreach');")"
want "the coordinator who sent it is not told" 0 "$(count $RC program_submitted)"

echo
echo "PROGRAMME APPROVED AND RETURNED"
as "$ADMIN" "select public.approve_program((select id from programs where title='Benin outreach'));" >/dev/null
want "submitting coordinator told it was approved" 1 "$(count $RC program_approved)"
want "admin does not notify themselves"            0 "$(count $ADMIN program_approved)"

as "$RC" "insert into public.programs (title, chapter_id, status, submitted_by) values ('Benin follow up two',(select id from chapters where name='Benin'),'Pending','$RC');" >/dev/null
as "$ADMIN" "select public.return_program((select id from programs where title='Benin follow up two'),'Please add the budget.');" >/dev/null
want "coordinator told it was returned" 1 "$(count $RC program_returned)"
want "the reason is carried across"     "Please add the budget." "$(as $RC "select body from public.notifications where profile_id='$RC' and kind='program_returned';")"

echo
echo "ACCOUNT APPROVED"
as "$ADMIN" "select public.approve_signup('$NEW','TM',(select id from chapters where name='Auchi'));" >/dev/null
want "the new member is welcomed" 1 "$(count $NEW signup_approved)"

echo
echo "MESSAGES"
as "$TM" "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='general'),'$TM','first');" >/dev/null
want "other people told about the General message" 1 "$(count $RC message)"
want "the sender is not told"                      0 "$(count $TM message)"
as "$TM" "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='general'),'$TM','second');" >/dev/null
want "a second message does not stack up a second notice" 1 "$(count $RC message)"
as "$RC" "select public.mark_all_notifications_read();" >/dev/null
as "$TM" "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='general'),'$TM','third');" >/dev/null
want "after clearing the bell a new message notifies again" 2 "$(count $RC message)"

echo
echo "PRIVACY"
want "nobody sees another person's notifications" 0 "$(as $TM "select count(*) from public.notifications where profile_id='$ADMIN';")"
deny "team member writes themselves a fake notification" "$TM" \
  "insert into public.notifications (profile_id, kind, title) values ('$TM','signup_approved','You are an admin now');"
deny "team member marks an admin's notifications read" "$TM" \
  "update public.notifications set read_at = now() where profile_id = '$ADMIN';"
deny "team member deletes their own notification" "$TM" \
  "delete from public.notifications where profile_id = '$TM';"

echo
echo "COUNTS AND CLEARING"
before=$(as "$ADMIN" "select public.unread_notification_count();")
as "$ADMIN" "select public.mark_all_notifications_read();" >/dev/null
want "clearing the bell takes the count to nothing" 0 "$(as $ADMIN "select public.unread_notification_count();")"
if [ "$before" -gt 0 ]; then
  echo "  ok   admin had $before unread before clearing"; pass=$((pass+1))
else
  echo "  XX   admin had nothing unread to clear"; fail=$((fail+1))
fi
want "the list still shows them, just read" "$before" "$(as $ADMIN "select count(*) from public.my_notifications(100) where read_at is not null;")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
