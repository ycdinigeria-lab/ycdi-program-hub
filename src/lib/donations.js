// BATCH34-MARKER donations-lib
//
// The donations screen's wording and the small rules that decide what a
// person is shown and whether a form is ready. The money helpers are the
// same ones the rest of finance uses, imported not copied.

import { formatNaira, parseNairaToKobo, koboToInput, todayLagos } from "./finance.js";
export { formatNaira, parseNairaToKobo, koboToInput, todayLagos };

export const METHODS = [
  ["transfer", "Bank transfer"],
  ["cash", "Cash"],
  ["cheque", "Cheque"],
  ["card", "Card"],
  ["online", "Online"],
  ["in_kind", "In kind"],
  ["other", "Other"],
];
export const METHOD_LABEL = Object.fromEntries(METHODS);

// YCDI's fundraising calendar (the donor-night, back-to-school and
// year-end moments), so a gift can be tied to the push that brought it.
export const CAMPAIGNS = [
  ["january_launch", "January launch"],
  ["easter_mission", "Easter mission offering"],
  ["may_donor_night", "May donor night"],
  ["back_to_school", "September back-to-school"],
  ["year_end", "Year-end campaign"],
  ["impact_report", "Impact report launch"],
  ["general", "General"],
];
export const CAMPAIGN_LABEL = Object.fromEntries(CAMPAIGNS);

export const TIER_LABEL = { champion: "Champion", partner: "Partner", supporter: "Supporter", friend: "Friend", in_kind: "In kind" };

export const EVENT_WORD = {
  donation_recorded: "Recorded",
  donation_corrected: "Corrected",
  donation_acknowledged: "Acknowledged",
  donation_voided: "Voided",
};

// The donor tier a total earns, in kobo, matching the database bands
// (Friends under ₦20,000; Supporters to ₦99,999; Partners to ₦499,999;
// Champions ₦500,000 and up). Kept here too so the screen can label a
// figure without another round trip.
export function donorTier(kobo) {
  const n = Number(kobo) || 0;
  if (n >= 50000000) return "champion";
  if (n >= 10000000) return "partner";
  if (n >= 2000000) return "supporter";
  if (n > 0) return "friend";
  return null;
}

// The seats that reach donations. The Financial Secretary keeps the
// records, so FIN and the NC manage; the Deputy and the Treasurer read.
export function canManageDonations(profile) {
  if (!profile) return false;
  return profile.role === "NC" || (profile.portfolios || []).includes("FIN");
}
export function canReadDonations(profile) {
  if (!profile) return false;
  const seats = profile.portfolios || [];
  return profile.role === "NC" || seats.includes("FIN") || seats.includes("DNC") || seats.includes("TREAS");
}

// Validate the donation form before it goes to the database.
export function validateDonation(form) {
  const name = (form.donor_name || "").trim();
  if (!name) return { ok: false, error: "Name the donor, or write Anonymous." };
  const parsed = parseNairaToKobo(form.amount || "");
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!form.received_on) return { ok: false, error: "Say when it was received." };
  if (form.received_on > todayLagos()) return { ok: false, error: "The date received cannot be in the future." };
  if (!form.method) return { ok: false, error: "Choose how it was given." };
  if (form.designation === "restricted" && !(form.restricted_to || "").trim()) {
    return { ok: false, error: "A restricted gift needs a note saying what it is restricted to." };
  }
  const ref = (form.reference || "").trim();
  if (/^\d{10}$/.test(ref)) return { ok: false, error: "That looks like a bank account number. Enter the transfer reference instead." };
  return {
    ok: true,
    values: {
      p_donor_name: name, p_amount_kobo: parsed.kobo, p_received_on: form.received_on, p_method: form.method,
      p_donor_id: form.donor_id || null, p_reference: ref || null,
      p_designation: form.designation || "general",
      p_restricted_to: (form.restricted_to || "").trim() || null,
      p_campaign: form.campaign || null,
      p_note: (form.note || "").trim() || null,
    },
  };
}

// How this year compares with last, as a signed percentage, for the
// overview. Null when there is nothing to compare against.
export function yearOnYear(thisYear, lastYear) {
  const a = Number(thisYear) || 0;
  const b = Number(lastYear) || 0;
  if (b <= 0) return null;
  return Math.round(((a - b) / b) * 100);
}
