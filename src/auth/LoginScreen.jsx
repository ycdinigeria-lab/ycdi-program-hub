import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { B } from "../theme.js";
import { returnAddress } from "../lib/authCallback.js";
// BATCH9-MARKER login
import AuthShell, { AuthField, AuthNotice, PasswordInput, authInput, authBtn, authLink } from "./AuthShell.jsx";

// BATCH4C-MARKER login

// Kept out of the component so the wording of each mode is one thing that
// can be read at a glance rather than three conditionals in the markup.
export const MODE_COPY = {
  login: {
    title: "Welcome Back!",
    subtitle: "Sign in to continue your ministry journey.",
    button: "Sign In",
  },
  signup: {
    title: "Create your account",
    subtitle: "Once your email is confirmed, a coordinator approves your access.",
    button: "Create Account",
  },
  reset: {
    title: "Reset your password",
    subtitle: "Enter your email and we will send you a link to choose a new one.",
    button: "Send Reset Email",
  },
};

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
  const copy = MODE_COPY[mode];

  function go(next) {
    setMode(next);
    setErr("");
    setNotice("");
  }

  return (
    <AuthShell title={copy.title} subtitle={copy.subtitle}>
      {linkError && mode === "reset" && !notice ? (
        <AuthNotice tone="error">{linkError}</AuthNotice>
      ) : null}

      {notice ? <AuthNotice>{notice}</AuthNotice> : null}

      <form onSubmit={submit}>
        <AuthField label="Email" icon="mail">
          {(id) => (
            <input
              id={id}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={authInput}
              placeholder="you@example.com"
            />
          )}
        </AuthField>

        {mode !== "reset" ? (
          <AuthField label="Password" icon="lock">
            {(id) => (
              <PasswordInput
                id={id}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            )}
          </AuthField>
        ) : null}

        {mode === "login" ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
            <button type="button" style={authLink} onClick={() => go("reset")}>Forgot password?</button>
          </div>
        ) : <div style={{ height: 4 }} />}

        {err ? <AuthNotice tone="error">{err}</AuthNotice> : null}

        <button type="submit" disabled={busy} style={{ ...authBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Please wait…" : copy.button}
          {busy ? null : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M4 12h15" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
        <div style={{ flex: 1, height: 1, background: B.border }} />
        <span style={{ fontSize: 12, color: B.muted }}>or</span>
        <div style={{ flex: 1, height: 1, background: B.border }} />
      </div>

      <div style={{ textAlign: "center", fontSize: 13, color: B.muted }}>
        {mode === "login" ? (
          <>
            Don't have an account?{" "}
            <button type="button" style={authLink} onClick={() => go("signup")}>Create an account</button>
          </>
        ) : (
          <button type="button" style={authLink} onClick={() => go("login")}>Back to sign in</button>
        )}
      </div>
    </AuthShell>
  );
}
