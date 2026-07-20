import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, ta, btnP, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";
import {
  REFERENCE_QUESTIONS,
  REFERENCE_METHODS,
  INTERVIEW_CATEGORIES,
  RECOMMENDATIONS,
  methodCounts,
  methodLabel,
  recommendationLabel,
  cleanPanel,
  panelIsValid,
  screeningGaps,
  MIN_PANEL,
} from "../lib/screening.js";

// Reference checks and interview records, sitting inside an application.
//
// BATCH7B-MARKER screening-panel
//
// Two tables are read here rather than one joined query. Row security on
// reference_checks and interview_records is written against a function
// that reaches across to the application, and a joined select across
// tables with different policies comes back empty without saying why.
// Two calls, no join, on purpose.
//
// The screen shows what is still outstanding before the coordinator
// presses anything. The database refuses on its own regardless, so this
// is courtesy rather than security. If the two ever disagree, believe the
// error message.

function Small({ children, colour = B.muted }) {
  return (
    <p style={{ margin: "0 0 10px", fontSize: 12.5, color: colour, lineHeight: 1.65 }}>
      {children}
    </p>
  );
}

function Tag({ children, colour }) {
  return (
    <span
      style={{
        background: colour + "18",
        color: colour,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "'Montserrat',sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------
// One reference, being taken.
// ------------------------------------------------------------------
function ReferenceForm({ app, slot, suggestedName, suggestedChurch, onSaved, showToast }) {
  const [name, setName] = useState(suggestedName || "");
  const [contact, setContact] = useState("");
  const [church, setChurch] = useState(!!suggestedChurch);
  const [via, setVia] = useState("phone");
  const [answers, setAnswers] = useState({});
  const [concern, setConcern] = useState(false);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) {
      showToast("Whose reference is this?", "error");
      return;
    }
    if (concern && !detail.trim()) {
      showToast("Write down what the referee said. A concern with nothing against it cannot be followed up.", "error");
      return;
    }
    setBusy(true);
    const row = {
      application_id: app.id,
      referee_slot: slot,
      referee_name: name.trim(),
      referee_contact: contact.trim() || null,
      referee_is_church_leader: church,
      obtained_via: via,
      concern_raised: concern,
      concern_detail: concern ? detail.trim() : null,
    };
    REFERENCE_QUESTIONS.forEach((q) => {
      row[q.key] = (answers[q.key] || "").trim() || null;
    });
    const { error } = await supabase.from("reference_checks").insert(row);
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Reference recorded.");
    onSaved();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead as="h3">Referee {slot}</SHead>
      <Small>
        Contact them yourself, by phone or email. A written reference the applicant brought
        along is not enough on its own, under YCDI-SAF-005 section 3.3.
      </Small>

      <Field label="Referee name" required>
        <input style={inp} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="How you reached them">
        <input style={inp} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone number or email" />
      </Field>

      <Field label="How the reference was obtained" required>
        <select style={{ ...inp, appearance: "none" }} value={via} onChange={(e) => setVia(e.target.value)}>
          {REFERENCE_METHODS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </Field>
      {!methodCounts(via) ? (
        <Small colour={B.red}>
          This will be recorded, and it does not count toward the references this role needs.
        </Small>
      ) : null}

      <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 14, fontSize: 13, color: B.black, lineHeight: 1.55 }}>
        <input type="checkbox" checked={church} onChange={(e) => setChurch(e.target.checked)} style={{ marginTop: 3 }} />
        <span>This referee is a pastor, elder or church leader</span>
      </label>

      {REFERENCE_QUESTIONS.map((q) => (
        <Field key={q.key} label={`${q.number}. ${q.label}`}>
          <textarea
            style={ta}
            value={answers[q.key] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
          />
        </Field>
      ))}

      <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 12, fontSize: 13, color: B.black, lineHeight: 1.55 }}>
        <input type="checkbox" checked={concern} onChange={(e) => setConcern(e.target.checked)} style={{ marginTop: 3 }} />
        <span>This referee expressed a concern, however vague</span>
      </label>
      {concern ? (
        <>
          <Field label="What they said" required>
            <textarea style={ta} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </Field>
          <Small colour={B.red}>
            SAF-005 3.3 requires this to be followed up before the appointment proceeds. The
            appointment stays blocked until you record the follow-up below.
          </Small>
        </>
      ) : null}

      <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : "Record this reference"}
      </button>
    </Card>
  );
}

// ------------------------------------------------------------------
// A reference already on file.
// ------------------------------------------------------------------
function ReferenceRecord({ row, onChanged, showToast }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function followUp() {
    if (!note.trim()) {
      showToast("Write down what happened when you followed it up.", "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("reference_checks")
      .update({ followup_done: true, followup_note: note.trim(), followup_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Follow-up recorded.");
    onChanged();
  }

  const counts = methodCounts(row.obtained_via);

  return (
    <Card style={{ marginBottom: 14, borderLeft: `3px solid ${counts ? B.green : B.gold}` }}>
      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <strong style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 14.5, color: B.black }}>
          Referee {row.referee_slot}: {row.referee_name}
        </strong>
        {row.referee_is_church_leader ? <Tag colour={B.blue}>Church leader</Tag> : null}
        {counts ? null : <Tag colour={B.gold}>Does not count</Tag>}
        {row.concern_raised && !row.followup_done ? <Tag colour={B.red}>Concern outstanding</Tag> : null}
      </div>
      <Small>
        {methodLabel(row.obtained_via)} · {row.checked_on}
      </Small>

      {REFERENCE_QUESTIONS.map((q) =>
        row[q.key] ? (
          <div key={q.key} style={{ marginBottom: 11 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2, fontFamily: "'Montserrat',sans-serif" }}>
              {q.number}. {q.label}
            </div>
            <div style={{ fontSize: 13, color: B.black, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{row[q.key]}</div>
          </div>
        ) : null
      )}

      {row.concern_raised ? (
        <div style={{ background: "#FEF2F2", border: `1px solid ${B.red}`, borderRadius: 8, padding: 13, marginTop: 10 }}>
          <SHead as="h4" color={B.red}>Concern raised</SHead>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: B.black, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {row.concern_detail}
          </p>
          {row.followup_done ? (
            <>
              <Small>Followed up.</Small>
              <p style={{ margin: 0, fontSize: 13, color: B.black, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                {row.followup_note}
              </p>
            </>
          ) : (
            <>
              <Field label="What happened when you followed it up" required>
                <textarea style={ta} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <button onClick={followUp} disabled={busy} style={{ ...btnG, opacity: busy ? 0.6 : 1 }}>
                {busy ? "Saving…" : "Record the follow-up"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------
// An interview, being written up.
// ------------------------------------------------------------------
function InterviewForm({ app, onSaved, showToast, defaultPanel }) {
  const [heldOn, setHeldOn] = useState(new Date().toISOString().slice(0, 10));
  const [format, setFormat] = useState("in_person");
  const [panel, setPanel] = useState([defaultPanel || "", ""]);
  const [notes, setNotes] = useState({});
  const [scores, setScores] = useState({});
  const [rec, setRec] = useState("further_interview");
  const [conditions, setConditions] = useState("");
  const [busy, setBusy] = useState(false);

  function setPanelAt(i, value) {
    const next = [...panel];
    next[i] = value;
    setPanel(next);
  }

  async function save() {
    if (!panelIsValid(panel)) {
      showToast(`An interview panel is at least ${MIN_PANEL} people, under YCDI-HR-004 section 6.`, "error");
      return;
    }
    if (rec === "appoint_with_conditions" && !conditions.trim()) {
      showToast("Write down the conditions, otherwise nobody can tell whether they were met.", "error");
      return;
    }
    setBusy(true);
    const row = {
      application_id: app.id,
      held_on: heldOn,
      format,
      panel_names: cleanPanel(panel),
      recommendation: rec,
      conditions: rec === "appoint_with_conditions" ? conditions.trim() : null,
    };
    INTERVIEW_CATEGORIES.forEach((c) => {
      row[`${c.key}_notes`] = (notes[c.key] || "").trim() || null;
      const s = parseInt(scores[c.key], 10);
      row[`${c.key}_score`] = Number.isFinite(s) ? s : null;
    });
    const { error } = await supabase.from("interview_records").insert(row);
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Interview recorded.");
    onSaved();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead as="h3">Record an interview</SHead>
      <Small>
        The four categories come from YCDI-HR-004 section 6. Scores are optional, and useful
        mainly when you are seeing several people for the same role.
      </Small>

      <Field label="Date held">
        <input type="date" style={inp} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
      </Field>
      <Field label="How it was held">
        <select style={{ ...inp, appearance: "none" }} value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="in_person">In person</option>
          <option value="video">Video call</option>
          <option value="phone">Phone</option>
        </select>
      </Field>

      <Field label="Panel" required hint={`At least ${MIN_PANEL} people, under YCDI-HR-004 section 6.`}>
        {panel.map((p, i) => (
          <input
            key={i}
            style={{ ...inp, marginBottom: 8 }}
            value={p}
            onChange={(e) => setPanelAt(i, e.target.value)}
            placeholder={`Panel member ${i + 1}`}
            aria-label={`Panel member ${i + 1}`}
          />
        ))}
      </Field>
      <button onClick={() => setPanel([...panel, ""])} style={{ ...btnG, marginBottom: 16 }}>
        Add another panel member
      </button>

      {INTERVIEW_CATEGORIES.map((c) => (
        <div key={c.key} style={{ marginBottom: 6 }}>
          <Field label={`${c.number}. ${c.label}`} hint={c.prompts.join(" ")}>
            <textarea
              style={ta}
              value={notes[c.key] || ""}
              onChange={(e) => setNotes({ ...notes, [c.key]: e.target.value })}
            />
          </Field>
          <Field label="Score, if you are scoring">
            <select
              style={{ ...inp, appearance: "none" }}
              value={scores[c.key] || ""}
              onChange={(e) => setScores({ ...scores, [c.key]: e.target.value })}
            >
              <option value="">Not scored</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
      ))}

      <Field label="Panel recommendation" required>
        <select style={{ ...inp, appearance: "none" }} value={rec} onChange={(e) => setRec(e.target.value)}>
          {RECOMMENDATIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </Field>
      {rec === "appoint_with_conditions" ? (
        <Field label="Conditions" required>
          <textarea style={ta} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </Field>
      ) : null}
      {rec === "do_not_appoint" ? (
        <Small colour={B.red}>
          This blocks the appointment. If the panel later changes its mind, record a second
          interview rather than editing this one. The newest interview is the one that counts,
          and both stay on file.
        </Small>
      ) : null}

      <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : "Record this interview"}
      </button>
    </Card>
  );
}

function InterviewRecord({ row, isLatest }) {
  return (
    <Card style={{ marginBottom: 14, opacity: isLatest ? 1 : 0.72 }}>
      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <strong style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 14.5, color: B.black }}>
          Interview, {row.held_on}
        </strong>
        <Tag colour={row.recommendation === "do_not_appoint" ? B.red : B.green}>
          {recommendationLabel(row.recommendation)}
        </Tag>
        {isLatest ? null : <Tag colour={B.muted}>Superseded</Tag>}
      </div>
      <Small>Panel: {(row.panel_names || []).join(", ")}</Small>
      {INTERVIEW_CATEGORIES.map((c) =>
        row[`${c.key}_notes`] || row[`${c.key}_score`] ? (
          <div key={c.key} style={{ marginBottom: 11 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2, fontFamily: "'Montserrat',sans-serif" }}>
              {c.label}{row[`${c.key}_score`] ? ` · ${row[`${c.key}_score`]} of 5` : ""}
            </div>
            <div style={{ fontSize: 13, color: B.black, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {row[`${c.key}_notes`]}
            </div>
          </div>
        ) : null
      )}
      {row.conditions ? <Small colour={B.black}>Conditions: {row.conditions}</Small> : null}
    </Card>
  );
}

// ------------------------------------------------------------------
// The panel as a whole.
// ------------------------------------------------------------------
export default function ScreeningPanel({ app, profile, showToast, onChanged }) {
  const [refs, setRefs] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Two calls rather than a join. See the note at the top of the file.
    const a = await supabase
      .from("reference_checks")
      .select("*")
      .eq("application_id", app.id)
      .order("referee_slot");
    const b = await supabase
      .from("interview_records")
      .select("*")
      .eq("application_id", app.id)
      .order("held_on", { ascending: false });
    if (a.error) showToast(a.error.message, "error");
    if (b.error) showToast(b.error.message, "error");
    setRefs(a.data || []);
    setInterviews(b.data || []);
    setLoading(false);
  }, [app.id, showToast]);

  useEffect(() => { load(); }, [load]);

  const gaps = screeningGaps(app, refs, interviews);
  const slotsTaken = refs.map((r) => r.referee_slot);
  const freeSlots = [1, 2].filter((s) => !slotsTaken.includes(s));

  function refreshAll() {
    setAdding(null);
    load();
    if (onChanged) onChanged();
  }

  if (loading) {
    return <Card style={{ marginBottom: 14 }}><Small>Loading screening records…</Small></Card>;
  }

  return (
    <div>
      <Card style={{ marginBottom: 14, background: gaps.length ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${gaps.length ? B.gold : B.green}` }}>
        <SHead as="h3" color={gaps.length ? B.gold : B.green}>
          {gaps.length ? "Still outstanding" : "Screening complete"}
        </SHead>
        {gaps.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {gaps.map((g, i) => (
              <li key={i} style={{ fontSize: 13, color: B.black, lineHeight: 1.7, marginBottom: 4 }}>{g}</li>
            ))}
          </ul>
        ) : (
          <Small colour={B.black}>
            Everything YCDI-SAF-005 section 3.1 asks for is on file. This applicant can be appointed.
          </Small>
        )}
      </Card>

      <SHead as="h3">Reference checks</SHead>
      {refs.map((r) => (
        <ReferenceRecord key={r.id} row={r} onChanged={refreshAll} showToast={showToast} />
      ))}

      {freeSlots.length && adding !== "reference" ? (
        <button onClick={() => setAdding("reference")} style={{ ...btnG, marginBottom: 18 }}>
          Record a reference check
        </button>
      ) : null}
      {adding === "reference" && freeSlots.length ? (
        <ReferenceForm
          app={app}
          slot={freeSlots[0]}
          suggestedName={freeSlots[0] === 1 ? app.referee1_name : app.referee2_name}
          suggestedChurch={freeSlots[0] === 1 ? app.referee1_is_church_leader : app.referee2_is_church_leader}
          onSaved={refreshAll}
          showToast={showToast}
        />
      ) : null}

      <SHead as="h3">Interviews</SHead>
      {interviews.length === 0 ? <Small>No interview recorded yet.</Small> : null}
      {interviews.map((row, i) => (
        <InterviewRecord key={row.id} row={row} isLatest={i === 0} />
      ))}

      {adding !== "interview" ? (
        <button onClick={() => setAdding("interview")} style={{ ...btnG, marginBottom: 18 }}>
          Record an interview
        </button>
      ) : (
        <InterviewForm
          app={app}
          onSaved={refreshAll}
          showToast={showToast}
          defaultPanel={profile ? profile.full_name : ""}
        />
      )}
    </div>
  );
}
