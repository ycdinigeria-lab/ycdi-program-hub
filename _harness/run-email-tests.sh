#!/bin/bash
# Checks who gets an email, who doesn't, and that a failure to send
# never undoes the thing that triggered it.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444
NEW=55555555-5555-5555-5555-555555555555
WAITING=66666666-6666-6666-6666-666666666666

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
deny() {
  local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$2'; $3\"" 2>&1)
  rc=$?
  if [ $rc -ne 0 ]; then echo "  ok   refused: $1"; pass=$((pass+1))
  else echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $1"; fail=$((fail+1)); fi
}

sent_to() { root "select count(*) from net.sent where body->'to' ? '$1';"; }

echo "DEFAULTS"
want "everyone starts on instant email" instant "$(as $RC "select public.my_notification_pref();")"
want "the outbox starts empty of failures" 0 "$(root "select count(*) from public.email_outbox where status <> 'sent';")"

echo
echo "INSTANT EMAIL"
root "delete from net.sent; delete from public.email_outbox;" >/dev/null
as "$RC" "insert into public.programs (title, chapter_id, status, submitted_by) values ('Email test one',(select id from chapters where name='Benin'),'Pending','$RC');" >/dev/null
want "the admin was emailed about the concept note" 1 "$(sent_to admin@ycdi.test)"
want "the coordinator who submitted it was not" 0 "$(sent_to rc.benin@ycdi.test)"
want "the outbox recorded it as sent" 1 "$(root "select count(*) from public.email_outbox where status='sent';")"
want "it went to Resend" "https://api.resend.com/emails" "$(root "select distinct url from net.sent;")"
want "the from address is the ycdinigeria one" "YCDI Programme Hub <noreply@ycdinigeria.org>" "$(root "select distinct body->>'from' from net.sent;")"
want "the body carries the brand blue" 1 "$(root "select case when body->>'html' like '%09ADEA%' then 1 else 0 end from net.sent limit 1;")"

echo
echo "TURNING EMAIL OFF"
root "delete from net.sent;" >/dev/null
as "$ADMIN" "select public.set_notification_pref('off');" >/dev/null
as "$RC" "insert into public.programs (title, chapter_id, status, submitted_by) values ('Email test two',(select id from chapters where name='Benin'),'Pending','$RC');" >/dev/null
want "no email once they turned it off" 0 "$(sent_to admin@ycdi.test)"
want "but the bell still filled up" 1 "$(as $ADMIN "select count(*) from public.notifications where profile_id='$ADMIN' and ref_id=(select id from programs where title='Email test two');")"

echo
echo "DAILY SUMMARY"
root "delete from net.sent;" >/dev/null
as "$ADMIN" "select public.set_notification_pref('daily');" >/dev/null
as "$RC" "insert into public.programs (title, chapter_id, status, submitted_by) values ('Email test three',(select id from chapters where name='Benin'),'Pending','$RC');" >/dev/null
want "nothing sent at the moment it happened" 0 "$(sent_to admin@ycdi.test)"
want "the digest sends one email" 1 "$(root "select public.send_daily_digest();")"
want "and it went to the right person" 1 "$(sent_to admin@ycdi.test)"
want "the summary lists every unread item" 1 "$(root "select case when body->>'html' like '%Email test three%' then 1 else 0 end from net.sent limit 1;")"
root "delete from net.sent;" >/dev/null
as "$ADMIN" "select public.mark_all_notifications_read();" >/dev/null
want "nothing to summarise once the bell is cleared" 0 "$(root "select public.send_daily_digest();")"

echo
echo "REJECTED SIGN-UP"
root "delete from net.sent;" >/dev/null
as "$ADMIN" "select public.reject_signup('$WAITING');" >/dev/null
want "the rejected person was emailed" 1 "$(sent_to waiting@ycdi.test)"
want "and their request is gone" 0 "$(root "select count(*) from public.pending_signups where id='$WAITING';")"

echo
echo "SENDING FAILURE MUST NOT UNDO THE WORK"
root "delete from net.sent; delete from public.email_outbox; delete from vault.decrypted_secrets where name='RESEND_API_KEY';" >/dev/null
as "$ADMIN" "select public.set_notification_pref('instant');" >/dev/null
as "$RC" "insert into public.programs (title, chapter_id, status, submitted_by) values ('No key test',(select id from chapters where name='Benin'),'Pending','$RC');" >/dev/null
want "the programme still saved with no key present" 1 "$(root "select count(*) from public.programs where title='No key test';")"
want "the bell still worked" 1 "$(root "select count(*) from public.notifications where ref_id=(select id from programs where title='No key test');")"
want "the outbox says plainly why nothing went" 1 "$(root "select count(*) from public.email_outbox where status='skipped';")"
root "insert into vault.decrypted_secrets values ('RESEND_API_KEY','re_test_key_local_only');" >/dev/null

echo
echo "PRIVACY"
want "an admin can read the outbox" 1 "$(as $ADMIN "select case when count(*) >= 0 then 1 else 0 end from public.email_outbox;")"
want "a team member cannot" 0 "$(as $TM "select count(*) from public.email_outbox;")"
deny "a member sets somebody else's email preference" "$TM" \
  "update public.notification_prefs set email_mode='off' where profile_id='$ADMIN';"
deny "a member calls the send function directly" "$TM" \
  "select public.send_email('anyone@example.com','Free email','<p>hi</p>');"
deny "a member reads the Resend key" "$TM" "select public.resend_key();"
as "$TM" "select public.set_notification_pref('off');" >/dev/null
want "a member can still set their own preference" off "$(as $TM "select public.my_notification_pref();")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
