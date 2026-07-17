// YCDI brand tokens. Keep this file as the single source of truth for
// colour and type so every screen stays visually consistent.

export const B = {
  blue: "#09ADEA", blueDark: "#0789BB", blueLight: "#E6F7FD",
  red: "#D70A29", redLight: "#FDEAED",
  yellow: "#FCDE02", yellowLight: "#FFFDE6",
  black: "#000001", offWhite: "#F2F2F2", white: "#FFFFFF",
  muted: "#5a5a5a", border: "#DCDCDC",
  purple: "#5B2D8E", purpleLight: "#F0E8FA",
  gold: "#BA7517", green: "#1a5c38",
};

export const GFONTS = "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Open+Sans:wght@400;600&display=swap');";

export const inp = { width: "100%", padding: "9px 12px", borderRadius: 6, border: `1px solid ${B.border}`, fontSize: 13, color: B.black, background: B.white, boxSizing: "border-box", fontFamily: "'Open Sans',sans-serif" };
export const sel = { ...inp, appearance: "none" };
export const ta = { ...inp, resize: "vertical", minHeight: 80 };
export const btnP = { background: B.blue, color: B.white, border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" };
export const btnR = { background: B.red, color: B.white, border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" };
export const btnG = { background: "none", border: `1px solid ${B.border}`, borderRadius: 6, padding: "8px 16px", fontSize: 12, color: B.muted, cursor: "pointer", fontFamily: "'Open Sans',sans-serif" };

export const STATUS_CFG = {
  Pending: { bg: "#FFFDE6", text: "#7a5c00", dot: B.yellow },
  Approved: { bg: "#E6F7FD", text: "#065f87", dot: B.blue },
  Live: { bg: "#E8F5E9", text: "#1a6b2f", dot: "#2ecc71" },
  Complete: { bg: "#F2F2F2", text: "#5a5a5a", dot: "#aaa" },
  Returned: { bg: "#FDEAED", text: "#8b0a1c", dot: B.red },
};
