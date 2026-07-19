// Long lists used to put every single row on the page at once. On a phone
// that is hundreds of buttons the browser has to lay out before anything
// appears, and it gets worse every month as the register grows.
//
// This renders a window of rows with a button to show more. Searching and
// filtering still run across everything that was loaded, so nothing is
// hidden from a search, only from the initial paint.
//
// BATCH4-MARKER paging

import { useState, useEffect } from "react";

export const PAGE = 40;

// How many are left and how many the next press would add. Pure, so it can
// be tested without React.
export function nextStep(total, shown, page = PAGE) {
  const safeTotal = Math.max(0, total || 0);
  const safeShown = Math.min(Math.max(0, shown || 0), safeTotal);
  const remaining = safeTotal - safeShown;
  return { remaining, add: Math.min(page, remaining) };
}

// `resetKey` should change whenever the list itself changes meaning: a new
// search term, a different filter, a reload. Without it, narrowing a search
// to three results would still claim to be showing forty.
export function usePaged(items, resetKey, page = PAGE) {
  const [shown, setShown] = useState(page);
  useEffect(() => { setShown(page); }, [resetKey, page]);

  const list = items || [];
  const visible = list.slice(0, shown);
  const { remaining, add } = nextStep(list.length, visible.length, page);

  return {
    visible,
    total: list.length,
    remaining,
    add,
    showMore: () => setShown((n) => n + page),
    showAll: () => setShown(list.length),
  };
}
