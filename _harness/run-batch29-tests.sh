#!/bin/bash
# BATCH29-MARKER audience-and-consent
# Run after:
#   EXTRA="batch1-notifications.sql batch1b-notification-emails.sql \
#          nc-sees-all-chapter-channels.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          _harness/05-report-columns.sql batch5-kpi-exports.sql \
#          batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch13-team-member-participants.sql batch16-reporting-chain.sql \
#          batch18-nec-portfolios.sql batch29-audience-and-consent.sql" \
#          bash _harness/setup.sh
#
# Proves the audience and the do-not-email list from the database side:
#   - the audience is the National Coordinator's and the COMMS and FIN
#     seats', and nobody else's, including a plain admin
#   - the FIN seat reads and cannot change anything
#   - a contact must record a lawful basis, one address is one row, and a
#     donor must carry a tier
#   - Champions, Partners, in-kind donors and grant funders stay out of the
#     broadcast segments, and a blocked address is never counted as emailable
#   - a stop survives the contact being deleted and re-entered, and no
#     signed-in user can edit or remove one
#   - the Hub segments count only people with a login, an email and (for
#     volunteers) an active record
#
# Accounts (same seed ids the other batches use):
ADMIN=11111111-1111-1111-1111-111111111111   # Ada, NC + admin
NC=22222222-2222-2222-2222-222222222222       # Ngozi, pure NC
RC=33333333-3333-3333-3333-333333333333       # Rita, Benin RC, will hold FIN
TM=44444444-4444-4444-4444-444444444444       # Tobi, Benin TM, will hold COMMS
PLAINADMIN=88888888-8888-8888-8888-888888888888  # Sam, TM with is_admin and nothing else

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
seg(){ # uid segment -> "emailable/blocked"
  as "$1" "select emailable||'/'||blocked from public.audience_segment_counts() where segment='$2';"
}

echo "Batch 29 — audience and consent"

# Clean slate for repeat runs, and a plain admin that holds nothing else.
raw "delete from public.audience_contacts where email like 'b29-%';" >/dev/null
raw "delete from public.email_suppressions where email like 'b29-%';" >/dev/null
for u in $TM $RC; do for s in COMMS FIN; do raw "select public.set_portfolio('$u','$s',false);" >/dev/null; done; done
raw "insert into auth.users (id, email) values ('$PLAINADMIN','sysadmin@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id, full_name, role, chapter_id, is_admin)
     values ('$PLAINADMIN','Sam Sysadmin','TM',(select id from public.chapters where name='Benin'), true)
     on conflict (id) do update set is_admin = true, role = 'TM';" >/dev/null

NEW="insert into public.audience_contacts(full_name,email,category,donor_tier,lawful_basis,created_by)"

# ── PART A. Nobody without a seat gets in ──────────────────────────────
raw "$NEW values ('B29 Seed','b29-seed@test.example','donor','supporter','consent','$NC');" >/dev/null

run DENY "$TM" "a plain team member cannot add a contact" \
  "$NEW values ('B29 x','b29-x1@test.example','alumni',null,'consent','$TM');"
run DENY "$RC" "a plain RC cannot add a contact" \
  "$NEW values ('B29 x','b29-x2@test.example','alumni',null,'consent','$RC');"
run DENY "$PLAINADMIN" "a plain admin cannot add a contact" \
  "$NEW values ('B29 x','b29-x3@test.example','alumni',null,'consent','$PLAINADMIN');"

want "plain TM sees no contacts"    "0" "$(as "$TM" "select count(*) from public.audience_contacts where email like 'b29-%';")"
want "plain RC sees no contacts"    "0" "$(as "$RC" "select count(*) from public.audience_contacts where email like 'b29-%';")"
want "plain admin sees no contacts" "0" "$(as "$PLAINADMIN" "select count(*) from public.audience_contacts where email like 'b29-%';")"
want "NC sees the contact"          "1" "$(as "$NC" "select count(*) from public.audience_contacts where email like 'b29-%';")"
want "Ada (NC and admin) sees it"   "1" "$(as "$ADMIN" "select count(*) from public.audience_contacts where email like 'b29-%';")"

run DENY "$TM" "a plain TM cannot ask for segment counts" "select * from public.audience_segment_counts();"
run DENY "$PLAINADMIN" "a plain admin cannot ask for segment counts" "select * from public.audience_segment_counts();"
run DENY "$TM" "a plain TM cannot use the do-not-email list" "select public.suppress_email('b29-seed@test.example');"

# ── PART B. The people who manage it ───────────────────────────────────
run ALLOW "$NC" "NC adds a contact (address typed in capitals)" \
  "$NEW values ('B29 Nc','B29-NC@Test.Example','donor','supporter','consent','$NC');"
want "the address is stored lower-case" "b29-nc@test.example" \
  "$(raw "select email from public.audience_contacts where full_name='B29 Nc';")"

raw "select public.set_portfolio('$TM','COMMS',true);" >/dev/null
run ALLOW "$TM" "the COMMS seat adds a contact" \
  "$NEW values ('B29 Tm','b29-tm@test.example','church_partner',null,'contract','$TM');"
run DENY "$TM" "a contact cannot be filed under someone else's name" \
  "$NEW values ('B29 y','b29-y@test.example','alumni',null,'consent','$NC');"
run ALLOW "$TM" "the COMMS seat edits a contact" \
  "update public.audience_contacts set organisation='B29 Church' where email='b29-tm@test.example';"
want "the COMMS seat holder is still a TM" "TM" "$(as "$TM" "select public.dir_role();")"

# ── PART C. FIN reads and changes nothing ──────────────────────────────
raw "select public.set_portfolio('$RC','FIN',true);" >/dev/null
want "FIN sees the contacts" "3" "$(as "$RC" "select count(*) from public.audience_contacts where email like 'b29-%';")"
run ALLOW "$RC" "FIN can ask for segment counts" "select * from public.audience_segment_counts();"
run DENY "$RC" "FIN cannot add a contact" \
  "$NEW values ('B29 z','b29-z@test.example','alumni',null,'consent','$RC');"
run DENY "$RC" "FIN cannot edit a contact" \
  "update public.audience_contacts set organisation='x' where email='b29-seed@test.example';"
run DENY "$RC" "FIN cannot delete a contact" \
  "delete from public.audience_contacts where email='b29-seed@test.example';"
run DENY "$RC" "FIN cannot add to the do-not-email list" "select public.suppress_email('b29-seed@test.example');"

# ── PART D. What a contact must carry ──────────────────────────────────
run DENY "$NC" "the same address in capitals is the same contact" \
  "$NEW values ('B29 Dup','B29-NC@TEST.EXAMPLE','donor','friend','consent','$NC');"
run DENY "$NC" "not an email address" \
  "$NEW values ('B29 Bad','not-an-email','alumni',null,'consent','$NC');"
run DENY "$NC" "a donor must have a tier" \
  "$NEW values ('B29 NoTier','b29-nt@test.example','donor',null,'consent','$NC');"
run DENY "$NC" "a tier belongs to donors only" \
  "$NEW values ('B29 Tier','b29-tr@test.example','church_partner','friend','consent','$NC');"
run DENY "$NC" "an unknown tier" \
  "$NEW values ('B29 Gold','b29-g@test.example','donor','gold','consent','$NC');"
run DENY "$NC" "an unknown lawful basis" \
  "$NEW values ('B29 Basis','b29-lb@test.example','alumni',null,'because','$NC');"
run DENY "$NC" "a lawful basis is required" \
  "$NEW values ('B29 NoBasis','b29-nb@test.example','alumni',null,null,'$NC');"
run DENY "$NC" "a blank name" \
  "$NEW values ('  ','b29-bl@test.example','alumni',null,'consent','$NC');"

# ── PART E. Segments outside the Hub ───────────────────────────────────
raw "delete from public.audience_contacts where email like 'b29-%';" >/dev/null
raw "$NEW values
  ('B29 Champion','b29-champ@test.example','donor','champion','consent','$NC'),
  ('B29 InKind','b29-inkind@test.example','donor','in_kind','consent','$NC'),
  ('B29 Supporter','b29-supporter@test.example','donor','supporter','consent','$NC'),
  ('B29 Friend','b29-friend@test.example','donor','friend','consent','$NC'),
  ('B29 Funder','b29-funder@test.example','funder',null,'contract','$NC'),
  ('B29 Church','b29-church@test.example','church_partner',null,'contract','$NC'),
  ('B29 School','b29-school@test.example','school_partner',null,'legitimate_interest','$NC'),
  ('B29 Alum','b29-alum@test.example','alumni',null,'consent','$NC'),
  ('B29 Other','b29-other@test.example','other',null,'consent','$NC');" >/dev/null

want "broadcast donors are Supporters and Friends only" "2/0" "$(seg "$NC" donors_broadcast)"
want "Champions and in-kind donors are the personal segment" "2/0" "$(seg "$NC" donors_personal)"
want "grant funders"   "1/0" "$(seg "$NC" funders)"
want "church partners" "1/0" "$(seg "$NC" church_partners)"
want "school partners" "1/0" "$(seg "$NC" school_partners)"
want "alumni"          "1/0" "$(seg "$NC" alumni)"
want "other contacts"  "1/0" "$(seg "$NC" other_contacts)"
want "the donor broadcast segment is on by default" "t" \
  "$(as "$NC" "select broadcast_default from public.audience_segment_counts() where segment='donors_broadcast';")"
want "the Champions segment is NOT on by default" "f" \
  "$(as "$NC" "select broadcast_default from public.audience_segment_counts() where segment='donors_personal';")"
want "grant funders are NOT on by default" "f" \
  "$(as "$NC" "select broadcast_default from public.audience_segment_counts() where segment='funders';")"

# ── PART F. The do-not-email list ──────────────────────────────────────
run ALLOW "$NC" "NC stops a donor (address typed in capitals)" \
  "select public.suppress_email('B29-Supporter@Test.Example','unsubscribed','asked by phone');"
want "the stop is stored lower-case" "b29-supporter@test.example" \
  "$(raw "select email from public.email_suppressions where email like 'b29-%';")"
want "a blocked address is counted as blocked, not emailable" "1/1" "$(seg "$NC" donors_broadcast)"

run ALLOW "$NC" "stopping the same address again is harmless" \
  "select public.suppress_email('b29-supporter@test.example','manual','second time');"
want "the original reason is kept" "unsubscribed" \
  "$(raw "select reason from public.email_suppressions where email='b29-supporter@test.example';")"

run ALLOW "$NC" "NC deletes the contact (an erasure request)" \
  "delete from public.audience_contacts where email='b29-supporter@test.example';"
want "the stop outlives the contact" "1" \
  "$(raw "select count(*) from public.email_suppressions where email='b29-supporter@test.example';")"
run ALLOW "$NC" "the same person is entered again" \
  "$NEW values ('B29 Supporter Again','b29-supporter@test.example','donor','supporter','consent','$NC');"
want "and is still blocked" "1/1" "$(seg "$NC" donors_broadcast)"

run DENY "$TM" "a COMMS seat holder cannot delete a stop" \
  "delete from public.email_suppressions where email like 'b29-%';"
run DENY "$TM" "a COMMS seat holder cannot edit a stop" \
  "update public.email_suppressions set reason='manual' where email like 'b29-%';"
run DENY "$NC" "NC cannot insert a stop by hand around the function" \
  "insert into public.email_suppressions(email,reason) values ('b29-bypass@test.example','manual');"
run DENY "$NC" "an unknown reason" "select public.suppress_email('b29-r@test.example','because');"
run DENY "$NC" "not an email address" "select public.suppress_email('nonsense');"

want "FIN can read the do-not-email list" "1" \
  "$(as "$RC" "select count(*) from public.email_suppressions where email like 'b29-%';")"
raw "select public.set_portfolio('$TM','COMMS',false);" >/dev/null
want "a plain TM cannot read the do-not-email list" "0" \
  "$(as "$TM" "select count(*) from public.email_suppressions where email like 'b29-%';")"
run DENY "$TM" "a former COMMS holder can no longer stop an address" \
  "select public.suppress_email('b29-late@test.example');"

# ── PART G. People in the Hub ──────────────────────────────────────────
raw "insert into public.directory_members(full_name, profile_id)
     select p.full_name, p.id from public.profiles p
      where p.id in ('$RC','$TM')
        and not exists (select 1 from public.directory_members d where d.profile_id = p.id);" >/dev/null
raw "update public.directory_contacts set email = null;" >/dev/null
raw "insert into public.directory_contacts(member_id,email)
     select id,'b29-rita@test.example' from public.directory_members where profile_id='$RC'
     on conflict (member_id) do update set email = excluded.email;" >/dev/null
raw "insert into public.directory_contacts(member_id,email)
     select id,'b29-tobi@test.example' from public.directory_members where profile_id='$TM'
     on conflict (member_id) do update set email = excluded.email;" >/dev/null
raw "insert into public.volunteer_records(profile_id,status) values ('$TM','active')
     on conflict (profile_id) do update set status='active';" >/dev/null

want "everyone with a login and an email" "2/0" "$(seg "$NC" team_all)"
want "Regional Coordinators"              "1/0" "$(seg "$NC" team_rcs)"
want "active volunteers"                  "1/0" "$(seg "$NC" volunteers_active)"

# A directory card with an email but no Hub login is not somebody to write to here.
raw "insert into public.directory_members(full_name, profile_id) values ('B29 NoLogin', null);" >/dev/null
raw "insert into public.directory_contacts(member_id,email)
     select id,'b29-nologin@test.example' from public.directory_members where full_name='B29 NoLogin'
     on conflict (member_id) do update set email = excluded.email;" >/dev/null
want "a card with no Hub login is not counted" "2/0" "$(seg "$NC" team_all)"

run ALLOW "$NC" "NC stops a team member's address" "select public.suppress_email('b29-tobi@test.example');"
want "a blocked team member is not emailable" "1/1" "$(seg "$NC" team_all)"
want "and drops out of the volunteers" "0/1" "$(seg "$NC" volunteers_active)"
want "the RC segment is untouched" "1/0" "$(seg "$NC" team_rcs)"

raw "update public.volunteer_records set status='inactive' where profile_id='$TM';" >/dev/null
want "an inactive volunteer is not in the volunteer segment" "0/0" "$(seg "$NC" volunteers_active)"

# Tidy.
raw "delete from public.audience_contacts where email like 'b29-%';" >/dev/null
raw "delete from public.email_suppressions where email like 'b29-%';" >/dev/null
raw "delete from public.directory_members where full_name='B29 NoLogin';" >/dev/null
raw "update public.volunteer_records set status='active' where profile_id='$TM';" >/dev/null
raw "select public.set_portfolio('$RC','FIN',false);" >/dev/null

echo ""
echo "  $pass passed, $fail failed"
[ $fail -eq 0 ]
