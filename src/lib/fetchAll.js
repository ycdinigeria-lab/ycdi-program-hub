// Reading a whole list, however long it gets.
//
// BATCH36-MARKER fetch-all
//
// Supabase hands back at most 1,000 rows per request (a project setting).
// A screen that asks for "everything" with a single request gets the first
// 1,000 and no warning, so a register quietly stops being complete the day
// it passes that size. Several screens were written that way.
//
// fetchAllRows asks again from where the last answer stopped until an
// answer comes back empty. It does not assume the page size, so it stays
// right even if the project's limit is later set lower than 1,000.
//
// `makeQuery` must build a FRESH query each time it is called (a query
// can only be sent once), and must be ordered by something unique, or
// pages can overlap. Ordering by the real sort column and then "id" does
// that.
//
// `ceiling` is a safety stop so a runaway table cannot freeze a phone.
// If it is reached, `truncated` is true and the screen should say so.

export const FETCH_PAGE = 1000;
export const FETCH_CEILING = 10000;

export async function fetchAllRows(makeQuery, { pageSize = FETCH_PAGE, ceiling = FETCH_CEILING } = {}) {
  const rows = [];
  let from = 0;
  while (from < ceiling) {
    const to = Math.min(from + pageSize, ceiling) - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) return { data: rows, error, truncated: false };
    const got = data || [];
    if (got.length === 0) return { data: rows, error: null, truncated: false };
    rows.push(...got);
    from += got.length;
  }
  return { data: rows, error: null, truncated: true };
}

// Joins lists that may share rows (by id) into one, first copy wins.
export function mergeById(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const row of list || []) {
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}
