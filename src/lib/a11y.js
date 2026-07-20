// Accessibility bits that more than one screen needs.
//
// Kept as plain values rather than components so they can be dropped into
// the inline style objects the rest of the app already uses, without
// rewriting every screen to use classes.
//
// BATCH6B-MARKER a11y

// Text that a screen reader announces and nobody sees. Not `display:none`
// and not `visibility:hidden`, because both of those remove it from the
// accessibility tree as well, which defeats the purpose. The clip-path
// approach keeps it in the tree and out of the picture.
export const srOnly = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

// Global rules, injected once from App.
//
// The three that matter most, and why:
//
// 1. A visible focus ring. Every interactive thing in this app is styled
//    inline, and several of those styles set `border: none`, which in
//    most browsers takes the default focus ring with it. Anybody driving
//    the hub from a keyboard was moving between invisible positions.
//
// 2. `:focus-visible` rather than `:focus`, so the ring appears for
//    keyboard users and not as a stray outline after every mouse click.
//    The plain `:focus` fallback is there for older browsers that do not
//    know the newer selector, and is overridden immediately after.
//
// 3. Reduced motion. The one animation in the app is the smooth scroll
//    when a notification is opened, and for some people that is not a
//    nicety, it is a headache.
export const A11Y_CSS = `
  :focus { outline: 2px solid #0789BB; outline-offset: 2px; }
  :focus:not(:focus-visible) { outline: none; }
  :focus-visible { outline: 3px solid #0789BB; outline-offset: 2px; border-radius: 4px; }

  /* On the blue header the blue ring is nearly invisible, so it switches
     to yellow, which is a brand colour and clears contrast against blue. */
  .ycdi-onblue :focus-visible { outline-color: #FCDE02; }

  .ycdi-skip {
    position: absolute; left: 8px; top: -60px; z-index: 400;
    background: #FFFFFF; color: #0789BB; padding: 10px 16px;
    border-radius: 0 0 8px 8px; font-weight: 700; font-size: 13px;
    font-family: 'Montserrat', sans-serif; text-decoration: none;
    transition: top 120ms ease-in;
  }
  .ycdi-skip:focus { top: 0; }

  /* Anything you tap should be big enough to hit. 44px is the figure in
     WCAG 2.2 target size. Applied as a minimum rather than a fixed size
     so nothing already larger is shrunk. */
  @media (pointer: coarse) {
    button, a, [role="button"], input[type="checkbox"], input[type="radio"] {
      min-height: 44px;
    }
    /* Buttons sitting inside a line of text are exempt, otherwise every
       inline link pushes its own paragraph apart. */
    p button, p a, li a, .ycdi-inline button, .ycdi-inline a { min-height: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

// True when the person has asked their device for less movement. Used
// before any programmatic smooth scroll, because the CSS rule above
// cannot reach a scroll started from JavaScript.
export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function scrollToTop() {
  if (typeof window === "undefined" || !window.scrollTo) return;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

// A live region needs to exist before the message lands in it, or a
// screen reader has nothing to watch and says nothing. Errors are
// assertive because they usually mean the thing you just tried did not
// happen; everything else is polite and waits its turn.
export function liveRegionProps(type) {
  return type === "error"
    ? { role: "alert", "aria-live": "assertive", "aria-atomic": "true" }
    : { role: "status", "aria-live": "polite", "aria-atomic": "true" };
}
