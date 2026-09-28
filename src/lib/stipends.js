// BATCH39-MARKER stipends-lib
//
// The stipend screen's wording, month arithmetic and checks, kept out of
// the component so they can be tested without drawing anything. Money is
// whole kobo, as in the rest of finance; naira exists only in what a
// person types and reads. Every rule here is also the database's; this
// only saves someone a round trip to be told no.

import { formatNaira, parseNairaToKobo, koboToInput, todayLagos } from "./finance.js";
import { PORTFOLIO_LABEL } from "../data/portfolios.js";
export { formatNaira, koboToInput, todayLagos };

export const MAX_MONTHLY_KOBO = 1000000000; // ₦10,000,000, the database's ceiling

// ── Who sees what ───────────────────────────────────────────────────────
// The card and the full screen: the NC, the Financial Secretary and the
// Treasurer. Everyone on the list sees their own stipend inside Finance.
export function canReadStipends(profile) {
  if (!profile) return false;
  const s = profile.portfolios || [];
  return profile.role === "NC" || s.includes("FIN") || s.includes("TREAS");
}

// ── Months ──────────────────────────────────────────────────────────────
// A month travels as "YYYY-MM" in the screen and "YYYY-MM-01" to the
// database, which stores the first of the month.
export function thisMonth(today = todayLagos()) {
  return String(today).slice(0, 7);
}
export function monthToDate(ym) {
  return ym ? `${String(ym).slice(0, 7)}-01` : null;
}
export function dateToMonth(d) {
  return d ? String(d).slice(0, 7) : "";
}
export function addMonths(ym, n) {
  const [y, m] = String(ym).slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function monthLabel(ym) {
  if (!ym) return "";
  const [y, m] = String(ym).slice(0, 7).split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function monthShort(ym) {
  return ym ? monthLabel(ym).replace(/^(\w{3})\w*/, "$1") : "";
}

// "From July 2026", "July to December 2026", "July 2026 to March 2027".
export function spanLabel(startDate, endDate) {
  const s = dateToMonth(startDate);
  const e = dateToMonth(endDate);
  if (!s) return "";
  if (!e) return `From ${monthLabel(s)}`;
  if (s === e) return `${monthLabel(s)} only`;
  if (s.slice(0, 4) === e.slice(0, 4)) return `${MONTHS[Number(s.slice(5, 7)) - 1]} to ${monthLabel(e)}`;
  return `${monthLabel(s)} to ${monthLabel(e)}`;
}

// Is a stipend running in a given month ("YYYY-MM")?
export function activeIn(recipient, ym) {
  const s = dateToMonth(recipient.start_month);
  const e = dateToMonth(recipient.end_month);
  return !!s && s <= ym && (!e || e >= ym);
}

// Has it ended before a given month?
export function endedBy(recipient, ym) {
  const e = dateToMonth(recipient.end_month);
  return !!e && e < ym;
}

// ── Adding someone ──────────────────────────────────────────────────────
// A sensible label for what the stipend is for, suggested from the person's
// seat, role and chapter. The Financial Secretary can change it.
export function suggestLabel(candidate) {
  if (!candidate) return "";
  const seats = candidate.seats || [];
  const seat = seats.find((s) => s !== "TREAS");
  if (seat && PORTFOLIO_LABEL[seat]) return PORTFOLIO_LABEL[seat];
  if (candidate.role === "NC") return "National Coordinator";
  if (candidate.role === "RC") return candidate.chapter_name ? `Regional Coordinator, ${candidate.chapter_name}` : "Regional Coordinator";
  return candidate.role_title || "";
}

// One line describing a candidate in the picker.
export function candidateLine(c) {
  const bits = [];
  const seatNames = (c.seats || []).map((s) => PORTFOLIO_LABEL[s]).filter(Boolean);
  if (seatNames.length) bits.push(seatNames.join(", "));
  else if (c.role === "NC") bits.push("National Coordinator");
  else if (c.role === "RC") bits.push("Regional Coordinator");
  else if (c.role_title) bits.push(c.role_title);
  else bits.push("Team member");
  if (c.chapter_name) bits.push(c.chapter_name);
  return bits.join(" · ");
}

function parseMonthly(text) {
  const r = parseNairaToKobo(text);
  if (!r.ok) {
    // finance.js words its ceiling for a claim; a stipend has its own.
    if (/claim/.test(r.error)) return { ok: false, error: "That monthly amount is too large." };
    return r;
  }
  if (r.kobo > MAX_MONTHLY_KOBO) return { ok: false, error: "That monthly amount is too large." };
  return r;
}

// Check the list form before it goes to the database.
export function validateRecipient(form, { isNew } = {}) {
  if (isNew && !form.profile_id) return { ok: false, error: "Choose the person." };
  if (!(form.role_label || "").trim()) return { ok: false, error: "Say what the stipend is for, for example Regional Coordinator, Benin." };
  const amt = parseMonthly(form.monthly);
  if (!amt.ok) return { ok: false, error: amt.error };
  if (!/^\d{4}-\d{2}$/.test(form.start || "")) return { ok: false, error: "Choose the month the stipend starts." };
  if (form.end && !/^\d{4}-\d{2}$/.test(form.end)) return { ok: false, error: "Choose a valid last month, or leave it blank." };
  if (form.end && form.end < form.start) return { ok: false, error: "The last month cannot be before the first." };
  return {
    ok: true,
    values: {
      p_profile: isNew ? form.profile_id : null,
      p_monthly_kobo: amt.kobo,
      p_start_month: monthToDate(form.start),
      p_end_month: form.end ? monthToDate(form.end) : null,
      p_role_label: form.role_label.trim(),
      p_approval_ref: (form.approval_ref || "").trim() || null,
      p_note: (form.note || "").trim() || null,
    },
  };
}

// ── Recording a payment ─────────────────────────────────────────────────
export function looksLikeAccountNumber(ref) {
  return /^\s*\d{10}\s*$/.test(String(ref || ""));
}

export function validatePayment(form, { monthlyKobo, today = todayLagos() } = {}) {
  const amt = parseMonthly(form.amount);
  if (!amt.ok) return { ok: false, error: amt.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.paid_on || "")) return { ok: false, error: "Give the day it was paid." };
  if (form.paid_on > today) return { ok: false, error: "The payment date cannot be in the future." };
  const ref = (form.ref || "").trim();
  if (!ref) return { ok: false, error: "Give the payment reference." };
  if (looksLikeAccountNumber(ref)) return { ok: false, error: "That looks like a bank account number. Give the transfer or receipt reference instead." };
  const note = (form.note || "").trim();
  if (monthlyKobo && amt.kobo !== Number(monthlyKobo) && note.length < 5) {
    return { ok: false, error: `This differs from the monthly rate of ${formatNaira(monthlyKobo)}. Add a note saying why.` };
  }
  return { ok: true, values: { p_amount_kobo: amt.kobo, p_paid_on: form.paid_on, p_ref: ref, p_note: note || null } };
}

// ── The month at a glance ───────────────────────────────────────────────
export function sheetTotals(rows) {
  let due = 0, paid = 0, paidCount = 0, waitingCount = 0;
  for (const r of rows || []) {
    due += Number(r.monthly_kobo || 0);
    if (r.payment_id) { paid += Number(r.paid_kobo || 0); paidCount += 1; }
    else waitingCount += 1;
  }
  return { due, paid, paidCount, waitingCount, count: (rows || []).length };
}

// The year's line: what is left in the budget after what the list commits.
export function yearPosition(summary) {
  if (!summary) return null;
  const planned = Number(summary.planned_kobo || 0);
  const committed = Number(summary.committed_kobo || 0);
  const paid = Number(summary.paid_kobo || 0);
  return {
    planned, committed, paid,
    hasPlan: !!summary.has_budget && planned > 0,
    overPlan: planned > 0 && committed > planned,
    gap: planned - committed,
  };
}

export const EVENT_WORD = {
  stipend_added: "Added to the list",
  stipend_changed: "Changed",
  stipend_ended: "Ended",
  stipend_paid: "Payment recorded",
  stipend_voided: "Payment voided",
};
