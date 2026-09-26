#!/bin/bash
# BATCH33-MARKER grants
# Run after:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch18-nec-portfolios.sql batch29-audience-and-consent.sql \
#          batch32-finance.sql batch33-grants.sql" bash _harness/setup.sh
#
# Proves the grants module from the database side:
#   - the Deputy National Coordinator seat gains grant access here, its
#     first grant of any kind; the Financial Secretary and NC manage too,
#     the Treasurer reads, a plain admin and a plain member get nothing
#   - a grant validates: restricted money needs a restriction note, the
#     period is in order, the funder contact must exist, the amount is bounded
#   - a grant moves prospect → applied → awarded → active → reporting →
#     closed, and a closed or declined grant cannot be reopened
#   - deadlines: added by a manager, settled or waived (a waiver needs a
#     reason), removed only while pending, and "overdue" is read off the date
#   - a programme's budget can name the grant funding it, only once the
#     grant is awarded/active/reporting, and the spend rolls up to the grant
#   - a Regional Coordinator sees a grant only where it funds a programme in
#     their own chapter, and no further
#   - nobody writes to a grant table directly; the ledger records it all,
#     append-only, and the numbers add up
#
# Accounts (batch32 seed ids plus the grant seats):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin TM (claimant)
DNCH=dddddddd-1111-1111-1111-111111111111     # Dele, Lagos TM, holds DNC
FINH=77777777-7777-7777-7777-777777777777     # Femi, Benin TM, holds FIN
TREAS=99999999-9999-9999-9999-999999999999    # Tunde, Lagos TM, holds TREAS
PLAINADMIN=88888888-8888-8888-8888-888888888888 # Sam, TM with is_admin only
RCA=aaaaaaaa-2222-2222-2222-222222222222      # Auchi RC (other chapter)

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1; }
anon(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -v ON_ERROR_STOP=1 -c \"set role anon; set test.uid=''; $1\"" 2>&1; }
want(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  XX   $1: wanted $2 got $3"; fail=$((fail+1)); fi; }
run(){ local out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid='$2'; $4\"" 2>&1); rc=$?
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$1" = DENY ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $3"; pass=$((pass+1)); else echo "  XX   ALLOWED but should refuse: $3"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $3"; pass=$((pass+1)); else echo "  XX   REFUSED but should allow: $3"; echo "$out"|grep -i error|head -1|sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}
gstat(){ raw "select status from public.grants where id='$1';"; }
TODAY=$(raw "select (now() at time zone 'Africa/Lagos')::date;")

echo "Batch 33 — grants and restricted funds"

# ── Clean slate and accounts ───────────────────────────────────────────
raw "delete from public.grants where title like 'B33 %';" >/dev/null
raw "delete from public.programs where title like 'B33 %';" >/dev/null
raw "delete from public.audience_contacts where email like 'b33-%';" >/dev/null
for u in $DNCH $FINH $TREAS $RC; do for s in DNC FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done
raw "insert into auth.users (id,email) values
  ('$DNCH','dele@ycdi.test'),('$FINH','femi@ycdi.test'),('$TREAS','tunde@ycdi.test'),
  ('$PLAINADMIN','sam@ycdi.test'),('$RCA','adarc@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values
  ('$DNCH','Dele Deputy','TM',(select id from public.chapters where name='Lagos'),false),
  ('$FINH','Femi Finance','TM',(select id from public.chapters where name='Benin'),false),
  ('$TREAS','Tunde Treasurer','TM',(select id from public.chapters where name='Lagos'),false),
  ('$PLAINADMIN','Sam Sysadmin','TM',(select id from public.chapters where name='Benin'),true),
  ('$RCA','Auchi Coordinator','RC',(select id from public.chapters where name='Auchi'),false)
  on conflict (id) do update set role=excluded.role, chapter_id=excluded.chapter_id, is_admin=excluded.is_admin;" >/dev/null
raw "select public.set_portfolio('$DNCH','DNC',true);" >/dev/null
raw "select public.set_portfolio('$FINH','FIN',true);" >/dev/null
raw "select public.set_portfolio('$TREAS','TREAS',true);" >/dev/null
BENIN=$(raw "select id from public.chapters where name='Benin';")
AUCHI=$(raw "select id from public.chapters where name='Auchi';")
raw "insert into public.audience_contacts(full_name,email,category,lawful_basis,created_by)
     values ('B33 Ford Foundation','b33-ford@test.example','funder','contract','$NC');" >/dev/null
FUNDER=$(raw "select id from public.audience_contacts where email='b33-ford@test.example';")

# ── PART A. Who may manage a grant ─────────────────────────────────────
NEW="select public.save_grant(NULL,'B33 Literacy Grant','Ford Foundation',500000000,true,'Reading rooms in Benin and Auchi schools',NULL,'FF-2026-01','Fund school reading rooms','$TODAY'::date,('$TODAY'::date + 365));"
run ALLOW "$DNCH" "the Deputy National Coordinator creates a grant" "$NEW"
G1=$(raw "select id from public.grants where title='B33 Literacy Grant';")
run ALLOW "$FINH" "the Financial Secretary can create one" "select public.save_grant(NULL,'B33 Fin Grant','Local Trust',100000000,false,NULL,NULL,NULL,NULL,NULL,NULL);"
run ALLOW "$NC"   "the National Coordinator can create one" "select public.save_grant(NULL,'B33 NC Grant','MTN Foundation',200000000,true,'Digital skills only',NULL,NULL,NULL,NULL,NULL);"
run DENY  "$TREAS" "the Treasurer cannot create a grant" "select public.save_grant(NULL,'B33 x','X',1,false,NULL,NULL,NULL,NULL,NULL,NULL);"
run DENY  "$RC"    "a Regional Coordinator cannot" "select public.save_grant(NULL,'B33 x','X',1,false,NULL,NULL,NULL,NULL,NULL,NULL);"
run DENY  "$TM"    "a team member cannot" "select public.save_grant(NULL,'B33 x','X',1,false,NULL,NULL,NULL,NULL,NULL,NULL);"
run DENY  "$PLAINADMIN" "a plain admin cannot" "select public.save_grant(NULL,'B33 x','X',1,false,NULL,NULL,NULL,NULL,NULL,NULL);"
want "no stray grants from the refusals" "3" "$(raw "select count(*) from public.grants where title like 'B33 %';")"

# ── PART B. Validation ─────────────────────────────────────────────────
run DENY "$DNCH" "restricted money needs a restriction note" "select public.save_grant(NULL,'B33 bad','F',100,true,NULL,NULL,NULL,NULL,NULL,NULL);"
run DENY "$DNCH" "restricted money needs a non-blank note"    "select public.save_grant(NULL,'B33 bad','F',100,true,'   ',NULL,NULL,NULL,NULL,NULL);"
run DENY "$DNCH" "a grant needs a title"                      "select public.save_grant(NULL,'  ','F',100,false,NULL,NULL,NULL,NULL,NULL,NULL);"
run DENY "$DNCH" "a grant needs a funder name"               "select public.save_grant(NULL,'B33 bad','  ',100,false,NULL,NULL,NULL,NULL,NULL,NULL);"
run DENY "$DNCH" "a negative amount is refused"              "select public.save_grant(NULL,'B33 bad','F',-5,false,NULL,NULL,NULL,NULL,NULL,NULL);"
run DENY "$DNCH" "the period cannot end before it starts"    "select public.save_grant(NULL,'B33 bad','F',100,false,NULL,NULL,NULL,NULL,('$TODAY'::date),('$TODAY'::date - 5));"
run DENY "$DNCH" "an unknown funder contact is refused"      "select public.save_grant(NULL,'B33 bad','F',100,false,NULL,'aaaaaaaa-9999-9999-9999-999999999999',NULL,NULL,NULL,NULL);"
run ALLOW "$DNCH" "a linked funder contact is accepted"      "select public.save_grant(NULL,'B33 Linked','Ford Foundation',300000000,true,'Scholarships','$FUNDER',NULL,NULL,NULL,NULL);"
want "the amount is stored in kobo" "500000000" "$(raw "select awarded_kobo from public.grants where id='$G1';")"

# editing
run ALLOW "$FINH" "a manager edits the grant" "select public.save_grant('$G1','B33 Literacy Grant','Ford Foundation',550000000,true,'Reading rooms in Benin, Auchi and Ondo schools','$FUNDER','FF-2026-01','Updated purpose','$TODAY'::date,('$TODAY'::date + 400));"
want "the edit landed" "550000000" "$(raw "select awarded_kobo from public.grants where id='$G1';")"
run DENY "$TM" "a team member cannot edit a grant" "select public.save_grant('$G1','B33 hijack','X',1,false,NULL,NULL,NULL,NULL,NULL,NULL);"

# ── PART C. Status ─────────────────────────────────────────────────────
want "a new grant starts as a prospect" "prospect" "$(gstat $G1)"
run DENY  "$TREAS" "the Treasurer cannot change status" "select public.set_grant_status('$G1','applied');"
run ALLOW "$DNCH"  "the Deputy moves it to applied"     "select public.set_grant_status('$G1','applied','Submitted to Ford');"
run ALLOW "$DNCH"  "then awarded"                       "select public.set_grant_status('$G1','awarded');"
run ALLOW "$FINH"  "then active"                        "select public.set_grant_status('$G1','active');"
run DENY  "$DNCH"  "an unknown status is refused"       "select public.set_grant_status('$G1','spent');"
run ALLOW "$NC"    "a declined grant can be recorded"   "select public.set_grant_status((select id from public.grants where title='B33 NC Grant'),'declined','Funder passed');"
run DENY  "$NC"    "a declined grant cannot be reopened" "select public.set_grant_status((select id from public.grants where title='B33 NC Grant'),'applied');"
# A separate grant, taken all the way to closed, to prove it cannot reopen.
run ALLOW "$NC" "a throwaway grant is created" "select public.save_grant(NULL,'B33 Temp Closed','Old Funder',1000,false,NULL,NULL,NULL,NULL,NULL,NULL);"
TC=$(raw "select id from public.grants where title='B33 Temp Closed';")
raw "set role authenticated; set test.uid='$NC'; select public.set_grant_status('$TC','applied');" >/dev/null
raw "set role authenticated; set test.uid='$NC'; select public.set_grant_status('$TC','awarded');" >/dev/null
raw "set role authenticated; set test.uid='$NC'; select public.set_grant_status('$TC','active');" >/dev/null
raw "set role authenticated; set test.uid='$NC'; select public.set_grant_status('$TC','reporting');" >/dev/null
run ALLOW "$NC"    "it is closed"                       "select public.set_grant_status('$TC','closed');"
run DENY  "$NC"    "a closed grant cannot be reopened"  "select public.set_grant_status('$TC','active');"

# ── PART D. Obligations ────────────────────────────────────────────────
run ALLOW "$DNCH" "a manager adds a reporting deadline" "select public.add_obligation('$G1','narrative_report','Q1 narrative report',('$TODAY'::date + 30),'Template from Ford');"
OB1=$(raw "select id from public.grant_obligations where grant_id='$G1' and title='Q1 narrative report';")
run ALLOW "$FINH" "and a financial one, already overdue" "select public.add_obligation('$G1','financial_report','Q4 2025 financial report',('$TODAY'::date - 10),NULL);"
OB2=$(raw "select id from public.grant_obligations where grant_id='$G1' and title='Q4 2025 financial report';")
run DENY  "$TREAS" "the Treasurer cannot add a deadline" "select public.add_obligation('$G1','other','x',('$TODAY'::date + 5),NULL);"
run DENY  "$DNCH"  "a deadline needs a title"            "select public.add_obligation('$G1','other','   ',('$TODAY'::date + 5),NULL);"
run DENY  "$DNCH"  "a deadline needs a due date"         "select public.add_obligation('$G1','other','x',NULL,NULL);"
run DENY  "$DNCH"  "an unknown kind is refused"          "select public.add_obligation('$G1','party','x',('$TODAY'::date + 5),NULL);"

run ALLOW "$FINH" "a deadline is marked submitted"       "select public.settle_obligation('$OB1','submitted');"
want "it records the day it was settled" "$TODAY" "$(raw "select completed_on from public.grant_obligations where id='$OB1';")"
want "and it is no longer pending" "submitted" "$(raw "select status from public.grant_obligations where id='$OB1';")"
run ALLOW "$FINH" "a submitted deadline can be reopened" "select public.settle_obligation('$OB1','pending');"
want "the completed day is cleared on reopening" "" "$(raw "select coalesce(completed_on::text,'') from public.grant_obligations where id='$OB1';")"
run DENY  "$DNCH" "a waiver with no reason is refused"   "select public.settle_obligation('$OB2','waived',NULL,'');"
run DENY  "$DNCH" "a waiver with too short a reason is refused" "select public.settle_obligation('$OB2','waived',NULL,'ok');"
run ALLOW "$DNCH" "a waiver with a reason is allowed"    "select public.settle_obligation('$OB2','waived',NULL,'Funder agreed to drop the 2025 report');"
want "the waived deadline is out of the pending count" "1" "$(raw "select count(*) from public.grant_obligations where grant_id='$G1' and status='pending';")"

run DENY  "$DNCH" "a settled deadline cannot be removed" "select public.remove_obligation('$OB2');"
run ALLOW "$DNCH" "a pending deadline can be removed"    "select public.remove_obligation('$OB1');"
want "and it is gone" "0" "$(raw "select count(*) from public.grant_obligations where id='$OB1';")"
run ALLOW "$DNCH" "add one back, still pending, due today" "select public.add_obligation('$G1','milestone','Halfway review','$TODAY'::date,NULL);"
OB3=$(raw "select id from public.grant_obligations where grant_id='$G1' and title='Halfway review';")

# ── PART E. Funding a programme from a grant ───────────────────────────
# Two approved Benin programmes (budgets 2,000,000 and 1,000,000 naira) and
# one Auchi programme (500,000). Approving snapshots a finance_budget.
mk(){ raw "insert into public.programs(id,title,chapter_id,status,budget) values ('$1','$2','$3','Approved',$4);" >/dev/null; }
P1=cccccccc-0000-0000-0000-000000000001
P2=cccccccc-0000-0000-0000-000000000002
P3=cccccccc-0000-0000-0000-000000000003
mk $P1 "B33 Benin reading room" $BENIN 2000000
mk $P2 "B33 Benin books"        $BENIN 1000000
mk $P3 "B33 Auchi reading room" $AUCHI 500000
want "the budgets snapshotted in kobo" "3" "$(raw "select count(*) from public.finance_budgets where programme_id in ('$P1','$P2','$P3');")"

PROSPECT=$(raw "select id from public.grants where title='B33 Linked';")  # still a prospect
run DENY  "$DNCH" "a prospect grant cannot fund a programme" "select public.set_programme_grant('$P1','$PROSPECT');"
run DENY  "$DNCH" "a programme with no budget cannot be funded" "select public.set_programme_grant('dddddddd-9999-9999-9999-999999999999','$G1');"
run DENY  "$DNCH" "an unknown grant cannot fund it"          "select public.set_programme_grant('$P1','dddddddd-9999-9999-9999-999999999999');"
run DENY  "$TREAS" "the Treasurer cannot fund a programme"   "select public.set_programme_grant('$P1','$G1');"
run ALLOW "$FINH" "the officer funds P1 from the grant"      "select public.set_programme_grant('$P1','$G1');"
run ALLOW "$DNCH" "the Deputy funds P2 from the grant"       "select public.set_programme_grant('$P2','$G1');"
run ALLOW "$DNCH" "the Auchi programme is funded too"        "select public.set_programme_grant('$P3','$G1');"
want "three programmes now name the grant" "3" "$(raw "select count(*) from public.finance_budgets where grant_id='$G1';")"
run ALLOW "$FINH" "a programme can be unlinked"             "select public.set_programme_grant('$P3',NULL);"
want "back to two" "2" "$(raw "select count(*) from public.finance_budgets where grant_id='$G1';")"
as "$FINH" "select public.set_programme_grant('$P3','$G1');" >/dev/null  # relink for the numbers

# Spend: a paid claim of 800,000 and an approved claim of 500,000 on P1.
raw "insert into public.expense_claims(claimant_id,claimant_name,chapter_id,programme_id,category,title,amount_kobo,incurred_on,status,submitted_at,due_by,reviewed_by,reviewed_at,paid_on,payment_ref)
     values ('$TM','Tobi','$BENIN','$P1','materials','B33 paid',80000000,'$TODAY'::date,'paid',now(),'$TODAY'::date + 30,'$FINH',now(),'$TODAY'::date,'TRF-B33');" >/dev/null
raw "insert into public.expense_claims(claimant_id,claimant_name,chapter_id,programme_id,category,title,amount_kobo,incurred_on,status,submitted_at,due_by,reviewed_by,reviewed_at)
     values ('$TM','Tobi','$BENIN','$P1','materials','B33 approved',50000000,'$TODAY'::date,'approved',now(),'$TODAY'::date + 30,'$FINH',now());" >/dev/null

# ── PART F. Who can see a grant ────────────────────────────────────────
for u in "$NC:1" "$DNCH:1" "$FINH:1" "$TREAS:1"; do
  want "a national reader sees the grant (${u%%:*})" "${u##*:}" "$(as "${u%%:*}" "select count(*) from public.grants where id='$G1';")"
done
want "the Benin coordinator sees it, it funds their programmes" "1" "$(as "$RC" "select count(*) from public.grants where id='$G1';")"
want "the Auchi coordinator also sees it, it funds an Auchi programme" "1" "$(as "$RCA" "select count(*) from public.grants where id='$G1';")"
want "a plain team member does not" "0" "$(as "$TM" "select count(*) from public.grants where id='$G1';")"
want "a plain admin does not" "0" "$(as "$PLAINADMIN" "select count(*) from public.grants where id='$G1';")"
# A grant that funds nothing is invisible to any coordinator.
UNL=$(raw "select id from public.grants where title='B33 Fin Grant';")
want "a coordinator does not see a grant that funds nothing of theirs" "0" "$(as "$RC" "select count(*) from public.grants where id='$UNL';")"
want "the Benin coordinator sees the grant's deadlines" "2" "$(as "$RC" "select count(*) from public.grant_obligations where grant_id='$G1';")"
want "a plain member sees no deadlines" "0" "$(as "$TM" "select count(*) from public.grant_obligations where grant_id='$G1';")"
# A grant that funds only a Benin programme: its deadlines and ledger are
# hidden from an Auchi coordinator, and shown to a Benin one. This is the
# chapter clause in grant_can_see, separate from the grants read policy.
raw "insert into public.programs(id,title,chapter_id,status,budget) values ('cccccccc-0000-0000-0000-0000000000b1','B33 Benin only prog','$BENIN','Approved',300000);" >/dev/null
run ALLOW "$DNCH" "a Benin-only grant is created and activated" "select public.save_grant(NULL,'B33 Benin Only','Benin Trust',10000000,false,NULL,NULL,NULL,NULL,NULL,NULL);"
BO=$(raw "select id from public.grants where title='B33 Benin Only';")
as "$NC" "select public.set_grant_status('$BO','awarded');" >/dev/null
as "$NC" "select public.set_grant_status('$BO','active');" >/dev/null
as "$FINH" "select public.set_programme_grant('cccccccc-0000-0000-0000-0000000000b1','$BO');" >/dev/null
as "$DNCH" "select public.add_obligation('$BO','narrative_report','Benin-only report',('$TODAY'::date + 20),NULL);" >/dev/null
want "the Benin coordinator sees the Benin-only grant's deadline" "1" "$(as "$RC" "select count(*) from public.grant_obligations where grant_id='$BO';")"
want "the Auchi coordinator does not see it" "0" "$(as "$RCA" "select count(*) from public.grant_obligations where grant_id='$BO';")"
want "the Benin coordinator sees its ledger" "t" "$(as "$RC" "select count(*) > 0 from public.finance_events where grant_id='$BO';")"
want "the Auchi coordinator sees none of its ledger" "0" "$(as "$RCA" "select count(*) from public.finance_events where grant_id='$BO';")"

# ── PART G. The numbers ────────────────────────────────────────────────
# G1: awarded 550,000,000 kobo. Allocated = P1+P2+P3 budgets = 200,000,000+100,000,000+50,000,000 = 350,000,000.
# Committed (approved) = 50,000,000. Paid = 80,000,000. Remaining = 550M - 50M - 80M = 420,000,000.
S=$(as "$FINH" "select awarded_kobo||'|'||allocated_kobo||'|'||committed_kobo||'|'||paid_kobo||'|'||remaining_kobo||'|'||over_allocated||'|'||programmes from public.grant_summary() where grant_id='$G1';")
want "the grant's money adds up" "550000000|350000000|50000000|80000000|420000000|false|3" "$S"
want "the summary lists every visible grant" "6" "$(as "$FINH" "select count(*) from public.grant_summary();")"
want "the Benin coordinator's summary shows only grants touching Benin" "2" "$(as "$RC" "select count(*) from public.grant_summary();")"
want "a plain member gets an empty summary" "0" "$(as "$TM" "select count(*) from public.grant_summary();")"
want "obligations overdue shows on the grant" "0" "$(as "$FINH" "select obligations_overdue from public.grant_summary() where grant_id='$G1';")"

# over-allocation: raise allocation above the award by making a big programme
raw "insert into public.programs(id,title,chapter_id,status,budget) values ('cccccccc-0000-0000-0000-000000000009','B33 Big',(select id from public.chapters where name='Benin'),'Approved',6000000);" >/dev/null
as "$FINH" "select public.set_programme_grant('cccccccc-0000-0000-0000-000000000009','$G1');" >/dev/null
want "over-allocation is flagged" "t" "$(as "$FINH" "select over_allocated from public.grant_summary() where grant_id='$G1';")"
as "$FINH" "select public.set_programme_grant('cccccccc-0000-0000-0000-000000000009',NULL);" >/dev/null

# overview: totals split by restricted. Active grants here: G1 (restricted, 550M) and B33 Fin Grant (unrestricted, 100M).
as "$FINH" "select public.set_grant_status('$UNL','awarded');" >/dev/null
as "$FINH" "select public.set_grant_status('$UNL','active');" >/dev/null
OV=$(as "$FINH" "select active_grants||'|'||restricted_kobo||'|'||unrestricted_kobo||'|'||awarded_kobo from public.grant_overview();")
want "the overview splits restricted from unrestricted" "3|550000000|110000000|660000000" "$OV"
want "the overview counts the overdue deadline as due today, not overdue" "0" "$(as "$FINH" "select obligations_overdue from public.grant_overview();")"
raw "update public.grant_obligations set due_date = '$TODAY'::date - 3 where id='$OB3';" >/dev/null
want "moving it into the past makes it overdue" "1" "$(as "$FINH" "select obligations_overdue from public.grant_overview();")"
want "the overview is empty for a plain member" "0" "$(as "$TM" "select count(*) from public.grant_overview();")"
want "the overview is empty for a coordinator" "0" "$(as "$RC" "select count(*) from public.grant_overview();")"

# ── The fundable-programmes picker (managers only, incl. the Deputy) ───
want "the Deputy, not a finance reader, still sees the programmes to fund" "t" "$(as "$DNCH" "select count(*) >= 3 from public.grant_fundable_programmes();")"
want "each row carries its current grant link" "$G1" "$(as "$DNCH" "select grant_id from public.grant_fundable_programmes() where programme_id='$P1';")"
want "the Treasurer cannot use the picker" "0" "$(as "$TREAS" "select count(*) from public.grant_fundable_programmes();")"
want "a plain member cannot use the picker" "0" "$(as "$TM" "select count(*) from public.grant_fundable_programmes();")"

# ── PART H. The record, and no direct writes ───────────────────────────
want "the ledger holds the grant's life" "t" "$(raw "select count(*) >= 5 from public.finance_events where grant_id='$G1';")"
want "the Treasurer can read the grant's ledger lines" "t" "$(as "$TREAS" "select count(*) > 0 from public.finance_events where grant_id='$G1';")"
want "a plain member sees none of the grant ledger" "0" "$(as "$TM" "select count(*) from public.finance_events where grant_id='$G1';")"
want "the grant ledger cannot be rewritten" "1" "$(raw "update public.finance_events set note='x' where grant_id='$G1';" | grep -c "append-only")"
run DENY "$DNCH" "no direct insert into grants"           "insert into public.grants(title,funder_name,awarded_kobo,is_restricted,restrictions) values ('B33 direct','X',1,false,NULL);"
run DENY "$DNCH" "no direct update of a grant"            "update public.grants set awarded_kobo = 1 where id='$G1';"
run DENY "$DNCH" "no direct delete of a grant"            "delete from public.grants where id='$G1';"
run DENY "$DNCH" "no direct insert into obligations"      "insert into public.grant_obligations(grant_id,kind,title,due_date) values ('$G1','other','x','$TODAY'::date);"
run DENY "$DNCH" "no direct update of finance_budgets grant_id" "update public.finance_budgets set grant_id=NULL where programme_id='$P1';"

# ── PART I. Signed out, and the grant log function is server-only ──────
want "a signed-out caller cannot read the summary" "1" "$(anon "select * from public.grant_summary();" | grep -ci "permission denied")"
want "a signed-out caller cannot save a grant" "1" "$(anon "select public.save_grant(NULL,'x','y',1,false,NULL,NULL,NULL,NULL,NULL,NULL);" | grep -ci "permission denied")"
want "the grant logger cannot be called by a signed-in user" "1" "$(as "$DNCH" "select public.grant_log('grant_created','$G1',NULL,1,'forged');" | grep -c ERROR)"

# Tidy.
raw "delete from public.grants where title like 'B33 %';" >/dev/null
raw "delete from public.programs where title like 'B33 %';" >/dev/null
raw "delete from public.audience_contacts where email like 'b33-%';" >/dev/null
for u in $DNCH $FINH $TREAS; do for s in DNC FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
