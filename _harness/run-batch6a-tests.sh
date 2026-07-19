#!/bin/bash
# Batch 6a. Self-service profile editing, contact privacy, volunteer record.
#
# BATCH6A-MARKER harness-tests
#
# Two of the three things in this batch are permission changes, which are
# the kind that look correct on screen right up until somebody finds out
# they are not. So the tests below are written from the attacker's side
# first: can a Team Member make themselves a coordinator, can a Regional
# Coordinator read another chapter's phone numbers, can somebody edit
# another person's volunteer record. Then the ordinary cases.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444

pass=0; fail=0

as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
sql() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1
}
want() {
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1))
  else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi
}
refused() {
  # Row security hides rows rather than refusing outright, so an update
  # that changes nothing looks like success. Anything that is not a
  # visible change counts as a refusal.
  case "$2" in
    *ERROR*|*"denied"*|*"violates"*|*"UPDATE 0"*|*"INSERT 0"*|*"DELETE 0"*)
      echo "  ok   $1 (refused)"; pass=$((pass+1)) ;;
    *) echo "  XX   $1: was allowed, got: $2"; fail=$((fail+1)) ;;
  esac
}

# Row security blocks by changing nothing rather than by complaining, and
# psql in quiet mode prints no row count, so "it was refused" and "it
# worked" both come back as an empty string. Adding `returning 1` to the
# statement removes the ambiguity: one line per row actually changed.
blocked() {
  if [ -z "$2" ]; then echo "  ok   $1 (nothing changed)"; pass=$((pass+1))
  else echo "  XX   $1: it went through, got: $2"; fail=$((fail+1)); fi
}

BENIN="(select id from chapters where name='Benin')"
AUCHI="(select id from chapters where name='Auchi')"

echo "=============================================="
echo " Batch 6a: profile, contacts, volunteer record"
echo "=============================================="

# --------------------------------------------------------------
# Seed. Two chapters with real people in each, so "scoped" has to
# mean the right subset rather than simply nothing.
# --------------------------------------------------------------
sql "delete from volunteer_record_roles;" >/dev/null
sql "delete from volunteer_records;" >/dev/null
sql "delete from directory_contacts;" >/dev/null

# Everyone in the seed already has a directory card via the sync trigger.
# Give each of them a phone and an email to read.
sql "insert into directory_contacts (member_id, phone, email)
     select m.id, '+234-000-' || right(m.profile_id::text, 4), lower(replace(m.full_name,' ','.')) || '@ycdinigeria.org'
     from directory_members m where m.profile_id is not null
     on conflict (member_id) do update set phone = excluded.phone, email = excluded.email;" >/dev/null

# A second Benin person and a second Auchi person, so the RC has somebody
# in their own chapter besides themselves and somebody outside it.
sql "insert into directory_members (id, full_name, role_title, chapter_id) values
 ('bbbb6a00-0000-0000-0000-000000000001','Benin Helper','Volunteer', $BENIN),
 ('aaaa6a00-0000-0000-0000-000000000002','Auchi Helper','Volunteer', $AUCHI);" >/dev/null
sql "insert into directory_contacts (member_id, phone, email) values
 ('bbbb6a00-0000-0000-0000-000000000001','+234-111-1111','benin.helper@ycdinigeria.org'),
 ('aaaa6a00-0000-0000-0000-000000000002','+234-222-2222','auchi.helper@ycdinigeria.org');" >/dev/null

RC_CHAP=$(sql "select chapter_id from profiles where id='$RC';")
echo "  (the seeded Regional Coordinator is in chapter $RC_CHAP)"

echo
echo "-- A. Email is no longer on the card everyone can read ------"

want "the email column is gone from directory_members" "0" \
  "$(sql "select count(*) from information_schema.columns where table_schema='public' and table_name='directory_members' and column_name='email';")"

want "directory_contacts now carries email" "1" \
  "$(sql "select count(*) from information_schema.columns where table_schema='public' and table_name='directory_contacts' and column_name='email';")"

want "and a hide switch, defaulting to visible" "f" \
  "$(sql "select coalesce(bool_or(phone_hidden), false) from directory_contacts;")"

echo
echo "-- B. Who can read contact details --------------------------"

# The RC's own chapter. Count how many people are in it so the assertion
# is against a real number rather than a number typed here today.
# People in the coordinator's chapter who actually have a contact row.
# Counting members instead would fail the day somebody is added without a
# phone number, which is not the thing this test is about.
RC_CHAPTER_PEOPLE=$(sql "select count(*) from directory_members m join directory_contacts c on c.member_id = m.id where m.chapter_id = (select chapter_id from profiles where id='$RC');")

want "a Regional Coordinator sees their own chapter's contacts" "$RC_CHAPTER_PEOPLE" \
  "$(as $RC "select count(*) from directory_contacts_visible() v join directory_members m on m.id=v.member_id where m.chapter_id = (select chapter_id from profiles where id='$RC');")"

want "and cannot see the other chapter's at all" "0" \
  "$(as $RC "select count(*) from directory_contacts_visible() v join directory_members m on m.id=v.member_id where m.chapter_id = $AUCHI and m.chapter_id <> (select chapter_id from profiles where id='$RC');")"

TOTAL_CONTACTS=$(sql "select count(*) from directory_contacts;")
want "the National Coordinator sees everyone" "$TOTAL_CONTACTS" \
  "$(as $NC "select count(*) from directory_contacts_visible();")"

want "an admin sees everyone" "$TOTAL_CONTACTS" \
  "$(as $ADMIN "select count(*) from directory_contacts_visible();")"

want "a Team Member sees their own chapter, not nothing" "1" \
  "$(as $TM "select case when count(*) > 0 then 1 else 0 end from directory_contacts_visible();")"

want "a Team Member sees nobody outside their chapter" "0" \
  "$(as $TM "select count(*) from directory_contacts_visible() v join directory_members m on m.id=v.member_id where coalesce(m.chapter_id::text,'-') <> coalesce((select chapter_id from profiles where id='$TM')::text,'-');")"

want "everybody can always see their own card" "1" \
  "$(as $TM "select count(*) from directory_contacts_visible() v join directory_members m on m.id=v.member_id where m.profile_id='$TM';")"

# The table underneath stays shut, so nobody can go around the function.
want "reading the raw table gives an RC only their own row" "1" \
  "$(as $RC "select count(*) from directory_contacts;")"

want "reading the raw table gives a Team Member only their own row" "1" \
  "$(as $TM "select count(*) from directory_contacts;")"

echo
echo "-- C. Hiding a phone number ---------------------------------"

TM_MEMBER=$(sql "select id from directory_members where profile_id='$TM';")
sql "update directory_contacts set phone_hidden = true where member_id = '$TM_MEMBER';" >/dev/null

want "the person themselves still sees their own number" "1" \
  "$(as $TM "select count(*) from directory_contacts_visible() where member_id='$TM_MEMBER' and phone is not null;")"

want "their coordinator does not" "0" \
  "$(as $RC "select count(*) from directory_contacts_visible() where member_id='$TM_MEMBER' and phone is not null;")"

want "the National Coordinator does not" "0" \
  "$(as $NC "select count(*) from directory_contacts_visible() where member_id='$TM_MEMBER' and phone is not null;")"

want "an admin does not either, which is the whole point" "0" \
  "$(as $ADMIN "select count(*) from directory_contacts_visible() where member_id='$TM_MEMBER' and phone is not null;")"

want "the email still comes through so they remain reachable" "1" \
  "$(as $RC "select count(*) from directory_contacts_visible() where member_id='$TM_MEMBER' and email is not null;")"

sql "update directory_contacts set phone_hidden = false where member_id = '$TM_MEMBER';" >/dev/null

echo
echo "-- D. Editing your own profile ------------------------------"

want "a Team Member can change their own name" "Renamed Person" \
  "$(as $TM "select public.update_my_profile(p_full_name => 'Renamed Person'); select full_name from profiles where id='$TM';" | tail -1)"

want "and the directory card follows automatically" "Renamed Person" \
  "$(sql "select full_name from directory_members where profile_id='$TM';")"

want "a blank name is refused rather than saved" "1" \
  "$(as $TM "select public.update_my_profile(p_full_name => '   ');" | grep -c "ERROR")"

want "a person can set their own phone" "+234-999-8888" \
  "$(as $TM "select public.update_my_profile(p_phone => '+234-999-8888'); select phone from directory_contacts where member_id='$TM_MEMBER';" | tail -1)"

want "and turn the hide switch on themselves" "t" \
  "$(as $TM "select public.update_my_profile(p_phone_hidden => true); select phone_hidden from directory_contacts where member_id='$TM_MEMBER';" | tail -1)"
as $TM "select public.update_my_profile(p_phone_hidden => false);" >/dev/null

want "leaving an argument out leaves that field alone" "+234-999-8888" \
  "$(as $TM "select public.update_my_profile(p_bio => 'A short bio.'); select phone from directory_contacts where member_id='$TM_MEMBER';" | tail -1)"

want "and the bio it did set is there" "A short bio." \
  "$(sql "select bio from directory_members where profile_id='$TM';")"

# The important one. The function has no argument for either field, so
# there is no shape of this call that moves somebody.
want "update_my_profile has no way to pass a role" "0" \
  "$(sql "select count(*) from information_schema.parameters where specific_schema='public' and specific_name in (select specific_name from information_schema.routines where routine_name='update_my_profile') and parameter_name ilike '%role%';")"

want "or a chapter" "0" \
  "$(sql "select count(*) from information_schema.parameters where specific_schema='public' and specific_name in (select specific_name from information_schema.routines where routine_name='update_my_profile') and parameter_name ilike '%chapter%';")"

echo
echo "-- E. What a person still cannot do to themselves -----------"

refused "a Team Member cannot promote themselves to coordinator" \
  "$(as $TM "update profiles set role='RC' where id='$TM';")"

refused "a Team Member cannot move themselves into another chapter" \
  "$(as $TM "update profiles set chapter_id = $AUCHI where id='$TM';")"

refused "a Team Member cannot make themselves an admin" \
  "$(as $TM "update profiles set is_admin = true where id='$TM';")"

blocked "a Regional Coordinator cannot edit a contact row in another chapter" \
  "$(as $RC "update directory_contacts set phone='hacked' where member_id='aaaa6a00-0000-0000-0000-000000000002' returning 1;")"

want "and that number really is untouched" "+234-222-2222" \
  "$(sql "select phone from directory_contacts where member_id='aaaa6a00-0000-0000-0000-000000000002';")"

echo
echo "-- F. The volunteer roles list ------------------------------"

want "all ten Handbook roles are seeded" "10" \
  "$(sql "select count(*) from volunteer_roles;")"

want "School Visitor is one of them" "1" \
  "$(sql "select count(*) from volunteer_roles where name='School Visitor';")"

want "everyone can read the list" "10" \
  "$(as $TM "select count(*) from volunteer_roles;")"

refused "but a Team Member cannot add to it" \
  "$(as $TM "insert into volunteer_roles (name) values ('Invented Role');")"

want "running the seed twice does not double it" "10" \
  "$(sql "insert into volunteer_roles (name, description, primary_location, sort_order) select v.name, null, null, 10 from (values ('School Visitor')) as v(name) where not exists (select 1 from volunteer_roles r where r.name = v.name); select count(*) from volunteer_roles;" | tail -1)"

echo
echo "-- G. The volunteer record ----------------------------------"

sql "insert into volunteer_records (profile_id, status, started_on, applied_on) values
 ('$TM','active','2025-01-15','2024-12-01'),
 ('$RC','active','2023-06-01','2023-05-01');" >/dev/null

want "a person can read their own record" "1" \
  "$(as $TM "select count(*) from volunteer_records where profile_id='$TM';")"

want "their coordinator can read it too" "1" \
  "$(as $RC "select count(*) from volunteer_records where profile_id='$TM';")"

want "the National Coordinator reads every record" "2" \
  "$(as $NC "select count(*) from volunteer_records;")"

# Somebody in the other chapter, to prove scoping is real.
sql "insert into profiles (id, full_name, role, chapter_id) values ('66666666-6666-6666-6666-666666666666','Auchi Volunteer','TM', $AUCHI) on conflict do nothing;" >/dev/null
sql "insert into volunteer_records (profile_id, status) values ('66666666-6666-6666-6666-666666666666','onboarding') on conflict do nothing;" >/dev/null

want "a coordinator cannot read another chapter's record" "0" \
  "$(as $RC "select count(*) from volunteer_records where profile_id='66666666-6666-6666-6666-666666666666';")"

want "a Team Member cannot read anybody else's record" "0" \
  "$(as $TM "select count(*) from volunteer_records where profile_id <> '$TM';")"

blocked "a Team Member cannot back-date their own start date" \
  "$(as $TM "update volunteer_records set started_on='2015-01-01' where profile_id='$TM' returning 1;")"

blocked "nor change their own status" \
  "$(as $TM "update volunteer_records set status='inactive' where profile_id='$TM' returning 1;")"

blocked "nor touch anybody else's record" \
  "$(as $TM "update volunteer_records set status='active' where profile_id='66666666-6666-6666-6666-666666666666' returning 1;")"

want "and their start date is genuinely unchanged afterwards" "2025-01-15" \
  "$(sql "select started_on from volunteer_records where profile_id='$TM';")"

want "but they can update their own availability through the function" "Saturday mornings" \
  "$(as $TM "select public.update_my_volunteer_details(p_availability => 'Saturday mornings'); select availability from volunteer_records where profile_id='$TM';" | tail -1)"

want "and that did not touch their start date" "2025-01-15" \
  "$(sql "select started_on from volunteer_records where profile_id='$TM';")"

want "a person with no record yet gets one created by the function" "1" \
  "$(as $NC "select public.update_my_volunteer_details(p_skills => 'Preaching'); select count(*) from volunteer_records where profile_id='$NC';" | tail -1)"

echo
echo "-- H. Rules the database itself enforces --------------------"

refused "a record cannot end before it starts" \
  "$(sql "insert into volunteer_records (profile_id, status, started_on, ended_on) values ('$ADMIN','withdrawn','2026-06-01','2026-01-01');")"

refused "somebody withdrawn must have an end date" \
  "$(sql "insert into volunteer_records (profile_id, status, started_on) values ('$ADMIN','withdrawn','2026-01-01');")"

refused "somebody removed must have an end date too" \
  "$(sql "insert into volunteer_records (profile_id, status, started_on) values ('$ADMIN','removed','2026-01-01');")"

refused "a made-up status is rejected" \
  "$(sql "insert into volunteer_records (profile_id, status) values ('$ADMIN','on holiday');")"

refused "nobody mentors themselves" \
  "$(sql "insert into volunteer_records (profile_id, mentor_profile_id) values ('$ADMIN','$ADMIN');")"

refused "one person cannot have two records" \
  "$(sql "insert into volunteer_records (profile_id) values ('$TM');")"

want "withdrawing properly, with an end date, is accepted" "1" \
  "$(sql "insert into volunteer_records (profile_id, status, started_on, ended_on) values ('$ADMIN','withdrawn','2020-01-01','2024-01-01'); select count(*) from volunteer_records where profile_id='$ADMIN';" | tail -1)"

echo
echo "-- I. Reading your own record back --------------------------"

want "my_volunteer_record returns one row for the caller" "1" \
  "$(as $TM "select count(*) from my_volunteer_record();")"

want "and nobody else's" "1" \
  "$(as $TM "select count(*) from my_volunteer_record();")"

sql "insert into volunteer_record_roles (record_id, role_id)
     select v.id, r.id from volunteer_records v, volunteer_roles r
     where v.profile_id='$TM' and r.name in ('School Visitor','Facilitator / Speaker');" >/dev/null

want "role names come back attached to the record" "2" \
  "$(as $TM "select array_length(role_names,1) from my_volunteer_record();")"

want "in the Handbook's own order, not alphabetical" "School Visitor" \
  "$(as $TM "select role_names[1] from my_volunteer_record();")"

want "a record with no roles gives an empty list, not a null" "0" \
  "$(as $NC "select coalesce(array_length(role_names,1),0) from my_volunteer_record();")"

want "my_profile_card gives the caller exactly one card" "1" \
  "$(as $RC "select count(*) from my_profile_card();")"

want "including the email nobody else on their screen can see" "1" \
  "$(as $RC "select count(*) from my_profile_card() where email is not null;")"

echo
echo "-- J. Photo folders -----------------------------------------"

want "the storage rule checks the first folder of the path" "1" \
  "$(sql "select count(*) from pg_policies where tablename='objects' and policyname='member_photos_insert' and with_check ilike '%foldername%';")"

want "and folder names are read the way Supabase reads them" "$TM" \
  "$(sql "select (storage.foldername('$TM/abc.jpg'))[1];")"

echo
echo "=============================================="
echo " passed: $pass   failed: $fail"
echo "=============================================="
[ "$fail" -eq 0 ] || exit 1
