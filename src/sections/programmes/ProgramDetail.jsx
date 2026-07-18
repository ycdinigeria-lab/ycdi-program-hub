import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { B, btnP, btnR, btnG, ta } from "../../theme.js";
import { Card, SHead, Badge } from "../../components/ui.jsx";
import { THREE_TESTS } from "../../data/programmes.js";
import ReportSummary from "./ReportSummary.jsx";
import { downloadReportText } from "./reportExport.js";

export default function ProgramDetail({ program, profile, onBack, onApprove, onReturn, onLogReport }) {
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(program.report || null);
  const [loadingReport, setLoadingReport] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingReport(true);
      const { data } = await supabase.from("reports").select("*").eq("program_id", program.id).single();
      if (active) { setReport(data || null); setLoadingReport(false); }
    })();
    return () => { active = false; };
  }, [program.id]);

  function testPasses(test) {
    if (test.name === "Mission test") return (program.objectives || "").length > 20;
    if (test.name === "Quality test") return !!program.facilitators;
    return !!program.safeguarding_lead;
  }

  async function submitReturn() {
    if (!comment.trim()) return;
    setBusy(true);
    await onReturn(program.id, comment);
    setReturning(false);
    setBusy(false);
  }

  const hasReport = !!report;
  const canLogReport = (program.status === "Approved" || program.status === "Live") && (profile.role === "NC" || profile.chapter_name === program.chapter_name);

  return (
    <div style={{ fontFamily: "'Open Sans',sans-serif" }}>
      <button onClick={onBack} style={{ ...btnG, marginBottom: 18 }}>Back to Programs</button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{program.title}</h2>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 5 }}>{program.chapter_name} Chapter - {program.type} - {program.date}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {profile.role === "NC" && program.status === "Pending" ? (
            <>
              <button onClick={() => onApprove(program.id)} style={btnP}>Approve</button>
              <button onClick={() => setReturning(true)} style={btnR}>Return with Comment</button>
            </>
          ) : null}
          {loadingReport ? <span style={{ fontSize: 12, color: B.muted }}>Checking report...</span> : null}
          {!loadingReport && !hasReport && canLogReport ? (
            <button onClick={() => onLogReport(program)} style={btnP}>Log Report</button>
          ) : null}
          {!loadingReport && hasReport ? (
            <>
              <span style={{ color: B.green, fontSize: 13, fontWeight: 600 }}>Report submitted</span>
              <button onClick={() => downloadReportText(program, report)} style={{ background: B.green, color: B.white, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}>
                Download report
              </button>
            </>
          ) : null}
          <Badge status={program.status} />
        </div>
      </div>

      {program.status === "Returned" && program.nc_comment ? (
        <Card style={{ background: B.redLight, borderColor: `${B.red}50`, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.red, fontFamily: "'Montserrat',sans-serif", marginBottom: 8, textTransform: "uppercase" }}>Returned by National Coordinator</div>
          <p style={{ margin: 0, fontSize: 13, color: "#5a0a13", lineHeight: 1.6, fontStyle: "italic" }}>"{program.nc_comment}"</p>
          <div style={{ marginTop: 8, fontSize: 12, color: B.red }}>Please revise and resubmit.</div>
        </Card>
      ) : null}

      <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, marginBottom: 14 }}>
        <Card>
          <SHead>Program details</SHead>
          {[
            ["School / venue", program.school],
            ["Target students", program.students],
            ["Budget", `NGN ${(program.budget || 0).toLocaleString()}`],
            program.spent > 0 ? ["Spent", `NGN ${program.spent.toLocaleString()}`] : null,
            ["Submitted", program.created_at ? new Date(program.created_at).toLocaleDateString() : ""],
            ["Safeguarding lead", program.safeguarding_lead],
            ["Facilitators", program.facilitators],
          ].filter(Boolean).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${B.offWhite}` }}>
              <span style={{ color: B.muted }}>{k}</span>
              <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "58%", wordBreak: "break-word" }}>{v}</span>
            </div>
          ))}
        </Card>

        <Card>
          <SHead>YCDI three-program tests</SHead>
          {THREE_TESTS.map((t) => {
            const ok = testPasses(t);
            return (
              <div key={t.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${B.offWhite}` }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: ok ? `${t.color}20` : B.redLight, color: ok ? t.color : B.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, fontWeight: 700 }}>
                  {ok ? "OK" : "!"}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ok ? B.black : B.red, fontFamily: "'Montserrat',sans-serif" }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{t.q}</div>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Objectives</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>{program.objectives}</p>
          </div>
        </Card>
      </div>

      {loadingReport ? (
        <Card style={{ textAlign: "center", padding: 24, color: B.muted, fontSize: 13 }}>Loading report...</Card>
      ) : hasReport ? (
        <ReportSummary r={report} />
      ) : null}

      {returning ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: 500 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${B.border}` }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.red }}>Return with comment</span>
              <button onClick={() => setReturning(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: B.muted }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <textarea style={{ ...ta, minHeight: 110 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain what needs to change before this can be approved…" autoFocus />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button style={btnG} onClick={() => setReturning(false)}>Cancel</button>
                <button style={{ ...btnR, opacity: comment.trim() && !busy ? 1 : 0.4 }} disabled={!comment.trim() || busy} onClick={submitReturn}>
                  {busy ? "Saving..." : "Return to Coordinator"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
