#!/usr/bin/env python3
# BATCH32-MARKER finance
# Mutation check for Batch 32. For each rule that matters, break it in a
# copy of the SQL, load the broken copy over the test database, run the
# finance tests, and require that they FAIL. A rule whose mutation leaves
# the tests green is a rule the tests do not really check.
# Finally the clean file is loaded again and the tests must pass.
#
# Run from the project root, after _harness/setup.sh has loaded batch32:
#   python3 _harness/mutate-batch32.py
import subprocess, sys, re, os

SQL = "batch32-finance.sql"
src = open(SQL).read()

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def load(path):
    r = sh(f"su postgres -c \"PATH=/usr/lib/postgresql/16/bin:\\$PATH; psql -h /tmp/pg -d ycdi -X -v ON_ERROR_STOP=1 -q -f {os.path.abspath(path)}\"")
    return r.returncode == 0, r.stderr

def tests():
    r = sh("bash _harness/run-batch32-tests.sh")
    m = re.search(r"(\d+) passed, (\d+) failed", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, -1), r.stdout

# (name, old text, new text)  each old text must appear exactly once
MUTATIONS = [
 ("a plain admin can read all finance",
  "select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)",
  "select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.is_admin(), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)"),
 ("the Treasurer cannot read",
  "      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;\n\n-- Is this person the officer",
  "      or coalesce(public.holds_portfolio('FIN'), false)\n$$;\n\n-- Is this person the officer"),
 ("an owner cannot see their own claim",
  "    claimant_id = auth.uid()\n    or ( submitted_at is not null\n         and ( public.finance_can_read_all()",
  "    ( submitted_at is not null\n         and ( public.finance_can_read_all()"),
 ("any Regional Coordinator sees any chapter's claims",
  "               or ( public.dir_role() = 'RC' and chapter_id is not null and chapter_id = public.dir_chapter() ) ) )\n  );",
  "               or ( public.dir_role() = 'RC' ) ) )\n  );"),
 ("anyone signed in sees every claim",
  "    claimant_id = auth.uid()\n    or ( submitted_at is not null\n         and ( public.finance_can_read_all()\n               or ( public.dir_role() = 'RC' and chapter_id is not null and chapter_id = public.dir_chapter() ) ) )\n  );",
  "    true\n  );"),
 ("another person's draft is readable (claim table)",
  "    or ( submitted_at is not null\n         and ( public.finance_can_read_all()",
  "    or ( true\n         and ( public.finance_can_read_all()"),
 ("another person's draft is readable (receipts and files)",
  "             or ( c.submitted_at is not null\n                  and ( public.finance_can_read_all()",
  "             or ( true\n                  and ( public.finance_can_read_all()"),
 ("the National Coordinator cannot see a claim that was sent up",
  "      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;\n\n-- Is this person the officer",
  "      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n      and false\n$$;\n\n-- Is this person the officer"),
 ("a claimant may approve their own claim",
  "  select auth.uid() is not null\n     and auth.uid() is distinct from p_claimant\n     and (",
  "  select auth.uid() is not null\n     and ("),
 ("the NC approves while the FIN seat is filled",
  "  select coalesce(public.holds_portfolio('FIN'), false)\n      or ( coalesce(public.dir_role() = 'NC', false)\n           and not exists (select 1 from public.nec_portfolios where portfolio = 'FIN') )",
  "  select coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.dir_role() = 'NC', false)"),
 ("the NC cannot decide the FIN holder's own claim",
  "                and exists (select 1 from public.nec_portfolios\n                             where portfolio = 'FIN' and profile_id = p_claimant) ) )",
  "                and false ) )"),
 ("a claim can be decided twice",
  "  if v_claim.status <> 'submitted' then\n    raise exception 'Only a submitted claim can be decided.';\n  end if;",
  ""),
 ("an over-budget approval needs no note",
  "      if v_note is null or char_length(v_note) < 10 then\n        raise exception 'This takes the programme over its approved budget. Write a note (at least 10 characters) saying why it is approved.';\n      end if;\n      v_over := true;",
  "      v_over := true;"),
 ("over-budget is never flagged",
  "      v_over := true;\n    end if;\n  end if;\n\n  update public.expense_claims\n     set status = case p_decision",
  "      v_over := false;\n    end if;\n  end if;\n\n  update public.expense_claims\n     set status = case p_decision"),
 ("a return needs no reason",
  "  if p_decision in ('return','reject') and (v_note is null or char_length(v_note) < 5) then\n    raise exception 'Say why, so the claimant knows what to do next.';\n  end if;",
  ""),
 ("a claim can be submitted with no receipt and no reason",
  "  if v_files = 0 and (v_claim.no_receipt_reason is null or char_length(btrim(v_claim.no_receipt_reason)) < 10) then\n    raise exception 'Attach a receipt, or write a reason there is none (at least 10 characters).';\n  end if;",
  ""),
 ("the clock is thirty-one days",
  "due_by = (now() at time zone 'Africa/Lagos')::date + 30,",
  "due_by = (now() at time zone 'Africa/Lagos')::date + 31,"),
 ("the clock does not restart on resubmission",
  "         submitted_at = now(),\n         due_by = (now() at time zone 'Africa/Lagos')::date + 30,",
  "         submitted_at = coalesce(submitted_at, now()),\n         due_by = coalesce(due_by, (now() at time zone 'Africa/Lagos')::date + 30),"),
 ("an account number is accepted as a payment reference (both checks removed)",
  "  if v_ref ~ '^[0-9]{10}$' then\n    raise exception 'That looks like a bank account number. Enter the transfer reference instead. The Hub does not store account numbers.';\n  end if;",
  "",
  "alter table public.expense_claims drop constraint if exists expense_claims_ref_not_account_number;\n",
  "alter table public.expense_claims add constraint expense_claims_ref_not_account_number check (payment_ref is null or payment_ref !~ '^\\s*[0-9]{10}\\s*$');\n"),
 ("a payment can be dated in the future",
  "  if p_paid_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The payment date cannot be in the future.'; end if;",
  ""),
 ("a payment can pre-date the approval",
  "  if p_paid_on < (v_claim.reviewed_at at time zone 'Africa/Lagos')::date then\n    raise exception 'The payment date cannot be before the claim was approved.';\n  end if;",
  ""),
 ("a claim can be against another chapter's programme",
  "    if v_chapter is null or not exists (select 1 from public.programs where id = p_programme and chapter_id = v_chapter) then\n      raise exception 'You can only claim against a programme in your own chapter.';\n    end if;",
  ""),
 ("a claim can be against a programme with no budget",
  "    if not exists (select 1 from public.finance_budgets where programme_id = p_programme) then\n      raise exception 'That programme has no approved budget yet.';\n    end if;",
  ""),
 ("an amount over the limit is accepted (both checks removed)",
  "  if p_amount_kobo > 5000000000 then raise exception 'The amount is over the ₦50,000,000 limit for a single claim.'; end if;",
  "",
  "alter table public.expense_claims drop constraint if exists expense_claims_amount_kobo_check;\n",
  "alter table public.expense_claims add constraint expense_claims_amount_kobo_check check (amount_kobo > 0 and amount_kobo <= 5000000000);\n"),
 ("a spend date in the future is accepted",
  "  if p_incurred_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The spend date cannot be in the future.'; end if;",
  ""),
 ("an edited concept note moves the frozen budget",
  "       and b.source = 'concept_note'\n       and b.approved_kobo is distinct from v_kobo\n       and not exists (select 1 from public.expense_claims c\n                        where c.programme_id = new.id\n                          and c.status in ('submitted','approved','paid'));",
  "       and b.approved_kobo is distinct from v_kobo;"),
 ("a budget can be revised below what is approved",
  "  if p_new_kobo < v_claimed then\n    raise exception 'The budget cannot go below what has already been approved or paid against it.';\n  end if;",
  ""),
 ("a budget revision needs no reason",
  "  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Give a reason (at least 10 characters).'; end if;",
  ""),
 ("anyone can revise a budget",
  "  if not public.finance_is_officer() then raise exception 'Only the Financial Secretary can revise a budget.'; end if;",
  ""),
 ("the overview is open to everyone",
  "  if not public.finance_can_read_all() then\n    return;\n  end if;",
  ""),
 ("the summary shows every chapter to a Regional Coordinator",
  "      or (public.dir_role() = 'RC' and p.chapter_id = public.dir_chapter())\n   group by",
  "      or (public.dir_role() = 'RC')\n   group by"),
 ("the record is readable by anyone",
  "    public.finance_can_read_all()\n    or (claim_id is not null and public.finance_can_see_claim(claim_id))",
  "    true"),
 ("the record can be rewritten",
  "  raise exception 'The finance record is append-only. Entries cannot be % once written.',\n    case tg_op when 'DELETE' then 'deleted' else 'changed' end;",
  "  return coalesce(new, old);"),
 ("anyone can upload a receipt file",
  "    bucket_id = 'finance-receipts' and public.finance_can_touch_receipt_file(name)\n  );\ncreate policy finance_receipts_delete",
  "    bucket_id = 'finance-receipts'\n  );\ncreate policy finance_receipts_delete"),
 ("a receipt file can be added after submission",
  "       and c.claimant_id = auth.uid()\n       and c.status in ('draft','returned')\n  )",
  "       and c.claimant_id = auth.uid()\n  )"),
 ("anyone can read a receipt file",
  "    bucket_id = 'finance-receipts'\n    and public.finance_can_see_claim(public.finance_claim_from_path(name))",
  "    bucket_id = 'finance-receipts'"),
 ("a receipt can point outside its claim's folder",
  "  if p_path is null or left(p_path, char_length(p_claim::text) + 1) <> p_claim::text || '/' then\n    raise exception 'The receipt is not in this claim''s folder.';\n  end if;",
  ""),
 ("a receipt can be registered for a file that is not there",
  "  if not exists (select 1 from storage.objects where bucket_id = 'finance-receipts' and name = p_path) then\n    raise exception 'That file has not finished uploading. Try again.';\n  end if;",
  ""),
 ("a claim can carry any number of receipts",
  "  if (select count(*) from public.expense_receipts where claim_id = p_claim) >= 5 then\n    raise exception 'A claim can carry five receipts at most.';\n  end if;",
  ""),
 ("a signed-out caller can save a claim",
  "revoke all on function public.save_claim(uuid, text, text, bigint, date, uuid, text, text) from public, anon;",
  "",
  "grant execute on function public.save_claim(uuid, text, text, bigint, date, uuid, text, text) to anon;\n",
  "revoke all on function public.save_claim(uuid, text, text, bigint, date, uuid, text, text) from public, anon;\n"),
 ("a signed-out caller can read the summary",
  "revoke all on function public.finance_programme_summary()                                 from public, anon;",
  "",
  "grant execute on function public.finance_programme_summary() to anon;\n",
  "revoke all on function public.finance_programme_summary() from public, anon;\n"),
 ("a reviewer is never told",
  "  perform public.finance_notify_reviewers(p_claim, 'An expense claim is waiting', left(v_claim.title, 120));",
  ""),
 ("a claimant is never told",
  "    v_claim.claimant_id, 'finance_claim',\n    case p_decision",
  "    null, 'finance_claim',\n    case p_decision"),
]

# Mutations that need an extra statement rather than a text swap.
EXTRA_MUTATIONS = [
 ("a write policy lets anyone insert a claim directly",
  "create policy b32_mut on public.expense_claims for insert to authenticated with check (true);\ngrant insert on public.expense_claims to authenticated;\n",
  "drop policy if exists b32_mut on public.expense_claims;\nrevoke insert on public.expense_claims from authenticated;\n"),
 ("a write policy lets anyone change a claim directly",
  "create policy b32_mut on public.expense_claims for update to authenticated using (true) with check (true);\ngrant update on public.expense_claims to authenticated;\n",
  "drop policy if exists b32_mut on public.expense_claims;\nrevoke update on public.expense_claims from authenticated;\n"),
 ("a write policy lets anyone write the record directly",
  "create policy b32_mut on public.finance_events for insert to authenticated with check (true);\ngrant insert on public.finance_events to authenticated;\ngrant usage on sequence public.finance_events_id_seq to authenticated;\n",
  "drop policy if exists b32_mut on public.finance_events;\nrevoke insert on public.finance_events from authenticated;\nrevoke all on sequence public.finance_events_id_seq from authenticated;\n"),
]

def run_case(name, sql_text, cleanup=None):
    open("/tmp/b32_mut.sql", "w").write(sql_text)
    ok, err = load("/tmp/b32_mut.sql")
    if not ok:
        return "LOADFAIL", err.strip().splitlines()[-1] if err.strip() else ""
    (passed, failed), out = tests()
    if cleanup:
        open("/tmp/b32_undo.sql", "w").write(cleanup)
        load("/tmp/b32_undo.sql")
    return ("KILLED" if failed != 0 else "SURVIVED"), f"{passed} passed, {failed} failed"

results = []
for entry in MUTATIONS:
    name, old, new = entry[:3]
    add, undo = (entry[3], entry[4]) if len(entry) > 3 else ("", None)
    n = src.count(old)
    if n != 1:
        results.append((name, "BADMATCH", f"pattern found {n} times"))
        continue
    status, detail = run_case(name, src.replace(old, new) + "\n" + add, cleanup=undo)
    results.append((name, status, detail))
    load(SQL)  # back to clean before the next one

for name, add, undo in EXTRA_MUTATIONS:
    status, detail = run_case(name, src + "\n" + add, cleanup=undo)
    results.append((name, status, detail))
    load(SQL)

# clean file once more, tests must pass
load(SQL)
(passed, failed), _ = tests()

width = max(len(n) for n, _, _ in results)
bad = 0
for name, status, detail in results:
    flag = "  ok  " if status == "KILLED" else "  XX  "
    if status != "KILLED":
        bad += 1
    print(f"{flag}{name.ljust(width)}  {status}  ({detail})")
print()
print(f"clean file: {passed} passed, {failed} failed")
print(f"{len(results) - bad} of {len(results)} mutations were caught")
sys.exit(0 if bad == 0 and failed == 0 else 1)
