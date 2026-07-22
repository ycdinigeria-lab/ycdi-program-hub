import { lazy, Suspense } from "react";
import { B } from "../theme.js";

// Everything that lives behind the "More" tab. Loading each one on demand
// keeps them out of the file that has to arrive before the login screen can
// be drawn.
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
// BATCH6A-MARKER more-profile
const MyProfileSection = lazy(() => import("./MyProfileSection.jsx"));
// BATCH6B-MARKER more-register-and-audit
const VolunteersSection = lazy(() => import("./VolunteersSection.jsx"));
const AuditLogSection = lazy(() => import("./AuditLogSection.jsx"));
// BATCH7A-MARKER more-applications
const ApplicationsSection = lazy(() => import("./ApplicationsSection.jsx"));
// BATCH7B-MARKER more-renewals
const RenewalsSection = lazy(() => import("./RenewalsSection.jsx"));

// Each entry needs: id, category, title, short, icon path, accent and a
// render function. Set `soon: true` to show it as a card without making it
// clickable yet.

const ICONS = {
  docs: "M6 2h7l5 5v15H6zm7 1.5V8h4.5zM8 12h8v1.6H8zm0 3.4h8V17H8zm0-6.8h4v1.6H8z",
  chat: "M4 3h16a2 2 0 012 2v10a2 2 0 01-2 2H9l-5 4V5a2 2 0 010-2zm3 6h10v1.8H7zm0 3.4h7V14H7z",
  calendar: "M7 2v2h10V2h2v2h1a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h1V2zM4 9v11h16V9zm2.5 2.5h3v3h-3zm5.5 0h3v3h-3z",
  people: "M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0v1H4zm14.5-9a3 3 0 100-6 3 3 0 000 6zM19 13c2.5 0 4 1.8 4 4v1h-3.2v-1c0-1.6-.6-3-1.6-4z",
  shield: "M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6zm0 2.2L6 6.9v5.1c0 3.8 2.4 6.6 6 7.7 3.6-1.1 6-3.9 6-7.7V6.9zM11 7h2v6h-2zm0 8h2v2h-2z",
  admin: "M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6zm0 2.2L6 6.9v5.1c0 3.8 2.4 6.6 6 7.7 3.6-1.1 6-3.9 6-7.7V6.9zM11 15.5l-3-3 1.4-1.4L11 12.6l3.6-3.6L16 10.4z",
  key: "M12.65 10A6 6 0 105 16a6 6 0 007.65-4H17v4h2v-4h2v-2zM7 14a2 2 0 110-4 2 2 0 010 4z",
  chart: "M3 3h2v16h16v2H3zm5 9h2.5v6H8zm4.5-5H15v11h-2.5zm4.5 3h2.5v8H17z",
  inbox: "M4 3h16v11h-5a3 3 0 01-6 0H4zm2 2v7h1.2a5 5 0 009.6 0H18V5zm2.5 9.5h7V16h-7z",
  hands: "M11 2h2v9h-2zm-4 3h2v6H7zm8 0h2v6h-2zM5 12h14v3a7 7 0 01-7 7 7 7 0 01-7-7z",
  ledger: "M5 2h11l3 3v17H5zm2 2v16h10V6.2L15.8 4zM8 8h8v1.7H8zm0 3.4h8v1.7H8zm0 3.4h5v1.7H8z",
  badge: "M12 2l2.4 1.8 3-.3 1 2.8 2.6 1.5-1 2.9 1 2.9-2.6 1.5-1 2.8-3-.3L12 22l-2.4-1.8-3 .3-1-2.8L3 16.2l1-2.9-1-2.9 2.6-1.5 1-2.8 3 .3zm0 4.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8zM7.6 17.4a5.6 5.6 0 018.8 0 6.7 6.7 0 01-8.8 0z",
};

// The areas the cards are grouped under, in the order they appear. A group
// with nothing visible to the person simply does not render.
const CATEGORIES = [
  { id: "comms", label: "Communication & Resources" },
  { id: "people", label: "People & Programmes" },
  { id: "compliance", label: "Safeguarding & Compliance" },
  { id: "admin", label: "Administration" },
  { id: "account", label: "Your Account" },
];

export const MORE_FEATURES = [
  {
    id: "calendar",
    category: "comms",
    title: "Calendar & Notices",
    short: "Events and announcements",
    icon: ICONS.calendar,
    accent: B.red,
    render: (props) => <CalendarNoticesSection {...props} />,
  },
  {
    id: "documents",
    category: "comms",
    title: "Documents & Resources",
    short: "Guides, templates and policies",
    icon: ICONS.docs,
    accent: B.blue,
    render: (props) => <DocumentsSection {...props} />,
  },
  {
    id: "messaging",
    category: "comms",
    title: "Messaging",
    short: "Messages and chapter channels",
    icon: ICONS.chat,
    accent: B.purple,
    render: (props) => <MessagingSection {...props} />,
  },
  {
    id: "participants",
    category: "people",
    title: "Participants & Discipleship",
    short: "Young people and their journey",
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
    id: "volunteers",
    category: "people",
    title: "Volunteer Register",
    short: "Your chapter's volunteers",
    icon: ICONS.hands,
    accent: B.blue,
    // Coordinators and the National Coordinator. A volunteer record is
    // closer to an HR file than a directory card, so Team Members see
    // their own from My Profile and nobody else's from anywhere. The
    // database refuses them too; this only stops them seeing a door they
    // cannot open.
    roles: ["NC", "RC"],
    render: (props) => <VolunteersSection {...props} />,
  },
  {
    id: "applications",
    category: "people",
    title: "Volunteer Applications",
    short: "New volunteer applications",
    icon: ICONS.inbox,
    accent: B.blue,
    // Coordinators and the National Coordinator, and deliberately not
    // admins. An application carries a declaration of convictions and
    // prior safeguarding concerns, which makes it screening material
    // rather than personnel data. The database refuses admins too.
    roles: ["NC", "RC"],
    adminExempt: true,
    render: (props) => <ApplicationsSection {...props} />,
  },
  {
    id: "safeguarding",
    category: "compliance",
    title: "Safeguarding",
    short: "Report and track concerns",
    icon: ICONS.shield,
    accent: B.red,
    // Access here follows YCDI-SAF-004, not the app's usual admin rule.
    // Only the Designated Safeguarding Officers and the Board
    // Safeguarding Chair. The database enforces it as well.
    roles: ["NC", "RC"],
    render: (props) => <SafeguardingSection {...props} />,
  },
  {
    id: "renewals",
    category: "compliance",
    title: "Declaration Renewals",
    short: "Annual declaration status",
    icon: ICONS.shield,
    accent: B.gold,
    // Coordinators, the National Coordinator and the Board Safeguarding
    // Chair. A renewal list says who is out of compliance, which is
    // screening material like everything else in this batch, so admins
    // are kept out here and in the database.
    roles: ["NC", "RC"],
    adminExempt: true,
    render: (props) => <RenewalsSection {...props} />,
  },
  {
    id: "kpi",
    category: "compliance",
    title: "Board & Funder KPIs",
    short: "Board and funder figures",
    icon: ICONS.chart,
    accent: B.gold,
    // Coordinators can see it because a chapter that cannot see the target
    // has no way of knowing it is behind. Row security still decides whose
    // beneficiary figures each person is shown.
    roles: ["NC", "RC"],
    render: (props) => <KpiReportSection {...props} />,
  },
  {
    id: "admin",
    category: "admin",
    title: "Manage Admins",
    short: "Who can approve and edit",
    icon: ICONS.admin,
    accent: B.black,
    adminOnly: true,
    render: (props) => <AdminSection {...props} />,
  },
  {
    id: "audit",
    category: "admin",
    title: "Audit Log",
    short: "A record of key changes",
    icon: ICONS.ledger,
    accent: B.black,
    // The National Coordinator and admins. Not Regional Coordinators:
    // the log spans every chapter and carries national access changes,
    // and chapter-scoping it would leave half a sentence behind.
    roles: ["NC"],
    render: (props) => <AuditLogSection {...props} />,
  },
  {
    id: "profile",
    category: "account",
    title: "My Profile",
    short: "Your details and record",
    icon: ICONS.badge,
    accent: B.green,
    render: (props) => <MyProfileSection profile={props.profile} showToast={props.showToast} />,
  },
  {
    id: "password",
    category: "account",
    title: "Change Password",
    short: "Update your password",
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
  const accent = disabled ? B.muted : f.accent;
  return (
    <button
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      style={{
        textAlign: "left",
        background: disabled ? B.offWhite : accent + "12",
        border: `1px solid ${disabled ? B.border : accent + "26"}`,
        borderRadius: 16,
        padding: 15,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "'Open Sans',sans-serif",
        opacity: disabled ? 0.75 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 11,
        width: "100%",
        minHeight: 116,
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 13, background: disabled ? B.white : accent + "24", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill={accent}><path d={f.icon} /></svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: B.black, lineHeight: 1.25 }}>{f.title}</span>
          {disabled ? (
            <span style={{ background: B.offWhite, color: B.muted, padding: "2px 8px", borderRadius: 20, fontSize: 9.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>Soon</span>
          ) : null}
        </div>
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: B.muted, lineHeight: 1.45 }}>{f.short}</p>
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
      // Most cards let an admin in, because admin is how the hub gets
      // supported. A few must not. Screening material carries convictions
      // and safeguarding disclosures, and admin is a technical flag that
      // ends up on whoever keeps the system running, so those cards say
      // so with adminExempt and the database refuses them as well.
      const adminMayEnter = profile.is_admin && !f.adminExempt;
      const allowed = f.roles.includes(profile.role)
        || (f.id === "safeguarding" ? profile.is_safeguarding_lead : adminMayEnter);
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
      <p style={{ margin: "0 0 20px", fontSize: 13, color: B.muted, lineHeight: 1.6 }}>
        Everything else in the hub, grouped by area.
      </p>
      {CATEGORIES.map((cat) => {
        const items = visibleFeatures.filter((f) => f.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px", fontFamily: "'Montserrat',sans-serif" }}>
              {cat.label}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 168px), 1fr))", gap: 12 }}>
              {items.map((f) => (
                <FeatureCard key={f.id} f={f} onOpen={() => setView(f.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
