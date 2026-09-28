import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { humanise } from "../lib/errors.js";
import { B, inp, sel, btnP, btnG } from "../theme.js";
import { Card, SHead, Field, StatCard } from "../components/ui.jsx";
import {
  formatNaira, koboToInput, todayLagos, thisMonth, monthToDate, dateToMonth, addMonths,
  monthLabel, spanLabel, endedBy, suggestLabel, candidateLine,
  validateRecipient, validatePayment, sheetTotals, yearPosition,
} from "../lib/stipends.js";

// BATCH39-MARKER stipends-screen
//
// Monthly stipends for volunteer leaders. The Financial Secretary keeps
// the list (any existing member can be added, each at their own amount)
// and records each month's payment with its date and transfer reference.
// The NC and the Treasurer read, and cover the cases where the Financial
// Secretary would otherwise be paying themselves. Every rule is the
// database's; this screen offers only the buttons a person is allowed.

const tabBtn = (on) => ({
  background: on ? B.blue : B.white, color: on ? B.white : B.muted, border: "1px solid " + (on ? B.blue : B.border),
  borderRadius: 20, padding: "7px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
});
const small = { ...btnG, padding: "4px 10px", fontSize: 11.5 };
const fmtDay = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

function Pill({ bg, fg, children }) {
  return <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>{children}</span>;
}

// ---------------------------------------------------------------------------
// The year at a glance: planned in the budget, committed by the list, paid.
// ---------------------------------------------------------------------------
export function YearStrip({ summary, year }) {
  const y = yearPosition(summary);
  if (!y) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatCard label={`Budgeted for ${year}`} value={y.hasPlan ? formatNaira(y.planned) : "Not budgeted"} />
        <StatCard label="The list commits" value={formatNaira(y.committed)} accent={y.overPlan ? B.red : B.gold} />
        <StatCard label={`Paid for ${year}`} value={formatNaira(y.paid)} accent={B.green} />
      </div>
      {y.overPlan ? (
        <p role="status" style={{ margin: "8px 0 0", fontSize: 12.5, color: B.red, lineHeight: 1.6 }}>
          The stipend list commits {formatNaira(y.committed - y.planned)} more than the {year} budget sets aside for stipends.
        </p>
      ) : !y.hasPlan ? (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
          The {year} budget has no Stipends line yet. Policy pays stipends only where they are budgeted, so add one in Annual Budget.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recording one month's payment.
// ---------------------------------------------------------------------------
export function PaymentForm({ row, month, saving, onSave, onCancel, today = todayLagos() }) {
  const [f, setF] = useState({ amount: koboToInput(row.monthly_kobo), paid_on: today, ref: "", note: "" });
  const [problem, setProblem] = useState("");
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  function submit(e) {
    e.preventDefault();
    const r = validatePayment(f, { monthlyKobo: row.monthly_kobo, today });
    if (!r.ok) return setProblem(r.error);
    setProblem("");
    onSave(r.values);
  }
  return (
    <form onSubmit={submit} noValidate style={{ background: B.offWhite, borderRadius: 8, padding: 12, margin: "8px 0 4px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{row.recipient_name} · {monthLabel(month)}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 130px" }}><Field label="Amount paid (naira)"><input style={inp} inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></Field></div>
        <div style={{ flex: "1 1 140px" }}><Field label="Day paid"><input style={inp} type="date" max={today} value={f.paid_on} onChange={(e) => set("paid_on", e.target.value)} /></Field></div>
        <div style={{ flex: "1 1 160px" }}><Field label="Transfer reference" hint="Never an account number."><input style={inp} maxLength={60} value={f.ref} onChange={(e) => set("ref", e.target.value)} /></Field></div>
      </div>
      <Field label="Note" hint="Needed only if the amount differs from the monthly rate.">
        <input style={inp} maxLength={500} value={f.note} onChange={(e) => set("note", e.target.value)} />
      </Field>
      {problem ? <p role="alert" style={{ color: B.red, fontSize: 13, margin: "0 0 10px" }}>{problem}</p> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Record as paid"}</button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// One person on the month's sheet.
// ---------------------------------------------------------------------------
export function SheetRow({ row, onRecord, onVoid }) {
  const paid = !!row.payment_id;
  const differs = paid && Number(row.paid_kobo) !== Number(row.monthly_kobo);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 0", borderBottom: "1px solid " + B.offWhite }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: B.black, overflowWrap: "anywhere" }}>{row.recipient_name}</div>
        <div style={{ fontSize: 11.5, color: B.muted }}>{row.role_label}{row.chapter_name && !String(row.role_label).includes(row.chapter_name) ? " · " + row.chapter_name : ""}</div>
        {paid ? (
          <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2 }}>
            Paid {fmtDay(row.paid_on)} · ref {row.payment_ref}{differs ? ` · ${formatNaira(row.paid_kobo)}` : ""}{row.payment_note ? ` · ${row.payment_note}` : ""}
          </div>
        ) : null}
      </div>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14 }}>{formatNaira(row.monthly_kobo)}</div>
      {paid ? <Pill bg="#E8F5EC" fg={B.green}>Paid</Pill> : <Pill bg="#FFF7E6" fg={B.gold}>Not yet paid</Pill>}
      {row.can_act ? (
        paid
          ? <button type="button" onClick={() => onVoid(row)} style={small}>Void</button>
          : <button type="button" onClick={() => onRecord(row)} style={{ ...small, color: B.blue, borderColor: B.blue }}>Record payment</button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finding a member to add. Any existing Hub member, by name or chapter.
// ---------------------------------------------------------------------------
export function CandidatePicker({ onPick, onCancel }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.rpc("stipend_candidates", { p_search: q.trim() || null });
      if (mine === seq.current) { setRows(data || []); setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead>Add a volunteer to the stipend list</SHead>
      <Field label="Search by name or chapter">
        <input style={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Benin, or a name" autoFocus />
      </Field>
      {loading ? <p style={{ fontSize: 12.5, color: B.muted, margin: 0 }}>Searching…</p> : rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: B.muted, margin: 0 }}>Nobody matches that.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 340, overflowY: "auto" }}>
          {rows.map((c) => (
            <CandidateRow key={c.profile_id} c={c} onPick={onPick} />
          ))}
        </ul>
      )}
      <div style={{ marginTop: 12 }}><button type="button" onClick={onCancel} style={btnG}>Cancel</button></div>
    </Card>
  );
}

export function CandidateRow({ c, onPick }) {
  const why = c.on_list ? "Already on the list" : !c.can_act ? "You can't add yourself" : "";
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid " + B.offWhite }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{c.full_name}</div>
        <div style={{ fontSize: 11.5, color: B.muted }}>{candidateLine(c)}</div>
      </div>
      {why ? <span style={{ fontSize: 11.5, color: B.muted }}>{why}</span>
        : <button type="button" onClick={() => onPick(c)} style={{ ...small, color: B.blue, borderColor: B.blue }}>Choose</button>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The list form: a new entry (with the chosen person) or a change.
// ---------------------------------------------------------------------------
export function RecipientForm({ recipient, candidate, saving, onSave, onCancel, today = todayLagos() }) {
  const isNew = !recipient;
  const [f, setF] = useState(() => ({
    profile_id: candidate ? candidate.profile_id : null,
    role_label: recipient ? recipient.role_label : suggestLabel(candidate),
    monthly: recipient ? koboToInput(recipient.monthly_kobo) : "",
    start: recipient ? dateToMonth(recipient.start_month) : thisMonth(today),
    end: recipient ? dateToMonth(recipient.end_month) : "",
    approval_ref: recipient && recipient.approval_ref ? recipient.approval_ref : "",
    note: recipient && recipient.note ? recipient.note : "",
  }));
  const [problem, setProblem] = useState("");
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const name = recipient ? recipient.recipient_name : candidate ? candidate.full_name : "";
  function submit(e) {
    e.preventDefault();
    const r = validateRecipient(f, { isNew });
    if (!r.ok) return setProblem(r.error);
    setProblem("");
    onSave(r.values);
  }
  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead>{isNew ? `Add ${name}` : `Change ${name}'s stipend`}</SHead>
      <form onSubmit={submit} noValidate>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 220px" }}><Field label="Stipend for"><input style={inp} maxLength={120} value={f.role_label} onChange={(e) => set("role_label", e.target.value)} placeholder="e.g. Regional Coordinator, Benin" /></Field></div>
          <div style={{ flex: "1 1 140px" }}><Field label="Monthly amount (naira)"><input style={inp} inputMode="decimal" value={f.monthly} onChange={(e) => set("monthly", e.target.value)} placeholder="0" /></Field></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 150px" }}><Field label="First month"><input style={inp} type="month" placeholder="YYYY-MM" value={f.start} onChange={(e) => set("start", e.target.value)} /></Field></div>
          <div style={{ flex: "1 1 150px" }}><Field label="Last month" hint="Leave blank while it continues."><input style={inp} type="month" placeholder="YYYY-MM" value={f.end} onChange={(e) => set("end", e.target.value)} /></Field></div>
          <div style={{ flex: "2 1 200px" }}><Field label="Approved by" hint="Minute or letter reference, if there is one."><input style={inp} maxLength={120} value={f.approval_ref} onChange={(e) => set("approval_ref", e.target.value)} /></Field></div>
        </div>
        <Field label="Note"><input style={inp} maxLength={500} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
        {problem ? <p role="alert" style={{ color: B.red, fontSize: 13, margin: "0 0 10px" }}>{problem}</p> : null}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : isNew ? "Add to the list" : "Save changes"}</button>
          <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One entry on the list.
// ---------------------------------------------------------------------------
export function RecipientRow({ r, currentMonth, onEdit, onEnd }) {
  const ended = endedBy(r, currentMonth);
  const notStarted = dateToMonth(r.start_month) > currentMonth;
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 0", borderBottom: "1px solid " + B.offWhite, opacity: ended ? 0.65 : 1 }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: B.black, overflowWrap: "anywhere" }}>{r.recipient_name}</div>
        <div style={{ fontSize: 11.5, color: B.muted }}>{r.role_label} · {spanLabel(r.start_month, r.end_month)}</div>
        <div style={{ fontSize: 11.5, color: B.muted }}>
          {r.last_paid_month ? `Last paid: ${monthLabel(dateToMonth(r.last_paid_month))}` : "No payment recorded yet"}
          {r.approval_ref ? ` · approved ${r.approval_ref}` : ""}
        </div>
      </div>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14 }}>{formatNaira(r.monthly_kobo)}<span style={{ fontSize: 11, fontWeight: 600, color: B.muted }}> /month</span></div>
      {ended ? <Pill bg={B.offWhite} fg={B.muted}>Ended</Pill> : notStarted ? <Pill bg={B.blueLight} fg={B.blue}>Starts {monthLabel(dateToMonth(r.start_month))}</Pill> : null}
      {r.can_act ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => onEdit(r)} style={small}>Change</button>
          {!r.end_month ? <button type="button" onClick={() => onEnd(r)} style={small}>End</button> : null}
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
export default function StipendsSection({ profile, showToast }) {
  const today = todayLagos();
  const current = thisMonth(today);
  const [tab, setTab] = useState("month");
  const [month, setMonth] = useState(current);
  const [sheet, setSheet] = useState([]);
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [finHolder, setFinHolder] = useState(undefined);

  const year = Number(month.slice(0, 4));

  const load = useCallback(async () => {
    setErr("");
    const [sh, ls, su, fin] = await Promise.all([
      supabase.rpc("stipend_month_sheet", { p_month: monthToDate(month) }),
      supabase.rpc("stipend_list"),
      supabase.rpc("stipend_year_summary", { p_year: year }),
      supabase.from("nec_portfolios").select("profile_id").eq("portfolio", "FIN").maybeSingle(),
    ]);
    if (sh.error || ls.error) {
      setErr("Could not load stipends. If this keeps happening, the Batch 39 database script may not have been run yet.");
      setLoading(false); return;
    }
    setSheet(sh.data || []);
    setList(ls.data || []);
    setSummary(su.data && su.data[0] ? su.data[0] : null);
    setFinHolder(fin && fin.data ? fin.data.profile_id : null);
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPaying(null); }, [month, tab]);

  async function run(fn, done) {
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.error) throw r.error;
      if (done) showToast(done);
      await load();
      return true;
    } catch (e) { showToast(humanise(e), "error"); return false; }
    finally { setBusy(false); }
  }

  async function record(row, values) {
    const ok = await run(() => supabase.rpc("record_stipend_payment", { p_recipient: row.recipient_id, p_month: monthToDate(month), ...values }),
      `${row.recipient_name}'s ${monthLabel(month)} stipend recorded as paid.`);
    if (ok) setPaying(null);
  }

  function voidPayment(row) {
    const reason = window.prompt(`Void ${row.recipient_name}'s ${monthLabel(month)} payment? It stays on the record but drops out of the totals, and the month can be recorded again.\n\nReason:`, "");
    if (reason === null) return;
    if (reason.trim().length < 5) return showToast("Give a reason of at least five characters.", "error");
    run(() => supabase.rpc("void_stipend_payment", { p_payment: row.payment_id, p_reason: reason.trim() }), "Payment voided.");
  }

  async function saveRecipient(values) {
    const ok = await run(() => supabase.rpc("save_stipend_recipient", { p_recipient: editing ? editing.recipient_id : null, ...values }),
      editing ? "Stipend updated." : "Added to the stipend list.");
    if (ok) { setEditing(null); setChosen(null); setPicking(false); }
  }

  function endStipend(r) {
    const last = window.prompt(`End ${r.recipient_name}'s stipend. Which is the last month it is paid for? (YYYY-MM)`, addMonths(current, -1) >= dateToMonth(r.start_month) ? addMonths(current, -1) : dateToMonth(r.start_month));
    if (last === null) return;
    if (!/^\d{4}-\d{2}$/.test(last.trim())) return showToast("Give the month as YYYY-MM, for example 2026-09.", "error");
    run(() => supabase.rpc("end_stipend", { p_recipient: r.recipient_id, p_last_month: monthToDate(last.trim()) }), "Stipend ended.");
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading stipends…</div>;

  const t = sheetTotals(sheet);
  // Whoever runs finance adds people: the FIN holder, or the NC while the
  // seat is empty. The Treasurer only covers that person's own stipend.
  const runsFinance = (profile.portfolios || []).includes("FIN") || (profile.role === "NC" && finHolder === null);
  const anyAct = runsFinance || list.some((r) => r.can_act);
  const formOpen = picking || chosen || editing;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark || B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Stipends</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Monthly stipends for volunteer leaders, as the Remuneration Policy allows where they are budgeted. The Financial Secretary keeps the list and records each month's payment. Nobody records their own. This page records money, never moves it, and never stores an account number.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      <YearStrip summary={summary} year={year} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setTab("month")} style={tabBtn(tab === "month")}>Monthly payments</button>
        <button type="button" onClick={() => setTab("list")} style={tabBtn(tab === "list")}>Stipend list ({list.length})</button>
      </div>

      {tab === "month" ? (
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} style={small}>‹</button>
            <input aria-label="Month" type="month" placeholder="YYYY-MM" style={{ ...inp, width: "auto" }} value={month} max={current}
              onChange={(e) => e.target.value && setMonth(e.target.value.slice(0, 7))} />
            <button type="button" aria-label="Next month" disabled={month >= current} onClick={() => setMonth(addMonths(month, 1))} style={{ ...small, opacity: month >= current ? 0.4 : 1 }}>›</button>
            {t.count ? (
              <span style={{ fontSize: 12.5, color: B.muted }}>
                {t.paidCount} of {t.count} paid · {formatNaira(t.paid)} of {formatNaira(t.due)}
              </span>
            ) : null}
          </div>
          {sheet.length === 0 ? (
            <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>Nobody is on stipend for {monthLabel(month)}.</p></Card>
          ) : (
            <Card>
              {sheet.map((row) => (
                <div key={row.recipient_id}>
                  <SheetRow row={row} onRecord={setPaying} onVoid={voidPayment} />
                  {paying && paying.recipient_id === row.recipient_id ? (
                    <PaymentForm row={row} month={month} saving={busy} today={today}
                      onSave={(v) => record(row, v)} onCancel={() => setPaying(null)} />
                  ) : null}
                </div>
              ))}
            </Card>
          )}
        </div>
      ) : null}

      {tab === "list" ? (
        <div>
          {!formOpen && anyAct ? (
            <div style={{ marginBottom: 14 }}>
              <button type="button" onClick={() => setPicking(true)} style={btnP}>Add a volunteer</button>
            </div>
          ) : null}
          {picking && !chosen ? <CandidatePicker onPick={(c) => { setChosen(c); setPicking(false); }} onCancel={() => setPicking(false)} /> : null}
          {chosen ? <RecipientForm key={"new-" + chosen.profile_id} candidate={chosen} saving={busy} today={today} onSave={saveRecipient} onCancel={() => setChosen(null)} /> : null}
          {editing ? <RecipientForm key={"edit-" + editing.recipient_id} recipient={editing} saving={busy} today={today} onSave={saveRecipient} onCancel={() => setEditing(null)} /> : null}

          {list.length === 0 ? (
            <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>Nobody is on the stipend list yet.</p></Card>
          ) : (
            <Card>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {list.map((r) => (
                  <RecipientRow key={r.recipient_id} r={r} currentMonth={current}
                    onEdit={(x) => { setEditing(x); setChosen(null); setPicking(false); }} onEnd={endStipend} />
                ))}
              </ul>
            </Card>
          )}
          <p style={{ fontSize: 12, color: B.muted, margin: "10px 0 0", lineHeight: 1.6 }}>
            Changing an amount applies to months not yet paid. Payments already recorded keep the amount they were paid at.
          </p>
        </div>
      ) : null}
    </div>
  );
}
