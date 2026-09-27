// Participant search, done by the database.
//
// BATCH36-MARKER participant-search
//
// Until Batch 36 the Participants screen pulled the first 2,000 names and
// searched those in the browser. Anyone past name number 2,000 could not
// be found at all, even though the screen said the search would find
// them. At 30,000 young people that is most of them.
//
// Now the search goes to Supabase and comes back one page at a time. The
// row rules still decide who sees what, exactly as before: this only
// narrows what a person is already allowed to read.
//
// Everything here is pure (no network), so it is tested directly.

export const PAGE_SIZE = 50;

// How many quiet participants are named in the banner. The count above
// them is always the full number.
export const QUIET_NAMED = 10;

export const LIST_COLUMNS =
  "id, full_name, class_level, school, stage, active, chapter_id, chapters(name)";

// The search box text, made safe to put inside a Supabase filter.
// Commas, brackets and quotes are part of the filter syntax, and % _ *
// are wildcards, so they are dropped rather than escaped. Nobody's name
// or school needs them to be found.
export function cleanNeedle(raw) {
  return String(raw || "")
    .replace(/[,()"'\\%_*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// A search for "benin" should also find everyone in the Benin chapter.
// Chapter names live in another table, so the matching chapters are
// worked out here and passed as a list of ids.
export function chapterIdsMatching(chapters, needle) {
  const n = String(needle || "").toLowerCase();
  if (!n) return [];
  return (chapters || [])
    .filter((c) => c && c.id && String(c.name || "").toLowerCase().includes(n))
    .map((c) => c.id);
}

// The "any of these columns contains the text" filter, in Supabase's
// or() syntax.
export function orFilter(needle, chapterIds) {
  const n = cleanNeedle(needle);
  if (!n) return "";
  const parts = [
    `full_name.ilike.%${n}%`,
    `school.ilike.%${n}%`,
    `class_level.ilike.%${n}%`,
  ];
  const ids = (chapterIds || []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length) parts.push(`chapter_id.in.(${ids.join(",")})`);
  return parts.join(",");
}

// Row numbers for page N (0-based), in the inclusive form range() takes.
export function pageRange(pageIndex, size = PAGE_SIZE) {
  const i = Math.max(0, Math.floor(pageIndex || 0));
  return [i * size, i * size + size - 1];
}

// Builds the list query. `from` is supabase.from("participants"), passed
// in so tests can hand over a recorder instead of the real client.
export function participantListQuery(from, { needle, stage, chapters, pageIndex = 0, size = PAGE_SIZE }) {
  const n = cleanNeedle(needle);
  let q = from.select(LIST_COLUMNS, { count: "exact" });
  if (n) q = q.or(orFilter(n, chapterIdsMatching(chapters, n)));
  if (stage) q = q.eq("stage", stage);
  const [a, b] = pageRange(pageIndex, size);
  // Name, then id: two people with the same name keep a fixed order, so
  // "show more" never repeats or skips anyone.
  return q.order("full_name").order("id").range(a, b);
}

// What the "show more" control under the list needs, in the same shape
// the in-browser pager already uses.
export function serverPaged({ loaded, total, onMore, size = PAGE_SIZE }) {
  const t = Math.max(0, total || 0);
  const shown = Math.min(Math.max(0, loaded || 0), t);
  const remaining = t - shown;
  return { total: t, remaining, add: Math.min(size, remaining), showMore: onMore, showAll: null };
}
