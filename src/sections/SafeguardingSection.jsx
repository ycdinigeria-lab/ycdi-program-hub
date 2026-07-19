import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnR, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";
import { usePaged } from "../lib/paging.js";
import { ShowMore } from "../components/ShowMore.jsx";

// The register is drawn a page at a time. Nothing is hidden from anyone
// who could already see it; this only limits how much is painted at once.
//
// BATCH4-MARKER safeguarding-paging
const MAX_ROWS = 1000;

// The five scenarios from the Abuse Reporting Procedures. The wording
// is the policy's, not a paraphrase, because somebody choosing under
// pressure needs to recognise their situation immediately.
export const SCENARIOS = [
  { id: "disclosure", label: "A child told me something", detail: "A child has said, directly or indirectly, that they have been harmed.",
    steps: ["Write down their exact words, not your interpretation.", "Tell the Regional Coordinator today.", "This form must be completed within 24 hours."] },
  { id: "observation", label: "I saw signs of possible abuse", detail: "Something you observed rather than something you were told.",
    steps: ["Do not approach the child in a way that could embarrass them.", "Do not confront parents or anyone suspected.", "Report to the Regional Coordinator the same day."] },
  { id: "third_party", label: "Somebody else raised a concern", detail: "A parent, teacher or another young person told you something.",
    steps: ["Record what was said, by whom, and when.", "Do not pressure them for more.", "Report by the end of the same day."] },
  { id: "allegation_staff", label: "A concern about a YCDI person", detail: "An allegation involving a volunteer, coordinator or staff member.",
    steps: ["Separate the person and the child immediately if at a programme.", "Do not speak to the person accused first.", "They are suspended from activities involving children the moment this is filed."] },
  { id: "immediate_danger", label: "A child is in immediate danger", detail: "Call 112 or 199 first. Fill this in afterwards.",
    steps: ["Call emergency services before anything else.", "Get the child to safety.", "Do not leave them alone until a responsible adult has taken over."] },
];

export const AGE_BANDS = ["10-12", "13-15", "16-17", "18+"];

export function scenarioLabel(id) {
  const s = SCENARIOS.find((x) => x.id === id);
  return s ? s.label : id;
}

export function retentionYears(band) {
  // Seven years, or until the child turns 25, whichever is longer.
  // The band gives a range, so the youngest possible age is used.
  const youngest = { "10-12": 10, "13-15": 13, "16-17": 16, "18+": 18 }[band] ?? 10;
  return Math.max(7, 25 - youngest);
}

function niceDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function niceTime(t) {
  if (!t) return "";
  return new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLE = {
  Open: { bg: B.redLight, fg: "#8b0a1c" },
  "Under review": { bg: B.yellowLight, fg: "#7a5c00" },
  Referred: { bg: B.purpleLight, fg: B.purple },
  Closed: { bg: B.offWhite, fg: B.muted },
};

function StatusTag({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Open;
  return (
    <span style={{ background: s.bg, color: s.fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

// ------------------------------------------------------------
// Reporting a concern
// ------------------------------------------------------------
function RaiseConcern({ profile, chapters, onCancel, onSaved, showToast }) {
  const own = chapters.find((c) => c.name === profile.chapter_name);
  const [scenario, setScenario] = useState("");
  const [f, setF] = useState({
    chapter_id: own?.id || "",
    occurred_on: new Date().toISOString().slice(0, 10),
    account: "", location: "", others_present: "",
    child_desc: "", child_band: "13-15", accused: "", emergency: false,
  });
  const [people, setPeople] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const chosen = SCENARIOS.find((s) => s.id === scenario);

  useEffect(() => {
    if (scenario !== "allegation_staff") return;
    supabase.rpc("messageable_people").then(({ data }) => setPeople(data || []));
  }, [scenario]);

  async function save() {
    if (!scenario) { showToast("Choose what kind of concern this is.", "error"); return; }
    if (!f.chapter_id) { showToast("Choose a chapter.", "error"); return; }
    if (!f.account.trim()) { showToast("Write down what happened.", "error"); return; }
    if (scenario === "allegation_staff" && !f.accused) { showToast("Name the person this concerns.", "error"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("raise_incident", {
      p_chapter: f.chapter_id,
      p_scenario: scenario,
      p_occurred_on: f.occurred_on,
      p_account: f.account,
      p_location: f.location || null,
      p_others_present: f.others_present || null,
      p_participant: null,
      p_child_desc: f.child_desc || null,
      p_child_band: f.child_band || null,
      p_accused: f.accused || null,
      p_emergency: scenario === "immediate_danger",
    });
    setSaving(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Concern logged. The National Coordinator has been notified.", "warning");
    onSaved();
  }

  return (
    <Card>
      <SHead color={B.red}>Report a safeguarding concern</SHead>

      <div style={{ background: B.redLight, border: "1px solid " + B.red, borderRadius: 8, padding: "12px 14px", fontSize: 12.5, color: "#8b0a1c", lineHeight: 1.6, marginBottom: 16 }}>
        If a child is in danger right now, stop and call <strong>112</strong> or <strong>199</strong> first. Fill this in afterwards.
        <br /><br />
        What you write here goes only to the safeguarding officers. It is not visible to other coordinators or to admins.
      </div>

      <Field label="What kind of concern is this" required>
        <select style={sel} value={scenario} onChange={(e) => setScenario(e.target.value)}>
          <option value="">Choose</option>
          {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>

      {chosen ? (
        <div style={{ background: B.blueLight, borderRadius: 8, padding: "11px 13px", marginBottom: 16, fontSize: 12.5, color: "#065f87", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6 }}>{chosen.detail}</div>
          {chosen.steps.map((s, i) => <div key={i}>• {s}</div>)}
        </div>
      ) : null}

      {profile.role === "NC" ? (
        <Field label="Chapter" required>
          <select style={sel} value={f.chapter_id} onChange={set("chapter_id")}>
            <option value="">Choose a chapter</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      ) : null}

      <Field label="When did it happen" required>
        <input type="date" style={inp} value={f.occurred_on} max={new Date().toISOString().slice(0, 10)} onChange={set("occurred_on")} />
      </Field>

      <Field label="What happened" required>
        <textarea style={{ ...ta, minHeight: 140 }} value={f.account} onChange={set("account")}
          placeholder="If a child told you something, write their exact words rather than your summary of them. Include the time, where you were, and who else was there." />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Field label="Where"><input style={inp} value={f.location} onChange={set("location")} /></Field>
        <Field label="Who else was present"><input style={inp} value={f.others_present} onChange={set("others_present")} /></Field>
      </div>

      {scenario !== "allegation_staff" ? null : (
        <Field label="Who does this concern" required>
          <select style={sel} value={f.accused} onChange={set("accused")}>
            <option value="">Choose the person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.chapter_name ? " (" + p.chapter_name + ")" : ""}</option>)}
          </select>
        </Field>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Field label="The child, in brief">
          <input style={inp} value={f.child_desc} onChange={set("child_desc")} placeholder="Name or how to identify them" />
        </Field>
        <Field label="Their age band">
          <select style={sel} value={f.child_band} onChange={set("child_band")}>
            {AGE_BANDS.map((a) => <option key={a} value={a}>{a === "18+" ? "18 and over" : a + " years"}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ fontSize: 11.5, color: B.muted, marginBottom: 14, lineHeight: 1.55 }}>
        This record will be kept for {retentionYears(f.child_band)} years, as the policy requires. If it is later referred to the police or NAPTIP it is kept indefinitely.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnR} onClick={save} disabled={saving}>{saving ? "Filing…" : "File this concern"}</button>
        <button style={btnG} onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------
// One incident
// ------------------------------------------------------------
function IncidentDetail({ id, profile, onBack, showToast }) {
  const [inc, setInc] = useState(null);
  const [actions, setActions] = useState([]);
  const [note, setNote] = useState("");
  const [authority, setAuthority] = useState("");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);

  const isNC = profile.role === "NC" || profile.is_safeguarding_lead;

  const load = useCallback(async () => {
    const { data } = await supabase.from("safeguarding_incidents").select("*, chapters(name)").eq("id", id).single();
    setInc(data || null);
    const { data: a } = await supabase.from("incident_actions").select("*").eq("incident_id", id).order("taken_at");
    setActions(a || []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function call(fn, args, msg) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast(msg);
    setNote(""); setAuthority(""); setOutcome("");
    load();
  }

  if (!inc) return <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13 }}>Loading…</Card>;

  return (
    <>
      <button style={{ ...btnG, marginBottom: 14 }} onClick={onBack}>Back to the register</button>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{inc.reference}</div>
            <div style={{ fontSize: 12, color: B.muted, marginTop: 4, lineHeight: 1.6 }}>
              {scenarioLabel(inc.scenario)} · {inc.chapters?.name} chapter<br />
              Happened {niceDate(inc.occurred_on)}, reported {niceDate(inc.reported_on)}
            </div>
          </div>
          <StatusTag status={inc.status} />
        </div>

        {inc.accused_suspended ? (
          <div style={{ background: B.redLight, border: "1px solid " + B.red, borderRadius: 8, padding: "10px 12px", marginTop: 12, fontSize: 12.5, color: "#8b0a1c", lineHeight: 1.55 }}>
            The person named is suspended from all activities involving children with immediate effect.
          </div>
        ) : null}

        {!inc.nc_notified_at ? (
          <div style={{ background: B.yellowLight, border: "1px solid " + B.yellow, borderRadius: 8, padding: "10px 12px", marginTop: 12, fontSize: 12.5, color: "#6b5200", lineHeight: 1.55 }}>
            The National Coordinator has not been marked as notified. The policy requires this within 24 hours.
            <div style={{ marginTop: 8 }}>
              <button style={btnP} onClick={() => call("mark_nc_notified", { p_incident: id }, "Recorded.")} disabled={busy}>
                Mark as notified
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: B.muted, marginTop: 10 }}>
            National Coordinator notified {niceTime(inc.nc_notified_at)}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead>The account as reported</SHead>
        <div style={{ fontSize: 13, color: "#222", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{inc.account}</div>
        <div style={{ fontSize: 11.5, color: B.muted, marginTop: 10, lineHeight: 1.55 }}>
          {inc.location ? "Where: " + inc.location : ""}
          {inc.others_present ? (inc.location ? " · " : "") + "Present: " + inc.others_present : ""}
          {inc.child_description ? <><br />Concerning: {inc.child_description}{inc.child_age_band ? " (" + inc.child_age_band + ")" : ""}</> : null}
          <br />
          {inc.retain_until ? "Retained until " + niceDate(inc.retain_until) : "Referred externally, so retained indefinitely."}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead>Everything done so far</SHead>
        {actions.map((a, i) => (
          <div key={a.id} style={{ display: "flex", gap: 10, paddingBottom: i === actions.length - 1 ? 0 : 13 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: B.blue, marginTop: 5 }} />
              {i === actions.length - 1 ? null : <span style={{ width: 1, flex: 1, background: B.border, marginTop: 3 }} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{a.action}</div>
              {a.detail ? <div style={{ fontSize: 12.5, color: "#333", marginTop: 3, lineHeight: 1.5 }}>{a.detail}</div> : null}
              <div style={{ fontSize: 10.5, color: "#8a8a8a", marginTop: 3 }}>{niceTime(a.taken_at)}</div>
            </div>
          </div>
        ))}

        {inc.status !== "Closed" ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + B.offWhite }}>
            <Field label="Record a step you have taken">
              <input style={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Spoke to the school, contacted the parent…" />
            </Field>
            <button style={btnP} disabled={busy || !note.trim()}
              onClick={() => call("log_incident_action", { p_incident: id, p_action: note, p_detail: null }, "Added to the record.")}>
              Add to the record
            </button>
            <div style={{ fontSize: 11, color: B.muted, marginTop: 8 }}>
              Entries cannot be edited or removed once added. That is deliberate.
            </div>
          </div>
        ) : null}
      </Card>

      {isNC && inc.status !== "Closed" ? (
        <Card>
          <SHead color={B.red}>National Coordinator only</SHead>

          {!inc.referred_at ? (
            <>
              <Field label="Refer to an external authority">
                <select style={sel} value={authority} onChange={(e) => setAuthority(e.target.value)}>
                  <option value="">Choose</option>
                  <option>Nigeria Police Force</option>
                  <option>NAPTIP</option>
                  <option>Ministry of Women Affairs and Social Development</option>
                  <option>State Child Development Department</option>
                </select>
              </Field>
              <button style={btnR} disabled={busy || !authority}
                onClick={() => call("refer_incident", { p_incident: id, p_authority: authority, p_detail: null }, "Referral recorded.")}>
                Record the referral
              </button>
              <div style={{ fontSize: 11.5, color: B.muted, marginTop: 8, marginBottom: 18, lineHeight: 1.5 }}>
                Once referred, this record is kept indefinitely and made available to the authorities on request.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: B.muted, marginBottom: 18 }}>
              Referred to {inc.referred_to} on {niceDate(inc.referred_at)}.
            </div>
          )}

          <Field label="Close this concern">
            <textarea style={ta} value={outcome} onChange={(e) => setOutcome(e.target.value)}
              placeholder="What was the outcome, and what was done to protect the child?" />
          </Field>
          <button style={btnP} disabled={busy || !outcome.trim()}
            onClick={() => call("close_incident", { p_incident: id, p_outcome: outcome }, "Closed.")}>
            Close it
          </button>
        </Card>
      ) : null}

      {inc.status === "Closed" ? (
        <Card>
          <SHead>Outcome</SHead>
          <div style={{ fontSize: 13, color: "#222", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{inc.outcome}</div>
          <div style={{ fontSize: 11.5, color: B.muted, marginTop: 8 }}>Closed {niceTime(inc.closed_at)}</div>
        </Card>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------
// Compliance
// ------------------------------------------------------------
function Compliance({ showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("safeguarding_compliance").then(({ data, error }) => {
      if (error) showToast(error.message, "error");
      setRows(data || []);
      setLoading(false);
    });
  }, [showToast]);

  const problems = useMemo(() => rows.filter((r) => !r.cleared), [rows]);
  const paged = usePaged(problems, "compliance");

  if (loading) return <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13 }}>Loading…</Card>;

  return (
    <>
      <div style={{ fontSize: 12.5, color: B.muted, lineHeight: 1.6, marginBottom: 14 }}>
        Declarations renew every January. Refresher training lapses a year after it was done. This is the list to work through, not the policy.
      </div>

      {problems.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 26, fontSize: 13, color: B.green }}>
          Everyone active is cleared to work with children.
        </Card>
      ) : (
        <>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {paged.visible.map((r, i) => (
            <div key={r.profile_id} style={{ padding: "12px 16px", borderBottom: i === paged.visible.length - 1 ? "none" : "1px solid " + B.offWhite }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{r.full_name}</div>
                  <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2 }}>
                    {r.chapter_name || "National"}{r.role_category ? " · " + r.role_category.replace(/_/g, " ") : ""}
                  </div>
                </div>
                <span style={{ background: B.redLight, color: "#8b0a1c", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>
                  {r.problem}
                </span>
              </div>
            </div>
          ))}
        </Card>
        <ShowMore paged={paged} noun="more" />
        </>
      )}

      {rows.length > problems.length ? (
        <div style={{ fontSize: 12, color: B.muted, marginTop: 12 }}>
          {rows.length - problems.length} other {rows.length - problems.length === 1 ? "person is" : "people are"} fully cleared.
        </div>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------
// The section
// ------------------------------------------------------------
export default function SafeguardingSection({ profile, chapters, showToast }) {
  const [tab, setTab] = useState("register");
  const [rows, setRows] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("safeguarding_incidents")
      .select("id, reference, scenario, status, reported_on, chapters(name)")
      .order("reported_on", { ascending: false })
      .range(0, MAX_ROWS - 1);
    setRows(data || []);
    const { data: o } = await supabase.rpc("incidents_overdue");
    setOverdue(o || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const paged = usePaged(rows, "register");

  if (openId) return <IncidentDetail id={openId} profile={profile} showToast={showToast} onBack={() => { setOpenId(null); load(); }} />;
  if (raising) return <RaiseConcern profile={profile} chapters={chapters} showToast={showToast} onCancel={() => setRaising(false)} onSaved={() => { setRaising(false); load(); }} />;

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[{ id: "register", label: "Incident register" }, { id: "compliance", label: "Who is cleared" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? B.blue : B.white, color: tab === t.id ? B.white : B.muted,
            border: "1px solid " + (tab === t.id ? B.blue : B.border), borderRadius: 20,
            padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
          }}>{t.label}</button>
        ))}
        <button style={{ ...btnR, marginLeft: "auto" }} onClick={() => setRaising(true)}>Report a concern</button>
      </div>

      {tab === "compliance" ? <Compliance showToast={showToast} /> : (
        <>
          {overdue.length > 0 ? (
            <div style={{ background: B.redLight, border: "1px solid " + B.red, borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 12.5, color: "#8b0a1c", lineHeight: 1.6 }}>
              <strong>{overdue.length} {overdue.length === 1 ? "concern is" : "concerns are"} past the deadline the policy sets.</strong>
              {overdue.map((o) => (
                <div key={o.id} style={{ marginTop: 5 }}>{o.reference} · {o.chapter_name} · {o.what_is_late} · {o.hours_waiting} hours old</div>
              ))}
            </div>
          ) : null}

          {loading ? (
            <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13 }}>Loading the register…</Card>
          ) : rows.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13, lineHeight: 1.6 }}>
              Nothing in the register. An empty register is good news, but only if people know how to use it. Every volunteer should know this screen exists before they need it.
            </Card>
          ) : (
            <>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {paged.visible.map((r, i) => (
                <button key={r.id} onClick={() => setOpenId(r.id)} style={{
                  display: "block", width: "100%", textAlign: "left", background: B.white, border: "none",
                  borderBottom: i === paged.visible.length - 1 ? "none" : "1px solid " + B.offWhite,
                  padding: "12px 16px", cursor: "pointer", fontFamily: "'Open Sans',sans-serif",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{r.reference}</div>
                      <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2 }}>
                        {scenarioLabel(r.scenario)} · {r.chapters?.name} · reported {niceDate(r.reported_on)}
                      </div>
                    </div>
                    <StatusTag status={r.status} />
                  </div>
                </button>
              ))}
            </Card>
            <ShowMore paged={paged} noun="older entries" />
            </>
          )}
        </>
      )}
    </>
  );
}
