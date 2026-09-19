#!/bin/bash
# BATCH30-MARKER campaign-sending
# Run after:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch18-nec-portfolios.sql batch29-audience-and-consent.sql \
#          batch30-campaign-sending.sql" bash _harness/setup.sh
#
# Proves the campaign machinery from the database side:
#   - the COMMS seat writes, the National Coordinator approves, nobody
#     approves their own, and a plain admin, the FIN seat and a plain team
#     member have no hand in it
#   - a campaign can only go to a broadcast segment, and is refused with a
#     bad merge field, no sender, or a switched-off sender or provider
#   - the send queue cannot be read by any signed-in user, and the server
#     side functions cannot be called by one
#   - sending never goes past the provider's daily limit, never hands the
#     same person out twice, skips anyone who stops after the campaign
#     starts, gives back a claim that was never settled, retries a failure
#     three times and no more, and finishes the campaign when it is done
#   - a permanent bounce or a complaint stops an address for good, and a
#     temporary bounce does not
#   - the counts the screen shows are the same people the sender writes to
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC (approver)
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC, will hold FIN
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin TM, will hold COMMS (author)
PLAINADMIN=88888888-8888-8888-8888-888888888888  # Sam, TM with is_admin and nothing else

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
svc(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role service_role; $1\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2 got $3"; fail=$((fail+1)); fi; }
run(){ # expect uid desc sql
  local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid='$2'; $4\"" 2>&1); rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$1" = DENY ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $3"; pass=$((pass+1)); else echo "  XX   ALLOWED but should refuse: $3"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $3"; pass=$((pass+1)); else echo "  XX   REFUSED but should allow: $3"; echo "$out"|grep -i error|head -1|sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}
st(){ raw "select status from public.email_campaigns where id='$1';"; }
rstat(){ raw "select status from public.email_campaign_recipients where campaign_id='$1' and email='$2';"; }
rcount(){ raw "select count(*) from public.email_campaign_recipients where campaign_id='$1' and status='$2';"; }

echo "Batch 30 — campaigns and the send queue"

# ── Clean slate ────────────────────────────────────────────────────────
raw "delete from public.email_campaigns where title like 'B30 %';" >/dev/null
raw "delete from public.email_senders where from_email like 'b30-%';" >/dev/null
raw "delete from public.audience_contacts where email like 'b30-%';" >/dev/null
raw "delete from public.email_suppressions where email like 'b30-%';" >/dev/null
raw "update public.email_providers set daily_cap = 80, active = true where code = 'resend';" >/dev/null
for u in $TM $RC $NC; do for s in COMMS FIN; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done
raw "insert into auth.users (id, email) values ('$PLAINADMIN','sysadmin@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id, full_name, role, chapter_id, is_admin)
     values ('$PLAINADMIN','Sam Sysadmin','TM',(select id from public.chapters where name='Benin'), true)
     on conflict (id) do update set is_admin = true, role = 'TM';" >/dev/null
raw "select public.set_portfolio('$TM','COMMS',true);" >/dev/null
raw "select public.set_portfolio('$RC','FIN',true);" >/dev/null

SNDR="insert into public.email_senders(label,from_name,from_email,reply_to,provider,created_by)"
CAMP="insert into public.email_campaigns(title,subject,body,segment,sender_id,author_id)"

# ── PART A. Providers and senders ──────────────────────────────────────
run ALLOW "$TM" "the COMMS seat adds a sender (typed in capitals)" \
  "$SNDR values ('B30 main','YCDI Communications','B30-Comms@Test.Example','b30-inbox@test.example','resend','$TM');"
want "the sender address is stored lower-case" "b30-comms@test.example" \
  "$(raw "select from_email from public.email_senders where label='B30 main';")"
SENDER=$(raw "select id from public.email_senders where label='B30 main';")

run DENY "$RC" "the FIN seat cannot add a sender" \
  "$SNDR values ('B30 fin','Fin','b30-fin@test.example',null,'resend','$RC');"
run DENY "$PLAINADMIN" "a plain admin cannot add a sender" \
  "$SNDR values ('B30 adm','Adm','b30-adm@test.example',null,'resend','$PLAINADMIN');"
run DENY "$TM" "a sender name cannot carry angle brackets" \
  "$SNDR values ('B30 bad','Evil <ceo@x.com>','b30-bad@test.example',null,'resend','$TM');"
run DENY "$TM" "a sender name cannot carry a line break" \
  "$SNDR values ('B30 bad','Evil'||chr(10)||'Bcc: x','b30-bad2@test.example',null,'resend','$TM');"
run DENY "$TM" "not an email address" \
  "$SNDR values ('B30 bad','Ok','nonsense',null,'resend','$TM');"
run DENY "$TM" "an unknown provider" \
  "$SNDR values ('B30 bad','Ok','b30-bad3@test.example',null,'mailgun','$TM');"
run DENY "$TM" "the same sender address twice" \
  "$SNDR values ('B30 dup','Ok','B30-COMMS@test.example',null,'resend','$TM');"

want "FIN can read the providers" "1" "$(as "$RC" "select count(*) from public.email_providers;")"
want "a plain admin cannot read the providers" "0" "$(as "$PLAINADMIN" "select count(*) from public.email_providers;")"
run ALLOW "$NC" "NC changes the daily limit" "update public.email_providers set daily_cap = 90 where code='resend';"
run DENY  "$TM" "the COMMS seat cannot change the daily limit" "update public.email_providers set daily_cap = 5000 where code='resend';"
run DENY  "$NC" "nobody adds a provider from the app" "insert into public.email_providers(code,label) values ('mailgun','Mailgun');"
raw "update public.email_providers set daily_cap = 80 where code='resend';" >/dev/null

# ── PART B. Writing and approving ──────────────────────────────────────
run ALLOW "$TM" "the COMMS seat drafts a campaign" \
  "$CAMP values ('B30 main','Hello {{first_name}}','Peace to you at {{chapter}}.'||chr(10)||chr(10)||'Second paragraph.','donors_broadcast','$SENDER','$TM');"
CID=$(raw "select id from public.email_campaigns where title='B30 main';")

run DENY "$RC" "the FIN seat cannot write a campaign" \
  "$CAMP values ('B30 x','s','b','donors_broadcast','$SENDER','$RC');"
run DENY "$PLAINADMIN" "a plain admin cannot write a campaign" \
  "$CAMP values ('B30 x','s','b','donors_broadcast','$SENDER','$PLAINADMIN');"
run DENY "$NC" "the National Coordinator approves and does not write" \
  "$CAMP values ('B30 x','s','b','donors_broadcast','$SENDER','$NC');"
run DENY "$TM" "Champions and Partners cannot be a campaign audience" \
  "$CAMP values ('B30 x','s','b','donors_personal','$SENDER','$TM');"
run DENY "$TM" "grant funders cannot be a campaign audience" \
  "$CAMP values ('B30 x','s','b','funders','$SENDER','$TM');"
run DENY "$TM" "a subject cannot carry a line break" \
  "$CAMP values ('B30 x','Hi'||chr(10)||'Bcc: a@b.c','b','donors_broadcast','$SENDER','$TM');"

want "a draft is private: the author sees it" "1" "$(as "$TM" "select count(*) from public.email_campaigns where title like 'B30 %';")"
want "a draft is private: NC does not" "0" "$(as "$NC" "select count(*) from public.email_campaigns where title like 'B30 %';")"
want "a draft is private: FIN does not" "0" "$(as "$RC" "select count(*) from public.email_campaigns where title like 'B30 %';")"
run DENY "$TM" "the author cannot approve a draft by editing its status" \
  "update public.email_campaigns set status='approved' where id='$CID';"

# things that must stop a campaign being sent up
raw "$CAMP values ('B30 nosender','s','b','donors_broadcast',null,'$TM');" >/dev/null
raw "$CAMP values ('B30 badtag','Hi {{name}}','b','donors_broadcast','$SENDER','$TM');" >/dev/null
raw "$CAMP values ('B30 empty','','','donors_broadcast','$SENDER','$TM');" >/dev/null
run DENY "$TM" "no sender chosen" "select public.submit_campaign((select id from public.email_campaigns where title='B30 nosender'));"
run DENY "$TM" "an unknown merge field" "select public.submit_campaign((select id from public.email_campaigns where title='B30 badtag'));"
run DENY "$TM" "no subject or message" "select public.submit_campaign((select id from public.email_campaigns where title='B30 empty'));"
raw "$SNDR values ('B30 off','Off','b30-off@test.example',null,'resend','$TM');" >/dev/null
raw "update public.email_senders set active=false where from_email='b30-off@test.example';" >/dev/null
raw "$CAMP values ('B30 offsender','s','b','donors_broadcast',(select id from public.email_senders where from_email='b30-off@test.example'),'$TM');" >/dev/null
run DENY "$TM" "a switched-off sender" "select public.submit_campaign((select id from public.email_campaigns where title='B30 offsender'));"
raw "update public.email_providers set active=false where code='resend';" >/dev/null
run DENY "$TM" "a switched-off provider" "select public.submit_campaign('$CID');"
raw "update public.email_providers set active=true where code='resend';" >/dev/null
run DENY "$NC" "only the author can send a campaign for approval" "select public.submit_campaign('$CID');"

run ALLOW "$TM" "the author sends it for approval" "select public.submit_campaign('$CID');"
want "the campaign is submitted" "submitted" "$(st $CID)"
want "NC now sees it" "1" "$(as "$NC" "select count(*) from public.email_campaigns where id='$CID';")"
want "FIN now sees it" "1" "$(as "$RC" "select count(*) from public.email_campaigns where id='$CID';")"
want "a plain admin does not" "0" "$(as "$PLAINADMIN" "select count(*) from public.email_campaigns where id='$CID';")"
run DENY "$TM" "the author cannot approve their own campaign" "select public.approve_campaign('$CID');"
run DENY "$RC" "the FIN seat cannot approve" "select public.approve_campaign('$CID');"
run DENY "$PLAINADMIN" "a plain admin cannot approve" "select public.approve_campaign('$CID');"
run DENY "$TM" "the author cannot edit a submitted campaign" \
  "update public.email_campaigns set subject='changed after approval' where id='$CID';"

# sent back, mended, sent again
raw "$CAMP values ('B30 back','Hello','Body','donors_broadcast','$SENDER','$TM');" >/dev/null
BACK=$(raw "select id from public.email_campaigns where title='B30 back';")
run ALLOW "$TM" "a second campaign is sent up" "select public.submit_campaign('$BACK');"
run ALLOW "$NC" "NC sends it back with a note" "select public.return_campaign('$BACK','Say who it is from');"
want "it is returned" "returned" "$(st $BACK)"
run ALLOW "$TM" "the author edits a returned campaign" "update public.email_campaigns set body='Body, from the Communications Officer' where id='$BACK';"
run ALLOW "$TM" "and sends it up again" "select public.submit_campaign('$BACK');"
run ALLOW "$NC" "NC approves the mended one" "select public.approve_campaign('$BACK','Good');"

run ALLOW "$NC" "NC approves the first campaign" "select public.approve_campaign('$CID');"
want "the campaign is approved" "approved" "$(st $CID)"
want "and it records who approved it" "$NC" "$(raw "select reviewed_by from public.email_campaigns where id='$CID';")"

# nobody approves their own work, even the National Coordinator
raw "select public.set_portfolio('$NC','COMMS',true);" >/dev/null
run ALLOW "$NC" "NC holding the COMMS seat can write" \
  "$CAMP values ('B30 four','Hi','Body','alumni','$SENDER','$NC');"
FOUR=$(raw "select id from public.email_campaigns where title='B30 four';")
run ALLOW "$NC" "and send it up" "select public.submit_campaign('$FOUR');"
run DENY  "$NC" "but cannot approve their own campaign" "select public.approve_campaign('$FOUR');"
run ALLOW "$ADMIN" "another National Coordinator can" "select public.approve_campaign('$FOUR');"
raw "select public.set_portfolio('$NC','COMMS',false);" >/dev/null
# A seat has one holder: giving it to Ngozi took it from Tobi. Give it back.
raw "select public.set_portfolio('$TM','COMMS',true);" >/dev/null

# ── PART C. Starting a campaign ────────────────────────────────────────
raw "insert into public.audience_contacts(full_name,email,category,donor_tier,lawful_basis,created_by) values
  ('B30 Sup One','b30-sup1@test.example','donor','supporter','consent','$NC'),
  ('B30 Friend One','b30-fri1@test.example','donor','friend','consent','$NC'),
  ('B30 Champion','b30-champ@test.example','donor','champion','consent','$NC'),
  ('B30 Sup Two','b30-sup2@test.example','donor','supporter','consent','$NC');" >/dev/null
raw "insert into public.email_suppressions(email,reason) values ('b30-sup2@test.example','unsubscribed');" >/dev/null

want "the recipients are Supporters and Friends, not Champions, not the stopped" "2" \
  "$(svc "select count(*) from public.audience_segment_recipients('donors_broadcast') where email like 'b30-%';")"

run DENY "$RC" "the FIN seat cannot start a campaign" "select public.start_campaign('$CID');"
run DENY "$PLAINADMIN" "a plain admin cannot start a campaign" "select public.start_campaign('$CID');"
run DENY "$TM" "a campaign that is not approved cannot be started" \
  "select public.start_campaign((select id from public.email_campaigns where title='B30 nosender'));"
# Not approved yet, but otherwise complete: it has a sender and people to write to.
raw "$CAMP values ('B30 unapproved','s','b','donors_broadcast','$SENDER','$TM');" >/dev/null
UNAP=$(raw "select id from public.email_campaigns where title='B30 unapproved';")
run DENY "$TM" "a draft with a sender and an audience still cannot be started" "select public.start_campaign('$UNAP');"
raw "update public.email_campaigns set status='submitted', submitted_at=now() where id='$UNAP';" >/dev/null
run DENY "$TM" "nor one that is only waiting for approval" "select public.start_campaign('$UNAP');"
want "and nobody was queued by the attempt" "0" "$(rcount $UNAP queued)"
run ALLOW "$TM" "the COMMS seat starts the approved campaign" "select public.start_campaign('$CID');"
want "the campaign is sending" "sending" "$(st $CID)"
want "two people are queued" "2" "$(rcount $CID queued)"
want "the stopped supporter is not queued" "0" \
  "$(raw "select count(*) from public.email_campaign_recipients where campaign_id='$CID' and email='b30-sup2@test.example';")"
run DENY "$TM" "a campaign cannot be started twice" "select public.start_campaign('$CID');"

raw "$CAMP values ('B30 nobody','Hi','Body','church_partners','$SENDER','$TM');" >/dev/null
NOBODY=$(raw "select id from public.email_campaigns where title='B30 nobody';")
raw "update public.email_campaigns set status='approved', approved_at=now(), reviewed_by='$NC' where id='$NOBODY';" >/dev/null
run DENY "$TM" "a segment with nobody in it cannot be started" "select public.start_campaign('$NOBODY');"
want "and it stays approved" "approved" "$(st $NOBODY)"

run DENY "$TM" "a signed-in user cannot read the send queue" "select count(*) from public.email_campaign_recipients;"
run DENY "$NC" "not even the National Coordinator" "select count(*) from public.email_campaign_recipients;"
for u in "$TM" "$NC"; do
  run DENY "$u" "a signed-in user cannot claim a batch" "select * from public.claim_campaign_batch('$CID',10);"
  run DENY "$u" "a signed-in user cannot list a segment's addresses" "select * from public.audience_segment_recipients('team_all');"
  run DENY "$u" "a signed-in user cannot record send results" "select public.record_batch_results('$CID', jsonb_build_array());"
  run DENY "$u" "a signed-in user cannot record a delivery event" "select public.record_delivery_event('resend','x','a@b.c','complained');"
  run DENY "$u" "a signed-in user cannot record an unsubscribe" "select public.record_unsubscribe('a@b.c');"
  run DENY "$u" "a signed-in user cannot see the allowance" "select public.campaign_allowance('resend');"
  run DENY "$u" "a signed-in user cannot release a claim" "select public.release_batch('$CID', array['a@b.c']);"
done
want "FIN can see progress" "2|0|0|0|0" "$(as "$RC" "select queued||'|'||sending||'|'||sent||'|'||failed||'|'||skipped from public.campaign_progress('$CID');")"
run DENY "$PLAINADMIN" "a plain admin cannot see progress" "select * from public.campaign_progress('$CID');"

# ── PART D. The engine's side: limits, retries, crashes ────────────────
raw "insert into public.audience_contacts(full_name,email,category,lawful_basis,created_by)
     select 'B30 Bulk '||g, 'b30-bulk'||g||'@test.example', 'alumni', 'consent', '$NC' from generate_series(1,7) g;" >/dev/null
raw "$CAMP values ('B30 bulk','Hi {{first_name}}','Body','alumni','$SENDER','$TM');" >/dev/null
BULK=$(raw "select id from public.email_campaigns where title='B30 bulk';")
raw "update public.email_campaigns set status='approved', approved_at=now(), reviewed_by='$NC' where id='$BULK';" >/dev/null
run ALLOW "$TM" "the bulk campaign is started" "select public.start_campaign('$BULK');"
want "seven queued" "7" "$(rcount $BULK queued)"

raw "update public.email_providers set daily_cap = 3 where code='resend';" >/dev/null
want "a daily limit of 3 hands out 3" "3" "$(svc "select count(*) from public.claim_campaign_batch('$BULK',100);")"
want "and then no more, because claimed people count" "0" "$(svc "select count(*) from public.claim_campaign_batch('$BULK',100);")"
# Built as the superuser: the test database's service_role has no table rights of
# its own, where Supabase's bypasses row security. The function under test is the same.
raw "select public.record_batch_results('$BULK', (select jsonb_agg(jsonb_build_object('email',email,'ok',true,'id','m-'||email)) from public.email_campaign_recipients where campaign_id='$BULK' and status='sending'));" >/dev/null
want "three are sent" "3" "$(rcount $BULK sent)"
want "and the limit still holds once they are sent" "0" "$(svc "select count(*) from public.claim_campaign_batch('$BULK',100);")"

raw "update public.email_providers set daily_cap = 5 where code='resend';" >/dev/null
want "raising the limit to 5 allows exactly 2 more" "2" "$(svc "select count(*) from public.claim_campaign_batch('$BULK',100);")"
E1=$(raw "select email from public.email_campaign_recipients where campaign_id='$BULK' and status='sending' order by email limit 1;")
E2=$(raw "select email from public.email_campaign_recipients where campaign_id='$BULK' and status='sending' order by email desc limit 1;")
svc "select public.record_batch_results('$BULK', jsonb_build_array(
       jsonb_build_object('email','$E1','ok',true,'id','m-$E1'),
       jsonb_build_object('email','$E2','ok',false,'error','mailbox does not exist','retryable',false)));" >/dev/null
want "one sent, one failed for good" "4/1" "$(rcount $BULK sent)/$(rcount $BULK failed)"

raw "update public.email_providers set daily_cap = 100 where code='resend';" >/dev/null
want "the last two are handed out" "2" "$(svc "select count(*) from public.claim_campaign_batch('$BULK',100);")"
R1=$(raw "select email from public.email_campaign_recipients where campaign_id='$BULK' and status='sending' order by email limit 1;")
R2=$(raw "select email from public.email_campaign_recipients where campaign_id='$BULK' and status='sending' order by email desc limit 1;")
svc "select public.record_batch_results('$BULK', jsonb_build_array(jsonb_build_object('email','$R2','ok',true,'id','m-$R2')));" >/dev/null
svc "select public.record_batch_results('$BULK', jsonb_build_array(jsonb_build_object('email','$R1','ok',false,'error','provider busy','retryable',true)));" >/dev/null
want "a retryable failure goes back in the queue" "queued" "$(rstat $BULK $R1)"
svc "select count(*) from public.claim_campaign_batch('$BULK',100);" >/dev/null
want "and is tried again (attempt 2)" "2" "$(raw "select attempts from public.email_campaign_recipients where campaign_id='$BULK' and email='$R1';")"
svc "select public.record_batch_results('$BULK', jsonb_build_array(jsonb_build_object('email','$R1','ok',false,'error','provider busy','retryable',true)));" >/dev/null
svc "select count(*) from public.claim_campaign_batch('$BULK',100);" >/dev/null
svc "select public.record_batch_results('$BULK', jsonb_build_array(jsonb_build_object('email','$R1','ok',false,'error','provider busy','retryable',true)));" >/dev/null
want "after three tries it is a failure, not a fourth try" "failed" "$(rstat $BULK $R1)"
want "and the campaign is finished once nobody is left" "sent" "$(st $BULK)"
want "with a finish time" "t" "$(raw "select finished_at is not null from public.email_campaigns where id='$BULK';")"

# two claims never overlap; a claim that never came back is given back
raw "insert into public.audience_contacts(full_name,email,category,lawful_basis,created_by)
     select 'B30 Two '||g, 'b30-two'||g||'@test.example', 'other', 'consent', '$NC' from generate_series(1,4) g;" >/dev/null
raw "$CAMP values ('B30 two','Hi','Body','other_contacts','$SENDER','$TM');" >/dev/null
TWO=$(raw "select id from public.email_campaigns where title='B30 two';")
raw "update public.email_campaigns set status='approved', approved_at=now(), reviewed_by='$NC' where id='$TWO';" >/dev/null
run ALLOW "$TM" "the second campaign is started" "select public.start_campaign('$TWO');"
A=$(svc "select coalesce(string_agg(email, ',' order by email),'') from public.claim_campaign_batch('$TWO',2);")
B=$(svc "select coalesce(string_agg(email, ',' order by email),'') from public.claim_campaign_batch('$TWO',2);")
want "the first claim" "b30-two1@test.example,b30-two2@test.example" "$A"
want "the second claim is different people" "b30-two3@test.example,b30-two4@test.example" "$B"
raw "update public.email_campaign_recipients set claimed_at = now() - interval '20 minutes' where campaign_id='$TWO' and email='b30-two1@test.example';" >/dev/null
want "a claim that was never settled is handed out again" "b30-two1@test.example" \
  "$(svc "select coalesce(string_agg(email, ',' order by email),'') from public.claim_campaign_batch('$TWO',100);")"

# somebody stops after the campaign has started; a claim can be given back; a cancel stops it
raw "insert into public.audience_contacts(full_name,email,category,lawful_basis,created_by)
     select 'B30 School '||g, 'b30-school'||g||'@test.example', 'school_partner', 'contract', '$NC' from generate_series(1,3) g;" >/dev/null
raw "$CAMP values ('B30 school','Hi','Body','school_partners','$SENDER','$TM');" >/dev/null
SCH=$(raw "select id from public.email_campaigns where title='B30 school';")
raw "update public.email_campaigns set status='approved', approved_at=now(), reviewed_by='$NC' where id='$SCH';" >/dev/null
run ALLOW "$TM" "the school campaign is started" "select public.start_campaign('$SCH');"
raw "insert into public.email_suppressions(email,reason) values ('b30-school2@test.example','unsubscribed');" >/dev/null
want "the person who stopped after the start is not handed out" "b30-school1@test.example,b30-school3@test.example" \
  "$(svc "select coalesce(string_agg(email, ',' order by email),'') from public.claim_campaign_batch('$SCH',100);")"
want "and is marked skipped" "skipped" "$(rstat $SCH b30-school2@test.example)"
svc "select public.release_batch('$SCH', array['b30-school1@test.example']);" >/dev/null
want "a released claim goes back in the queue" "queued" "$(rstat $SCH b30-school1@test.example)"
want "without counting as an attempt" "0" "$(raw "select attempts from public.email_campaign_recipients where campaign_id='$SCH' and email='b30-school1@test.example';")"
run DENY  "$TM" "the COMMS seat cannot cancel a campaign" "select public.cancel_campaign('$SCH');"
run DENY  "$RC" "the FIN seat cannot cancel a campaign" "select public.cancel_campaign('$SCH');"
run ALLOW "$NC" "NC cancels the campaign" "select public.cancel_campaign('$SCH');"
want "it is cancelled" "cancelled" "$(st $SCH)"
want "nothing is handed out for a cancelled campaign" "0" "$(svc "select count(*) from public.claim_campaign_batch('$SCH',100);")"
want "and the unsent are skipped" "0" "$(rcount $SCH queued)"

# ── PART E. What providers report back ─────────────────────────────────
M1=$(raw "select provider_message_id from public.email_campaign_recipients where campaign_id='$BULK' and status='sent' order by email limit 1;")
X1=$(raw "select email from public.email_campaign_recipients where campaign_id='$BULK' and provider_message_id='$M1';")
svc "select public.record_delivery_event('resend','$M1','$X1','bounced_transient','mailbox full');" >/dev/null
want "a temporary bounce does not stop the address" "0" "$(raw "select count(*) from public.email_suppressions where email='$X1';")"
want "but is noted on the recipient" "t" "$(raw "select error like 'bounced_transient%' from public.email_campaign_recipients where campaign_id='$BULK' and email='$X1';")"

M2=$(raw "select provider_message_id from public.email_campaign_recipients where campaign_id='$BULK' and status='sent' order by email desc limit 1;")
X2=$(raw "select email from public.email_campaign_recipients where campaign_id='$BULK' and provider_message_id='$M2';")
svc "select public.record_delivery_event('resend','$M2','$X2','bounced_permanent','no such user');" >/dev/null
want "a permanent bounce stops the address" "bounced" "$(raw "select reason from public.email_suppressions where email='$X2';")"
want "and marks the recipient failed" "failed" "$(rstat $BULK $X2)"
svc "select public.record_delivery_event('resend','$M2','$X2','bounced_permanent','again');" >/dev/null
want "a repeated notice changes nothing" "1" "$(raw "select count(*) from public.email_suppressions where email='$X2';")"

svc "select public.record_delivery_event('resend','no-such-id','B30-Spam@Test.Example','complained');" >/dev/null
want "a complaint stops the address (typed in capitals)" "complaint" "$(raw "select reason from public.email_suppressions where email='b30-spam@test.example';")"
svc "select public.record_delivery_event('resend',null,'','complained');" >/dev/null
want "a notice with no address is harmless" "ok" "$(svc "select 'ok';")"

svc "select public.record_unsubscribe('B30-Unsub@Test.Example');" >/dev/null
want "the unsubscribe link stops the address" "unsubscribed" "$(raw "select reason from public.email_suppressions where email='b30-unsub@test.example';")"
svc "select public.record_unsubscribe('b30-unsub@test.example');" >/dev/null
want "following it twice changes nothing" "1" "$(raw "select count(*) from public.email_suppressions where email='b30-unsub@test.example';")"
want "an unsubscribe without an address is refused" "1" "$(svc "select public.record_unsubscribe('nonsense');" | grep -c ERROR)"

# ── PART F. The screen's counts are the sender's people ────────────────
raw "insert into public.directory_members(full_name, profile_id)
     select p.full_name, p.id from public.profiles p
      where p.id in ('$RC','$TM')
        and not exists (select 1 from public.directory_members d where d.profile_id = p.id);" >/dev/null
raw "update public.directory_contacts set email = null;" >/dev/null
raw "insert into public.directory_contacts(member_id,email)
     select id,'b30-rita@test.example' from public.directory_members where profile_id='$RC'
     on conflict (member_id) do update set email = excluded.email;" >/dev/null
raw "insert into public.directory_contacts(member_id,email)
     select id,'b30-tobi@test.example' from public.directory_members where profile_id='$TM'
     on conflict (member_id) do update set email = excluded.email;" >/dev/null
raw "insert into public.volunteer_records(profile_id,status) values ('$TM','active')
     on conflict (profile_id) do update set status='active';" >/dev/null
for seg in team_all team_rcs volunteers_active donors_broadcast church_partners school_partners alumni other_contacts; do
  a=$(as "$NC" "select emailable from public.audience_segment_counts() where segment='$seg';")
  b=$(svc "select count(*) from public.audience_segment_recipients('$seg');")
  want "the screen counts $seg the same people the sender writes to" "$a" "$b"
done
want "team members are addressed by first name" "Rita" \
  "$(svc "select first_name from public.audience_segment_recipients('team_rcs') where email='b30-rita@test.example';")"

# Tidy.
raw "delete from public.email_campaigns where title like 'B30 %';" >/dev/null
raw "delete from public.email_senders where from_email like 'b30-%';" >/dev/null
raw "delete from public.audience_contacts where email like 'b30-%';" >/dev/null
raw "delete from public.email_suppressions where email like 'b30-%';" >/dev/null
raw "update public.email_providers set daily_cap = 80, active = true where code = 'resend';" >/dev/null
raw "select public.set_portfolio('$TM','COMMS',false);" >/dev/null
raw "select public.set_portfolio('$RC','FIN',false);" >/dev/null

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
