// A repeating check that stops while the tab is in the background and runs
// once straight away when it comes back.
//
// The old intervals carried on every twenty seconds with the phone in a
// pocket and the screen off. On a metered Nigerian connection that is data
// and battery spent on an answer nobody is looking at.
//
// BATCH4-MARKER poll

import { useEffect, useRef } from "react";

export function useVisiblePoll(fn, ms) {
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; }, [fn]);

  useEffect(() => {
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => { if (!timer) timer = setInterval(() => saved.current(), ms); };

    const wake = () => {
      if (typeof document !== "undefined" && document.hidden) { stop(); return; }
      saved.current();
      start();
    };

    if (typeof document === "undefined" || !document.hidden) start();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [ms]);
}
