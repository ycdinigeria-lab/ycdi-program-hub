import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { B, btnP, btnR, btnG, ta, inp } from "../../theme.js";
import { Card, SHead, Badge } from "../../components/ui.jsx";
import { THREE_TESTS, PRIORITIES, NEEDS_QUESTIONS } from "../../data/programmes.js";
import { approvalLevelInfo, missionTestPasses } from "../../lib/programmes.js";
import ReportSummary from "./ReportSummary.jsx";
import { downloadReportText } from "./reportExport.js";

// BATCH37-MARKER concept-note-v2
// Approving now depends on the programme's approval level (section 1.15):
// Level 3 approves exactly as before; Level 4 needs the National
// Coordinator to confirm Board Treasurer concurrence first; Level 5 needs
// the Board's approval date and minute reference recorded first. Godfrey
// chose the simpler route over having the Treasurer countersign in the
// app themselves: the NC ticks the confirmation, same as they would tick
// it off on a paper approval sheet.
export default function ProgramDetail({ program, profile, onBack, onApprove, onReturn, onDecline, onRcReturn, onLogReport, onEdit }) {
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  const [signoff, setSignoff] = useState(null); // { level, treasurer_concurrence, treasurer_name, board_minute_ref, board_approval_date }
  // BATCH38-MARKER tm-rc-review-chain
  // rcAction is "decline" or "return" while that modal is open; rcComment
  // is shared by both since only one is ever open at a time.
  const [rcAction, setRcAction] = useState(null);
  const [rcComment, setRcComment] = useState("");
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

  const level = approvalLevelInfo(program.budget);
  const today = new Date().toISOString().slice(0, 10);

  function testPasses(test) {
    if (test.name === "Mission test") return missionTestPasses(program);
    if (test.name === "Quality test") return !!program.facilitators;
    return !!program.safeguarding_lead;
  }

  function startApproving() {
    if (level.level === 3) { onApprove(program.id); return; }
    if (level.level === 4) { setSignoff({ treasurer_concurrence: false, treasurer_name: "" }); return; }
    setSignoff({ board_minute_ref: "", board_approval_date: today });
  }

  async function confirmApprove() {
    setBusy(true);
    const ok = await onApprove(program.id, signoff);
    setBusy(false);
    if (ok !== false) setSignoff(null);
  }

  async function submitReturn() {
    if (!comment.trim()) return;
    setBusy(true);
    await onReturn(program.id, comment);
    setReturning(false);
    setBusy(false);
  }

  // BATCH38-MARKER tm-rc-review-chain
  async function submitRcAction() {
    if (!rcComment.trim()) return;
    setBusy(true);
    if (rcAction === "decline") await onDecline(program.id, rcComment);
    else await onRcReturn(program.id, rcComment);
    setRcAction(null);
    setRcComment("");
    setBusy(false);
  }

  const hasReport = !!report;
  const canLogReport = (program.status === "Approved" || program.status === "Live") && (profile.is_admin || profile.chapter_name === program.chapter_name);

  // A returned programme told the coordinator to revise and resubmit and
  // then gave them no way to do either. Editing is limited to Returned on
  // purpose: a Pending one may be open in front of the National
  // Coordinator at that very moment, and changing it underneath them
  // would be worse than the problem this fixes.
  // BATCH4B-MARKER resubmit
  const canEditReturned = program.status === "Returned"
    && (profile.is_admin || (profile.role === "RC" && profile.chapter_name === program.chapter_name));
  // BATCH38-MARKER tm-rc-review-chain
  // A note the RC sent back can only be revised by the team member who
  // submitted it (or an admin) — not by just anyone in the chapter.
  const canEditRcReturned = program.status === "RC Returned"
    && (profile.is_admin || program.submitted_by === profile.id);
  const canEdit = canEditReturned || canEditRcReturned;
  // The chapter's RC (or an admin) can act on a team member's note
  // sitting in RC Review: decline it, return it with a comment, or edit
  // it themselves and forward it on to the NC.
  const canActAsRC = program.status === "RC Review"
    && (profile.is_admin || (profile.role === "RC" && profile.chapter_name === program.chapter_name));

  const detailRows = [
    ["School / venue", program.school],
    ["Target students", program.students],
    ["Age range", program.age_range],
    ["Geographic scope", program.geographic_scope],
    ["Delivery format", program.delivery_format],
    ["Budget", `NGN ${(program.budget || 0).toLocaleString()}`],
    program.spent > 0 ? ["Spent", `NGN ${program.spent.toLocaleString()}`] : null,
    ["Submitted", program.created_at ? new Date(program.created_at).toLocaleDateString() : ""],
    ["Safeguarding lead", program.safeguarding_lead],
    ["Facilitators", program.facilitators],
  ].filter((r) => r && r[1]);

  return (
    <div style={{ fontFamily: "'Open Sans',sans-serif" }}>
      <button onClick={onBack} style={{ ...btnG, marginBottom: 18 }}>Back to Programs</button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{program.title}</h2>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 5 }}>{program.chapter_name} Chapter - {program.type} - {program.date}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {profile.is_admin && program.status === "Pending" ? (
            <>
              <button onClick={startApproving} style={btnP}>Approve</button>
              <button onClick={() => setReturning(true)} style={btnR}>Return with Comment</button>
            </>
          ) : null}
          {canActAsRC ? (
            <>
              <button onClick={onEdit} style={btnP}>Revise & Forward to NC</button>
              <button onClick={() => { setRcAction("return"); setRcComment(""); }} style={btnG}>Return with Comment</button>
              <button onClick={() => { setRcAction("decline"); setRcComment(""); }} style={btnR}>Decline</button>
            </>
          ) : null}
          {canEdit && onEdit ? (
            <button onClick={onEdit} style={btnP}>Edit and resubmit</button>
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

      <Card style={{ background: B.blueLight, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#065f87", lineHeight: 1.7 }}>
          <strong>Approval level {level.level}</strong> (per section 1.15) — {level.approver}. {level.timeframe}.
          {level.level === 4 ? (
            <span> {program.treasurer_concurrence ? ` Treasurer concurrence confirmed${program.treasurer_name ? ` by ${program.treasurer_name}` : ""}${program.treasurer_concurrence_date ? ` on ${program.treasurer_concurrence_date}` : ""}.` : " Awaiting Treasurer concurrence."}</span>
          ) : null}
          {level.level === 5 ? (
            <span> {program.board_minute_ref ? ` Board approval: minute ${program.board_minute_ref}${program.board_approval_date ? ` (${program.board_approval_date})` : ""}.` : " Awaiting Board approval date and minute reference."}</span>
          ) : null}
        </div>
      </Card>

      {program.status === "Returned" && program.nc_comment ? (
        <Card style={{ background: B.redLight, borderColor: `${B.red}50`, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.red, fontFamily: "'Montserrat',sans-serif", marginBottom: 8, textTransform: "uppercase" }}>Returned by National Coordinator</div>
          <p style={{ margin: 0, fontSize: 13, color: "#5a0a13", lineHeight: 1.6, fontStyle: "italic" }}>"{program.nc_comment}"</p>
          <div style={{ marginTop: 10 }}>
            {canEditReturned && onEdit ? (
              <button onClick={onEdit} style={btnR}>Revise and resubmit</button>
            ) : (
              <span style={{ fontSize: 12, color: B.red }}>
                Your Regional Coordinator or an administrator can revise and resubmit this.
              </span>
            )}
          </div>
        </Card>
      ) : null}

      {/* BATCH38-MARKER tm-rc-review-chain */}
      {program.status === "RC Returned" ? (
        <Card style={{ background: B.redLight, borderColor: `${B.red}50`, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.red, fontFamily: "'Montserrat',sans-serif", marginBottom: 8, textTransform: "uppercase" }}>Returned by your Regional Coordinator</div>
          {program.rc_comment ? <p style={{ margin: 0, fontSize: 13, color: "#5a0a13", lineHeight: 1.6, fontStyle: "italic" }}>"{program.rc_comment}"</p> : null}
          <div style={{ marginTop: 10 }}>
            {canEditRcReturned && onEdit ? (
              <button onClick={onEdit} style={btnR}>Revise and resubmit</button>
            ) : (
              <span style={{ fontSize: 12, color: B.red }}>
                The team member who submitted this can revise and resubmit it.
              </span>
            )}
          </div>
        </Card>
      ) : null}

      {program.status === "Declined" ? (
        <Card style={{ background: B.redLight, borderColor: `${B.red}50`, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", marginBottom: 8, textTransform: "uppercase" }}>Declined by Regional Coordinator</div>
          {program.rc_comment ? <p style={{ margin: 0, fontSize: 13, color: "#5a0a13", lineHeight: 1.6, fontStyle: "italic" }}>"{program.rc_comment}"</p> : null}
          <p style={{ margin: "10px 0 0", fontSize: 12, color: B.black }}>
            This concept note will not proceed. Start a new concept note to try again.
          </p>
        </Card>
      ) : null}

      <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, marginBottom: 14 }}>
        <Card>
          <SHead>Program details</SHead>
          {detailRows.map(([k, v]) => (
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
            {program.me_indicators ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 10, marginBottom: 6 }}>M&E indicators</div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>{program.me_indicators}</p>
              </>
            ) : null}
          </div>
        </Card>
      </div>

      {program.needs_evidence || program.align_reach ? (
        <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, marginBottom: 14 }}>
          {program.needs_evidence ? (
            <Card>
              <SHead>Needs identification</SHead>
              {NEEDS_QUESTIONS.map((q) => program[q.key] ? (
                <div key={q.key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: B.muted }}>{q.label}</div>
                  <p style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.6 }}>{program[q.key]}</p>
                </div>
              ) : null)}
            </Card>
          ) : null}
          {program.align_reach ? (
            <Card>
              <SHead>Strategic priority alignment</SHead>
              {PRIORITIES.map((p) => program[p.key] ? (
                <div key={p.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${B.offWhite}` }}>
                  <span style={{ color: B.muted }}>{p.label}</span>
                  <span style={{ fontWeight: 700, color: program[p.key] === "Strong" ? B.green : program[p.key] === "None" ? B.red : "#7a5c00" }}>{program[p.key]}</span>
                </div>
              ) : null)}
            </Card>
          ) : null}
        </div>
      ) : null}

      {program.format_reasoning || program.activities_schedule || program.cost_lines || program.digital_safeguarding || program.permission_requirements ? (
        <Card style={{ marginBottom: 14 }}>
          <SHead>Delivery, safeguarding and permissions</SHead>
          {[
            ["Format reasoning", program.format_reasoning],
            ["Activities and schedule", program.activities_schedule],
            ["Key cost lines", program.cost_lines],
            ["Digital safeguarding", program.digital_safeguarding],
            ["Permission requirements", program.permission_requirements],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
              <p style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.6 }}>{v}</p>
            </div>
          ))}
        </Card>
      ) : null}

      {loadingReport ? (
        <Card style={{ textAlign: "center", padding: 24, color: B.muted, fontSize: 13 }}>Loading report...</Card>
      ) : hasReport ? (
        <ReportSummary r={report} />
      ) : null}

      {signoff ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: 500 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${B.border}` }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.blue }}>
                {level.level === 4 ? "Confirm Treasurer concurrence" : "Record Board approval"}
              </span>
              <button onClick={() => setSignoff(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: B.muted }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {level.level === 4 ? (
                <>
                  <p style={{ fontSize: 12, color: B.muted, lineHeight: 1.6, marginTop: 0 }}>
                    This is a Level 4 programme (N500,001–N2,000,000). Section 1.15 requires the National Coordinator and Board Treasurer to approve jointly, in writing. Confirm that has happened before approving here.
                  </p>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 12 }}>
                    <input type="checkbox" checked={signoff.treasurer_concurrence} onChange={(e) => setSignoff((s) => ({ ...s, treasurer_concurrence: e.target.checked }))} style={{ marginTop: 3 }} />
                    Treasurer concurrence received
                  </label>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Treasurer name</label>
                  <input style={inp} value={signoff.treasurer_name} onChange={(e) => setSignoff((s) => ({ ...s, treasurer_name: e.target.value }))} placeholder="Full name of the Board Treasurer" />
                </>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: B.muted, lineHeight: 1.6, marginTop: 0 }}>
                    This is a Level 5 programme (above N2,000,000, or a new programme line, chapter launch, or digital platform commitment). Section 1.15 requires full Board approval. Record the date and minute reference before approving here.
                  </p>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Board minute reference</label>
                  <input style={{ ...inp, marginBottom: 12 }} value={signoff.board_minute_ref} onChange={(e) => setSignoff((s) => ({ ...s, board_minute_ref: e.target.value }))} placeholder="e.g. NEC/2026/09" />
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Board approval date</label>
                  <input type="date" style={inp} value={signoff.board_approval_date} onChange={(e) => setSignoff((s) => ({ ...s, board_approval_date: e.target.value }))} />
                </>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button style={btnG} onClick={() => setSignoff(null)}>Cancel</button>
                <button
                  style={{ ...btnP, opacity: busy || (level.level === 4 ? !signoff.treasurer_concurrence : !(signoff.board_minute_ref && signoff.board_approval_date)) ? 0.4 : 1 }}
                  disabled={busy || (level.level === 4 ? !signoff.treasurer_concurrence : !(signoff.board_minute_ref && signoff.board_approval_date))}
                  onClick={confirmApprove}
                >
                  {busy ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          </div>
        </div>
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

      {/* BATCH38-MARKER tm-rc-review-chain: the RC's Decline / Return with
          comment modal on a team member's submitted note. */}
      {rcAction ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: 500 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${B.border}` }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.red }}>
                {rcAction === "decline" ? "Decline this concept note" : "Return with comment"}
              </span>
              <button onClick={() => setRcAction(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: B.muted }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <p style={{ fontSize: 12, color: B.muted, lineHeight: 1.6, marginTop: 0 }}>
                {rcAction === "decline"
                  ? "This note will not proceed. The team member will need to start a fresh concept note — give them a clear reason."
                  : "Sends this back to the team member to revise and resubmit to you."}
              </p>
              <textarea
                style={{ ...ta, minHeight: 110 }}
                value={rcComment}
                onChange={(e) => setRcComment(e.target.value)}
                placeholder={rcAction === "decline" ? "Why this concept note is being declined…" : "What needs to change before this can go forward…"}
                autoFocus
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button style={btnG} onClick={() => setRcAction(null)}>Cancel</button>
                <button style={{ ...btnR, opacity: rcComment.trim() && !busy ? 1 : 0.4 }} disabled={!rcComment.trim() || busy} onClick={submitRcAction}>
                  {busy ? "Saving..." : rcAction === "decline" ? "Decline" : "Return to Team Member"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
