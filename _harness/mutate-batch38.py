#!/usr/bin/env python3
# BATCH38-MARKER tm-rc-review-chain
# Mutation check for Batch 38. Break one rule at a time, load the broken
# copy, run the batch 38 tests, and require they FAIL. The clean file is
# loaded again at the end and must pass.
#   bash _harness/setup.sh   (base chain + batch37 + batch38)
#   python3 _harness/mutate-batch38.py
import subprocess, sys, os, re

SQL = "batch38-tm-rc-review-chain.sql"
src = open(SQL).read()

def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True)
def load(path):
    r = sh(f"su postgres -c \"PATH=/usr/lib/postgresql/16/bin:\\$PATH; psql -h /tmp/pg -d ycdi -X -v ON_ERROR_STOP=1 -q -f {os.path.abspath(path)}\"")
    return r.returncode == 0, r.stderr
def tests():
    r = sh("bash _harness/run-batch38-tests.sh")
    m = re.search(r"(\d+) passed, (\d+) failed", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, -1)

MUTATIONS = [
 ("a team member can insert for a chapter that isn't theirs",
  "public.dir_role() in ('RC', 'TM') and chapter_id = public.dir_chapter()",
  "public.dir_role() in ('RC', 'TM')"),
 ("a team member's note is never rerouted, it keeps whatever status the client sent",
  "  if public.dir_role() = 'TM' then\n    new.status := 'RC Review';\n  else\n    -- An RC's own submission, exactly as before this batch.\n    new.status := 'Pending';\n  end if;",
  "  null;"),
 ("a team member can edit a note that isn't sitting in RC Returned",
  "    if old.status <> 'RC Returned' then\n      raise exception 'This concept note is not open for changes right now.';\n    end if;\n",
  ""),
 ("a team member's resubmission can move to any status, not just back to RC Review",
  "    if new.status is distinct from old.status and new.status <> 'RC Review' then\n      raise exception 'A team member may only resubmit a returned concept note back for review.';\n    end if;\n",
  ""),
 ("declining or returning with a blank reason is allowed",
  "      if coalesce(btrim(new.rc_comment), '') = '' then\n        raise exception 'A reason is required to % a concept note.',\n          case when new.status = 'Declined' then 'decline' else 'return' end;\n      end if;\n",
  ""),
 ("anyone can set the RC's review comment, not just the acting RC on their own chapter's note in RC Review",
  "    if not (\n      v_role = 'RC' and new.chapter_id = public.dir_chapter()\n      and old.status = 'RC Review' and new.status in ('Declined', 'RC Returned', 'Pending')\n    ) then\n      raise exception 'Only this chapter''s Regional Coordinator can set the review comment, when acting on a submitted note.';\n    end if;\n",
  ""),
]

def main():
    ok, err = load(SQL)
    if not ok:
        print("Clean file does not even load:\n" + err); sys.exit(1)
    p, f = tests()
    if f != 0:
        print(f"Clean file does not pass its own tests first ({p} passed, {f} failed). Fix that before mutating."); sys.exit(1)
    print(f"Baseline: {p} passed, 0 failed.\n")

    all_ok = True
    for name, find, replace in MUTATIONS:
        if find not in src:
            print(f"SKIP  (pattern not found, test is stale): {name}"); all_ok = False; continue
        mutated = src.replace(find, replace, 1)
        open("/tmp/mutant38.sql", "w").write(mutated)
        ok, err = load("/tmp/mutant38.sql")
        if not ok:
            print(f"CAUGHT (mutant doesn't even load): {name}")
            continue
        p, f = tests()
        if f > 0:
            print(f"CAUGHT ({f} test(s) failed): {name}")
        else:
            print(f"MISSED — mutation survived, no test caught it: {name}"); all_ok = False

    print("\nRestoring the clean file...")
    ok, err = load(SQL)
    if not ok:
        print("Could not reload the clean file:\n" + err); sys.exit(1)
    p, f = tests()
    print(f"Clean file restored: {p} passed, {f} failed.")
    if f != 0 or not all_ok:
        sys.exit(1)
    print("\nEvery mutation was caught.")

if __name__ == "__main__":
    main()
