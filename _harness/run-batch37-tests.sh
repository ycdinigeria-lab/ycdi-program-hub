#!/bin/bash
# BATCH37-MARKER concept-note-v2
# Run after: _harness/setup.sh (base chain) then
#   psql -h /tmp/pg -d ycdi -f batch37-concept-note-v2.sql
#
# Proves the Batch 37 concept-note gate and the Level 3/4/5 approval
# thresholds from the database side:
#   - a genuine submission (insert, or a Returned note resubmitted into
#     Pending) is refused unless the Needs Identification Checklist and
#     the five Strategic Priority ratings are complete
#   - a note rating None on 3+ priorities is refused (section 1.6)
#   - a virtual or hybrid note needs a digital safeguarding plan
#   - an admin is exempt from the gate (data fixes, the existing seed)
#   - an ordinary edit that is not a (re)submission is not gated
#   - the approval level follows the budget (Level 3/4/5)
#   - approve_program refuses a Level 4 note without Treasurer
#     concurrence, and a Level 5 note without a Board date + minute ref
#   - a Returned note has its concurrence and Board sign-off cleared
#
# Accounts (10-seed.sql):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, is_admin
NC=22222222-2222-2222-2222-222222222222      # Ngozi, role NC, not is_admin
RC=33333333-3333-3333-3333-333333333333      # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444      # Tobi, Benin TM

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2 got $3"; fail=$((fail+1)); fi; }
run(){ local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid='$2'; $4\"" 2>&1); rc=$?
  if [ "$1" = DENY ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $3"; pass=$((pass+1)); else echo "  XX   ALLOWED but should refuse: $3"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $3"; pass=$((pass+1)); else echo "  XX   REFUSED but should allow: $3"; echo "$out"|grep -i error|head -1|sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

BENIN=$(raw "select id from public.chapters where name='Benin';")
TODAY=$(raw "select (now() at time zone 'Africa/Lagos')::date;")

echo "Batch 37 — concept note v2"

# ── PART A. The gate on INSERT ─────────────────────────────────────────
raw "delete from public.programs where title like 'B37 %';" >/dev/null

run DENY "$RC" "a note with no Needs Identification is refused" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, delivery_format) values ('B37 bare', '$BENIN', 'Pending', 20, '$RC', 100000, 'Physical');"

run DENY "$RC" "needs answered but no alignment rating is refused" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, delivery_format) values ('B37 no-align', '$BENIN', 'Pending', 20, '$RC', 100000, 'x','x','x','x','Physical');"

run DENY "$RC" "three None ratings is refused" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('B37 three-none', '$BENIN', 'Pending', 20, '$RC', 100000, 'x','x','x','x','None','None','None','Strong','Strong','Physical');"

run ALLOW "$RC" "two None ratings is allowed (only 3+ is refused)" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('B37 two-none', '$BENIN', 'Pending', 20, '$RC', 100000, 'x','x','x','x','None','None','Strong','Strong','Strong','Physical');"

run DENY "$RC" "a virtual programme with no digital safeguarding is refused" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('B37 virtual-nosg2', '$BENIN', 'Pending', 20, '$RC', 100000, 'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Virtual');"

run ALLOW "$RC" "a virtual programme with digital safeguarding is allowed" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format, digital_safeguarding) values ('B37 virtual-ok', '$BENIN', 'Pending', 20, '$RC', 100000, 'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Virtual','Co-facilitator on every call.');"

run ALLOW "$RC" "a complete note clears the gate" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('B37 complete', '$BENIN', 'Pending', 20, '$RC', 100000, 'Evidence here','Gap here','Voice here','Alternative here','Strong','Partial','Strong','Partial','Strong','Physical');"

run ALLOW "$ADMIN" "an admin is exempt from the gate" \
  "insert into public.programs (title, chapter_id, status, students, submitted_by, budget) values ('B37 admin-bare', '$BENIN', 'Pending', 20, '$RC', 100000);"

want "only the passing/allowed inserts landed" "4" "$(raw "select count(*) from public.programs where title like 'B37 %';")"

# ── PART B. The gate only fires on a genuine (re)submission ────────────
CID=$(raw "select id from public.programs where title='B37 complete';")
run ALLOW "$RC" "editing a field on a Pending note, without changing status, is not gated" \
  "update public.programs set school='Auchi Polytechnic' where id='$CID';"
run ALLOW "$ADMIN" "approving does not require the (already-met) gate again" \
  "select public.approve_program('$CID');"
want "it is Approved" "Approved" "$(raw "select status from public.programs where id='$CID';")"

# The trigger fires on any UPDATE that names the status column, whether
# or not the value actually changes, so the "genuine (re)submission"
# guard has to be the thing doing the work, not just the column list.
# Blank a needs field directly (no status touched, so this is not
# gated), then re-set status to the SAME value ('Approved') it already
# holds: that must still be allowed, because it is not a transition
# into Pending.
raw "update public.programs set needs_evidence='' where id='$CID';" >/dev/null
run ALLOW "$RC" "re-stating the same status on an Approved note is not treated as a resubmission" \
  "update public.programs set status='Approved' where id='$CID';"
raw "update public.programs set needs_evidence='Evidence here' where id='$CID';" >/dev/null

# Return it, blank out a needs field the way an old record might be, then
# prove resubmission is blocked until it's fixed, and works once it is.
raw "update public.programs set needs_evidence='' where id='$CID';" >/dev/null
run ALLOW "$ADMIN" "the National Coordinator returns it" \
  "select public.return_program('$CID', 'Please confirm the venue.');"
run DENY "$RC" "resubmitting with a blank Needs Identification answer is refused" \
  "update public.programs set status='Pending' where id='$CID';"
raw "update public.programs set needs_evidence='Evidence restored' where id='$CID';" >/dev/null
run ALLOW "$RC" "resubmitting once the checklist is complete again is allowed" \
  "update public.programs set status='Pending' where id='$CID';"

# ── PART C. Approval level follows the budget ───────────────────────────
want "N500,000 is Level 3"   "3" "$(raw "select public.program_approval_level(500000);")"
want "N500,001 is Level 4"   "4" "$(raw "select public.program_approval_level(500001);")"
want "N2,000,000 is Level 4" "4" "$(raw "select public.program_approval_level(2000000);")"
want "N2,000,001 is Level 5" "5" "$(raw "select public.program_approval_level(2000001);")"
want "no budget set is Level 3" "3" "$(raw "select public.program_approval_level(null);")"
want "the complete note's stored level matches its budget" "3" "$(raw "select approval_level from public.programs where id='$CID';")"

# ── PART D. approve_program enforces Level 4 and Level 5 sign-off ──────
L4=$(raw "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('B37 level4', '$BENIN', 'Pending', 60, '$RC', 900000, 'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Physical') returning id;")
want "the Level 4 note is stamped Level 4" "4" "$(raw "select approval_level from public.programs where id='$L4';")"
run DENY "$ADMIN" "a Level 4 note cannot be approved without Treasurer concurrence" \
  "select public.approve_program('$L4');"
run ALLOW "$ADMIN" "a Level 4 note is approved once concurrence is confirmed" \
  "select public.approve_program('$L4', true, 'Tunde Treasurer');"
want "it is Approved, with the tick and name recorded" "Approved|true|Tunde Treasurer" \
  "$(raw "select status||'|'||treasurer_concurrence||'|'||treasurer_name from public.programs where id='$L4';")"

L5=$(raw "insert into public.programs (title, chapter_id, status, students, submitted_by, budget, needs_evidence, needs_gap, needs_beneficiary_voice, needs_alternative, align_reach, align_roots, align_resources, align_raise, align_reputation, delivery_format) values ('B37 level5', '$BENIN', 'Pending', 200, '$RC', 3000000, 'x','x','x','x','Strong','Strong','Strong','Strong','Strong','Physical') returning id;")
want "the Level 5 note is stamped Level 5" "5" "$(raw "select approval_level from public.programs where id='$L5';")"
run DENY "$ADMIN" "a Level 5 note cannot be approved without a Board date and minute reference" \
  "select public.approve_program('$L5');"
run DENY "$ADMIN" "a Level 5 note with only a minute reference (no date) is still refused" \
  "select public.approve_program('$L5', null, null, 'NEC/2026/09');"
run ALLOW "$ADMIN" "a Level 5 note is approved once both are recorded" \
  "select public.approve_program('$L5', null, null, 'NEC/2026/09', '$TODAY'::date);"
want "it is Approved, with the Board reference and date" "Approved|NEC/2026/09|$TODAY" \
  "$(raw "select status||'|'||board_minute_ref||'|'||board_approval_date from public.programs where id='$L5';")"

# ── PART E. Returning clears the sign-off ──────────────────────────────
raw "update public.programs set status='Returned', nc_comment='Recheck the budget line' where id='$L4';" >/dev/null
run ALLOW "$ADMIN" "returning the Level 4 note clears its concurrence" \
  "select public.return_program('$L4', 'Recheck the budget line.');"
want "the tick, name and date are all cleared" "false||" \
  "$(raw "select treasurer_concurrence||'|'||coalesce(treasurer_name,'')||'|'||coalesce(treasurer_concurrence_date::text,'') from public.programs where id='$L4';")"

# ── PART F. Approval stays admin-only, unchanged from before ───────────
run DENY "$RC" "a Regional Coordinator still cannot approve" "select public.approve_program('$L5');"
run DENY "$NC" "an NC without is_admin still cannot approve" "select public.approve_program('$L5');"
run DENY "$TM" "a team member still cannot approve" "select public.approve_program('$L5');"

# Tidy.
raw "delete from public.programs where title like 'B37 %';" >/dev/null

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
