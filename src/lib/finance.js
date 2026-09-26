// BATCH32-MARKER finance-lib
//
// The finance screen's arithmetic and wording, kept out of the component so
// it can be tested without drawing anything.
//
// Money is whole kobo everywhere it is stored or added up, exactly as in
// the database. Naira with a decimal point exists only in what a person
// types and what a person reads. Nothing here ever does sums on a
// fractional number of naira.

export const CATEGORIES = [
  ["transport", "Transport"],
  ["venue", "Venue"],
  ["materials", "Materials"],
  ["printing", "Printing"],
  ["refreshments", "Refreshments"],
  ["data_airtime", "Data and airtime"],
  ["honoraria_gifts", "Honoraria and gifts"],
  ["other", "Other"],
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);

// The words a person sees for each state of a claim, and how loudly.
export const STATUS_WORD = {
  draft: "Draft",
  submitted: "Waiting for a decision",
  returned: "Sent back",
  approved: "Approved, not yet paid",
  paid: "Paid",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

export const MAX_CLAIM_KOBO = 5000000000; // ₦50,000,000, the same ceiling the database holds

// ₦35,000 for a whole number of naira, ₦35,000.50 when there are kobo.
export function formatNaira(kobo) {
  if (kobo === null || kobo === undefined || Number.isNaN(Number(kobo))) return "₦0";
  const n = Math.trunc(Number(kobo));
  const neg = n < 0;
  const abs = Math.abs(n);
  const naira = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(naira).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + "₦" + grouped + (rest ? "." + String(rest).padStart(2, "0") : "");
}

// What somebody types into an amount box, turned into kobo. Accepts
// "35000", "35,000", "₦35,000.50", " 35 000 ". Refuses anything with more
// than two decimal places rather than rounding it, because a silent round
// is a wrong claim. Returns { ok: true, kobo } or { ok: false, error }.
export function parseNairaToKobo(input) {
  const raw = String(input === null || input === undefined ? "" : input)
    .replace(/[₦\s,]/g, "")
    .replace(/^NGN/i, "");
  if (raw === "") return { ok: false, error: "Enter the amount." };
  if (!/^\d+(\.\d+)?$/.test(raw)) return { ok: false, error: "Use numbers only, for example 35000 or 35000.50." };
  const [whole, frac = ""] = raw.split(".");
  if (frac.length > 2) return { ok: false, error: "An amount can have two decimal places at most." };
  if (whole.replace(/^0+/, "").length > 10) return { ok: false, error: "That amount is too large." };
  const kobo = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (kobo <= 0) return { ok: false, error: "The amount must be more than zero." };
  if (kobo > MAX_CLAIM_KOBO) return { ok: false, error: "A single claim cannot be over ₦50,000,000." };
  return { ok: true, kobo };
}

// Kobo back into the text an amount box would hold when editing.
export function koboToInput(kobo) {
  const n = Math.trunc(Number(kobo) || 0);
  const naira = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${naira}.${String(rest).padStart(2, "0")}` : String(naira);
}

// Today's date in Lagos as YYYY-MM-DD. The database counts its days in
// Lagos time, so the screen does too; the phone's own clock may be
// anywhere.
export function todayLagos(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function dayNumber(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// Whole days from `from` to `to`, both YYYY-MM-DD. Negative when `to` is earlier.
export function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

// The reimbursement clock as words and a level: "ok", "soon" (a week or
// less), "late". Only a claim waiting for a decision has a live clock.
export function dueInfo(claim, today = todayLagos()) {
  if (!claim || claim.status !== "submitted" || !claim.due_by) return null;
  const left = daysBetween(today, claim.due_by);
  if (left < 0) {
    const n = -left;
    return { level: "late", days: left, text: n === 1 ? "1 day overdue" : `${n} days overdue` };
  }
  if (left === 0) return { level: "soon", days: 0, text: "Due today" };
  return { level: left <= 7 ? "soon" : "ok", days: left, text: left === 1 ? "Due in 1 day" : `Due in ${left} days` };
}

// Whether the person can decide this claim, so the screen offers the
// buttons. The database is the real gate and repeats every one of these
// rules; this only stops a person being offered a button that will be
// refused. `finHolderId` is whoever holds the FIN seat, or null.
export function canDecide(profile, claim, finHolderId) {
  if (!profile || !claim) return false;
  if (claim.claimant_id === profile.id) return false; // nobody decides their own
  const holdsFin = (profile.portfolios || []).includes("FIN");
  if (holdsFin) return true;
  if (profile.role === "NC") return !finHolderId || finHolderId === claim.claimant_id;
  return false;
}

// The buttons a claim card offers this person, in the order they appear.
// Pure, so the rules can be tested; the database repeats every one.
//   the owner, while it is a draft or was sent back:  edit, submit, withdraw
//   the owner, while it waits for a decision:         withdraw
//   the person who decides, on a submitted claim:     approve, return, decline
//   the person who decides, on an approved claim:     markpaid
export function actionsFor(profile, claim, finHolderId) {
  if (!profile || !claim) return [];
  const acts = [];
  if (claim.claimant_id === profile.id) {
    if (claim.status === "draft" || claim.status === "returned") acts.push("edit", "submit", "withdraw");
    else if (claim.status === "submitted") acts.push("withdraw");
  }
  if (canDecide(profile, claim, finHolderId)) {
    if (claim.status === "submitted") acts.push("approve", "return", "decline");
    else if (claim.status === "approved") acts.push("markpaid");
  }
  return acts;
}

export const ACTION_LABEL = {
  edit: "Edit",
  submit: "Send for approval",
  withdraw: "Withdraw",
  approve: "Approve",
  return: "Send back",
  decline: "Decline",
  markpaid: "Mark as paid",
};

// The words for each line in a claim's history.
export const EVENT_WORD = {
  claim_submitted: "Sent for approval",
  claim_returned: "Sent back",
  claim_approved: "Approved",
  claim_rejected: "Not approved",
  claim_paid: "Marked as paid",
  claim_withdrawn: "Withdrawn",
  budget_set: "Budget set from the concept note",
  budget_revised: "Budget revised",
};

// May this person revise a programme budget? The FIN holder, or the
// National Coordinator while the seat is empty.
export function isOfficer(profile, finHolderId) {
  if (!profile) return false;
  if ((profile.portfolios || []).includes("FIN")) return true;
  return profile.role === "NC" && !finHolderId;
}

// Everyone who can read all of finance: NC, FIN or TREAS.
export function canReadAll(profile) {
  if (!profile) return false;
  const seats = profile.portfolios || [];
  return profile.role === "NC" || seats.includes("FIN") || seats.includes("TREAS");
}

// A Regional Coordinator reads their own chapter's claims and budgets.
export function isChapterReader(profile) {
  return !!profile && profile.role === "RC" && !!profile.chapter_id;
}

// ---------------------------------------------------------------- receipts

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const RECEIPT_LIMIT = 5;

// Returns an error sentence, or null when the file is fine to upload.
export function checkReceiptFile(file) {
  if (!file) return "Choose a file.";
  if (!RECEIPT_TYPES.includes(file.type)) return "A receipt must be a photo (JPG, PNG or WebP) or a PDF.";
  if (file.size > RECEIPT_MAX_BYTES) return "That file is over 5 MB. Take a smaller photo or reduce the file.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

// A file name safe to put in a storage path: no folders, no spaces, no
// surprises, and never so long it hits a limit.
export function safeFileName(name) {
  const base = String(name || "receipt").split(/[\\/]/).pop();
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "receipt";
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  return ext ? `${stem}.${ext}` : stem;
}

// The place a receipt lives: <claim id>/<random>-<clean name>. The claim id
// first is what the storage rules key on.
export function receiptPath(claimId, fileName, random) {
  return `${claimId}/${random}-${safeFileName(fileName)}`;
}

// Totals for a list of claim rows, in kobo.
export function totals(claims) {
  const t = { draft: 0, submitted: 0, returned: 0, approved: 0, paid: 0, rejected: 0, withdrawn: 0 };
  for (const c of claims || []) t[c.status] = (t[c.status] || 0) + Number(c.amount_kobo || 0);
  return t;
}
