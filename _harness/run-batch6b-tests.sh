#!/bin/bash
# Batch 6b. Audit log and volunteer register.
#
# BATCH6B-MARKER harness-tests
#
# The audit log is only worth anything if two things are true: it cannot
# be rewritten, and it does not become a second copy of the safeguarding
# file. Both are tested from the attacking side first. Then the register,
# which mostly has to prove it is scoped the same way as the table it
# reads and that it lists people who are not on it yet.
#
# Run with:
#   EXTRA="batch1-notifications.sql batch2-participants.sql \
#          batch3-safeguarding.sql batch4b-participant-satisfaction.sql \
#          batch5-kpi-exports.sql batch5b-kpi-chapter-scope.sql \
#          batch6a-profile-and-volunteer-record.sql \
#          batch6b-audit-log-and-volunteer-register.sql" _harness/setup.sh
#   bash _harness/run-batch6b-tests.sh

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
# Role, chapter and admin-rights changes are not something a signed-in
# account can do directly: batch0b revoked update on profiles from
# `authenticated` except for full_name, so every privileged write in this
# app goes through a security definer function running as the owner with
# the caller's identity still set. This helper reproduces that, which is
# the path the audit trigger has to survive.
asdefiner() {
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -tAq -c \"set test.uid = '$1'; $2\"" 2>&1
}
want() {
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1))
  else echo "  XX   $1: wanted $2, got $3"; fail=$((fail+1)); fi
}
refused() {
  case "$2" in
    *ERROR*|*"denied"*|*"violates"*|*"UPDATE 0"*|*"INSERT 0"*|*"DELETE 0"*)
      echo "  ok   $1 (refused)"; pass=$((pass+1)) ;;
    *) echo "  XX   $1: was allowed, got: $2"; fail=$((fail+1)) ;;
  esac
}
# Row security blocks by changing nothing rather than by complaining, and
# psql in quiet mode prints no row count. `returning 1` removes the
# ambiguity: one line per row actually changed.
blocked() {
  if [ -z "$2" ]; then echo "  ok   $1 (nothing changed)"; pass=$((pass+1))
  else echo "  XX   $1: it went through, got: $2"; fail=$((fail+1)); fi
}
contains() {
  case "$3" in
    *"$2"*) echo "  ok   $1"; pass=$((pass+1)) ;;
    *) echo "  XX   $1: wanted something containing '$2', got: $3"; fail=$((fail+1)) ;;
  esac
}
lacks() {
  case "$3" in
    *"$2"*) echo "  XX   $1: found '$2' where it should not be, in: $3"; fail=$((fail+1)) ;;
    *) echo "  ok   $1"; pass=$((pass+1)) ;;
  esac
}

BENIN="(select id from chapters where name='Benin')"
AUCHI="(select id from chapters where name='Auchi')"

echo "=============================================="
echo " Batch 6b: audit log and volunteer register"
echo "=============================================="

sql "delete from volunteer_record_roles;" >/dev/null
sql "delete from volunteer_records;" >/dev/null

# The log is not cleared between sections, because it cannot be. Every
# count below is taken as a change since a marker rather than as a total,
# which is the only honest way to test a table that refuses to forget.
mark() { sql "select coalesce(max(id),0) from audit_log;"; }

echo
echo "-- A. The log cannot be rewritten ---------------------------"

# Something to try to tamper with.
M=$(mark)
asdefiner $ADMIN "update profiles set role='RC' where id='$TM';" >/dev/null
asdefiner $ADMIN "update profiles set role='TM' where id='$TM';" >/dev/null

want "the two role changes were recorded" "2" \
  "$(sql "select count(*) from audit_log where id > $M;")"
ENTRIES=$(sql "select count(*) from audit_log;")

refused "an admin cannot change an entry" \
  "$(as $ADMIN "update audit_log set actor_name='Somebody Else' where id = (select min(id) from audit_log);")"

refused "the National Coordinator cannot change one either" \
  "$(as $NC "update audit_log set action='nothing_happened' where id = (select min(id) from audit_log);")"

refused "nobody can delete an entry" \
  "$(as $ADMIN "delete from audit_log where id = (select min(id) from audit_log);")"

# The trigger is the belt to row security's braces. Row security does not
# apply to the table owner, and every writer is a definer function running
# as the owner, so this is the rule that actually holds.
refused "not even the owner, bypassing row security entirely" \
  "$(sql "update audit_log set action='rewritten';")"

refused "and the owner cannot delete either" \
  "$(sql "delete from audit_log;")"

# A row-level guard only fires once there is a row to fire on, so a
# delete that matches nothing would come back reporting success and read
# as though the log can be deleted from. The statement-level guard is
# what makes this one refuse.
refused "a delete that would have matched nothing is still refused" \
  "$(sql "delete from audit_log where id = -1;")"

want "the entries are all still there afterwards" "$ENTRIES" \
  "$(sql "select count(*) from audit_log;")"

refused "nobody can write a made-up entry by hand" \
  "$(as $ADMIN "insert into audit_log (entity, action) values ('profile','invented');")"

want "the authenticated role has no insert right at all" "f" \
  "$(sql "select has_table_privilege('authenticated','public.audit_log','INSERT');")"

echo
echo "-- B. Who can read the log ----------------------------------"

want "an admin reads it" "$ENTRIES" "$(as $ADMIN "select count(*) from audit_log;")"
want "the National Coordinator reads it" "$ENTRIES" "$(as $NC "select count(*) from audit_log;")"
want "a Regional Coordinator reads nothing" "0" "$(as $RC "select count(*) from audit_log;")"
want "a Team Member reads nothing" "0" "$(as $TM "select count(*) from audit_log;")"

echo
echo "-- C. Access changes are recorded ---------------------------"

M=$(mark)
asdefiner $ADMIN "update profiles set role='RC' where id='$TM';" >/dev/null
want "a role change is recorded once" "1" \
  "$(sql "select count(*) from audit_log where id > $M and action='role_changed';")"
want "with the old role" "TM" \
  "$(sql "select old_value from audit_log where id > $M and action='role_changed';")"
want "and the new one" "RC" \
  "$(sql "select new_value from audit_log where id > $M and action='role_changed';")"
want "and who did it" "Ada Admin" \
  "$(sql "select actor_name from audit_log where id > $M and action='role_changed';")"
want "and who it was done to" "Tobi TeamMate" \
  "$(sql "select subject_name from audit_log where id > $M and action='role_changed';")"

M=$(mark)
asdefiner $ADMIN "update profiles set full_name='Tobi Renamed' where id='$TM';" >/dev/null
want "a name change records nothing, because it is not an access change" "0" \
  "$(sql "select count(*) from audit_log where id > $M;")"
asdefiner $ADMIN "update profiles set full_name='Tobi TeamMate' where id='$TM';" >/dev/null

M=$(mark)
asdefiner $ADMIN "update profiles set chapter_id=$AUCHI where id='$TM';" >/dev/null
want "a chapter move is recorded with chapter names, not ids" "Benin" \
  "$(sql "select old_value from audit_log where id > $M and action='chapter_changed';")"
want "and the chapter moved to" "Auchi" \
  "$(sql "select new_value from audit_log where id > $M and action='chapter_changed';")"

M=$(mark)
asdefiner $ADMIN "update profiles set is_admin=true where id='$TM';" >/dev/null
want "admin rights being granted is its own action" "1" \
  "$(sql "select count(*) from audit_log where id > $M and action='admin_granted';")"
M=$(mark)
asdefiner $ADMIN "update profiles set is_admin=false where id='$TM';" >/dev/null
want "and being taken away is a different one" "1" \
  "$(sql "select count(*) from audit_log where id > $M and action='admin_removed';")"

# Put things back.
asdefiner $ADMIN "update profiles set role='TM', chapter_id=$BENIN where id='$TM';" >/dev/null

echo
echo "-- D. Safeguarding: what moved, never what it says ----------"

sql "insert into safeguarding_incidents (id, reference, chapter_id, scenario, occurred_on, reported_by, account, child_description, child_age_band, location)
     values ('cccc6b00-0000-0000-0000-000000000001','SG-TEST-001', $BENIN, 'disclosure', current_date, '$RC',
             'A child said something extremely private that must never leave the case file.',
             'Tall girl in a red uniform', '13-15', 'Behind the school hall');" >/dev/null

want "raising an incident is recorded" "1" \
  "$(sql "select count(*) from audit_log where action='incident_raised';")"
want "by its reference" "SG-TEST-001" \
  "$(sql "select entity_id from audit_log where action='incident_raised';")"

ALL_TEXT=$(sql "select coalesce(string_agg(coalesce(detail,'') || ' ' || coalesce(old_value,'') || ' ' || coalesce(new_value,'') || ' ' || coalesce(entity_id,''), ' '), '') from audit_log where entity='safeguarding';")

lacks "the child's account is not in the log" "extremely private" "$ALL_TEXT"
lacks "nor the child's description" "red uniform" "$ALL_TEXT"
lacks "nor the age band" "13-15" "$ALL_TEXT"
lacks "nor where it happened" "school hall" "$ALL_TEXT"
contains "but the scenario is, because it is a category not a detail" "disclosure" "$ALL_TEXT"

sql "update safeguarding_incidents set status='Referred', referred_to='State Ministry', referred_at=now() where reference='SG-TEST-001';" >/dev/null
want "a status move is recorded" "Open" \
  "$(sql "select old_value from audit_log where action='status_changed' and entity='safeguarding';")"
want "and the referral separately" "1" \
  "$(sql "select count(*) from audit_log where action='referred';")"

sql "update safeguarding_incidents set accused_suspended=true where reference='SG-TEST-001';" >/dev/null
want "a suspension is recorded" "1" \
  "$(sql "select count(*) from audit_log where action='suspension_applied';")"

sql "update safeguarding_incidents set status='Closed', closed_at=now(), outcome='A private outcome nobody outside the case should read.' where reference='SG-TEST-001';" >/dev/null
want "closing is recorded" "1" \
  "$(sql "select count(*) from audit_log where action='incident_closed';")"

lacks "and the outcome text is still not in the log" "private outcome" \
  "$(sql "select coalesce(string_agg(coalesce(detail,''),' '),'') from audit_log where entity='safeguarding';")"

sql "insert into incident_actions (incident_id, action, detail, taken_by)
     values ('cccc6b00-0000-0000-0000-000000000001','Contacted the parents','Long private notes about the family.','$RC');" >/dev/null
want "an action logged against an incident is recorded" "Contacted the parents" \
  "$(sql "select detail from audit_log where action='action_logged';")"
lacks "but not the free-text notes attached to it" "private notes" \
  "$(sql "select coalesce(string_agg(coalesce(detail,''),' '),'') from audit_log where action='action_logged';")"

echo
echo "-- E. KPI targets -------------------------------------------"

sql "insert into kpi_targets (financial_year, kpi_key, annual_target, baseline) values (2026,'students_reached',1200,800);" >/dev/null
want "setting a target is recorded" "1" \
  "$(sql "select count(*) from audit_log where action='target_set';")"
want "keyed by year and KPI together" "2026:students_reached" \
  "$(sql "select entity_id from audit_log where action='target_set';")"

sql "update kpi_targets set annual_target=900 where financial_year=2026 and kpi_key='students_reached';" >/dev/null
want "moving a target records what it was" "1200" \
  "$(sql "select old_value from audit_log where action='target_changed';")"
want "and what it became" "900" \
  "$(sql "select new_value from audit_log where action='target_changed';")"

sql "update kpi_targets set note='just a note' where financial_year=2026 and kpi_key='students_reached';" >/dev/null
want "editing only the note records nothing, because nothing moved" "1" \
  "$(sql "select count(*) from audit_log where action='target_changed';")"

sql "delete from kpi_targets where financial_year=2026 and kpi_key='students_reached';" >/dev/null
want "removing a target is recorded" "1" \
  "$(sql "select count(*) from audit_log where action='target_removed';")"

echo
echo "-- F. Volunteer status, including deactivation --------------"

sql "insert into volunteer_records (profile_id, status, started_on) values ('$TM','onboarding','2025-01-15');" >/dev/null
want "creating a record is recorded" "1" \
  "$(sql "select count(*) from audit_log where action='record_created';")"

as $RC "update volunteer_records set status='active' where profile_id='$TM';" >/dev/null
want "activation is recorded, with the coordinator's name on it" "Rita RC" \
  "$(sql "select actor_name from audit_log where entity='volunteer' and action='status_changed';")"

as $RC "update volunteer_records set status='inactive' where profile_id='$TM';" >/dev/null
want "deactivation is recorded too" "1" \
  "$(sql "select count(*) from audit_log where entity='volunteer' and new_value='inactive';")"

as $RC "update volunteer_records set availability='Saturdays' where profile_id='$TM';" >/dev/null
want "changing availability records nothing, because it is not a status" "2" \
  "$(sql "select count(*) from audit_log where entity='volunteer' and action='status_changed';")"

sql "insert into volunteer_records (profile_id, status) values ('$RC','active') on conflict do nothing;" >/dev/null
sql "update volunteer_records set started_on='2023-01-01' where profile_id='$RC';" >/dev/null
as $ADMIN "update volunteer_records set mentor_profile_id='$RC' where profile_id='$TM';" >/dev/null
want "assigning a mentor is recorded by name" "Rita RC" \
  "$(sql "select new_value from audit_log where action='mentor_changed';")"

echo
echo "-- G. Nobody is blamed for a change made by a script --------"

# Nobody signed in. The old behaviour would have been to leave the actor
# blank, which reads as though the entry itself is broken.
sql "set test.uid = ''; update profiles set role='RC' where id='$TM';" >/dev/null
want "a change with nobody signed in is labelled honestly" "System" \
  "$(sql "select actor_name from audit_log where action='role_changed' order by id desc limit 1;")"
sql "update profiles set role='TM' where id='$TM';" >/dev/null

echo
echo "-- H. The volunteer register --------------------------------"

TOTAL_PEOPLE=$(sql "select count(*) from profiles;")
want "the National Coordinator sees everybody, record or not" "$TOTAL_PEOPLE" \
  "$(as $NC "select count(*) from volunteer_register();")"

want "an admin sees everybody too" "$TOTAL_PEOPLE" \
  "$(as $ADMIN "select count(*) from volunteer_register();")"

BENIN_PEOPLE=$(sql "select count(*) from profiles where chapter_id = $BENIN;")
want "a Regional Coordinator sees only their own chapter" "$BENIN_PEOPLE" \
  "$(as $RC "select count(*) from volunteer_register();")"

want "and nobody from another chapter appears in it" "0" \
  "$(as $RC "select count(*) from volunteer_register() where chapter_id is distinct from (select chapter_id from profiles where id='$RC');")"

want "a Team Member sees nobody at all" "0" \
  "$(as $TM "select count(*) from volunteer_register();")"

# The whole reason the function left-joins rather than selecting from
# volunteer_records. Without this, a coordinator opening the register on
# day one sees an empty page and has no way to add the first person.
NO_RECORD=$(as $NC "select count(*) from volunteer_register() where status is null;")
want "people with no record yet are listed, which is the point" "1" \
  "$(if [ "$NO_RECORD" -gt 0 ]; then echo 1; else echo 0; fi)"

want "somebody with a record has their status attached" "inactive" \
  "$(as $NC "select status from volunteer_register() where profile_id='$TM';")"

want "and their mentor's name, not just an id" "Rita RC" \
  "$(as $NC "select mentor_name from volunteer_register() where profile_id='$TM';")"

sql "insert into volunteer_record_roles (record_id, role_id)
     select v.id, r.id from volunteer_records v, volunteer_roles r
     where v.profile_id='$TM' and r.name in ('School Visitor','Facilitator / Speaker');" >/dev/null

want "role names come back attached" "2" \
  "$(as $NC "select array_length(role_names,1) from volunteer_register() where profile_id='$TM';")"

want "in the Handbook's order rather than alphabetical" "School Visitor" \
  "$(as $NC "select role_names[1] from volunteer_register() where profile_id='$TM';")"

want "somebody with no roles gets an empty list, not a null" "0" \
  "$(as $NC "select coalesce(array_length(role_names,1),0) from volunteer_register() where profile_id='$RC';")"

echo
echo "-- I. The summary agrees with the list ----------------------"

want "the summary counts add up to the list length" \
  "$(as $NC "select count(*) from volunteer_register();")" \
  "$(as $NC "select coalesce(sum(people),0) from volunteer_summary();")"

want "and a coordinator's summary counts only their own chapter" \
  "$(as $RC "select count(*) from volunteer_register();")" \
  "$(as $RC "select coalesce(sum(people),0) from volunteer_summary();")"

want "people with no record are counted under 'none', not dropped" "1" \
  "$(as $NC "select case when count(*) > 0 then 1 else 0 end from volunteer_summary() where status='none';")"

echo
echo "-- J. Mentor candidates -------------------------------------"

want "an active volunteer in the same chapter is offered" "Rita RC" \
  "$(as $RC "select full_name from mentor_candidates('$TM');")"

want "nobody is offered as their own mentor" "0" \
  "$(as $RC "select count(*) from mentor_candidates('$RC') where profile_id='$RC';")"

sql "insert into profiles (id, full_name, role, chapter_id) values ('77777777-7777-7777-7777-777777777777','Auchi Active','TM', $AUCHI) on conflict do nothing;" >/dev/null
sql "insert into volunteer_records (profile_id, status, started_on) values ('77777777-7777-7777-7777-777777777777','active','2024-01-01') on conflict do nothing;" >/dev/null

want "somebody active in another chapter is not offered" "0" \
  "$(as $RC "select count(*) from mentor_candidates('$TM') where full_name='Auchi Active';")"

sql "update volunteer_records set status='inactive', ended_on=null where profile_id='$RC';" >/dev/null
want "and neither is somebody who is no longer active" "0" \
  "$(as $RC "select count(*) from mentor_candidates('$TM');")"
sql "update volunteer_records set status='active' where profile_id='$RC';" >/dev/null

want "a coordinator gets nothing back for a person outside their chapter" "0" \
  "$(as $RC "select count(*) from mentor_candidates('77777777-7777-7777-7777-777777777777');")"

echo
echo "-- K. Writing to the register still obeys Batch 6a ----------"

blocked "a Team Member still cannot change their own status" \
  "$(as $TM "update volunteer_records set status='active' where profile_id='$TM' returning 1;")"

blocked "a coordinator still cannot touch another chapter's record" \
  "$(as $RC "update volunteer_records set status='removed' where profile_id='77777777-7777-7777-7777-777777777777' returning 1;")"

want "and reading the register did not quietly widen anything" "0" \
  "$(as $TM "select count(*) from volunteer_records where profile_id <> '$TM';")"

echo
echo "=============================================="
echo " passed: $pass   failed: $fail"
echo "=============================================="
[ "$fail" -eq 0 ] || exit 1
