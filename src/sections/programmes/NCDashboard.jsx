import { useState } from "react";
import { B } from "../../theme.js";
import { Card, EmptyState, MiniBar, PageHeader } from "../../components/ui.jsx";
import { CHAPTERS_FALLBACK } from "../../data/programmes.js";
import { AttentionPanel, Metric, ProgrammeList } from "./parts.jsx";
import { plural, programmeTotals } from "../../lib/programmeView.js";

// BATCH41-MARKER programme-dashboards
//
// The National Coordinator's view is about review and oversight, so what is
// waiting for approval comes first, then the overall picture, then every
// programme with search and filters, with the chapter chart alongside.
export default function NCDashboard({ programs, chapters, onView }) {
  const [status, setStatus] = useState("all");
  const totals = programmeTotals(programs);
  const pending = programs.filter((p) => p.status === "Pending");

  const chapterNames = chapters.length ? chapters.map((c) => c.name) : CHAPTERS_FALLBACK;
  const byChapter = chapterNames.map((c) => ({
    c, n: programs.filter((p) => p.chapter_name === c).reduce((sum, p) => sum + (Number(p.students) || 0), 0),
  }));
  const maxStudents = Math.max(...byChapter.map((c) => c.n), 1);

  const items = pending.map((p) => ({
    id: p.id,
    title: p.title,
    sub: [p.chapter_name ? p.chapter_name + " Chapter" : "", p.created_at ? "Submitted " + new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · "),
    actionLabel: "Review programme",
    onAct: () => onView(p),
  }));

  return (
    <div className="hub-fade-in">
      <PageHeader title="Programme overview" description="Monitor programme activity across YCDI chapters." />

      <AttentionPanel
        tone="notice"
        heading={`${pending.length} ${plural(pending.length, "programme is", "programmes are")} awaiting approval`}
        items={items}
        caughtUp={{ title: "You're all caught up", text: "There are no programmes waiting for your review." }}
      />

      <div className="hub-metrics">
        <Metric label="Total programmes" value={totals.total} onClick={() => setStatus("all")} selected={status === "all"} />
        <Metric
          label="Awaiting approval"
          value={totals.pending}
          accent={totals.pending > 0 ? B.gold : undefined}
          onClick={() => setStatus("pending")}
          selected={status === "pending"}
        />
        <Metric label="Live" value={totals.live} onClick={() => setStatus("live")} selected={status === "live"} />
        <Metric label="Completed" value={totals.complete} onClick={() => setStatus("complete")} selected={status === "complete"} />
        <Metric label="Students planned" value={totals.students.toLocaleString()} />
      </div>

      <div className="ncsplit">
        <div>
          <div className="hub-section-head">
            <h3 className="hub-section-title">All programmes</h3>
          </div>
          <ProgrammeList
            programs={programs}
            status={status}
            onStatus={setStatus}
            onView={onView}
            emptyState={
              <Card variant="surface">
                <EmptyState title="No programmes yet" text="Programmes submitted by the chapters will appear here." />
              </Card>
            }
          />
        </div>

        <Card variant="surface" style={{ alignSelf: "start" }}>
          <h3 className="hub-section-title">Students by chapter</h3>
          {byChapter.slice().sort((a, b) => b.n - a.n).map(({ c, n }) => (
            <div key={c} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: B.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: B.blue, flexShrink: 0, fontFamily: "'Montserrat',sans-serif" }}>{n.toLocaleString()}</span>
              </div>
              <MiniBar value={n} max={maxStudents} label={c + ": " + n + " students"} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
