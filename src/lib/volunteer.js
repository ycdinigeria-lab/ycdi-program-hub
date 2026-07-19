// Volunteer record logic. No React, no Supabase, nothing that needs a
// browser, so every rule in here can be tested on its own.
//
// Everything below follows the YCDI Volunteer Handbook, YCDI-HR-003.
// Section numbers are quoted against each rule so that when the policy
// changes, whoever is holding this file can find the paragraph that
// justified the code.
//
// BATCH6A-MARKER volunteer-logic

// Section 2.1, the six steps to becoming a YCDI volunteer, in the order
// the Handbook lists them. Order matters: the screen walks this list to
// work out where somebody has got stuck.
export const ONBOARDING_STEPS = [
  { key: "applied_on", label: "Application", blurb: "Volunteer Application Form received" },
  { key: "interviewed_on", label: "Interview", blurb: "Conversation with the Regional Coordinator or an NEC member" },
  { key: "references_received_on", label: "References", blurb: "Two Christian character references, not family" },
  { key: "safeguarding_declaration_on", label: "Safeguarding declaration", blurb: "Child Protection Declaration signed" },
  { key: "orientation_on", label: "Orientation", blurb: "YCDI Volunteer Orientation attended" },
  { key: "activated_on", label: "Activation", blurb: "Assigned to a chapter role and entered on the register" },
];

// Section 6, plus 'onboarding' for somebody part-way through the six
// steps above and not yet serving.
export const STATUSES = [
  { key: "onboarding", label: "Onboarding", tone: "pending" },
  { key: "active", label: "Active", tone: "good" },
  { key: "inactive", label: "Inactive", tone: "warn" },
  { key: "withdrawn", label: "Withdrawn", tone: "closed" },
  { key: "suspended", label: "Suspended", tone: "bad" },
  { key: "removed", label: "Removed", tone: "bad" },
];

export function statusLabel(key) {
  const s = STATUSES.find((x) => x.key === key);
  return s ? s.label : "Unknown";
}

export function statusTone(key) {
  const s = STATUSES.find((x) => x.key === key);
  return s ? s.tone : "closed";
}

// Dates arrive from Postgres as 'YYYY-MM-DD' strings. Parsing them with
// `new Date(str)` would read them as UTC midnight and then shift them
// backwards a day for anyone west of Greenwich, which is a real bug in
// other people's code and not one worth inheriting. Built by parts
// instead, so a date is the day it says it is.
export function parseDay(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function daysBetween(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

// Whole months of service, counting from the start date to the end date
// or to today if service is still running. Whole months, because the
// Handbook talks about twelve months completed, and eleven months and
// twenty-nine days is not twelve months.
export function serviceMonths(record, today = new Date()) {
  if (!record) return null;
  const start = parseDay(record.started_on);
  if (!start) return null;
  const end = parseDay(record.ended_on) || parseDay(today) || today;
  if (end < start) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

// Section 5.2: a Certificate of Service for volunteers completing twelve
// months or more of active service.
//
// Somebody who withdrew after two years still completed two years, so
// withdrawal does not disqualify them. Removal and suspension do, since
// both are disciplinary under section 6.2, and handing a certificate to
// someone removed for a safeguarding breach would be its own scandal.
export function certificateDue(record, today = new Date()) {
  if (!record) return false;
  if (record.certificate_issued_on) return false;
  if (record.status === "removed" || record.status === "suspended") return false;
  const months = serviceMonths(record, today);
  return months !== null && months >= 12;
}

// Where somebody has got to in the six steps.
//
// `done` counts steps that carry a date, which is not always the same as
// how far down the list they are: a coordinator can record orientation
// before the references land. `next` is the first step still missing,
// which is the one to chase.
export function onboardingProgress(record) {
  const steps = ONBOARDING_STEPS.map((s) => ({
    ...s,
    date: record ? record[s.key] || null : null,
  }));
  const done = steps.filter((s) => s.date).length;
  const next = steps.find((s) => !s.date) || null;
  return {
    steps,
    done,
    total: ONBOARDING_STEPS.length,
    complete: done === ONBOARDING_STEPS.length,
    next,
    // True when dates exist further down the list than the first gap.
    // Not an error, just worth showing, because it usually means a step
    // happened and nobody wrote it down.
    outOfOrder: next ? steps.some((s, i) => s.date && i > steps.indexOf(next)) : false,
  };
}

// Somebody who started the six steps and then stopped moving. The clock
// runs from the most recent step they did complete, not from today, so a
// person who applied last week is not flagged and a person who applied in
// March and got no further is.
export function onboardingStalled(record, today = new Date(), afterDays = 30) {
  if (!record) return false;
  if (record.status !== "onboarding") return false;
  const progress = onboardingProgress(record);
  if (progress.complete) return false;
  const dates = progress.steps.map((s) => parseDay(s.date)).filter(Boolean);
  if (!dates.length) return false;
  const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
  const gap = daysBetween(latest, today);
  return gap !== null && gap > afterDays;
}

// Section 5.4: Regional Coordinators keep regular pastoral contact.
// The Handbook does not put a number on "regular", so this takes one as
// an argument rather than pretending the policy said ninety days.
export function contactOverdue(record, today = new Date(), afterDays = 90) {
  if (!record) return false;
  if (record.status !== "active") return false;
  const last = parseDay(record.last_contact_on);
  if (!last) return true;
  const gap = daysBetween(last, today);
  return gap !== null && gap > afterDays;
}

// A plain sentence about where somebody stands, for the top of their own
// profile screen. Written to be read by the volunteer themselves, so it
// avoids anything that sounds like a file being kept on them.
export function describeRecord(record, today = new Date()) {
  if (!record) return "You do not have a volunteer record yet.";
  if (record.status === "onboarding") {
    const p = onboardingProgress(record);
    if (p.complete) return "Your onboarding steps are all recorded. Your coordinator activates you from here.";
    return `Onboarding, ${p.done} of ${p.total} steps recorded. Next: ${p.next.label.toLowerCase()}.`;
  }
  const months = serviceMonths(record, today);
  if (record.status === "active") {
    if (months === null) return "Active volunteer.";
    if (months < 1) return "Active volunteer, started this month.";
    if (months === 1) return "Active volunteer, one month of service.";
    if (months < 12) return `Active volunteer, ${months} months of service.`;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    const yearPart = years === 1 ? "one year" : `${years} years`;
    return rest ? `Active volunteer, ${yearPart} and ${rest} months of service.` : `Active volunteer, ${yearPart} of service.`;
  }
  if (record.status === "inactive") return "Your record is marked inactive. Speak to your coordinator if that is wrong.";
  if (record.status === "withdrawn") return "Your service is recorded as ended. Thank you.";
  return `Status: ${statusLabel(record.status).toLowerCase()}.`;
}

// Used by the screen to show the six steps as a list without every
// component having to remember the date formatting rules.
export function formatDay(value) {
  const d = parseDay(value);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
