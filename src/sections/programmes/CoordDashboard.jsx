import { B, STATUS_CFG, btnP } from "../../theme.js";
import { Card, SHead, StatCard, Badge } from "../../components/ui.jsx";

export default function CoordDashboard({ programs, profile, onView, onNew, onReport }) {
  const mine = programs.filter((p) => p.chapter_name === profile.chapter_name);
  const returned = mine.filter((p) => p.status === "Returned");

  return (
    <div>
      <div className="rstats" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="My programs" value={mine.length} />
        <StatCard label="Students this month" value={mine.reduce((s, p) => s + p.students, 0)} />
        <StatCard label="Awaiting NC approval" value={mine.filter((p) => p.status === "Pending").length} accent={mine.filter((p) => p.status === "Pending").length > 0 ? B.gold : B.blue} />
      </div>

      {returned.length > 0 ? (
        <Card style={{ background: B.redLight, borderColor: `${B.red}40`, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.red, fontFamily: "'Montserrat',sans-serif", marginBottom: 8, textTransform: "uppercase" }}>Returned - action needed</div>
          {returned.map((p) => (
            <div key={p.id} onClick={() => onView(p)} style={{ cursor: "pointer", padding: "6px 0", borderBottom: `1px solid ${B.red}20` }}>
              <div style={{ fontSize: 13, color: B.red, fontWeight: 600, textDecoration: "underline" }}>{p.title}</div>
              {p.nc_comment ? (
                <div style={{ fontSize: 11, color: "#8b0a1c", marginTop: 3, fontStyle: "italic" }}>
                  NC: "{p.nc_comment.slice(0, 80)}{p.nc_comment.length > 80 ? "..." : ""}"
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <SHead>{profile.chapter_name} chapter programs</SHead>
          <button onClick={onNew} style={{ ...btnP, padding: "7px 16px", fontSize: 12 }}>+ Submit Outreach</button>
        </div>
        {mine.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: B.muted }}>No programs submitted yet for your chapter.</div>
          </div>
        ) : null}
        {mine.map((p, i) => (
          <div
            key={p.id}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: i < mine.length - 1 ? `1px solid ${B.offWhite}` : "none" }}
          >
            <div onClick={() => onView(p)} style={{ width: 4, height: 42, borderRadius: 2, background: (STATUS_CFG[p.status] || {}).dot || B.border, flexShrink: 0, cursor: "pointer" }} />
            <div onClick={() => onView(p)} style={{ flex: 1, cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{p.type} - {p.date} - {p.students} students</div>
            </div>
            {(p.status === "Approved" || p.status === "Live") && !p.report ? (
              <button onClick={() => onReport(p)} style={{ background: B.green, color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                Log report
              </button>
            ) : null}
            <Badge status={p.status} />
          </div>
        ))}
      </Card>
    </div>
  );
}
