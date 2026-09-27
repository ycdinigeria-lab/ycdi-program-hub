#!/usr/bin/env python3
# BATCH35-MARKER annual-budget
# Mutation check for Batch 35. Break one rule at a time, load the broken
# copy, run the budget tests, require they FAIL. Clean file loaded last.
#   python3 _harness/mutate-batch35.py   (after setup.sh has loaded batch35)
import subprocess, sys, os, re

SQL = "batch35-annual-budget.sql"
src = open(SQL).read()

def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True)
def load(path):
    r = sh(f"su postgres -c \"PATH=/usr/lib/postgresql/16/bin:\\$PATH; psql -h /tmp/pg -d ycdi -X -v ON_ERROR_STOP=1 -q -f {os.path.abspath(path)}\"")
    return r.returncode == 0, r.stderr
def tests():
    r = sh("bash _harness/run-batch35-tests.sh")
    m = re.search(r"(\d+) passed, (\d+) failed", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, -1)

MUTATIONS = [
 ("a plain admin can read the budget",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n$$;",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.is_admin(), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n$$;"),
 ("the Treasurer can prepare a budget",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n$$;",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;"),
 ("the Financial Secretary can approve (prepare==approve)",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n$$;"),
 ("create does not check the preparer",
  "  if not public.budget_can_prepare() then raise exception 'You cannot prepare a budget.'; end if;",
  ""),
 ("two budgets for one year are allowed (function)",
  "  if exists (select 1 from public.annual_budgets where financial_year = p_year) then\n    raise exception 'A budget for % already exists.', p_year;\n  end if;",
  "",
  "alter table public.annual_budgets drop constraint if exists annual_budgets_financial_year_key;\n",
  "alter table public.annual_budgets add constraint annual_budgets_financial_year_key unique (financial_year);\n"),
 ("save_budget_line does not check the preparer",
  "  if not public.budget_can_prepare() then raise exception 'You cannot write budget lines.'; end if;\n  if p_line is null then",
  "  if p_line is null then"),
 ("lines can change after a budget leaves draft",
  "  if v_status <> 'draft' then raise exception 'Lines can be changed only while the budget is a draft.'; end if;",
  ""),
 ("a line can be removed after draft",
  "  if v_status <> 'draft' then raise exception 'Lines can be removed only while the budget is a draft.'; end if;",
  ""),
 ("submit does not check the preparer",
  "  if not public.budget_can_prepare() then raise exception 'You cannot submit a budget.'; end if;",
  ""),
 ("an empty budget can be submitted",
  "  if not exists (select 1 from public.budget_lines where budget_id = p_budget) then\n    raise exception 'A budget needs at least one line before it goes to the Board.';\n  end if;",
  ""),
 ("decide does not check the approver",
  "  if not public.budget_can_approve() then raise exception 'You cannot record the Board decision.'; end if;\n  if p_decision not in ('approve','return') then",
  "  if p_decision not in ('approve','return') then"),
 ("approval needs no Board minute (function check and constraint removed)",
  "  if v_minute is null then raise exception 'Record the Board minute reference.'; end if;",
  "",
  "alter table public.annual_budgets drop constraint if exists annual_budget_approved_has_record;\n",
  "alter table public.annual_budgets add constraint annual_budget_approved_has_record check (status in ('draft','submitted') or (approved_on is not null and board_minute is not null and btrim(board_minute) <> ''));\n"),
 ("a late approval is never flagged",
  "  v_late := v_on >= make_date(v_year, 1, 1);",
  "  v_late := false;"),
 ("set_annual_status does not check the approver",
  "  if not public.budget_can_approve() then raise exception 'You cannot change the budget status.'; end if;\n  if p_status not in ('active','closed') then",
  "  if p_status not in ('active','closed') then"),
 ("a draft can be made active (function check and constraint removed)",
  "  if p_status = 'active' and v_old <> 'board_approved' then raise exception 'Only a board-approved budget can be made active.'; end if;",
  "",
  "alter table public.annual_budgets drop constraint if exists annual_budget_approved_has_record;\n",
  "alter table public.annual_budgets add constraint annual_budget_approved_has_record check (status in ('draft','submitted') or (approved_on is not null and board_minute is not null and btrim(board_minute) <> ''));\n"),
 ("the budget table is readable by anyone",
  "create policy annual_budgets_read on public.annual_budgets\n  for select to authenticated using (public.budget_can_see(id));",
  "create policy annual_budgets_read on public.annual_budgets\n  for select to authenticated using (true);"),
 ("a coordinator sees income lines",
  "    public.budget_can_read()\n    or ( public.dir_role() = 'RC' and kind = 'expenditure' and chapter_id = public.dir_chapter() )",
  "    public.budget_can_read()\n    or ( public.dir_role() = 'RC' and chapter_id = public.dir_chapter() )"),
 ("a coordinator sees another chapter's lines",
  "    or ( public.dir_role() = 'RC' and kind = 'expenditure' and chapter_id = public.dir_chapter() )\n  );",
  "    or ( public.dir_role() = 'RC' and kind = 'expenditure' )\n  );"),
 ("the plan-vs-actual is open to everyone",
  "  if not public.budget_can_read() then return; end if;",
  ""),
 ("actual expenditure counts withdrawn and rejected claims",
  "               where c.status in ('approved','paid')\n                 and c.reviewed_at is not null",
  "               where c.reviewed_at is not null"),
 ("actual income counts voided donations",
  "select sum(dn.amount_kobo) from public.donations dn where dn.status='active' and extract(year from dn.received_on)=b.financial_year",
  "select sum(dn.amount_kobo) from public.donations dn where extract(year from dn.received_on)=b.financial_year"),
 ("the line-actuals view shows every chapter to a coordinator",
  "     and ( public.budget_can_read()\n           or ( public.dir_role() = 'RC' and l.kind = 'expenditure' and l.chapter_id = public.dir_chapter() ) )",
  "     and ( public.budget_can_read()\n           or ( public.dir_role() = 'RC' ) )"),
 ("the budget ledger is readable by anyone",
  "    or (budget_id is not null and public.budget_can_read())",
  "    or (budget_id is not null)"),
 ("the budget tables allow a direct insert",
  "revoke all on public.annual_budgets, public.budget_lines from anon, authenticated;",
  "",
  "create policy b35_mut on public.annual_budgets for insert to authenticated with check (true);\ngrant insert on public.annual_budgets to authenticated;\n",
  "drop policy if exists b35_mut on public.annual_budgets;\nrevoke insert on public.annual_budgets from authenticated;\n"),
 ("the annual logger is callable by a signed-in user",
  "revoke all on function public.annual_log(text, uuid, bigint, text) from public, anon, authenticated;",
  "grant execute on function public.annual_log(text, uuid, bigint, text) to authenticated;"),
]

def run_case(text, cleanup=None):
    open("/tmp/b35_mut.sql","w").write(text)
    ok, err = load("/tmp/b35_mut.sql")
    if not ok: return "LOADFAIL", (err.strip().splitlines() or [""])[-1]
    p, f = tests()
    if cleanup: open("/tmp/b35_undo.sql","w").write(cleanup); load("/tmp/b35_undo.sql")
    return ("KILLED" if f != 0 else "SURVIVED"), f"{p} passed, {f} failed"

results = []
for entry in MUTATIONS:
    name, old, new = entry[:3]
    add, undo = (entry[3], entry[4]) if len(entry) > 3 else ("", None)
    n = src.count(old)
    if n != 1:
        results.append((name, "BADMATCH", f"pattern found {n} times")); load(SQL); continue
    status, detail = run_case(src.replace(old, new) + "\n" + add, cleanup=undo)
    results.append((name, status, detail)); load(SQL)

load(SQL); p, f = tests()
width = max(len(n) for n, _, _ in results)
bad = sum(1 for _, s, _ in results if s != "KILLED")
for name, status, detail in results:
    print(("  ok  " if status == "KILLED" else "  XX  ") + name.ljust(width) + f"  {status}  ({detail})")
print(f"\nclean file: {p} passed, {f} failed")
print(f"{len(results) - bad} of {len(results)} mutations were caught")
sys.exit(0 if bad == 0 and f == 0 else 1)
