#!/bin/bash
# BATCH39-MARKER stipends
# Run after the Batch 35 chain (see run-batch35-tests.sh), then
#   psql -h /tmp/pg -d ycdi -f batch39-stipends.sql
#
# Proves the stipend record from the database side:
#   - the Financial Secretary keeps the list and records payments; any
#     existing member can be added; amounts differ person to person
#   - nobody adds themselves, sets their own amount, or records or voids
#     their own payment: not the FIN seat, not the NC
#   - the Treasurer covers whoever is running finance; the NC covers the
#     FIN holder; the NC runs it while the FIN seat is empty
#   - a person on the list reads their own entry and payments and nobody
#     else's; the Deputy, a coordinator and a plain admin read nothing else
#   - one live payment per person per month; no account-number reference;
#     no future date; no month outside the stipend; an odd amount needs a
#     note; a voided payment stays on record and frees the month
#   - the tables take no direct writes
#   - the year summary and the annual budget's actual expenditure count
#     stipends paid
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333       # Benin RC
TM=44444444-4444-4444-4444-444444444444       # Benin TM, holds SEC here
DNCH=dddddddd-1111-1111-1111-111111111111     # holds DNC
FINH=77777777-7777-7777-7777-777777777777     # holds FIN
TREAS=99999999-9999-9999-9999-999999999999    # holds TREAS
PLAINADMIN=88888888-8888-8888-8888-888888888888
RCA=aaaaaaaa-2222-2222-2222-222222222222      # Auchi RC

pass=0; fail=0
raw(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1; }
as(){ su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid='$1'; $2\"" 2>&1 | grep -v '^SET$'; }
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
TODAY=$(raw "select (now() at time zone 'Africa/Lagos')::date;")
THIS=$(raw "select date_trunc('month', (now() at time zone 'Africa/Lagos')::date)::date;")
PREV=$(raw "select (date_trunc('month', (now() at time zone 'Africa/Lagos')::date) - interval '1 month')::date;")
START=$(raw "select (date_trunc('month', (now() at time zone 'Africa/Lagos')::date) - interval '2 months')::date;")
BEFORE=$(raw "select (date_trunc('month', (now() at time zone 'Africa/Lagos')::date) - interval '3 months')::date;")
NEXTM=$(raw "select (date_trunc('month', (now() at time zone 'Africa/Lagos')::date) + interval '1 month')::date;")
TOMORROW=$(raw "select (now() at time zone 'Africa/Lagos')::date + 1;")
PYEAR=$(raw "select extract(year from (date_trunc('month', (now() at time zone 'Africa/Lagos')::date) - interval '1 month'))::int;")

echo "Batch 39: stipends"

# ── Clean slate and accounts ───────────────────────────────────────────
raw "delete from public.stipend_payments;" >/dev/null
raw "delete from public.stipend_recipients;" >/dev/null
raw "delete from public.notifications where kind='stipend';" >/dev/null
LEDGER0=$(raw "select count(*) from public.finance_events where kind='stipend_paid';")
raw "delete from public.annual_budgets where financial_year = $PYEAR;" >/dev/null
raw "insert into auth.users (id,email) values ('$DNCH','dele@ycdi.test'),('$FINH','femi@ycdi.test'),('$TREAS','tunde@ycdi.test'),('$PLAINADMIN','sam@ycdi.test'),('$RCA','adarc@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values
  ('$DNCH','Dele Deputy','TM',(select id from public.chapters where name='Lagos'),false),
  ('$FINH','Femi Finance','TM',(select id from public.chapters where name='Benin'),false),
  ('$TREAS','Tunde Treasurer','TM',(select id from public.chapters where name='Lagos'),false),
  ('$PLAINADMIN','Sam Sysadmin','TM',(select id from public.chapters where name='Benin'),true),
  ('$RCA','Auchi Coordinator','RC',(select id from public.chapters where name='Auchi'),false)
  on conflict (id) do update set role=excluded.role, chapter_id=excluded.chapter_id, is_admin=excluded.is_admin;" >/dev/null
for u in $DNCH $FINH $TREAS $RC $RCA $TM $NC; do for s in DNC FIN TREAS SEC; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done
raw "select public.set_portfolio('$FINH','FIN',true);" >/dev/null
raw "select public.set_portfolio('$TREAS','TREAS',true);" >/dev/null
raw "select public.set_portfolio('$DNCH','DNC',true);" >/dev/null
raw "select public.set_portfolio('$TM','SEC',true);" >/dev/null

add(){ echo "select public.save_stipend_recipient(null,'$1',$2,'$START',null,'$3',null,null);"; }
rid(){ raw "select id from public.stipend_recipients where profile_id='$1';"; }

echo "── Keeping the list"
run ALLOW $FINH "the Financial Secretary adds a Regional Coordinator" "$(add $RC 3000000 'Regional Coordinator, Benin')"
run ALLOW $FINH "the Financial Secretary adds the National Coordinator" "$(add $NC 7500000 'National Coordinator')"
run ALLOW $FINH "the Financial Secretary adds the National Secretary at a different amount" "$(add $TM 4000000 'National Secretary')"
run DENY  $FINH "the Financial Secretary cannot add themselves" "$(add $FINH 5000000 'Financial Secretary')"
run DENY  $FINH "the same person cannot be added twice" "$(add $RC 3000000 'Again')"
run DENY  $NC   "the NC cannot add someone while the FIN seat is filled" "$(add $RCA 3000000 'Regional Coordinator, Auchi')"
run DENY  $TREAS "the Treasurer cannot add an ordinary member" "$(add $RCA 3000000 'Regional Coordinator, Auchi')"
run DENY  $RC   "a coordinator cannot add anyone" "$(add $RCA 3000000 'Regional Coordinator, Auchi')"
run DENY  $DNCH "the Deputy cannot add anyone" "$(add $RCA 3000000 'Regional Coordinator, Auchi')"
run DENY  $PLAINADMIN "a plain admin cannot add anyone" "$(add $RCA 3000000 'Regional Coordinator, Auchi')"
run DENY  $FINH "a stipend needs a label" "select public.save_stipend_recipient(null,'$RCA',3000000,'$START',null,'  ',null,null);"
run DENY  $FINH "a stipend needs a positive amount" "select public.save_stipend_recipient(null,'$RCA',0,'$START',null,'RC',null,null);"
RRC=$(rid $RC); RNC=$(rid $NC); RTM=$(rid $TM)
want "amounts are kept per person" "3000000,7500000,4000000" "$(raw "select string_agg(monthly_kobo::text, ',' order by array_position(array['$RC','$NC','$TM']::uuid[], profile_id)) from public.stipend_recipients;")"
run DENY  $NC   "the NC cannot change their own amount" "select public.save_stipend_recipient('$RNC',null,9000000,'$START',null,'National Coordinator',null,null);"
run ALLOW $FINH "the Financial Secretary changes an amount" "select public.save_stipend_recipient('$RTM',null,4500000,'$START',null,'National Secretary','NEC minute 3/2026',null);"
want "the change is logged with the old and new amounts" "1" "$(raw "select count(*) from public.finance_events where kind='stipend_changed' and stipend_id='$RTM' and note like '%₦40,000 → ₦45,000%';")"

echo "── Recording payments"
pay(){ echo "select public.record_stipend_payment('$1','$2',$3,'$TODAY','$4',$5);"; }
run ALLOW $FINH "the Financial Secretary records last month for the coordinator" "$(pay $RRC $PREV 3000000 'TRF-0001' null)"
run DENY  $FINH "the same month cannot be recorded twice" "$(pay $RRC $PREV 3000000 'TRF-0002' null)"
run DENY  $FINH "a bare ten-digit reference is refused" "$(pay $RNC $PREV 7500000 '0123456789' null)"
run DENY  $FINH "a future payment date is refused" "select public.record_stipend_payment('$RNC','$PREV',7500000,'$TOMORROW','TRF-9',null);"
run DENY  $FINH "a month before the stipend began is refused" "$(pay $RNC $BEFORE 7500000 'TRF-3' null)"
run DENY  $FINH "a month not yet started is refused" "$(pay $RNC $NEXTM 7500000 'TRF-4' null)"
run DENY  $FINH "an amount off the rate needs a note" "$(pay $RNC $PREV 5000000 'TRF-5' null)"
run ALLOW $FINH "an amount off the rate goes through with a note" "$(pay $RNC $PREV 5000000 'TRF-5' "'Part month, started mid-way'")"
run DENY  $NC   "the NC cannot record their own stipend" "$(pay $RNC $START 7500000 'TRF-6' null)"
run DENY  $TREAS "the Treasurer cannot record an ordinary member's stipend" "$(pay $RTM $PREV 4500000 'TRF-7' null)"
run DENY  $RC   "a coordinator cannot record a payment" "$(pay $RTM $PREV 4500000 'TRF-7' null)"
run ALLOW $FINH "the Financial Secretary records the Secretary's month" "$(pay $RTM $PREV 4500000 'TRF-7' null)"
want "the coordinator is told their stipend was paid" "1" "$(raw "select count(*) from public.notifications where profile_id='$RC' and kind='stipend' and title like '%recorded as paid%';")"

echo "── Direct writes"
run DENY $FINH "no direct insert into the list" "insert into public.stipend_recipients (profile_id,recipient_name,role_label,monthly_kobo,start_month) values ('$RCA','x','y',1,'$START');"
run DENY $FINH "no direct update of an amount" "update public.stipend_recipients set monthly_kobo=1 where id='$RRC';"
run DENY $FINH "no direct insert of a payment" "insert into public.stipend_payments (recipient_id,recipient_name,month,amount_kobo,paid_on,payment_ref) values ('$RRC','x','$START',1,'$TODAY','r');"
run DENY $FINH "no deleting a payment" "delete from public.stipend_payments where recipient_id='$RRC';"

echo "── Who reads what"
want "the Financial Secretary sees the whole list" "3" "$(as $FINH "select count(*) from public.stipend_recipients;")"
want "the Treasurer sees the whole list" "3" "$(as $TREAS "select count(*) from public.stipend_recipients;")"
want "the NC sees the whole list" "3" "$(as $NC "select count(*) from public.stipend_recipients;")"
want "the coordinator sees only their own entry" "$RC" "$(as $RC "select string_agg(profile_id::text, ',') from public.stipend_recipients;")"
want "the coordinator sees only their own payments" "1" "$(as $RC "select count(*) from public.stipend_payments;")"
want "the Secretary sees only their own entry" "1" "$(as $TM "select count(*) from public.stipend_recipients;")"
want "another coordinator sees nothing" "0" "$(as $RCA "select count(*) from public.stipend_recipients;")"
want "the Deputy sees nothing" "0" "$(as $DNCH "select count(*) from public.stipend_payments;")"
want "a plain admin sees nothing" "0" "$(as $PLAINADMIN "select count(*) from public.stipend_recipients;")"
want "the month sheet is empty for a coordinator" "0" "$(as $RC "select count(*) from public.stipend_month_sheet('$PREV');")"
want "the month sheet lists everyone on stipend for the Financial Secretary" "3" "$(as $FINH "select count(*) from public.stipend_month_sheet('$PREV');")"
want "the month sheet shows who is paid" "3" "$(as $FINH "select count(*) from public.stipend_month_sheet('$PREV') where payment_id is not null;")"
want "the full list is empty for a coordinator" "0" "$(as $RC "select count(*) from public.stipend_list();")"
want "the full list shows who the Financial Secretary may act on" "false,true,true,true" "$(as $FINH "select string_agg(can_act::text, ',' order by recipient_name) from (select recipient_name, can_act from public.stipend_list() union all select 'Femi', public.stipend_can_act('$FINH')) x;")"
want "the Treasurer may act on nobody on an ordinary list" "0" "$(as $TREAS "select count(*) from public.stipend_list() where can_act;")"
want "candidate search is empty for a plain admin" "0" "$(as $PLAINADMIN "select count(*) from public.stipend_candidates(null);")"
want "candidate search is empty for the Deputy" "0" "$(as $DNCH "select count(*) from public.stipend_candidates(null);")"
want "candidate search is empty for a coordinator" "0" "$(as $RC "select count(*) from public.stipend_candidates(null);")"
want "candidate search finds any member for the Financial Secretary" "t" "$(as $FINH "select count(*) >= 8 from public.stipend_candidates(null);")"
want "candidate search marks who is already on the list" "t" "$(as $FINH "select on_list from public.stipend_candidates('Rita');")"
want "candidate search marks the Secretary's seat" "t" "$(as $FINH "select 'SEC' = any(seats) from public.stipend_candidates('Tobi');")"
want "the Financial Secretary cannot act on themselves" "f" "$(as $FINH "select can_act from public.stipend_candidates('Femi');")"
run DENY "" "a signed-out caller cannot read the month sheet" "select 1/count(*) from public.stipend_month_sheet('$PREV');"
want "a signed-out caller cannot call the functions" "1" "$(anon "select public.stipend_candidates(null);" | grep -c 'permission denied')"

echo "── Voiding"
PAY=$(raw "select id from public.stipend_payments where recipient_id='$RRC' and month='$PREV';")
run DENY  $RC   "the coordinator cannot void their own payment" "select public.void_stipend_payment('$PAY','Wrong amount');"
run DENY  $FINH "voiding needs a reason" "select public.void_stipend_payment('$PAY','no');"
run ALLOW $FINH "the Financial Secretary voids a mistaken payment" "select public.void_stipend_payment('$PAY','Recorded against the wrong month');"
want "the voided payment stays on the record" "voided" "$(raw "select status from public.stipend_payments where id='$PAY';")"
run DENY  $FINH "a voided payment cannot be voided again" "select public.void_stipend_payment('$PAY','Again please');"
run ALLOW $FINH "the month can be recorded again after a void" "$(pay $RRC $PREV 3000000 'TRF-0003' null)"

echo "── The Financial Secretary on stipend"
run ALLOW $NC   "the NC adds the Financial Secretary" "$(add $FINH 5000000 'Financial Secretary')"
RFIN=$(rid $FINH)
run DENY  $FINH "the Financial Secretary cannot record their own payment" "$(pay $RFIN $PREV 5000000 'TRF-8' null)"
run DENY  $FINH "the Financial Secretary cannot change their own amount" "select public.save_stipend_recipient('$RFIN',null,9000000,'$START',null,'Financial Secretary',null,null);"
run ALLOW $TREAS "the Treasurer records the Financial Secretary's payment" "$(pay $RFIN $PREV 5000000 'TRF-8' null)"

echo "── The FIN seat empty"
raw "select public.set_portfolio('$FINH','FIN',false);" >/dev/null
run ALLOW $NC   "the NC records a coordinator while the seat is empty" "$(pay $RRC $START 3000000 'TRF-10' null)"
run DENY  $NC   "the NC still cannot record their own" "$(pay $RNC $START 7500000 'TRF-11' null)"
run ALLOW $TREAS "the Treasurer records the NC's while the seat is empty" "$(pay $RNC $START 7500000 'TRF-11' null)"
run DENY  $TREAS "the Treasurer still cannot record an ordinary member" "$(pay $RTM $START 4500000 'TRF-12' null)"
raw "select public.set_portfolio('$FINH','FIN',true);" >/dev/null

echo "── Ending a stipend"
run DENY  $FINH "a stipend cannot end before a recorded payment" "select public.end_stipend('$RTM','$START');"
run ALLOW $FINH "the Financial Secretary ends the Secretary's stipend after last month" "select public.end_stipend('$RTM','$PREV');"
run DENY  $FINH "no payment after the stipend ended" "$(pay $RTM $THIS 4500000 'TRF-13' null)"
want "an ended stipend drops off this month's sheet" "0" "$(as $FINH "select count(*) from public.stipend_month_sheet('$THIS') where recipient_id='$RTM';")"

echo "── The year and the budget"
want "the year summary counts live payments only" "$(raw "select sum(amount_kobo) from public.stipend_payments where status='paid' and extract(year from month)=$PYEAR;")" "$(as $FINH "select paid_kobo from public.stipend_year_summary($PYEAR);")"
raw "insert into public.annual_budgets (financial_year, status) values ($PYEAR, 'draft');" >/dev/null
raw "insert into public.budget_lines (budget_id, kind, category, label, planned_kobo) values ((select id from public.annual_budgets where financial_year=$PYEAR),'expenditure','stipends','Stipends',100000000);" >/dev/null
want "the year summary reads the budget's Stipends line" "100000000" "$(as $FINH "select planned_kobo from public.stipend_year_summary($PYEAR);")"
want "the year summary is empty for a coordinator" "0" "$(as $RC "select count(*) from public.stipend_year_summary($PYEAR);")"
CLAIMS=$(raw "select coalesce(sum(amount_kobo),0) from public.expense_claims where status in ('approved','paid') and reviewed_at is not null and extract(year from (reviewed_at at time zone 'Africa/Lagos'))=$PYEAR;")
STIP=$(raw "select coalesce(sum(amount_kobo),0) from public.stipend_payments where status='paid' and extract(year from month)=$PYEAR;")
want "the annual budget's actual expenditure includes stipends paid" "$((CLAIMS+STIP))" "$(as $FINH "select actual_expenditure_kobo from public.budget_vs_actual($PYEAR);")"
raw "delete from public.annual_budgets where financial_year = $PYEAR;" >/dev/null

echo "── The ledger"
want "every payment is in the finance ledger" "$(raw "select count(*) from public.stipend_payments;")" "$(( $(raw "select count(*) from public.finance_events where kind='stipend_paid';") - LEDGER0 ))"
run DENY "" "the stipend logger cannot be called by a signed-in user" "select public.stipend_log('stipend_paid', null, 1, 'x');"

# Leave nothing behind for the Batch 35 run, whose actuals would count it.
raw "delete from public.stipend_payments;" >/dev/null
raw "delete from public.stipend_recipients;" >/dev/null

echo
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
