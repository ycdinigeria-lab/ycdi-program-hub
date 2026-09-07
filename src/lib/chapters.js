// Chapter admin logic, kept pure so the rules can be tested without a
// browser or a database. The database has allowed admins to add, rename
// and remove chapters since the early lock-down migration; this is the
// front-end catching up to a door already open.
//
// BATCH14-MARKER chapter-admin

// Whether a chapter name is good to save. Returns an error message to show,
// or null when it is fine. `existing` is the names already in use, and the
// clash check ignores case and surrounding spaces so "Lagos" and " lagos "
// are caught before the database's own unique rule has to. `currentId` lets
// a rename keep its own name without tripping the clash check on itself.
export function validateChapterName(name, existing, currentId) {
  const clean = String(name || "").trim();
  if (!clean) return "Give the chapter a name.";
  if (clean.length < 2) return "That name is too short.";

  const lower = clean.toLowerCase();
  const clash = (existing || []).some(
    (c) => String(c.name || "").trim().toLowerCase() === lower && c.id !== currentId
  );
  if (clash) return "There is already a chapter with that name.";

  return null;
}

// The value actually written, once the name is known to be good: trimmed,
// with any run of inner spaces collapsed so a stray double space does not
// create a name that looks identical but sorts oddly.
export function cleanChapterName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}
