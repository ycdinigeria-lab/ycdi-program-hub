import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";
import { B, GFONTS } from "./theme.js";
import { Avatar, YCDILogo, Toast } from "./components/ui.jsx";
import LoginScreen from "./auth/LoginScreen.jsx";
import SignupPending from "./auth/SignupPending.jsx";
import PendingApprovals from "./auth/PendingApprovals.jsx";
import SpiritualSection from "./sections/SpiritualSection.jsx";
import ProgrammesSection from "./sections/programmes/ProgrammesSection.jsx";
import PrayerManualSection from "./sections/PrayerManualSection.jsx";
import DirectorySection from "./sections/DirectorySection.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("programmes");
  const [toast, setToast] = useState(null);

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

  function pageTitle() {
    if (section === "spiritual") return "Spiritual Ministry Framework";
    if (section === "prayer") return "Prayer Manual";
    if (section === "directory") return "People Directory";
    return profile.role === "NC" ? "National Overview" : profile.chapter_name + " Chapter";
  }

  return (
    <div style={{ fontFamily: "'Open Sans',Arial,sans-serif", background: B.offWhite, minHeight: "100vh" }}>
      <style>{GFONTS}</style>

      <div style={{ background: B.blue, display: "flex", alignItems: "center", padding: "0 20px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ padding: "12px 0", marginRight: 20, paddingRight: 20, borderRight: "1px solid rgba(255,255,255,0.2)" }}>
          <YCDILogo height={38} dark={true} />
        </div>

        <button onClick={() => setSection("programmes")} style={{ background: "none", border: "none", borderBottom: `3px solid ${section === "programmes" ? B.yellow : "transparent"}`, color: section === "programmes" ? B.white : "rgba(255,255,255,0.6)", padding: "16px 14px", cursor: "pointer", fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: section === "programmes" ? 700 : 400 }}>
          Programme Operations
        </button>
        <button onClick={() => setSection("spiritual")} style={{ background: "none", border: "none", borderBottom: `3px solid ${section === "spiritual" ? B.yellow : "transparent"}`, color: section === "spiritual" ? B.white : "rgba(255,255,255,0.6)", padding: "16px 14px", cursor: "pointer", fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: section === "spiritual" ? 700 : 400 }}>
          Spiritual Ministry
        </button>
        <button onClick={() => setSection("prayer")} style={{ background: "none", border: "none", borderBottom: `3px solid ${section === "prayer" ? B.yellow : "transparent"}`, color: section === "prayer" ? B.white : "rgba(255,255,255,0.6)", padding: "16px 14px", cursor: "pointer", fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: section === "prayer" ? 700 : 400 }}>
          Prayer Manual
        </button>
        <button onClick={() => setSection("directory")} style={{ background: "none", border: "none", borderBottom: `3px solid ${section === "directory" ? B.yellow : "transparent"}`, color: section === "directory" ? B.white : "rgba(255,255,255,0.6)", padding: "16px 14px", cursor: "pointer", fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: section === "directory" ? 700 : 400 }}>
          Directory
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={profile.full_name} size={30} />
          <div>
            <div style={{ fontSize: 12, color: B.white, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2 }}>{profile.full_name}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{profile.role === "NC" ? "National Coordinator" : profile.chapter_name + " RC"}</div>
          </div>
          <button onClick={signOut} style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "4px 12px", fontSize: 11, cursor: "pointer", marginLeft: 10 }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ background: B.yellow, height: 4 }} />

      <div style={{ padding: "24px", maxWidth: 980, margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{pageTitle()}</h1>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>YCDI - {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
        </div>

        {profile.role === "NC" ? <PendingApprovals /> : null}

        {section === "programmes" ? (
          <ProgrammesSection profile={profile} chapters={chapters} showToast={showToast} />
        ) : null}
        {section === "spiritual" ? <SpiritualSection /> : null}
        {section === "prayer" ? <PrayerManualSection /> : null}
        {section === "directory" ? <DirectorySection profile={profile} chapters={chapters} showToast={showToast} /> : null}
      </div>

      <div style={{ background: B.black, color: "rgba(255,255,255,0.4)", padding: "14px 24px", textAlign: "center", fontSize: 11, marginTop: 40 }}>
        2025 Young Christian Development Initiative (YCDI) - RaisingGodlyLeaders - ycdinigeria@gmail.com
      </div>

      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}
    </div>
  );
}
