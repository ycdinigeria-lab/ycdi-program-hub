import { B, STATUS_CFG } from "../theme.js";
import ycdiCrest from "../assets/ycdi-logo.png";

export function Badge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.Pending;
  return (
    <span style={{ background: s.bg, color: s.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif", display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

export function Avatar({ name, size }) {
  size = size || 34;
  const safe = name || "?";
  const ini = safe.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = (safe.charCodeAt(0) * 47 + (safe.charCodeAt(1) || 0) * 23) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue},55%,40%)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, fontFamily: "'Montserrat',sans-serif" }}>
      {ini}
    </div>
  );
}

export function Card({ children, style }) {
  return <div style={{ background: B.white, border: "1px solid " + B.border, borderRadius: 10, padding: "16px 18px", ...(style || {}) }}>{children}</div>;
}

export function SHead({ children, color }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: color || B.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: "'Montserrat',sans-serif", borderBottom: "1px solid " + B.offWhite, paddingBottom: 6 }}>
      {children}
    </div>
  );
}

export function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>
        {label}{required ? <span style={{ color: B.red, marginLeft: 3 }}>*</span> : null}
      </label>
      {children}
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

export function MiniBar({ value, max }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div style={{ flex: 1, height: 6, background: B.offWhite, borderRadius: 3 }}>
      <div style={{ width: pct + "%", height: "100%", background: B.blue, borderRadius: 3 }} />
    </div>
  );
}

export function Toast({ msg, type }) {
  const bg = type === "warning" ? "#d97706" : type === "error" ? B.red : B.blue;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, background: bg, color: B.white, padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, maxWidth: 360 }}>
      {msg}
    </div>
  );
}

export function YCDILogo({ height, dark, markOnly }) {
  height = height || 36;
  const img = <img src={ycdiCrest} alt="YCDI" style={{ height, width: "auto", display: "block", flexShrink: 0 }} />;
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
