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
  // BATCH11-MARKER brand-deep
  //
  // The signed-out screens used to sit on a navy that was openly not a
  // brand colour, chosen in Batch 9 because #09ADEA is far too light to
  // carry white type. That reasoning still holds, so the fix is not to
  // use the brand blue as it is. These two are the brand blue itself,
  // hue 196 and saturation 93 held exactly, taken down in lightness
  // until white type sits on them properly. Same colour, less light.
  //
  //   brandDeep     white on it 8.9:1, and 8.9:1 as type on white
  //   brandDeepest  white on it 14.2:1, the surface behind the photograph
  //
  // Both were measured rather than judged by eye. #09ADEA as type on
  // white is 2.6:1 and #0789BB is 4.0:1, which is why neither is used
  // for words anywhere on these screens even though both are brand.
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
  Approved: { bg: "#E6F7FD", text: "#065f87", dot: B.blue },
  Live: { bg: "#E8F5E9", text: "#1a6b2f", dot: "#2ecc71" },
  Complete: { bg: "#F2F2F2", text: "#5a5a5a", dot: "#aaa" },
  Returned: { bg: "#FDEAED", text: "#8b0a1c", dot: B.red },
};
