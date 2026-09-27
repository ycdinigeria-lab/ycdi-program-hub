#!/usr/bin/env python3
# BATCH34-MARKER donations
# Mutation check for Batch 34. Break one rule at a time, load the broken
# copy, run the donation tests, and require they FAIL. The clean file is
# loaded again at the end and must pass.
#   python3 _harness/mutate-batch34.py   (after setup.sh has loaded batch34)
import subprocess, sys, os, re

SQL = "batch34-donations.sql"
src = open(SQL).read()

def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True)
def load(path):
    r = sh(f"su postgres -c \"PATH=/usr/lib/postgresql/16/bin:\\$PATH; psql -h /tmp/pg -d ycdi -X -v ON_ERROR_STOP=1 -q -f {os.path.abspath(path)}\"")
    return r.returncode == 0, r.stderr
def tests():
    r = sh("bash _harness/run-batch34-tests.sh")
    m = re.search(r"(\d+) passed, (\d+) failed", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, -1)

MUTATIONS = [
 ("a plain admin can read donations",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.is_admin(), false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;"),
 ("the Treasurer cannot read donations",
  "      or coalesce(public.holds_portfolio('DNC'), false)\n      or coalesce(public.holds_portfolio('TREAS'), false)\n$$;",
  "      or coalesce(public.holds_portfolio('DNC'), false)\n$$;"),
 ("the Deputy can manage donations",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n$$;",
  "  select coalesce(public.dir_role() = 'NC', false)\n      or coalesce(public.holds_portfolio('FIN'), false)\n      or coalesce(public.holds_portfolio('DNC'), false)\n$$;"),
 ("record_donation does not check the manager",
  "  if not public.donations_can_manage() then raise exception 'You cannot record donations.'; end if;",
  ""),
 ("a future date is accepted",
  "  if p_received_on > (now() at time zone 'Africa/Lagos')::date then raise exception 'The date received cannot be in the future.'; end if;",
  ""),
 ("a restricted gift needs no note (function)",
  "  if p_designation = 'restricted' and (p_restricted_to is null or btrim(p_restricted_to) = '') then\n    raise exception 'A restricted gift needs a note saying what it is restricted to.';\n  end if;\n  if p_campaign is not null and p_campaign not in\n     ('january_launch','easter_mission','may_donor_night','back_to_school','year_end','impact_report','general') then\n    raise exception 'Unknown campaign.';\n  end if;\n  if v_ref is not null and v_ref ~ '^[0-9]{10}$' then\n    raise exception 'That looks like a bank account number. Enter the transfer reference instead. The Hub does not store account numbers.';\n  end if;",
  "  if p_campaign is not null and p_campaign not in\n     ('january_launch','easter_mission','may_donor_night','back_to_school','year_end','impact_report','general') then\n    raise exception 'Unknown campaign.';\n  end if;",
  "alter table public.donations drop constraint if exists donations_restricted_has_text;\nalter table public.donations drop constraint if exists donations_ref_not_account_number;\n",
  "alter table public.donations add constraint donations_restricted_has_text check (designation <> 'restricted' or (restricted_to is not null and btrim(restricted_to) <> ''));\nalter table public.donations add constraint donations_ref_not_account_number check (reference is null or reference !~ '^\\s*[0-9]{10}\\s*$');\n"),
 ("an account number is accepted as a reference (both checks removed)",
  "  if v_ref is not null and v_ref ~ '^[0-9]{10}$' then\n    raise exception 'That looks like a bank account number. Enter the transfer reference instead. The Hub does not store account numbers.';\n  end if;",
  "",
  "alter table public.donations drop constraint if exists donations_ref_not_account_number;\n",
  "alter table public.donations add constraint donations_ref_not_account_number check (reference is null or reference !~ '^\\s*[0-9]{10}\\s*$');\n"),
 ("an unknown donor contact is accepted (function and FK removed)",
  "  if p_donor_id is not null and not exists (select 1 from public.audience_contacts where id = p_donor_id) then\n    raise exception 'That donor contact does not exist.';\n  end if;\n\n  insert into public.donations",
  "\n  insert into public.donations",
  "alter table public.donations drop constraint if exists donations_donor_id_fkey;\n",
  "alter table public.donations add constraint donations_donor_id_fkey foreign key (donor_id) references public.audience_contacts(id) on delete set null;\n"),
 ("correct_donation does not check the manager",
  "  if not public.donations_can_manage() then raise exception 'You cannot manage donations.'; end if;\n  select status, amount_kobo into v_status, v_old from public.donations where id = p_id for update;",
  "  select status, amount_kobo into v_status, v_old from public.donations where id = p_id for update;"),
 ("a voided gift can be corrected",
  "  if v_status = 'voided' then raise exception 'A voided donation cannot be corrected.'; end if;",
  ""),
 ("acknowledge does not check the manager",
  "  if not public.donations_can_manage() then raise exception 'You cannot manage donations.'; end if;\n  select status into v_status from public.donations where id = p_id for update;",
  "  select status into v_status from public.donations where id = p_id for update;"),
 ("void does not check the manager",
  "  if not public.donations_can_manage() then raise exception 'You cannot manage donations.'; end if;\n  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Say why the donation is being voided.'; end if;",
  "  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Say why the donation is being voided.'; end if;"),
 ("a void needs no reason",
  "  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Say why the donation is being voided.'; end if;",
  ""),
 ("a voided gift is not marked voided",
  "  update public.donations set status = 'voided', void_reason = v_reason, updated_at = now() where id = p_id;",
  "  update public.donations set status = 'active', void_reason = v_reason, updated_at = now() where id = p_id;"),
 ("the tier bands are wrong",
  "    when p_kobo >= 50000000 then 'champion'\n    when p_kobo >= 10000000 then 'partner'\n    when p_kobo >=  2000000 then 'supporter'\n    when p_kobo >         0 then 'friend'",
  "    when p_kobo >= 50000000 then 'champion'\n    when p_kobo >= 10000000 then 'partner'\n    when p_kobo >=  5000000 then 'supporter'\n    when p_kobo >         0 then 'friend'"),
 ("the by-donor figures are open to everyone",
  "   where public.donations_can_read()\n     and d.status = 'active'\n     and extract(year from d.received_on) = yr.y",
  "   where true\n     and d.status = 'active'\n     and extract(year from d.received_on) = yr.y"),
 ("the by-donor figures count voided gifts",
  "   where public.donations_can_read()\n     and d.status = 'active'\n     and extract(year from d.received_on) = yr.y",
  "   where public.donations_can_read()\n     and extract(year from d.received_on) = yr.y"),
 ("the overview is open to everyone",
  "  if not public.donations_can_read() then return; end if;",
  ""),
 ("the overview counts voided gifts in the total",
  "    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and extract(year from received_on)=v_year)::bigint,\n    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and designation='restricted'",
  "    (select coalesce(sum(amount_kobo),0) from public.donations where extract(year from received_on)=v_year)::bigint,\n    (select coalesce(sum(amount_kobo),0) from public.donations where status='active' and designation='restricted'"),
 ("the donations table is readable by anyone",
  "create policy donations_read on public.donations\n  for select to authenticated using (public.donations_can_read());",
  "create policy donations_read on public.donations\n  for select to authenticated using (true);"),
 ("the ledger's donation clause lets anyone read",
  "    or (donation_id is not null and public.donations_can_read())",
  "    or (donation_id is not null)"),
 ("the donations table allows a direct insert",
  "revoke all on public.donations from anon, authenticated;",
  "",
  "create policy b34_mut on public.donations for insert to authenticated with check (true);\ngrant insert on public.donations to authenticated;\ngrant usage on sequence public.donations_donation_no_seq to authenticated;\n",
  "drop policy if exists b34_mut on public.donations;\nrevoke insert on public.donations from authenticated;\nrevoke all on sequence public.donations_donation_no_seq from authenticated;\n"),
 ("the donation logger is callable by a signed-in user",
  "revoke all on function public.donation_log(text, uuid, bigint, text) from public, anon, authenticated;",
  "grant execute on function public.donation_log(text, uuid, bigint, text) to authenticated;"),
]

def run_case(text, cleanup=None):
    open("/tmp/b34_mut.sql","w").write(text)
    ok, err = load("/tmp/b34_mut.sql")
    if not ok: return "LOADFAIL", (err.strip().splitlines() or [""])[-1]
    p, f = tests()
    if cleanup: open("/tmp/b34_undo.sql","w").write(cleanup); load("/tmp/b34_undo.sql")
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
