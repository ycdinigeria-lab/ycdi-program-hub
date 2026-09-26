#!/bin/bash
# BATCH32-MARKER finance
# Run after:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch18-nec-portfolios.sql batch32-finance.sql" bash _harness/setup.sh
#
# Proves the finance module from the database side:
#   - the Treasurer seat can be assigned, by the right people only
#   - a programme's budget is copied in kobo at approval and frozen: editing
#     the concept note afterwards does not move it, revising it needs the
#     Financial Secretary and a reason and cannot go below money already
#     approved
#   - who can see a claim: its owner, the Regional Coordinator of the same
#     chapter and nobody from another, and NC, FIN and TREAS; never a plain
#     admin, never a colleague
#   - nobody writes to a finance table directly, and the functions refuse
#     a signed-out caller
#   - the claim path: a claim needs a receipt or a reason, the thirty day
#     clock starts at submission and restarts on resubmission, only the
#     right person decides, nobody decides their own, an over-budget
#     approval needs a note, payment cannot carry an account number
#   - the record of events is append-only
#   - receipt files: the owner adds them while the claim is open, the people
#     who can see the claim can read them, nobody else can
#   - the numbers on the screen add up
#
# Accounts (same seed ids the other batches use, plus four more):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin TM (claimant)
FINH=77777777-7777-7777-7777-777777777777     # Femi, Benin TM, holds FIN
TREAS=99999999-9999-9999-9999-999999999999    # Tunde, Lagos TM, holds TREAS
PLAINADMIN=88888888-8888-8888-8888-888888888888 # Sam, TM with is_admin and nothing else
TM2=aaaaaaaa-1111-1111-1111-111111111111      # Bisi, Benin TM (colleague)
RCA=aaaaaaaa-2222-2222-2222-222222222222      # Ada-RC, Auchi RC (other chapter)

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
anon(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -v ON_ERROR_STOP=1 -c \"set role anon; set test.uid=''; $1\"" 2>&1; }
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
TODAY=$(raw "select (now() at time zone 'Africa/Lagos')::date;")
cstat(){ raw "select status from public.expense_claims where id='$1';"; }

echo "Batch 32 — finance"

# ── Clean slate and accounts ───────────────────────────────────────────
raw "delete from public.expense_claims where title like 'B32 %';" >/dev/null
raw "delete from public.programs where title like 'B32 %';" >/dev/null
raw "alter table storage.objects enable row level security;" >/dev/null
raw "delete from storage.objects where bucket_id='finance-receipts';" >/dev/null
for u in $NC $RC $TM $FINH $TREAS $TM2; do for s in FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done
raw "insert into auth.users (id,email) values
  ('$FINH','femi@ycdi.test'),('$TREAS','tunde@ycdi.test'),('$PLAINADMIN','sam@ycdi.test'),
  ('$TM2','bisi@ycdi.test'),('$RCA','adarc@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values
  ('$FINH','Femi Finance','TM',(select id from public.chapters where name='Benin'),false),
  ('$TREAS','Tunde Treasurer','TM',(select id from public.chapters where name='Lagos'),false),
  ('$PLAINADMIN','Sam Sysadmin','TM',(select id from public.chapters where name='Benin'),true),
  ('$TM2','Bisi Colleague','TM',(select id from public.chapters where name='Benin'),false),
  ('$RCA','Auchi Coordinator','RC',(select id from public.chapters where name='Auchi'),false)
  on conflict (id) do update set role=excluded.role, chapter_id=excluded.chapter_id, is_admin=excluded.is_admin;" >/dev/null
BENIN=$(raw "select id from public.chapters where name='Benin';")
AUCHI=$(raw "select id from public.chapters where name='Auchi';")

# Three programmes, built as the owner. P1 and P2 are Benin, P3 is Auchi.
# Budgets are in naira on the concept note: 500,000 and 100,000 and 80,000.
mkprog(){ raw "insert into public.programs (id,title,chapter_id,status,budget,spent) values ('$1','$2','$3','Pending',$4,$5);" >/dev/null; }
P1=$(cat /proc/sys/kernel/random/uuid)
P2=$(cat /proc/sys/kernel/random/uuid)
P3=$(cat /proc/sys/kernel/random/uuid)
P4=$(cat /proc/sys/kernel/random/uuid)
mkprog $P1 "B32 Benin visit" $BENIN 500000 0
mkprog $P2 "B32 Benin retreat" $BENIN 100000 90000.50
mkprog $P3 "B32 Auchi visit" $AUCHI 80000 0
mkprog $P4 "B32 Benin not approved" $BENIN 70000 0

# ── PART A. The Treasurer seat ─────────────────────────────────────────
run ALLOW "$NC" "the National Coordinator assigns the Treasurer seat" "select public.set_portfolio('$TREAS','TREAS',true);"
want "the seat is held" "$TREAS" "$(raw "select profile_id from public.nec_portfolios where portfolio='TREAS';")"
run DENY  "$TM"  "a team member cannot assign the Treasurer seat" "select public.set_portfolio('$TM','TREAS',true);"
run DENY  "$RC"  "a Regional Coordinator cannot assign it" "select public.set_portfolio('$RC','TREAS',true);"
run DENY  "$NC"  "an unknown seat code is still refused" "select public.set_portfolio('$TM','BOSS',true);"
raw "select public.set_portfolio('$FINH','FIN',true);" >/dev/null
want "the Financial Secretary seat is held" "$FINH" "$(raw "select profile_id from public.nec_portfolios where portfolio='FIN';")"

# ── PART B. Budgets are copied at approval and frozen ──────────────────
want "a pending programme has no finance budget" "0" "$(raw "select count(*) from public.finance_budgets where programme_id in ('$P1','$P2','$P3','$P4');")"
raw "update public.programs set status='Approved' where id in ('$P1','$P2','$P3');" >/dev/null
want "P1 is copied in kobo" "50000000" "$(raw "select approved_kobo from public.finance_budgets where programme_id='$P1';")"
want "P2 is copied in kobo" "10000000" "$(raw "select approved_kobo from public.finance_budgets where programme_id='$P2';")"
want "a programme that is still pending has none" "0" "$(raw "select count(*) from public.finance_budgets where programme_id='$P4';")"
want "the copy is recorded" "3" "$(raw "select count(*) from public.finance_events where kind='budget_set' and programme_id in ('$P1','$P2','$P3');")"
raw "update public.programs set budget = 999999 where id='$P1';" >/dev/null
want "editing the concept note afterwards does not move the budget" "50000000" "$(raw "select approved_kobo from public.finance_budgets where programme_id='$P1';")"
raw "update public.programs set budget = 500000 where id='$P1';" >/dev/null

# sent back, corrected, approved again, with no money claimed yet
raw "update public.programs set status='Pending', budget=120000 where id='$P3';" >/dev/null
raw "update public.programs set status='Approved' where id='$P3';" >/dev/null
want "re-approval with no claims picks up the corrected figure" "12000000" "$(raw "select approved_kobo from public.finance_budgets where programme_id='$P3';")"

want "the Regional Coordinator sees their own chapter's budgets" "2" "$(as "$RC" "select count(*) from public.finance_budgets where programme_id in ('$P1','$P2','$P3');")"
want "and not another chapter's" "1" "$(as "$RCA" "select count(*) from public.finance_budgets where programme_id in ('$P1','$P2','$P3');")"
want "a team member sees no budgets" "0" "$(as "$TM" "select count(*) from public.finance_budgets;")"
for u in "$NC" "$FINH" "$TREAS"; do
  want "NC, FIN and TREAS see all three budgets ($u)" "3" "$(as "$u" "select count(*) from public.finance_budgets where programme_id in ('$P1','$P2','$P3');")"
done
want "a plain admin sees none" "0" "$(as "$PLAINADMIN" "select count(*) from public.finance_budgets;")"

run DENY "$NC"   "the National Coordinator cannot write a budget directly" "insert into public.finance_budgets(programme_id,approved_kobo) values ('$P4',1);"
run DENY "$FINH" "the Financial Secretary cannot write a budget directly" "update public.finance_budgets set approved_kobo = 1 where programme_id='$P1';"
run DENY "$FINH" "nor delete one" "delete from public.finance_budgets where programme_id='$P1';"

run DENY  "$TREAS" "the Treasurer cannot revise a budget" "select public.revise_programme_budget('$P1', 60000000, 'Board raised the ceiling');"
run DENY  "$RC"    "a Regional Coordinator cannot revise a budget" "select public.revise_programme_budget('$P1', 60000000, 'Board raised the ceiling');"
run DENY  "$NC"    "the National Coordinator cannot while the FIN seat is filled" "select public.revise_programme_budget('$P1', 60000000, 'Board raised the ceiling');"
run DENY  "$FINH"  "a revision needs a reason" "select public.revise_programme_budget('$P1', 60000000, 'x');"
run DENY  "$FINH"  "a negative budget is refused" "select public.revise_programme_budget('$P1', -5, 'Correcting a typing error');"
run DENY  "$FINH"  "an unknown programme is refused" "select public.revise_programme_budget('$P4', 100, 'Not approved so no budget');"
run ALLOW "$FINH"  "the Financial Secretary revises with a reason" "select public.revise_programme_budget('$P1', 60000000, 'Board raised the ceiling');"
want "the revision holds" "60000000|revised" "$(raw "select approved_kobo||'|'||source from public.finance_budgets where programme_id='$P1';")"
raw "update public.programs set status='Pending' where id='$P1';" >/dev/null
raw "update public.programs set budget=1, status='Approved' where id='$P1';" >/dev/null
want "a revised budget is not overwritten by a later re-approval" "60000000" "$(raw "select approved_kobo from public.finance_budgets where programme_id='$P1';")"

# ── PART C. Who can do what with a claim ───────────────────────────────
CLM="select public.save_claim(NULL, 'B32 taxi to school', 'transport', 350000, '$TODAY'::date, '$P1', 'Return trip for the visit', NULL);"
run ALLOW "$TM" "a team member starts a claim against a Benin programme" "$CLM"
C1=$(raw "select id from public.expense_claims where title='B32 taxi to school';")
want "it is a draft, in kobo, in their chapter, with their name" "draft|350000|Tobi TeamMate" "$(raw "select status||'|'||amount_kobo||'|'||claimant_name from public.expense_claims where id='$C1';")"
want "in the claimant's chapter" "$BENIN" "$(raw "select chapter_id from public.expense_claims where id='$C1';")"

run DENY "$TM" "a claim needs a title"        "select public.save_claim(NULL, '  ', 'transport', 100, '$TODAY'::date, NULL, NULL, NULL);"
run DENY "$TM" "a claim needs a real category" "select public.save_claim(NULL, 'B32 x', 'jewellery', 100, '$TODAY'::date, NULL, NULL, NULL);"
run DENY "$TM" "zero is refused"              "select public.save_claim(NULL, 'B32 x', 'other', 0, '$TODAY'::date, NULL, NULL, NULL);"
run DENY "$TM" "negative is refused"          "select public.save_claim(NULL, 'B32 x', 'other', -100, '$TODAY'::date, NULL, NULL, NULL);"
run DENY "$TM" "over the single-claim limit"  "select public.save_claim(NULL, 'B32 x', 'other', 5000000001, '$TODAY'::date, NULL, NULL, NULL);"
run DENY "$TM" "a spend date in the future"   "select public.save_claim(NULL, 'B32 x', 'other', 100, '$TODAY'::date + 2, NULL, NULL, NULL);"
run DENY "$TM" "a programme in another chapter" "select public.save_claim(NULL, 'B32 x', 'other', 100, '$TODAY'::date, '$P3', NULL, NULL);"
run DENY "$TM" "a programme with no approved budget" "select public.save_claim(NULL, 'B32 x', 'other', 100, '$TODAY'::date, '$P4', NULL, NULL);"
want "no stray rows from the refusals" "1" "$(raw "select count(*) from public.expense_claims where title like 'B32 %';")"

want "the owner sees their claim" "1" "$(as "$TM" "select count(*) from public.expense_claims where id='$C1';")"
want "a colleague in the same chapter does not" "0" "$(as "$TM2" "select count(*) from public.expense_claims where id='$C1';")"
want "a draft is private: the Regional Coordinator of the chapter does not see it" "0" "$(as "$RC" "select count(*) from public.expense_claims where id='$C1';")"
want "a draft is private: the Regional Coordinator of another chapter does not" "0" "$(as "$RCA" "select count(*) from public.expense_claims where id='$C1';")"
want "a draft is private: the Financial Secretary does not see it" "0" "$(as "$FINH" "select count(*) from public.expense_claims where id='$C1';")"
want "a draft is private: the Treasurer does not" "0" "$(as "$TREAS" "select count(*) from public.expense_claims where id='$C1';")"
want "a draft is private: the National Coordinator does not" "0" "$(as "$NC" "select count(*) from public.expense_claims where id='$C1';")"
want "a plain admin does not" "0" "$(as "$PLAINADMIN" "select count(*) from public.expense_claims where id='$C1';")"

run DENY "$TM"    "no direct insert"  "insert into public.expense_claims(claimant_name,category,title,amount_kobo,incurred_on) values ('x','other','B32 direct',100,'$TODAY'::date);"
run DENY "$TM"    "no direct update"  "update public.expense_claims set amount_kobo = 1 where id='$C1';"
run DENY "$TM"    "no direct status change" "update public.expense_claims set status='approved' where id='$C1';"
run DENY "$TM"    "no direct delete"  "delete from public.expense_claims where id='$C1';"
run DENY "$FINH"  "not even the Financial Secretary writes directly" "update public.expense_claims set status='approved' where id='$C1';"
run DENY "$TM2"   "a colleague cannot edit someone else's draft" "select public.save_claim('$C1', 'B32 hijack', 'transport', 1, '$TODAY'::date, NULL, NULL, NULL);"
run DENY "$TM2"   "a colleague cannot submit it" "select public.submit_claim('$C1');"
run DENY "$TM2"   "a colleague cannot withdraw it" "select public.withdraw_claim('$C1');"
run ALLOW "$TM"   "the owner edits their own draft" "select public.save_claim('$C1', 'B32 taxi to school', 'transport', 400000, '$TODAY'::date, '$P1', 'Return trip for the visit', NULL);"
want "the edit is kept" "400000" "$(raw "select amount_kobo from public.expense_claims where id='$C1';")"

# a signed-out caller
want "a signed-out caller cannot save a claim" "1" "$(anon "select public.save_claim(NULL,'B32 anon','other',100,'$TODAY'::date,NULL,NULL,NULL);" | grep -ci "permission denied")"
want "a signed-out caller cannot read the summary" "1" "$(anon "select * from public.finance_programme_summary();" | grep -ci "permission denied")"
want "a signed-out caller cannot read a claim" "1" "$(anon "select count(*) from public.expense_claims;" | grep -ci "permission denied")"

# ── PART D. Receipts, and the file store ───────────────────────────────
run DENY "$TM" "a claim with no receipt and no reason cannot be submitted" "select public.submit_claim('$C1');"
run DENY "$TM" "a receipt the store does not hold is refused" "select public.add_receipt('$C1', '$C1/ghost.jpg', 'ghost.jpg');"

# uploading: the owner can, a colleague cannot, into an open claim's folder
run ALLOW "$TM"  "the owner uploads into the claim's own folder" \
  "insert into storage.objects(bucket_id,name) values ('finance-receipts','$C1/taxi.jpg');"
run DENY  "$TM2" "a colleague cannot upload into it" \
  "insert into storage.objects(bucket_id,name) values ('finance-receipts','$C1/evil.jpg');"
run DENY  "$FINH" "the Financial Secretary cannot upload into someone's claim" \
  "insert into storage.objects(bucket_id,name) values ('finance-receipts','$C1/fin.jpg');"
run DENY  "$TM"  "a file outside any claim's folder is refused" \
  "insert into storage.objects(bucket_id,name) values ('finance-receipts','loose.jpg');"
want "owner reads it" "1" "$(as "$TM" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "colleague cannot read it" "0" "$(as "$TM2" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "while it is a draft, not even the Regional Coordinator of the chapter reads it" "0" "$(as "$RC" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "nor the Financial Secretary" "0" "$(as "$FINH" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "nor the Treasurer" "0" "$(as "$TREAS" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "nor the National Coordinator" "0" "$(as "$NC" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "a plain admin cannot" "0" "$(as "$PLAINADMIN" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "the bucket is private" "f" "$(raw "select public from storage.buckets where id='finance-receipts';")"

run DENY  "$TM2" "a colleague cannot register a receipt on it" "select public.add_receipt('$C1', '$C1/taxi.jpg', 'taxi.jpg');"
run DENY  "$TM"  "a path in some other claim's folder is refused" "select public.add_receipt('$C1', 'bbbbbbbb-9999-9999-9999-999999999999/taxi.jpg', 'taxi.jpg');"
# The file below really exists, in a folder that is not this claim's: the
# check that matters is the folder, not whether the file is there.
raw "insert into storage.objects(bucket_id,name) values ('finance-receipts','bbbbbbbb-9999-9999-9999-999999999999/theirs.jpg');" >/dev/null
run DENY  "$TM"  "a real file that belongs to another claim's folder is refused" "select public.add_receipt('$C1', 'bbbbbbbb-9999-9999-9999-999999999999/theirs.jpg', 'theirs.jpg');"
run ALLOW "$TM"  "the owner registers the receipt" "select public.add_receipt('$C1', '$C1/taxi.jpg', 'taxi.jpg');"
want "the receipt is recorded" "1" "$(raw "select count(*) from public.expense_receipts where claim_id='$C1';")"
want "the owner sees the receipt record" "1" "$(as "$TM" "select count(*) from public.expense_receipts where claim_id='$C1';")"
want "a colleague does not" "0" "$(as "$TM2" "select count(*) from public.expense_receipts where claim_id='$C1';")"
want "the Financial Secretary does not see the receipts on a draft" "0" "$(as "$FINH" "select count(*) from public.expense_receipts where claim_id='$C1';")"
run DENY  "$TM"  "no direct insert into receipts" "insert into public.expense_receipts(claim_id,storage_path,file_name) values ('$C1','$C1/x.jpg','x.jpg');"
run DENY  "$TM"  "no direct delete from receipts" "delete from public.expense_receipts where claim_id='$C1';"

# the receipt cap
for n in 2 3 4 5; do
  raw "insert into storage.objects(bucket_id,name) values ('finance-receipts','$C1/r$n.jpg');" >/dev/null
  as "$TM" "insert into storage.objects(bucket_id,name) select 'finance-receipts','$C1/r$n.jpg' where false;" >/dev/null 2>&1
  as "$TM" "select public.add_receipt('$C1','$C1/r$n.jpg','r$n.jpg');" >/dev/null 2>&1
done
raw "insert into storage.objects(bucket_id,name) values ('finance-receipts','$C1/r6.jpg');" >/dev/null
run DENY "$TM" "a sixth receipt is refused" "select public.add_receipt('$C1','$C1/r6.jpg','r6.jpg');"
RID=$(raw "select id from public.expense_receipts where storage_path='$C1/r5.jpg';")
run DENY  "$TM2" "a colleague cannot remove a receipt" "select public.remove_receipt('$RID');"
run ALLOW "$TM"  "the owner removes one" "select public.remove_receipt('$RID');"
want "and it is gone" "4" "$(raw "select count(*) from public.expense_receipts where claim_id='$C1';")"

# ── PART E. The claim path ─────────────────────────────────────────────
run DENY  "$TM"    "the owner cannot approve while it is a draft" "select public.review_claim('$C1','approve');"
run DENY  "$FINH"  "the Financial Secretary cannot decide a draft" "select public.review_claim('$C1','approve');"
run ALLOW "$TM"    "the owner submits with a receipt" "select public.submit_claim('$C1');"
want "it is submitted" "submitted" "$(cstat $C1)"
want "the clock is thirty days from today (Lagos date)" "30" "$(raw "select due_by - (now() at time zone 'Africa/Lagos')::date from public.expense_claims where id='$C1';")"
want "the Financial Secretary was told" "1" "$(raw "select count(*) from public.notifications where profile_id='$FINH' and ref_id='$C1' and kind='finance_claim';")"
want "once sent up, the Regional Coordinator of the chapter sees the claim" "1" "$(as "$RC" "select count(*) from public.expense_claims where id='$C1';")"
want "the Financial Secretary sees it" "1" "$(as "$FINH" "select count(*) from public.expense_claims where id='$C1';")"
want "the Treasurer sees it" "1" "$(as "$TREAS" "select count(*) from public.expense_claims where id='$C1';")"
want "the National Coordinator sees it" "1" "$(as "$NC" "select count(*) from public.expense_claims where id='$C1';")"
want "the Regional Coordinator of another chapter still does not" "0" "$(as "$RCA" "select count(*) from public.expense_claims where id='$C1';")"
want "a colleague still does not" "0" "$(as "$TM2" "select count(*) from public.expense_claims where id='$C1';")"
want "a plain admin still does not" "0" "$(as "$PLAINADMIN" "select count(*) from public.expense_claims where id='$C1';")"
want "the Financial Secretary sees the receipts now" "4" "$(as "$FINH" "select count(*) from public.expense_receipts where claim_id='$C1';")"
want "the Treasurer sees the receipts" "4" "$(as "$TREAS" "select count(*) from public.expense_receipts where claim_id='$C1';")"
want "the Regional Coordinator of the chapter sees the receipts" "4" "$(as "$RC" "select count(*) from public.expense_receipts where claim_id='$C1';")"
want "a colleague does not see the receipts" "0" "$(as "$TM2" "select count(*) from public.expense_receipts where claim_id='$C1';")"
want "the Financial Secretary reads the file" "1" "$(as "$FINH" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "the Treasurer reads the file" "1" "$(as "$TREAS" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "the National Coordinator reads the file" "1" "$(as "$NC" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "the Regional Coordinator of the chapter reads the file" "1" "$(as "$RC" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "the Regional Coordinator of another chapter cannot" "0" "$(as "$RCA" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "a colleague cannot" "0" "$(as "$TM2" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
want "a plain admin cannot" "0" "$(as "$PLAINADMIN" "select count(*) from storage.objects where bucket_id='finance-receipts' and name='$C1/taxi.jpg';")"
run DENY  "$TM"    "the owner cannot edit a submitted claim" "select public.save_claim('$C1','B32 taxi to school','transport',1,'$TODAY'::date,'$P1',NULL,NULL);"
run DENY  "$TM"    "the owner cannot add a receipt to a submitted claim" "select public.add_receipt('$C1','$C1/taxi.jpg','again.jpg');"
run DENY  "$TM"    "nor upload one to the store" "insert into storage.objects(bucket_id,name) values ('finance-receipts','$C1/late.jpg');"
run DENY  "$TM"    "the owner cannot approve their own claim" "select public.review_claim('$C1','approve');"
run DENY  "$TM2"   "a colleague cannot approve it" "select public.review_claim('$C1','approve');"
run DENY  "$RC"    "the Regional Coordinator cannot approve it" "select public.review_claim('$C1','approve');"
run DENY  "$TREAS" "the Treasurer cannot approve it" "select public.review_claim('$C1','approve');"
run DENY  "$NC"    "the National Coordinator cannot approve while the FIN seat is filled" "select public.review_claim('$C1','approve');"
run DENY  "$PLAINADMIN" "a plain admin cannot approve it" "select public.review_claim('$C1','approve');"
run DENY  "$FINH"  "a return needs a reason" "select public.review_claim('$C1','return','no');"
run DENY  "$FINH"  "an unknown decision is refused" "select public.review_claim('$C1','maybe','fine by me');"

# sent back, mended, sent again: the clock restarts
run ALLOW "$FINH"  "the Financial Secretary sends it back with a reason" "select public.review_claim('$C1','return','Add the driver name to the description');"
want "it is returned" "returned" "$(cstat $C1)"
want "the claimant was told" "1" "$(raw "select count(*) from public.notifications where profile_id='$TM' and ref_id='$C1' and title like '%sent back%';")"
run DENY  "$FINH"  "a returned claim cannot be approved without being resubmitted" "select public.review_claim('$C1','approve');"
run ALLOW "$TM"    "the owner mends it" "select public.save_claim('$C1','B32 taxi to school','transport',400000,'$TODAY'::date,'$P1','Return trip for the visit. Driver: Mr Okoro',NULL);"
raw "update public.expense_claims set due_by = '$TODAY'::date + 3 where id='$C1';" >/dev/null
run ALLOW "$TM"    "and sends it up again" "select public.submit_claim('$C1');"
want "the thirty days start again" "30" "$(raw "select due_by - (now() at time zone 'Africa/Lagos')::date from public.expense_claims where id='$C1';")"
want "the earlier decision is cleared" "|" "$(raw "select coalesce(reviewed_by::text,'')||'|'||coalesce(review_note,'') from public.expense_claims where id='$C1';")"

run ALLOW "$FINH"  "the Financial Secretary approves" "select public.review_claim('$C1','approve','Checked against the receipt');"
want "it is approved" "approved" "$(cstat $C1)"
want "with the reviewer recorded" "$FINH" "$(raw "select reviewed_by from public.expense_claims where id='$C1';")"
run DENY  "$FINH"  "an approved claim cannot be decided twice" "select public.review_claim('$C1','reject','changed my mind');"
run DENY  "$TM"    "an approved claim cannot be withdrawn" "select public.withdraw_claim('$C1');"
run DENY  "$TM"    "an approved claim cannot be edited" "select public.save_claim('$C1','B32 taxi to school','transport',1,'$TODAY'::date,'$P1',NULL,NULL);"

# payment
run DENY  "$TM"    "the owner cannot mark it paid" "select public.mark_claim_paid('$C1','TRF-1001', '$TODAY'::date);"
run DENY  "$TREAS" "the Treasurer cannot mark it paid" "select public.mark_claim_paid('$C1','TRF-1001', '$TODAY'::date);"
run DENY  "$NC"    "nor the National Coordinator while the seat is filled" "select public.mark_claim_paid('$C1','TRF-1001', '$TODAY'::date);"
run DENY  "$FINH"  "a bare ten-digit number is refused as an account number" "select public.mark_claim_paid('$C1','0123456789', '$TODAY'::date);"
run DENY  "$FINH"  "even with spaces round it" "select public.mark_claim_paid('$C1',' 0123456789 ', '$TODAY'::date);"
run DENY  "$FINH"  "a payment date in the future" "select public.mark_claim_paid('$C1','TRF-1001', '$TODAY'::date + 3);"
run DENY  "$FINH"  "a payment date before the approval" "select public.mark_claim_paid('$C1','TRF-1001', '$TODAY'::date - 3);"
run DENY  "$FINH"  "a payment needs a reference" "select public.mark_claim_paid('$C1','  ', '$TODAY'::date);"
run ALLOW "$FINH"  "the Financial Secretary records the payment" "select public.mark_claim_paid('$C1','TRF-1001', '$TODAY'::date);"
want "it is paid, with a reference" "paid|TRF-1001" "$(raw "select status||'|'||payment_ref from public.expense_claims where id='$C1';")"
run DENY  "$FINH"  "a paid claim cannot be paid again" "select public.mark_claim_paid('$C1','TRF-1002', '$TODAY'::date);"
run DENY  "$TM"    "a paid claim cannot be edited" "select public.save_claim('$C1','B32 taxi to school','transport',1,'$TODAY'::date,'$P1',NULL,NULL);"
run DENY  "$TM"    "a paid claim cannot be withdrawn" "select public.withdraw_claim('$C1');"

# a reason instead of a receipt, and withdrawal
run ALLOW "$TM"  "a claim with no receipt but a reason" "select public.save_claim(NULL,'B32 market purchase','materials',12000,'$TODAY'::date,'$P1','Bought at Oba market',NULL);"
C2=$(raw "select id from public.expense_claims where title='B32 market purchase';")
run ALLOW "$TM"  "a draft can be saved with a thin reason" "select public.save_claim('$C2','B32 market purchase','materials',12000,'$TODAY'::date,'$P1',NULL,'none');"
run DENY  "$TM"  "but a reason that short does not let it be submitted" "select public.submit_claim('$C2');"
run ALLOW "$TM"  "a proper reason" "select public.save_claim('$C2','B32 market purchase','materials',12000,'$TODAY'::date,'$P1',NULL,'The trader gave no receipt');"
run ALLOW "$TM"  "it can be submitted" "select public.submit_claim('$C2');"
want "and the reviewer is told there was no receipt" "1" "$(raw "select count(*) from public.finance_events where claim_id='$C2' and note like 'No receipt:%';")"
run ALLOW "$TM"  "the owner withdraws a submitted claim" "select public.withdraw_claim('$C2');"
want "it is withdrawn" "withdrawn" "$(cstat $C2)"
run DENY  "$FINH" "a withdrawn claim cannot be approved" "select public.review_claim('$C2','approve');"

# over budget: P2 has a 100,000 naira budget = 10,000,000 kobo
run ALLOW "$TM"  "a big claim against P2" "select public.save_claim(NULL,'B32 hall hire','venue',9000000,'$TODAY'::date,'$P2',NULL,'Receipt to follow from the church office');"
C3=$(raw "select id from public.expense_claims where title='B32 hall hire';")
run ALLOW "$TM"  "submitted" "select public.submit_claim('$C3');"
run ALLOW "$FINH" "approved, within budget" "select public.review_claim('$C3','approve');"
want "not flagged over budget" "f" "$(raw "select over_budget from public.expense_claims where id='$C3';")"
run ALLOW "$TM"  "a second claim that takes P2 over" "select public.save_claim(NULL,'B32 sound system','venue',2000000,'$TODAY'::date,'$P2',NULL,'Hire invoice to follow by email');"
C4=$(raw "select id from public.expense_claims where title='B32 sound system';")
run ALLOW "$TM"  "submitted" "select public.submit_claim('$C4');"
run DENY  "$FINH" "approving over budget with no note is refused" "select public.review_claim('$C4','approve');"
run DENY  "$FINH" "a short note does not count" "select public.review_claim('$C4','approve','ok');"
run ALLOW "$FINH" "a proper note lets it through" "select public.review_claim('$C4','approve','Board agreed the extra sound cost on the 3rd');"
want "and it is flagged over budget" "t" "$(raw "select over_budget from public.expense_claims where id='$C4';")"
run DENY  "$FINH" "the budget cannot be revised below what is approved" "select public.revise_programme_budget('$P2', 10000000, 'Trying to cut it back');"
run ALLOW "$FINH" "but can be revised up to cover it" "select public.revise_programme_budget('$P2', 11000000, 'Board agreed the extra sound cost on the 3rd');"

# a rejection is final
run ALLOW "$TM"  "another claim" "select public.save_claim(NULL,'B32 lunch','refreshments',5000,'$TODAY'::date,NULL,NULL,'Street vendor, no receipt');"
C5=$(raw "select id from public.expense_claims where title='B32 lunch';")
run ALLOW "$TM"  "submitted" "select public.submit_claim('$C5');"
run ALLOW "$FINH" "rejected with a reason" "select public.review_claim('$C5','reject','Not a programme cost');"
want "it is rejected" "rejected" "$(cstat $C5)"
run DENY  "$TM"  "a rejected claim cannot be resubmitted" "select public.submit_claim('$C5');"

# ── PART F. When the seat is empty, and when the holder is the claimant ─
run ALLOW "$FINH" "the Financial Secretary makes a claim of their own" "select public.save_claim(NULL,'B32 fin own claim','transport',7000,'$TODAY'::date,NULL,NULL,'Bike taxi, no receipt');"
C6=$(raw "select id from public.expense_claims where title='B32 fin own claim';")
run ALLOW "$FINH" "and submits it" "select public.submit_claim('$C6');"
want "the National Coordinator was told, not the claimant" "1" "$(raw "select count(*) from public.notifications where profile_id='$NC' and ref_id='$C6';")"
want "the claimant was not notified of their own claim" "0" "$(raw "select count(*) from public.notifications where profile_id='$FINH' and ref_id='$C6';")"
run DENY  "$FINH" "nobody approves their own claim, the Financial Secretary included" "select public.review_claim('$C6','approve');"
run ALLOW "$NC"   "the National Coordinator decides the Financial Secretary's own claim" "select public.review_claim('$C6','approve','Checked');"
run ALLOW "$TM"   "a colleague's claim is waiting while the seat is filled" "select public.save_claim(NULL,'B32 waiting on FIN','other',6000,'$TODAY'::date,NULL,NULL,'Small item, no receipt');"
C9=$(raw "select id from public.expense_claims where title='B32 waiting on FIN';")
run ALLOW "$TM"   "submitted" "select public.submit_claim('$C9');"
run DENY  "$NC"   "the National Coordinator still cannot decide other people's while the seat is filled" "select public.review_claim('$C9','approve');"

# the seat empty: NC runs finance
raw "select public.set_portfolio('$FINH','FIN',false);" >/dev/null
run ALLOW "$TM"  "a claim while the FIN seat is empty" "select public.save_claim(NULL,'B32 seat empty','other',3000,'$TODAY'::date,NULL,NULL,'Small item, no receipt');"
C7=$(raw "select id from public.expense_claims where title='B32 seat empty';")
run ALLOW "$TM"  "submitted" "select public.submit_claim('$C7');"
want "the National Coordinator is told" "1" "$(raw "select count(*) from public.notifications where profile_id='$NC' and ref_id='$C7';")"
run DENY  "$FINH" "the old holder has no power once the seat is empty" "select public.review_claim('$C7','approve');"
run DENY  "$TM2"  "a colleague still cannot" "select public.review_claim('$C7','approve');"
run DENY  "$TREAS" "the Treasurer still cannot" "select public.review_claim('$C7','approve');"
run ALLOW "$NC"   "the National Coordinator approves" "select public.review_claim('$C7','approve');"
run ALLOW "$NC"   "and records the payment" "select public.mark_claim_paid('$C7','TRF-2001', '$TODAY'::date);"
run ALLOW "$NC"   "and now decides the claim that was waiting on the seat" "select public.review_claim('$C9','approve');"
run ALLOW "$NC"   "and can revise a budget" "select public.revise_programme_budget('$P3', 13000000, 'Board approved the extra amount');"
# a National Coordinator who claims cannot approve their own
run ALLOW "$ADMIN" "an NC who is also a claimant makes a claim" "select public.save_claim(NULL,'B32 nc own claim','transport',4000,'$TODAY'::date,NULL,NULL,'Bike taxi, no receipt');"
C8=$(raw "select id from public.expense_claims where title='B32 nc own claim';")
run ALLOW "$ADMIN" "submits it" "select public.submit_claim('$C8');"
run DENY  "$ADMIN" "and cannot approve it, admin flag or not" "select public.review_claim('$C8','approve');"
run ALLOW "$NC"    "another National Coordinator can" "select public.review_claim('$C8','approve');"
raw "select public.set_portfolio('$FINH','FIN',true);" >/dev/null

# ── PART G. The record ─────────────────────────────────────────────────
want "the record has the whole life of the first claim" "claim_submitted,claim_returned,claim_submitted,claim_approved,claim_paid" \
  "$(raw "select string_agg(kind, ',' order by id) from public.finance_events where claim_id='$C1';")"
want "with the amount on every line" "0" "$(raw "select count(*) from public.finance_events where claim_id='$C1' and amount_kobo is distinct from 400000;")"
want "and who did each thing" "Tobi TeamMate,Femi Finance,Tobi TeamMate,Femi Finance,Femi Finance" \
  "$(raw "select string_agg(actor_name, ',' order by id) from public.finance_events where claim_id='$C1';")"
want "the record cannot be edited, even by the owner of the table" "1" "$(raw "update public.finance_events set note='x' where claim_id='$C1';" | grep -c "append-only")"
want "nor deleted" "1" "$(raw "delete from public.finance_events where claim_id='$C1';" | grep -c "append-only")"
want "nor deleted when nothing matches" "1" "$(raw "delete from public.finance_events where id = -1;" | grep -c "append-only")"
want "the owner sees the record of their claim" "5" "$(as "$TM" "select count(*) from public.finance_events where claim_id='$C1';")"
want "a colleague sees none of it" "0" "$(as "$TM2" "select count(*) from public.finance_events where claim_id='$C1';")"
want "the Regional Coordinator of the chapter sees it" "5" "$(as "$RC" "select count(*) from public.finance_events where claim_id='$C1';")"
want "the Regional Coordinator of another chapter does not" "0" "$(as "$RCA" "select count(*) from public.finance_events where claim_id='$C1';")"
want "the Treasurer sees it" "5" "$(as "$TREAS" "select count(*) from public.finance_events where claim_id='$C1';")"
want "a plain admin does not" "0" "$(as "$PLAINADMIN" "select count(*) from public.finance_events;")"
run DENY "$FINH" "no direct insert into the record" "insert into public.finance_events(kind,note) values ('claim_paid','forged');"
want "a budget change is in the record too" "1" "$(raw "select count(*) from public.finance_events where kind='budget_revised' and programme_id='$P1';")"

# ── PART H. The numbers ────────────────────────────────────────────────
# P1: budget 60,000,000 kobo (revised). C1 paid 400,000. Nothing else on P1.
# P2: budget 11,000,000 (revised). C3 approved 9,000,000, C4 approved 2,000,000. Reported spend 90,000.50 naira.
# P3: budget 13,000,000 (revised). nothing claimed.
S1=$(as "$FINH" "select approved_kobo||'|'||committed_kobo||'|'||paid_kobo||'|'||pending_kobo||'|'||remaining_kobo from public.finance_programme_summary() where programme_id='$P1';")
want "P1 adds up" "60000000|0|400000|0|59600000" "$S1"
S2=$(as "$FINH" "select approved_kobo||'|'||committed_kobo||'|'||paid_kobo||'|'||pending_kobo||'|'||remaining_kobo||'|'||reported_kobo from public.finance_programme_summary() where programme_id='$P2';")
want "P2 adds up, with the reported spend beside it" "11000000|11000000|0|0|0|9000050" "$S2"
want "the summary lists exactly the approved programmes" "3" "$(as "$FINH" "select count(*) from public.finance_programme_summary() where programme_id in ('$P1','$P2','$P3','$P4');")"
want "the Treasurer sees the same" "3" "$(as "$TREAS" "select count(*) from public.finance_programme_summary() where programme_id in ('$P1','$P2','$P3','$P4');")"
want "the Regional Coordinator sees only their chapter's" "2" "$(as "$RC" "select count(*) from public.finance_programme_summary() where programme_id in ('$P1','$P2','$P3','$P4');")"
want "the other chapter's coordinator sees theirs" "1" "$(as "$RCA" "select count(*) from public.finance_programme_summary() where programme_id in ('$P1','$P2','$P3','$P4');")"
want "a team member sees none" "0" "$(as "$TM" "select count(*) from public.finance_programme_summary();")"
want "a plain admin sees none" "0" "$(as "$PLAINADMIN" "select count(*) from public.finance_programme_summary();")"

# a submitted claim counts as pending, and the overview counts the waiting ones
raw "update public.programs set chapter_id='$BENIN' where id='$P3';" >/dev/null
run ALLOW "$TM"  "a claim left waiting, against a Benin programme" "select public.save_claim(NULL,'B32 waiting','materials',25000,'$TODAY'::date,'$P3',NULL,'Receipt is with the school')"
W=$(raw "select id from public.expense_claims where title='B32 waiting' order by created_at desc limit 1;")
run ALLOW "$TM"  "submitted" "select public.submit_claim('$W');"
want "it shows as pending against P3" "25000" "$(as "$FINH" "select pending_kobo from public.finance_programme_summary() where programme_id='$P3';")"
raw "update public.expense_claims set due_by = '$TODAY'::date - 2 where id='$W';" >/dev/null
OV=$(as "$FINH" "select waiting_count||'|'||overdue_count from public.finance_overview();")
want "the overview counts it as waiting and overdue" "1|1" "$OV"
want "the overview is empty for a team member" "0" "$(as "$TM" "select count(*) from public.finance_overview();")"
want "empty for a Regional Coordinator" "0" "$(as "$RC" "select count(*) from public.finance_overview();")"
want "empty for a plain admin" "0" "$(as "$PLAINADMIN" "select count(*) from public.finance_overview();")"
want "the Treasurer sees it" "1" "$(as "$TREAS" "select count(*) from public.finance_overview();")"
want "the over-budget approval is counted" "1" "$(as "$FINH" "select over_budget_count from public.finance_overview();")"

# Tidy.
raw "delete from public.expense_claims where title like 'B32 %';" >/dev/null
raw "delete from public.programs where title like 'B32 %';" >/dev/null
raw "delete from storage.objects where bucket_id='finance-receipts';" >/dev/null
raw "alter table storage.objects disable row level security;" >/dev/null
for u in $FINH $TREAS; do for s in FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
