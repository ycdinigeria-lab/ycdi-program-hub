#!/usr/bin/env python3
# BATCH37-MARKER concept-note-v2
# Mutation check for Batch 37. Break one rule at a time, load the broken
# copy, run the batch 37 tests, and require they FAIL. The clean file is
# loaded again at the end and must pass.
#   python3 _harness/mutate-batch37.py   (after setup.sh + batch37 loaded)
import subprocess, sys, os, re

SQL = "batch37-concept-note-v2.sql"
src = open(SQL).read()

def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True)
def load(path):
    r = sh(f"su postgres -c \"PATH=/usr/lib/postgresql/16/bin:\\$PATH; psql -h /tmp/pg -d ycdi -X -v ON_ERROR_STOP=1 -q -f {os.path.abspath(path)}\"")
    return r.returncode == 0, r.stderr
def tests():
    r = sh("bash _harness/run-batch37-tests.sh")
    m = re.search(r"(\d+) passed, (\d+) failed", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, -1)

MUTATIONS = [
 ("the Needs Identification check is skipped",
  "  if coalesce(btrim(new.needs_evidence), '') = ''\n     or coalesce(btrim(new.needs_gap), '') = ''\n     or coalesce(btrim(new.needs_beneficiary_voice), '') = ''\n     or coalesce(btrim(new.needs_alternative), '') = ''\n  then\n    raise exception 'The Needs Identification Checklist must be answered in full before a concept note can be submitted.';\n  end if;",
  ""),
 ("the alignment-completeness check is skipped",
  "  if new.align_reach is null or new.align_roots is null or new.align_resources is null\n     or new.align_raise is null or new.align_reputation is null\n  then\n    raise exception 'The Strategic Priority alignment rating (REACH, ROOTS, RESOURCES, RAISE, REPUTATION) must be completed before a concept note can be submitted.';\n  end if;",
  ""),
 ("the three-None threshold is loosened to five (never fires)",
  "  if v_none_count >= 3 then",
  "  if v_none_count >= 5 then"),
 ("a virtual programme needs no digital safeguarding plan",
  "  if new.delivery_format <> 'Physical' and coalesce(btrim(new.digital_safeguarding), '') = '' then\n    raise exception 'A digital safeguarding plan is required for a virtual or hybrid programme.';\n  end if;",
  ""),
 ("the gate fires on every update, not just a (re)submission",
  "  if TG_OP = 'UPDATE' and not (new.status = 'Pending' and old.status is distinct from 'Pending') then\n    return new;\n  end if;",
  ""),
 ("an admin is not exempt from the gate",
  "  if public.is_admin() then\n    return new;\n  end if;\n\n",
  ""),
 ("Level 4 needs no Treasurer concurrence",
  "  if v_level = 4 and coalesce(p_treasurer_concurrence, v_row.treasurer_concurrence, false) is not true then\n    raise exception 'This is a Level 4 programme (N500,001-N2,000,000). Confirm Board Treasurer concurrence before approving.';\n  end if;",
  ""),
 ("Level 5 needs no Board date or minute reference",
  "  if v_level = 5 and (\n       coalesce(p_board_minute_ref, v_row.board_minute_ref) is null\n    or coalesce(p_board_approval_date, v_row.board_approval_date) is null\n  ) then\n    raise exception 'This is a Level 5 programme (above N2,000,000, or a new programme line, chapter launch, or digital platform commitment). Record the Board approval date and minute reference before approving.';\n  end if;",
  ""),
 ("the Level 4/5 thresholds are wrong (everything is Level 3)",
  "  select case\n    when p_budget is null or p_budget <= 500000 then 3\n    when p_budget <= 2000000 then 4\n    else 5\n  end",
  "  select 3"),
 ("returning a note keeps its Treasurer/Board sign-off",
  "  update public.programs set\n    status = 'Returned',\n    nc_comment = note,\n    treasurer_concurrence = false,\n    treasurer_name = null,\n    treasurer_concurrence_date = null,\n    board_minute_ref = null,\n    board_approval_date = null\n  where id = program_id;",
  "  update public.programs set\n    status = 'Returned',\n    nc_comment = note\n  where id = program_id;"),
 ("approve_program no longer checks is_admin",
  "  if not public.is_admin() then\n    raise exception 'Only an admin can approve programs.';\n  end if;\n\n  select * into v_row",
  "  select * into v_row"),
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
        open("/tmp/mutant37.sql", "w").write(mutated)
        ok, err = load("/tmp/mutant37.sql")
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
