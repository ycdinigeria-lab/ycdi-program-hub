import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";
import { B, GFONTS } from "./theme.js";
import { useIsMobile } from "./useIsMobile.js";
import { Avatar, YCDILogo, Toast } from "./components/ui.jsx";
import LoginScreen from "./auth/LoginScreen.jsx";
import SignupPending from "./auth/SignupPending.jsx";
import PendingApprovals from "./auth/PendingApprovals.jsx";
import SpiritualSection from "./sections/SpiritualSection.jsx";
import ProgrammesSection from "./sections/programmes/ProgrammesSection.jsx";
import PrayerManualSection from "./sections/PrayerManualSection.jsx";
import DirectorySection from "./sections/DirectorySection.jsx";
import CalendarNoticesSection from "./sections/CalendarNoticesSection.jsx";
import MoreSection, { moreFeatureTitle } from "./sections/MoreSection.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("programmes");
  const [moreView, setMoreView] = useState(null);
  const [toast, setToast] = useState(null);
  const isMobile = useIsMobile();

  // Leaving the More tab closes whatever was open inside it, so coming back
  // always lands on the list of features rather than mid-way into one.
  function goToSection(id) {
    if (id !== "more") setMoreView(null);
    setSection(id);
  }

  function showToast(msg, type) {
    setToast({ msg, type: type || "success" });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    // Clear any leftover #prayer-manual hash from older links so it can't
    // affect routing. The manual is a normal in-app tab now.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) loadProfile(s.user.id); else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
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
    setSection("programmes");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: B.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{GFONTS}</style>
        <YCDILogo height={52} dark={true} />
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  if (!profile) return <SignupPending user={session.user} onComplete={() => loadProfile(session.user.id)} />;

  // Team Members have view-only access and don't get Programme Operations.
  // If it's ever the active section for them (e.g. it was the default before
  // their profile loaded), bounce to Spiritual Ministry instead.
  if (profile.role === "TM" && section === "programmes") {
    setSection("spiritual");
  }

  function pageTitle() {
    if (section === "spiritual") return "Spiritual Ministry Framework";
    if (section === "prayer") return "Prayer Manual";
    if (section === "directory") return "People Directory";
    if (section === "calendar") return "Calendar & Notices";
    if (section === "more") return moreView ? moreFeatureTitle(moreView) : "More";
    return profile.role === "NC" ? "National Overview" : profile.chapter_name + " Chapter";
  }

  return (
    <div style={{ fontFamily: "'Open Sans',Arial,sans-serif", background: B.offWhite, minHeight: "100vh", overflowX: "hidden" }}>
      <style>{GFONTS}</style>
      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        img { max-width: 100%; }
        @media (max-width: 760px) {
          .rcol1 { grid-template-columns: 1fr !important; }
          .rcol2 { grid-template-columns: repeat(2, 1fr) !important; }
          .rstats { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {(() => {
        const TABS = [
          { id: "programmes", label: "Programme Operations", short: "Programmes" },
          { id: "spiritual", label: "Spiritual Ministry", short: "Spiritual" },
          { id: "prayer", label: "Prayer Manual", short: "Prayer" },
          { id: "directory", label: "Directory", short: "Directory" },
          { id: "calendar", label: "Calendar & Notices", short: "Calendar" },
          { id: "more", label: "More", short: "More" },
        ].filter((t) => t.id !== "programmes" || profile.role !== "TM");
        const tabBtn = (t) => (
          <button key={t.id} onClick={() => goToSection(t.id)} style={{ background: "none", border: "none", borderBottom: `3px solid ${section === t.id ? B.yellow : "transparent"}`, color: section === t.id ? B.white : "rgba(255,255,255,0.65)", padding: "14px 14px", cursor: "pointer", fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: section === t.id ? 700 : 400, whiteSpace: "nowrap", flexShrink: 0 }}>
            {t.label}
          </button>
        );
        const userBlock = (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Avatar name={profile.full_name} size={30} />
            {!isMobile ? (
              <div>
                <div style={{ fontSize: 12, color: B.white, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2 }}>{profile.full_name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{profile.role === "NC" ? "National Coordinator" : profile.role === "TM" ? profile.chapter_name + " Team Member" : profile.chapter_name + " RC"}</div>
              </div>
            ) : null}
            <button onClick={signOut} style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "rgba(255,255,255,0.75)", padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
              Sign out
            </button>
          </div>
        );

        if (isMobile) {
          return (
            <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
              <div style={{ background: B.blue, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", gap: 10 }}>
                <YCDILogo height={32} dark markOnly />
                {userBlock}
              </div>
              <div style={{ background: B.blue, display: "flex", flexWrap: "wrap", gap: 6, padding: "0 10px 10px", borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 10 }}>
                {TABS.map((t) => {
                  const on = section === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => goToSection(t.id)}
                      style={{
                        flex: "1 1 28%",
                        minWidth: 0,
                        background: on ? B.white : "rgba(255,255,255,0.14)",
                        color: on ? B.blueDark : "rgba(255,255,255,0.9)",
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
              </div>
            </div>
          );
        }
        return (
          <div style={{ background: B.blue, display: "flex", alignItems: "center", padding: "0 20px", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ padding: "12px 0", marginRight: 20, paddingRight: 20, borderRight: "1px solid rgba(255,255,255,0.2)" }}>
              <YCDILogo height={38} dark={true} />
            </div>
            {TABS.map(tabBtn)}
            <div style={{ marginLeft: "auto" }}>{userBlock}</div>
          </div>
        );
      })()}

      <div style={{ background: B.yellow, height: 4 }} />

      <div style={{ padding: isMobile ? "16px 14px" : "24px", maxWidth: 980, margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{pageTitle()}</h1>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>YCDI - {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
        </div>

        {profile.role === "NC" ? <PendingApprovals /> : null}

        {section === "programmes" && profile.role !== "TM" ? (
          <ProgrammesSection profile={profile} chapters={chapters} showToast={showToast} />
        ) : null}
        {section === "spiritual" ? <SpiritualSection profile={profile} showToast={showToast} /> : null}
        {section === "prayer" ? <PrayerManualSection /> : null}
        {section === "directory" ? <DirectorySection profile={profile} chapters={chapters} showToast={showToast} /> : null}
        {section === "calendar" ? <CalendarNoticesSection profile={profile} chapters={chapters} showToast={showToast} /> : null}
        {section === "more" ? <MoreSection profile={profile} chapters={chapters} showToast={showToast} view={moreView} setView={setMoreView} /> : null}
      </div>

      <div style={{ background: B.black, color: "rgba(255,255,255,0.4)", padding: "14px 24px", textAlign: "center", fontSize: 11, marginTop: 40 }}>
        2025 Young Christian Development Initiative (YCDI) - RaisingGodlyLeaders - ycdinigeria@gmail.com
      </div>

      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}
    </div>
  );
}
