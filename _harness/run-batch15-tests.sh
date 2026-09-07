#!/bin/bash
# BATCH15-MARKER announcement-social
# Proves the rules behind reactions and comments on announcements.
#
# The spine of it: reactions and comments inherit the announcement's own
# visibility. Someone in Benin must not read, react to, or comment on an
# Auchi-only notice, and must not even see the reactions or comments that
# hang off it. Everyone can act on general notices. People own their own
# reactions and comments; the NC and admins can moderate any comment.
#
# Every rule is checked from both sides: a case that must be allowed and a
# case that must be refused, so a policy that is too loose or too tight
# fails here rather than in front of a coordinator.

ADMIN=11111111-1111-1111-1111-111111111111   # Ada Admin  (NC + is_admin)
NC=22222222-2222-2222-2222-222222222222       # Ngozi NC   (plain NC, not admin)
RC=33333333-3333-3333-3333-333333333333       # Rita RC    (Benin)
TM=44444444-4444-4444-4444-444444444444       # Tobi TM    (Benin)
SAM=66666666-6666-6666-6666-666666666666      # Sam        (admin only, role TM, no chapter)

GEN=a1111111-1111-1111-1111-111111111111      # general announcement
BEN=a2222222-2222-2222-2222-222222222222      # Benin-only announcement
AUC=a3333333-3333-3333-3333-333333333333      # Auchi-only announcement

pass=0; fail=0

# run as postgres superuser, bypassing RLS, for seeding fixtures
raw() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"$1\"" 2>&1
}
# run as a signed-in user with a given uid
as() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set role authenticated; set test.uid = '$1'; $2\"" 2>&1
}
want() {
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1))
  else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi
}
run() {
  local expect="$1" uid="$2" desc="$3" sql="$4" out rc
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -c \"set role authenticated; set test.uid = '$uid'; $sql\"" 2>&1)
  rc=$?
  # RLS blocks a delete/update silently by touching zero rows; treat that as a refusal.
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$expect" = "DENY" ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $desc"; pass=$((pass+1))
    else echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $desc"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $desc"; pass=$((pass+1))
    else echo "  XX   REFUSED BUT SHOULD BE ALLOWED: $desc"; echo "$out" | grep -i error | head -2 | sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

# --------------------------------------------------------------
# Fixtures (seeded as superuser, so RLS does not get in the way)
# --------------------------------------------------------------
raw "insert into auth.users (id, email) values ('$SAM','sam@ycdi.test') on conflict do nothing;" >/dev/null
raw "insert into public.profiles (id, full_name, role, chapter_id, is_admin)
     values ('$SAM','Sam Sysadmin','TM', null, true) on conflict (id) do nothing;" >/dev/null

raw "insert into public.announcements (id, title, body, scope, chapter_id, created_by, author_name) values
      ('$GEN','General notice','for all','general', null, '$NC','Ngozi NC'),
      ('$BEN','Benin notice','benin only','chapter',(select id from public.chapters where name='Benin'),'$RC','Rita RC'),
      ('$AUC','Auchi notice','auchi only','chapter',(select id from public.chapters where name='Auchi'),'$NC','Ngozi NC')
     on conflict (id) do nothing;" >/dev/null

# one comment on each announcement, so visibility can be measured
raw "insert into public.announcement_comments (id, announcement_id, created_by, author_name, body) values
      ('c1111111-1111-1111-1111-111111111111','$GEN','$RC','Rita RC','on the general one'),
      ('c2222222-2222-2222-2222-222222222222','$BEN','$TM','Tobi TeamMate','on the benin one'),
      ('c3333333-3333-3333-3333-333333333333','$AUC','$NC','Ngozi NC','on the auchi one')
     on conflict (id) do nothing;" >/dev/null

# reactions seeded so their visibility and ownership can be measured
raw "insert into public.announcement_reactions (id, announcement_id, user_id, reaction) values
      ('d1111111-1111-1111-1111-111111111111','$AUC','$NC','pray'),
      ('d2222222-2222-2222-2222-222222222222','$GEN','$NC','love')
     on conflict (id) do nothing;" >/dev/null

# throwaway comments used only by the delete tests below
raw "insert into public.announcement_comments (id, announcement_id, created_by, author_name, body) values
      ('cd111111-1111-1111-1111-111111111111','$GEN','$TM','Tobi TeamMate','delete-own target'),
      ('cd222222-2222-2222-2222-222222222222','$GEN','$RC','Rita RC','delete-other target'),
      ('cd333333-3333-3333-3333-333333333333','$GEN','$RC','Rita RC','nc-moderation target'),
      ('cd444444-4444-4444-4444-444444444444','$GEN','$RC','Rita RC','admin-moderation target')
     on conflict (id) do nothing;" >/dev/null

echo "COMMENT VISIBILITY (follows the announcement)"
want "a Benin team member reads the general comment"        1 \
  "$(as $TM "select count(*) from announcement_comments where id='c1111111-1111-1111-1111-111111111111';")"
want "a Benin team member reads their own chapter comment"  1 \
  "$(as $TM "select count(*) from announcement_comments where id='c2222222-2222-2222-2222-222222222222';")"
want "a Benin team member CANNOT read an Auchi comment"     0 \
  "$(as $TM "select count(*) from announcement_comments where id='c3333333-3333-3333-3333-333333333333';")"
want "a Benin coordinator CANNOT read an Auchi comment"     0 \
  "$(as $RC "select count(*) from announcement_comments where id='c3333333-3333-3333-3333-333333333333';")"
want "the National Coordinator reads the Auchi comment"     1 \
  "$(as $NC "select count(*) from announcement_comments where id='c3333333-3333-3333-3333-333333333333';")"

echo
echo "REACTION VISIBILITY (follows the announcement)"
want "a Benin team member sees the general reaction"        1 \
  "$(as $TM "select count(*) from announcement_reactions where id='d2222222-2222-2222-2222-222222222222';")"
want "a Benin team member CANNOT see an Auchi reaction"     0 \
  "$(as $TM "select count(*) from announcement_reactions where id='d1111111-1111-1111-1111-111111111111';")"
want "the National Coordinator sees the Auchi reaction"     1 \
  "$(as $NC "select count(*) from announcement_reactions where id='d1111111-1111-1111-1111-111111111111';")"

echo
echo "POSTING A COMMENT"
run ALLOW "$TM" "a team member comments on a general notice" \
  "insert into announcement_comments (announcement_id, created_by, author_name, body) values ('$GEN','$TM','Tobi','hello');"
run ALLOW "$TM" "a team member comments on their own chapter notice" \
  "insert into announcement_comments (announcement_id, created_by, author_name, body) values ('$BEN','$TM','Tobi','hi benin');"
run DENY  "$TM" "a team member cannot comment on an Auchi notice they cannot see" \
  "insert into announcement_comments (announcement_id, created_by, author_name, body) values ('$AUC','$TM','Tobi','sneaking in');"
run DENY  "$TM" "a team member cannot post a comment under someone else's name" \
  "insert into announcement_comments (announcement_id, created_by, author_name, body) values ('$GEN','$NC','Ngozi','spoofed');"

echo
echo "COMMENTS CANNOT BE EDITED (delete-only)"
run DENY  "$TM" "nobody can edit a comment, not even their own" \
  "update announcement_comments set body='changed' where id='cd111111-1111-1111-1111-111111111111';"

echo
echo "DELETING A COMMENT"
run DENY  "$TM" "a team member cannot delete another person's comment" \
  "delete from announcement_comments where id='cd222222-2222-2222-2222-222222222222';"
run ALLOW "$TM" "a team member deletes their own comment" \
  "delete from announcement_comments where id='cd111111-1111-1111-1111-111111111111';"
run ALLOW "$NC" "a plain National Coordinator moderates any comment" \
  "delete from announcement_comments where id='cd333333-3333-3333-3333-333333333333';"
run ALLOW "$SAM" "an admin who is not the NC moderates any comment" \
  "delete from announcement_comments where id='cd444444-4444-4444-4444-444444444444';"

echo
echo "POSTING A REACTION"
run ALLOW "$TM" "a team member reacts to a general notice" \
  "insert into announcement_reactions (announcement_id, user_id, reaction) values ('$GEN','$TM','like');"
run DENY  "$TM" "the same reaction twice is refused" \
  "insert into announcement_reactions (announcement_id, user_id, reaction) values ('$GEN','$TM','like');"
run ALLOW "$TM" "a different reaction on the same notice is fine" \
  "insert into announcement_reactions (announcement_id, user_id, reaction) values ('$GEN','$TM','pray');"
run DENY  "$TM" "a reaction outside the fixed set is refused" \
  "insert into announcement_reactions (announcement_id, user_id, reaction) values ('$GEN','$TM','thumbsdown');"
run DENY  "$TM" "a team member cannot react to an Auchi notice they cannot see" \
  "insert into announcement_reactions (announcement_id, user_id, reaction) values ('$AUC','$TM','like');"
run DENY  "$TM" "a team member cannot react under someone else's name" \
  "insert into announcement_reactions (announcement_id, user_id, reaction) values ('$GEN','$NC','like');"

echo
echo "REMOVING A REACTION"
run DENY  "$TM" "a team member cannot remove another person's reaction" \
  "delete from announcement_reactions where id='d2222222-2222-2222-2222-222222222222';"
run ALLOW "$TM" "a team member removes their own reaction (the toggle off)" \
  "delete from announcement_reactions where announcement_id='$GEN' and user_id='$TM' and reaction='like';"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
