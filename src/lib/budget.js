// BATCH35-MARKER budget-lib
//
// The annual-budget screen's wording, status logic and the arithmetic of
// plan against actuals. Kept out of the component for testing. Money
// helpers are shared with the rest of finance.

import { formatNaira, parseNairaToKobo, koboToInput, todayLagos } from "./finance.js";
export { formatNaira, parseNairaToKobo, koboToInput, todayLagos };

export const BUDGET_STATUSES = ["draft", "submitted", "board_approved", "active", "closed"];
export const STATUS_WORD = {
  draft: "Draft",
  submitted: "With the Board",
  board_approved: "Board approved",
  active: "Active",
  closed: "Closed",
};

export const LINE_KINDS = [["income", "Income"], ["expenditure", "Expenditure"]];
export const CATEGORIES = {
  income: [
    ["donations", "Donations"],
    ["grants", "Grants"],
    ["events", "Events"],
    ["other_income", "Other income"],
  ],
  expenditure: [
    ["programmes", "Programmes"],
    ["safeguarding", "Safeguarding"],
    ["training", "Training"],
    ["stipends", "Stipends"],
    ["admin", "Administration"],
    ["travel", "Travel"],
    ["equipment", "Equipment"],
    ["other_expenditure", "Other expenditure"],
  ],
};
export const CATEGORY_LABEL = Object.fromEntries(
  [...CATEGORIES.income, ...CATEGORIES.expenditure]
);

export const EVENT_WORD = {
  annual_created: "Budget started",
  annual_submitted: "Sent to the Board",
  annual_approved: "Board approved",
  annual_status: "Status changed",
  annual_line: "Line changed",
};

// Who reaches the budget. Prepare: NC and FIN. Approve on the Board's
// behalf: NC and TREAS (not the FIN seat that prepared it). Read adds DNC.
export function canPrepareBudget(profile) {
  if (!profile) return false;
  return profile.role === "NC" || (profile.portfolios || []).includes("FIN");
}
export function canApproveBudget(profile) {
  if (!profile) return false;
  return profile.role === "NC" || (profile.portfolios || []).includes("TREAS");
}
export function canReadBudget(profile) {
  if (!profile) return false;
  const s = profile.portfolios || [];
  return profile.role === "NC" || s.includes("FIN") || s.includes("TREAS") || s.includes("DNC");
}

// The moves this person is offered on a budget in a given status. Prepare
// and approve are different seats, so the actions are gated on both.
export function budgetActions(profile, status) {
  const acts = [];
  const prep = canPrepareBudget(profile);
  const appr = canApproveBudget(profile);
  if (status === "draft") { if (prep) acts.push("edit", "submit"); }
  else if (status === "submitted") { if (appr) acts.push("approve", "return"); }
  else if (status === "board_approved") { if (appr) acts.push("activate", "close"); }
  else if (status === "active") { if (appr) acts.push("close"); }
  return acts;
}
export const ACTION_LABEL = {
  edit: "Edit lines", submit: "Send to the Board", approve: "Record approval",
  return: "Send back", activate: "Make active", close: "Close",
};

// Plan against actuals for one side of the budget, as figures and a
// fraction for a bar. spent/received is the actual; planned is the plan.
export function progress(planned, actual) {
  const p = Number(planned) || 0;
  const a = Number(actual) || 0;
  const fraction = p > 0 ? Math.min(1, Math.max(0, a / p)) : (a > 0 ? 1 : 0);
  return { planned: p, actual: a, remaining: p - a, fraction, over: a > p };
}

// Sum planned amounts by side from a set of lines, in kobo.
export function plannedTotals(lines) {
  let income = 0, expenditure = 0;
  for (const l of lines || []) {
    if (l.kind === "income") income += Number(l.planned_kobo || 0);
    else expenditure += Number(l.planned_kobo || 0);
  }
  return { income, expenditure };
}

// Validate a line before it goes to the database.
export function validateLine(form) {
  if (!form.kind || (form.kind !== "income" && form.kind !== "expenditure")) return { ok: false, error: "Choose income or expenditure." };
  if (!form.category) return { ok: false, error: "Choose a category." };
  if (!(form.label || "").trim()) return { ok: false, error: "Give the line a label." };
  const parsed = parseNairaToKobo(form.planned || "0");
  if (form.planned && !parsed.ok) return { ok: false, error: parsed.error };
  return {
    ok: true,
    values: {
      p_kind: form.kind, p_category: form.category, p_label: form.label.trim(),
      p_planned_kobo: form.planned ? parsed.kobo : 0,
      p_chapter: form.chapter_id || null, p_note: (form.note || "").trim() || null,
    },
  };
}
