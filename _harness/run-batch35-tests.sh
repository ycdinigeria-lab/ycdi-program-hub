#!/bin/bash
# BATCH35-MARKER annual-budget
# Run after:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch18-nec-portfolios.sql batch29-audience-and-consent.sql \
#          batch32-finance.sql batch33-grants.sql batch34-donations.sql \
#          batch35-annual-budget.sql" bash _harness/setup.sh
#
# Proves the annual budget cycle from the database side:
#   - the Financial Secretary and NC prepare a budget and its lines; the
#     Treasurer and NC record the Board's approval; the seat that prepared
#     it does not approve it; the Deputy reads; a plain admin sees nothing
#   - one budget per year; lines change only while it is a draft
#   - a budget goes draft → submitted → board_approved → active → closed;
#     approval needs a Board minute; approval after the year begins is
#     flagged late, not refused
#   - a Regional Coordinator sees only their own chapter's expenditure
#     lines, and no income and no other chapter
#   - plan against actuals: planned totals from the lines, actual income
#     from donations and grants, actual expenditure from approved and paid
#     claims, all for the budget's year
#
# Accounts (seed ids plus the seats):
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333       # Benin RC
TM=44444444-4444-4444-4444-444444444444       # Benin TM
DNCH=dddddddd-1111-1111-1111-111111111111     # holds DNC
FINH=77777777-7777-7777-7777-777777777777     # holds FIN
TREAS=99999999-9999-9999-9999-999999999999    # holds TREAS
PLAINADMIN=88888888-8888-8888-8888-888888888888
RCA=aaaaaaaa-2222-2222-2222-222222222222      # Auchi RC

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
bstat(){ raw "select status from public.annual_budgets where id='$1';"; }
TODAY=$(raw "select (now() at time zone 'Africa/Lagos')::date;")
YEAR=$(raw "select extract(year from (now() at time zone 'Africa/Lagos')::date)::int;")
NEXT=$((YEAR+1))

echo "Batch 35 — the annual budget cycle"

# ── Clean slate and accounts ───────────────────────────────────────────
raw "delete from public.annual_budgets where financial_year in ($YEAR,$NEXT,$((YEAR-1)),2099);" >/dev/null
raw "delete from public.donations where donor_name like 'B35 %';" >/dev/null
raw "delete from public.grants where title like 'B35 %';" >/dev/null
raw "delete from public.expense_claims where title like 'B35 %';" >/dev/null
raw "delete from public.programs where title like 'B35 %';" >/dev/null
for u in $DNCH $FINH $TREAS $RC $RCA; do for s in DNC FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done
raw "insert into auth.users (id,email) values ('$DNCH','dele@ycdi.test'),('$FINH','femi@ycdi.test'),('$TREAS','tunde@ycdi.test'),('$PLAINADMIN','sam@ycdi.test'),('$RCA','adarc@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values
  ('$DNCH','Dele Deputy','TM',(select id from public.chapters where name='Lagos'),false),
  ('$FINH','Femi Finance','TM',(select id from public.chapters where name='Benin'),false),
  ('$TREAS','Tunde Treasurer','TM',(select id from public.chapters where name='Lagos'),false),
  ('$PLAINADMIN','Sam Sysadmin','TM',(select id from public.chapters where name='Benin'),true),
  ('$RCA','Auchi Coordinator','RC',(select id from public.chapters where name='Auchi'),false)
  on conflict (id) do update set role=excluded.role, chapter_id=excluded.chapter_id, is_admin=excluded.is_admin;" >/dev/null
raw "select public.set_portfolio('$FINH','FIN',true);" >/dev/null
raw "select public.set_portfolio('$TREAS','TREAS',true);" >/dev/null
raw "select public.set_portfolio('$DNCH','DNC',true);" >/dev/null
BENIN=$(raw "select id from public.chapters where name='Benin';")
AUCHI=$(raw "select id from public.chapters where name='Auchi';")

# ── PART A. Preparing a budget ─────────────────────────────────────────
run ALLOW "$FINH" "the Financial Secretary starts a budget for the year" "select public.create_annual_budget($YEAR,'Annual budget');"
BUD=$(raw "select id from public.annual_budgets where financial_year=$YEAR;")
run DENY  "$FINH" "a second budget for the same year is refused" "select public.create_annual_budget($YEAR,NULL);"
run ALLOW "$NC"   "the National Coordinator can start another year" "select public.create_annual_budget($NEXT,NULL);"
run DENY  "$TREAS" "the Treasurer cannot prepare a budget" "select public.create_annual_budget(2098,NULL);"
run DENY  "$DNCH" "the Deputy cannot prepare a budget" "select public.create_annual_budget(2099,NULL);"
run DENY  "$TM"   "a team member cannot" "select public.create_annual_budget(2099,NULL);"

# ── PART B. Lines ──────────────────────────────────────────────────────
run ALLOW "$FINH" "an income line for donations" "select public.save_budget_line(NULL,'$BUD','income','donations','Individual giving',2000000000,NULL,NULL);"
run ALLOW "$FINH" "an income line for grants" "select public.save_budget_line(NULL,'$BUD','income','grants','Grant income',3000000000,NULL,NULL);"
run ALLOW "$FINH" "a Benin expenditure line" "select public.save_budget_line(NULL,'$BUD','expenditure','programmes','Benin programmes',800000000,'$BENIN',NULL);"
run ALLOW "$FINH" "an Auchi expenditure line" "select public.save_budget_line(NULL,'$BUD','expenditure','programmes','Auchi programmes',500000000,'$AUCHI',NULL);"
run ALLOW "$FINH" "an org-wide admin line" "select public.save_budget_line(NULL,'$BUD','expenditure','admin','National admin',400000000,NULL,NULL);"
run ALLOW "$FINH" "a Benin-scoped income line (local giving)" "select public.save_budget_line(NULL,'$BUD','income','donations','Benin local giving',500000000,'$BENIN',NULL);"
LINE=$(raw "select id from public.budget_lines where budget_id='$BUD' and label='National admin';")
run DENY  "$FINH" "an unknown category is refused" "select public.save_budget_line(NULL,'$BUD','income','crypto','x',1,NULL,NULL);"
run DENY  "$FINH" "a negative plan is refused" "select public.save_budget_line(NULL,'$BUD','expenditure','admin','x',-1,NULL,NULL);"
run DENY  "$TREAS" "the Treasurer cannot write a line" "select public.save_budget_line(NULL,'$BUD','expenditure','admin','x',1,NULL,NULL);"
run ALLOW "$FINH" "a line can be corrected while draft" "select public.save_budget_line('$LINE','$BUD','expenditure','admin','National admin',450000000,NULL,NULL);"
want "the correction landed" "450000000" "$(raw "select planned_kobo from public.budget_lines where id='$LINE';")"
run ALLOW "$FINH" "a spare line is added then removed" "select public.save_budget_line(NULL,'$BUD','expenditure','other_expenditure','Spare',1,NULL,NULL);"
SP=$(raw "select id from public.budget_lines where budget_id='$BUD' and label='Spare';")
run ALLOW "$FINH" "the spare line is removed" "select public.remove_budget_line('$SP');"
want "six lines remain" "6" "$(raw "select count(*) from public.budget_lines where budget_id='$BUD';")"

# ── PART C. Submission and Board approval ──────────────────────────────
run DENY  "$TREAS" "the Treasurer cannot submit" "select public.submit_annual_budget('$BUD');"
run ALLOW "$FINH" "an empty budget is started" "select public.create_annual_budget(2097,'Empty');"
EB=$(raw "select id from public.annual_budgets where financial_year=2097;")
run DENY  "$FINH" "an empty budget cannot be submitted" "select public.submit_annual_budget('$EB');"
raw "delete from public.annual_budgets where financial_year=2097;" >/dev/null
run DENY  "$FINH" "the Financial Secretary cannot approve their own budget before it is submitted" "select public.decide_annual_budget('$BUD','approve','MIN-1',NULL);"
run ALLOW "$FINH" "the Financial Secretary submits it" "select public.submit_annual_budget('$BUD');"
want "it is submitted" "submitted" "$(bstat $BUD)"
run DENY  "$FINH" "a submitted budget's lines cannot be changed" "select public.save_budget_line('$LINE','$BUD','expenditure','admin','National admin',1,NULL,NULL);"
run DENY  "$FINH" "the Financial Secretary who prepared it cannot approve it" "select public.decide_annual_budget('$BUD','approve','MIN-1',NULL);"
run DENY  "$DNCH" "the Deputy cannot approve it" "select public.decide_annual_budget('$BUD','approve','MIN-1',NULL);"
run DENY  "$TREAS" "an approval needs a Board minute" "select public.decide_annual_budget('$BUD','approve',NULL,NULL);"
run ALLOW "$TREAS" "the Treasurer records the Board's approval, before the year starts" \
  "select public.decide_annual_budget('$BUD','approve','BoT/2026/07',make_date($YEAR - 1,12,5));"
want "it is board-approved, on time" "board_approved|false" "$(raw "select status||'|'||approved_late from public.annual_budgets where id='$BUD';")"
want "the minute is recorded" "BoT/2026/07" "$(raw "select board_minute from public.annual_budgets where id='$BUD';")"

# a budget approved after the year has begun is flagged late
PAST=$((YEAR-1))
run ALLOW "$FINH" "a budget for last year is prepared and submitted" "select public.create_annual_budget($PAST,'Late one');"
L2=$(raw "select id from public.annual_budgets where financial_year=$PAST;")
raw "set role authenticated; set test.uid='$FINH'; select public.save_budget_line(NULL,'$L2','income','donations','x',1000,NULL,NULL);" >/dev/null
raw "set role authenticated; set test.uid='$FINH'; select public.submit_annual_budget('$L2');" >/dev/null
run ALLOW "$NC" "approved after the year began" "select public.decide_annual_budget('$L2','approve','BoT/late','$TODAY'::date);"
want "it is flagged as approved late" "t" "$(raw "select approved_late from public.annual_budgets where id='$L2';")"

# return to draft
run ALLOW "$FINH" "a third budget is submitted" "select public.create_annual_budget(2099,NULL);"
L3=$(raw "select id from public.annual_budgets where financial_year=2099;")
raw "set role authenticated; set test.uid='$FINH'; select public.save_budget_line(NULL,'$L3','income','donations','x',1000,NULL,NULL);" >/dev/null
raw "set role authenticated; set test.uid='$FINH'; select public.submit_annual_budget('$L3');" >/dev/null
run ALLOW "$TREAS" "the Board sends one back to draft" "select public.decide_annual_budget('$L3','return',NULL,NULL);"
want "it is a draft again" "draft" "$(bstat $L3)"
run ALLOW "$FINH" "and its lines can be changed again" "select public.save_budget_line(NULL,'$L3','expenditure','admin','More',5,NULL,NULL);"

# active and closed
run DENY  "$FINH" "the Financial Secretary cannot make a budget active" "select public.set_annual_status('$BUD','active');"
run ALLOW "$TREAS" "the Treasurer makes the approved budget active" "select public.set_annual_status('$BUD','active');"
want "it is active" "active" "$(bstat $BUD)"
run DENY  "$TREAS" "a draft cannot be made active" "select public.set_annual_status('$L3','active');"
run ALLOW "$NC" "an active budget can be closed" "select public.set_annual_status('$BUD','closed');"
want "it is closed" "closed" "$(bstat $BUD)"
raw "update public.annual_budgets set status='active' where id='$BUD';" >/dev/null  # reopen for the numbers below

# ── PART D. Who can see what ───────────────────────────────────────────
for u in "$NC" "$FINH" "$TREAS" "$DNCH"; do
  want "a national reader sees the budget ($u)" "1" "$(as "$u" "select count(*) from public.annual_budgets where id='$BUD';")"
  want "and every line ($u)" "6" "$(as "$u" "select count(*) from public.budget_lines where budget_id='$BUD';")"
done
want "the Benin coordinator sees the budget (it has a Benin line)" "1" "$(as "$RC" "select count(*) from public.annual_budgets where id='$BUD';")"
want "the Benin coordinator sees only their own chapter's expenditure line" "1" "$(as "$RC" "select count(*) from public.budget_lines where budget_id='$BUD';")"
want "and it is the Benin one" "Benin programmes" "$(as "$RC" "select label from public.budget_lines where budget_id='$BUD';")"
want "the Benin coordinator sees no income lines" "0" "$(as "$RC" "select count(*) from public.budget_lines where budget_id='$BUD' and kind='income';")"
want "the Auchi coordinator sees only the Auchi line" "Auchi programmes" "$(as "$RCA" "select label from public.budget_lines where budget_id='$BUD';")"
want "a team member sees no budget" "0" "$(as "$TM" "select count(*) from public.annual_budgets;")"
want "a plain admin sees no budget" "0" "$(as "$PLAINADMIN" "select count(*) from public.annual_budgets;")"
want "a plain admin sees no lines" "0" "$(as "$PLAINADMIN" "select count(*) from public.budget_lines;")"
run DENY "$FINH" "no direct insert into a budget" "insert into public.annual_budgets(financial_year) values (2097);"
run DENY "$FINH" "no direct insert of a line" "insert into public.budget_lines(budget_id,kind,category,label,planned_kobo) values ('$BUD','income','donations','x',1);"

# ── PART E. Plan against actuals ───────────────────────────────────────
# Planned: income 5,000,000,000 (2,000,000,000 + 3,000,000,000);
#          expenditure 1,750,000,000 (800m + 500m + 450m).
# Actual income: a donation of 1,000,000,000 this year + a grant of
#   2,500,000,000 whose period covers this year.
# Actual expenditure: an approved claim of 300,000,000 reviewed this year.
raw "insert into public.donations(donor_name,amount_kobo,received_on,method,designation,status,created_by)
     values ('B35 Gift',1000000000,'$TODAY'::date,'transfer','general','active','$FINH');" >/dev/null
raw "insert into public.grants(title,funder_name,awarded_kobo,is_restricted,restrictions,status,period_start,period_end,created_by)
     values ('B35 Grant','Funder',2500000000,true,'Schools','active',make_date($YEAR,1,1),make_date($YEAR,12,31),'$NC');" >/dev/null
raw "insert into public.programs(id,title,chapter_id,status,budget) values ('eeeeeeee-0000-0000-0000-000000000001','B35 prog','$BENIN','Approved',0);" >/dev/null
raw "insert into public.expense_claims(claimant_id,claimant_name,chapter_id,programme_id,category,title,amount_kobo,incurred_on,status,submitted_at,due_by,reviewed_by,reviewed_at)
     values ('$TM','Tobi','$BENIN','eeeeeeee-0000-0000-0000-000000000001','materials','B35 claim',300000000,'$TODAY'::date,'approved',now(),'$TODAY'::date + 30,'$FINH',now());" >/dev/null
# A rejected claim reviewed this year must NOT count toward actual expenditure.
raw "insert into public.expense_claims(claimant_id,claimant_name,chapter_id,programme_id,category,title,amount_kobo,incurred_on,status,submitted_at,due_by,reviewed_by,reviewed_at,review_note)
     values ('$TM','Tobi','$BENIN','eeeeeeee-0000-0000-0000-000000000001','materials','B35 rejected',999000000,'$TODAY'::date,'rejected',now(),'$TODAY'::date + 30,'$FINH',now(),'Not a real cost');" >/dev/null
# A voided donation this year must NOT count toward actual income.
raw "insert into public.donations(donor_name,amount_kobo,received_on,method,designation,status,void_reason,created_by)
     values ('B35 Voided',999000000,'$TODAY'::date,'transfer','general','voided','Never arrived','$FINH');" >/dev/null

VA=$(as "$FINH" "select planned_income_kobo||'|'||planned_expenditure_kobo||'|'||actual_income_kobo||'|'||actual_expenditure_kobo from public.budget_vs_actual($YEAR);")
want "plan against actuals adds up" "5500000000|1750000000|3500000000|300000000" "$VA"
want "the Treasurer sees the same" "5500000000" "$(as "$TREAS" "select planned_income_kobo from public.budget_vs_actual($YEAR);")"
want "a team member gets nothing from budget_vs_actual" "0" "$(as "$TM" "select count(*) from public.budget_vs_actual($YEAR);")"
want "the Benin coordinator sees their chapter's line in the actuals view" "1" "$(as "$RC" "select count(*) from public.budget_line_actuals('$BUD');")"
want "and it is the Benin expenditure line" "Benin programmes" "$(as "$RC" "select label from public.budget_line_actuals('$BUD');")"
want "a national reader sees all six lines in the actuals view" "6" "$(as "$FINH" "select count(*) from public.budget_line_actuals('$BUD');")"

run DENY "$FINH" "a line cannot be removed once the budget has left draft" "select public.remove_budget_line('$LINE');"

# ── PART F. The record and signed out ──────────────────────────────────
want "the ledger holds the budget's life" "t" "$(raw "select count(*) >= 4 from public.finance_events where budget_id='$BUD';")"
want "the Treasurer reads the budget's ledger" "t" "$(as "$TREAS" "select count(*) > 0 from public.finance_events where budget_id='$BUD';")"
want "a team member sees none of the budget ledger" "0" "$(as "$TM" "select count(*) from public.finance_events where budget_id='$BUD';")"
want "the budget ledger cannot be rewritten" "1" "$(raw "update public.finance_events set note='x' where budget_id='$BUD';" | grep -c "append-only")"
want "a signed-out caller cannot read the plan-vs-actual" "1" "$(anon "select * from public.budget_vs_actual($YEAR);" | grep -ci "permission denied")"
want "a signed-out caller cannot create a budget" "1" "$(anon "select public.create_annual_budget(2097,NULL);" | grep -ci "permission denied")"
want "the annual logger cannot be called by a signed-in user" "1" "$(as "$FINH" "select public.annual_log('annual_created','$BUD',1,'forged');" | grep -c ERROR)"

# Tidy.
raw "delete from public.annual_budgets where financial_year in ($YEAR,$NEXT,$((YEAR-1)),2099);" >/dev/null
raw "delete from public.donations where donor_name like 'B35 %';" >/dev/null
raw "delete from public.grants where title like 'B35 %';" >/dev/null
raw "delete from public.expense_claims where title like 'B35 %';" >/dev/null
raw "delete from public.programs where title like 'B35 %';" >/dev/null
for u in $DNCH $FINH $TREAS; do for s in DNC FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
