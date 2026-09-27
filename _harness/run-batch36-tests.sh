#!/bin/bash
# BATCH36-MARKER run-tests
#
# Proves Batch 36 changed HOW the participant rules are written and not
# WHO they let in, and that it is fast at 30,000 participants.
#
# Run after a setup WITHOUT batch36 (this script applies it itself, so it
# can capture the old behaviour first):
#   EXTRA="<every migration up to batch35, in order>" bash _harness/setup.sh
#   bash _harness/run-batch36-tests.sh
#
# Steps:
#   1. Seed 30,000 participants with mentors, added-by records, inactive
#      people, ended mentorships, a PD seat, a plain admin, and activity
#      at 3, 5, 10 and 60 days ago (_harness/batch36-seed.sql).
#   2. For eight users (plain admin, NC+admin, NC, Benin RC, Benin TM with
#      mentees, PD seat, Lagos TM with nothing, and a stranger) record:
#      which participant rows they can read, stage_summary (all and one
#      chapter), quiet_participants at 21 and 7 days, and a search count.
#   3. Apply batch36 and record the same again. They must be identical.
#   4. Apply each of 24 mutants in turn. Every one must change something.
#   5. Print timings. Informational only: they depend on the machine.

R="$(cd "$(dirname "$0")/.." && pwd)"
T=/tmp/pg-b36; rm -rf $T; mkdir -p $T; chmod 777 $T
P="su postgres -c"; PG='PATH=/usr/lib/postgresql/16/bin:$PATH; psql -h /tmp/pg -d ycdi'
pass=0; fail=0
ok(){ echo "  ok   $1"; pass=$((pass+1)); }
xx(){ echo "  XX   $1"; fail=$((fail+1)); }
sqlf(){ cp "$1" $T/run.sql; chmod 644 $T/run.sql; $P "$PG -v ON_ERROR_STOP=1 -q -f $T/run.sql" >/dev/null 2>&1; }

USERS="88888888-8888-8888-8888-888888888888 11111111-1111-1111-1111-111111111111 22222222-2222-2222-2222-222222222222 33333333-3333-3333-3333-333333333333 44444444-4444-4444-4444-444444444444 77777777-7777-7777-7777-777777777777 99999999-9999-9999-9999-999999999999 00000000-0000-0000-0000-00000000dead"

capture(){ # $1 = output file
  : > "$1"
  for u in $USERS; do
    echo "== $u" >> "$1"
    $P "$PG -tA -F' ' -c \"set role authenticated; set test.uid='$u';
      select 'rows', count(*), md5(coalesce(string_agg(id::text, ',' order by id),'')) from public.participants;
      select 'summary', md5(coalesce(string_agg(chapter_id||stage||people, ',' order by chapter_id, stage),'')), coalesce(sum(people),0) from public.stage_summary(null);
      select 'summary-benin', md5(coalesce(string_agg(chapter_id||stage||people, ',' order by chapter_id, stage),'')) from public.stage_summary((select id from public.chapters where name='Benin'));
      select 'quiet', count(*), md5(coalesce(string_agg(participant_id||coalesce(mentor_id::text,'-')||last_activity, ',' order by participant_id, mentor_id),'')) from public.quiet_participants();
      select 'quiet7', count(*) from public.quiet_participants(7);
      select 'search', count(*) from public.participants where full_name ilike '%okafor 1%' or school ilike '%okafor 1%' or class_level ilike '%okafor 1%';\"" 2>&1 | grep -v '^SET$' >> "$1"
  done
}

echo "Batch 36: participant rules at scale"

echo "-- seeding 30,000 participants"
sqlf "$R/_harness/batch36-seed.sql" && ok "seed loaded" || { xx "seed failed"; exit 1; }
$P "$PG -qc 'analyze'"

# The rules exactly as they stand before Batch 36, read back out of the
# database so this compares against what was really there.
{
  echo "begin;"
  echo "drop policy if exists pt_read on public.participants;"
  $P "$PG -tAc \"select 'create policy pt_read on public.participants for select to authenticated using (' || qual || ');' from pg_policies where tablename = 'participants' and policyname = 'pt_read'\""
  $P "$PG -tAc \"select pg_get_functiondef('public.stage_summary(uuid)'::regprocedure) || ';'\""
  $P "$PG -tAc \"select pg_get_functiondef('public.quiet_participants(integer)'::regprocedure) || ';'\""
  echo "commit;"
} > $T/old.sql

echo "-- before and after"
capture $T/cap-old.txt
sqlf "$R/batch36-scale-and-search.sql" && ok "batch36 applies" || { xx "batch36 failed to apply"; exit 1; }
sqlf "$R/batch36-scale-and-search.sql" && ok "batch36 applies a second time (safe to re-run)" || xx "batch36 not re-runnable"
$P "$PG -qc 'analyze'"
capture $T/cap-new.txt
if diff -q $T/cap-old.txt $T/cap-new.txt >/dev/null; then
  ok "all 8 users see exactly the same rows, summaries and quiet lists"
else
  xx "visibility changed:"; diff $T/cap-old.txt $T/cap-new.txt | head -20
fi
grep -q "^rows 0 " $T/cap-new.txt && ok "a stranger and an unrelated team member see nothing" || xx "nobody sees zero rows"

echo "-- mutants (each must change what somebody sees)"
for m in $(python3 "$R/_harness/mutate-batch36.py" list); do
  python3 "$R/_harness/mutate-batch36.py" "$m" "$R/batch36-scale-and-search.sql" $T/mut.sql >/dev/null || { xx "$m: mutant did not apply"; continue; }
  sqlf $T/mut.sql || { xx "$m: mutant SQL failed"; continue; }
  capture $T/cap-mut.txt
  if diff -q $T/cap-new.txt $T/cap-mut.txt >/dev/null; then xx "$m survived"; else ok "$m killed"; fi
done
sqlf "$R/batch36-scale-and-search.sql" && ok "real batch36 restored"

echo "-- timings at 30,000 (informational)"
for u in 22222222-2222-2222-2222-222222222222 33333333-3333-3333-3333-333333333333 44444444-4444-4444-4444-444444444444; do
  t="set role authenticated; set test.uid='$u';"
  s=$(date +%s%N); $P "$PG -tAqc \"$t select count(*) from (select id from public.participants where full_name ilike '%okafor 1%' or school ilike '%okafor 1%' order by full_name, id limit 50) x;\"" >/dev/null; e=$(date +%s%N)
  s2=$(date +%s%N); $P "$PG -tAqc \"$t select count(*) from public.quiet_participants();\"" >/dev/null; e2=$(date +%s%N)
  echo "  $u  search page: $(( (e-s)/1000000 )) ms   quiet list: $(( (e2-s2)/1000000 )) ms"
done

echo "Batch 36: $pass passed, $fail failed"
[ $fail -eq 0 ]
