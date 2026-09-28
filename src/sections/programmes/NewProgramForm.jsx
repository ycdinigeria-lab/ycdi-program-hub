import { useState } from "react";
import { B, inp, sel, ta, btnP, btnG } from "../../theme.js";
import { Card, Field } from "../../components/ui.jsx";
import { PROG_TYPES, CHAPTERS_FALLBACK, GEO_SCOPES, DELIVERY_FORMATS, RATINGS, NEEDS_QUESTIONS, PRIORITIES } from "../../data/programmes.js";
import { needsComplete, alignmentComplete, alignmentBlocked, alignmentWeak, noneCount, digitalSafeguardingRequired, digitalSafeguardingComplete, gateComplete, approvalLevelInfo } from "../../lib/programmes.js";

// Also handles editing a returned programme. Pass `existing` and the form
// arrives pre-filled and resubmits instead of creating a new one. The
// National Coordinator's comment is shown at the top so the coordinator can
// read what was asked of them while they fix it.
//
// BATCH4B-MARKER resubmit
// BATCH37-MARKER concept-note-v2
//
// Five steps, matching the Programme Operations Manual v2.0: the Needs
// Identification Checklist and the Strategic Alignment rating come first,
// as the gate section 1.5 and 1.6 describe them, before the coordinator
// ever gets to describe the programme itself. The database enforces the
// same gate on submission (batch37-concept-note-v2.sql); the checks here
// exist so a coordinator finds out what's missing before they submit, not
// only after the server refuses it.
const STEP_LABELS = ["Needs identification", "Strategic alignment", "Programme details", "People & safeguarding", "Review & submit"];

export default function NewProgramForm({ profile, chapters, onSubmit, onCancel, existing, initialStep }) {
  const editing = !!existing;
  // initialStep is a test hook only (jumping straight to a later step
  // in a render-to-string test that cannot click "Next"). The app never
  // passes it; every real user starts at 1.
  const [step, setStep] = useState(initialStep || 1);
  const [busy, setBusy] = useState(false);
  const chapterNames = chapters.length ? chapters.map((c) => c.name) : CHAPTERS_FALLBACK;
  const [form, setForm] = useState(editing ? {
    title: existing.title || "",
    chapter: existing.chapter_name || profile.chapter_name || chapterNames[0],
    type: existing.type || "School Visit",
    date: existing.date || "",
    students: existing.students == null ? "" : String(existing.students),
    age_range: existing.age_range || "",
    school: existing.school || "",
    geographic_scope: existing.geographic_scope || "",
    delivery_format: existing.delivery_format || "Physical",
    format_reasoning: existing.format_reasoning || "",
    objectives: existing.objectives || "",
    me_indicators: existing.me_indicators || "",
    activities_schedule: existing.activities_schedule || "",
    budget: existing.budget == null ? "" : String(existing.budget),
    cost_lines: existing.cost_lines || "",
    safeguarding_lead: existing.safeguarding_lead || "",
    facilitators: existing.facilitators || "",
    digital_safeguarding: existing.digital_safeguarding || "",
    permission_requirements: existing.permission_requirements || "",
    needs_evidence: existing.needs_evidence || "",
    needs_gap: existing.needs_gap || "",
    needs_beneficiary_voice: existing.needs_beneficiary_voice || "",
    needs_alternative: existing.needs_alternative || "",
    align_reach: existing.align_reach || "",
    align_roots: existing.align_roots || "",
    align_resources: existing.align_resources || "",
    align_raise: existing.align_raise || "",
    align_reputation: existing.align_reputation || "",
  } : {
    title: "", chapter: profile.chapter_name || chapterNames[0], type: "School Visit",
    date: "", students: "", age_range: "", school: "", geographic_scope: "",
    delivery_format: "Physical", format_reasoning: "",
    objectives: "", me_indicators: "", activities_schedule: "",
    budget: "", cost_lines: "",
    safeguarding_lead: profile.full_name, facilitators: profile.full_name,
    digital_safeguarding: "", permission_requirements: "",
    needs_evidence: "", needs_gap: "", needs_beneficiary_voice: "", needs_alternative: "",
    align_reach: "", align_roots: "", align_resources: "", align_raise: "", align_reputation: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const needsOk = needsComplete(form);
  const alignOk = alignmentComplete(form);
  const blocked = alignmentBlocked(form);
  const weak = alignmentWeak(form);
  const detailsValid = form.title && form.date && form.students && form.school && form.budget
    && form.geographic_scope && form.format_reasoning && form.objectives
    && form.me_indicators && form.activities_schedule && form.cost_lines;
  const peopleValid = form.safeguarding_lead && form.permission_requirements && digitalSafeguardingComplete(form);
  const valid = detailsValid && peopleValid && gateComplete(form);
  const level = approvalLevelInfo(form.budget);

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const match = chapters.find((c) => c.name === form.chapter);
    await onSubmit({ ...form, chapter_id: match?.id, students: +form.students, budget: +form.budget });
    setBusy(false);
  }

  function canLeaveStep(s) {
    if (s === 1) return needsOk;
    if (s === 2) return alignOk && !blocked;
    if (s === 3) return !!detailsValid;
    if (s === 4) return !!peopleValid;
    return true;
  }

  return (
    <Card>
      {editing && existing.nc_comment ? (
        <div style={{ background: B.redLight, border: `1px solid ${B.red}50`, borderRadius: 8, padding: "12px 15px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: B.red, fontFamily: "'Montserrat',sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            What the National Coordinator asked for
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#5a0a13", lineHeight: 1.6, fontStyle: "italic" }}>"{existing.nc_comment}"</p>
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {[1, 2, 3, 4, 5].map((m) => (
          <div key={m} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: step >= m ? B.blue : B.offWhite, color: step >= m ? B.white : B.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{m}</div>
            <span style={{ fontSize: 12, color: step === m ? B.black : B.muted, fontWeight: step === m ? 700 : 400 }}>{STEP_LABELS[m - 1]}</span>
            {m < 5 ? <div style={{ width: 12, height: 1, background: B.border }} /> : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <>
          <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
            Before any concept note is drafted, section 1.5 asks the proposer to complete this checklist — the difference between a genuine need and one that only feels obviously true to whoever is proposing it.
          </div>
          {NEEDS_QUESTIONS.map((q) => (
            <Field key={q.key} label={q.label} required hint={q.hint}>
              <textarea style={ta} value={form[q.key]} onChange={(e) => set(q.key, e.target.value)} placeholder={q.q} />
            </Field>
          ))}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
            Every concept note is checked against the five 2026–2030 Strategic Priorities (section 1.6). A note should show at least one Strong and no more than one None; three or more None ratings will be returned rather than advanced.
          </div>
          {PRIORITIES.map((p) => (
            <Field key={p.key} label={p.label} required hint={p.q}>
              <select style={sel} value={form[p.key]} onChange={(e) => set(p.key, e.target.value)}>
                <option value="">Select a rating…</option>
                {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          ))}
          {alignOk && blocked ? (
            <div style={{ background: B.redLight, borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#8b0a1c", lineHeight: 1.6 }}>
              This note rates None on {noneCount(form)} of the five priorities. Per section 1.6 it should be strengthened before it can be submitted.
            </div>
          ) : alignOk && weak ? (
            <div style={{ background: B.yellowLight, borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#7a5c00", lineHeight: 1.6 }}>
              This can still be submitted, but section 1.6 expects at least one Strong rating and no more than one None. Worth a second look before moving on.
            </div>
          ) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Field label="Program title" required><input style={inp} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. School outreach - Benin Central" /></Field>
          <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <Field label="Chapter">
              {profile.is_admin ? (
                <select style={sel} value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
                  {chapterNames.map((c) => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <input style={{ ...inp, background: B.offWhite, color: B.muted }} value={form.chapter} readOnly />
              )}
            </Field>
            <Field label="Program type" required>
              <select style={sel} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {PROG_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <Field label="Date" required><input type="date" style={inp} value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Estimated students" required><input type="number" style={inp} value={form.students} onChange={(e) => set("students", e.target.value)} placeholder="e.g. 80" /></Field>
          </div>
          <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <Field label="Age range" hint="e.g. 13-18"><input style={inp} value={form.age_range} onChange={(e) => set("age_range", e.target.value)} placeholder="e.g. 13-18" /></Field>
            <Field label="Geographic scope" required>
              <select style={sel} value={form.geographic_scope} onChange={(e) => set("geographic_scope", e.target.value)}>
                <option value="">Select…</option>
                {GEO_SCOPES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </Field>
          </div>
          <Field label="School / venue" required><input style={inp} value={form.school} onChange={(e) => set("school", e.target.value)} placeholder="e.g. Auchi Polytechnic" /></Field>
          <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <Field label="Delivery format" required>
              <select style={sel} value={form.delivery_format} onChange={(e) => set("delivery_format", e.target.value)}>
                {DELIVERY_FORMATS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Estimated budget (NGN)" required><input type="number" style={inp} value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. 35000" /></Field>
          </div>
          <Field label="Reasoning for that format" required hint="Section 1.12: who is being reached, depth vs breadth, what's actually available, and whether safeguarding can be fully met.">
            <textarea style={ta} value={form.format_reasoning} onChange={(e) => set("format_reasoning", e.target.value)} placeholder="Why this format, per the decision framework in 1.12" />
          </Field>
          <Field label="Key cost lines" required><textarea style={ta} value={form.cost_lines} onChange={(e) => set("cost_lines", e.target.value)} placeholder="e.g. Venue 20,000; Transport 8,000; Materials 7,000" /></Field>
          <Field label="Objectives" required><textarea style={ta} value={form.objectives} onChange={(e) => set("objectives", e.target.value)} placeholder="What change is intended in the lives of the beneficiaries?" /></Field>
          <Field label="M&E indicators" required hint="Two or three indicators from the Results Framework (Document 2) this programme will contribute to.">
            <textarea style={ta} value={form.me_indicators} onChange={(e) => set("me_indicators", e.target.value)} placeholder="e.g. Number of schools reached; % reporting positive behavioural change" />
          </Field>
          <Field label="Activities and schedule" required><textarea style={ta} value={form.activities_schedule} onChange={(e) => set("activities_schedule", e.target.value)} /></Field>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <div style={{ background: B.redLight, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#8b0a1c", lineHeight: 1.6 }}>
            Safeguarding is mandatory. A designated lead must be assigned for every YCDI program.
          </div>
          <Field label="Safeguarding lead" required><input style={inp} value={form.safeguarding_lead} onChange={(e) => set("safeguarding_lead", e.target.value)} placeholder="Full name of designated safeguarding lead" /></Field>
          <Field label="Facilitators (comma-separated)"><input style={inp} value={form.facilitators} onChange={(e) => set("facilitators", e.target.value)} placeholder="e.g. George Djhorba, Azuyumele Evans" /></Field>
          {digitalSafeguardingRequired(form) ? (
            <Field label="Digital safeguarding provisions" required hint="Required for a virtual or hybrid programme: no unsupervised 1:1 contact with a minor online, a co-facilitator on every call or chat, and how a digital concern is reported.">
              <textarea style={ta} value={form.digital_safeguarding} onChange={(e) => set("digital_safeguarding", e.target.value)} />
            </Field>
          ) : null}
          <Field label="Permission requirements" required hint="School, parent, or authority approvals needed."><textarea style={ta} value={form.permission_requirements} onChange={(e) => set("permission_requirements", e.target.value)} /></Field>
          <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
            School permission letters must be obtained before the program date and attached after submission.
          </div>
        </>
      ) : null}

      {step === 5 ? (
        <>
          <div style={{ background: B.offWhite, borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>{form.title || "Untitled program"}</div>
            {[["Chapter", form.chapter], ["Type", form.type], ["Delivery format", form.delivery_format], ["Date", form.date], ["Students", form.students], ["Geographic scope", form.geographic_scope || "Not set"], ["Venue", form.school], ["Budget", form.budget ? `NGN ${parseInt(form.budget).toLocaleString()}` : "Not set"], ["Safeguarding lead", form.safeguarding_lead || "Not set"], ["Facilitators", form.facilitators || "None"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${B.border}` }}>
                <span style={{ color: B.muted }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 16px", marginBottom: 14, fontSize: 12, color: "#065f87", lineHeight: 1.7 }}>
            <strong>Approval level {level.level}</strong> — {level.approver}. {level.timeframe}.
          </div>
          {!valid ? <div style={{ background: B.yellowLight, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7a5c00", marginBottom: 12 }}>Please complete all required fields on the earlier steps before submitting.</div> : null}
          <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
            {editing
              ? "Resubmitting sends this back to the National Coordinator for another look. Their earlier comment stays on the record."
              : "Submitting sends this to the National Coordinator for review."}
          </div>
        </>
      ) : null}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 24 }}>
        <button style={btnG} onClick={step === 1 ? onCancel : () => setStep((s) => s - 1)}>{step === 1 ? "Cancel" : "Back"}</button>
        <button style={{ ...btnP, opacity: (step === 5 ? !valid : !canLeaveStep(step)) ? 0.4 : 1 }} disabled={step === 5 ? !valid : !canLeaveStep(step)} onClick={() => (step < 5 ? setStep((s) => s + 1) : submit())}>
          {busy ? (editing ? "Resubmitting..." : "Submitting...") : step === 5 ? (editing ? "Resubmit for NC Approval" : "Submit for NC Approval") : "Next"}
        </button>
      </div>
    </Card>
  );
}
