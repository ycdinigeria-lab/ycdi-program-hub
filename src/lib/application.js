// Volunteer application logic. No React, no Supabase, nothing that needs
// a browser, so every rule below can be tested on its own.
//
// The rules come from YCDI-SAF-005 sections 3.1 and 3.2. Section numbers
// are quoted against each one so that when the policy changes, whoever is
// holding this file can find the paragraph that justified the code.
//
// BATCH7A-MARKER application-logic

// 3.1, the screening standard depends on whether the role puts somebody
// in front of children. Event volunteers with no child contact need one
// reference and an optional interview; everybody else needs two and a
// mandatory one.
export const ROLE_KINDS = [
  {
    key: "school_contact",
    label: "Serving with young people",
    blurb: "School visits, programmes, mentoring, anything involving contact with children or youth.",
    referees: 2,
    interview: "required",
  },
  {
    key: "event_only",
    label: "Helping at events only",
    blurb: "Set up, logistics, hospitality, media. No direct contact with children.",
    referees: 1,
    interview: "optional",
  },
];

export function roleKind(key) {
  return ROLE_KINDS.find((r) => r.key === key) || ROLE_KINDS[0];
}

export function refereesRequired(roleSought) {
  return roleKind(roleSought).referees;
}

export const STATUSES = [
  { key: "new", label: "New", tone: "pending", open: true },
  { key: "shortlisted", label: "Shortlisted", tone: "pending", open: true },
  { key: "interviewing", label: "Interviewing", tone: "pending", open: true },
  { key: "appointed", label: "Appointed", tone: "good", open: false },
  { key: "declined", label: "Declined", tone: "closed", open: false },
  { key: "withdrawn", label: "Withdrawn", tone: "closed", open: false },
];

export function statusLabel(key) {
  const s = STATUSES.find((x) => x.key === key);
  return s ? s.label : "Unknown";
}

export function isOpen(key) {
  const s = STATUSES.find((x) => x.key === key);
  return s ? s.open : false;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(value) {
  return EMAIL.test(String(value || "").trim());
}

// Age is checked because a volunteer application is not a children's
// form. There is no policy line setting a minimum, so this warns rather
// than blocks, and the coordinator decides.
export function ageOn(dob, on) {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob));
  if (!m) return null;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(birth.getTime())) return null;
  const today = on || new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const before =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (before) age -= 1;
  return age;
}

// What must be there before the form will submit.
//
// Deliberately shorter than the full list in 3.2. A form that refuses to
// move until every box is perfect gets abandoned, and an application with
// gaps in it is still an application the coordinator can chase. The lines
// that are genuinely non-negotiable are the ones the organisation cannot
// screen without, plus the consent, which is a legal matter rather than a
// convenience.
export function validate(form, opts) {
  const need = refereesRequired(form.role_sought);
  const errors = {};

  if (!String(form.full_name || "").trim()) {
    errors.full_name = "Please give your full legal name.";
  }
  if (!looksLikeEmail(form.email)) {
    errors.email = "Please give an email address we can reply to.";
  }
  if (!String(form.phone || "").trim()) {
    errors.phone = "Please give a phone number.";
  }
  if (!String(form.church_name || "").trim()) {
    errors.church_name = "Please tell us where you worship.";
  }

  if (!String(form.referee1_name || "").trim() || !String(form.referee1_contact || "").trim()) {
    errors.referee1_name = "Please give your first referee's name and how to reach them.";
  }
  if (need > 1) {
    if (!String(form.referee2_name || "").trim() || !String(form.referee2_contact || "").trim()) {
      errors.referee2_name = "This role needs two referees. Please give the second one.";
    }
  }

  // 3.2 again: at least one referee must be a pastor, elder or church
  // leader. Checked against however many referees the role actually
  // needs, so an event volunteer giving one church leader passes and one
  // giving a friend does not.
  const leaders =
    (form.referee1_is_church_leader ? 1 : 0) +
    (need > 1 && form.referee2_is_church_leader ? 1 : 0);
  if (leaders < 1) {
    errors.referee1_is_church_leader =
      "At least one referee must be a pastor, elder or church leader.";
  }

  if (!form.disclosure_made) {
    errors.disclosure_made = "Please answer the declaration question, either way.";
  } else if (form.has_disclosure && !String(form.disclosure_detail || "").trim()) {
    errors.disclosure_detail = "Please tell us briefly what you are disclosing.";
  }

  if (!form.consent_references) {
    errors.consent_references =
      "YCDI cannot proceed without your permission to contact your referees.";
  }

  const warnings = [];
  const age = ageOn(form.date_of_birth, opts && opts.today);
  if (age !== null && age < 16) {
    warnings.push("You are under 16. Someone will be in touch about what you can help with.");
  }

  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

// A disclosure is not a rejection. It is the thing that has to be looked
// at before anything else happens, which is a different statement, and
// the register should say so rather than quietly colouring the row red.
export function needsAttention(app) {
  if (!app) return null;
  if (app.has_disclosure) return "Disclosure made, review before proceeding";
  if (app.status === "new") return null;
  return null;
}

// Which of the six onboarding steps this application already satisfies
// when it turns into a volunteer record. Only the first: an application
// received is step one, and nothing else has happened yet.
export function toVolunteerRecord(app) {
  if (!app) return null;
  return {
    status: "onboarding",
    applied_on: String(app.submitted_at || "").slice(0, 10) || null,
    availability: null,
    skills: app.youth_experience || null,
  };
}

// Grouped for the coordinator's list: open ones first, because those are
// the ones with somebody waiting at the other end.
export function sortForReview(apps) {
  return (apps || []).slice().sort((a, b) => {
    const ao = isOpen(a.status) ? 0 : 1;
    const bo = isOpen(b.status) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return String(b.submitted_at || "").localeCompare(String(a.submitted_at || ""));
  });
}

// Which addresses open the public form.
//
// Kept as a pure function taking the path, rather than reading
// window.location inside App, so it can be tested and so the list of
// public addresses lives in one place instead of being a string buried in
// a component. A trailing slash is accepted because people type one, and
// the check is case-insensitive because phones capitalise things.
export const APPLY_PATHS = ["/apply", "/volunteer"];

export function isApplyPath(pathname) {
  const p = String(pathname || "").toLowerCase().replace(/\/+$/, "");
  return APPLY_PATHS.includes(p === "" ? "/" : p);
}
