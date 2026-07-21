import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, btnP } from "../theme.js";
// BATCH9-MARKER setpassword-shell
import AuthShell from "./AuthShell.jsx";
import { Card, SHead, Field } from "../components/ui.jsx";
import { clearAuthCallbackFromUrl } from "../lib/authCallback.js";
import { humanise } from "../lib/errors.js";

// One screen, two jobs. Arriving on a reset link shows it full page and
// nothing else is reachable until a password is chosen. Opening it from
// More shows it as an ordinary card.
//
// BATCH4C-MARKER setpassword

export const MIN_LENGTH = 8;

// Kept separate from the component so the rules can be tested without a
// browser, and so there is one answer rather than one per screen.
export function passwordProblem(pw, confirm) {
  if (!pw) return "Enter a new password.";
  if (pw.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters. Longer is better than complicated.`;
  if (pw !== confirm) return "The two passwords do not match.";
  return "";
}

export default function SetPasswordScreen({ recovery, email, onDone, onCancel, showToast }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Nothing is said about the password until they have finished typing
  // both boxes, so it does not nag while somebody is halfway through.
  const touched = pw.length > 0 && confirm.length > 0;
  const problem = passwordProblem(pw, confirm);

  async function save(e) {
    if (e) e.preventDefault();
    const p = passwordProblem(pw, confirm);
    if (p) { setErr(p); return; }
    setBusy(true); setErr("");

    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setErr(humanise(error.message)); setBusy(false); return; }

    // The token in the address bar has been spent. Get it out of the URL so
    // a screenshot or a shared link cannot carry it any further.
    clearAuthCallbackFromUrl();
    setBusy(false);
    setPw(""); setConfirm("");
    if (showToast) showToast("Password updated. Use it next time you sign in.");
    if (onDone) onDone();
  }

  const form = (
    <form onSubmit={save}>
      <Field label="New password" required>
        <input
          type={reveal ? "text" : "password"}
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(""); }}
          style={inp}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </Field>
      <Field label="Type it again" required>
        <input
          type={reveal ? "text" : "password"}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setErr(""); }}
          style={inp}
          autoComplete="new-password"
        />
      </Field>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: B.muted, marginBottom: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
        Show what I am typing
      </label>

      {err || (touched && problem) ? (
        <div style={{ background: B.redLight, color: B.red, borderRadius: 8, padding: "9px 12px", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          {err || problem}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        style={{ ...btnP, width: "100%", textAlign: "center", opacity: busy ? 0.6 : 1, fontSize: 14, padding: 12 }}
      >
        {busy ? "Saving…" : recovery ? "Save and continue" : "Change password"}
      </button>
    </form>
  );

  if (!recovery) {
    return (
      <Card>
        <SHead color={B.blue}>Change your password</SHead>
        <p style={{ margin: "0 0 18px", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
          You will stay signed in on this device. Anywhere else you are signed in will keep working until you sign out there.
        </p>
        {form}
      </Card>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Once it is saved you will go straight into the hub.">
      <>
          {email ? (
            <p style={{ margin: "0 0 18px", fontSize: 12.5, color: B.muted, lineHeight: 1.6, textAlign: "center" }}>
              Setting a new password for <strong style={{ color: B.black }}>{email}</strong>.
            </p>
          ) : null}
          {form}

          {onCancel ? (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={onCancel}
                style={{ background: "none", border: "none", color: B.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "'Open Sans',sans-serif" }}
              >
                Cancel and sign out
              </button>
            </div>
          ) : null}
      </>
    </AuthShell>
  );
}
