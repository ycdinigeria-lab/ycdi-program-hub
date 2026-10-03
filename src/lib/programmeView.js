import { THREE_TESTS } from "../data/programmes.js";

// BATCH41-MARKER programme-view
//
// The thinking behind the redesigned programme screens, kept out of the
// components so it can be tested without a browser. Nothing in here touches
// the database or changes what a status means; it only decides what to show
// and in what order.

// ---------- Status filters ----------
//
// The app has eight statuses, which is too many chips. These group them the
// way a person thinks about them. "Pending" is exactly the National
// Coordinator's queue, so its count always matches the "Awaiting approval"
// figure on the dashboards. A team member's note still with the Regional
// Coordinator has its own chip, and "Needs changes" holds both kinds of
// return.
export const STATUS_GROUPS = [
  { key: "all", label: "All", statuses: null },
  { key: "pending", label: "Pending", statuses: ["Pending"] },
  { key: "rcreview", label: "RC review", statuses: ["RC Review"] },
  { key: "changes", label: "Needs changes", statuses: ["Returned", "RC Returned"] },
  { key: "approved", label: "Approved", statuses: ["Approved"] },
  { key: "live", label: "Live", statuses: ["Live"] },
  { key: "complete", label: "Complete", statuses: ["Complete"] },
  { key: "declined", label: "Declined", statuses: ["Declined"] },
];

export function groupFor(key) {
  return STATUS_GROUPS.find((g) => g.key === key) || STATUS_GROUPS[0];
}

export function countByGroup(programs) {
  const list = programs || [];
  const out = {};
  for (const g of STATUS_GROUPS) {
    out[g.key] = g.statuses ? list.filter((p) => g.statuses.includes(p.status)).length : list.length;
  }
  return out;
}

// A chip with nothing behind it is noise, so empty groups are left out. The
// one that is currently selected always stays, otherwise approving the last
// pending programme would make the chip you are standing on vanish.
export function visibleGroups(counts, selectedKey) {
  return STATUS_GROUPS.filter((g) => g.key === "all" || g.key === selectedKey || (counts[g.key] || 0) > 0);
}

// ---------- Search ----------
export function matchesQuery(p, query) {
  const tokens = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = [p.title, p.chapter_name, p.type, p.school, p.status].filter(Boolean).join(" ").toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function filterPrograms(programs, { query, status } = {}) {
  const g = groupFor(status);
  return (programs || []).filter((p) => (!g.statuses || g.statuses.includes(p.status)) && matchesQuery(p, query));
}

// ---------- Dates and names ----------

// "2026-10-14" becomes "14 Oct", or "14 Oct 2027" when it is not this year.
// Anything that is not a plain date is shown as it was typed rather than
// guessed at. Read in UTC so a date never slips a day with the viewer's
// time zone.
export function shortDate(value, now = new Date()) {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return String(value);
  const y = +m[1], mo = +m[2], d = +m[3];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== mo - 1) return String(value);
  const opts = { day: "numeric", month: "short", timeZone: "UTC" };
  if (y !== now.getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString("en-GB", opts);
}

// "2026-10-14" as "14 Oct 2026", always with the year. For places that have
// the room, such as the facts strip on a programme.
export function fullDate(value) {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return String(value);
  const y = +m[1], mo = +m[2], d = +m[3];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== mo - 1) return String(value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const TITLES = /^(dr|mr|mrs|ms|miss|prof|pastor|pst|rev|engr|barr|evang|elder|deacon|deaconess)\.?$/i;

export function firstName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.find((p) => !TITLES.test(p)) || parts[0] || "";
}

export function greeting(now, fullName) {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = firstName(fullName);
  return name ? `${part}, ${name}` : part;
}

// The form asks for facilitators as one comma-separated line, so that is
// how they are stored. This turns it back into names for display.
export function splitNames(value) {
  return String(value || "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
}

export function plural(n, one, many) {
  return n === 1 ? one : many || one + "s";
}

// ---------- What needs attention ----------

// The coordinator's attention list, unchanged from before the redesign:
// anything the National Coordinator sent back; a team member's note waiting
// for this chapter's RC; and a note the RC sent back to the member who
// wrote it.
export function needsAttention(mine, profile) {
  return (mine || []).filter((p) =>
    p.status === "Returned"
    || (p.status === "RC Review" && (profile.role === "RC" || profile.is_admin))
    || (p.status === "RC Returned" && p.submitted_by === profile.id)
  );
}

export function attentionDetail(p) {
  if (p.status === "Returned") return { label: "Returned by the National Coordinator", note: p.nc_comment || "" };
  if (p.status === "RC Returned") return { label: "Returned by your Regional Coordinator", note: p.rc_comment || "" };
  return { label: "Awaiting your review", note: "" };
}

export function excerpt(text, max = 110) {
  const t = String(text || "").trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "..." : t;
}

// ---------- Readiness ----------

// The three checks the detail screen has always shown, same rules, now with
// plain wording about what was actually checked. They confirm that the
// information is filled in. They cannot judge whether a programme truly
// serves the mission, and the screen says so.
const DETAIL = {
  "Mission test": { ok: "Objectives are written", bad: "Objectives are missing or very short" },
  "Quality test": { ok: "Facilitators are named", bad: "No facilitators named" },
  "Safety test": { ok: "Safeguarding lead is assigned", bad: "No safeguarding lead assigned" },
};

export function readinessChecks(program) {
  return THREE_TESTS.map((t) => {
    let ok;
    if (t.name === "Mission test") ok = (program.objectives || "").length > 20;
    else if (t.name === "Quality test") ok = !!program.facilitators;
    else ok = !!program.safeguarding_lead;
    const d = DETAIL[t.name] || { ok: "Complete", bad: "Incomplete" };
    return { name: t.name, q: t.q, color: t.color, ok, detail: ok ? d.ok : d.bad };
  });
}

export function readinessTotals(checks) {
  return { done: checks.filter((c) => c.ok).length, total: checks.length };
}

// ---------- Dashboard figures ----------
export function programmeTotals(programs) {
  const list = programs || [];
  const count = (s) => list.filter((p) => p.status === s).length;
  return {
    total: list.length,
    students: list.reduce((sum, p) => sum + (Number(p.students) || 0), 0),
    pending: count("Pending"),
    approved: count("Approved"),
    live: count("Live"),
    complete: count("Complete"),
  };
}

// ---------- Who may do what on a programme ----------
//
// Moved out of the detail screen unchanged so the rules can be tested one
// by one. These decide which buttons are offered; the database still has
// the final say on whether an action is allowed.
//
// - Approve: administrators only, and only while it is Pending.
// - Log a report: an approved or live programme, by an administrator or
//   anyone in the programme's chapter.
// - Edit after the National Coordinator returned it: that chapter's RC, or
//   an administrator. Only Returned, never Pending, because a Pending one
//   may be open in front of the National Coordinator at that moment.
// - Edit after the RC returned it: the team member who wrote it, or an
//   administrator.
// - Act on a team member's note in RC Review (forward, return, decline):
//   that chapter's RC, or an administrator.
export function programmePermissions(program, profile) {
  const admin = !!profile.is_admin;
  const sameChapter = profile.chapter_name === program.chapter_name;
  const canApprove = admin && program.status === "Pending";
  const canLogReport = (program.status === "Approved" || program.status === "Live") && (admin || sameChapter);
  const canEditReturned = program.status === "Returned" && (admin || (profile.role === "RC" && sameChapter));
  const canEditRcReturned = program.status === "RC Returned" && (admin || program.submitted_by === profile.id);
  const canActAsRC = program.status === "RC Review" && (admin || (profile.role === "RC" && sameChapter));
  return { canApprove, canLogReport, canEditReturned, canEditRcReturned, canEdit: canEditReturned || canEditRcReturned, canActAsRC };
}
