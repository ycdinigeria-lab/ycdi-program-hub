import { describe, it, expect } from "vitest";
import {
  ROLE_KINDS, roleKind, refereesRequired,
  STATUSES, statusLabel, isOpen,
  looksLikeEmail, ageOn, validate, sortForReview,
  toVolunteerRecord, isApplyPath, APPLY_PATHS,
} from "../src/lib/application.js";

// BATCH7A-MARKER application-tests

// A form that would pass, used as the starting point so each test can
// break exactly one thing and nothing else.
function good(extra) {
  return {
    role_sought: "school_contact",
    full_name: "Grace Adeyemi",
    email: "grace@example.com",
    phone: "08030000000",
    church_name: "Living Faith, Benin",
    referee1_name: "Pastor Sam Obi",
    referee1_contact: "08031111111",
    referee1_is_church_leader: true,
    referee2_name: "Ada Nwosu",
    referee2_contact: "ada@example.com",
    referee2_is_church_leader: false,
    disclosure_made: true,
    has_disclosure: false,
    consent_references: true,
    ...(extra || {}),
  };
}

describe("the two screening standards, SAF-005 3.1", () => {
  it("a role with child contact needs two referees and a required interview", () => {
    const r = roleKind("school_contact");
    expect(r.referees).toBe(2);
    expect(r.interview).toBe("required");
  });

  it("an events-only role needs one referee and the interview is optional", () => {
    const r = roleKind("event_only");
    expect(r.referees).toBe(1);
    expect(r.interview).toBe("optional");
  });

  it("an unknown role falls back to the stricter standard, not the looser one", () => {
    expect(refereesRequired("something_made_up")).toBe(2);
    expect(refereesRequired(undefined)).toBe(2);
  });

  it("only offers the two kinds the policy defines", () => {
    expect(ROLE_KINDS.map((r) => r.key)).toEqual(["school_contact", "event_only"]);
  });
});

describe("a complete form passes", () => {
  it("with no errors at all", () => {
    const r = validate(good());
    expect(r.ok).toBe(true);
    expect(Object.keys(r.errors)).toEqual([]);
  });

  it("and an events-only form passes with a single church-leader referee", () => {
    const r = validate(good({
      role_sought: "event_only",
      referee2_name: "", referee2_contact: "", referee2_is_church_leader: false,
    }));
    expect(r.ok).toBe(true);
  });
});

describe("what the form refuses to send", () => {
  it("no name", () => {
    expect(validate(good({ full_name: "   " })).errors.full_name).toBeTruthy();
  });

  it("a rubbish email", () => {
    expect(validate(good({ email: "grace at example" })).errors.email).toBeTruthy();
    expect(validate(good({ email: "" })).errors.email).toBeTruthy();
  });

  it("no phone number", () => {
    expect(validate(good({ phone: "" })).errors.phone).toBeTruthy();
  });

  it("no church", () => {
    expect(validate(good({ church_name: "" })).errors.church_name).toBeTruthy();
  });

  it("a second referee missing on a role that needs two", () => {
    const r = validate(good({ referee2_name: "", referee2_contact: "" }));
    expect(r.ok).toBe(false);
    expect(r.errors.referee2_name).toBeTruthy();
  });

  it("a referee with a name but no way to contact them", () => {
    expect(validate(good({ referee1_contact: "" })).errors.referee1_name).toBeTruthy();
  });

  it("no church leader among the referees", () => {
    const r = validate(good({ referee1_is_church_leader: false, referee2_is_church_leader: false }));
    expect(r.errors.referee1_is_church_leader).toBeTruthy();
  });

  it("the declaration left unanswered", () => {
    expect(validate(good({ disclosure_made: false })).errors.disclosure_made).toBeTruthy();
  });

  it("a yes on the declaration with nothing written", () => {
    const r = validate(good({ has_disclosure: true, disclosure_detail: "  " }));
    expect(r.errors.disclosure_detail).toBeTruthy();
  });

  it("consent withheld, which is the one nothing can proceed without", () => {
    expect(validate(good({ consent_references: false })).errors.consent_references).toBeTruthy();
  });
});

describe("the church-leader rule counts only the referees the role needs", () => {
  // The trap here is counting a second referee's tick on a role that only
  // asks for one. Somebody applying for events-only whose single referee
  // is a friend would sail through if the second box were still counted.
  it("an events-only applicant whose only referee is not a church leader is refused", () => {
    const r = validate(good({
      role_sought: "event_only",
      referee1_is_church_leader: false,
      referee2_name: "Pastor Sam", referee2_contact: "x@y.com", referee2_is_church_leader: true,
    }));
    expect(r.errors.referee1_is_church_leader).toBeTruthy();
  });

  it("but a two-referee applicant is fine when the second one is the church leader", () => {
    const r = validate(good({
      referee1_is_church_leader: false,
      referee2_is_church_leader: true,
    }));
    expect(r.ok).toBe(true);
  });
});

describe("a disclosure does not fail the form", () => {
  it("a yes with detail written passes, because telling us is the point", () => {
    const r = validate(good({ has_disclosure: true, disclosure_detail: "A caution in 2014." }));
    expect(r.ok).toBe(true);
  });
});

describe("email shapes", () => {
  it("accepts ordinary addresses", () => {
    expect(looksLikeEmail("a.b@ycdinigeria.org")).toBe(true);
    expect(looksLikeEmail("  grace@example.com  ")).toBe(true);
  });

  it("rejects the usual mistakes", () => {
    for (const bad of ["", "grace", "grace@", "@example.com", "grace@example", "a b@c.com"]) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });
});

describe("age", () => {
  const on = new Date(2026, 6, 20); // 20 July 2026

  it("counts whole years", () => {
    expect(ageOn("2000-07-20", on)).toBe(26);
    expect(ageOn("2000-07-21", on)).toBe(25);
  });

  it("handles a birthday later in the year", () => {
    expect(ageOn("2000-12-01", on)).toBe(25);
  });

  it("gives nothing back rather than a wrong number", () => {
    expect(ageOn("", on)).toBeNull();
    expect(ageOn("not a date", on)).toBeNull();
    expect(ageOn(null, on)).toBeNull();
  });

  it("warns about an applicant under 16 without blocking them", () => {
    const r = validate(good({ date_of_birth: "2012-01-01" }), { today: on });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toContain("under 16");
  });

  it("and says nothing about an adult", () => {
    expect(validate(good({ date_of_birth: "1990-01-01" }), { today: on }).warnings).toEqual([]);
  });
});

describe("statuses", () => {
  it("knows which ones still have somebody waiting", () => {
    expect(isOpen("new")).toBe(true);
    expect(isOpen("shortlisted")).toBe(true);
    expect(isOpen("interviewing")).toBe(true);
    expect(isOpen("appointed")).toBe(false);
    expect(isOpen("declined")).toBe(false);
    expect(isOpen("withdrawn")).toBe(false);
  });

  it("does not treat an unknown status as open, which would put it in the queue forever", () => {
    expect(isOpen("gibberish")).toBe(false);
    expect(statusLabel("gibberish")).toBe("Unknown");
  });

  it("matches the six the database allows", () => {
    expect(STATUSES.map((s) => s.key).sort()).toEqual(
      ["appointed", "declined", "interviewing", "new", "shortlisted", "withdrawn"]
    );
  });
});

describe("the review order", () => {
  const rows = [
    { id: "a", status: "declined", submitted_at: "2026-07-19T10:00:00Z" },
    { id: "b", status: "new", submitted_at: "2026-07-01T10:00:00Z" },
    { id: "c", status: "interviewing", submitted_at: "2026-07-18T10:00:00Z" },
  ];

  it("puts everything still open first, even when it is older", () => {
    expect(sortForReview(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("does not modify what it was given", () => {
    const copy = rows.slice();
    sortForReview(rows);
    expect(rows).toEqual(copy);
  });

  it("copes with nothing", () => {
    expect(sortForReview(null)).toEqual([]);
  });
});

describe("turning an application into a volunteer record", () => {
  it("fills in step one only, because nothing else has happened yet", () => {
    const r = toVolunteerRecord({ submitted_at: "2026-07-20T09:30:00Z", youth_experience: "Sunday school" });
    expect(r.status).toBe("onboarding");
    expect(r.applied_on).toBe("2026-07-20");
    expect(r.skills).toBe("Sunday school");
  });

  it("does not claim an interview or a reference happened", () => {
    const r = toVolunteerRecord({ submitted_at: "2026-07-20T09:30:00Z" });
    expect(r.interviewed_on).toBeUndefined();
    expect(r.references_received_on).toBeUndefined();
  });
});

describe("which addresses open the public form", () => {
  it("the two that are meant to", () => {
    expect(isApplyPath("/apply")).toBe(true);
    expect(isApplyPath("/volunteer")).toBe(true);
    expect(APPLY_PATHS).toContain("/apply");
  });

  it("with a trailing slash or odd capitals, because people type those", () => {
    expect(isApplyPath("/apply/")).toBe(true);
    expect(isApplyPath("/Apply")).toBe(true);
    expect(isApplyPath("/APPLY/")).toBe(true);
  });

  // This is the one that matters. Anything sloppier here would open the
  // whole app to a stranger by accident.
  it("and nothing else at all", () => {
    for (const p of ["/", "", "/applying", "/apply-now", "/x/apply", "/admin", null, undefined]) {
      expect(isApplyPath(p)).toBe(false);
    }
  });
});
