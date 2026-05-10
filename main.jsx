import { useState } from "react";

// ─── YCDI OFFICIAL BRAND SYSTEM ─────────────────────────────────────────────
// Colours from brand guide
const B = {
  blue: "#09ADEA",       // Primary — brand identity, navigation, headlines
  blueDark: "#0789BB",   // Darker shade for hover/active states
  blueLight: "#E6F7FD",  // Light tint for backgrounds
  red: "#D70A29",        // Secondary — CTAs only
  redLight: "#FDEAED",
  yellow: "#FCDE02",     // Tertiary — highlights, alerts
  yellowLight: "#FFFDE6",
  black: "#000001",      // Body text
  offWhite: "#F2F2F2",   // Backgrounds, dividers
  white: "#FFFFFF",
  muted: "#5a5a5a",      // Supporting text
  border: "#DCDCDC",
  success: "#1a7a3a",
  successLight: "#e6f4ec",
  warning: "#B45309",
  warningLight: "#FEF3C7",
};

// Typography: Montserrat (headings) + Open Sans (body)
// Loaded via Google Fonts in the style block

const LOGO_B64 = "iVBORw0KGgoAAAANSUhEUgAAAMgAAADUCAYAAADZTGx+AABNG0lEqVR4Xu1dB3gVVfJ/KTPz7r2UJIQQIJTQpYOCgIiKoooiKqKiuOquu/7Xdd11191FXVHkJCQHgYTQJSQkJCQhCS0JJaGE9F5IyfudmfvezNvZ2bwk5PN9PpnMzNszd+65p8s5REVR8AiC0JBBQR5CkLcqJFF/oYLn4w0C8NeqUPGzR6LBdjhFZ4X2JJkIf60KFT97qARRocIDVIKoUOEBKkFUqPAAFoOoBFGhwi1UC6JChQeoBFGhwgNUgqhQ4QEqQVSo8ACVICpUeIBKEBUqPCChAwRBcqgEUfGLxGCjeDi1PYLorZCuUQmiog8iwmKJitYIw1AiNMJQb0iM7P9Yk3AErQNPCl7StVaIMJJrUNzk2WVx5sk/twoVHUK0Uf97sk6ANC26OeZuSKurxESAJBS9kgy8YPo0LeZh6WY5LCAvQ6oWVytaIMGgWicVXcRgg/j3FKKUzA0SvCJMQS00z1Q3hHAvqNySK6bMs2uC9zfSv/xzq1DRISBBaGurUNgLX5L1xDLqcP27ShAVXYRKEBUqPEAliAoVHhCrF15CZUrXos+uVLKuCAbaKPh/R4iXrDcDixeU57ojqTS2QoKoWwqp6CKQIElEQROJoKJ6QzA/7L1i3buex0AkkfbKogG+mzy7IokG7MVibcKfW4WKDmGw3voSdoemaiyQjF2s3hANabk1rDcr3SAqyMBLsl4EHCzE1j4d/+fz66KkkDKkkLIkqL1YKroKPz8/n2CNLShIIwZ7W4JttqBYg3iEJ4RSzLSLN8p5DZ9Pd0R6Nv65VajoE1C3/VGhwgNUgqhQ4QEqQVSo8AAjYHcSqhJaBQAAAABJRU5ErkJggg==";

// Real logo base64 from brand doc
const LOGO_FULL = "iVBORw0KGgoAAAANSUhEUgAAAMgAAADUCAYAAADZTGx+AABNG0lEQVR4Xu1dB3gVVfJ/KTPz7r2UJIQQIJTQpYOCgIiKoooiKqKiuOquu/7Xdd11991FXVHkJCQHgYTQJSQkJCQhCS0JJaGE9F5IyfudmfvezNvZ2bwk5PN9PpnMzNszd+65p8s5REVR8AiC0JBBQR5CkLcqJFF/oYLn4w0C8NeqUPGzR6LBdjhFZ4X2JJkIf60KFT97qARRocIDVIKoUOEBKkFUqPAAFoOoBFGhwi1UC6JChQeoBFGhwgNUgqhQ4QEqQVSo8ACVICpUeIBKEBUqPCChAwRBcqgEUfGLxGCjeDi1PYLorZCuUQmiog8iwmKJitYIw1AiNMJQb0iM7P9Yk3AErQNPCl7StVaIMJJrUNzk2WVx5sk/twoVHUK0Uf97sk6ANC26OeZuSKurxESAJBS9kgy8YPo0LeZh6WY5LCAvQ6oWVytaIMGgWicVXcRgg/j3FKKUzA0SvCJMQS00z1Q3hHAvqNySK6bMs2uC9zfSv/xzq1DRISBBaGurUNgLX5L1xDLqcP27ShAVXYRKEBUqPEAliAoVHhCrF15CZUrXos+uVLKuCAbaKPh/R4iXrDcDixeU57ojqTS2QoKoWwqp6CKQIElEQROJoKJ6QzA/7L1i3buex0AkkfbKogG+mzy7IokG7MVibcKfW4WKDmGw3voSdoemaiyQjF2s3hANabk1rDcr3SAqyMBLsl4EHCzE1j4d/+fz66KkkDKkkLIkqL1YKroKPz8/n2CNLShIIwZ7W4JttqBYg3iEJ4RSzLSLN8p5DZ9Pd0R6Nv65VajoE1C3/VGhwgNUgqhQ4QEqQVSo8AAjYHcSqhJaBQAAAABJRU5ErkJggg==";

const CHAPTERS = ["Benin", "Auchi", "Ondo", "Agbor", "Osun", "Lagos"];
const PROGRAM_TYPES = ["School Visit", "Retreat", "Fellowship", "Mentoring", "Counselling", "Conference", "Online Campaign"];

const USERS = [
  { id: "nc", name: "National Coordinator", role: "NC", chapter: null, initials: "NC" },
  { id: "rc-benin", name: "Chidi Okafor", role: "RC", chapter: "Benin", initials: "CO" },
  { id: "rc-auchi", name: "Blessing Osagie", role: "RC", chapter: "Auchi", initials: "BO" },
  { id: "rc-ondo", name: "Tunde Adeyemi", role: "RC", chapter: "Ondo", initials: "TA" },
  { id: "rc-agbor", name: "Kenneth Onyeka", role: "RC", chapter: "Agbor", initials: "KO" },
  { id: "rc-osun", name: "Funmi Adebayo", role: "RC", chapter: "Osun", initials: "FA" },
  { id: "rc-lagos", name: "Ngozi Ikenna", role: "RC", chapter: "Lagos", initials: "NI" },
];

const SEED = [
  { id: 1, title: "Secondary school outreach — Benin Central", chapter: "Benin", type: "School Visit", date: "2026-05-14", students: 120, status: "Approved", facilitators: "Chidi Okafor, Amaka Eze", budget: 45000, spent: 0, safeguardingLead: "Chidi Okafor", school: "Government College Benin", objectives: "Discipleship and leadership introduction for SS2 students.", submitted: "2026-05-01", submittedBy: "rc-benin", ncComment: "" },
  { id: 2, title: "Leadership retreat — Ondo", chapter: "Ondo", type: "Retreat", date: "2026-05-17", students: 45, status: "Live", facilitators: "Tunde Adeyemi", budget: 120000, spent: 87000, safeguardingLead: "Tunde Adeyemi", school: "YCDI Ondo Camp", objectives: "Deep discipleship and leadership formation for selected student leaders.", submitted: "2026-05-03", submittedBy: "rc-ondo", ncComment: "" },
  { id: 3, title: "Campus fellowship series — Lagos", chapter: "Lagos", type: "Fellowship", date: "2026-05-20", students: 200, status: "Pending", facilitators: "Ngozi Ikenna", budget: 80000, spent: 0, safeguardingLead: "Ngozi Ikenna", school: "UNILAG campus", objectives: "Weekly fellowship series for university students.", submitted: "2026-05-08", submittedBy: "rc-lagos", ncComment: "" },
  { id: 4, title: "Career mentoring day — Auchi", chapter: "Auchi", type: "Mentoring", date: "2026-05-24", students: 80, status: "Pending", facilitators: "Blessing Osagie", budget: 35000, spent: 0, safeguardingLead: "Blessing Osagie", school: "Auchi Polytechnic", objectives: "Career guidance and vocational counselling for final-year students.", submitted: "2026-05-05", submittedBy: "rc-auchi", ncComment: "" },
  { id: 5, title: "Post-WAEC counselling — Osun", chapter: "Osun", type: "Counselling", date: "2026-05-28", students: 95, status: "Approved", facilitators: "Funmi Adebayo", budget: 28000, spent: 0, safeguardingLead: "Funmi Adebayo", school: "Sacred Heart Secondary Osogbo", objectives: "Pastoral and academic counselling for post-WAEC students.", submitted: "2026-04-28", submittedBy: "rc-osun", ncComment: "" },
  { id: 6, title: "School discipleship visit — Agbor", chapter: "Agbor", type: "School Visit", date: "2026-05-10", students: 60, status: "Complete", facilitators: "Kenneth Onyeka", budget: 22000, spent: 19500, safeguardingLead: "Kenneth Onyeka", school: "Anglican Grammar School Agbor", objectives: "Introductory discipleship session with SS3 students.", submitted: "2026-04-20", submittedBy: "rc-agbor", ncComment: "", report: { attendance: 58, testimonials: 3, incidents: 0, prayerMeet: true, outcome: "Excellent engagement. 12 students committed to join YCDI fellowship. Follow-up visit scheduled." } },
];

// ─── STATUS CONFIG ───────────────────────────────────────────────────────────
const STATUS = {
  Pending:  { bg: B.yellowLight, text: "#7a5c00", dot: B.yellow },
  Approved: { bg: B.blueLight,   text: "#065f87", dot: B.blue },
  Live:     { bg: "#E8F5E9",     text: "#1a6b2f", dot: "#2ecc71" },
  Complete: { bg: B.offWhite,    text: B.muted,   dot: "#aaa" },
  Returned: { bg: B.redLight,    text: "#8b0a1c", dot: B.red },
};

// ─── SHARED STYLES ───────────────────────────────────────────────────────────
const fonts = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Open+Sans:wght@400;600&display=swap');
`;

const inp = {
  width: "100%", padding: "9px 12px", borderRadius: 6,
  border: `1px solid ${B.border}`, fontSize: 13,
  color: B.black, background: B.white, boxSizing: "border-box",
  fontFamily: "'Open Sans', Arial, sans-serif",
};
const textarea = { ...inp, resize: "vertical", minHeight: 80 };
const selectEl = { ...inp, appearance: "none" };

const btnPrimary = {
  background: B.blue, color: B.white, border: "none",
  borderRadius: 6, padding: "9px 20px", fontSize: 13,
  fontWeight: 700, cursor: "pointer",
  fontFamily: "'Montserrat', Arial, sans-serif", letterSpacing: "0.03em",
};
const btnCTA = {
  background: B.red, color: B.white, border: "none",
  borderRadius: 6, padding: "9px 20px", fontSize: 13,
  fontWeight: 700, cursor: "pointer",
  fontFamily: "'Montserrat', Arial, sans-serif",
};
const btnOutline = {
  background: "none", border: `1.5px solid ${B.blue}`,
  borderRadius: 6, padding: "8px 18px", fontSize: 13,
  color: B.blue, cursor: "pointer",
  fontFamily: "'Open Sans', Arial, sans-serif",
};
const btnGhost = {
  background: "none", border: `1px solid ${B.border}`,
  borderRadius: 6, padding: "8px 16px", fontSize: 12,
  color: B.muted, cursor: "pointer",
  fontFamily: "'Open Sans', Arial, sans-serif",
};

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
function Badge({ status }) {
  const s = STATUS[status] || STATUS.Pending;
  return (
    <span style={{ background: s.bg, color: s.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0, display: "inline-block" }} />
      {status}
    </span>
  );
}

function Avatar({ name, size = 34 }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 47 + name.charCodeAt(1) * 23) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue},55%,40%)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, fontFamily: "'Montserrat', sans-serif" }}>
      {initials}
    </div>
  );
}

function StatCard({ label, value, accent, sub }) {
  return (
    <div style={{ background: B.white, border: `1px solid ${B.border}`, borderRadius: 8, padding: "14px 16px", flex: 1, borderTop: `3px solid ${accent || B.blue}` }}>
      <div style={{ fontSize: 11, color: B.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Open Sans', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || B.blue, fontFamily: "'Montserrat', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: B.muted, marginTop: 3, fontFamily: "'Open Sans', sans-serif" }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ value, max }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div style={{ flex: 1, height: 6, background: B.offWhite, borderRadius: 3 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: B.blue, borderRadius: 3 }} />
    </div>
  );
}

function SectionHead({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: "'Montserrat', sans-serif", borderBottom: `1px solid ${B.offWhite}`, paddingBottom: 6 }}>
      {children}
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat', sans-serif" }}>
        {label}{required && <span style={{ color: B.red, marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: B.white, border: `1px solid ${B.border}`, borderRadius: 10, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );
}

function Toast({ msg, type }) {
  const bg = type === "success" ? B.blue : type === "warning" ? "#d97706" : B.red;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, background: bg, color: B.white, padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, fontFamily: "'Open Sans', sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", maxWidth: 360 }}>
      {msg}
    </div>
  );
}

// ─── LOGO SVG (drawn from brand guide colours) ───────────────────────────────
function YCDILogo({ height = 36, dark = false }) {
  return (
    <svg height={height} viewBox="0 0 220 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <circle cx="28" cy="30" r="26" fill={dark ? B.white : B.blue} />
      <text x="28" y="36" textAnchor="middle" fontSize="20" fontWeight="700" fontFamily="Montserrat, Arial, sans-serif" fill={dark ? B.blue : B.white}>Y</text>
      <text x="68" y="24" fontSize="16" fontWeight="700" fontFamily="Montserrat, Arial, sans-serif" fill={dark ? B.white : B.blue}>YCDI</text>
      <text x="68" y="42" fontSize="10" fontFamily="Open Sans, Arial, sans-serif" fill={dark ? "rgba(255,255,255,0.7)" : B.muted}>Young Christian Development Initiative</text>
    </svg>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [selected, setSelected] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: B.blue, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Open Sans', Arial, sans-serif" }}>
      <style>{fonts}</style>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <YCDILogo height={52} dark />
          <div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.65)", fontFamily: "'Open Sans', sans-serif" }}>Program Management Hub</div>
        </div>

        <div style={{ background: B.white, borderRadius: 14, padding: "28px 28px 24px", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
          <div style={{ fontSize: 13, color: B.muted, marginBottom: 16, fontFamily: "'Open Sans', sans-serif" }}>Select your account to sign in</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {USERS.map(u => (
              <div key={u.id} onClick={() => setSelected(u.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8, border: `2px solid ${selected === u.id ? B.blue : B.border}`, cursor: "pointer", background: selected === u.id ? B.blueLight : B.white, transition: "border-color 0.15s" }}>
                <Avatar name={u.name} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat', sans-serif" }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: B.muted, marginTop: 1 }}>
                    {u.role === "NC" ? "National Coordinator — all chapters" : `Regional Coordinator — ${u.chapter} chapter`}
                  </div>
                </div>
                {selected === u.id && <span style={{ color: B.blue, fontSize: 18, fontWeight: 700 }}>✓</span>}
              </div>
            ))}
          </div>

          <button onClick={() => selected && onLogin(USERS.find(u => u.id === selected))} disabled={!selected}
            style={{ ...btnPrimary, width: "100%", textAlign: "center", opacity: selected ? 1 : 0.4, fontSize: 14, padding: 12 }}>
            Sign In →
          </button>

          <div style={{ marginTop: 14, padding: "10px 14px", background: B.yellowLight, borderRadius: 6, fontSize: 11, color: "#7a5c00", fontFamily: "'Open Sans', sans-serif" }}>
            <strong>Demo prototype</strong> — passwords are not required in this version.
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          © 2025 YCDI Nigeria · ycdinigeria@gmail.com · www.ycdi.org.ng
        </div>
      </div>
    </div>
  );
}

// ─── PROGRAM DETAIL ──────────────────────────────────────────────────────────
function ProgramDetail({ program, onBack, onApprove, onReturn, onComplete, user }) {
  const [showReturn, setShowReturn] = useState(false);
  const [ncComment, setNcComment] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState({});
  const [saved, setSaved] = useState(!!program.report);

  const tests = [
    { label: "Mission test", desc: "Does this program directly raise godly, equipped young leaders?", pass: (program.objectives || "").length > 20 },
    { label: "Quality test", desc: "Is the program delivered with professionalism and excellence?", pass: !!(program.facilitators) },
    { label: "Safety test", desc: "Does this program protect the welfare of every young person?", pass: !!program.safeguardingLead },
  ];

  const canApprove = user.role === "NC" && program.status === "Pending";
  const canReport = program.status === "Live" && !saved && (user.role === "NC" || user.chapter === program.chapter);

  const handleReturn = () => {
    if (!ncComment.trim()) return;
    onReturn(program.id, ncComment);
    setShowReturn(false);
  };

  return (
    <div style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <button onClick={onBack} style={{ ...btnGhost, marginBottom: 18 }}>← Back to programs</button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: B.black, fontFamily: "'Montserrat', sans-serif" }}>{program.title}</h2>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 5 }}>{program.chapter} Chapter · {program.type} · {program.date}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApprove && <>
            <button onClick={() => onApprove(program.id)} style={btnPrimary}>Approve Program</button>
            <button onClick={() => setShowReturn(true)} style={{ ...btnCTA }}>Return with Comment</button>
          </>}
          {canReport && <button onClick={() => setShowReport(true)} style={btnPrimary}>Log Post-Program Report</button>}
          {saved && <span style={{ color: B.success, fontSize: 13, fontWeight: 600 }}>✓ Report submitted</span>}
          <Badge status={program.status} />
        </div>
      </div>

      {/* NC Comment shown to RC on Returned programs */}
      {program.status === "Returned" && program.ncComment && (
        <div style={{ background: B.redLight, border: `1.5px solid ${B.red}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.red, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'Montserrat', sans-serif" }}>
            Returned by National Coordinator
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#5a0a13", lineHeight: 1.6, fontStyle: "italic" }}>
            "{program.ncComment}"
          </p>
          <div style={{ marginTop: 10, fontSize: 12, color: B.red }}>Please revise your concept note and resubmit.</div>
        </div>
      )}

      {program.status === "Returned" && !program.ncComment && (
        <div style={{ background: B.redLight, border: `1px solid ${B.red}40`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#8b0a1c" }}>
          This program was returned for revision. Please update and resubmit.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <SectionHead>Program details</SectionHead>
          {[
            ["School / venue", program.school],
            ["Target students", program.students],
            ["Budget", `₦${(program.budget || 0).toLocaleString()}`],
            program.spent > 0 && ["Spent so far", `₦${program.spent.toLocaleString()}`],
            ["Submitted", program.submitted],
            ["Safeguarding lead", program.safeguardingLead],
            ["Facilitators", program.facilitators],
          ].filter(Boolean).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${B.offWhite}` }}>
              <span style={{ color: B.muted }}>{k}</span>
              <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "58%", wordBreak: "break-word" }}>{v}</span>
            </div>
          ))}
        </Card>

        <Card>
          <SectionHead>YCDI program tests</SectionHead>
          {tests.map(t => (
            <div key={t.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${B.offWhite}` }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: t.pass ? B.blueLight : B.redLight, color: t.pass ? B.blue : B.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, fontWeight: 700 }}>{t.pass ? "✓" : "!"}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.pass ? B.black : B.red, fontFamily: "'Montserrat', sans-serif" }}>{t.label}</div>
                <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{t.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Objectives</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: B.black }}>{program.objectives}</p>
          </div>
        </Card>
      </div>

      {program.report && (
        <Card style={{ background: B.blueLight, borderColor: B.blue + "40" }}>
          <SectionHead>Post-program report</SectionHead>
          {[
            ["Actual attendance", program.report.attendance],
            ["Testimonials captured", program.report.testimonials],
            ["Safeguarding incidents", program.report.incidents === 0 ? "None" : program.report.incidents],
            ["Pre-program prayer meeting", program.report.prayerMeet ? "Yes ✓" : "No"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${B.blue}20` }}>
              <span style={{ color: B.muted }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          {program.report.outcome && <p style={{ margin: "10px 0 0", fontSize: 12, fontStyle: "italic", color: B.black, lineHeight: 1.6 }}>"{program.report.outcome}"</p>}
        </Card>
      )}

      {/* RETURN WITH COMMENT MODAL */}
      {showReturn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: 500, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${B.border}` }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Montserrat', sans-serif", color: B.red }}>Return program for revision</span>
              <button onClick={() => setShowReturn(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: B.muted }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ background: B.redLight, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#8b0a1c", lineHeight: 1.6 }}>
                This comment will be sent to the chapter coordinator with the returned concept note. Be specific about what needs to be corrected.
              </div>
              <Field label="NC Comment — reason for return" required>
                <textarea
                  style={{ ...textarea, minHeight: 120, borderColor: B.red }}
                  placeholder="e.g. Please provide a more detailed safeguarding plan. The budget breakdown is also missing key line items — please itemise all costs before resubmitting."
                  value={ncComment}
                  onChange={e => setNcComment(e.target.value)}
                />
              </Field>
              {!ncComment.trim() && (
                <div style={{ fontSize: 12, color: B.red, marginBottom: 10 }}>A comment is required before returning the program.</div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button style={btnGhost} onClick={() => setShowReturn(false)}>Cancel</button>
                <button style={{ ...btnCTA, opacity: ncComment.trim() ? 1 : 0.4 }} onClick={handleReturn}>Return to Coordinator</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POST-PROGRAM REPORT MODAL */}
      {showReport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: 500, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${B.border}` }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Montserrat', sans-serif" }}>Post-program report</span>
              <button onClick={() => setShowReport(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: B.muted }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <Field label="Actual attendance" required><input type="number" style={inp} placeholder="e.g. 58" onChange={e => setReport(r => ({ ...r, attendance: +e.target.value }))} /></Field>
              <Field label="Testimonials captured"><input type="number" style={inp} placeholder="0" onChange={e => setReport(r => ({ ...r, testimonials: +e.target.value }))} /></Field>
              <Field label="Safeguarding incidents (enter 0 if none)" required><input type="number" style={inp} placeholder="0" onChange={e => setReport(r => ({ ...r, incidents: +e.target.value }))} /></Field>
              <Field label="Pre-program prayer meeting held?" required>
                <select style={selectEl} onChange={e => setReport(r => ({ ...r, prayerMeet: e.target.value === "yes" }))}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <Field label="Outcome summary"><textarea style={textarea} placeholder="Key outcomes, observations, follow-up actions..." onChange={e => setReport(r => ({ ...r, outcome: e.target.value }))} /></Field>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button style={btnGhost} onClick={() => setShowReport(false)}>Cancel</button>
                <button style={btnPrimary} onClick={() => { onComplete(program.id, report); setSaved(true); setShowReport(false); }}>Submit Report</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NEW PROGRAM FORM ─────────────────────────────────────────────────────────
function NewProgramForm({ user, onSubmit, onCancel }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({
    title: "", chapter: user.chapter || CHAPTERS[0], type: "School Visit",
    date: "", students: "", school: "", objectives: "", budget: "",
    safeguardingLead: user.name, facilitators: user.name,
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const canSubmit = f.title && f.date && f.students && f.school && f.objectives && f.budget && f.safeguardingLead;

  const tests = [
    { label: "Mission test", pass: f.objectives.length > 20 },
    { label: "Quality test", pass: !!f.facilitators },
    { label: "Safety test", pass: !!f.safeguardingLead },
  ];

  const StepDot = ({ n }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: step >= n ? B.blue : B.offWhite, color: step >= n ? B.white : B.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "'Montserrat', sans-serif", border: step === n ? `2px solid ${B.blueDark}` : "none" }}>{n}</div>
      <span style={{ fontSize: 12, color: step === n ? B.black : B.muted, fontWeight: step === n ? 700 : 400, fontFamily: step === n ? "'Montserrat'" : "'Open Sans'" }}>
        {["Program details", "People & safeguarding", "Review & submit"][n - 1]}
      </span>
      {n < 3 && <div style={{ width: 18, height: 1, background: B.border, margin: "0 2px" }} />}
    </div>
  );

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
        <StepDot n={1} /><StepDot n={2} /><StepDot n={3} />
      </div>

      {step === 1 && <>
        <Field label="Program title" required><input style={inp} value={f.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Secondary school outreach — Benin Central" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Chapter">
            {user.role === "NC"
              ? <select style={selectEl} value={f.chapter} onChange={e => set("chapter", e.target.value)}>{CHAPTERS.map(c => <option key={c}>{c}</option>)}</select>
              : <input style={{ ...inp, background: B.offWhite, color: B.muted }} value={f.chapter} readOnly />}
          </Field>
          <Field label="Program type" required>
            <select style={selectEl} value={f.type} onChange={e => set("type", e.target.value)}>{PROGRAM_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Program date" required><input type="date" style={inp} value={f.date} onChange={e => set("date", e.target.value)} /></Field>
          <Field label="Estimated students" required><input type="number" style={inp} value={f.students} onChange={e => set("students", e.target.value)} placeholder="e.g. 80" /></Field>
        </div>
        <Field label="School / venue" required><input style={inp} value={f.school} onChange={e => set("school", e.target.value)} placeholder="e.g. Auchi Polytechnic" /></Field>
        <Field label="Estimated budget (₦)" required><input type="number" style={inp} value={f.budget} onChange={e => set("budget", e.target.value)} placeholder="e.g. 35000" /></Field>
        <Field label="Program objectives" required><textarea style={textarea} value={f.objectives} onChange={e => set("objectives", e.target.value)} placeholder="What change is intended in the lives of the beneficiaries?" /></Field>
      </>}

      {step === 2 && <>
        <div style={{ background: B.redLight, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#8b0a1c", lineHeight: 1.6 }}>
          <strong>Safeguarding is mandatory.</strong> A designated safeguarding lead must be assigned for every YCDI program involving young people.
        </div>
        <Field label="Safeguarding lead" required>
          <input style={inp} value={f.safeguardingLead} onChange={e => set("safeguardingLead", e.target.value)} placeholder="Full name of designated safeguarding lead" />
        </Field>
        <Field label="Facilitators (comma-separated)">
          <input style={inp} value={f.facilitators} onChange={e => set("facilitators", e.target.value)} placeholder="e.g. Chidi Okafor, Amaka Eze" />
        </Field>
        <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
          School permission letters and parental consents must be obtained before the program date. Attach copies to the program file after submission.
        </div>
      </>}

      {step === 3 && <>
        <div style={{ background: B.offWhite, borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, fontFamily: "'Montserrat', sans-serif" }}>{f.title || "Untitled program"}</div>
          {[["Chapter", f.chapter], ["Type", f.type], ["Date", f.date], ["Students", f.students], ["Venue", f.school], ["Budget", f.budget ? `₦${parseInt(f.budget).toLocaleString()}` : "—"], ["Safeguarding lead", f.safeguardingLead || "Not set"], ["Facilitators", f.facilitators || "None"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${B.border}` }}>
              <span style={{ color: B.muted }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <SectionHead>Program tests</SectionHead>
          {tests.map(t => (
            <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12 }}>
              <span style={{ color: t.pass ? B.blue : B.red, fontWeight: 700 }}>{t.pass ? "✓" : "✗"}</span>
              <span style={{ color: t.pass ? B.black : B.red }}>{t.label}</span>
            </div>
          ))}
        </div>
        {!canSubmit && <div style={{ background: B.yellowLight, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7a5c00", marginBottom: 12 }}>Please complete all required fields before submitting.</div>}
        <div style={{ background: B.blueLight, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#065f87", lineHeight: 1.6 }}>
          Submitting sends this concept note to the National Coordinator for review. You will be notified of their decision within <strong>7 working days</strong>.
        </div>
      </>}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 24 }}>
        <button style={btnGhost} onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}>{step === 1 ? "Cancel" : "← Back"}</button>
        <button style={{ ...btnPrimary, opacity: step === 3 && !canSubmit ? 0.4 : 1 }}
          onClick={() => step < 3 ? setStep(s => s + 1) : canSubmit && onSubmit(f, user)}>
          {step === 3 ? "Submit for NC Approval" : "Next →"}
        </button>
      </div>
    </Card>
  );
}

// ─── NC DASHBOARD ─────────────────────────────────────────────────────────────
function NCDashboard({ programs, onView }) {
  const pending = programs.filter(p => p.status === "Pending");
  const byChapter = CHAPTERS.map(c => ({ c, n: programs.filter(p => p.chapter === c).reduce((s, p) => s + p.students, 0) }));
  const maxN = Math.max(...byChapter.map(b => b.n), 1);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total programs" value={programs.length} />
        <StatCard label="Students planned" value={programs.reduce((s, p) => s + p.students, 0).toLocaleString()} />
        <StatCard label="Awaiting approval" value={pending.length} accent={pending.length > 0 ? B.yellow : B.blue} />
        <StatCard label="Live now" value={programs.filter(p => p.status === "Live").length} accent="#2ecc71" />
      </div>

      {pending.length > 0 && (
        <Card style={{ background: B.yellowLight, borderColor: B.yellow, marginBottom: 14 }}>
          <SectionHead>Action required — pending NC approval</SectionHead>
          {pending.map((p, i) => (
            <div key={p.id} onClick={() => onView(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < pending.length - 1 ? `1px solid ${B.yellow}50` : "none", cursor: "pointer" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: 11, color: B.muted }}>{p.chapter} chapter · Submitted {p.submitted}</div>
              </div>
              <span style={{ fontSize: 12, color: B.warning, fontWeight: 600 }}>Review →</span>
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
        <Card>
          <SectionHead>All programs this month</SectionHead>
          {programs.map((p, i) => (
            <div key={p.id} onClick={() => onView(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: i < programs.length - 1 ? `1px solid ${B.offWhite}` : "none", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = B.offWhite}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ width: 4, height: 40, borderRadius: 2, background: STATUS[p.status]?.dot || B.border, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: B.black }}>{p.title}</div>
                <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{p.chapter} · {p.date} · {p.students} students</div>
              </div>
              <Badge status={p.status} />
            </div>
          ))}
        </Card>
        <Card>
          <SectionHead>Students by chapter</SectionHead>
          {byChapter.sort((a, b) => b.n - a.n).map(({ c, n }) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12 }}>
              <span style={{ width: 44, color: B.muted, fontFamily: "'Open Sans', sans-serif" }}>{c}</span>
              <MiniBar value={n} max={maxN} />
              <span style={{ width: 30, textAlign: "right", fontWeight: 700, color: B.blue }}>{n}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── COORDINATOR DASHBOARD ────────────────────────────────────────────────────
function CoordDashboard({ programs, user, onView, onNew }) {
  const mine = programs.filter(p => p.chapter === user.chapter);
  const pending = mine.filter(p => p.status === "Pending").length;
  const returned = mine.filter(p => p.status === "Returned");

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="My programs" value={mine.length} />
        <StatCard label="Students this month" value={mine.reduce((s, p) => s + p.students, 0)} />
        <StatCard label="Awaiting NC approval" value={pending} accent={pending > 0 ? B.warning : B.blue} />
      </div>

      {returned.length > 0 && (
        <Card style={{ background: B.redLight, borderColor: B.red, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.red, fontFamily: "'Montserrat', sans-serif", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Programs returned — action needed</div>
          {returned.map(p => (
            <div key={p.id} onClick={() => onView(p)} style={{ cursor: "pointer", padding: "6px 0", borderBottom: `1px solid ${B.red}20` }}>
              <div style={{ fontSize: 13, color: B.red, fontWeight: 600, textDecoration: "underline" }}>{p.title}</div>
              {p.ncComment && <div style={{ fontSize: 11, color: "#8b0a1c", marginTop: 3, fontStyle: "italic" }}>NC note: "{p.ncComment.slice(0, 80)}{p.ncComment.length > 80 ? "..." : ""}"</div>}
            </div>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <SectionHead>{user.chapter} chapter — my programs</SectionHead>
          <button onClick={onNew} style={{ ...btnCTA, padding: "7px 16px", fontSize: 12 }}>+ Submit Outreach</button>
        </div>
        {mine.length === 0 && (
          <div style={{ padding: "28px 0", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: B.muted, marginBottom: 16 }}>No programs submitted yet for this chapter.</div>
            <button onClick={onNew} style={btnPrimary}>Submit Your First Outreach →</button>
          </div>
        )}
        {mine.map((p, i) => (
          <div key={p.id} onClick={() => onView(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: i < mine.length - 1 ? `1px solid ${B.offWhite}` : "none", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = B.offWhite}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <div style={{ width: 4, height: 42, borderRadius: 2, background: STATUS[p.status]?.dot || B.border, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{p.title}</div>
              <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{p.type} · {p.date} · {p.students} students</div>
            </div>
            <Badge status={p.status} />
          </div>
        ))}
      </Card>

      <Card style={{ background: B.blueLight, borderColor: B.blue + "50" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: B.blue, fontFamily: "'Montserrat', sans-serif", marginBottom: 10 }}>How to submit an outreach for approval</div>
        {[
          "Click \"+ Submit Outreach\" above to open the concept note form",
          "Step 1: Fill in program details — title, date, school, student count, budget, and objectives",
          "Step 2: Assign a safeguarding lead and list facilitators (mandatory for all programs)",
          "Step 3: Review and submit — the National Coordinator is notified immediately",
          "Once approved, proceed with the program and return here to log your post-program report",
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, marginBottom: 7, color: B.black }}>
            <span style={{ color: B.blue, fontWeight: 700, flexShrink: 0, fontFamily: "'Montserrat', sans-serif" }}>{i + 1}.</span>
            <span>{s}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [programs, setPrograms] = useState(SEED);
  const [selected, setSelected] = useState(null);
  const [newMode, setNewMode] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  const approveProgram = (id) => {
    setPrograms(ps => ps.map(p => p.id === id ? { ...p, status: "Approved", ncComment: "" } : p));
    setSelected(s => s?.id === id ? { ...s, status: "Approved", ncComment: "" } : s);
    showToast("Program approved. The coordinator has been notified.");
  };

  const returnProgram = (id, comment) => {
    setPrograms(ps => ps.map(p => p.id === id ? { ...p, status: "Returned", ncComment: comment } : p));
    setSelected(s => s?.id === id ? { ...s, status: "Returned", ncComment: comment } : s);
    showToast("Program returned with your comment. Coordinator notified.", "warning");
  };

  const completeProgram = (id, report) => {
    setPrograms(ps => ps.map(p => p.id === id ? { ...p, status: "Complete", report } : p));
    setSelected(s => s?.id === id ? { ...s, status: "Complete", report } : s);
    showToast("Post-program report submitted successfully.");
  };

  const addProgram = (form, submitter) => {
    const np = { id: programs.length + 1, ...form, students: +form.students, budget: +form.budget, spent: 0, status: "Pending", submitted: new Date().toISOString().slice(0, 10), submittedBy: submitter.id, ncComment: "" };
    setPrograms(ps => [...ps, np]);
    setNewMode(false);
    showToast("Concept note submitted to the National Coordinator for approval.");
  };

  if (!user) return <LoginScreen onLogin={u => setUser(u)} />;

  const visiblePrograms = user.role === "NC" ? programs : programs.filter(p => p.chapter === user.chapter);
  const pageTitle = selected ? selected.title : newMode ? "New Program Concept Note" : user.role === "NC" ? "National Overview" : `${user.chapter} Chapter`;

  return (
    <div style={{ fontFamily: "'Open Sans', Arial, sans-serif", background: B.offWhite, minHeight: "100vh" }}>
      <style>{fonts}</style>

      {/* TOPBAR */}
      <div style={{ background: B.blue, display: "flex", alignItems: "center", padding: "0 20px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "12px 0", marginRight: 20, paddingRight: 20, borderRight: "1px solid rgba(255,255,255,0.2)" }}>
          <YCDILogo height={38} dark />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={user.name} size={30} />
          <div>
            <div style={{ fontSize: 12, color: B.white, fontWeight: 700, fontFamily: "'Montserrat', sans-serif", lineHeight: 1.2 }}>{user.name}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{user.role === "NC" ? "National Coordinator" : `${user.chapter} Regional Coordinator`}</div>
          </div>
          <button onClick={() => { setUser(null); setSelected(null); setNewMode(false); }}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Open Sans', sans-serif", marginLeft: 10 }}>
            Sign out
          </button>
        </div>
      </div>

      {/* YELLOW ACCENT BAR */}
      <div style={{ background: B.yellow, height: 4 }} />

      {/* PAGE CONTENT */}
      <div style={{ padding: "24px 24px", maxWidth: 980, margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: B.black, fontFamily: "'Montserrat', sans-serif" }}>{pageTitle}</h1>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>YCDI Program Hub · May 2026</div>
        </div>

        {!selected && !newMode && user.role === "NC" && <NCDashboard programs={visiblePrograms} onView={p => setSelected(p)} />}
        {!selected && !newMode && user.role === "RC" && <CoordDashboard programs={visiblePrograms} user={user} onView={p => setSelected(p)} onNew={() => setNewMode(true)} />}
        {selected && <ProgramDetail program={selected} onBack={() => setSelected(null)} onApprove={approveProgram} onReturn={returnProgram} onComplete={completeProgram} user={user} />}
        {newMode && <NewProgramForm user={user} onSubmit={addProgram} onCancel={() => setNewMode(false)} />}
      </div>

      {/* FOOTER */}
      <div style={{ background: B.black, color: "rgba(255,255,255,0.45)", padding: "14px 24px", textAlign: "center", fontSize: 11, marginTop: 40, fontFamily: "'Open Sans', sans-serif" }}>
        © 2025 Young Christian Development Initiative (YCDI) · #RaisingGodlyLeaders · ycdinigeria@gmail.com · www.ycdi.org.ng
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
