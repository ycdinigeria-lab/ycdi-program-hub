// BATCH41-MARKER ui-foundation
//
// Spacing and type scale for the hub, kept beside theme.js so there is one
// place to look. Colour is not repeated here: theme.js stays the single
// source for that, and the stylesheet in lib/hubCss.js reads it from there.
//
// Spacing runs on an 8px rhythm with a 4px half-step for tight spots.

export const SP = {
  micro: 4,
  tight: 8,
  compact: 12,
  normal: 16,
  section: 24,
  large: 32,
  major: 40,
  page: 48,
};

// Sizes in px. The page title is fluid in the stylesheet (22px on a phone,
// 28px on a desktop); the numbers here are for inline styles that need to
// agree with it.
export const TYPE = {
  pageTitle: 28,
  pageTitleMobile: 22,
  section: 20,
  sectionMobile: 18,
  cardTitle: 16,
  body: 14,
  meta: 13,
  label: 13,
  caption: 12,
};

export const RADIUS = { control: 8, card: 12, pill: 999 };
