#!/bin/bash
# BATCH38-MARKER tm-rc-review-chain
# Run after: _harness/setup.sh (loads the base chain, batch37, and batch38)
#
# Proves the Batch 38 Team Member -> Regional Coordinator -> National
# Coordinator review chain from the database side:
#   - a Team Member can now submit a concept note for their own chapter,
#     and it lands in "RC Review", never "Pending", however the client
#     tries to set status
#   - a Team Member still cannot submit for a chapter that isn't theirs
#   - the RC of that chapter can decline it (a reason is required, and
#     it's dead after that — even the submitting Team Member cannot
#     touch it again), return it with a comment (back to the Team
#     Member, into "RC Review" once revised), or revise it and forward
#     it to Pending for the NC (the Batch 37 gate still applies)
#   - none of this is available to the wrong RC, an NC without admin, or
#     the Team Member trying to act on their own note
#   - an RC's own submission, and the existing Returned-to-Pending and
#     Complete transitions, are unaffected
#
# Accounts (10-seed.sql), plus one added here for cross-chapter checks:
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, is_admin
NC=22222222-2222-2222-2222-222222222222      # Ngozi, role NC, not is_admin
RC=33333333-3333-3333-3333-333333333333      # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444      # Tobi, Benin TM
RC2=77777777-7777-7777-7777-777777777777     # Wale, Auchi RC (added below)
TM2=88888888-8888-8888-8888-888888888888     # Bola, Auchi TM (added below)

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
# Some denials are enforced by row-visibility (RLS), not by a raised
# exception: the wrong RC's UPDATE simply matches zero rows and still
# exits 0. So for those, run the attempt (whatever it does), then check
# with `want` that the row is exactly as it was before the attempt.
blocked(){ as "$1" "$2" >/dev/null 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2 got $3"; fail=$((fail+1)); fi; }
run(){ local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid='$2'; $4\"" 2>&1); rc=$?
  if [ "$1" = DENY ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $3"; pass=$((pass+1)); else echo "  XX   ALLOWED but should refuse: $3"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $3"; pass=$((pass+1)); else echo "  XX   REFUSED but should allow: $3"; echo "$out"|grep -i error|head -1|sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}
# Inserts a note as admin (bypassing the gate/routing triggers, which
# only apply to non-admins) so each test below starts from a known,
# specific status rather than fighting the routing trigger to get there.
seed(){ raw "set role authenticated; set test.uid='$ADMIN'; insert into public.programs (id, title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('$1','$2','$3','$4',20,'$5',$6,'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Physical');" >/dev/null; }

BENIN=$(raw "select id from public.chapters where name='Benin';")
AUCHI=$(raw "select id from public.chapters where name='Auchi';")

# A second chapter's RC and TM, so cross-chapter denial has someone to
# attempt it. Added here rather than in 10-seed.sql so batch37's own
# suite (which knows exactly four accounts) is untouched.
raw "insert into auth.users (id, email) values ('$RC2','rc.auchi@ycdi.test'), ('$TM2','tm.auchi@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id, full_name, role, chapter_id, is_admin) values
     ('$RC2','Wale RC','RC','$AUCHI',false),
     ('$TM2','Bola TeamMate','TM','$AUCHI',false)
     on conflict (id) do nothing;" >/dev/null

echo "Batch 38 — Team Member -> RC -> NC review chain"
raw "delete from public.programs where title like 'B38 %';" >/dev/null

# ── PART A. Where a new note lands ──────────────────────────────────────

run DENY "$TM" "a team member cannot submit for a chapter that isn't theirs" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('B38 wrong-chapter', '$AUCHI', 'Pending', 20, '$TM', 100000, 'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Physical');"

run ALLOW "$TM" "a team member can submit a complete concept note for their own chapter" \
  "insert into public.programs (id, title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('aaaaaaaa-3800-0000-0000-000000000001', 'B38 tm-note', '$BENIN', 'Pending', 20, '$TM', 100000, 'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Physical');"

want "a team member's note lands in RC Review, not Pending, even though the client sent Pending" \
  "RC Review" "$(raw "select status from public.programs where id='aaaaaaaa-3800-0000-0000-000000000001';")"

run ALLOW "$RC" "an RC's own submission is unaffected: it still lands in Pending" \
  "insert into public.programs (id, title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('aaaaaaaa-3800-0000-0000-000000000002', 'B38 rc-note', '$BENIN', 'RC Review', 20, '$RC', 100000, 'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Physical');"

want "an RC's own note lands in Pending, not RC Review, even though the client sent RC Review" \
  "Pending" "$(raw "select status from public.programs where id='aaaaaaaa-3800-0000-0000-000000000002';")"

run DENY "$TM" "the concept-note gate still applies to a team member's submission" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, delivery_format) values ('B38 bare', '$BENIN', 'Pending', 20, '$TM', 100000, 'Physical');"

# ── PART B. Decline ─────────────────────────────────────────────────────

seed aaaaaaaa-3800-0000-0000-000000000003 "B38 review-me" "$BENIN" "RC Review" "$TM" 100000
NOTE=aaaaaaaa-3800-0000-0000-000000000003

run DENY "$RC" "the chapter's RC cannot quietly set a review comment while leaving the note in RC Review" \
  "update public.programs set rc_comment='just a note' where id='$NOTE';"

run DENY "$RC" "declining with a blank reason is refused" \
  "update public.programs set status='Declined', rc_comment='' where id='$NOTE';"

blocked "$RC2" "update public.programs set status='Declined', rc_comment='not for you' where id='$NOTE';"
want "the wrong chapter's RC cannot decline this note (row untouched)" \
  "RC Review|" "$(raw "select status, coalesce(rc_comment,'') from public.programs where id='$NOTE';")"

run DENY "$TM" "the team member cannot decline their own note" \
  "update public.programs set status='Declined', rc_comment='self-decline' where id='$NOTE';"

blocked "$NC" "update public.programs set status='Declined', rc_comment='nc trying' where id='$NOTE';"
want "an NC without admin cannot decline a note (row untouched)" \
  "RC Review|" "$(raw "select status, coalesce(rc_comment,'') from public.programs where id='$NOTE';")"

run ALLOW "$RC" "the chapter's RC can decline the note, with a reason" \
  "update public.programs set status='Declined', rc_comment='Needs a clearer safeguarding lead.' where id='$NOTE';"

want "it is Declined, with the reason recorded" \
  "Declined|Needs a clearer safeguarding lead." "$(raw "select status, rc_comment from public.programs where id='$NOTE';")"

run DENY "$TM" "once declined, the team member cannot revive it by editing it" \
  "update public.programs set title='B38 revived attempt' where id='$NOTE';"

run DENY "$RC" "once declined, the RC cannot also return it" \
  "update public.programs set status='RC Returned', rc_comment='changed my mind' where id='$NOTE';"

# ── PART C. Return with a comment, then the team member resubmits ──────

seed aaaaaaaa-3800-0000-0000-000000000004 "B38 return-me" "$BENIN" "RC Review" "$TM" 100000
RNOTE=aaaaaaaa-3800-0000-0000-000000000004

run DENY "$RC" "returning with a blank comment is refused" \
  "update public.programs set status='RC Returned', rc_comment='' where id='$RNOTE';"

blocked "$RC2" "update public.programs set status='RC Returned', rc_comment='not for you' where id='$RNOTE';"
want "the wrong chapter's RC cannot return this note either (row untouched)" \
  "RC Review|" "$(raw "select status, coalesce(rc_comment,'') from public.programs where id='$RNOTE';")"

run ALLOW "$RC" "the chapter's RC can return the note with a comment" \
  "update public.programs set status='RC Returned', rc_comment='Please add the venue and budget.' where id='$RNOTE';"

blocked "$TM2" "update public.programs set status='RC Review', school='Auchi Grammar School' where id='$RNOTE';"
want "a different team member cannot resubmit someone else's returned note (row untouched)" \
  "RC Returned|" "$(raw "select status, coalesce(school,'') from public.programs where id='$RNOTE';")"

run DENY "$TM" "the submitting team member cannot set the RC's comment themselves" \
  "update public.programs set rc_comment='I said it was fine' where id='$RNOTE';"

run DENY "$TM" "the submitting team member cannot skip RC Review and jump straight to Pending" \
  "update public.programs set status='Pending', school='shortcut' where id='$RNOTE';"

run ALLOW "$TM" "the submitting team member can revise and resubmit it" \
  "update public.programs set status='RC Review', school='Auchi Grammar School' where id='$RNOTE';"

want "it is back in RC Review" "RC Review" "$(raw "select status from public.programs where id='$RNOTE';")"
want "the RC's comment stays on the record as history" \
  "Please add the venue and budget." "$(raw "select rc_comment from public.programs where id='$RNOTE';")"

run DENY "$TM" "once resubmitted, the team member cannot edit it again while it awaits the RC" \
  "update public.programs set school='Yet another edit' where id='$RNOTE';"

# ── PART D. Revise and forward to the NC ────────────────────────────────

seed aaaaaaaa-3800-0000-0000-000000000005 "B38 forward-me" "$BENIN" "RC Review" "$TM" 40000
FNOTE=aaaaaaaa-3800-0000-0000-000000000005

blocked "$RC2" "update public.programs set status='Pending' where id='$FNOTE';"
want "the wrong chapter's RC cannot forward this note (row untouched)" \
  "RC Review" "$(raw "select status from public.programs where id='$FNOTE';")"

run DENY "$RC" "forwarding still runs the Batch 37 gate: blanking a required field is refused" \
  "update public.programs set status='Pending', needs_evidence='' where id='$FNOTE';"

run ALLOW "$RC" "the chapter's RC can revise a field and forward it to the NC" \
  "update public.programs set status='Pending', budget=45000, school='Benin Central School' where id='$FNOTE';"

want "it is Pending, with the RC's edit applied" \
  "Pending|Benin Central School|45000" "$(raw "select status, school, budget from public.programs where id='$FNOTE';")"

run ALLOW "$ADMIN" "once forwarded, it is a normal Pending note: the NC (admin) can approve it" \
  "select public.approve_program('$FNOTE');"

want "it is Approved, same as any other Level 3 note" \
  "Approved" "$(raw "select status from public.programs where id='$FNOTE';")"

# ── PART E. Existing RC moves are unaffected ───────────────────────────

seed aaaaaaaa-3800-0000-0000-000000000006 "B38 nc-returned" "$BENIN" "Returned" "$RC" 30000
run ALLOW "$RC" "an RC can still resubmit an NC-returned note straight to Pending, as before" \
  "update public.programs set status='Pending' where id='aaaaaaaa-3800-0000-0000-000000000006';"

seed aaaaaaaa-3800-0000-0000-000000000007 "B38 live" "$BENIN" "Live" "$RC" 30000
run ALLOW "$RC" "an RC can still mark a Live programme Complete, as before" \
  "update public.programs set status='Complete' where id='aaaaaaaa-3800-0000-0000-000000000007';"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
