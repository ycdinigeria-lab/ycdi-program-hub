// BATCH33-MARKER grants-lib
//
// The grants screen's wording, its status logic and the small pieces of
// arithmetic that decide what a person is shown. Kept out of the component
// so they can be tested without drawing anything. The money helpers are
// the same ones the claims screen uses, imported rather than copied, so
// naira is formatted and parsed one way across the whole of finance.

import { formatNaira, parseNairaToKobo, koboToInput, todayLagos, daysBetween } from "./finance.js";
export { formatNaira, parseNairaToKobo, koboToInput, todayLagos };

// The stages a grant moves through, in the order they really happen.
export const GRANT_STATUSES = ["prospect", "applied", "awarded", "active", "reporting", "closed", "declined"];

export const STATUS_WORD = {
  prospect: "Prospect",
  applied: "Applied",
  awarded: "Awarded",
  active: "Active",
  reporting: "Reporting",
  closed: "Closed",
  declined: "Declined",
};

// Which statuses a grant can move to next, for the buttons. A grant walks
// forward through the funnel, can be declined from any live stage, and
// once closed or declined it is finished (the database refuses reopening).
export function nextStatuses(current) {
  switch (current) {
    case "prospect":  return ["applied", "declined"];
    case "applied":   return ["awarded", "declined"];
    case "awarded":   return ["active", "declined"];
    case "active":    return ["reporting", "closed"];
    case "reporting": return ["closed"];
    default:          return []; // closed, declined: finished
  }
}

export const OBLIGATION_KINDS = [
  ["narrative_report", "Narrative report"],
  ["financial_report", "Financial report"],
  ["acquittal", "Acquittal"],
  ["milestone", "Milestone"],
  ["renewal", "Renewal"],
  ["audit", "Audit"],
  ["other", "Other"],
];
export const OBLIGATION_KIND_LABEL = Object.fromEntries(OBLIGATION_KINDS);

export const OBLIGATION_STATUS_WORD = {
  pending: "Pending",
  submitted: "Submitted",
  done: "Done",
  waived: "Waived",
};

// The state of a deadline as words and a level. A settled or waived one is
// closed; a pending one is read against the clock, the same way a claim's
// reimbursement clock is, so nothing about it can drift out of date.
export function obligationDue(obl, today = todayLagos()) {
  if (!obl) return null;
  if (obl.status === "submitted" || obl.status === "done") return { level: "done", text: OBLIGATION_STATUS_WORD[obl.status] };
  if (obl.status === "waived") return { level: "waived", text: "Waived" };
  const left = daysBetween(today, obl.due_date);
  if (left < 0) { const n = -left; return { level: "late", days: left, text: n === 1 ? "1 day overdue" : `${n} days overdue` }; }
  if (left === 0) return { level: "soon", days: 0, text: "Due today" };
  return { level: left <= 14 ? "soon" : "ok", days: left, text: left === 1 ? "Due in 1 day" : `Due in ${left} days` };
}

// The seats that reach grants. The DNC seat (partnerships and fundraising)
// gains access in this batch; the FIN seat and the NC manage as well; the
// TREAS seat reads. A Regional Coordinator's chapter-scoped read is decided
// by the database, not here, so it is not in these front-of-house checks.
export function canManageGrants(profile) {
  if (!profile) return false;
  const seats = profile.portfolios || [];
  return profile.role === "NC" || seats.includes("DNC") || seats.includes("FIN");
}

export function canReadGrants(profile) {
  if (!profile) return false;
  const seats = profile.portfolios || [];
  return profile.role === "NC" || seats.includes("DNC") || seats.includes("FIN") || seats.includes("TREAS");
}

// A grant can fund a programme only once it is really in hand.
export function canFundProgrammes(status) {
  return status === "awarded" || status === "active" || status === "reporting";
}

// How much of the award is spent, as a fraction for a bar. Spent counts
// approved and paid claims; allocation (budgets earmarked) is shown apart.
export function spentFraction(row) {
  const awarded = Number(row.awarded_kobo) || 0;
  if (awarded <= 0) return 0;
  const spent = Number(row.committed_kobo) + Number(row.paid_kobo);
  return Math.min(1, Math.max(0, spent / awarded));
}

// Validate what the grant form collected, before it goes to the database.
// Returns { ok:true, values } or { ok:false, error }.
export function validateGrant(form) {
  const title = (form.title || "").trim();
  const funder = (form.funder_name || "").trim();
  if (!title) return { ok: false, error: "Give the grant a title." };
  if (!funder) return { ok: false, error: "Name the funder." };
  const parsed = parseNairaToKobo(form.awarded || "0");
  if (form.awarded && !parsed.ok) return { ok: false, error: parsed.error };
  const kobo = form.awarded ? parsed.kobo : 0;
  if (form.is_restricted && !(form.restrictions || "").trim()) {
    return { ok: false, error: "Restricted money needs a note saying what it is restricted to." };
  }
  if (form.period_start && form.period_end && form.period_end < form.period_start) {
    return { ok: false, error: "The end of the period cannot be before the start." };
  }
  return {
    ok: true,
    values: {
      p_title: title, p_funder_name: funder, p_awarded_kobo: kobo,
      p_is_restricted: !!form.is_restricted,
      p_restrictions: (form.restrictions || "").trim() || null,
      p_funder_id: form.funder_id || null,
      p_reference: (form.reference || "").trim() || null,
      p_purpose: (form.purpose || "").trim() || null,
      p_period_start: form.period_start || null,
      p_period_end: form.period_end || null,
    },
  };
}
