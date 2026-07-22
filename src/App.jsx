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
import MoreSection, { moreFeatureTitle } from "./sections/MoreSection.jsx";
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
      setProfile({ ...data, chapter_name: data.chapters?.name || null });
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
    if (section === "more") return moreView ? moreFeatureTitle(moreView) : "More";
    return profile.role === "NC" ? "National Overview" : profile.chapter_name + " Chapter";
  }

  return (
    <div style={{ fontFamily: "'Open Sans',Arial,sans-serif", background: B.offWhite, minHeight: "100vh", overflowX: "hidden" }}>
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

      {(() => {
        const TABS = [
          { id: "home", label: "Dashboard", short: "Dashboard" },
          { id: "programmes", label: "Programme Operations", short: "Programmes" },
          { id: "spiritual", label: "Spiritual Ministry", short: "Spiritual" },
          { id: "prayer", label: "Prayer Manual", short: "Prayer" },
          { id: "directory", label: "Directory", short: "Directory" },
          { id: "more", label: "More", short: "More" },
        ].filter((t) => t.id !== "programmes" || profile.role !== "TM");
        const tabBtn = (t) => (
          <button key={t.id} onClick={() => goToSection(t.id)} aria-current={section === t.id ? "page" : undefined} style={{ background: "none", border: "none", borderBottom: `3px solid ${section === t.id ? B.white : "transparent"}`, color: section === t.id ? B.white : "rgba(255,255,255,0.65)", padding: "14px 14px", cursor: "pointer", fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: section === t.id ? 700 : 400, whiteSpace: "nowrap", flexShrink: 0 }}>
            {t.label}
          </button>
        );
        // The crest carries the name on its own now, and it doubles as the
        // way home. The label below stays on the button for screen readers,
        // so tapping the crest still announces where it goes.
        const logoHome = (h) => (
          <button onClick={() => goToSection("home")} aria-label="Go to dashboard" style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", display: "flex", lineHeight: 0 }}>
            <YCDILogo height={h} dark markOnly />
          </button>
        );
        const roleLine = (profile.role === "NC" ? "National Coordinator" : profile.role === "TM" ? profile.chapter_name + " Team Member" : profile.chapter_name + " RC") + (profile.is_admin ? " · Admin" : "");
        const userBlock = (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <NotificationBell onOpen={openFromNotification} isMobile={isMobile} />
            <button onClick={() => navigateFromDashboard("more", "profile")} aria-label={"My profile, " + profile.full_name} style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar name={profile.full_name} size={30} decorative />
              {!isMobile ? (
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12, color: B.white, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2, textDecoration: "underline", textUnderlineOffset: 2 }}>{profile.full_name}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{roleLine}</div>
                </div>
              ) : null}
            </button>
            <button onClick={signOut} style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "rgba(255,255,255,0.75)", padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
              Sign out
            </button>
          </div>
        );

        if (isMobile) {
          return (
            <div className="ycdi-onblue" style={{ position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
              <div style={{ background: B.blue, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", gap: 10 }}>
                {logoHome(30)}
                {userBlock}
              </div>
              <nav aria-label="Sections" style={{ background: B.blue, display: "flex", flexWrap: "wrap", gap: 6, padding: "0 10px 10px", borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 10 }}>
                {TABS.map((t) => {
                  const on = section === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => goToSection(t.id)}
                      aria-current={on ? "page" : undefined}
                      aria-label={t.label}
                      style={{
                        flex: "1 1 28%",
                        minWidth: 0,
                        background: on ? B.white : "rgba(255,255,255,0.14)",
                        color: on ? B.brandDeep : "rgba(255,255,255,0.9)",
                        border: "none",
                        borderRadius: 20,
                        padding: "9px 8px",
                        fontSize: 12,
                        fontFamily: "'Montserrat',sans-serif",
                        fontWeight: on ? 700 : 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.short || t.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          );
        }
        return (
          <nav aria-label="Sections" className="ycdi-onblue" style={{ background: B.blue, display: "flex", alignItems: "center", padding: "0 20px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
            <div style={{ padding: "8px 0", marginRight: 20, paddingRight: 20, borderRight: "1px solid rgba(255,255,255,0.2)" }}>
              {logoHome(36)}
            </div>
            {TABS.map(tabBtn)}
            <div style={{ marginLeft: "auto" }}>{userBlock}</div>
          </nav>
        );
      })()}

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
            {section === "more" ? <MoreSection profile={profile} chapters={chapters} showToast={showToast} view={moreView} setView={setMoreView} /> : null}
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer style={{ background: B.black, color: "rgba(255,255,255,0.4)", padding: "14px 24px", textAlign: "center", fontSize: 11, marginTop: 40 }}>
        2025 Young Christian Development Initiative (YCDI) - RaisingGodlyLeaders - ycdinigeria@gmail.com
      </footer>

      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}
    </div>
  );
}
