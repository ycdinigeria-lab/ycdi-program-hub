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


  /* ---------- Notices and metrics ---------- */
  .hub-card--notice { background: ${B.yellowLight}; border-color: #efe27a; }

  .hub-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: ${SP.compact}px; margin-bottom: ${SP.section}px; }
  .hub-metric { display: flex; flex-direction: column; gap: 4px; text-align: left; width: 100%; background: var(--hub-white); border: 1px solid var(--hub-border); border-radius: var(--hub-radius-card); padding: 14px 16px; font-family: 'Open Sans', sans-serif; color: var(--hub-ink); }
  button.hub-metric { cursor: pointer; transition: border-color var(--hub-dur) ease, box-shadow var(--hub-dur) ease, background-color var(--hub-dur) ease; }
  button.hub-metric:hover { border-color: var(--hub-blue); box-shadow: var(--hub-shadow); }
  .hub-metric[aria-pressed="true"] { border-color: var(--hub-blue); background: var(--hub-blue-light); }
  .hub-metric-value { font-family: 'Montserrat', sans-serif; font-size: 26px; font-weight: 700; line-height: 1.1; color: var(--hub-ink); }
  .hub-metric-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--hub-muted); }
  .hub-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

  /* ---------- Section headings ---------- */
  .hub-section-title { margin: 0 0 ${SP.compact}px; font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 700; line-height: 1.3; color: var(--hub-ink); }
  .hub-section-head { display: flex; align-items: center; justify-content: space-between; gap: ${SP.compact}px; flex-wrap: wrap; margin-bottom: ${SP.compact}px; }
  .hub-section-head .hub-section-title { margin: 0; }
  .hub-eyebrow { margin: 0 0 6px; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--hub-muted); }
  .hub-muted { color: var(--hub-muted); }

  /* ---------- Attention panel ---------- */
  .hub-attn { margin-bottom: ${SP.section}px; }
  .hub-attn-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .hub-attn-head .hub-section-title { margin: 0; }
  .hub-attn-item { display: flex; align-items: center; justify-content: space-between; gap: ${SP.normal}px; padding: 12px 0; border-top: 1px solid rgba(0, 0, 0, 0.08); }
  .hub-attn-item:first-of-type { border-top: none; }
  .hub-attn-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--hub-ink); }
  .hub-attn-sub { margin: 2px 0 0; font-size: 13px; color: var(--hub-muted); }
  .hub-attn-note { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: #5a0a13; }
  .hub-caught { display: flex; align-items: center; gap: ${SP.compact}px; }
  .hub-caught-icon { width: 40px; height: 40px; border-radius: 50%; background: #e8f5ec; color: ${B.green}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .hub-attn.hub-card { margin-bottom: ${SP.section}px; }

  /* ---------- Search, chips and the programme list ---------- */
  .hub-toolbar { display: flex; flex-direction: column; gap: ${SP.compact}px; margin-bottom: ${SP.normal}px; }
  .hub-search { position: relative; }
  .hub-search input { width: 100%; min-height: 42px; padding: 0 12px 0 38px; border: 1px solid var(--hub-border); border-radius: var(--hub-radius-control); background: var(--hub-white); color: var(--hub-ink); font-family: 'Open Sans', sans-serif; font-size: 14px; }
  .hub-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--hub-muted); pointer-events: none; display: inline-flex; }
  .hub-chips { display: flex; flex-wrap: wrap; gap: ${SP.tight}px; }
  .hub-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--hub-border); background: var(--hub-white); color: var(--hub-ink); font-family: 'Open Sans', sans-serif; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background-color var(--hub-dur) ease, border-color var(--hub-dur) ease, color var(--hub-dur) ease; }
  .hub-chip:hover { border-color: var(--hub-blue); }
  .hub-chip[aria-pressed="true"] { background: var(--hub-blue); border-color: var(--hub-blue); color: var(--hub-white); }
  .hub-chip-count { font-size: 11.5px; font-weight: 400; opacity: 0.85; }
  .hub-results { margin: 0 0 ${SP.compact}px; font-size: 12.5px; color: var(--hub-muted); }
  .hub-list { display: flex; flex-direction: column; gap: ${SP.compact}px; }

  .hub-prog { position: relative; display: flex; flex-direction: column; gap: 10px; }
  .hub-prog-top { display: flex; align-items: flex-start; justify-content: space-between; gap: ${SP.compact}px; }
  .hub-prog-title { margin: 0; font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 700; line-height: 1.3; color: var(--hub-ink); overflow-wrap: anywhere; }
  .hub-prog-link { background: none; border: none; padding: 0; margin: 0; text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .hub-prog-link::after { content: ""; position: absolute; inset: 0; border-radius: var(--hub-radius-card); }
  .hub-prog:has(.hub-prog-link:focus-visible) { outline: 3px solid #0789BB; outline-offset: 2px; }
  .hub-prog-sub { margin-top: 2px; font-size: 13px; color: var(--hub-muted); }
  .hub-prog-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--hub-muted); }
  .hub-prog-meta > span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .hub-prog-foot { display: flex; align-items: center; justify-content: space-between; gap: ${SP.compact}px; min-height: 20px; }
  .hub-prog-action { position: relative; z-index: 1; }
  .hub-prog-view { display: inline-flex; align-items: center; gap: 2px; margin-left: auto; font-family: 'Montserrat', sans-serif; font-size: 12.5px; font-weight: 700; color: var(--hub-blue); }

  /* ---------- Programme detail ---------- */
  .hub-ph-meta { margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .hub-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--hub-border); border: 1px solid var(--hub-border); border-radius: var(--hub-radius-card); overflow: hidden; margin-bottom: ${SP.section}px; }
  .hub-fact { background: var(--hub-white); padding: 14px 18px; min-width: 0; }
  .hub-fact-value { margin: 0; font-size: 16px; font-weight: 600; color: var(--hub-ink); overflow-wrap: anywhere; }
  .hub-fact-value--empty { font-weight: 400; color: var(--hub-muted); }
  .hub-detail-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: ${SP.normal}px; align-items: start; margin-bottom: ${SP.normal}px; }
  .hub-stack { display: flex; flex-direction: column; gap: ${SP.normal}px; min-width: 0; }
  .hub-prose { margin: 0 0 10px; font-size: 14px; line-height: 1.7; color: var(--hub-ink); overflow-wrap: anywhere; }
  .hub-prose:last-child { margin-bottom: 0; }
  .hub-people { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: ${SP.tight}px; }
  .hub-person { display: inline-flex; align-items: center; gap: 8px; padding: 5px 14px 5px 5px; background: var(--hub-paper); border-radius: 999px; font-size: 13px; color: var(--hub-ink); }
  .hub-check { display: flex; gap: ${SP.compact}px; padding: 12px 0; border-top: 1px solid var(--hub-paper); }
  .hub-check:first-of-type { border-top: none; padding-top: 0; }
  .hub-check-badge { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .hub-check-name { margin: 0; font-family: 'Montserrat', sans-serif; font-size: 13.5px; font-weight: 700; color: var(--hub-ink); }
  .hub-check-detail { margin: 2px 0 0; font-size: 13px; color: var(--hub-ink); }
  .hub-check-q { margin: 2px 0 0; font-size: 12px; line-height: 1.5; color: var(--hub-muted); }
  .hub-quote { margin: 8px 0 0; font-size: 14px; line-height: 1.6; color: #5a0a13; }

  /* ---------- Dialogs: a centred box on a desktop, a sheet from the bottom on a phone ---------- */
  .hub-modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15, 23, 42, 0.5); animation: hubBackdrop 180ms ease-out both; }
  @keyframes hubBackdrop { from { opacity: 0; } to { opacity: 1; } }
  .hub-modal { width: 100%; max-width: 520px; max-height: calc(100vh - 48px); overflow-y: auto; background: var(--hub-white); border-radius: 14px; box-shadow: var(--hub-shadow-lift); animation: hubModalIn 200ms ease-out both; }
  @keyframes hubModalIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
  @keyframes hubSheetIn { from { transform: translateY(100%); } to { transform: none; } }
  .hub-modal-head { display: flex; align-items: center; justify-content: space-between; gap: ${SP.compact}px; padding: 14px 16px 14px 24px; border-bottom: 1px solid var(--hub-border); }
  .hub-modal-title { margin: 0; font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 700; color: var(--hub-ink); }
  .hub-modal-close { min-height: 40px; padding: 0 10px; }
  .hub-modal-body { padding: 20px 24px; }
  .hub-modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 0 24px 20px; }

  /* ---------- Phones ---------- */
  @media (max-width: 760px) {
    .hub-btn { min-height: 44px; }
    .hub-btn--sm { min-height: 44px; }
    .hub-actions { flex-direction: column; align-items: stretch; }
    .hub-actions > .hub-btn { width: 100%; }
    .hub-card { padding: 16px; }
    .hub-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hub-chip { min-height: 44px; }
    .hub-search input { min-height: 44px; }
    .hub-attn-item { flex-direction: column; align-items: stretch; }
    .hub-attn-item .hub-btn { width: 100%; }
    .hub-detail-grid { grid-template-columns: minmax(0, 1fr); }
    .hub-modal-backdrop { align-items: flex-end; padding: 0; }
    .hub-modal { max-width: none; max-height: 92vh; border-radius: 16px 16px 0 0; animation-name: hubSheetIn; }
    .hub-modal-close { min-height: 44px; min-width: 44px; }
    .hub-modal-body { padding: 18px 16px; }
    .hub-modal-foot { flex-direction: column-reverse; padding: 0 16px 20px; }
    .hub-modal-foot > .hub-btn { width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hub-btn, .hub-card--interactive, .hub-back, .hub-menu-trigger, .hub-menu-item, .hub-chip, button.hub-metric { transition: none; }
    .hub-skel, .hub-fade-in, .hub-toast, .hub-menu-panel, .hub-modal-backdrop, .hub-modal { animation: none; }
  }
`;
