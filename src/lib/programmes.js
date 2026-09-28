// BATCH37-MARKER concept-note-v2
//
// Pure, testable rules for the concept note gate and the Level 3/4/5
// approval thresholds (Programme Operations Manual v2.0, sections 1.5,
// 1.6 and 1.15). Kept independent of React and Supabase so the same
// logic that drives the form's validation and the review screen's
// banners can be unit-tested directly, and so it stays a mirror of the
// database's own rules in batch37-concept-note-v2.sql rather than a
// second, drifting copy of them. The database is the authority; this
// file exists so the form can tell a coordinator what's wrong before
// they submit, not only after the server refuses it.
import { NEEDS_QUESTIONS, PRIORITIES } from "../data/programmes.js";

export function needsComplete(form) {
  return NEEDS_QUESTIONS.every((q) => (form[q.key] || "").trim().length > 0);
}

export function alignmentComplete(form) {
  return PRIORITIES.every((p) => !!form[p.key]);
}

export function noneCount(form) {
  return PRIORITIES.reduce((n, p) => n + (form[p.key] === "None" ? 1 : 0), 0);
}

export function strongCount(form) {
  return PRIORITIES.reduce((n, p) => n + (form[p.key] === "Strong" ? 1 : 0), 0);
}

// Mirrors the database gate exactly: 3 or more None ratings is refused
// outright, not just discouraged.
export function alignmentBlocked(form) {
  return alignmentComplete(form) && noneCount(form) >= 3;
}

// Not blocked, but section 1.6 says a note should show at least one
// Strong and no more than one None. Shown as a warning, not a stop.
export function alignmentWeak(form) {
  return alignmentComplete(form) && !alignmentBlocked(form) && (strongCount(form) === 0 || noneCount(form) >= 2);
}

export function digitalSafeguardingRequired(form) {
  return !!form.delivery_format && form.delivery_format !== "Physical";
}

export function digitalSafeguardingComplete(form) {
  return !digitalSafeguardingRequired(form) || (form.digital_safeguarding || "").trim().length > 0;
}

// Everything the database's guard_concept_note_gate trigger requires
// before a genuine (re)submission is accepted.
export function gateComplete(form) {
  return (
    needsComplete(form)
    && alignmentComplete(form)
    && !alignmentBlocked(form)
    && !!form.delivery_format
    && digitalSafeguardingComplete(form)
  );
}

// Section 1.15 — approval authority follows the Financial Policy Manual
// thresholds (YCDI-FIN-001, section 1.2).
export function approvalLevel(budget) {
  const b = Number(budget) || 0;
  if (b <= 500000) return 3;
  if (b <= 2000000) return 4;
  return 5;
}

export const APPROVAL_LEVEL_INFO = {
  3: { approver: "National Coordinator", timeframe: "Approve or return within 7 working days", needsTreasurer: false, needsBoard: false },
  4: { approver: "National Coordinator + Board Treasurer, jointly, in writing", timeframe: "Approve or return within 14 working days", needsTreasurer: true, needsBoard: false },
  5: { approver: "Full Board of Trustees, on recommendation of the Programmes & Impact Committee", timeframe: "Per the Board's regular or special meeting schedule", needsTreasurer: false, needsBoard: true },
};

export function approvalLevelInfo(budget) {
  const level = approvalLevel(budget);
  return { level, ...APPROVAL_LEVEL_INFO[level] };
}

// Section 1.6's own rule, applied to a live programme record rather than
// a form in progress: used by the programme detail page in place of the
// old "objectives longer than 20 characters" stand-in for the Mission test.
export function missionTestPasses(program) {
  if (!alignmentComplete(program)) return false;
  return strongCount(program) >= 1 && noneCount(program) <= 1;
}
