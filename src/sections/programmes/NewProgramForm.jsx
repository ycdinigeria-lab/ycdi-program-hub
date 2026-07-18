import { useState } from "react";
import { B, inp, sel, ta, btnP, btnG } from "../../theme.js";
import { Card, Field } from "../../components/ui.jsx";
import { PROG_TYPES, CHAPTERS_FALLBACK } from "../../data/programmes.js";

export default function NewProgramForm({ profile, chapters, onSubmit, onCancel }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const chapterNames = chapters.length ? chapters.map((c) => c.name) : CHAPTERS_FALLBACK;
  const [form, setForm] = useState({
    title: "", chapter: profile.chapter_name || chapterNames[0], type: "School Visit",
    date: "", students: "", school: "", objectives: "", budget: "",
    safeguarding_lead: profile.full_name, facilitators: profile.full_name,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.title && form.date && form.students && form.school && form.objectives && form.budget && form.safeguarding_lead;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const match = chapters.find((c) => c.name === form.chapter);
    await onSubmit({ ...form, chapter_id: match?.id, students: +form.students, budget: +form.budget });
    setBusy(false);
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {[1, 2, 3].map((m) => (
          <div key={m} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: step >= m ? B.blue : B.offWhite, color: step >= m ? B.white : B.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{m}</div>
            <span style={{ fontSize: 12, color: step === m ? B.black : B.muted, fontWeight: step === m ? 700 : 400 }}>
              {["Program details", "People and safeguarding", "Review and submit"][m - 1]}
            </span>
            {m < 3 ? <div style={{ width: 16, height: 1, background: B.border }} /> : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <>
          <Field label="Program title" required><input style={inp} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. School outreach - Benin Central" /></Field>
          <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <Field label="Chapter">
              {profile.role === "NC" ? (
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
          <Field label="School / venue" required><input style={inp} value={form.school} onChange={(e) => set("school", e.target.value)} placeholder="e.g. Auchi Polytechnic" /></Field>
          <Field label="Estimated budget (NGN)" required><input type="number" style={inp} value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. 35000" /></Field>
          <Field label="Objectives" required><textarea style={ta} value={form.objectives} onChange={(e) => set("objectives", e.target.value)} placeholder="What change is intended in the lives of the beneficiaries?" /></Field>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div style={{ background: B.redLight, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#8b0a1c", lineHeight: 1.6 }}>
            Safeguarding is mandatory. A designated lead must be assigned for every YCDI program.
          </div>
          <Field label="Safeguarding lead" required><input style={inp} value={form.safeguarding_lead} onChange={(e) => set("safeguarding_lead", e.target.value)} placeholder="Full name of designated safeguarding lead" /></Field>
          <Field label="Facilitators (comma-separated)"><input style={inp} value={form.facilitators} onChange={(e) => set("facilitators", e.target.value)} placeholder="e.g. George Djhorba, Azuyumele Evans" /></Field>
          <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
            School permission letters must be obtained before the program date and attached after submission.
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div style={{ background: B.offWhite, borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>{form.title || "Untitled program"}</div>
            {[["Chapter", form.chapter], ["Type", form.type], ["Date", form.date], ["Students", form.students], ["Venue", form.school], ["Budget", form.budget ? `NGN ${parseInt(form.budget).toLocaleString()}` : "Not set"], ["Safeguarding lead", form.safeguarding_lead || "Not set"], ["Facilitators", form.facilitators || "None"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${B.border}` }}>
                <span style={{ color: B.muted }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          {!valid ? <div style={{ background: B.yellowLight, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7a5c00", marginBottom: 12 }}>Please complete all required fields before submitting.</div> : null}
          <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
            Submitting sends this to the National Coordinator for review within 7 working days.
          </div>
        </>
      ) : null}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 24 }}>
        <button style={btnG} onClick={step === 1 ? onCancel : () => setStep((s) => s - 1)}>{step === 1 ? "Cancel" : "Back"}</button>
        <button style={{ ...btnP, opacity: step === 3 && !valid ? 0.4 : 1 }} onClick={() => (step < 3 ? setStep((s) => s + 1) : submit())}>
          {busy ? "Submitting..." : step === 3 ? "Submit for NC Approval" : "Next"}
        </button>
      </div>
    </Card>
  );
}
