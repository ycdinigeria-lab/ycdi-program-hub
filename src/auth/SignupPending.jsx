import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B, GFONTS, inp, btnP } from "../theme.js";
import { YCDILogo } from "../components/ui.jsx";

export default function SignupPending({ user, onComplete }) {
  const [checking, setChecking] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function check() {
      const { data } = await supabase.from("pending_signups").select("id").eq("id", user.id).single();
      setSubmitted(!!data);
      setChecking(false);
    }
    check();
  }, [user.id]);

  async function submit(e) {
    e.preventDefault();
    if (!fullName.trim()) { setErr("Please enter your full name."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("pending_signups").insert({ id: user.id, email: user.email, full_name: fullName.trim() });
    if (error) { setErr(error.message); setBusy(false); return; }
    setSubmitted(true);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const card = { background: B.white, borderRadius: 14, padding: "28px 28px 24px" };
  const wrap = { minHeight: "100vh", background: B.blue, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };

  return (
    <div style={wrap}>
      <style>{GFONTS}</style>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <YCDILogo height={52} dark={true} />
        </div>
        <div style={card}>
          {checking ? (
            <div style={{ textAlign: "center", color: B.muted, fontSize: 13, padding: "20px 0" }}>Checking your account...</div>
          ) : submitted ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", marginBottom: 8 }}>Request sent</div>
              <div style={{ fontSize: 13, color: B.muted, lineHeight: 1.6, marginBottom: 20 }}>
                Your account is waiting for approval from the National Coordinator. You'll be able to sign in as soon as it's approved. This usually doesn't take long, check back shortly.
              </div>
              <button onClick={signOut} style={{ ...btnP, width: "100%", textAlign: "center" }}>Sign out</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", marginBottom: 8 }}>One more step</div>
              <div style={{ fontSize: 13, color: B.muted, lineHeight: 1.6, marginBottom: 18 }}>
                Your email is confirmed. Tell us your full name so the National Coordinator knows who's asking for access.
              </div>
              <form onSubmit={submit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>Full Name</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inp} placeholder="Your full name" />
                </div>
                {err ? <div style={{ background: B.redLight, color: B.red, borderRadius: 8, padding: "9px 12px", fontSize: 12, marginBottom: 14 }}>{err}</div> : null}
                <button type="submit" disabled={busy} style={{ ...btnP, width: "100%", textAlign: "center", opacity: busy ? 0.6 : 1 }}>
                  {busy ? "Submitting…" : "Request Access"}
                </button>
              </form>
              <button onClick={signOut} style={{ background: "none", border: "none", color: B.muted, fontSize: 12, marginTop: 14, cursor: "pointer", width: "100%", textAlign: "center" }}>
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
