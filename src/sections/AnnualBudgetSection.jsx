import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { humanise } from "../lib/errors.js";
import { B, inp, sel, ta, btnP, btnG, btnR } from "../theme.js";
import { Card, SHead, Field, StatCard, MiniBar } from "../components/ui.jsx";
import {
  STATUS_WORD, LINE_KINDS, CATEGORIES, CATEGORY_LABEL,
  canPrepareBudget, canApproveBudget, canReadBudget, budgetActions, ACTION_LABEL,
  progress, validateLine, formatNaira, koboToInput, todayLagos,
} from "../lib/budget.js";

// BATCH35-MARKER budget-screen
//
// The year's plan and the year against it. The Financial Secretary
// prepares a budget and its lines; the Board (recorded by the Treasurer or
// the NC) approves it; then the real numbers, drawn from donations, grants
// and claims, are shown against the plan. Every rule is the database's;
// this screen offers only the buttons a person is allowed.

const STATUS_TONE = {
  draft: [B.offWhite, B.muted],
  submitted: ["#FFF7E6", B.gold],
  board_approved: [B.blueLight, B.blue],
  active: ["#E8F5EC", B.green],
  closed: [B.offWhite, B.muted],
};
const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

function Pill({ tone, children }) { const [bg, fg] = tone; return <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>{children}</span>; }

// ---------------------------------------------------------------------------
// The plan-against-actual bars for one budget year.
// ---------------------------------------------------------------------------
export function BudgetVsActual({ va }) {
  if (!va) return null;
  const inc = progress(va.planned_income_kobo, va.actual_income_kobo);
  const exp = progress(va.planned_expenditure_kobo, va.actual_expenditure_kobo);
  const line = (label, p, colour) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: B.muted }}>{formatNaira(p.actual)} of {formatNaira(p.planned)} planned</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <MiniBar value={p.actual} max={p.planned || 1} label={`${label}: ${formatNaira(p.actual)} of ${formatNaira(p.planned)}`} />
        <span style={{ fontSize: 12, whiteSpace: "nowrap", fontWeight: 600, color: p.over ? (label === "Income" ? B.green : B.red) : B.muted }}>
          {Math.round(p.fraction * 100)}%
        </span>
      </div>
    </div>
  );
  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead>Plan against the year</SHead>
      {line("Income", inc, B.green)}
      {line("Expenditure", exp, B.blue)}
      <p style={{ margin: "4px 0 0", fontSize: 12, color: B.muted, lineHeight: 1.6 }}>
        Income is donations received and grants running this year. Expenditure is expense claims approved and paid this year.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// A single budget line, editable in place while the budget is a draft.
// ---------------------------------------------------------------------------
export function LineRow({ line, canEdit, onEdit, onRemove }) {
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "7px 0", borderBottom: "1px solid " + B.offWhite }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: B.black, overflowWrap: "anywhere" }}>{line.label}</div>
        <div style={{ fontSize: 11.5, color: B.muted }}>{CATEGORY_LABEL[line.category] || line.category}{line.chapter_name ? " · " + line.chapter_name : " · organisation-wide"}</div>
      </div>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14 }}>{formatNaira(line.planned_kobo)}</div>
      {canEdit ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => onEdit(line)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5 }}>Edit</button>
          <button type="button" onClick={() => onRemove(line)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5, color: B.red, borderColor: B.red }}>Remove</button>
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The line form.
// ---------------------------------------------------------------------------
export function LineForm({ line, chapters, saving, onSave, onCancel }) {
  const [f, setF] = useState(() => ({
    kind: line ? line.kind : "expenditure",
    category: line ? line.category : "programmes",
    label: line ? line.label : "",
    planned: line ? koboToInput(line.planned_kobo) : "",
    chapter_id: line && line.chapter_id ? line.chapter_id : "",
    note: line && line.note ? line.note : "",
  }));
  const [problem, setProblem] = useState("");
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const cats = CATEGORIES[f.kind] || [];

  function submit(e) {
    e.preventDefault();
    const r = validateLine(f);
    if (!r.ok) return setProblem(r.error);
    setProblem("");
    onSave(r.values);
  }

  return (
    <form onSubmit={submit} noValidate style={{ background: B.offWhite, borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <Field label="Side"><select style={sel} value={f.kind} onChange={(e) => { const k = e.target.value; setF((o) => ({ ...o, kind: k, category: (CATEGORIES[k][0] || [])[0] })); }}>{LINE_KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Category"><select style={sel} value={f.category} onChange={(e) => set("category", e.target.value)}>{cats.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Planned (naira)"><input style={inp} inputMode="decimal" value={f.planned} onChange={(e) => set("planned", e.target.value)} placeholder="0" /></Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 220px" }}>
          <Field label="Label"><input style={inp} value={f.label} maxLength={160} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Benin programmes" /></Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Chapter" hint="Leave blank for organisation-wide.">
            <select style={sel} value={f.chapter_id} onChange={(e) => set("chapter_id", e.target.value)}>
              <option value="">Organisation-wide</option>
              {(chapters || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
      </div>
      {problem ? <p role="alert" style={{ color: B.red, fontSize: 13, margin: "0 0 10px" }}>{problem}</p> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : line ? "Save line" : "Add line"}</button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
export default function AnnualBudgetSection({ profile, chapters, showToast }) {
  const canPrepare = canPrepareBudget(profile);
  const canApprove = canApproveBudget(profile);
  const canRead = canReadBudget(profile);

  const thisYear = Number(todayLagos().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [budget, setBudget] = useState(null);
  const [lines, setLines] = useState([]);
  const [va, setVa] = useState(null);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [savingLine, setSavingLine] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    const [all, bv] = await Promise.all([
      supabase.from("annual_budgets").select("*").order("financial_year", { ascending: false }),
      supabase.rpc("budget_vs_actual", { p_year: year }),
    ]);
    if (all.error) {
      setErr("Could not load the budget. If this keeps happening, the Batch 35 database script may not have been run yet.");
      setLoading(false); return;
    }
    setYears((all.data || []).map((b) => b.financial_year));
    const b = (all.data || []).find((x) => x.financial_year === year) || null;
    setBudget(b);
    setVa(bv.data && bv.data[0] ? bv.data[0] : null);
    if (b) {
      const ln = await supabase.rpc("budget_line_actuals", { p_budget: b.id });
      setLines(ln.data || []);
    } else setLines([]);
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setAddingLine(false); setEditingLine(null); }, [year]);

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

  async function saveLine(values) {
    if (!budget) return;
    setSavingLine(true);
    try {
      const { error } = await supabase.rpc("save_budget_line", { p_line: editingLine ? editingLine.line_id : null, p_budget: budget.id, ...values });
      if (error) throw error;
      showToast("Line saved.");
      setAddingLine(false); setEditingLine(null);
      await load();
    } catch (e) { showToast(humanise(e), "error"); }
    finally { setSavingLine(false); }
  }

  function doAction(a) {
    if (!budget) return;
    if (a === "edit") { setAddingLine(true); return; }
    if (a === "submit") { if (window.confirm("Send this budget to the Board? Its lines will be fixed until they decide.")) run(() => supabase.rpc("submit_annual_budget", { p_budget: budget.id }), "Sent to the Board."); return; }
    if (a === "approve") {
      const minute = window.prompt("Record the Board minute reference for this approval:", "");
      if (minute === null) return;
      if (!minute.trim()) return showToast("An approval needs a Board minute reference.", "error");
      run(() => supabase.rpc("decide_annual_budget", { p_budget: budget.id, p_decision: "approve", p_minute: minute.trim() }), "Board approval recorded.");
      return;
    }
    if (a === "return") { if (window.confirm("Send this budget back to draft for changes?")) run(() => supabase.rpc("decide_annual_budget", { p_budget: budget.id, p_decision: "return" }), "Sent back to draft."); return; }
    if (a === "activate") { run(() => supabase.rpc("set_annual_status", { p_budget: budget.id, p_status: "active" }), "Budget is now active."); return; }
    if (a === "close") { if (window.confirm("Close this budget year?")) run(() => supabase.rpc("set_annual_status", { p_budget: budget.id, p_status: "closed" }), "Budget closed."); return; }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading the budget…</div>;

  const status = budget ? budget.status : null;
  const actions = budget ? budgetActions(profile, status) : [];
  const draft = status === "draft";
  const yearOptions = Array.from(new Set([thisYear, thisYear + 1, ...years])).sort((a, b) => b - a);

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark || B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Annual budget</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          The plan for a financial year, and the year measured against it. The Financial Secretary prepares it and the Board approves it before the year starts. The actual figures come from donations, grants and expense claims already in the Hub.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ fontSize: 12.5, color: B.muted, fontWeight: 600 }}>Financial year</label>
        <select style={{ ...sel, width: "auto" }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {budget ? <Pill tone={STATUS_TONE[status] || STATUS_TONE.draft}>{STATUS_WORD[status]}</Pill> : null}
        {budget && budget.approved_late ? <Pill tone={[B.redLight, B.red]}>Approved late</Pill> : null}
      </div>

      {!budget ? (
        <Card>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: B.muted }}>No budget has been started for {year}.</p>
          {canPrepare ? <button type="button" onClick={() => run(() => supabase.rpc("create_annual_budget", { p_year: year, p_title: null }), "Budget started.")} style={btnP}>Start the {year} budget</button> : null}
        </Card>
      ) : (
        <>
          {va ? <BudgetVsActual va={va} /> : null}

          {budget.board_minute ? (
            <p style={{ margin: "-4px 0 14px", fontSize: 12.5, color: B.muted }}>
              Board approved {fmtDate(budget.approved_on)} · minute {budget.board_minute}{budget.approved_late ? " · recorded after the year had begun" : ""}.
            </p>
          ) : null}

          {actions.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {actions.map((a) => (
                <button key={a} type="button" disabled={busy} onClick={() => doAction(a)}
                  style={a === "return" ? { ...btnG, color: B.red, borderColor: B.red } : a === "edit" ? btnG : btnP}>
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          ) : null}

          <SHead>Budget lines</SHead>
          {addingLine && draft ? <LineForm chapters={chapters} saving={savingLine} onSave={saveLine} onCancel={() => setAddingLine(false)} /> : null}
          {editingLine && draft ? <LineForm line={editingLine} chapters={chapters} saving={savingLine} onSave={saveLine} onCancel={() => setEditingLine(null)} /> : null}

          {lines.length === 0 ? (
            <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>No lines yet.</p></Card>
          ) : (
            <Card>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {lines.map((l) => (
                  <LineRow key={l.line_id} line={l} canEdit={canPrepare && draft}
                    onEdit={(x) => { setEditingLine(x); setAddingLine(false); }}
                    onRemove={(x) => { if (window.confirm("Remove this line?")) run(() => supabase.rpc("remove_budget_line", { p_line: x.line_id }), "Line removed."); }} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
