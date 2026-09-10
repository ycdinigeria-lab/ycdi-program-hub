// YCDI brand tokens. Keep this file as the single source of truth for
// colour and type so every screen stays visually consistent.
//
// Aligned to the public website (ycdinigeria.netlify.app) so the hub and
// the site read as one YCDI. The website leads with a deep teal that
// carries white type properly, and keeps the bright #09ADEA only as a
// light accent. The hub now does the same: the lead blue below is that
// teal, and the old bright blue survives as the light tint. Red, yellow
// and the Montserrat / Open Sans pairing already matched the site and are
// untouched. Neutrals warm slightly to match the site's paper and ink.
//
// Two deliberate near-misses, both noted inline: the page surface takes
// the site's warm hero cream rather than its cooler section grey, and
// muted text is held a shade darker than the site's #8A8B8F so the hub's
// many small labels stay comfortably readable.

export const B = {
  // Lead teal (was #09ADEA). White type sits on it at ~6.5:1.
  blue: "#075B7D", blueDark: "#054A66",
  // Light accent tint, the site's --blue-tint (the bright-blue family).
  blueLight: "#EAF6FC",
  red: "#D70A29", redLight: "#FDEAED",
  yellow: "#FCDE02", yellowLight: "#FFFDE6",
  // Warm ink and warm paper, matching the site's --ink and hero --cream.
  black: "#2D0209", offWhite: "#FAF6F0", white: "#FFFFFF",
  // Site muted is #8A8B8F; held at #6B6D72 for label readability.
  muted: "#6B6D72", border: "#E7E8EA",
  purple: "#5B2D8E", purpleLight: "#F0E8FA",
  gold: "#BA7517", green: "#1a5c38",
  // Deep surfaces for the signed-out screens, where white type sits on a
  // solid colour behind the photograph. Left unchanged by the alignment:
  // they already sit in the deep-teal family and their white-on-colour
  // contrast was measured (brandDeep 8.9:1, brandDeepest 14.2:1). The
  // lead blue is now deep enough for type on its own, so these stay as the
  // darker surfaces beneath it rather than a workaround for a light blue.
  brandDeep: "#04506C", brandDeepest: "#022F40",
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
  Approved: { bg: "#EAF6FC", text: "#065f87", dot: B.blue },
  Live: { bg: "#E8F5E9", text: "#1a6b2f", dot: "#2ecc71" },
  Complete: { bg: "#F1EEE9", text: "#6B6D72", dot: "#aaa" },
  Returned: { bg: "#FDEAED", text: "#8b0a1c", dot: B.red },
};
