import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";

// BATCH22-MARKER dp-register
//
// The National Secretary's data protection register: the requests people
// make about their own data, and the breaches YCDI has had. Both run on a
// clock the policy sets (LEG-003), so the point of this screen over a
// filing cabinet is that it counts the clock for you.
//
// Row security decides who ever reaches this: the National Coordinator,
// the SEC seat, and admins. The screen assumes that and does not re-check.

const REQUEST_TYPES = [
  ["access", "Access — see their data"],
  ["rectification", "Rectification — correct it"],
  ["erasure", "Erasure — delete it"],
  ["restrict", "Restrict — pause its use"],
  ["object", "Object — to a specific use"],
  ["portability", "Portability — take it elsewhere"],
  ["withdraw_consent", "Withdraw consent"],
];
const REQUEST_LABEL = Object.fromEntries(REQUEST_TYPES.map(([k, v]) => [k, v.split(" — ")[0]]));

const REQUEST_STATUS = ["received", "in_progress", "completed", "refused"];
const BREACH_STATUS = ["open", "contained", "notified", "closed"];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "");
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function Pill({ text, tone }) {
  const c = {
    red: [B.redLight || "#fde8e8", B.red],
    amber: ["#fdf3e0", "#9a6400"],
    green: ["#e6f4ea", "#1c7a3d"],
    grey: [B.offWhite || "#f1f1f1", B.muted],
  }[tone] || [B.offWhite || "#f1f1f1", B.muted];
  return (
    <span style={{ background: c[0], color: c[1], padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>
      {text}
    </span>
  );
}

export default function DataProtectionSection({ profile, showToast }) {
  const [tab, setTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [breaches, setBreaches] = useState([]);
  const [dueReq, setDueReq] = useState([]);
  const [dueBreach, setDueBreach] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const [r, b, dr, db] = await Promise.all([
      supabase.from("data_subject_requests").select("*").order("due_on", { ascending: true }),
      supabase.from("data_breaches").select("*").order("discovered_on", { ascending: false }),
      supabase.rpc("dsr_needing_action"),
      supabase.rpc("breaches_needing_action"),
    ]);
    if (r.error || b.error) {
      setErr("Could not load the register. If this keeps happening, the Batch 22 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setRequests(r.data || []);
    setBreaches(b.data || []);
    setDueReq(dr.data || []);
    setDueBreach(db.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setComposing(false); setEditing(null); }, [tab]);

  const overdueCount = useMemo(() => dueReq.filter((x) => x.days_left < 0).length, [dueReq]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading the register…</div>;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: (B.blue || "#1f6feb") + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark || B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Data Protection Register</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Every request a person makes about their own data, and every personal data breach, kept with its deadline. Requests are answered within 30 days; a breach is assessed within a day and, where the risk is high, NITDA is told within three. This does not hold the data itself, only the record of what was asked and what was done.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("requests")} style={tabBtn(tab === "requests")}>
          Subject requests{overdueCount ? ` (${overdueCount} overdue)` : ""}
        </button>
        <button onClick={() => setTab("breaches")} style={tabBtn(tab === "breaches")}>
          Breaches{dueBreach.length ? ` (${dueBreach.length} open)` : ""}
        </button>
      </div>

      {tab === "requests"
        ? <Requests
            rows={requests} due={dueReq} profile={profile} showToast={showToast}
            composing={composing} setComposing={setComposing}
            editing={editing} setEditing={setEditing} reload={load} />
        : <Breaches
            rows={breaches} due={dueBreach} profile={profile} showToast={showToast}
            composing={composing} setComposing={setComposing}
            editing={editing} setEditing={setEditing} reload={load} />}
    </div>
  );
}

// ---- subject requests -----------------------------------------------------
function Requests({ rows, due, profile, showToast, composing, setComposing, editing, setEditing, reload }) {
  const dueById = useMemo(() => Object.fromEntries(due.map((d) => [d.id, d.days_left])), [due]);

  return (
    <div>
      {!composing && !editing ? (
        <button onClick={() => setComposing(true)} style={{ ...btnP, marginBottom: 14 }}>Log a request</button>
      ) : null}

      {composing ? (
        <RequestForm profile={profile} showToast={showToast}
          onDone={() => { setComposing(false); reload(); }}
          onCancel={() => setComposing(false)} />
      ) : null}

      {editing ? (
        <RequestForm profile={profile} showToast={showToast} row={editing}
          onDone={() => { setEditing(null); reload(); }}
          onCancel={() => setEditing(null)} />
      ) : null}

      {!rows.length ? (
        <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>Nothing logged yet.</Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => {
            const daysLeft = dueById[r.id];
            const open = r.status === "received" || r.status === "in_progress";
            const clock = !open ? null
              : daysLeft < 0 ? <Pill text={`${Math.abs(daysLeft)}d overdue`} tone="red" />
              : daysLeft <= 5 ? <Pill text={`${daysLeft}d left`} tone="amber" />
              : <Pill text={`${daysLeft}d left`} tone="grey" />;
            return (
              <Card key={r.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>
                      {r.subject_name} <span style={{ color: B.muted, fontWeight: 400 }}>· {REQUEST_LABEL[r.request_type]}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>
                      {r.reference} · received {fmt(r.received_on)} · due {fmt(r.due_on)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {clock}
                    <Pill text={cap(r.status)} tone={r.status === "completed" ? "green" : r.status === "refused" ? "grey" : "amber"} />
                  </div>
                </div>
                {r.outcome ? <div style={{ fontSize: 12, color: B.muted, marginTop: 8, lineHeight: 1.6 }}>{r.outcome}</div> : null}
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => setEditing(r)} style={btnG}>Update</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequestForm({ profile, showToast, row, onDone, onCancel }) {
  const isEdit = !!row;
  const [f, setF] = useState({
    subject_name: row?.subject_name || "",
    subject_contact: row?.subject_contact || "",
    request_type: row?.request_type || "access",
    channel: row?.channel || "written",
    received_on: row?.received_on || today(),
    status: row?.status || "received",
    outcome: row?.outcome || "",
    notes: row?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.subject_name.trim()) { showToast("Whose data is this about?", "error"); return; }
    setBusy(true);
    const payload = { ...f, subject_name: f.subject_name.trim() };
    let res;
    if (isEdit) {
      payload.handled_by = profile.id;
      res = await supabase.from("data_subject_requests").update(payload).eq("id", row.id);
    } else {
      payload.created_by = profile.id;
      res = await supabase.from("data_subject_requests").insert(payload);
    }
    setBusy(false);
    if (res.error) { showToast(res.error.message, "error"); return; }
    showToast(isEdit ? "Request updated." : "Request logged.");
    onDone();
  }

  return (
    <Card style={{ marginBottom: 14, padding: 16 }}>
      <SHead>{isEdit ? "Update request" : "Log a request"}</SHead>
      <Field label="Whose data" required><input value={f.subject_name} onChange={set("subject_name")} style={inp} /></Field>
      <Field label="How to reach them"><input value={f.subject_contact} onChange={set("subject_contact")} style={inp} placeholder="Email or phone" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Request"><select value={f.request_type} onChange={set("request_type")} style={sel}>{REQUEST_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Received how"><select value={f.channel} onChange={set("channel")} style={sel}><option value="written">Written</option><option value="verbal">Verbal</option></select></Field>
      </div>
      <Field label="Received on"><input type="date" value={f.received_on} onChange={set("received_on")} style={inp} /></Field>
      {isEdit ? (
        <>
          <Field label="Status"><select value={f.status} onChange={set("status")} style={sel}>{REQUEST_STATUS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></Field>
          <Field label="What was done" hint="Shown on the record. Keep it to the outcome, not the data itself.">
            <textarea value={f.outcome} onChange={set("outcome")} style={ta} />
          </Field>
        </>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{isEdit ? "Save" : "Log it"}</button>
        <button onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </Card>
  );
}

// ---- breaches -------------------------------------------------------------
function Breaches({ rows, due, profile, showToast, composing, setComposing, editing, setEditing, reload }) {
  const owedById = useMemo(() => Object.fromEntries(due.map((d) => [d.id, d.what_is_owed])), [due]);

  return (
    <div>
      {!composing && !editing ? (
        <button onClick={() => setComposing(true)} style={{ ...btnP, marginBottom: 14 }}>Record a breach</button>
      ) : null}

      {composing ? (
        <BreachForm profile={profile} showToast={showToast}
          onDone={() => { setComposing(false); reload(); }}
          onCancel={() => setComposing(false)} />
      ) : null}
      {editing ? (
        <BreachForm profile={profile} showToast={showToast} row={editing}
          onDone={() => { setEditing(null); reload(); }}
          onCancel={() => setEditing(null)} />
      ) : null}

      {!rows.length ? (
        <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>No breaches recorded. Long may it stay that way.</Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((b) => {
            const owed = owedById[b.id];
            return (
              <Card key={b.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>
                      {b.reference} {b.high_risk ? <Pill text="High risk" tone="red" /> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>discovered {fmt(b.discovered_on)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {owed && b.status !== "closed" ? <Pill text={owed} tone={owed.includes("overdue") ? "red" : "amber"} /> : null}
                    <Pill text={cap(b.status)} tone={b.status === "closed" ? "green" : "amber"} />
                  </div>
                </div>
                {b.nature ? <div style={{ fontSize: 12.5, color: B.black, marginTop: 8, lineHeight: 1.6 }}>{b.nature}</div> : null}
                <div style={{ fontSize: 11.5, color: B.muted, marginTop: 6 }}>
                  {b.nc_assessed_on ? `Assessed ${fmt(b.nc_assessed_on)}` : "Not assessed"}
                  {b.high_risk ? ` · NITDA ${b.nitda_notified_on ? fmt(b.nitda_notified_on) : "not notified"}` : ""}
                  {` · report ${b.report_filed ? "filed" : "not filed"}`}
                </div>
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => setEditing(b)} style={btnG}>Update</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BreachForm({ profile, showToast, row, onDone, onCancel }) {
  const isEdit = !!row;
  const [f, setF] = useState({
    nature: row?.nature || "",
    discovered_on: row?.discovered_on || today(),
    reported_to_nc_on: row?.reported_to_nc_on || "",
    nc_assessed_on: row?.nc_assessed_on || "",
    high_risk: row?.high_risk ?? false,
    nitda_notified_on: row?.nitda_notified_on || "",
    subjects_notified_on: row?.subjects_notified_on || "",
    remedial_action: row?.remedial_action || "",
    report_filed: row?.report_filed ?? false,
    status: row?.status || "open",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.checked }));

  async function save() {
    if (!f.nature.trim()) { showToast("A short line on what happened, please.", "error"); return; }
    setBusy(true);
    // Empty date strings must go in as null, not "".
    const clean = { ...f, nature: f.nature.trim() };
    ["reported_to_nc_on", "nc_assessed_on", "nitda_notified_on", "subjects_notified_on"].forEach((k) => { if (!clean[k]) clean[k] = null; });
    let res;
    if (isEdit) {
      clean.handled_by = profile.id;
      res = await supabase.from("data_breaches").update(clean).eq("id", row.id);
    } else {
      clean.created_by = profile.id;
      res = await supabase.from("data_breaches").insert(clean);
    }
    setBusy(false);
    if (res.error) { showToast(res.error.message, "error"); return; }
    showToast(isEdit ? "Breach record updated." : "Breach recorded.");
    onDone();
  }

  return (
    <Card style={{ marginBottom: 14, padding: 16 }}>
      <SHead>{isEdit ? "Update breach" : "Record a breach"}</SHead>
      <Field label="What happened" required hint="Brief. What was exposed and how, not the data itself.">
        <textarea value={f.nature} onChange={set("nature")} style={ta} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Discovered on"><input type="date" value={f.discovered_on} onChange={set("discovered_on")} style={inp} /></Field>
        <Field label="Reported to NC"><input type="date" value={f.reported_to_nc_on} onChange={set("reported_to_nc_on")} style={inp} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: B.black, margin: "4px 0 12px" }}>
        <input type="checkbox" checked={f.high_risk} onChange={toggle("high_risk")} /> High risk to the people involved
      </label>
      {isEdit || f.high_risk ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="NC assessed on"><input type="date" value={f.nc_assessed_on} onChange={set("nc_assessed_on")} style={inp} /></Field>
            <Field label="NITDA notified"><input type="date" value={f.nitda_notified_on} onChange={set("nitda_notified_on")} style={inp} /></Field>
          </div>
          <Field label="People notified on"><input type="date" value={f.subjects_notified_on} onChange={set("subjects_notified_on")} style={inp} /></Field>
          <Field label="Remedial action"><textarea value={f.remedial_action} onChange={set("remedial_action")} style={ta} /></Field>
          <Field label="Status"><select value={f.status} onChange={set("status")} style={sel}>{BREACH_STATUS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: B.black, margin: "4px 0 12px" }}>
            <input type="checkbox" checked={f.report_filed} onChange={toggle("report_filed")} /> Written report filed and retained
          </label>
        </>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{isEdit ? "Save" : "Record it"}</button>
        <button onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </Card>
  );
}

function tabBtn(on) {
  return {
    padding: "8px 16px", borderRadius: 8, border: "1.5px solid " + (on ? B.blue : B.border),
    background: on ? B.blue : B.white, color: on ? B.white : B.muted, fontSize: 12.5,
    fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
  };
}
