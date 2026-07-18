import { useState, useEffect } from "react";

// Returns true on narrow screens. Re-checks on both resize and rotation so
// turning the phone sideways drops straight back to the full wide layout
// instead of staying stuck in the narrow one.
export function useIsMobile(breakpoint = 760) {
  const read = () => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia) return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
    return window.innerWidth <= breakpoint;
  };

  const [mobile, setMobile] = useState(read);

  useEffect(() => {
    const update = () => setMobile(read());

    // Some phones report the old width for a moment right after a rotation,
    // so re-check once more shortly after to catch the settled value.
    const updateSoon = () => { update(); setTimeout(update, 150); };

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", updateSoon);

    let mq;
    if (window.matchMedia) {
      mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
      if (mq.addEventListener) mq.addEventListener("change", update);
      else if (mq.addListener) mq.addListener(update);
    }

    update();

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", updateSoon);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener("change", update);
        else if (mq.removeListener) mq.removeListener(update);
      }
    };
  }, [breakpoint]);

  return mobile;
}
