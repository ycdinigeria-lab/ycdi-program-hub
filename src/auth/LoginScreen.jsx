import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { B, GFONTS, inp, btnP } from "../theme.js";
import { YCDILogo } from "../components/ui.jsx";
import { returnAddress } from "../lib/authCallback.js";

// BATCH4C-MARKER login

export default function LoginScreen({ linkError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  // Arriving from a dead reset link opens straight onto the reset form
  // with an explanation, rather than dumping somebody on a sign-in box
  // they already know they cannot get past.
  const [mode, setMode] = useState(linkError ? "reset" : "login"); // login | signup | reset

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setNotice("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setBusy(false); return; }
    // onAuthStateChange in App.jsx picks this up automatically.
  }

  async function handleSignup(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setNotice("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: returnAddress() },
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    setBusy(false);
    setMode("login");
    setNotice("Account created. Check your email to confirm your account, then sign in.");
  }

  async function handleReset(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setNotice("");
    // Without this the link goes wherever the Supabase dashboard's Site
    // URL points, which for a long time was http://localhost:3000, so
    // every reset email sent people to their own machine. Working it out
    // from the current address means it follows the app across domains
    // instead of needing a dashboard change every time.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: returnAddress(),
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    setBusy(false);
    setNotice("Reset email sent to " + email + ". The link works once and lasts an hour. Check your spam folder if it does not arrive within a few minutes.");
  }

  const submit = mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleReset;
  const buttonLabel = mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Email";

  return (
    <div style={{ minHeight: "100vh", background: B.blue, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{GFONTS}</style>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <YCDILogo height={52} dark={true} />
          <div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Programme Operations and Spiritual Ministry Hub</div>
        </div>

        <div style={{ background: B.white, borderRadius: 14, padding: "28px 28px 24px" }}>
          {linkError && mode === "reset" && !notice ? (
            <div style={{ background: B.redLight, color: B.red, borderRadius: 8, padding: "10px 12px", fontSize: 12, marginBottom: 16, lineHeight: 1.55 }}>
              {linkError}
            </div>
          ) : null}

          {notice ? (
            <div style={{ background: B.blueLight, color: B.blueDark, borderRadius: 8, padding: "10px 12px", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>{notice}</div>
          ) : null}

          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inp} placeholder="you@example.com" />
            </div>

            {mode !== "reset" ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>Password</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inp} placeholder="••••••••" />
              </div>
            ) : null}

            {err ? <div style={{ background: B.redLight, color: B.red, borderRadius: 8, padding: "9px 12px", fontSize: 12, marginBottom: 14 }}>{err}</div> : null}

            <button type="submit" disabled={busy} style={{ ...btnP, width: "100%", textAlign: "center", opacity: busy ? 0.6 : 1, fontSize: 14, padding: 12 }}>
              {busy ? "Please wait…" : buttonLabel}
            </button>
          </form>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 12 }}>
            {mode === "login" ? (
              <>
                <span style={{ color: B.blue, cursor: "pointer", fontWeight: 600 }} onClick={() => { setMode("signup"); setErr(""); setNotice(""); }}>Create an account</span>
                <span style={{ color: B.muted, cursor: "pointer" }} onClick={() => { setMode("reset"); setErr(""); setNotice(""); }}>Forgot password?</span>
              </>
            ) : (
              <span style={{ color: B.blue, cursor: "pointer", fontWeight: 600 }} onClick={() => { setMode("login"); setErr(""); setNotice(""); }}>Back to sign in</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
