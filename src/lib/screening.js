// Reference checks, interview records, and the annual renewal. No React,
// no Supabase, nothing that needs a browser, so every rule below can be
// tested on its own.
//
// The rules come from YCDI-SAF-005 sections 3.1, 3.3 and 3.5, and from
// YCDI-HR-004 section 6. Section numbers are quoted against each one so
// that when the policy changes, whoever is holding this file can find the
// paragraph that justified the code.
//
// BATCH7B-MARKER screening-logic
//
// One thing to be clear about. The database is the authority on whether
// somebody can be appointed, and it refuses on its own. Everything here
// that looks like the same rule exists so the screen can tell a
// coordinator what is outstanding before they press the button, rather
// than letting them press it and reading back an error. If the two ever
// disagree, the database wins and this file is the one with the bug.

// SAF-005 3.3, the six questions, in the order the policy sets them.
export const REFERENCE_QUESTIONS = [
  {
    key: "q1_known_how_long",
    number: 1,
    label: "How long have you known this person, and in what capacity?",
  },
  {
    key: "q2_christian_character",
    number: 2,
    label:
      "Would you describe this person as a committed, practising Christian of good moral character?",
  },
  {
    key: "q3_observed_with_youth",
    number: 3,
    label:
      "Have you observed this person in situations involving young people? How did they conduct themselves?",
  },
  {
    key: "q4_concerns_known",
    number: 4,
    label:
      "Are you aware of any concerns, complaints, allegations or disciplinary matters involving this person?",
  },
  {
    key: "q5_would_entrust_own",
    number: 5,
    label:
      "Would you personally entrust this person to work with your own children or young people?",
  },
  {
    key: "q6_anything_else",
    number: 6,
    label:
      "Is there anything else YCDI should know about this person before deploying them as a volunteer?",
  },
];

// 3.3 says references are taken by phone or email, and that a written
// reference the applicant submitted is not sufficient as a sole source.
// The third option exists so the record can say what actually happened.
// It is stored and it does not count.
export const REFERENCE_METHODS = [
  { key: "phone", label: "Spoke to them by phone", counts: true },
  { key: "email", label: "Corresponded by email", counts: true },
  {
    key: "written_from_applicant",
    label: "Letter the applicant brought in",
    counts: false,
    note: "Recorded, but does not count toward the references required. SAF-005 3.3.",
  },
];

export function methodCounts(key) {
  const m = REFERENCE_METHODS.find((x) => x.key === key);
  return m ? m.counts : false;
}

export function methodLabel(key) {
  const m = REFERENCE_METHODS.find((x) => x.key === key);
  return m ? m.label : "Not recorded";
}

// HR-004 section 6, the four categories every interview covers.
export const INTERVIEW_CATEGORIES = [
  {
    key: "motivation_faith",
    number: 1,
    label: "Motivation and faith",
    prompts: [
      "Why do you want to serve with YCDI?",
      "Describe your Christian faith journey.",
      "How does your faith shape your work?",
    ],
  },
  {
    key: "competency",
    number: 2,
    label: "Competency",
    prompts: [
      "Tell us about a time you led a team, managed a difficult situation, organised a large event, or handled a financial challenge.",
    ],
  },
  {
    key: "values",
    number: 3,
    label: "Values",
    prompts: [
      "How would you handle a situation where a young person disclosed abuse to you?",
      "What does integrity mean to you in a ministry context?",
    ],
  },
  {
    key: "role_specific",
    number: 4,
    label: "Role-specific",
    prompts: ["Questions tailored to the responsibilities of this particular role."],
  },
];

export const RECOMMENDATIONS = [
  { key: "appoint", label: "Appoint" },
  { key: "appoint_with_conditions", label: "Appoint with conditions" },
  { key: "further_interview", label: "See them again" },
  { key: "do_not_appoint", label: "Do not appoint" },
];

export function recommendationLabel(key) {
  const r = RECOMMENDATIONS.find((x) => x.key === key);
  return r ? r.label : "Not recorded";
}

// HR-004 section 6: panels comprise at least two persons. The database
// enforces this too. Names are trimmed and blanks dropped first, because
// three empty boxes is not a panel of three.
export const MIN_PANEL = 2;

export function cleanPanel(names) {
  if (!Array.isArray(names)) return [];
  return names.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean);
}

export function panelIsValid(names) {
  return cleanPanel(names).length >= MIN_PANEL;
}

// The same list the database builds in screening_gaps, so the screen can
// show it before anybody presses anything.
export function screeningGaps(app, references = [], interviews = []) {
  const gaps = [];
  const eventOnly = app && app.role_sought === "event_only";
  const counted = references.filter((r) => methodCounts(r.obtained_via));
  const church = counted.filter((r) => r.referee_is_church_leader);
  const unresolved = references.filter((r) => r.concern_raised && !r.followup_done);

  if (eventOnly) {
    if (counted.length < 1) {
      gaps.push("One reference is needed, taken by phone or email.");
    }
  } else {
    if (counted.length < 2) {
      gaps.push(
        `Two references are needed, taken by phone or email. ${counted.length} on file.`
      );
    }
    if (church.length < 1) {
      gaps.push("At least one reference must come from a pastor, elder or church leader.");
    }
    if (interviews.length < 1) {
      gaps.push("An interview record is needed for a role involving school or child contact.");
    }
  }

  if (unresolved.length > 0) {
    gaps.push(
      "A referee raised a concern that has not been followed up. SAF-005 3.3 requires the follow-up before the appointment proceeds."
    );
  }

  const latest = latestInterview(interviews);
  if (latest && latest.recommendation === "do_not_appoint") {
    gaps.push("The most recent interview panel recommended not appointing this person.");
  }

  return gaps;
}

// The newest interview is the one that speaks. Two panels and a changed
// mind is an ordinary thing, and the earlier record stays on file.
export function latestInterview(interviews = []) {
  if (!interviews.length) return null;
  return [...interviews].sort((a, b) => {
    const d = String(b.held_on || "").localeCompare(String(a.held_on || ""));
    if (d !== 0) return d;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  })[0];
}

export function readyToAppoint(app, references, interviews) {
  return screeningGaps(app, references, interviews).length === 0;
}

// SAF-005 3.5, renewal by 31 January.
export function renewalDeadline(year) {
  const y = Number(year);
  return `${y}-01-31`;
}

export function renewalState(record, today = new Date()) {
  if (!record) return "unknown";
  if (record.renewed_on) return "renewed";
  const deadline = new Date(`${record.deadline || renewalDeadline(today.getFullYear())}T23:59:59`);
  return today > deadline ? "overdue" : "due";
}

export const RENEWAL_LABELS = {
  renewed: "Renewed",
  due: "Due",
  overdue: "Overdue",
  unknown: "Unknown",
};

// How many days are left, negative once the deadline has gone. Used for
// the line that says "eleven days left" rather than printing a date and
// letting somebody do the arithmetic in their head in January.
export function daysToDeadline(deadline, today = new Date()) {
  if (!deadline) return null;
  const d = new Date(`${deadline}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / 86400000);
}

// Sorting the renewal list. Overdue first, then due, then the people who
// have already done it, and alphabetically inside each group. A list that
// opens on the people who need chasing saves somebody scrolling.
const RENEWAL_ORDER = { overdue: 0, due: 1, unknown: 2, renewed: 3 };

export function sortRenewals(rows = [], today = new Date()) {
  return [...rows].sort((a, b) => {
    const ra = RENEWAL_ORDER[renewalState(a, today)] ?? 9;
    const rb = RENEWAL_ORDER[renewalState(b, today)] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.full_name || "").localeCompare(String(b.full_name || ""));
  });
}

// A renewal confirms three things under 3.5, and lapsed training is the
// one that quietly fails. Surfaced rather than blocking, because refusing
// to record a declaration until training is logged would leave somebody
// unable to declare at all.
export function renewalWarnings(record) {
  const out = [];
  if (!record) return out;
  if (record.training_current === false) {
    out.push("Refresher training has lapsed. SAF-005 3.5 asks the renewal to confirm it was completed.");
  }
  return out;
}
