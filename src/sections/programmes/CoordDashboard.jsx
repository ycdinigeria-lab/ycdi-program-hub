import { useState } from "react";
import { B } from "../../theme.js";
import { Button, EmptyState, PageHeader } from "../../components/ui.jsx";
import { AttentionPanel, Metric, ProgrammeList } from "./parts.jsx";
import { attentionDetail, excerpt, greeting, needsAttention, programmeTotals } from "../../lib/programmeView.js";

// BATCH41-MARKER programme-dashboards
//
// The chapter coordinator's workspace. It answers, in order: what is waiting
// on me, how are my programmes doing, and where is each one. Who sees which
// programmes, and what a returned note means, are exactly what they were;
// only the way it is laid out has changed.
export default function CoordDashboard({ programs, profile, onView, onNew, onReport }) {
  const mine = programs.filter((p) => p.chapter_name === profile.chapter_name);
  const [status, setStatus] = useState("all");
  const totals = programmeTotals(mine);
  const attention = needsAttention(mine, profile);

  const items = attention.map((p) => {
    const d = attentionDetail(p);
    return {
      id: p.id,
      title: p.title,
      sub: d.label,
      note: d.note ? excerpt(d.note) : "",
      actionLabel: "Review",
      onAct: () => onView(p),
    };
  });

  return (
    <div className="hub-fade-in">
      <PageHeader
        title={greeting(new Date(), profile.full_name)}
        description="Here's what's happening with your programmes."
        action={<Button icon="plus" onClick={onNew}>Submit programme</Button>}
      />

      <AttentionPanel
        tone="attention"
        heading={items.length === 1 ? "1 programme needs your attention" : `${items.length} programmes need your attention`}
        items={items}
        caughtUp={{ title: "You're all caught up", text: "No programmes require action right now." }}
      />

      <div className="hub-metrics">
        <Metric label="Programmes" value={totals.total} onClick={() => setStatus("all")} selected={status === "all"} />
        <Metric
          label="Awaiting approval"
          value={totals.pending}
          accent={totals.pending > 0 ? B.gold : undefined}
          onClick={() => setStatus("pending")}
          selected={status === "pending"}
        />
        <Metric label="Approved" value={totals.approved} onClick={() => setStatus("approved")} selected={status === "approved"} />
        <Metric label="Students planned" value={totals.students.toLocaleString()} />
      </div>

      <div className="hub-section-head">
        <h3 className="hub-section-title">{profile.chapter_name ? profile.chapter_name + " chapter programmes" : "My programmes"}</h3>
      </div>

      <ProgrammeList
        programs={mine}
        status={status}
        onStatus={setStatus}
        onView={onView}
        renderAction={(p) =>
          (p.status === "Approved" || p.status === "Live") && !p.report ? (
            <Button variant="outline" size="sm" icon="clipboard" onClick={() => onReport(p)} aria-label={"Log report for " + p.title}>
              Log report
            </Button>
          ) : null
        }
        emptyState={
          <EmptyState
            title="No programmes yet"
            text="You haven't submitted a programme for this chapter."
            action={<Button icon="plus" onClick={onNew}>Submit your first programme</Button>}
          />
        }
      />
    </div>
  );
}

