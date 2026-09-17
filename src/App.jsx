import { useState, useEffect, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase.js";
import { B, GFONTS } from "./theme.js";
import { useIsMobile } from "./useIsMobile.js";
import { Avatar, YCDILogo, Toast } from "./components/ui.jsx";
import LoginScreen from "./auth/LoginScreen.jsx";
import SignupPending from "./auth/SignupPending.jsx";
import PendingApprovals from "./auth/PendingApprovals.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import { useOnline } from "./useOnline.js";
import { humanise } from "./lib/errors.js";
import MoreSection, { moreFeatureTitle, visibleMoreFeatures } from "./sections/MoreSection.jsx";
import { onUpdateReady, applyUpdate } from "./lib/pwa.js";
import { arrivedForPasswordRecovery, hasAuthCallback, authLinkError, clearAuthCallbackFromUrl } from "./lib/authCallback.js";
import SetPasswordScreen from "./auth/SetPasswordScreen.jsx";
// BATCH6B-MARKER app-a11y
import { A11Y_CSS, scrollToTop } from "./lib/a11y.js";
// BATCH7A-MARKER app-public-route
import { isApplyPath } from "./lib/application.js";
const ApplyScreen = lazy(() => import("./public/ApplyScreen.jsx"));

// Each tab is fetched the first time it is opened rather than sitting in
// the file that has to download before the login screen can appear. Most
// people use two or three of these, so the rest is never fetched at all.
// MoreSection itself stays here because it is small and it holds the list
// of feature names the page title reads from.
// BATCH8-MARKER app-dashboard
const DashboardSection = lazy(() => import("./sections/DashboardSection.jsx"));
const SpiritualSection = lazy(() => import("./sections/SpiritualSection.jsx"));
const ProgrammesSection = lazy(() => import("./sections/programmes/ProgrammesSection.jsx"));
const PrayerManualSection = lazy(() => import("./sections/PrayerManualSection.jsx"));
const DirectorySection = lazy(() => import("./sections/DirectorySection.jsx"));
const ReportsSection = lazy(() => import("./sections/ReportsSection.jsx"));

export function SectionLoading() {
  return (
    <div role="status" aria-live="polite" style={{ padding: "44px 20px", textAlign: "center", color: B.muted, fontSize: 13 }}>
      Loading…
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("home");
  // BATCH8-MARKER app-dashboard
  // Set when the dashboard asks for one programme by name. Programme
  // Operations reads it once, opens that record, then clears it.
  const [openProgramId, setOpenProgramId] = useState(null);
  const [moreView, setMoreView] = useState(null);
  const [toast, setToast] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  // True when somebody has arrived on a password reset link. Nothing else
  // in the app is reachable until they choose a password or sign out.
  // BATCH4C-MARKER recovery
  const [recovery, setRecovery] = useState(arrivedForPasswordRecovery);
  const [linkError] = useState(authLinkError());
  const isMobile = useIsMobile();
  const online = useOnline();

  // The service worker tells us when a newer build has finished
  // downloading. Nothing reloads until the person presses the button.
  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);

  // Leaving the More tab closes whatever was open inside it, so coming back
  // always lands on the list of features rather than mid-way into one.
  function goToSection(id) {
    if (id !== "more") setMoreView(null);
    if (id !== "programmes") setOpenProgramId(null);
    setSection(id);
  }

  // BATCH8-MARKER app-dashboard
  // The dashboard's Review buttons. Both land somewhere real rather than
  // just switching tab and leaving the person to find the record again.
  function openProgramFromDashboard(id) {
    setOpenProgramId(id);
    setMoreView(null);
    setSection("programmes");
    scrollToTop();
  }

  function navigateFromDashboard(target, view) {
    setSection(target);
    setMoreView(target === "more" ? view || null : null);
    scrollToTop();
  }

  // Clicking a notification lands you on the screen it came from,
  // including one nested inside More.
  function openFromNotification(target, view) {
    setSection(target);
    setMoreView(target === "more" ? view : null);
    // Respects "reduce motion". A CSS media query cannot reach a
    // scroll started from here, so it is checked in code.
    scrollToTop();
  }

  function showToast(msg, type) {
    // Errors get turned into plain language here rather than at each of
    // the several dozen places that raise one.
    const text = type === "error" ? humanise(msg) : msg;
    setToast({ msg: text, type: type || "success" });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    // Clear any leftover #prayer-manual hash from older links so it can't
    // affect routing. The manual is a normal in-app tab now.
    //
    // An auth callback is left strictly alone. Supabase reads the reset
    // token out of the address bar asynchronously, so wiping it here was
    // capable of destroying the token before it could be used. It gets
    // cleared later, once it has actually been spent.
    if (window.location.hash && !hasAuthCallback) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) loadProfile(s.user.id); else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // Newer Supabase projects send a short code with nothing in the
      // address bar to say what it is for. This event is the only signal,
      // so it is caught here as well as read from the URL above.
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
      if (s) loadProfile(s.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*, chapters(name)").eq("id", userId).single();
    if (data) {
      // Which NEC seats this person holds, if any. The seat grants no
      // access by itself; the app reads it to show the right tabs, and
      // the database enforces the matching reach on its own.
      const { data: seats } = await supabase.from("nec_portfolios").select("portfolio").eq("profile_id", userId);
      setProfile({ ...data, chapter_name: data.chapters?.name || null, portfolios: (seats || []).map((s) => s.portfolio) });
      await loadChapters();
    }
    setLoading(false);
  }

  async function loadChapters() {
    const { data } = await supabase.from("chapters").select("*").order("name");
    if (data) setChapters(data);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMoreView(null);
    setSection("home");
  }

  // BATCH9-MARKER splash
  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-label="Loading the hub" style={{ minHeight: "100vh", background: B.brandDeepest, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{GFONTS}</style>
        <YCDILogo height={62} dark markOnly />
      </div>
    );
  }

  // The volunteer application form, and the only page in the hub that
  // opens without signing in. Checked before the session gate rather than
  // after, because a stranger has no session and would otherwise be shown
  // a login screen for an account they do not have and do not need.
  //
  // Netlify already sends every path to index.html, so no router is
  // involved. The path is read once, here.
  if (typeof window !== "undefined" && isApplyPath(window.location.pathname)) {
    return (
      <Suspense fallback={<SectionLoading />}>
        <ApplyScreen />
      </Suspense>
    );
  }

  if (!session) return <LoginScreen linkError={linkError} />;

  // Sits above the profile check on purpose. A reset link signs somebody
  // in, so without this they would land inside the hub having never
  // chosen a password.
  if (recovery) {
    return (
      <SetPasswordScreen
        recovery
        email={session.user?.email}
        showToast={showToast}
        onDone={() => { setRecovery(false); clearAuthCallbackFromUrl(); }}
        onCancel={() => { setRecovery(false); clearAuthCallbackFromUrl(); signOut(); }}
      />
    );
  }

  if (!profile) return <SignupPending user={session.user} onComplete={() => loadProfile(session.user.id)} />;

  // Team Members have view-only access and don't get Programme Operations.
  // If it's ever the active section for them (e.g. it was the default before
  // their profile loaded), bounce to Spiritual Ministry instead.
  if (profile.role === "TM" && section === "programmes") {
    setSection("spiritual");
  }

  function pageTitle() {
    if (section === "home") return "Dashboard";
    if (section === "spiritual") return "Spiritual Ministry Framework";
    if (section === "prayer") return "Prayer Manual";
    if (section === "directory") return "People Directory";
    if (section === "reports") return "Reports";
    if (section === "more") return moreView ? moreFeatureTitle(moreView) : "More";
    return profile.role === "NC" ? "National Overview" : profile.chapter_name + " Chapter";
  }

  // ---- Navigation model (sidebar on desktop, tabs + More on mobile) -----
  // BATCH-UI sidebar-shell
  // Every entry routes into a section or a More feature that already
  // exists, so this changes how people move around, not what they land on.
  // Which features a person is offered comes from the same rule the More
  // grid uses, so nobody sees a door the database would refuse to open.
  const CORE_ICONS = {
    home: "M12 3 2 12h3v8h5v-5h4v5h5v-8h3z",
    programmes: "M9 4h6a2 2 0 0 1 2 2v1h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4V6a2 2 0 0 1 2-2m0 3h6V6H9z",
    reports: "M6 2h8l6 6v14H6zm8 1.5V8h4.5zM9 12h6v1.7H9zm0 3.4h6v1.7H9z",
    spiritual: "M12 6C9.5 3.5 5 3.6 3 4.4V19c2-.8 6.5-.9 9 1.6 2.5-2.5 7-2.4 9-1.6V4.4c-2-.8-6.5-.9-9 1.6z",
    prayer: "M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-3 2-4 3-6 .8 1 .8 2 .8 3 1-1 1.2-3 1.2-6z",
    directory: "M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0v1H4zm14.5-9a3 3 0 100-6 3 3 0 000 6zM19 13c2.5 0 4 1.8 4 4v1h-3.2v-1c0-1.6-.6-3-1.6-4z",
    profile: "M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0v1H4z",
    signout: "M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4v-2H6V5h4zm6.2 4-1.4 1.4L17.2 11H9v2h8.2l-2.4 2.6L16.2 17l4.8-5z",
    dots: "M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  };

  const roleLine =
    (profile.role === "NC" ? "National Coordinator"
      : profile.role === "TM" ? profile.chapter_name + " Team Member"
      : profile.chapter_name + " RC")
    + (profile.is_admin ? " \u00b7 Admin" : "");

  const feats = visibleMoreFeatures(profile);
  const feat = (id) => feats.find((f) => f.id === id && !f.soon);
  const clean = (arr) => arr.filter(Boolean);
  const coreItem = (id, label, icon, show = true) =>
    show ? { key: id, label, icon, onClick: () => goToSection(id), active: section === id && !moreView } : null;
  const moreItem = (id) => {
    const f = feat(id);
    return f
      ? { key: "more:" + id, label: f.title, icon: f.icon, onClick: () => navigateFromDashboard("more", id), active: section === "more" && moreView === id }
      : null;
  };

  const navGroups = [
    { items: clean([coreItem("home", "Overview", CORE_ICONS.home)]) },
    { label: "Programmes", items: clean([
      coreItem("programmes", "Programme Operations", CORE_ICONS.programmes, profile.role !== "TM"),
      coreItem("reports", "Reports", CORE_ICONS.reports),
      moreItem("attendance"),
    ]) },
    { label: "People", items: clean([
      moreItem("participants"), moreItem("volunteers"), moreItem("applications"),
      coreItem("directory", "Directory", CORE_ICONS.directory),
    ]) },
    { label: "Spiritual life", items: clean([
      coreItem("spiritual", "Spiritual Ministry", CORE_ICONS.spiritual),
      coreItem("prayer", "Prayer Manual", CORE_ICONS.prayer),
    ]) },
    { label: "Communication", items: clean([
      moreItem("calendar"), moreItem("messaging"), moreItem("documents"),
    ]) },
    { label: "Safeguarding & compliance", items: clean([
      moreItem("safeguarding"), moreItem("renewals"), moreItem("kpi"), moreItem("dataprotection"),
    ]) },
    { label: "Administration", items: clean([
      moreItem("admin"), moreItem("audit"),
    ]) },
  ].filter((g) => g.items.length);

  const footerItems = clean([moreItem("profile")]);
  const signOutItem = { key: "signout", label: "Sign out", icon: CORE_ICONS.signout, onClick: signOut, active: false };

  const bottomTabs = clean([
    { key: "home", label: "Home", icon: CORE_ICONS.home, onClick: () => goToSection("home"), active: section === "home" && !moreView },
    { key: "reports", label: "Reports", icon: CORE_ICONS.reports, onClick: () => goToSection("reports"), active: section === "reports" && !moreView },
    feat("calendar") && { key: "calendar", label: "Calendar", icon: feat("calendar").icon, onClick: () => navigateFromDashboard("more", "calendar"), active: section === "more" && moreView === "calendar" },
    feat("messaging") && { key: "messaging", label: "Messages", icon: feat("messaging").icon, onClick: () => navigateFromDashboard("more", "messaging"), active: section === "more" && moreView === "messaging" },
    { key: "more", label: "More", icon: CORE_ICONS.dots, onClick: () => goToSection("more"), active: section === "more" && moreView !== "calendar" && moreView !== "messaging" },
  ]);

  const navRow = (it) => (
    <button key={it.key} onClick={it.onClick} aria-current={it.active ? "page" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", background: it.active ? B.blue : "none", color: it.active ? B.white : "#3a4150", border: "none", borderRadius: 9, padding: "9px 11px", cursor: "pointer", fontFamily: "'Open Sans',sans-serif", fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill={it.active ? B.white : "#6a7280"} aria-hidden="true" style={{ flexShrink: 0 }}><path d={it.icon} /></svg>
      <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
    </button>
  );

  const menuRow = (it) => (
    <button key={it.key} onClick={it.onClick}
      style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #f2f3f6", padding: "14px 2px", cursor: "pointer", fontFamily: "'Open Sans',sans-serif", fontSize: 14, color: "#20242c" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#4b5563" aria-hidden="true" style={{ flexShrink: 0 }}><path d={it.icon} /></svg>
      <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2c8d1" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );

  const renderMobileMore = () => (
    <div>
      {navGroups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 4 }}>
          {g.label ? <div style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "#9AA3AF", fontWeight: 700, textTransform: "uppercase", margin: "16px 2px 6px", fontFamily: "'Montserrat',sans-serif" }}>{g.label}</div> : null}
          {g.items.map(menuRow)}
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        {footerItems.map(menuRow)}
        {menuRow(signOutItem)}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Open Sans',Arial,sans-serif", background: B.offWhite, minHeight: "100vh", overflowX: "hidden", paddingLeft: isMobile ? 0 : 248, paddingBottom: isMobile ? 62 : 0 }}>
      <style>{GFONTS}</style>
      <style>{A11Y_CSS}</style>
      <a className="ycdi-skip" href="#ycdi-main">Skip to main content</a>
      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; max-width: 100%; overflow-x: hidden; }
        #root { max-width: 100%; overflow-x: hidden; }

        /* Long unbroken text (email addresses, file names, program titles
           with no spaces) used to set the minimum width of whatever card it
           sat in, and that dragged the whole page wider than the screen.
           Letting it break stops that at the source. */
        body { overflow-wrap: anywhere; }

        img, svg, video, canvas { max-width: 100%; height: auto; }
        input, select, textarea, button { max-width: 100%; min-width: 0; }

        /* Grid and flex children shrink by default in this app. Without this
           they hold the width of their longest word instead. */
        .rcol1 > *, .rcol2 > *, .rstats > * { min-width: 0; }

        /* The programme list and the chapter chart. One column by default,
           side by side only once there is genuinely room for the sidebar.
           Built as min-width rather than max-width so the narrow layout is
           what a phone gets without having to override anything. */
        .ncsplit { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); align-items: start; }
        @media (min-width: 860px) {
          .ncsplit { grid-template-columns: minmax(0, 1fr) 270px; }
        }

        @media (max-width: 760px) {
          .rcol1 { grid-template-columns: minmax(0, 1fr) !important; }
          .rcol2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .rstats { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>

      {!isMobile ? (
        <aside aria-label="Main navigation" style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 248, background: B.white, borderRight: "1px solid " + B.border, display: "flex", flexDirection: "column", zIndex: 90 }}>
          <div style={{ padding: "16px 16px 12px" }}>
            <button onClick={() => goToSection("home")} aria-label="Go to dashboard" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>
              <YCDILogo height={34} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>
            {navGroups.map((g, gi) => (
              <div key={gi} style={{ marginBottom: 4 }}>
                {g.label ? <div style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "#9AA3AF", fontWeight: 700, textTransform: "uppercase", padding: "10px 10px 6px", fontFamily: "'Montserrat',sans-serif" }}>{g.label}</div> : null}
                {g.items.map(navRow)}
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid " + B.offWhite, padding: "10px 12px" }}>
            {footerItems.map(navRow)}
            {navRow(signOutItem)}
            <div style={{ fontSize: 11, color: "#9AA3AF", padding: "8px 10px 2px" }}>YCDI Hub</div>
          </div>
        </aside>
      ) : null}

      {!isMobile ? (
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 24px", background: B.white, borderBottom: "1px solid " + B.border, position: "sticky", top: 0, zIndex: 80 }}>
          <div style={{ color: B.muted, fontSize: 13 }}>Working together for a generation that makes a difference</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell onOpen={openFromNotification} isMobile={false} onLight />
            <button onClick={() => navigateFromDashboard("more", "profile")} aria-label={"My profile, " + profile.full_name} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
              <Avatar name={profile.full_name} size={32} decorative />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 12.5, color: B.black, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2 }}>{profile.full_name}</div>
                <div style={{ fontSize: 11, color: B.muted }}>{roleLine}</div>
              </div>
            </button>
          </div>
        </div>
      ) : null}

      {isMobile ? (
        <div className="ycdi-onblue" style={{ position: "sticky", top: 0, zIndex: 90, background: B.blue, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", gap: 10 }}>
            <button onClick={() => goToSection("home")} aria-label="Go to dashboard" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", lineHeight: 0 }}>
              <YCDILogo height={30} dark markOnly />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NotificationBell onOpen={openFromNotification} isMobile />
              <button onClick={() => navigateFromDashboard("more", "profile")} aria-label={"My profile, " + profile.full_name} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>
                <Avatar name={profile.full_name} size={30} decorative />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {updateReady ? (
        <div role="status" aria-live="polite" style={{ background: B.blueDark, color: B.white, padding: "9px 14px", fontSize: 12.5, textAlign: "center", lineHeight: 1.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          A newer version of the hub is ready.
          <button
            onClick={applyUpdate}
            style={{ background: B.white, color: B.blueDark, border: "none", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
          >
            Refresh now
          </button>
        </div>
      ) : null}

      {!online ? (
        <div role="status" aria-live="polite" style={{ background: "#3A3A3A", color: "#fff", padding: "8px 14px", fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
          You're offline. You can still read what's already loaded, but nothing will save until the connection is back.
        </div>
      ) : null}

      <main id="ycdi-main" tabIndex={-1} style={{ padding: isMobile ? "16px 14px" : "24px", maxWidth: 980, margin: "0 auto", boxSizing: "border-box", outline: "none" }}>
        {section === "home" ? null : (
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{pageTitle()}</h1>
            <div style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>YCDI - {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
          </div>
        )}

        {profile.is_admin ? (
          <ErrorBoundary label="Sign-up requests" fullName={profile.full_name}><PendingApprovals /></ErrorBoundary>
        ) : null}

        <ErrorBoundary
          key={section + ":" + (moreView || "")}
          label={pageTitle()}
          fullName={profile.full_name}
          onBack={() => goToSection("home")}
        >
          <Suspense fallback={<SectionLoading />}>
            {section === "home" ? (
              <DashboardSection
                profile={profile}
                chapters={chapters}
                showToast={showToast}
                onOpenProgram={openProgramFromDashboard}
                onNavigate={navigateFromDashboard}
              />
            ) : null}
            {section === "programmes" && profile.role !== "TM" ? (
              <ProgrammesSection
                profile={profile}
                chapters={chapters}
                showToast={showToast}
                openProgramId={openProgramId}
                onOpened={() => setOpenProgramId(null)}
              />
            ) : null}
            {section === "spiritual" ? <SpiritualSection profile={profile} showToast={showToast} /> : null}
            {section === "prayer" ? <PrayerManualSection /> : null}
            {section === "directory" ? <DirectorySection profile={profile} chapters={chapters} showToast={showToast} /> : null}
            {section === "reports" ? <ReportsSection profile={profile} chapters={chapters} showToast={showToast} /> : null}
            {section === "more" ? ((isMobile && !moreView) ? renderMobileMore() : <MoreSection profile={profile} chapters={chapters} showToast={showToast} view={moreView} setView={setMoreView} />) : null}
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer style={{ background: B.black, color: "rgba(255,255,255,0.4)", padding: "14px 24px", textAlign: "center", fontSize: 11, marginTop: 40 }}>
        2025 Young Christian Development Initiative (YCDI) - RaisingGodlyLeaders - ycdinigeria@gmail.com
      </footer>

      {isMobile ? (
        <nav aria-label="Sections" style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: 62, background: B.white, borderTop: "1px solid " + B.border, display: "grid", gridTemplateColumns: `repeat(${bottomTabs.length}, 1fr)`, zIndex: 95 }}>
          {bottomTabs.map((t) => (
            <button key={t.key} onClick={t.onClick} aria-current={t.active ? "page" : undefined} aria-label={t.label}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: t.active ? B.blue : "#9AA3AF", fontFamily: "'Montserrat',sans-serif", fontSize: 10.5, fontWeight: 600 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill={t.active ? B.blue : "#9AA3AF"} aria-hidden="true"><path d={t.icon} /></svg>
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}
    </div>
  );
}
