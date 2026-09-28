#!/usr/bin/env python3
# BATCH39-MARKER stipends
# Mutation check for Batch 39. Break one rule at a time, load the broken
# copy, run the stipend tests, require they FAIL. Clean file loaded last.
#   python3 _harness/mutate-batch39.py   (after batch39 has been loaded)
import subprocess, sys, os, re

SQL = "batch39-stipends.sql"
src = open(SQL).read()

def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True)
def load(path):
    r = sh(f"su postgres -c \"PATH=/usr/lib/postgresql/16/bin:\\$PATH; psql -h /tmp/pg -d ycdi -X -v ON_ERROR_STOP=1 -q -f {os.path.abspath(path)}\"")
    return r.returncode == 0, r.stderr
def tests():
    r = sh("bash _harness/run-batch39-tests.sh")
    m = re.search(r"(\d+) passed, (\d+) failed", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, -1)

MUTATIONS = [
 ("a person can act on their own stipend",
  "     and auth.uid() is distinct from p_profile\n", ""),
 ("the Treasurer covers anyone, not only whoever runs finance",
  "                and public.stipend_person_is_officer(p_profile) )", "                )"),
 ("the NC covers anyone, not only the Financial Secretary",
  "           or ( coalesce(public.dir_role() = 'NC', false)\n                and exists (select 1 from public.nec_portfolios\n                             where portfolio = 'FIN' and profile_id = p_profile) ) )",
  "           or ( coalesce(public.dir_role() = 'NC', false) ) )"),
 ("the NC does not count as running finance while the seat is empty",
  "      or ( exists (select 1 from public.profiles where id = p_profile and role = 'NC')\n           and not exists (select 1 from public.nec_portfolios where portfolio = 'FIN') )\n$$;",
  "$$;"),
 ("a plain admin can search for candidates",
  "  select public.finance_is_officer()\n      or coalesce(public.holds_portfolio('TREAS'), false)",
  "  select public.finance_is_officer()\n      or coalesce(public.is_admin(), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)"),
 ("adding someone does not check who is adding",
  "    if not public.stipend_can_act(p_profile) then\n      raise exception 'You cannot add this person to the stipend list. Nobody adds themselves.';\n    end if;\n", ""),
 ("the same person can be added twice (function check and unique key removed)",
  "    if exists (select 1 from public.stipend_recipients where profile_id = p_profile) then\n      raise exception '% is already on the stipend list. Change their entry instead.', v_name;\n    end if;\n", "",
  "alter table public.stipend_recipients drop constraint if exists stipend_recipients_profile_id_key;\n",
  "delete from public.stipend_payments; delete from public.stipend_recipients;\nalter table public.stipend_recipients add constraint stipend_recipients_profile_id_key unique (profile_id);\n"),
 ("changing an entry does not check who is changing",
  "  if not public.stipend_can_act(v_row.profile_id) then\n    raise exception 'You cannot change this stipend. Nobody changes their own.';\n  end if;\n", ""),
 ("recording a payment does not check who is recording",
  "  if not public.stipend_can_act(v_row.profile_id) then\n    raise exception 'You cannot record this payment. Nobody records their own stipend.';\n  end if;\n", ""),
 ("a payment can fall outside the stipend's months",
  "  if v_month < v_row.start_month or (v_row.end_month is not null and v_month > v_row.end_month) then", "  if false then"),
 ("a payment can be recorded after the stipend ended",
  "  if v_month < v_row.start_month or (v_row.end_month is not null and v_month > v_row.end_month) then", "  if v_month < v_row.start_month then"),
 ("a payment can be recorded for a month not yet started",
  "  if v_month > date_trunc('month', v_today)::date then raise exception 'You cannot record a payment for a month that has not started.'; end if;\n", ""),
 ("an amount off the rate needs no note",
  "  if p_amount_kobo <> v_row.monthly_kobo and (v_note is null or char_length(v_note) < 5) then", "  if false then"),
 ("a future payment date is accepted",
  "  if p_paid_on > v_today then raise exception 'The payment date cannot be in the future.'; end if;\n", ""),
 ("an account number is accepted as a reference (function check and constraint removed)",
  "  if v_ref ~ '^[0-9]{10}$' then", "  if false then",
  "alter table public.stipend_payments drop constraint if exists stipend_payment_ref_not_account_number;\n",
  "delete from public.stipend_payments where payment_ref ~ '^\\s*[0-9]{10}\\s*$';\nalter table public.stipend_payments add constraint stipend_payment_ref_not_account_number check (payment_ref !~ '^\\s*[0-9]{10}\\s*$');\n"),
 ("a month can be paid twice (function check and unique index removed)",
  "  if exists (select 1 from public.stipend_payments where recipient_id = p_recipient and month = v_month and status = 'paid') then", "  if false then",
  "drop index if exists public.stipend_payments_one_per_month;\n",
  "delete from public.stipend_payments;\ncreate unique index if not exists stipend_payments_one_per_month on public.stipend_payments (recipient_id, month) where status = 'paid';\n"),
 ("voiding does not check who is voiding",
  "  if not public.stipend_can_act(v_pay.profile_id) then raise exception 'You cannot void this payment.'; end if;\n", ""),
 ("voiding needs no real reason",
  "  if char_length(v_reason) < 5 then raise exception 'Give a reason for voiding it (at least 5 characters).'; end if;\n", ""),
 ("a voided payment can be voided again",
  "  if v_pay.status = 'voided' then raise exception 'That payment is already voided.'; end if;\n", ""),
 ("a stipend can end before a recorded payment",
  "  if exists (select 1 from public.stipend_payments where recipient_id = p_recipient and status = 'paid' and month > v_end) then\n    raise exception 'Payments are recorded after that month. Void them first, or choose a later month.';\n  end if;\n", ""),
 ("the stipend list is readable by anyone",
  "  for select to authenticated using (public.finance_can_read_all() or profile_id = auth.uid());\ncreate policy stipend_payments_read",
  "  for select to authenticated using (true);\ncreate policy stipend_payments_read"),
 ("a person on the list reads everyone's payments",
  "create policy stipend_payments_read on public.stipend_payments\n  for select to authenticated using (public.finance_can_read_all() or profile_id = auth.uid());",
  "create policy stipend_payments_read on public.stipend_payments\n  for select to authenticated using (public.finance_can_read_all() or profile_id is not null);"),
 ("the month sheet is open to everyone",
  "declare v_month date := date_trunc('month', p_month)::date;\nbegin\n  if not public.finance_can_read_all() then return; end if;",
  "declare v_month date := date_trunc('month', p_month)::date;\nbegin"),
 ("the full list is open to everyone",
  ") language plpgsql stable security definer set search_path = public as $$\nbegin\n  if not public.finance_can_read_all() then return; end if;\n  return query\n  select r.id, r.profile_id, r.recipient_name, r.role_label, ch.name, r.monthly_kobo,\n         r.start_month",
  ") language plpgsql stable security definer set search_path = public as $$\nbegin\n  return query\n  select r.id, r.profile_id, r.recipient_name, r.role_label, ch.name, r.monthly_kobo,\n         r.start_month"),
 ("candidate search is open to everyone",
  "  if not public.stipend_can_manage() then return; end if;\n", ""),
 ("the year summary is open to everyone",
  "declare v_from date := make_date(p_year, 1, 1); v_to date := make_date(p_year, 12, 1);\nbegin\n  if not public.finance_can_read_all() then return; end if;",
  "declare v_from date := make_date(p_year, 1, 1); v_to date := make_date(p_year, 12, 1);\nbegin"),
 ("the year summary counts voided payments",
  "    coalesce((select sum(sp.amount_kobo) from public.stipend_payments sp\n              where sp.status = 'paid' and sp.month between v_from and v_to), 0)::bigint,",
  "    coalesce((select sum(sp.amount_kobo) from public.stipend_payments sp\n              where sp.month between v_from and v_to), 0)::bigint,"),
 ("the annual budget leaves stipends out of actual expenditure",
  "\n      + coalesce((select sum(sp.amount_kobo) from public.stipend_payments sp\n                   where sp.status = 'paid' and extract(year from sp.month) = b.financial_year),0) )::bigint",
  " )::bigint"),
 ("the stipend tables allow a direct insert",
  "revoke all on public.stipend_recipients, public.stipend_payments from anon, authenticated;", "",
  "create policy b39_mut on public.stipend_recipients for insert to authenticated with check (true);\ngrant insert on public.stipend_recipients to authenticated;\n",
  "drop policy if exists b39_mut on public.stipend_recipients;\nrevoke insert on public.stipend_recipients from authenticated;\ndelete from public.stipend_payments; delete from public.stipend_recipients;\n"),
 ("the stipend logger is callable by a signed-in user",
  "revoke all on function public.stipend_log(text, uuid, bigint, text) from public, anon, authenticated;",
  "grant execute on function public.stipend_log(text, uuid, bigint, text) to authenticated;"),
]

def run_case(text, cleanup=None):
    open("/tmp/b39_mut.sql","w").write(text)
    ok, err = load("/tmp/b39_mut.sql")
    if not ok: return "LOADFAIL", (err.strip().splitlines() or [""])[-1]
    p, f = tests()
    if cleanup: open("/tmp/b39_undo.sql","w").write(cleanup); load("/tmp/b39_undo.sql")
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
