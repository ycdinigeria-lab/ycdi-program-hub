#!/bin/bash
# Each case runs as the "authenticated" role with a pretend signed-in
# account, so the real row rules apply exactly as they would in the app.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444
NEW=55555555-5555-5555-5555-555555555555

pass=0; fail=0

# run <expect: ALLOW|DENY> <uid> <description> <sql>
run() {
  local expect="$1" uid="$2" desc="$3" sql="$4"
  local out
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1)
  local rc=$?
  # Row rules hide rows rather than raising. An update or delete that
  # matched nothing is a refusal, even though psql reports success.
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$'; then rc=1; fi
  if [ "$expect" = "DENY" ]; then
    if [ $rc -ne 0 ]; then
      echo "  ok   refused: $desc"; pass=$((pass+1))
    else
      echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $desc"; fail=$((fail+1))
    fi
  else
    if [ $rc -eq 0 ]; then
      echo "  ok   allowed: $desc"; pass=$((pass+1))
    else
      echo "  XX   REFUSED BUT SHOULD BE ALLOWED: $desc"
      echo "$out" | head -3 | sed 's/^/       /'
      fail=$((fail+1))
    fi
  fi
}

# rows <uid> <sql> -> prints count
rows() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>/dev/null
}

echo "PRIVILEGE ESCALATION"
run DENY  "$TM"  "team member makes themselves an admin" \
  "update public.profiles set is_admin = true where id = '$TM';"
run DENY  "$TM"  "team member promotes themselves to National Coordinator" \
  "update public.profiles set role = 'NC' where id = '$TM';"
run DENY  "$RC"  "coordinator moves themselves to another chapter" \
  "update public.profiles set chapter_id = (select id from chapters where name='Lagos') where id = '$RC';"
run DENY  "$NEW" "unapproved signup creates their own admin profile" \
  "insert into public.profiles (id, full_name, role, is_admin) values ('$NEW','Nkem Newbie','NC',true);"
run DENY  "$NC"  "non-admin National Coordinator grants themselves admin" \
  "update public.profiles set is_admin = true where id = '$NC';"
run ALLOW "$TM"  "member edits their own name" \
  "update public.profiles set full_name = 'Tobi Teammate' where id = '$TM';"
run DENY  "$TM"  "member edits somebody else's name" \
  "update public.profiles set full_name = 'Hacked' where id = '$RC';"

echo
echo "PROGRAMMES"
run DENY  "$RC" "coordinator approves their own pending programme" \
  "update public.programs set status='Approved' where id='aaaaaaaa-0000-0000-0000-000000000003';"
run DENY  "$RC" "coordinator edits another chapter's programme" \
  "update public.programs set students=999 where id='aaaaaaaa-0000-0000-0000-000000000002';"
run DENY  "$RC" "coordinator writes a review comment" \
  "update public.programs set nc_comment='approved by me' where id='aaaaaaaa-0000-0000-0000-000000000001';"
run ALLOW "$RC" "coordinator edits their own chapter's programme" \
  "update public.programs set students=45 where id='aaaaaaaa-0000-0000-0000-000000000001';"
run ALLOW "$RC" "coordinator marks their approved programme complete" \
  "update public.programs set status='Complete' where id='aaaaaaaa-0000-0000-0000-000000000001';"
run DENY  "$TM" "team member submits a programme" \
  "insert into public.programs (title, chapter_id, status) values ('Sneaky',(select id from chapters where name='Benin'),'Pending');"
run DENY  "$NC" "non-admin National Coordinator approves a programme" \
  "update public.programs set status='Approved' where id='aaaaaaaa-0000-0000-0000-000000000002';"
run ALLOW "$ADMIN" "admin approves a programme" \
  "select public.approve_program('aaaaaaaa-0000-0000-0000-000000000002');"

echo
echo "SIGN-UP APPROVAL"
run DENY  "$NC" "non-admin National Coordinator approves a sign-up" \
  "select public.approve_signup('$NEW','TM',(select id from chapters where name='Auchi'));"
run ALLOW "$ADMIN" "admin approves a sign-up as Team Member" \
  "select public.approve_signup('$NEW','TM',(select id from chapters where name='Auchi'));"

echo
echo "READ ACCESS"
echo "  pending sign-ups visible to non-admin NC: $(rows "$NC" 'select count(*) from public.pending_signups;') (want 0)"
echo "  pending sign-ups visible to admin:        $(rows "$ADMIN" 'select count(*) from public.pending_signups;')"
echo "  phone numbers visible to team member:     $(rows "$TM" 'select count(*) from public.directory_contacts;') (want 0)"
echo "  phone numbers visible to coordinator:     $(rows "$RC" 'select count(*) from public.directory_contacts;')"
echo "  NC-only doc categories seen by team member: $(rows "$TM" "select count(*) from public.document_categories where nc_only;") (want 0)"
echo "  NC-only doc categories seen by admin:       $(rows "$ADMIN" "select count(*) from public.document_categories where nc_only;")"

echo
echo "DIRECTORY AUTO-SYNC"
echo "  directory card created for the new Team Member: $(rows "$ADMIN" "select count(*) from public.directory_members where profile_id='$NEW';") (want 1)"
echo "  their role title carried across:                $(rows "$ADMIN" "select coalesce(role_title,'-') from public.directory_members where profile_id='$NEW';")"
echo "  their phone filed privately:                    $(rows "$ADMIN" "select coalesce(phone,'-') from public.directory_contacts c join public.directory_members m on m.id=c.member_id where m.profile_id='$NEW';")"

echo
echo "DOCUMENTS"
run DENY  "$TM"    "team member creates a document category" \
  "insert into public.document_categories (name) values ('Sneaky');"
run DENY  "$NC"    "non-admin National Coordinator creates a category" \
  "insert into public.document_categories (name) values ('Sneaky');"
run ALLOW "$ADMIN" "admin creates a category" \
  "insert into public.document_categories (name) values ('Training Materials');"

echo
echo "MESSAGING"
run ALLOW "$TM"  "team member posts in General" \
  "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='general'),'$TM','hello');"
run DENY  "$TM"  "team member posts into another chapter's channel" \
  "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='chapter' and chapter_id=(select id from chapters where name='Lagos')),'$TM','hello');"
run DENY  "$TM"  "team member posts as somebody else" \
  "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='general'),'$RC','not me');"
echo "  channels visible to Benin team member: $(rows "$TM" 'select count(*) from public.channels;') (General + Benin = 2)"
echo "  channels visible to admin:             $(rows "$ADMIN" 'select count(*) from public.channels;')"

echo
echo "CHANNEL VISIBILITY"
echo "  channels visible to non-admin NC:      $(rows "$NC" 'select count(*) from public.channels;') (want all 6)"
run ALLOW "$NC" "National Coordinator posts in a chapter channel" \
  "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='chapter' and chapter_id=(select id from chapters where name='Benin')),'$NC','visiting');"
run DENY  "$TM" "team member reads another chapter's channel" \
  "insert into public.messages (channel_id, sender_id, body) values ((select id from channels where kind='chapter' and chapter_id=(select id from chapters where name='Auchi')),'$TM','hello');"

echo
echo "DIRECT MESSAGE PRIVACY"
su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$RC'; select public.start_dm('$TM');\"" >/dev/null 2>&1
su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$RC'; insert into public.messages (channel_id, sender_id, body) select id, '$RC', 'private note' from public.channels where kind='dm' limit 1;\"" >/dev/null 2>&1
echo "  DM messages readable by the two people: $(rows "$RC" "select count(*) from public.messages m join public.channels c on c.id=m.channel_id where c.kind='dm';") (want 1)"
echo "  DM messages readable by admin:         $(rows "$ADMIN" "select count(*) from public.messages m join public.channels c on c.id=m.channel_id where c.kind='dm';") (want 0)"
echo "  DM messages readable by NC:            $(rows "$NC" "select count(*) from public.messages m join public.channels c on c.id=m.channel_id where c.kind='dm';") (want 0)"

echo
echo "LAST ADMIN PROTECTION"
run DENY "$ADMIN" "the only admin removes their own admin access" \
  "select public.set_admin('$ADMIN', false);"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
