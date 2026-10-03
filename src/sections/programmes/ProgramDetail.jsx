import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { B, ta } from "../../theme.js";
import { Badge, Button, Card, Field, Modal, PageHeader, SkeletonCard, SkeletonRegion } from "../../components/ui.jsx";
import Icon from "../../components/Icon.jsx";
import ReportSummary from "./ReportSummary.jsx";
import { downloadReportText } from "./reportExport.js";
import { FactsStrip, PeopleList, ReadinessChecklist } from "./parts.jsx";
import { fullDate, programmePermissions, readinessChecks, splitNames } from "../../lib/programmeView.js";

// BATCH41-MARKER programme-detail
//
// The programme page, rebuilt to answer three things in order: what is this
// and where does it stand (title, status, the actions open to you), what are
// the facts (date, students, budget, venue), and is it ready (objectives,
// people, the three checks). Every rule about who may approve, return,
// decline, edit or log a report is carried over unchanged from before; only
// the layout, wording and look are new.
export default function ProgramDetail({ program, profile, onBack, onApprove, onReturn, onDecline, onRcReturn, onLogReport, onEdit }) {
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  // BATCH38-MARKER tm-rc-review-chain
  // rcAction is "decline" or "return" while that dialog is open; rcComment
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
  // BATCH4B-MARKER resubmit
  // BATCH38-MARKER tm-rc-review-chain
  // Who may do what lives in lib/programmeView.js, where each rule is
  // written out with its reason and tested on its own.
  const { canApprove, canLogReport, canEditReturned, canEditRcReturned, canEdit, canActAsRC } = programmePermissions(program, profile);

  const actions = (
    <>
      {canApprove ? (
        <>
          <Button onClick={() => onApprove(program.id)}>Approve programme</Button>
          <Button variant="outline" onClick={() => setReturning(true)}>Request changes</Button>
        </>
      ) : null}
      {canActAsRC ? (
        <>
          <Button onClick={onEdit}>Revise and forward to NC</Button>
          <Button variant="outline" onClick={() => { setRcAction("return"); setRcComment(""); }}>Request changes</Button>
          <Button variant="danger" onClick={() => { setRcAction("decline"); setRcComment(""); }}>Decline</Button>
        </>
      ) : null}
      {canEdit && onEdit ? <Button onClick={onEdit}>Edit and resubmit</Button> : null}
      {loadingReport ? <span className="hub-muted" style={{ fontSize: 13 }}>Checking report...</span> : null}
      {!loadingReport && !hasReport && canLogReport ? (
        <Button icon="clipboard" onClick={() => onLogReport(program)}>Log report</Button>
      ) : null}
      {!loadingReport && hasReport ? (
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: B.green, fontSize: 13, fontWeight: 700 }}>
            <Icon name="circleCheck" size={18} />Report submitted
          </span>
          <Button variant="secondary" icon="download" onClick={() => downloadReportText(program, report)}>Download report</Button>
        </>
      ) : null}
    </>
  );

  const subtitle = [program.chapter_name ? program.chapter_name + " Chapter" : "", program.type].filter(Boolean).join(" · ");
  const objectives = String(program.objectives || "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const checks = readinessChecks(program);
  const leads = program.safeguarding_lead ? [String(program.safeguarding_lead).trim()] : [];

  return (
    <div className="hub-fade-in" style={{ fontFamily: "'Open Sans',sans-serif" }}>
      <PageHeader
        back={{ label: "Back to programmes", onClick: onBack }}
        title={program.title}
        description={subtitle}
        meta={<Badge status={program.status} />}
        action={actions}
      />

      {program.status === "Returned" && program.nc_comment ? (
        <Card variant="attention" style={{ marginBottom: 16 }}>
          <div className="hub-attn-head">
            <Icon name="alert" size={20} style={{ color: B.red }} />
            <h3 className="hub-section-title">Returned by the National Coordinator</h3>
          </div>
          <p className="hub-quote">&ldquo;{program.nc_comment}&rdquo;</p>
          <div style={{ marginTop: 12 }}>
            {canEditReturned && onEdit ? (
              <Button onClick={onEdit}>Revise and resubmit</Button>
            ) : (
              <span style={{ fontSize: 13, color: "#5a0a13" }}>
                Your Regional Coordinator or an administrator can revise and resubmit this.
              </span>
            )}
          </div>
        </Card>
      ) : null}

      {/* BATCH38-MARKER tm-rc-review-chain */}
      {program.status === "RC Returned" ? (
        <Card variant="attention" style={{ marginBottom: 16 }}>
          <div className="hub-attn-head">
            <Icon name="alert" size={20} style={{ color: B.red }} />
            <h3 className="hub-section-title">Returned by your Regional Coordinator</h3>
          </div>
          {program.rc_comment ? <p className="hub-quote">&ldquo;{program.rc_comment}&rdquo;</p> : null}
          <div style={{ marginTop: 12 }}>
            {canEditRcReturned && onEdit ? (
              <Button onClick={onEdit}>Revise and resubmit</Button>
            ) : (
              <span style={{ fontSize: 13, color: "#5a0a13" }}>
                The team member who submitted this can revise and resubmit it.
              </span>
            )}
          </div>
        </Card>
      ) : null}

      {program.status === "Declined" ? (
        <Card variant="attention" style={{ marginBottom: 16 }}>
          <div className="hub-attn-head">
            <Icon name="alert" size={20} style={{ color: B.red }} />
            <h3 className="hub-section-title">Declined by the Regional Coordinator</h3>
          </div>
          {program.rc_comment ? <p className="hub-quote">&ldquo;{program.rc_comment}&rdquo;</p> : null}
          <p style={{ margin: "10px 0 0", fontSize: 13, color: B.black }}>
            This concept note will not proceed. Start a new concept note to try again.
          </p>
        </Card>
      ) : null}

      <FactsStrip
        facts={[
          { label: "Programme date", value: fullDate(program.date) },
          { label: "Students", value: program.students === undefined || program.students === null || program.students === "" ? "" : Number(program.students).toLocaleString() },
          { label: "Budget", value: `NGN ${(program.budget || 0).toLocaleString()}` },
          program.spent > 0 ? { label: "Spent", value: `NGN ${program.spent.toLocaleString()}` } : null,
          { label: "Venue", value: program.school },
        ].filter(Boolean)}
      />

      <div className="hub-detail-grid">
        <div className="hub-stack">
          <Card variant="surface">
            <h3 className="hub-section-title">Objectives</h3>
            {objectives.length === 0 ? (
              <p className="hub-prose hub-muted">No objectives written yet.</p>
            ) : (
              objectives.map((para, i) => <p className="hub-prose" style={{ whiteSpace: "pre-line" }} key={i}>{para}</p>)
            )}
          </Card>

          <Card variant="surface">
            <h3 className="hub-section-title">People</h3>
            <p className="hub-eyebrow">Facilitators</p>
            <PeopleList names={splitNames(program.facilitators)} emptyText="No facilitators named." />
            <p className="hub-eyebrow" style={{ marginTop: 18 }}>Safeguarding lead</p>
            <PeopleList names={leads} emptyText="No safeguarding lead assigned." />
          </Card>
        </div>

        <div className="hub-stack">
          <ReadinessChecklist checks={checks} />
          {program.created_at ? (
            <Card variant="surface">
              <p className="hub-eyebrow">Submitted</p>
              <p className="hub-prose" style={{ margin: 0 }}>{new Date(program.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
            </Card>
          ) : null}
        </div>
      </div>

      {loadingReport ? (
        <SkeletonRegion label="Loading report"><SkeletonCard /></SkeletonRegion>
      ) : hasReport ? (
        <ReportSummary r={report} />
      ) : null}

      {returning ? (
        <Modal
          title="Request changes"
          busy={busy}
          onClose={() => setReturning(false)}
          footer={
            <>
              <Button variant="tertiary" disabled={busy} onClick={() => setReturning(false)}>Cancel</Button>
              <Button iconRight="arrowRight" disabled={!comment.trim() || busy} onClick={submitReturn}>
                {busy ? "Sending..." : "Send feedback"}
              </Button>
            </>
          }
        >
          <p className="hub-prose hub-muted">Tell the chapter coordinator what needs to be changed before approval.</p>
          <Field label="Feedback" required>
            <textarea data-autofocus style={{ ...ta, minHeight: 120 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Please update..." />
          </Field>
        </Modal>
      ) : null}

      {/* BATCH38-MARKER tm-rc-review-chain: the RC's Decline / Request
          changes dialog on a team member's submitted note. */}
      {rcAction ? (
        <Modal
          title={rcAction === "decline" ? "Decline this concept note" : "Request changes"}
          busy={busy}
          onClose={() => setRcAction(null)}
          footer={
            <>
              <Button variant="tertiary" disabled={busy} onClick={() => setRcAction(null)}>Cancel</Button>
              <Button
                variant={rcAction === "decline" ? "danger" : "primary"}
                iconRight={rcAction === "decline" ? undefined : "arrowRight"}
                disabled={!rcComment.trim() || busy}
                onClick={submitRcAction}
              >
                {busy ? "Saving..." : rcAction === "decline" ? "Decline" : "Send feedback"}
              </Button>
            </>
          }
        >
          <p className="hub-prose hub-muted">
            {rcAction === "decline"
              ? "This note will not proceed. The team member will need to start a fresh concept note, so give them a clear reason."
              : "Sends this back to the team member to revise and resubmit to you."}
          </p>
          <Field label={rcAction === "decline" ? "Reason" : "Feedback"} required>
            <textarea
              data-autofocus
              style={{ ...ta, minHeight: 120 }}
              value={rcComment}
              onChange={(e) => setRcComment(e.target.value)}
              placeholder={rcAction === "decline" ? "Why this concept note is being declined..." : "What needs to change before this can go forward..."}
            />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
