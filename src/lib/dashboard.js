// BATCH8-MARKER dashboard-lib
//
// Everything the dashboard decides, kept out of the component so it can be
// tested without rendering anything. The screen itself only arranges what
// these functions return.

import { B } from "../theme.js";

// Titles carry no information in a greeting and read stiffly, so a name
// that starts with one falls through to the word after it.
const TITLES = ["dr", "mr", "mrs", "ms", "miss", "pastor", "rev", "prof", "engr", "sir", "elder", "bro", "sis"];

function stripDot(word) {
  return word.replace(/\.$/, "").toLowerCase();
}

// Split on hours rather than on a label, so this stays right whatever the
// phone's locale does to the word "evening".
export function greetingFor(date) {
  const h = (date instanceof Date ? date : new Date()).getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function firstNameOf(fullName) {
  if (typeof fullName !== "string") return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length > 1 && TITLES.includes(stripDot(parts[0]))) return parts[1];
  return parts[0];
}

// A profile with no name still gets a greeting rather than a comma sitting
// on its own. Signed-up-but-not-yet-completed profiles do exist.
export function greetingLine(fullName, date) {
  const first = firstNameOf(fullName);
  const greeting = greetingFor(date);
  return first ? greeting + ", " + first : greeting;
}

// A National Coordinator sees the country. Everybody else sees their own
// chapter. The database scopes this too; doing it here as well means a
// stray row can never widen what somebody is shown.
export function scopeFor(programs, profile) {
  const list = Array.isArray(programs) ? programs : [];
  if (!profile || profile.role === "NC") return list;
  return list.filter((p) => p.chapter_name === profile.chapter_name);
}

export function needsReport(p) {
  return (p.status === "Approved" || p.status === "Live") && !p.report;
}

// Cards with a filter become buttons. Students planned has none on purpose,
// because there is no sensible list to filter it down to and a button that
// does nothing when pressed is worse than plain text.
export function statCardsFor(programs, profile) {
  const mine = scopeFor(programs, profile);
  const students = mine.reduce((sum, p) => sum + (Number(p.students) || 0), 0);
  const pending = mine.filter((p) => p.status === "Pending").length;

  if (profile && profile.role === "NC") {
    const live = mine.filter((p) => p.status === "Live").length;
    return [
      { key: "programmes", label: "Programmes", value: mine.length, filter: "all", accent: B.blue },
      { key: "students", label: "Students", value: students.toLocaleString(), filter: null, accent: B.blue },
      { key: "pending", label: "Pending approval", value: pending, filter: "Pending", accent: pending > 0 ? B.gold : B.blue },
      { key: "live", label: "Live now", value: live, filter: "Live", accent: live > 0 ? "#1a6b2f" : B.blue },
    ];
  }

  const due = mine.filter(needsReport).length;
  return [
    { key: "programmes", label: "My programmes", value: mine.length, filter: "all", accent: B.blue },
    { key: "students", label: "Students", value: students.toLocaleString(), filter: null, accent: B.blue },
    { key: "pending", label: "Awaiting approval", value: pending, filter: "Pending", accent: pending > 0 ? B.gold : B.blue },
    { key: "report", label: "Report due", value: due, filter: "needs_report", accent: due > 0 ? B.red : B.blue },
  ];
}

// What is actually waiting on this person, in the order it should be dealt
// with. A returned programme comes first because somebody is blocked on it.
export function attentionFor(programs, profile) {
  const mine = scopeFor(programs, profile);
  const meta = (p) => [p.chapter_name, p.date].filter(Boolean).join(" · ");

  if (profile && profile.role === "NC") {
    return mine
      .filter((p) => p.status === "Pending")
      .map((p) => ({ id: p.id, title: p.title, meta: meta(p), tone: "warn", actionLabel: "Review" }));
  }

  const returned = mine
    .filter((p) => p.status === "Returned")
    .map((p) => ({ id: p.id, title: p.title, meta: meta(p), tone: "alert", actionLabel: "Fix and resend" }));
  const due = mine
    .filter(needsReport)
    .map((p) => ({ id: p.id, title: p.title, meta: meta(p), tone: "warn", actionLabel: "Log report" }));
  return returned.concat(due);
}

export function matchesQuery(p, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [p.title, p.chapter_name, p.school, p.type, p.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

// One place decides what the list shows, so a chip, a stat card and the
// search box can never disagree about it.
export function filterPrograms(programs, opts) {
  const { status = "all", chapter = null, query = "" } = opts || {};
  return (Array.isArray(programs) ? programs : []).filter((p) => {
    if (chapter && p.chapter_name !== chapter) return false;
    if (status === "needs_report") {
      if (!needsReport(p)) return false;
    } else if (status !== "all" && p.status !== status) return false;
    return matchesQuery(p, query);
  });
}

export function chapterTotals(programs, chapterNames) {
  const names = Array.isArray(chapterNames) && chapterNames.length
    ? chapterNames
    : Array.from(new Set((programs || []).map((p) => p.chapter_name).filter(Boolean)));
  return names
    .map((name) => {
      const rows = (programs || []).filter((p) => p.chapter_name === name);
      return {
        name,
        count: rows.length,
        students: rows.reduce((sum, p) => sum + (Number(p.students) || 0), 0),
      };
    })
    .sort((a, b) => b.students - a.students);
}

// The chips under the stat cards. Counts are shown so an empty filter is
// obvious before it is pressed rather than after.
export function filterChipsFor(programs, profile) {
  const mine = scopeFor(programs, profile);
  const count = (status) => filterPrograms(mine, { status }).length;
  const chips = [
    { key: "all", label: "All" },
    { key: "Pending", label: "Pending" },
    { key: "Approved", label: "Approved" },
    { key: "Live", label: "Live" },
    { key: "Returned", label: "Returned" },
    { key: "needs_report", label: "Report due" },
  ];
  return chips
    .map((c) => ({ ...c, count: count(c.key) }))
    .filter((c) => c.key === "all" || c.count > 0);
}

// Two or three things worth pressing straight away, chosen by role. Each
// one names a tab, and where it lives inside More, the feature as well.
// Nothing here decides access; App only ever opens what the More list
// already lets this person see.
export function quickActionsFor(profile) {
  if (!profile) return [];
  const role = profile.role;
  const actions = [];

  if (role !== "TM") {
    actions.push({ key: "programmes", label: role === "NC" ? "All programmes" : "Submit outreach", section: "programmes" });
    actions.push({ key: "participants", label: "Participants", section: "more", view: "participants" });
  }
  actions.push({ key: "calendar", label: "Calendar", section: "more", view: "calendar" });
  actions.push({ key: "messaging", label: "Messages", section: "more", view: "messaging" });
  if (role !== "TM") actions.push({ key: "kpi", label: "KPI report", section: "more", view: "kpi" });
  actions.push({ key: "profile", label: "My profile", section: "more", view: "profile" });

  return actions;
}
