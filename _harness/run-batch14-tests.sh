#!/bin/bash
# BATCH14-MARKER application-location
# Two things. First, that the public application now stores a country and a
# state, and still works without them. Second, that adding a chapter from
# the app is an admin-only act, that a new chapter is given its messaging
# channel, and that renaming one renames the channel. The chapter rules were
# already in the database; these checks pin the behaviour the new screen
# leans on so it cannot quietly regress.

ADMIN=11111111-1111-1111-1111-111111111111
NC=22222222-2222-2222-2222-222222222222
RC=33333333-3333-3333-3333-333333333333
TM=44444444-4444-4444-4444-444444444444

pass=0; fail=0

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
  if echo "$out" | grep -qE '^(UPDATE|DELETE) 0$|^INSERT 0 0$'; then rc=1; fi
  if [ "$expect" = "DENY" ]; then
    if [ $rc -ne 0 ]; then echo "  ok   refused: $desc"; pass=$((pass+1))
    else echo "  XX   ALLOWED BUT SHOULD BE REFUSED: $desc"; fail=$((fail+1)); fi
  else
    if [ $rc -eq 0 ]; then echo "  ok   allowed: $desc"; pass=$((pass+1))
    else echo "  XX   REFUSED BUT SHOULD BE ALLOWED: $desc"; echo "$out" | grep -i error | head -2 | sed 's/^/       /'; fail=$((fail+1)); fi
  fi
}

echo "COUNTRY AND STATE ON THE APPLICATION"
as "$RC" "select public.submit_volunteer_application(jsonb_build_object('full_name','Test One','email','t1@apply.test','consent_references',true,'country','Nigeria','state','Lagos'));" >/dev/null
want "a country and state are stored as given"        "Nigeria|Lagos" \
  "$(as $NC "select country||'|'||state from volunteer_applications where email='t1@apply.test';")"

as "$RC" "select public.submit_volunteer_application(jsonb_build_object('full_name','Test Two','email','t2@apply.test','consent_references',true));" >/dev/null
want "an application with no location still goes through" "|" \
  "$(as $NC "select coalesce(country,'')||'|'||coalesce(state,'') from volunteer_applications where email='t2@apply.test';")"

as "$RC" "select public.submit_volunteer_application(jsonb_build_object('full_name','Test Three','email','t3@apply.test','consent_references',true,'country','United Kingdom','state','Greater Manchester'));" >/dev/null
want "a free-text region outside Nigeria is stored"   "United Kingdom|Greater Manchester" \
  "$(as $NC "select country||'|'||state from volunteer_applications where email='t3@apply.test';")"

run DENY "$RC" "an application without referee consent is still refused" \
  "select public.submit_volunteer_application(jsonb_build_object('full_name','No Consent','email','t4@apply.test'));"

echo
echo "ADDING A CHAPTER, ADMIN ONLY"
run ALLOW "$ADMIN" "an admin adds a chapter" \
  "insert into chapters (name) values ('Ibadan');"
run DENY  "$RC"    "a coordinator cannot add a chapter" \
  "insert into chapters (name) values ('Sneak RC');"
run DENY  "$TM"    "a team member cannot add a chapter" \
  "insert into chapters (name) values ('Sneak TM');"
want "the new chapter is given its messaging channel"  "Ibadan Chapter" \
  "$(as $ADMIN "select name from channels where kind='chapter' and chapter_id=(select id from chapters where name='Ibadan');")"

echo
echo "RENAMING A CHAPTER"
run ALLOW "$ADMIN" "an admin renames a chapter" \
  "update chapters set name='Ibadan North' where name='Ibadan';"
run DENY  "$RC"    "a coordinator cannot rename a chapter" \
  "update chapters set name='Benin City' where name='Benin';"
want "renaming the chapter renamed its channel"        "Ibadan North Chapter" \
  "$(as $ADMIN "select name from channels where kind='chapter' and chapter_id=(select id from chapters where name='Ibadan North');")"
want "there is still only one channel for that chapter" 1 \
  "$(as $ADMIN "select count(*) from channels where kind='chapter' and chapter_id=(select id from chapters where name='Ibadan North');")"

echo
echo "--------------------------------------------"
echo "passed: $pass   failed: $fail"
[ $fail -eq 0 ] || exit 1
