// BATCH9-MARKER auth-shell
//
// One shell behind every screen you can reach without being signed in:
// sign in, create an account, the reset form, the details form after
// confirming an email, and the splash while the session is being checked.
// They were three near-identical copies of the same markup before this,
// which is why changing the look meant editing all three.
//
// The crest appears on its own. No wordmark and no tagline, by request.
import { useState, useId } from "react";
import { B, GFONTS } from "../theme.js";
import { YCDILogo } from "../components/ui.jsx";
import authBg from "../assets/auth-bg.jpg";

export const authCard = {
  background: B.white,
  borderRadius: 20,
  padding: "26px 24px 22px",
  boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
};

export const authBtn = {
  width: "100%",
  background: B.brandDeep,
  color: B.white,
  border: "none",
  borderRadius: 12,
  padding: "14px 18px",
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "'Montserrat',sans-serif",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};

export const authLink = {
  background: "none",
  border: "none",
  padding: 0,
  color: B.brandDeep,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'Open Sans',sans-serif",
};

// The icon block on the left of each field in the design. Decorative, so
// it is hidden from screen readers, which read the label instead.
function IconBox({ children, filled }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 44, minWidth: 44, alignSelf: "stretch",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: filled ? B.brandDeep : "#628C9C",
        color: B.white,
        borderRadius: "11px 0 0 11px",
      }}
    >
      {children}
    </div>
  );
}

export const ICON = {
  mail: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M3 6.5l9 6.5 9-6.5" />
    </svg>
  ),
  lock: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 018 0v3" />
    </svg>
  ),
  user: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.9-3.7 3.7-5.6 7.2-5.6s6.3 1.9 7.2 5.6" />
    </svg>
  ),
};

// A labelled field with the icon block joined to it. The label is a real
// label tied to the control, which is what the Batch 6b accessibility work
// asked for and what the icon on its own cannot do.
export function AuthField({ label, icon, required, hint, children, id }) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={fieldId} style={{ display: "block", fontSize: 13, fontWeight: 700, color: B.brandDeep, marginBottom: 6, fontFamily: "'Montserrat',sans-serif" }}>
        {label}{required ? <span style={{ color: B.red, marginLeft: 3 }}>*</span> : null}
      </label>
      <div style={{ display: "flex", alignItems: "stretch", border: "1px solid " + B.border, borderRadius: 12, overflow: "hidden", background: B.white }}>
        {icon ? <IconBox filled={icon === "lock"}>{ICON[icon]}</IconBox> : null}
        {typeof children === "function" ? children(fieldId) : children}
      </div>
      {hint ? <div style={{ fontSize: 11.5, color: B.muted, marginTop: 5, lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  );
}

// The bare input inside an AuthField. No border of its own, because the
// wrapper draws it around the icon and the input together.
export const authInput = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  padding: "13px 14px",
  fontSize: 14,
  color: B.black,
  background: "transparent",
  fontFamily: "'Open Sans',sans-serif",
};

// A password box with a reveal button, as in the design. The button says
// what it will do rather than only showing an eye, so it is usable without
// seeing the icon.
export function PasswordInput({ id, value, onChange, placeholder, autoComplete, required }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <input
        id={id}
        type={shown ? "text" : "password"}
        required={required}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder || "••••••••"}
        style={authInput}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        style={{ background: "none", border: "none", padding: "0 14px", cursor: "pointer", color: B.muted, display: "flex", alignItems: "center" }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path d="M1.8 12S5.4 5.4 12 5.4 22.2 12 22.2 12 18.6 18.6 12 18.6 1.8 12 1.8 12z" />
          <circle cx="12" cy="12" r="3.1" />
          {shown ? <path d="M4 20L20 4" /> : null}
        </svg>
      </button>
    </>
  );
}

export function AuthNotice({ tone, children }) {
  const cfg = tone === "error"
    ? { bg: B.redLight, fg: B.red }
    : { bg: B.blueLight, fg: B.brandDeep };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{ background: cfg.bg, color: cfg.fg, borderRadius: 10, padding: "11px 13px", fontSize: 12.5, marginBottom: 15, lineHeight: 1.55 }}
    >
      {children}
    </div>
  );
}

export default function AuthShell({ title, subtitle, children, maxWidth }) {
  return (
    <div style={{ minHeight: "100vh", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px 18px", background: B.brandDeepest, fontFamily: "'Open Sans',sans-serif" }}>
      <style>{GFONTS}</style>

      {/* Fixed rather than absolute so a long form scrolls over a still
          photograph instead of dragging it up the screen. */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, backgroundImage: "url(" + authBg + ")", backgroundSize: "cover", backgroundPosition: "center 22%", backgroundRepeat: "no-repeat" }}
      />
      {/* Lighter at the top where the photograph should still read, heavier
          behind the card so the type never has to fight it.

          BATCH11-MARKER auth-brand-wash

          The three stops are one colour at three depths, all of them the
          brand blue with its hue and saturation untouched. Top #055E80,
          middle brandDeep, bottom brandDeepest. Reading down the screen
          it deepens rather than shifting hue, so the wash carries YCDI
          blue over the photograph instead of the neutral navy that was
          here before. */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg, rgba(5,94,128,0.56) 0%, rgba(4,80,108,0.80) 46%, rgba(2,47,64,0.94) 100%)" }}
      />

      <div style={{ position: "relative", width: "100%", maxWidth: maxWidth || 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "inline-block" }}>
            <YCDILogo height={62} dark markOnly />
          </div>
        </div>

        <div style={authCard}>
          {title ? (
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, color: B.brandDeep, fontFamily: "'Montserrat',sans-serif", textAlign: "center", lineHeight: 1.25 }}>
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p style={{ margin: "7px 0 20px", fontSize: 13, color: B.muted, textAlign: "center", lineHeight: 1.55 }}>
              {subtitle}
            </p>
          ) : <div style={{ height: title ? 18 : 0 }} />}
          {children}
        </div>
      </div>
    </div>
  );
}
