import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel } from "../theme.js";
// BATCH9-MARKER signup-shell
import AuthShell, { authBtn, AuthNotice } from "./AuthShell.jsx";

const hintStyle = { fontSize: 11, color: B.muted, marginTop: 5, lineHeight: 1.5 };

function SField({ label, req, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>
        {label}{req ? <span style={{ color: B.red, marginLeft: 3 }}>*</span> : null}
      </label>
      {children}
    </div>
  );
}

export default function SignupPending({ user, onComplete }) {
  const [checking, setChecking] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [form, setForm] = useState({
    fullName: "", phone: "", chapterId: "", roleTitle: "", referredBy: "", coordinatorName: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    async function check() {
      const [{ data: existing }, { data: chs }] = await Promise.all([
        supabase.from("pending_signups").select("id").eq("id", user.id).single(),
        supabase.from("chapters").select("id, name").order("name"),
      ]);
      setSubmitted(!!existing);
      setChapters(chs || []);
      setChecking(false);
    }
    check();
  }, [user.id]);

  async function submit(e) {
    e.preventDefault();
    if (!form.fullName.trim()) { setErr("Please enter your full name."); return; }
    if (!form.phone.trim()) { setErr("Please enter a phone number we can reach you on."); return; }
    if (!form.chapterId) { setErr("Please pick your chapter, or National if you're not with one."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("pending_signups").insert({
      id: user.id,
      email: user.email,
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      chapter_id: form.chapterId === "national" ? null : form.chapterId,
      role_title: form.roleTitle.trim() || null,
      referred_by: form.referredBy.trim() || null,
      coordinator_name: form.coordinatorName.trim() || null,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    setSubmitted(true);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const heading = checking ? "Checking your account" : submitted ? "Request sent" : "One more step";
  const strap = checking
    ? null
    : submitted
      ? "Your account is with the National Coordinator."
      : "A few details so whoever reviews this knows who you are and where you serve.";

  return (
    <AuthShell title={heading} subtitle={strap}>
      <>
          {checking ? (
            <div style={{ textAlign: "center", color: B.muted, fontSize: 13, padding: "20px 0" }}>Checking your account...</div>
          ) : submitted ? (
            <>
              <div style={{ fontSize: 13, color: B.muted, lineHeight: 1.6, marginBottom: 20 }}>
                You'll be able to sign in as soon as it's approved. This usually doesn't take long, check back shortly.
              </div>
              <button onClick={signOut} style={authBtn}>Sign out</button>
            </>
          ) : (
            <>
              <form onSubmit={submit}>
                <SField label="Full name" req>
                  <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} style={inp} placeholder="Your full name" />
                </SField>

                <SField label="Phone / WhatsApp" req>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inp} placeholder="+234…" inputMode="tel" />
                  <div style={hintStyle}>Only coordinators and admins can see this. It won't be shown to other members.</div>
                </SField>

                <SField label="Your chapter" req>
                  <select value={form.chapterId} onChange={(e) => set("chapterId", e.target.value)} style={sel}>
                    <option value="">Select your chapter…</option>
                    {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="national">National / not with a chapter</option>
                  </select>
                </SField>

                <SField label="What you do at YCDI">
                  <input value={form.roleTitle} onChange={(e) => set("roleTitle", e.target.value)} style={inp} placeholder="e.g. Media volunteer, Chapter secretary" />
                </SField>

                <SField label="Your chapter coordinator">
                  <input value={form.coordinatorName} onChange={(e) => set("coordinatorName", e.target.value)} style={inp} placeholder="Who leads your chapter?" />
                </SField>

                <SField label="Who referred you">
                  <input value={form.referredBy} onChange={(e) => set("referredBy", e.target.value)} style={inp} placeholder="Someone at YCDI who knows you" />
                </SField>

                {err ? <AuthNotice tone="error">{err}</AuthNotice> : null}
                <button type="submit" disabled={busy} style={{ ...authBtn, opacity: busy ? 0.6 : 1 }}>
                  {busy ? "Submitting…" : "Request Access"}
                </button>
              </form>
              <button onClick={signOut} style={{ background: "none", border: "none", color: B.muted, fontSize: 12, marginTop: 14, cursor: "pointer", width: "100%", textAlign: "center" }}>
                Sign out
              </button>
            </>
          )}
      </>
    </AuthShell>
  );
}
