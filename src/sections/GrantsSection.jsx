import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { humanise } from "../lib/errors.js";
import { B, inp, sel, ta, btnP, btnG, btnR } from "../theme.js";
import { Card, SHead, Field, StatCard, MiniBar } from "../components/ui.jsx";
import {
  GRANT_STATUSES, STATUS_WORD, nextStatuses, OBLIGATION_KINDS, OBLIGATION_KIND_LABEL,
  OBLIGATION_STATUS_WORD, obligationDue, canManageGrants, canReadGrants, canFundProgrammes,
  spentFraction, validateGrant, formatNaira, parseNairaToKobo, koboToInput, todayLagos,
} from "../lib/grants.js";

// BATCH33-MARKER grants-screen
//
// The grants register and its restricted funds. A grant records the money
// coming in and the strings on it: the funder, the amount, the period,
// what it is restricted to, the reporting deadlines, and which programmes
// it pays for. The Hub records grants; it never moves money.
//
// The database (Batch 33) decides every access rule. This screen shows a
// person only the buttons they are allowed, using the same rules from
// lib/grants.js, so nobody is offered a door the database will shut.

const STATUS_TONE = {
  prospect: [B.offWhite, B.muted],
  applied: ["#FFF7E6", B.gold],
  awarded: [B.blueLight, B.blue],
  active: ["#E8F5EC", B.green],
  reporting: ["#FFF7E6", B.gold],
  closed: [B.offWhite, B.muted],
  declined: [B.redLight, B.red],
};
const DUE_TONE = { ok: [B.offWhite, B.muted], soon: ["#FFF7E6", B.gold], late: [B.redLight, B.red], done: ["#E8F5EC", B.green], waived: [B.offWhite, B.muted] };

const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtStamp = (t) => (t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function Pill({ tone, children }) {
  const [bg, fg] = tone;
  return <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>{children}</span>;
}

const tabBtn = (on) => ({
  background: on ? B.blue : B.white, color: on ? B.white : B.muted, border: "1px solid " + (on ? B.blue : B.border),
  borderRadius: 20, padding: "7px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
});

// ---------------------------------------------------------------------------
// One grant, as a card. Presentational: shows the money and the status, and
// the moves this person is offered.
// ---------------------------------------------------------------------------
export function GrantCard({ row, canManage, open, onOpen, children }) {
  const spent = Number(row.committed_kobo) + Number(row.paid_kobo);
  const restricted = row.is_restricted;
  return (
    <Card style={{ marginBottom: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: B.black, overflowWrap: "anywhere" }}>{row.title}</div>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.6 }}>
            {row.funder_name}
            {row.reference ? " · " + row.reference : ""}
            {row.period_end ? " · to " + fmtDate(row.period_end) : ""}
            {row.programmes ? ` · ${row.programmes} programme${row.programmes === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 17, color: B.black }}>{formatNaira(row.awarded_kobo)}</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
            <Pill tone={STATUS_TONE[row.status] || STATUS_TONE.prospect}>{STATUS_WORD[row.status] || row.status}</Pill>
            <Pill tone={restricted ? [B.blueLight, B.blue] : [B.offWhite, B.muted]}>{restricted ? "Restricted" : "Unrestricted"}</Pill>
            {row.obligations_overdue > 0 ? <Pill tone={[B.redLight, B.red]}>{row.obligations_overdue} overdue</Pill> : null}
            {row.over_allocated ? <Pill tone={[B.redLight, B.red]}>Over-allocated</Pill> : null}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 4px" }}>
        <MiniBar value={spent} max={Number(row.awarded_kobo) || 1} label={`${row.title}: ${formatNaira(spent)} spent of ${formatNaira(row.awarded_kobo)}`} />
        <span style={{ fontSize: 12, color: Number(row.remaining_kobo) < 0 ? B.red : B.muted, whiteSpace: "nowrap", fontWeight: 600 }}>
          {Number(row.remaining_kobo) < 0 ? formatNaira(-row.remaining_kobo) + " over" : formatNaira(row.remaining_kobo) + " left"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: B.muted, marginBottom: 4 }}>
        <span>Allocated <strong style={{ color: B.black }}>{formatNaira(row.allocated_kobo)}</strong></span>
        <span>Approved, unpaid <strong style={{ color: B.black }}>{formatNaira(row.committed_kobo)}</strong></span>
        <span>Paid <strong style={{ color: B.black }}>{formatNaira(row.paid_kobo)}</strong></span>
        {row.obligations_open ? <span>Deadlines open <strong style={{ color: B.black }}>{row.obligations_open}</strong></span> : null}
      </div>
      <button type="button" onClick={() => onOpen(row)} aria-expanded={!!open} style={{ ...btnG, marginTop: 8 }}>
        {open ? "Hide details" : (canManage ? "Manage" : "Details")}
      </button>
      {open ? <div style={{ marginTop: 14, borderTop: "1px solid " + B.offWhite, paddingTop: 14 }}>{children}</div> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The buttons that move a grant to its next stage.
// ---------------------------------------------------------------------------
export function StatusButtons({ status, busy, onMove }) {
  const moves = nextStatuses(status);
  if (!moves.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {moves.map((s) => (
        <button key={s} type="button" disabled={busy} onClick={() => onMove(s)}
          style={s === "declined" || s === "closed" ? { ...btnG, color: s === "declined" ? B.red : B.muted, borderColor: s === "declined" ? B.red : B.border } : btnP}>
          {s === "applied" ? "Mark applied" : s === "awarded" ? "Mark awarded" : s === "active" ? "Mark active"
            : s === "reporting" ? "Move to reporting" : s === "closed" ? "Close grant" : "Mark declined"}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Writing or editing a grant.
// ---------------------------------------------------------------------------
export function GrantForm({ grant, funders, saving, onSave, onCancel }) {
  const [f, setF] = useState(() => ({
    title: grant ? grant.title : "",
    funder_name: grant ? grant.funder_name : "",
    funder_id: grant && grant.funder_id ? grant.funder_id : "",
    reference: grant && grant.reference ? grant.reference : "",
    awarded: grant ? koboToInput(grant.awarded_kobo) : "",
    is_restricted: grant ? grant.is_restricted : true,
    restrictions: grant && grant.restrictions ? grant.restrictions : "",
    purpose: grant && grant.purpose ? grant.purpose : "",
    period_start: grant && grant.period_start ? grant.period_start : "",
    period_end: grant && grant.period_end ? grant.period_end : "",
  }));
  const [problem, setProblem] = useState("");
  const set = (k, v) => setF((old) => ({ ...old, [k]: v }));

  function submit(e) {
    e.preventDefault();
    const r = validateGrant(f);
    if (!r.ok) return setProblem(r.error);
    setProblem("");
    onSave(r.values);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Grant title" required>
        <input style={inp} value={f.title} maxLength={160} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Ford Foundation literacy grant" />
      </Field>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 220px" }}>
          <Field label="Funder" required hint="Pick a funder from your contacts, or just type the name.">
            {funders && funders.length ? (
              <select style={sel} value={f.funder_id} onChange={(e) => {
                const id = e.target.value;
                const match = funders.find((x) => x.id === id);
                setF((old) => ({ ...old, funder_id: id, funder_name: match ? match.full_name : old.funder_name }));
              }}>
                <option value="">Type the name below</option>
                {funders.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
              </select>
            ) : <input style={inp} value={f.funder_name} maxLength={160} onChange={(e) => set("funder_name", e.target.value)} placeholder="Funder name" />}
          </Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Their reference" hint="The funder's own grant number, if any.">
            <input style={inp} value={f.reference} maxLength={80} onChange={(e) => set("reference", e.target.value)} />
          </Field>
        </div>
      </div>
      {funders && funders.length && f.funder_id ? null : (funders && funders.length ? (
        <Field label="Funder name" required>
          <input style={inp} value={f.funder_name} maxLength={160} onChange={(e) => set("funder_name", e.target.value)} placeholder="Funder name" />
        </Field>
      ) : null)}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Amount awarded (naira)" hint="Leave blank while it is still a prospect.">
            <input style={inp} inputMode="decimal" value={f.awarded} onChange={(e) => set("awarded", e.target.value)} placeholder="0" />
          </Field>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <Field label="Period start"><input style={inp} type="date" value={f.period_start} onChange={(e) => set("period_start", e.target.value)} /></Field>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <Field label="Period end"><input style={inp} type="date" value={f.period_end} onChange={(e) => set("period_end", e.target.value)} /></Field>
        </div>
      </div>
      <Field label="Restriction">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: B.black }}>
          <input type="checkbox" checked={f.is_restricted} onChange={(e) => set("is_restricted", e.target.checked)} />
          This money is restricted to a specific purpose
        </label>
      </Field>
      {f.is_restricted ? (
        <Field label="What it is restricted to" required hint="What the money may and may not be spent on.">
          <textarea style={ta} value={f.restrictions} maxLength={2000} onChange={(e) => set("restrictions", e.target.value)} />
        </Field>
      ) : null}
      <Field label="Purpose and notes">
        <textarea style={ta} value={f.purpose} maxLength={2000} onChange={(e) => set("purpose", e.target.value)} />
      </Field>
      {problem ? <p role="alert" style={{ color: B.red, fontSize: 13, margin: "0 0 12px" }}>{problem}</p> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : grant ? "Save changes" : "Add grant"}</button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// A grant's deadlines.
// ---------------------------------------------------------------------------
export function ObligationList({ obligations, canManage, today, onAdd, onSettle, onWaive, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("narrative_report");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const rows = [...(obligations || [])].sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  return (
    <div>
      <SHead as="h3">Reporting and deadlines</SHead>
      {rows.length === 0 ? <p style={{ margin: "0 0 10px", fontSize: 13, color: B.muted }}>No deadlines recorded.</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px" }}>
          {rows.map((o) => {
            const d = obligationDue(o, today);
            return (
              <li key={o.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "7px 0", borderBottom: "1px solid " + B.offWhite }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: B.black, overflowWrap: "anywhere" }}>{o.title}</div>
                  <div style={{ fontSize: 11.5, color: B.muted }}>{OBLIGATION_KIND_LABEL[o.kind] || o.kind} · due {fmtDate(o.due_date)}{o.note ? " · " + o.note : ""}</div>
                </div>
                {d ? <Pill tone={DUE_TONE[d.level]}>{d.text}</Pill> : null}
                {canManage && o.status === "pending" ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => onSettle(o, "submitted")} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5 }}>Submitted</button>
                    <button type="button" onClick={() => onSettle(o, "done")} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5 }}>Done</button>
                    <button type="button" onClick={() => onWaive(o)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5 }}>Waive</button>
                    <button type="button" onClick={() => onRemove(o)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5, color: B.red, borderColor: B.red }}>Remove</button>
                  </div>
                ) : canManage && (o.status === "submitted" || o.status === "done") ? (
                  <button type="button" onClick={() => onSettle(o, "pending")} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5 }}>Reopen</button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {canManage ? (
        adding ? (
          <div style={{ background: B.offWhite, borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 150px" }}>
                <Field label="Kind"><select style={sel} value={kind} onChange={(e) => setKind(e.target.value)}>{OBLIGATION_KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <Field label="Title"><input style={inp} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q1 narrative report" /></Field>
              </div>
              <div style={{ flex: "1 1 150px" }}>
                <Field label="Due date"><input style={inp} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" disabled={!title.trim() || !due} onClick={() => { onAdd(kind, title.trim(), due); setAdding(false); setTitle(""); setDue(""); }} style={{ ...btnP, opacity: !title.trim() || !due ? 0.5 : 1 }}>Add deadline</button>
              <button type="button" onClick={() => setAdding(false)} style={btnG}>Cancel</button>
            </div>
          </div>
        ) : <button type="button" onClick={() => setAdding(true)} style={btnG}>Add a deadline</button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The programmes a grant funds, and the picker to add one.
// ---------------------------------------------------------------------------
function ProgrammeFunding({ grant, programmes, canManage, busy, onFund, onUnfund }) {
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const funded = (programmes || []).filter((p) => p.grant_id === grant.id);
  const available = (programmes || []).filter((p) => !p.grant_id);
  return (
    <div style={{ marginTop: 18 }}>
      <SHead as="h3">Programmes this grant funds</SHead>
      {funded.length === 0 ? <p style={{ margin: "0 0 10px", fontSize: 13, color: B.muted }}>No programmes funded from this grant yet.</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px" }}>
          {funded.map((p) => (
            <li key={p.programme_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{p.title} <span style={{ color: B.muted }}>· {p.chapter_name} · {formatNaira(p.approved_kobo)}</span></span>
              {canManage ? <button type="button" disabled={busy} onClick={() => onUnfund(p)} style={{ ...btnG, padding: "3px 10px", fontSize: 11.5 }}>Unlink</button> : null}
            </li>
          ))}
        </ul>
      )}
      {canManage && canFundProgrammes(grant.status) ? (
        picking ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ ...sel, flex: "1 1 240px", maxWidth: 340 }} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose a programme…</option>
              {available.map((p) => <option key={p.programme_id} value={p.programme_id}>{p.title} · {p.chapter_name} · {formatNaira(p.approved_kobo)}</option>)}
            </select>
            <button type="button" disabled={!choice || busy} onClick={() => { onFund(choice); setPicking(false); setChoice(""); }} style={{ ...btnP, opacity: !choice || busy ? 0.5 : 1 }}>Fund it</button>
            <button type="button" onClick={() => setPicking(false)} style={btnG}>Cancel</button>
          </div>
        ) : <button type="button" onClick={() => setPicking(true)} style={btnG}>Fund a programme from this grant</button>
      ) : canManage ? <p style={{ margin: 0, fontSize: 12, color: B.muted }}>A grant can fund programmes once it is awarded.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
export default function GrantsSection({ profile, showToast }) {
  const canManage = canManageGrants(profile);
  const canRead = canReadGrants(profile);

  const [summary, setSummary] = useState([]);
  const [overview, setOverview] = useState(null);
  const [funders, setFunders] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState({ grant: null, obligations: [], events: [] });
  const [busy, setBusy] = useState(false);
  const [statusChange, setStatusChange] = useState(null); // {to} pending confirm with note
  const today = todayLagos();

  const load = useCallback(async () => {
    setErr("");
    const jobs = [supabase.rpc("grant_summary")];
    if (canRead) jobs.push(supabase.rpc("grant_overview"));
    if (canManage) {
      jobs.push(supabase.from("audience_contacts").select("id,full_name").eq("category", "funder").order("full_name"));
      jobs.push(supabase.rpc("grant_fundable_programmes"));
    }
    const out = await Promise.all(jobs);
    let i = 0;
    const su = out[i++];
    const ov = canRead ? out[i++] : { data: [] };
    const fu = canManage ? out[i++] : { data: [] };
    const pr = canManage ? out[i++] : { data: [] };
    if (su.error) {
      setErr("Could not load grants. If this keeps happening, the Batch 33 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setSummary(su.data || []);
    setOverview(ov.data && ov.data[0] ? ov.data[0] : null);
    setFunders(fu.data || []);
    setProgrammes(pr.data || []);
    setLoading(false);
  }, [canRead, canManage]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id) => {
    const [g, o, e] = await Promise.all([
      supabase.from("grants").select("*").eq("id", id).maybeSingle(),
      supabase.from("grant_obligations").select("*").eq("grant_id", id).order("due_date"),
      supabase.from("finance_events").select("*").eq("grant_id", id).order("id"),
    ]);
    setDetail({ grant: g.data || null, obligations: o.data || [], events: e.data || [] });
  }, []);

  useEffect(() => { if (openId) loadDetail(openId); else setDetail({ grant: null, obligations: [], events: [] }); }, [openId, loadDetail]);

  async function run(fn, done) {
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.error) throw r.error;
      if (done) showToast(done);
      await load();
      if (openId) await loadDetail(openId);
      return true;
    } catch (e) {
      showToast(humanise(e), "error");
      return false;
    } finally { setBusy(false); }
  }

  async function saveGrant(values, existing) {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("save_grant", { p_id: existing ? existing.id : null, ...values });
      if (error) throw error;
      showToast(existing ? "Grant updated." : "Grant added.");
      setComposing(false); setEditing(null);
      await load();
      setOpenId(data);
    } catch (e) { showToast(humanise(e), "error"); }
    finally { setSaving(false); }
  }

  function toggle(row) {
    if (openId === row.id) { setOpenId(null); setStatusChange(null); } else { setOpenId(row.id); setStatusChange(null); }
  }

  async function moveStatus(to) {
    const grant = detail.grant;
    if (!grant) return;
    if (to === "declined" || to === "closed") {
      const note = window.prompt(to === "declined" ? "Add a note on why it was declined (optional):" : "Add a closing note (optional):", "");
      if (note === null) return; // cancelled
      await run(() => supabase.rpc("set_grant_status", { p_grant: grant.id, p_status: to, p_note: note || null }), "Grant updated.");
    } else {
      await run(() => supabase.rpc("set_grant_status", { p_grant: grant.id, p_status: to }), "Grant updated.");
    }
  }

  function renderDetail(row) {
    const grant = detail.grant;
    if (!grant) return <div style={{ fontSize: 13, color: B.muted }}>Loading…</div>;
    return (
      <div>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: "0 0 14px", fontSize: 13 }}>
          <dt style={{ color: B.muted }}>Grant number</dt><dd style={{ margin: 0 }}>GR-{String(grant.grant_no).padStart(4, "0")}</dd>
          <dt style={{ color: B.muted }}>Funder</dt><dd style={{ margin: 0 }}>{grant.funder_name}</dd>
          {grant.reference ? (<><dt style={{ color: B.muted }}>Their reference</dt><dd style={{ margin: 0 }}>{grant.reference}</dd></>) : null}
          {grant.period_start || grant.period_end ? (<><dt style={{ color: B.muted }}>Period</dt><dd style={{ margin: 0 }}>{fmtDate(grant.period_start) || "—"} to {fmtDate(grant.period_end) || "—"}</dd></>) : null}
          {grant.is_restricted ? (<><dt style={{ color: B.muted }}>Restricted to</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{grant.restrictions}</dd></>) : null}
          {grant.purpose ? (<><dt style={{ color: B.muted }}>Purpose</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{grant.purpose}</dd></>) : null}
        </dl>

        {canManage ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button type="button" onClick={() => { setEditing(grant); setComposing(false); }} style={btnG}>Edit grant</button>
            </div>
            <StatusButtons status={grant.status} busy={busy} onMove={moveStatus} />
          </div>
        ) : null}

        <ObligationList
          obligations={detail.obligations} canManage={canManage} today={today}
          onAdd={(kind, title, due) => run(() => supabase.rpc("add_obligation", { p_grant: grant.id, p_kind: kind, p_title: title, p_due: due }), "Deadline added.")}
          onSettle={(o, status) => run(() => supabase.rpc("settle_obligation", { p_obl: o.id, p_status: status }), "Deadline updated.")}
          onWaive={(o) => { const why = window.prompt("Say why this deadline is being waived:", ""); if (why && why.trim().length >= 5) run(() => supabase.rpc("settle_obligation", { p_obl: o.id, p_status: "waived", p_note: why.trim() }), "Deadline waived."); else if (why !== null) showToast("A waiver needs a reason of at least five characters.", "error"); }}
          onRemove={(o) => { if (window.confirm("Remove this deadline?")) run(() => supabase.rpc("remove_obligation", { p_obl: o.id }), "Deadline removed."); }}
        />

        <ProgrammeFunding
          grant={grant} programmes={programmes} canManage={canManage} busy={busy}
          onFund={(pid) => run(() => supabase.rpc("set_programme_grant", { p_programme: pid, p_grant: grant.id }), "Programme funded from this grant.")}
          onUnfund={(p) => run(() => supabase.rpc("set_programme_grant", { p_programme: p.programme_id, p_grant: null }), "Programme unlinked.")}
        />

        <div style={{ marginTop: 18 }}>
          <SHead as="h3">History</SHead>
          {detail.events.length ? (
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {detail.events.map((e) => (
                <li key={e.id} style={{ padding: "5px 0", fontSize: 12.5, lineHeight: 1.6 }}>
                  <span style={{ color: B.muted }}>{e.actor_name} · {fmtStamp(e.at)}</span>
                  {e.note ? <div>{e.note}</div> : null}
                </li>
              ))}
            </ol>
          ) : <p style={{ margin: 0, fontSize: 13, color: B.muted }}>Nothing recorded yet.</p>}
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading grants…</div>;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark || B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Grants</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Every grant, its funder and the strings that come with it: the amount, the period, what restricted money may be spent on, the reporting deadlines, and which programmes it pays for. Spend is drawn from the same claims the rest of finance tracks. This page records grants. It never moves money.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      {overview ? (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <StatCard label="Active grants" value={overview.active_grants} />
            <StatCard label="Restricted funds" value={formatNaira(overview.restricted_kobo)} accent={B.blue} />
            <StatCard label="Unrestricted funds" value={formatNaira(overview.unrestricted_kobo)} accent={B.green} />
            <StatCard label="Spent so far" value={formatNaira(overview.spent_kobo)} accent={B.gold} />
          </div>
          {Number(overview.obligations_overdue) > 0 || Number(overview.obligations_due_soon) > 0 ? (
            <Card style={{ borderColor: Number(overview.obligations_overdue) > 0 ? B.red : B.gold, background: Number(overview.obligations_overdue) > 0 ? B.redLight : "#FFF7E6", marginBottom: 14, fontSize: 13, color: Number(overview.obligations_overdue) > 0 ? B.red : B.gold }}>
              {Number(overview.obligations_overdue) > 0 ? `${overview.obligations_overdue} reporting ${overview.obligations_overdue === 1 ? "deadline is" : "deadlines are"} overdue. ` : ""}
              {Number(overview.obligations_due_soon) > 0 ? `${overview.obligations_due_soon} due in the next fortnight.` : ""}
            </Card>
          ) : null}
        </>
      ) : null}

      {canManage ? (
        composing ? (
          <Card style={{ marginBottom: 14 }}>
            <SHead>New grant</SHead>
            <GrantForm funders={funders} saving={saving} onSave={(v) => saveGrant(v, null)} onCancel={() => setComposing(false)} />
          </Card>
        ) : editing ? (
          <Card style={{ marginBottom: 14 }}>
            <SHead>Edit grant</SHead>
            <GrantForm grant={editing} funders={funders} saving={saving} onSave={(v) => saveGrant(v, editing)} onCancel={() => setEditing(null)} />
          </Card>
        ) : (
          <button type="button" onClick={() => { setComposing(true); setOpenId(null); }} style={{ ...btnP, marginBottom: 14 }}>Add a grant</button>
        )
      ) : null}

      {summary.length === 0 ? (
        <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>No grants recorded yet.</p></Card>
      ) : summary.map((row) => (
        <GrantCard key={row.grant_id} row={{ ...row, id: row.grant_id }} canManage={canManage} open={openId === row.grant_id} onOpen={() => toggle({ id: row.grant_id })}>
          {openId === row.grant_id ? renderDetail(row) : null}
        </GrantCard>
      ))}
    </div>
  );
}
