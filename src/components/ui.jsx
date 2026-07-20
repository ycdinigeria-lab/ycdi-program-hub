import { useId, cloneElement, isValidElement } from "react";
import { B, STATUS_CFG } from "../theme.js";
import { srOnly, liveRegionProps } from "../lib/a11y.js";
import ycdiCrest from "../assets/ycdi-logo.png";

// BATCH6B-MARKER ui-a11y
//
// The changes in this file are all about what the app is like without a
// mouse or without sight. Nothing here changes how anything looks.

export function Badge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.Pending;
  return (
    <span style={{ background: s.bg, color: s.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif", display: "inline-flex", alignItems: "center", gap: 5 }}>
      {/* The dot repeats the word next to it in colour form. Colour alone
          is not information, and read aloud it is noise. */}
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

export function Avatar({ name, size, decorative }) {
  size = size || 34;
  const safe = name || "?";
  const ini = safe.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = (safe.charCodeAt(0) * 47 + (safe.charCodeAt(1) || 0) * 23) % 360;
  // Initials sitting beside the same person's printed name are decoration
  // and get hidden; standing on their own they are the only label there
  // is, so they announce the full name rather than two stray letters.
  const label = decorative
    ? { "aria-hidden": "true" }
    : { role: "img", "aria-label": safe };
  return (
    <div {...label} style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue},55%,40%)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, fontFamily: "'Montserrat',sans-serif" }}>
      {ini}
    </div>
  );
}

export function Card({ children, style }) {
  return <div style={{ background: B.white, border: "1px solid " + B.border, borderRadius: 10, padding: "16px 18px", ...(style || {}) }}>{children}</div>;
}

export function SHead({ children, color, as }) {
  // Headings were styled divs, so a screen reader saw one heading on the
  // whole page. `as` lets a screen say what level this actually is.
  const Tag = as || "h2";
  return (
    <Tag style={{ fontSize: 11, fontWeight: 700, color: color || B.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px", fontFamily: "'Montserrat',sans-serif", borderBottom: "1px solid " + B.offWhite, paddingBottom: 6 }}>
      {children}
    </Tag>
  );
}

// The label and its field are now genuinely joined, rather than sitting
// next to each other and looking joined.
//
// Every caller passes a single input, select or textarea as its child, so
// the id is generated here and pushed onto that child. A caller that
// already set its own id keeps it. A caller passing something this cannot
// attach to still renders; it just does not gain the link.
export function Field({ label, children, required, hint }) {
  const auto = useId();
  const hintId = hint ? auto + "-hint" : undefined;
  let control = children;
  let controlId = auto;

  if (isValidElement(children)) {
    controlId = children.props.id || auto;
    control = cloneElement(children, {
      id: controlId,
      "aria-required": required ? "true" : undefined,
      "aria-describedby": [children.props["aria-describedby"], hintId].filter(Boolean).join(" ") || undefined,
    });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={controlId} style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" style={{ color: B.red, marginLeft: 3 }}>*</span>
            <span style={srOnly}> required</span>
          </>
        ) : null}
      </label>
      {control}
      {hint ? (
        <div id={hintId} style={{ fontSize: 11.5, color: B.muted, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>
      ) : null}
    </div>
  );
}

export function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: B.white, border: "1px solid " + B.border, borderRadius: 8, padding: "14px 16px", flex: "1 1 130px", borderTop: "3px solid " + (accent || B.blue) }}>
      <div style={{ fontSize: 11, color: B.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || B.blue, fontFamily: "'Montserrat',sans-serif" }}>{value}</div>
    </div>
  );
}

export function MiniBar({ value, max, label }) {
  const safeMax = Math.max(max, 1);
  const pct = Math.min(100, Math.round((value / safeMax) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label || undefined}
      style={{ flex: 1, height: 6, background: B.offWhite, borderRadius: 3 }}
    >
      <div style={{ width: pct + "%", height: "100%", background: B.blue, borderRadius: 3 }} />
    </div>
  );
}

export function Toast({ msg, type }) {
  const bg = type === "warning" ? "#d97706" : type === "error" ? B.red : B.blue;
  // Announced as well as shown. A toast that only appears in the corner
  // is invisible to anybody not looking at the corner.
  return (
    <div {...liveRegionProps(type)} style={{ position: "fixed", bottom: 24, right: 24, background: bg, color: B.white, padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, maxWidth: 360 }}>
      {msg}
    </div>
  );
}

export function YCDILogo({ height, dark, markOnly }) {
  height = height || 36;
  // The wordmark next to the crest already says YCDI, so on the full lockup
  // the picture is decoration. On its own it carries the name.
  const img = (
    <img
      src={ycdiCrest}
      alt={markOnly ? "YCDI" : ""}
      aria-hidden={markOnly ? undefined : "true"}
      style={{ height, width: "auto", display: "block", flexShrink: 0 }}
    />
  );
  // The crest contains the same blue as our blue surfaces, so on dark/blue
  // backgrounds it sits on a white badge to stay fully visible.
  const mark = dark ? (
    <div style={{ background: B.white, borderRadius: Math.round(height * 0.22), padding: Math.round(height * 0.12), display: "flex", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", flexShrink: 0 }}>
      {img}
    </div>
  ) : img;
  if (markOnly) return mark;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(height * 0.28) }}>
      {mark}
      <div style={{ lineHeight: 1.12 }}>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: Math.round(height * 0.44), color: dark ? B.white : B.blue, letterSpacing: "0.02em" }}>YCDI</div>
        <div style={{ fontFamily: "'Open Sans',sans-serif", fontSize: Math.max(8, Math.round(height * 0.19)), color: dark ? "rgba(255,255,255,0.72)" : B.muted, marginTop: 1 }}>Young Christian Development Initiative</div>
      </div>
    </div>
  );
}
