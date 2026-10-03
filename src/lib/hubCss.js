import { B } from "../theme.js";
import { SP, RADIUS } from "../tokens.js";

// BATCH41-MARKER ui-foundation
//
// The hub styles almost everything inline, and inline styles cannot do
// hover, focus, animation or media queries. This is the one stylesheet for
// those things, injected from App the same way A11Y_CSS is. Colours come
// straight from theme.js, so changing the palette there changes it here.
//
// Every class is prefixed `hub-` so it cannot collide with the older
// `rcol1` / `ncsplit` helper classes already living in App.
//
// Motion is 150 to 250ms and switches off for anybody who has asked their
// device for reduced motion.

export const HUB_CSS = `
  :root {
    --hub-blue: ${B.blue};
    --hub-blue-dark: ${B.blueDark};
    --hub-blue-light: ${B.blueLight};
    --hub-red: ${B.red};
    --hub-red-light: ${B.redLight};
    --hub-ink: ${B.black};
    --hub-muted: ${B.muted};
    --hub-border: ${B.border};
    --hub-paper: ${B.offWhite};
    --hub-white: ${B.white};
    --hub-radius-control: ${RADIUS.control}px;
    --hub-radius-card: ${RADIUS.card}px;
    --hub-shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 4px 12px rgba(16, 24, 40, 0.06);
    --hub-shadow-lift: 0 2px 4px rgba(16, 24, 40, 0.06), 0 10px 24px rgba(16, 24, 40, 0.10);
    --hub-dur: 180ms;
  }

  /* ---------- Buttons ---------- */
  .hub-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: ${SP.tight}px;
    min-height: 40px; padding: 0 20px; border-radius: var(--hub-radius-control);
    border: 1px solid transparent; font-family: 'Montserrat', sans-serif;
    font-size: 13px; font-weight: 700; line-height: 1.2; cursor: pointer;
    text-decoration: none; white-space: nowrap;
    transition: background-color var(--hub-dur) ease, border-color var(--hub-dur) ease,
                box-shadow var(--hub-dur) ease, color var(--hub-dur) ease;
  }
  .hub-btn:disabled, .hub-btn[aria-disabled="true"] { opacity: 0.55; cursor: not-allowed; }
  .hub-btn--primary { background: var(--hub-blue); color: var(--hub-white); }
  .hub-btn--primary:hover:not(:disabled) { background: var(--hub-blue-dark); box-shadow: var(--hub-shadow); }
  .hub-btn--secondary { background: var(--hub-white); color: var(--hub-ink); border-color: var(--hub-border); }
  .hub-btn--secondary:hover:not(:disabled) { background: var(--hub-paper); border-color: #cfd2d6; }
  .hub-btn--outline { background: var(--hub-white); color: var(--hub-blue); border-color: var(--hub-blue); }
  .hub-btn--outline:hover:not(:disabled) { background: var(--hub-blue-light); }
  .hub-btn--tertiary { background: transparent; color: var(--hub-muted); padding: 0 12px; }
  .hub-btn--tertiary:hover:not(:disabled) { color: var(--hub-ink); background: var(--hub-paper); }
  .hub-btn--danger { background: var(--hub-white); color: var(--hub-red); border-color: var(--hub-red); }
  .hub-btn--danger:hover:not(:disabled) { background: var(--hub-red-light); }
  .hub-btn--block { width: 100%; }
  .hub-btn--sm { min-height: 34px; padding: 0 14px; font-size: 12px; }

  /* A row of buttons sits side by side on a desktop and stacks, full width,
     on a phone where a thumb needs the room. */
  .hub-actions { display: flex; gap: ${SP.compact}px; flex-wrap: wrap; align-items: center; }

  /* ---------- Cards ---------- */
  .hub-card { background: var(--hub-white); border: 1px solid var(--hub-border); border-radius: var(--hub-radius-card); padding: 20px; }
  .hub-card--elevated { border-color: transparent; box-shadow: var(--hub-shadow); }
  .hub-card--highlight { background: var(--hub-blue-light); border-color: #cbe7f4; }
  .hub-card--attention { background: ${B.redLight}; border-color: #f4c3cb; }
  .hub-card--plain { background: transparent; border: none; padding: 0; }
  .hub-card--interactive { cursor: pointer; transition: border-color var(--hub-dur) ease, box-shadow var(--hub-dur) ease, transform var(--hub-dur) ease; }
  .hub-card--interactive:hover { border-color: var(--hub-blue); box-shadow: var(--hub-shadow-lift); }

  /* ---------- Page header ---------- */
  .hub-ph { display: flex; align-items: flex-start; justify-content: space-between; gap: ${SP.normal}px; flex-wrap: wrap; margin-bottom: ${SP.section}px; }
  .hub-ph-title { margin: 0; font-family: 'Montserrat', sans-serif; font-weight: 700; color: var(--hub-ink); font-size: 22px; line-height: 1.2; }
  .hub-ph-desc { margin: 6px 0 0; color: var(--hub-muted); font-size: 14px; line-height: 1.5; max-width: 62ch; }
  .hub-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 6px 0; margin-bottom: ${SP.compact}px; color: var(--hub-muted); font-size: 13px; cursor: pointer; font-family: 'Open Sans', sans-serif; transition: color var(--hub-dur) ease; }
  .hub-back:hover { color: var(--hub-ink); }
  @media (min-width: 761px) { .hub-ph-title { font-size: 28px; } }

  /* ---------- Empty and loading states ---------- */
  .hub-empty { text-align: center; padding: ${SP.major}px ${SP.normal}px; }
  .hub-empty-icon { width: 52px; height: 52px; border-radius: 50%; background: var(--hub-blue-light); color: var(--hub-blue); display: inline-flex; align-items: center; justify-content: center; margin-bottom: ${SP.compact}px; }
  .hub-empty-title { margin: 0 0 4px; font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 700; color: var(--hub-ink); }
  .hub-empty-text { margin: 0 auto ${SP.normal}px; color: var(--hub-muted); font-size: 14px; line-height: 1.5; max-width: 44ch; }

  .hub-skel { display: block; border-radius: 6px; background: linear-gradient(90deg, #eceef0 25%, #f6f7f8 37%, #eceef0 63%); background-size: 400% 100%; animation: hubShimmer 1.4s ease infinite; }
  @keyframes hubShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

  /* ---------- Entrance motion ---------- */
  .hub-fade-in { animation: hubFade 220ms ease-out both; }
  @keyframes hubFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .hub-toast { animation: hubToast 220ms ease-out both; }
  @keyframes hubToast { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

  /* ---------- Header user menu ---------- */
  .hub-menu-wrap { position: relative; }
  .hub-menu-trigger { display: flex; align-items: center; gap: 9px; background: none; border: none; padding: 4px 8px; border-radius: var(--hub-radius-control); cursor: pointer; transition: background-color var(--hub-dur) ease; }
  .hub-menu-trigger:hover, .hub-menu-trigger[aria-expanded="true"] { background: var(--hub-paper); }
  .hub-menu-panel { position: absolute; right: 0; top: calc(100% + 8px); min-width: 220px; background: var(--hub-white); border: 1px solid var(--hub-border); border-radius: 10px; box-shadow: var(--hub-shadow-lift); padding: 6px; z-index: 120; animation: hubFade 160ms ease-out both; }
  .hub-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 0 12px; background: none; border: none; border-radius: 6px; font-size: 13px; color: var(--hub-ink); cursor: pointer; text-align: left; font-family: 'Open Sans', sans-serif; transition: background-color var(--hub-dur) ease; }
  .hub-menu-item:hover { background: var(--hub-paper); }

  /* ---------- Phones ---------- */
  @media (max-width: 760px) {
    .hub-btn { min-height: 44px; }
    .hub-btn--sm { min-height: 44px; }
    .hub-actions { flex-direction: column; align-items: stretch; }
    .hub-actions > .hub-btn { width: 100%; }
    .hub-card { padding: 16px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hub-btn, .hub-card--interactive, .hub-back, .hub-menu-trigger, .hub-menu-item { transition: none; }
    .hub-skel, .hub-fade-in, .hub-toast, .hub-menu-panel { animation: none; }
  }
`;
