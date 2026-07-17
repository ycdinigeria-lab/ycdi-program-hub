import { B } from "../../theme.js";
import { SHead } from "../../components/ui.jsx";

function Stat({ label, value, tone }) {
  return (
    <div style={{ background: tone || B.offWhite, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone ? B.black : B.black, fontFamily: "'Montserrat',sans-serif" }}>{value}</div>
      <div style={{ fontSize: 10, color: B.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

function KV({ label, value, warn }) {
  return (
    <div style={{ background: warn ? B.redLight : B.offWhite, borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: B.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: warn ? B.red : B.black }}>{value}</div>
    </div>
  );
}

function Block({ label, text, tone }) {
  if (!text) return null;
  return (
    <div style={{ background: tone || B.offWhite, borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: B.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-line" }}>{text}</div>
    </div>
  );
}

export default function ReportSummary({ r }) {
  const box = { borderRadius: 0, borderTop: "none", background: B.white, border: `1px solid ${B.border}`, padding: "16px 18px", marginBottom: 2 };

  return (
    <div>
      <div style={{ background: B.blue, borderRadius: "10px 10px 0 0", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.white, fontFamily: "'Montserrat',sans-serif" }}>Post-program activity report</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>YCDI-PROG-001</div>
      </div>

      <div style={box}>
        <SHead color={B.blue}>A. Program overview</SHead>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <KV label="Report date" value={r.report_date || "—"} />
          <KV label="Coordinator" value={r.reporting_coordinator || "—"} />
          <KV label="Start time" value={r.actual_start_time || "—"} />
          <KV label="End time" value={r.actual_end_time || "—"} />
          <KV label="Venue confirmed" value={r.venue_confirmed || "—"} />
          <KV label="Prayer meeting" value={r.prayer_meet ? "Yes" : "No"} />
          <KV label="Prayer attendees" value={r.prayer_meeting_attendees ?? "—"} />
        </div>
      </div>

      <div style={box}>
        <SHead color={B.blue}>B. Attendance and reach</SHead>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
          <Stat label="Total" value={r.attendance ?? 0} tone={B.blueLight} />
          <Stat label="Male" value={r.male_count ?? 0} tone={B.blueLight} />
          <Stat label="Female" value={r.female_count ?? 0} tone={B.blueLight} />
          <Stat label="Volunteers" value={r.volunteers_deployed ?? 0} tone={B.blueLight} />
        </div>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 10 }}>
          <Stat label="Ages 10-14" value={r.age_10_14 ?? 0} />
          <Stat label="Ages 15-19" value={r.age_15_19 ?? 0} />
          <Stat label="Ages 20-25" value={r.age_20_25 ?? 0} />
        </div>
        <Block label="Schools represented" text={r.schools_represented} />
      </div>

      <div style={box}>
        <SHead color={B.purple}>C. Program delivery</SHead>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <KV label="Ran as planned" value={r.program_ran_as_planned ? "Yes" : "No"} />
          <KV label="Teaching method" value={r.teaching_method || "—"} />
          <KV label="Engagement" value={(r.audience_engagement || "—").split("—")[0]} />
        </div>
        <Block label="Topics covered" text={r.topics_covered} />
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <KV label="Mission test" value={r.three_test_mission || "—"} />
          <KV label="Quality test" value={r.three_test_quality || "—"} />
          <KV label="Safety test" value={r.three_test_safety || "—"} />
        </div>
      </div>

      <div style={box}>
        <SHead color={B.green}>D. Spiritual impact</SHead>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
          <Stat label="New commitments" value={r.commitments_to_christ ?? 0} tone="#E8F5E9" />
          <Stat label="Recommitments" value={r.recommitments ?? 0} tone="#E8F5E9" />
          <Stat label="Testimonials" value={r.testimonials ?? 0} tone="#E8F5E9" />
          <Stat label="Joining fellowship" value={r.students_joining_fellowship ?? 0} tone="#E8F5E9" />
        </div>
        <Block label="Testimonial summaries" text={r.testimonials_detail} />
        <Block label="Discipleship follow-up" text={r.discipleship_followups} />
      </div>

      <div style={box}>
        <SHead color={B.red}>E. Safeguarding and welfare</SHead>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <KV label="Two-volunteer rule" value={r.two_volunteer_rule ? "Observed" : "NOT observed"} warn={!r.two_volunteer_rule} />
          <KV label="Parental consents" value={r.parental_consents ? "Yes" : "No"} warn={!r.parental_consents} />
          <KV label="School permission" value={r.school_permission ? "Yes" : "No"} warn={!r.school_permission} />
          <KV label="Incidents" value={r.incidents > 0 ? `Yes (${r.incidents})` : "None"} warn={r.incidents > 0} />
          <KV label="Receipts" value={r.receipts_obtained ? "Yes" : "No"} warn={!r.receipts_obtained} />
        </div>
        <Block label="Incident details" text={r.incident_details} tone={B.redLight} />
        <Block label="Welfare concerns" text={r.welfare_concerns} tone={B.yellowLight} />
      </div>

      <div style={box}>
        <SHead>F. Financial accountability</SHead>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <KV label="Approved budget" value={`NGN ${(r.budget_approved || 0).toLocaleString()}`} />
          <KV label="Actual expenditure" value={`NGN ${(r.actual_expenditure || 0).toLocaleString()}`} />
          <KV label="Variance" value={`NGN ${((r.actual_expenditure || 0) - (r.budget_approved || 0)).toLocaleString()}`} />
        </div>
        <Block label="Variance explanation" text={r.variance_explanation} />
      </div>

      <div style={{ ...box, borderRadius: "0 0 10px 10px" }}>
        <SHead color={B.purple}>G. Lessons learned and follow-up</SHead>
        <Block label="What went well" text={r.what_went_well} />
        <Block label="What could be improved" text={r.what_could_improve} />
        <Block label="Recommendations" text={r.recommendations} />
        <Block label="Follow-up actions" text={r.follow_up_actions} />
        <Block label="Next program suggested" text={r.next_program_suggested} />
      </div>
    </div>
  );
}
