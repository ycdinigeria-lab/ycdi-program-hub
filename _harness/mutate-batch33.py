#!/usr/bin/env python3
# BATCH33-MARKER grants
# Mutation check for Batch 33. Break one rule at a time in a copy of the
# SQL, load it over the test database, run the grant tests, and require
# they FAIL. A mutation the tests survive is a rule the tests do not check.
# The clean file is loaded again at the end and must pass.
#
# Run from the project root, after _harness/setup.sh has loaded batch33:
#   python3 _harness/mutate-batch33.py
import subprocess, sys, os

SQL = "batch33-grants.sql"
src = open(SQL).read()

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def load(path):
    r = sh(f"su postgres -c \"PATH=/usr/lib/postgresql/16/bin:\\$PATH; psql -h /tmp/pg -d ycdi -X -v ON_ERROR_STOP=1 -q -f {os.path.abspath(path)}\"")
    return r.returncode == 0, r.stderr

def tests():
    r = sh("bash _harness/run-batch33-tests.sh")
    import re
    m = re.search(r"(\d+) passed, (\d+) failed", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, -1)

# (name, old, new[, add, undo])
MUTATIONS = [
 ("the Treasurer can manage grants",
  "select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n$$;",
  "select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;"),
 ("the Deputy cannot manage grants",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n$$;",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n$$;"),
 ("a plain admin can read grants",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.is_admin(), false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;"),
 ("a coordinator sees every grant",
  "    or ( public.dir_role() = 'RC' and exists (\n          select 1 from public.finance_budgets fb\n            join public.programs p on p.id = fb.programme_id\n           where fb.grant_id = grants.id and p.chapter_id = public.dir_chapter() ) )\n  );",
  "    or ( public.dir_role() = 'RC' )\n  );"),
 ("any coordinator sees a grant that funds another chapter",
  "           and public.dir_role() = 'RC'\n           and p.chapter_id = public.dir_chapter() )",
  "           and public.dir_role() = 'RC' )"),
 ("restricted money needs no restriction note (function)",
  "  if p_is_restricted and (p_restrictions is null or btrim(p_restrictions) = '') then\n    raise exception 'Restricted money needs a note saying what it is restricted to.';\n  end if;",
  "",
  "alter table public.grants drop constraint if exists grants_restricted_has_text;\n",
  "alter table public.grants add constraint grants_restricted_has_text check (not is_restricted or (restrictions is not null and btrim(restrictions) <> ''));\n"),
 ("the period order is not checked (function)",
  "  if p_period_start is not null and p_period_end is not null and p_period_end < p_period_start then\n    raise exception 'The end of the period cannot be before the start.';\n  end if;",
  "",
  "alter table public.grants drop constraint if exists grants_period_order;\n",
  "alter table public.grants add constraint grants_period_order check (period_start is null or period_end is null or period_end >= period_start);\n"),
 ("an unknown funder contact is accepted (function check and FK both removed)",
  "  if p_funder_id is not null and not exists (select 1 from public.audience_contacts where id = p_funder_id) then\n    raise exception 'That funder contact does not exist.';\n  end if;",
  "",
  "alter table public.grants drop constraint if exists grants_funder_id_fkey;\n",
  "alter table public.grants add constraint grants_funder_id_fkey foreign key (funder_id) references public.audience_contacts(id) on delete set null;\n"),
 ("save_grant does not check the manager",
  "  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;\n  if p_title is null or btrim(p_title) = '' then raise exception 'Give the grant a title.'; end if;",
  "  if p_title is null or btrim(p_title) = '' then raise exception 'Give the grant a title.'; end if;"),
 ("a closed grant can be reopened",
  "  if v_old in ('closed','declined') then\n    raise exception 'A % grant cannot be reopened. Record a new grant instead.', v_old;\n  end if;",
  ""),
 ("set_grant_status does not check the manager",
  "  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;\n  if p_status not in ('prospect','applied','awarded','active','reporting','closed','declined') then",
  "  if p_status not in ('prospect','applied','awarded','active','reporting','closed','declined') then"),
 ("a waiver needs no reason",
  "  if p_status = 'waived' and (v_note is null or char_length(v_note) < 5) then\n    raise exception 'Say why the deadline is being waived.';\n  end if;",
  ""),
 ("add_obligation does not check the manager",
  "  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;\n  if p_kind not in ('narrative_report','financial_report','acquittal','milestone','renewal','audit','other') then",
  "  if p_kind not in ('narrative_report','financial_report','acquittal','milestone','renewal','audit','other') then"),
 ("a settled deadline can be removed",
  "  if v_status <> 'pending' then raise exception 'Only a deadline that is still pending can be removed. Waive it instead.'; end if;",
  ""),
 ("a prospect grant can fund a programme",
  "    if v_status not in ('awarded','active','reporting') then\n      raise exception 'A grant can fund a programme only once it is awarded, active or reporting.';\n    end if;",
  ""),
 ("a programme with no budget can be funded",
  "  select grant_id into v_old from public.finance_budgets where programme_id = p_programme for update;\n  if not found then raise exception 'That programme has no approved budget to fund.'; end if;",
  "  select grant_id into v_old from public.finance_budgets where programme_id = p_programme for update;"),
 ("set_programme_grant does not check the manager",
  "  if not public.grants_can_manage() then raise exception 'You cannot manage grants.'; end if;\n  select grant_id into v_old from public.finance_budgets where programme_id = p_programme for update;",
  "  select grant_id into v_old from public.finance_budgets where programme_id = p_programme for update;"),
 ("the overview is open to everyone",
  "  if not public.grants_can_read_all() then return; end if;",
  ""),
 ("the grant summary shows every chapter to a coordinator",
  "        or ( public.dir_role() = 'RC' and exists (\n              select 1 from public.finance_budgets fb join public.programs p on p.id = fb.programme_id\n               where fb.grant_id = g.id and p.chapter_id = public.dir_chapter()) )",
  "        or ( public.dir_role() = 'RC' )"),
 ("allocation double-counts across claims again",
  "  alloc as (\n    select fb.grant_id,\n           count(*) as programmes,\n           coalesce(sum(fb.approved_kobo), 0) as allocated\n      from public.finance_budgets fb\n     where fb.grant_id is not null\n     group by fb.grant_id\n  ),",
  "  alloc as (\n    select fb.grant_id,\n           count(distinct fb.programme_id) as programmes,\n           coalesce(sum(fb.approved_kobo), 0) as allocated\n      from public.finance_budgets fb\n      left join public.expense_claims c on c.programme_id = fb.programme_id\n     where fb.grant_id is not null\n     group by fb.grant_id\n  ),"),
 ("over-allocation is never flagged",
  "         (coalesce(a.allocated,0) > v.awarded_kobo),",
  "         false,"),
 ("the grant ledger is readable by anyone",
  "    or (grant_id is not null and public.grant_can_see(grant_id))\n  );",
  "    or (grant_id is not null)\n  );"),
 ("the grant tables allow a direct insert",
  "revoke all on public.grants, public.grant_obligations from anon, authenticated;",
  "",
  "create policy b33_mut on public.grants for insert to authenticated with check (true);\ngrant insert on public.grants to authenticated;\ngrant usage on sequence public.grants_grant_no_seq to authenticated;\n",
  "drop policy if exists b33_mut on public.grants;\nrevoke insert on public.grants from authenticated;\nrevoke all on sequence public.grants_grant_no_seq from authenticated;\n"),
 ("the grant logger is callable by a signed-in user",
  "revoke all on function public.grant_log(text, uuid, uuid, bigint, text) from public, anon, authenticated;",
  "grant execute on function public.grant_log(text, uuid, uuid, bigint, text) to authenticated;"),
]

def run_case(text, cleanup=None):
    open("/tmp/b33_mut.sql", "w").write(text)
    ok, err = load("/tmp/b33_mut.sql")
    if not ok:
        return "LOADFAIL", (err.strip().splitlines() or [""])[-1]
    p, f = tests()
    if cleanup:
        open("/tmp/b33_undo.sql", "w").write(cleanup)
        load("/tmp/b33_undo.sql")
    return ("KILLED" if f != 0 else "SURVIVED"), f"{p} passed, {f} failed"

results = []
for entry in MUTATIONS:
    name, old, new = entry[:3]
    add, undo = (entry[3], entry[4]) if len(entry) > 3 else ("", None)
    n = src.count(old)
    if n != 1:
        results.append((name, "BADMATCH", f"pattern found {n} times")); load(SQL); continue
    status, detail = run_case(src.replace(old, new) + "\n" + add, cleanup=undo)
    results.append((name, status, detail))
    load(SQL)

load(SQL)
p, f = tests()
width = max(len(n) for n, _, _ in results)
bad = sum(1 for _, s, _ in results if s != "KILLED")
for name, status, detail in results:
    print(("  ok  " if status == "KILLED" else "  XX  ") + name.ljust(width) + f"  {status}  ({detail})")
print(f"\nclean file: {p} passed, {f} failed")
print(f"{len(results) - bad} of {len(results)} mutations were caught")
sys.exit(0 if bad == 0 and f == 0 else 1)
