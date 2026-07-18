import { B, STATUS_CFG } from "../../theme.js";
import { Card, SHead, StatCard, MiniBar, Badge } from "../../components/ui.jsx";
import { CHAPTERS_FALLBACK } from "../../data/programmes.js";
import PendingApprovals from "../../auth/PendingApprovals.jsx";

export default function NCDashboard({ programs, chapters, onView }) {
  const pending = programs.filter((p) => p.status === "Pending");
  const chapterNames = chapters.length ? chapters.map((c) => c.name) : CHAPTERS_FALLBACK;
  const byChapter = chapterNames.map((c) => ({
    c, n: programs.filter((p) => p.chapter_name === c).reduce((sum, p) => sum + p.students, 0),
  }));
  const maxStudents = Math.max(...byChapter.map((c) => c.n), 1);

  return (
    <div>
      <div className="rstats" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total programs" value={programs.length} />
        <StatCard label="Students planned" value={programs.reduce((s, p) => s + p.students, 0).toLocaleString()} />
        <StatCard label="Awaiting approval" value={pending.length} accent={pending.length > 0 ? B.yellow : B.blue} />
        <StatCard label="Live now" value={programs.filter((p) => p.status === "Live").length} accent="#2ecc71" />
      </div>

      {pending.length > 0 ? (
        <Card style={{ background: B.yellowLight, borderColor: `${B.yellow}80`, marginBottom: 14 }}>
          <SHead>Pending your approval</SHead>
          {pending.map((p, i) => (
            <div key={p.id} onClick={() => onView(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < pending.length - 1 ? `1px solid ${B.yellow}40` : "none", cursor: "pointer" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: 11, color: B.muted }}>{p.chapter_name} - {new Date(p.created_at).toLocaleDateString()}</div>
              </div>
              <span style={{ fontSize: 12, color: B.gold, fontWeight: 600 }}>Review</span>
            </div>
          ))}
        </Card>
      ) : null}

      <PendingApprovals />

      <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 14 }}>
        <Card>
          <SHead>All programs</SHead>
          {programs.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: B.muted, fontSize: 13 }}>No programs submitted yet.</div>
          ) : null}
          {programs.map((p, i) => (
            <div
              key={p.id}
              onClick={() => onView(p)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: i < programs.length - 1 ? `1px solid ${B.offWhite}` : "none", cursor: "pointer" }}
            >
              <div style={{ width: 4, height: 40, borderRadius: 2, background: (STATUS_CFG[p.status] || {}).dot || B.border, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{p.chapter_name} - {p.date} - {p.students} students</div>
              </div>
              <Badge status={p.status} />
            </div>
          ))}
        </Card>

        <Card>
          <SHead>Students by chapter</SHead>
          {byChapter.slice().sort((a, b) => b.n - a.n).map(({ c, n }) => (
            <div key={c} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: B.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: B.blue, flexShrink: 0, fontFamily: "'Montserrat',sans-serif" }}>{n}</span>
              </div>
              <MiniBar value={n} max={maxStudents} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
