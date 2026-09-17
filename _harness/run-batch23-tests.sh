#!/bin/bash
# BATCH23-MARKER content-approval
# Run after:
#   EXTRA="batch1-notifications.sql batch2-participants.sql batch3-safeguarding.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch18-nec-portfolios.sql batch23-content-approval.sql" bash _harness/setup.sh
#
# Proves the content approval workflow from the database side:
#   - a chapter post is the RC's to draft, and the COMMS seat's to clear;
#     the National Coordinator cannot approve it while a COMMS seat exists
#   - a national post is the COMMS seat's to draft, and the NC's to clear
#   - a draft is private until submitted; a post cannot be self-approved,
#     nor its status walked forward by a direct write
#   - with the COMMS seat empty, chapter posts fall to the NC, and no
#     further, so content is never stuck; filling the seat closes that door
#   - the seat changes nothing about the holder's own role
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin team member — will hold COMMS

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
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

echo "Batch 23 — content approval workflow"

BENIN="(select id from public.chapters where name='Benin')"

# Clean slate for repeat runs.
raw "delete from public.content_items where title like 'B23 %';" >/dev/null

# ── PART A. Chapter post: RC drafts, COMMS clears ──────────────────────
# Give Tobi (a plain TM) the COMMS seat. He is the Communications Officer.
raw "select public.set_portfolio('$TM','COMMS',true);" >/dev/null

# The RC drafts a chapter post for their own chapter.
run ALLOW "$RC" "RC drafts a chapter post" \
  "insert into public.content_items(origin,chapter_id,author_id,title,body,channel) values ('chapter',$BENIN,'$RC','B23 chapter draft','Come to the fellowship','Instagram');"

# A plain team member cannot draft a chapter post.
run DENY "$TM" "COMMS holder (base role TM) cannot draft a chapter post as if RC" \
  "insert into public.content_items(origin,chapter_id,author_id,title,body) values ('chapter',$BENIN,'$TM','B23 tm chapter','x');"

# An RC drafts for their OWN chapter only: the Benin RC cannot post to Auchi.
run DENY "$RC" "Benin RC cannot draft a post for another chapter" \
  "insert into public.content_items(origin,chapter_id,author_id,title) values ('chapter',(select id from public.chapters where name='Auchi'),'$RC','B23 cross chapter');"

# While it is a draft, only the author sees it.
want "COMMS cannot see another's chapter draft" "0" \
  "$(as "$TM" "select count(*) from public.content_items where title='B23 chapter draft';")"
want "NC cannot see a chapter draft"            "0" \
  "$(as "$NC" "select count(*) from public.content_items where title='B23 chapter draft';")"

# The author cannot approve their own post by walking the status directly.
run DENY "$RC" "RC cannot self-advance a draft to approved by hand" \
  "update public.content_items set status='approved' where title='B23 chapter draft';"

# Nobody but the author may submit the author's draft.
CID=$(raw "select id from public.content_items where title='B23 chapter draft';")
run DENY "$NC" "a non-author cannot submit someone else's draft" \
  "select public.submit_content('$CID');"

# The author submits it through the function.
run ALLOW "$RC" "RC submits the chapter post" "select public.submit_content('$CID');"
want "post is now submitted" "submitted" \
  "$(raw "select status from public.content_items where id='$CID';")"

# Now the COMMS holder sees it; the NC does not (COMMS seat is filled).
want "COMMS sees the submitted chapter post" "1" \
  "$(as "$TM" "select count(*) from public.content_items where id='$CID';")"
want "NC does NOT see the submitted chapter post while COMMS seat is filled" "0" \
  "$(as "$NC" "select count(*) from public.content_items where id='$CID';")"

# The NC cannot approve a chapter post: that is the COMMS officer's.
run DENY "$NC" "NC cannot approve a chapter post (COMMS seat exists)" \
  "select public.approve_content('$CID');"
# The author cannot approve their own submission.
run DENY "$RC" "author cannot approve their own post" \
  "select public.approve_content('$CID');"

# The COMMS officer returns it with a note; the author edits and resubmits.
run ALLOW "$TM" "COMMS returns the post with a note" \
  "select public.return_content('$CID','Add the venue');"
want "post is now returned" "returned" \
  "$(raw "select status from public.content_items where id='$CID';")"
run ALLOW "$RC" "author edits a returned post" \
  "update public.content_items set body='Come to the fellowship — Benin hall' where id='$CID';"
run ALLOW "$RC" "author resubmits" "select public.submit_content('$CID');"

# The COMMS officer clears it. Then it can be marked published.
run ALLOW "$TM" "COMMS approves the chapter post" "select public.approve_content('$CID','Good to go');"
want "post is now approved" "approved" \
  "$(raw "select status from public.content_items where id='$CID';")"
run DENY "$NC" "an unrelated NC cannot mark it published (chapter post)" \
  "select public.publish_content('$CID');"
run ALLOW "$RC" "author marks it published" "select public.publish_content('$CID');"
want "post is now published" "published" \
  "$(raw "select status from public.content_items where id='$CID';")"

# ── PART B. National post: COMMS drafts, NC clears ─────────────────────
run ALLOW "$TM" "COMMS drafts a national post" \
  "insert into public.content_items(origin,author_id,title,body,channel) values ('national','$TM','B23 national draft','Year in review','Website');"
# An RC cannot draft a national post.
run DENY "$RC" "RC cannot draft a national post" \
  "insert into public.content_items(origin,author_id,title,body) values ('national','$RC','B23 rc national','x');"
# A national post must not carry a chapter (the check constraint).
run DENY "$TM" "a national post cannot name a chapter" \
  "insert into public.content_items(origin,chapter_id,author_id,title) values ('national',$BENIN,'$TM','B23 bad national');"

NID=$(raw "select id from public.content_items where title='B23 national draft';")
run ALLOW "$TM" "COMMS submits the national post" "select public.submit_content('$NID');"
# The NC is the approver for national posts; the COMMS officer is not.
run DENY "$TM" "COMMS cannot approve its own national post" \
  "select public.approve_content('$NID');"
run ALLOW "$NC" "NC approves the national post" "select public.approve_content('$NID');"
want "national post approved" "approved" \
  "$(raw "select status from public.content_items where id='$NID';")"

# ── PART C. Empty-seat fallback for chapter posts ──────────────────────
# Take the COMMS seat away. Now nobody holds it.
raw "select public.set_portfolio('$TM','COMMS',false);" >/dev/null
want "COMMS seat now reads empty" "f" "$(raw "select public.comms_seat_filled();")"

# A fresh chapter post, submitted with no COMMS officer in post.
raw "insert into public.content_items(origin,chapter_id,author_id,title,body,status,submitted_at) values ('chapter',$BENIN,'$RC','B23 orphan chapter','y','submitted',now());" >/dev/null
OID=$(raw "select id from public.content_items where title='B23 orphan chapter';")
# With the seat empty, the NC stands in and can both see and approve it.
want "NC now sees the chapter post (seat empty)" "1" \
  "$(as "$NC" "select count(*) from public.content_items where id='$OID';")"
run ALLOW "$NC" "NC approves a chapter post while the COMMS seat is empty" \
  "select public.approve_content('$OID');"

# The stand-in is only for the empty seat: an RC still cannot approve, and
# a plain TM (Tobi, seat now removed) sees nothing and can approve nothing.
raw "update public.content_items set status='submitted', review_note=null where id='$OID';" >/dev/null
run DENY "$RC" "an RC cannot approve a chapter post even with the seat empty" \
  "select public.approve_content('$OID');"
want "ex-COMMS plain TM sees no submitted chapter post" "0" \
  "$(as "$TM" "select count(*) from public.content_items where id='$OID';")"
run DENY "$TM" "ex-COMMS plain TM cannot approve a chapter post" \
  "select public.approve_content('$OID');"

# ── PART D. The seat grants no role change ─────────────────────────────
raw "select public.set_portfolio('$TM','COMMS',true);" >/dev/null
want "COMMS holder still reads as TM" "TM" "$(as "$TM" "select public.dir_role();")"
raw "select public.set_portfolio('$TM','COMMS',false);" >/dev/null

# Tidy.
raw "delete from public.content_items where title like 'B23 %';" >/dev/null

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
