import { lazy, Suspense } from "react";
import { B } from "../theme.js";

// Six features, most of which any one person never opens. Loading them on
// demand keeps them out of the file that has to arrive before the login
// screen can be drawn.
//
// BATCH4-MARKER more-lazy
const DocumentsSection = lazy(() => import("./DocumentsSection.jsx"));
const CalendarNoticesSection = lazy(() => import("./CalendarNoticesSection.jsx"));
const AdminSection = lazy(() => import("./AdminSection.jsx"));
const MessagingSection = lazy(() => import("./MessagingSection.jsx"));
const ParticipantsSection = lazy(() => import("./ParticipantsSection.jsx"));
const SafeguardingSection = lazy(() => import("./SafeguardingSection.jsx"));
const SetPasswordScreen = lazy(() => import("../auth/SetPasswordScreen.jsx"));
// BATCH5-MARKER more-kpi
const KpiReportSection = lazy(() => import("./KpiReportSection.jsx"));

// Everything that lives behind the "More" tab. New features get added here
// instead of adding another button to the top navigation, which was already
// running out of room across five tabs.
//
// Each entry needs: id, title, blurb, icon path, and a render function.
// Set `soon: true` to show it as a card without making it clickable yet.

const ICONS = {
  docs: "M6 2h7l5 5v15H6zm7 1.5V8h4.5zM8 12h8v1.6H8zm0 3.4h8V17H8zm0-6.8h4v1.6H8z",
  chat: "M4 3h16a2 2 0 012 2v10a2 2 0 01-2 2H9l-5 4V5a2 2 0 010-2zm3 6h10v1.8H7zm0 3.4h7V14H7z",
  calendar: "M7 2v2h10V2h2v2h1a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h1V2zM4 9v11h16V9zm2.5 2.5h3v3h-3zm5.5 0h3v3h-3z",
  people: "M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0v1H4zm14.5-9a3 3 0 100-6 3 3 0 000 6zM19 13c2.5 0 4 1.8 4 4v1h-3.2v-1c0-1.6-.6-3-1.6-4z",
  shield: "M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6zm0 2.2L6 6.9v5.1c0 3.8 2.4 6.6 6 7.7 3.6-1.1 6-3.9 6-7.7V6.9zM11 7h2v6h-2zm0 8h2v2h-2z",
  admin: "M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6zm0 2.2L6 6.9v5.1c0 3.8 2.4 6.6 6 7.7 3.6-1.1 6-3.9 6-7.7V6.9zM11 15.5l-3-3 1.4-1.4L11 12.6l3.6-3.6L16 10.4z",
  key: "M12.65 10A6 6 0 105 16a6 6 0 007.65-4H17v4h2v-4h2v-2zM7 14a2 2 0 110-4 2 2 0 010 4z",
  chart: "M3 3h2v16h16v2H3zm5 9h2.5v6H8zm4.5-5H15v11h-2.5zm4.5 3h2.5v8H17z",
};

export const MORE_FEATURES = [
  {
    id: "calendar",
    title: "Calendar & Notices",
    blurb: "Announcements and dated events, general or for one chapter.",
    icon: ICONS.calendar,
    accent: B.red,
    render: (props) => <CalendarNoticesSection {...props} />,
  },
  {
    id: "documents",
    title: "Documents & Resources",
    blurb: "Guides, templates, policies and study material, sorted into categories.",
    icon: ICONS.docs,
    accent: B.blue,
    render: (props) => <DocumentsSection {...props} />,
  },
  {
    id: "messaging",
    title: "Messaging",
    blurb: "Direct messages and chapter channels, so conversations stop living on WhatsApp.",
    icon: ICONS.chat,
    accent: B.purple,
    render: (props) => <MessagingSection {...props} />,
  },
  {
    id: "participants",
    title: "Participants & Discipleship",
    blurb: "Young people, where they are on the five stages, consent on file, and who is walking with them.",
    icon: ICONS.people,
    accent: B.green,
    // Team Members are deliberately excluded. YCDI's Data Protection
    // Policy says volunteers should not hold beneficiary data beyond
    // what their own role requires, and this is not their role. The
    // database refuses them too; this just stops them seeing a door
    // they cannot open.
    roles: ["NC", "RC"],
    render: (props) => <ParticipantsSection {...props} />,
  },
  {
    id: "safeguarding",
    title: "Safeguarding",
    blurb: "Report a concern, follow the register, and see who is cleared to work with children.",
    icon: ICONS.shield,
    accent: B.red,
    // Access here follows YCDI-SAF-004, not the app's usual admin rule.
    // Only the Designated Safeguarding Officers and the Board
    // Safeguarding Chair. The database enforces it as well.
    roles: ["NC", "RC"],
    render: (props) => <SafeguardingSection {...props} />,
  },
  {
    id: "admin",
    title: "Manage Admins",
    blurb: "Decide who can approve sign-ups, manage content and edit the directory nationally.",
    icon: ICONS.admin,
    accent: B.black,
    adminOnly: true,
    render: (props) => <AdminSection {...props} />,
  },
  {
    id: "kpi",
    title: "Board & Funder KPIs",
    blurb: "The quarterly Board table, filled in from real figures, with the gaps declared rather than guessed.",
    icon: ICONS.chart,
    accent: B.gold,
    // Coordinators can see it because a chapter that cannot see the target
    // has no way of knowing it is behind. Row security still decides whose
    // beneficiary figures each person is shown.
    roles: ["NC", "RC"],
    render: (props) => <KpiReportSection {...props} />,
  },
  {
    id: "password",
    title: "Change Password",
    blurb: "Choose a new password for your own account. Everyone can do this.",
    icon: ICONS.key,
    accent: B.blue,
    render: (props) => <SetPasswordScreen showToast={props.showToast} />,
  },
];

export function moreFeatureTitle(id) {
  const f = MORE_FEATURES.find((x) => x.id === id);
  return f ? f.title : "More";
}

function FeatureCard({ f, onOpen }) {
  const disabled = !!f.soon;
  return (
    <button
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      style={{
        textAlign: "left",
        background: B.white,
        border: `1px solid ${B.border}`,
        borderTop: `3px solid ${disabled ? B.border : f.accent}`,
        borderRadius: 12,
        padding: "16px 18px",
        cursor: disabled ? "default" : "pointer",
        fontFamily: "'Open Sans',sans-serif",
        opacity: disabled ? 0.72 : 1,
        display: "flex",
        gap: 13,
        alignItems: "flex-start",
        width: "100%",
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: disabled ? B.offWhite : f.accent + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill={disabled ? B.muted : f.accent}><path d={f.icon} /></svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14.5, color: B.black }}>{f.title}</span>
          {disabled ? (
            <span style={{ background: B.offWhite, color: B.muted, padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>Coming soon</span>
          ) : null}
        </div>
        <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "#4B5563", lineHeight: 1.55 }}>{f.blurb}</p>
      </div>
    </button>
  );
}

export default function MoreSection({ profile, chapters, showToast, view, setView }) {
  // Admin-only cards are absent entirely for everyone else, the same
  // pattern used for the Governance and Legal document category.
  const visibleFeatures = MORE_FEATURES.filter((f) => {
    if (f.adminOnly && !profile.is_admin) return false;
    if (f.roles) {
      const allowed = f.roles.includes(profile.role)
        || (f.id === "safeguarding" ? profile.is_safeguarding_lead : profile.is_admin);
      if (!allowed) return false;
    }
    return true;
  });
  const active = visibleFeatures.find((f) => f.id === view && !f.soon);

  if (active) {
    return (
      <div>
        <button
          onClick={() => setView(null)}
          style={{ background: "none", border: "none", color: B.blue, fontSize: 12.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", cursor: "pointer", padding: "0 0 14px", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          ‹ Back to More
        </button>
        <Suspense fallback={<div style={{ padding: "40px 20px", textAlign: "center", color: B.muted, fontSize: 13 }}>Loading…</div>}>
          {active.render({ profile, chapters, showToast })}
        </Suspense>
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: B.muted, lineHeight: 1.7 }}>
        The rest of the hub lives here. Pick one to open it.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
        {visibleFeatures.map((f) => (
          <FeatureCard key={f.id} f={f} onOpen={() => setView(f.id)} />
        ))}
      </div>
    </div>
  );
}
