#!/bin/bash
# BATCH34-MARKER donations
# Run after:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch18-nec-portfolios.sql batch29-audience-and-consent.sql \
#          batch32-finance.sql batch33-grants.sql batch34-donations.sql" bash _harness/setup.sh
#
# Proves the donations module from the database side:
#   - the Financial Secretary and NC record and manage; the Deputy and the
#     Treasurer read; a plain member and a plain admin see nothing
#   - a gift validates: an amount over zero, a real date not in the future,
#     a known method, a restricted gift with its restriction note, and a
#     reference that is not a bank account number
#   - a gift is corrected (logged), acknowledged, and voided (out of every
#     total but still in the record); nothing is ever deleted
#   - the donor tier bands are applied to a year's giving
#   - the numbers add up: the year's total, restricted split, donor count,
#     unacknowledged count, and a voided gift dropping out
#   - the record is append-only, and nobody writes to the table directly
#
# Accounts (batch32/33 seed ids plus the seats):
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin TM
DNCH=dddddddd-1111-1111-1111-111111111111     # Dele, holds DNC
FINH=77777777-7777-7777-7777-777777777777     # Femi, holds FIN
TREAS=99999999-9999-9999-9999-999999999999    # Tunde, holds TREAS
PLAINADMIN=88888888-8888-8888-8888-888888888888 # Sam, is_admin only

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
TODAY=$(raw "select (now() at time zone 'Africa/Lagos')::date;")
YEAR=$(raw "select extract(year from (now() at time zone 'Africa/Lagos')::date)::int;")

echo "Batch 34 — donations"

# ── Clean slate and accounts ───────────────────────────────────────────
raw "delete from public.donations where donor_name like 'B34 %';" >/dev/null
raw "delete from public.audience_contacts where email like 'b34-%';" >/dev/null
for u in $DNCH $FINH $TREAS; do for s in DNC FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done
raw "insert into auth.users (id,email) values ('$DNCH','dele@ycdi.test'),('$FINH','femi@ycdi.test'),('$TREAS','tunde@ycdi.test'),('$PLAINADMIN','sam@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id,full_name,role,chapter_id,is_admin) values
  ('$DNCH','Dele Deputy','TM',(select id from public.chapters where name='Lagos'),false),
  ('$FINH','Femi Finance','TM',(select id from public.chapters where name='Benin'),false),
  ('$TREAS','Tunde Treasurer','TM',(select id from public.chapters where name='Lagos'),false),
  ('$PLAINADMIN','Sam Sysadmin','TM',(select id from public.chapters where name='Benin'),true)
  on conflict (id) do update set role=excluded.role, chapter_id=excluded.chapter_id, is_admin=excluded.is_admin;" >/dev/null
raw "select public.set_portfolio('$DNCH','DNC',true);" >/dev/null
raw "select public.set_portfolio('$FINH','FIN',true);" >/dev/null
raw "select public.set_portfolio('$TREAS','TREAS',true);" >/dev/null
raw "insert into public.audience_contacts(full_name,email,category,donor_tier,lawful_basis,created_by)
     values ('B34 Mrs Ade','b34-ade@test.example','donor','partner','consent','$NC');" >/dev/null
DONOR=$(raw "select id from public.audience_contacts where email='b34-ade@test.example';")

# ── PART A. Who may record ─────────────────────────────────────────────
run ALLOW "$FINH" "the Financial Secretary records a gift" \
  "select public.record_donation('B34 Mrs Ade',15000000,'$TODAY'::date,'transfer','$DONOR','TRF-D1','general',NULL,'year_end','Annual gift');"
D1=$(raw "select id from public.donations where donor_name='B34 Mrs Ade' and reference='TRF-D1';")
run ALLOW "$NC"   "the National Coordinator can record one" \
  "select public.record_donation('B34 Anonymous',500000,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY  "$DNCH" "the Deputy cannot record a gift (reads only)" \
  "select public.record_donation('B34 x',100,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY  "$TREAS" "the Treasurer cannot record a gift" \
  "select public.record_donation('B34 x',100,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY  "$TM"   "a team member cannot" \
  "select public.record_donation('B34 x',100,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY  "$PLAINADMIN" "a plain admin cannot" \
  "select public.record_donation('B34 x',100,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
want "it is stored in kobo, active, not yet acknowledged" "15000000|active|false" \
  "$(raw "select amount_kobo||'|'||status||'|'||acknowledged from public.donations where id='$D1';")"

# ── PART B. Validation ─────────────────────────────────────────────────
run DENY "$FINH" "a gift needs a donor name"        "select public.record_donation('  ',100,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY "$FINH" "zero is refused"                  "select public.record_donation('B34 x',0,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY "$FINH" "a future date is refused"         "select public.record_donation('B34 x',100,('$TODAY'::date + 2),'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY "$FINH" "an unknown method is refused"     "select public.record_donation('B34 x',100,'$TODAY'::date,'bitcoin',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY "$FINH" "a restricted gift needs a note"   "select public.record_donation('B34 x',100,'$TODAY'::date,'cash',NULL,NULL,'restricted',NULL,NULL,NULL);"
run DENY "$FINH" "a ten-digit account number is refused as a reference" "select public.record_donation('B34 x',100,'$TODAY'::date,'transfer',NULL,'0123456789','general',NULL,NULL,NULL);"
run DENY "$FINH" "an unknown campaign is refused"   "select public.record_donation('B34 x',100,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,'harvest',NULL);"
run DENY "$FINH" "an unknown donor contact is refused" "select public.record_donation('B34 x',100,'$TODAY'::date,'cash','dddddddd-9999-9999-9999-999999999999',NULL,'general',NULL,NULL,NULL);"
run ALLOW "$FINH" "a restricted gift with a note is fine" "select public.record_donation('B34 Trust',20000000,'$TODAY'::date,'transfer',NULL,'TRF-R','restricted','Scholarship fund only','general',NULL);"
want "no stray rows from the refusals" "3" "$(raw "select count(*) from public.donations where donor_name like 'B34 %';")"

# ── PART C. Who may read ───────────────────────────────────────────────
for u in "$NC" "$FINH" "$DNCH" "$TREAS"; do
  want "a reader sees the gifts ($u)" "3" "$(as "$u" "select count(*) from public.donations where donor_name like 'B34 %';")"
done
want "a team member sees none" "0" "$(as "$TM" "select count(*) from public.donations;")"
want "a plain admin sees none" "0" "$(as "$PLAINADMIN" "select count(*) from public.donations;")"

run DENY "$FINH" "no direct insert into donations" "insert into public.donations(donor_name,amount_kobo,received_on,method) values ('B34 direct',1,'$TODAY'::date,'cash');"
run DENY "$FINH" "no direct update"                "update public.donations set amount_kobo = 1 where id='$D1';"
run DENY "$FINH" "no direct delete"                "delete from public.donations where id='$D1';"

# ── PART D. Correcting, acknowledging, voiding ─────────────────────────
run DENY  "$DNCH" "the Deputy cannot correct a gift" "select public.correct_donation('$D1','B34 Mrs Ade',15000000,'$TODAY'::date,'transfer','$DONOR','TRF-D1','general',NULL,'year_end',NULL);"
run ALLOW "$FINH" "the Financial Secretary corrects the amount" "select public.correct_donation('$D1','B34 Mrs Ade',18000000,'$TODAY'::date,'transfer','$DONOR','TRF-D1','general',NULL,'year_end','Bank confirmed higher');"
want "the correction landed" "18000000" "$(raw "select amount_kobo from public.donations where id='$D1';")"
want "the correction is in the record" "1" "$(raw "select count(*) from public.finance_events where donation_id='$D1' and kind='donation_corrected';")"

run DENY  "$TREAS" "the Treasurer cannot acknowledge" "select public.acknowledge_donation('$D1');"
run ALLOW "$FINH" "the Financial Secretary acknowledges the gift" "select public.acknowledge_donation('$D1');"
want "it is acknowledged, dated today" "true|$TODAY" "$(raw "select acknowledged||'|'||acknowledged_on from public.donations where id='$D1';")"

run DENY  "$DNCH" "the Deputy cannot void a gift" "select public.void_donation('$D1','Trying to void');"
run DENY  "$TREAS" "the Treasurer cannot void a gift" "select public.void_donation('$D1','Trying to void');"
run DENY  "$TM" "a team member cannot void a gift" "select public.void_donation('$D1','Trying to void');"
run DENY  "$FINH" "a void needs a reason" "select public.void_donation('$D1','no');"
run ALLOW "$FINH" "a gift entered in error is voided with a reason" \
  "select public.void_donation((select id from public.donations where donor_name='B34 Anonymous'),'Donor cancelled the transfer');"
VD=$(raw "select id from public.donations where donor_name='B34 Anonymous';")
want "the voided gift keeps its row" "voided" "$(raw "select status from public.donations where id='$VD';")"
run DENY  "$FINH" "a voided gift cannot be corrected"    "select public.correct_donation('$VD','B34 Anonymous',500000,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);"
run DENY  "$FINH" "a voided gift cannot be acknowledged" "select public.acknowledge_donation('$VD');"
run DENY  "$FINH" "a voided gift cannot be voided again"  "select public.void_donation('$VD','again');"

# ── PART E. Tiers ──────────────────────────────────────────────────────
want "under 20,000 naira is a Friend"        "friend"     "$(raw "select public.donor_tier_for(1999999);")"
want "20,000 naira is a Supporter"           "supporter"  "$(raw "select public.donor_tier_for(2000000);")"
want "100,000 naira is a Partner"            "partner"    "$(raw "select public.donor_tier_for(10000000);")"
want "500,000 naira is a Champion"           "champion"   "$(raw "select public.donor_tier_for(50000000);")"
want "nothing given is no tier"              ""           "$(raw "select coalesce(public.donor_tier_for(0),'');")"

# Mrs Ade gave 18,000,000 kobo this year → Partner.
T=$(as "$FINH" "select tier||'|'||total_kobo||'|'||gifts from public.donation_by_donor($YEAR) where donor_id='$DONOR';")
want "the donor's giving earns their tier" "partner|18000000|1" "$T"
want "a team member gets no by-donor figures" "0" "$(as "$TM" "select count(*) from public.donation_by_donor($YEAR);")"
want "by-donor counts only active gifts, so the voided donor drops out" "2" "$(as "$FINH" "select count(*) from public.donation_by_donor($YEAR);")"

# ── PART F. The overview ───────────────────────────────────────────────
# Active this year: Mrs Ade 18,000,000 (general) + B34 Trust 20,000,000 (restricted). The Anonymous 500,000 was voided.
OV=$(as "$FINH" "select gifts||'|'||total_kobo||'|'||restricted_kobo||'|'||unrestricted_kobo||'|'||donors from public.donation_overview($YEAR);")
want "the overview counts only active gifts, split by restriction" "2|38000000|20000000|18000000|2" "$OV"
want "one gift is still unacknowledged (the Trust)" "1" "$(as "$FINH" "select unacknowledged from public.donation_overview($YEAR);")"
want "the Treasurer sees the overview" "2" "$(as "$TREAS" "select gifts from public.donation_overview($YEAR);")"
want "the Deputy sees the overview" "2" "$(as "$DNCH" "select gifts from public.donation_overview($YEAR);")"
want "a team member gets an empty overview" "0" "$(as "$TM" "select count(*) from public.donation_overview($YEAR);")"
want "a plain admin gets an empty overview" "0" "$(as "$PLAINADMIN" "select count(*) from public.donation_overview($YEAR);")"

# ── PART G. The record, and signed out ─────────────────────────────────
want "the record holds the gift's life" "t" "$(raw "select count(*) >= 3 from public.finance_events where donation_id='$D1';")"
want "the Treasurer reads the gift's ledger" "t" "$(as "$TREAS" "select count(*) > 0 from public.finance_events where donation_id='$D1';")"
want "a team member sees none of the donation ledger" "0" "$(as "$TM" "select count(*) from public.finance_events where donation_id='$D1';")"
want "the donation ledger cannot be rewritten" "1" "$(raw "update public.finance_events set note='x' where donation_id='$D1';" | grep -c "append-only")"
want "a signed-out caller cannot record a gift" "1" "$(anon "select public.record_donation('x',1,'$TODAY'::date,'cash',NULL,NULL,'general',NULL,NULL,NULL);" | grep -ci "permission denied")"
want "a signed-out caller cannot read the overview" "1" "$(anon "select * from public.donation_overview($YEAR);" | grep -ci "permission denied")"
want "the donation logger cannot be called by a signed-in user" "1" "$(as "$FINH" "select public.donation_log('donation_recorded','$D1',1,'forged');" | grep -c ERROR)"

# Tidy.
raw "delete from public.donations where donor_name like 'B34 %';" >/dev/null
raw "delete from public.audience_contacts where email like 'b34-%';" >/dev/null
for u in $DNCH $FINH $TREAS; do for s in DNC FIN TREAS; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
