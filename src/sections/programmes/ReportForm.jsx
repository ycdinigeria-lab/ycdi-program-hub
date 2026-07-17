import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnG } from "../../theme.js";
import { Field } from "../../components/ui.jsx";
import { emptyReportForm, reportFormToRow, stepIsValid, REPORT_STEPS, ENGAGEMENT_OPTIONS, TEACHING_METHOD_OPTIONS } from "../../data/reportFields.js";

function YesNo({ value, onChange }) {
  return (
    <select style={sel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

export default function ReportForm({ program, profile, onClose, onSaved, showToast }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [u, setU] = useState(() => ({ ...emptyReportForm(program.budget || ""), reporting_coordinator: profile.full_name }));

  const set = (field, value) => setU((prev) => ({ ...prev, [field]: value }));
  const valid = stepIsValid(step, u);

  async function save() {
    setSaving(true);
    const row = reportFormToRow(program.id, u);
    const { error } = await supabase.from("reports").upsert(row, { onConflict: "program_id" });
    if (error) { showToast("Error saving report: " + error.message, "error"); setSaving(false); return; }
    await supabase.from("programs").update({ status: "Complete" }).eq("id", program.id);
    showToast("Post-program report submitted successfully.");
    onSaved();
    onClose();
    setSaving(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }}>
      <div style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: 640, marginBottom: 30 }}>
        <div style={{ background: B.blue, borderRadius: "14px 14px 0 0", padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.white, fontFamily: "'Montserrat',sans-serif" }}>Post-program activity report</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>{program.title}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>YCDI-PROG-001 · Program Activity Report Template</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "18px 22px" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
            {REPORT_STEPS.map((label, i) => (
              <div key={label} style={{ flex: 1, minWidth: 60, height: 5, borderRadius: 3, background: i <= step ? B.blue : B.offWhite }} title={label} />
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 16 }}>
            {REPORT_STEPS[step]}
          </div>

          {step === 0 ? (
            <>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Report date" required><input type="date" style={inp} value={u.report_date} onChange={(e) => set("report_date", e.target.value)} /></Field>
                <Field label="Reporting coordinator" required><input style={inp} value={u.reporting_coordinator} onChange={(e) => set("reporting_coordinator", e.target.value)} /></Field>
              </div>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Actual start time"><input type="time" style={inp} value={u.actual_start_time} onChange={(e) => set("actual_start_time", e.target.value)} /></Field>
                <Field label="Actual end time"><input type="time" style={inp} value={u.actual_end_time} onChange={(e) => set("actual_end_time", e.target.value)} /></Field>
              </div>
              <Field label="Venue confirmed"><input style={inp} value={u.venue_confirmed} onChange={(e) => set("venue_confirmed", e.target.value)} placeholder="e.g. Yes, main hall as planned" /></Field>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Pre-program prayer meeting held" required><YesNo value={u.prayer_meeting_held} onChange={(v) => set("prayer_meeting_held", v)} /></Field>
                <Field label="Prayer meeting attendees"><input type="number" style={inp} value={u.prayer_meeting_attendees} onChange={(e) => set("prayer_meeting_attendees", e.target.value)} /></Field>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Field label="Total attendance" required><input type="number" style={inp} value={u.total_attendance} onChange={(e) => set("total_attendance", e.target.value)} /></Field>
                <Field label="Male" required><input type="number" style={inp} value={u.male_count} onChange={(e) => set("male_count", e.target.value)} /></Field>
                <Field label="Female" required><input type="number" style={inp} value={u.female_count} onChange={(e) => set("female_count", e.target.value)} /></Field>
              </div>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Field label="Ages 10-14"><input type="number" style={inp} value={u.age_10_14} onChange={(e) => set("age_10_14", e.target.value)} /></Field>
                <Field label="Ages 15-19"><input type="number" style={inp} value={u.age_15_19} onChange={(e) => set("age_15_19", e.target.value)} /></Field>
                <Field label="Ages 20-25"><input type="number" style={inp} value={u.age_20_25} onChange={(e) => set("age_20_25", e.target.value)} /></Field>
              </div>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="First-time attendees"><input type="number" style={inp} value={u.first_time_attendees} onChange={(e) => set("first_time_attendees", e.target.value)} /></Field>
                <Field label="Returning attendees"><input type="number" style={inp} value={u.returning_attendees} onChange={(e) => set("returning_attendees", e.target.value)} /></Field>
              </div>
              <Field label="Volunteers deployed"><input type="number" style={inp} value={u.volunteers_deployed} onChange={(e) => set("volunteers_deployed", e.target.value)} /></Field>
              <Field label="Schools represented"><input style={inp} value={u.schools_represented} onChange={(e) => set("schools_represented", e.target.value)} placeholder="List schools if more than one" /></Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Program ran as planned" required><YesNo value={u.program_ran_as_planned} onChange={(v) => set("program_ran_as_planned", v)} /></Field>
                <Field label="Teaching method"><select style={sel} value={u.teaching_method} onChange={(e) => set("teaching_method", e.target.value)}><option value="">Select...</option>{TEACHING_METHOD_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></Field>
              </div>
              {u.program_ran_as_planned === "no" ? (
                <Field label="Deviations from plan"><textarea style={ta} value={u.deviations} onChange={(e) => set("deviations", e.target.value)} /></Field>
              ) : null}
              <Field label="Topics covered" required><textarea style={ta} value={u.topics_covered} onChange={(e) => set("topics_covered", e.target.value)} /></Field>
              <Field label="Audience engagement"><select style={sel} value={u.audience_engagement} onChange={(e) => set("audience_engagement", e.target.value)}><option value="">Select...</option>{ENGAGEMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></Field>
              <Field label="Materials used"><input style={inp} value={u.materials_used} onChange={(e) => set("materials_used", e.target.value)} /></Field>
              <div style={{ background: B.offWhite, borderRadius: 8, padding: "12px 14px", marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", marginBottom: 8 }}>YCDI three-program tests</div>
                <Field label="Mission test" required><input style={inp} value={u.three_test_mission} onChange={(e) => set("three_test_mission", e.target.value)} placeholder="pass / partial / fail, plus a short note" /></Field>
                <Field label="Quality test" required><input style={inp} value={u.three_test_quality} onChange={(e) => set("three_test_quality", e.target.value)} placeholder="pass / partial / fail, plus a short note" /></Field>
                <Field label="Safety test" required><input style={inp} value={u.three_test_safety} onChange={(e) => set("three_test_safety", e.target.value)} placeholder="pass / partial / fail, plus a short note" /></Field>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <Field label="New commitments"><input type="number" style={inp} value={u.commitments_to_christ} onChange={(e) => set("commitments_to_christ", e.target.value)} /></Field>
                <Field label="Recommitments"><input type="number" style={inp} value={u.recommitments} onChange={(e) => set("recommitments", e.target.value)} /></Field>
                <Field label="Testimonials"><input type="number" style={inp} value={u.testimonials_count} onChange={(e) => set("testimonials_count", e.target.value)} /></Field>
                <Field label="Joining fellowship"><input type="number" style={inp} value={u.students_joining_fellowship} onChange={(e) => set("students_joining_fellowship", e.target.value)} /></Field>
              </div>
              <Field label="Testimonial summaries"><textarea style={ta} value={u.testimonials_detail} onChange={(e) => set("testimonials_detail", e.target.value)} /></Field>
              <Field label="Prayer requests"><textarea style={ta} value={u.prayer_requests} onChange={(e) => set("prayer_requests", e.target.value)} /></Field>
              <Field label="Discipleship follow-up"><textarea style={ta} value={u.discipleship_followups} onChange={(e) => set("discipleship_followups", e.target.value)} /></Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Two-volunteer rule observed" required><YesNo value={u.two_volunteer_rule_observed} onChange={(v) => set("two_volunteer_rule_observed", v)} /></Field>
                <Field label="Parental consents obtained"><YesNo value={u.parental_consents_obtained} onChange={(v) => set("parental_consents_obtained", v)} /></Field>
              </div>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="School permission obtained"><YesNo value={u.school_permission_obtained} onChange={(v) => set("school_permission_obtained", v)} /></Field>
                <Field label="Incidents occurred" required><YesNo value={u.incidents_occurred} onChange={(v) => set("incidents_occurred", v)} /></Field>
              </div>
              {u.incidents_occurred === "yes" ? (
                <Field label="Incident details" required>
                  <textarea style={{ ...ta, background: B.redLight }} value={u.incident_details} onChange={(e) => set("incident_details", e.target.value)} />
                </Field>
              ) : null}
              <Field label="Welfare concerns"><textarea style={ta} value={u.welfare_concerns} onChange={(e) => set("welfare_concerns", e.target.value)} /></Field>
              <Field label="Referrals made"><textarea style={ta} value={u.referrals_made} onChange={(e) => set("referrals_made", e.target.value)} /></Field>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Approved budget (NGN)"><input type="number" style={inp} value={u.budget_approved} onChange={(e) => set("budget_approved", e.target.value)} /></Field>
                <Field label="Actual expenditure (NGN)" required><input type="number" style={inp} value={u.actual_expenditure} onChange={(e) => set("actual_expenditure", e.target.value)} /></Field>
              </div>
              <Field label="Variance explanation"><textarea style={ta} value={u.variance_explanation} onChange={(e) => set("variance_explanation", e.target.value)} /></Field>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Receipts obtained" required><YesNo value={u.receipts_obtained} onChange={(v) => set("receipts_obtained", v)} /></Field>
                <Field label="Outstanding payments"><input style={inp} value={u.outstanding_payments} onChange={(e) => set("outstanding_payments", e.target.value)} /></Field>
              </div>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <Field label="What went well" required><textarea style={ta} value={u.what_went_well} onChange={(e) => set("what_went_well", e.target.value)} /></Field>
              <Field label="What could be improved" required><textarea style={ta} value={u.what_could_improve} onChange={(e) => set("what_could_improve", e.target.value)} /></Field>
              <Field label="Recommendations"><textarea style={ta} value={u.recommendations} onChange={(e) => set("recommendations", e.target.value)} /></Field>
              <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                <Field label="Follow-up actions"><input style={inp} value={u.follow_up_actions} onChange={(e) => set("follow_up_actions", e.target.value)} /></Field>
                <Field label="Responsible"><input style={inp} value={u.follow_up_responsible} onChange={(e) => set("follow_up_responsible", e.target.value)} /></Field>
                <Field label="Deadline"><input type="date" style={inp} value={u.follow_up_deadline} onChange={(e) => set("follow_up_deadline", e.target.value)} /></Field>
              </div>
              <Field label="Next program suggested"><input style={inp} value={u.next_program_suggested} onChange={(e) => set("next_program_suggested", e.target.value)} /></Field>
              <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 14px", marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: B.blueDark, cursor: "pointer" }}>
                  <input type="checkbox" checked={u.coordinator_signature_confirmed === "yes"} onChange={(e) => set("coordinator_signature_confirmed", e.target.checked ? "yes" : "")} />
                  I confirm this report is accurate to the best of my knowledge.
                </label>
              </div>
            </>
          ) : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 24 }}>
            <button style={btnG} onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}>{step === 0 ? "Cancel" : "Back"}</button>
            <button
              style={{ ...btnP, opacity: step === 6 && !valid ? 0.4 : 1 }}
              disabled={step === 6 && (!valid || saving)}
              onClick={() => (step < 6 ? setStep((s) => s + 1) : save())}
            >
              {saving ? "Saving…" : step === 6 ? "Submit Report" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
